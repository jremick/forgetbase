#!/usr/bin/env bash
set -euo pipefail

API_URL="${FORGETBASE_API_URL:-http://127.0.0.1:3000}"
: "${FORGETBASE_PROOF_TENANT_ID:?Set the tenant ID of the disposable synthetic proof installation}"
: "${FORGETBASE_API_KEY:?Set FORGETBASE_API_KEY to a user admin key for the isolated proof installation}"

API_URL="$API_URL" npx -y pnpm@11.7.0 --filter @forgetbase/api exec node --input-type=module <<'NODE'
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const apiUrl = process.env.API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
const unique = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const tenantId = process.env.FORGETBASE_PROOF_TENANT_ID;
const adminKey = process.env.FORGETBASE_API_KEY;
const oidcEmail = `oidc-${unique}@example.test`;
const clientId = "forgetbase-oidc-verify";
const redirectUri = "http://127.0.0.1:5175/";
const keyId = `oidc-verify-${unique}`;
let currentNonce = "";
let issuer = "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { method = "GET", apiKey, body } = {}) {
  const headers = { accept: "application/json" };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request ${method} ${path} failed with ${response.status}: ${text}`);
  }

  return parsed;
}

const { publicKey, privateKey } = await generateKeyPair("RS256");
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = keyId;
publicJwk.alg = "RS256";
publicJwk.use = "sig";

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", issuer || "http://127.0.0.1");

  if (url.pathname === "/.well-known/openid-configuration") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`
    }));
    return;
  }

  if (url.pathname === "/jwks") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [publicJwk] }));
    return;
  }

  if (url.pathname === "/token" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    const form = new URLSearchParams(body);
    assert(form.get("grant_type") === "authorization_code", "Unexpected OIDC grant type");
    assert(form.get("client_id") === clientId, "Unexpected OIDC client_id");
    assert(form.get("redirect_uri") === redirectUri, "Unexpected OIDC redirect_uri");
    assert(Boolean(form.get("code_verifier")), "Missing OIDC code_verifier");

    const idToken = await new SignJWT({
      sub: `subject-${unique}`,
      email: oidcEmail,
      name: "OIDC Verify User",
      role: "reader",
      email_verified: true,
      groups: [`engineering-readers-${unique}`, `ops-reviewers-${unique}`],
      nonce: currentNonce
    })
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setIssuer(issuer)
      .setAudience(clientId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      token_type: "Bearer",
      expires_in: 300,
      id_token: idToken
    }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
const issuerHost = process.env.FORGETBASE_FAKE_OIDC_ISSUER_HOST ?? "host.docker.internal";
issuer = `http://${issuerHost}:${server.address().port}`;

const fixture = {
  enabled: true,
  displayName: "OIDC Verify Provider",
  issuerUrl: issuer,
  clientId,
  redirectUri,
  groupClaim: "groups",
  roleClaim: "role",
  autoProvisionUsers: true,
  accountLinkingMode: "verified-email",
  groupSyncEnabled: true,
  allowedDomains: ["example.test"],
  metadata: { verification: "oidc-login", runId: unique }
};
async function readProvider() {
  const list = await request("/admin/auth-providers", { apiKey: adminKey });
  return list.authProviders.find((config) => config.provider === "oidc");
}
async function writeProvider(body) {
  return request("/admin/auth-providers/oidc", { method: "PUT", apiKey: adminKey, body });
}
let fixtureAttempted = false;
let loginKeyId;
let report;
try {
  const admin = await request("/auth/me", { apiKey: adminKey });
  assert(admin.userId && admin.tenantId === tenantId && admin.role === "admin", "Admin key must belong to the disposable proof tenant");
  const existing = await readProvider();
  assert(!existing || (!existing.enabled && existing.clientId === clientId && existing.metadata.verification === "oidc-login"),
    "Use a disposable tenant without a configured OIDC provider");
  fixtureAttempted = true;
  await writeProvider(fixture);

  const authorize = await request("/auth/oidc/authorize", {
    method: "POST",
    body: {
      tenantId,
      provider: "oidc",
      redirectUri
    }
  });
  currentNonce = authorize.nonce;
  assert(authorize.authorizationUrl.includes("code_challenge_method=S256"), "Authorization URL did not include PKCE S256");

  const login = await request("/auth/oidc/callback", {
    method: "POST",
    body: {
      tenantId,
      provider: "oidc",
      code: "fixture-code",
      state: authorize.state,
      nonce: authorize.nonce,
      codeVerifier: authorize.codeVerifier,
      redirectUri,
      keyName: "oidc-verify-login"
    }
  });
  loginKeyId = login.apiKey.id;
  assert(login.user.email === oidcEmail, "OIDC login returned unexpected user email");
  assert(login.user.authProvider === "oidc", "OIDC user authProvider was not oidc");
  assert(login.user.externalProvider === "oidc", "OIDC user externalProvider was not oidc");
  assert(login.user.externalIssuer === issuer, "OIDC user externalIssuer was not captured");
  assert(login.user.externalSubject === `subject-${unique}`, "OIDC user externalSubject was not captured");
  assert(login.secret, "OIDC callback did not return a one-time API key");

  const principal = await request("/auth/me", {
    apiKey: login.secret
  });
  assert(principal.email === oidcEmail, "OIDC login key did not authenticate as expected user");
  assert(Array.isArray(principal.groupIds) && principal.groupIds.length === 2, "OIDC login principal did not include synced groups");

  const groups = await request("/auth/groups", {
    apiKey: adminKey
  });
  const syncedExternalIds = groups.groups
    .filter((group) => group.externalProvider === "oidc" && principal.groupIds.includes(group.id))
    .map((group) => group.externalId)
    .sort();
  assert(
    JSON.stringify(syncedExternalIds) === JSON.stringify([`engineering-readers-${unique}`, `ops-reviewers-${unique}`].sort()),
    "OIDC group sync did not create expected external groups"
  );
  assert(
    principal.groupIds.every((groupId) => groups.groups.some((group) => group.id === groupId)),
    "OIDC login principal referenced an unknown synced group"
  );

  report = {
    ok: true,
    apiUrl,
    tenantId,
    provider: "oidc",
    issuer,
    userEmail: oidcEmail,
    principalRole: principal.role,
    syncedGroupCount: principal.groupIds.length
  };
} finally {
  try {
    if (fixtureAttempted && (await readProvider())?.metadata.runId === unique) {
      await writeProvider({ ...fixture, enabled: false, autoProvisionUsers: false, groupSyncEnabled: false });
    }
  } finally {
    try {
      if (loginKeyId) await request(`/auth/api-keys/${encodeURIComponent(loginKeyId)}/revoke`, { method: "POST", apiKey: adminKey });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}
console.log(JSON.stringify(report, null, 2));
NODE
