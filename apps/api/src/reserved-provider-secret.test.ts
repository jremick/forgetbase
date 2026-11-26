import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  InMemoryAuthRepository,
  InMemoryAuthProviderConfigRepository,
  InMemoryManagedQueryFeedbackRepository,
  InMemoryModelProviderConfigRepository,
  InMemoryRegistryRepository,
  InMemoryRetrievalRepository,
  InMemorySecretReferencePolicyRepository
} from "@forgetbase/db";
import { buildServer } from "./server.js";
import { createOutboundHttpClient } from "./outbound-http.js";
import type { DeploymentProviderSecretBinding } from "./provider-secret-bindings.js";

const TEST_BOOTSTRAP_TOKEN = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdef";

const servers: ReturnType<typeof buildServer>[] = [];
const directories: string[] = [];
const syntheticSecret = "synthetic-host-token-for-provider-binding-tests";
const safeModelReference = "SYNTHETIC_MODEL_API_KEY";
const safeOidcReference = "SYNTHETIC_OIDC_CLIENT_SECRET";
const references = [
  "DATABASE_URL",
  "DATABASE_URL_FILE",
  "FORGETBASE_OIDC_STATE_SECRET",
  "FORGETBASE_OIDC_STATE_SECRET_FILE",
  "FORGETBASE_LOCAL_SYNC_SIGNING_PRIVATE_KEY_FILE",
  "PGPASSWORD",
  "KUBECONFIG",
  "AWS_SECRET_ACCESS_KEY",
  "APP_SESSION_SECRET",
  "TENANT_SELECTED_SECRET"
];
const runtimeReferences = references.flatMap((envVar) => [
  { label: `${envVar} direct`, envVar, mode: "direct" as const },
  { label: `${envVar} file fallback`, envVar, mode: "file-fallback" as const }
]);
const providerSecretBindings = [
  { envVar: safeModelReference, provider: "openai", origin: "https://model.example.test" },
  { envVar: safeOidcReference, provider: "oidc", origin: "https://idp.example.test" }
] as const;
const outbound: Array<{ url: string; authorization: string | null; body: string }> = [];
let discoveredTokenEndpoint = "https://idp.example.test/token";

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  outbound.length = 0;
  discoveredTokenEndpoint = "https://idp.example.test/token";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture(permissive: boolean, bindings: readonly DeploymentProviderSecretBinding[] = providerSecretBindings) {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://idp.example.test/.well-known/openid-configuration") {
      return Response.json({
        issuer: "https://idp.example.test",
        authorization_endpoint: "https://idp.example.test/authorize",
        token_endpoint: discoveredTokenEndpoint,
        jwks_uri: "https://idp.example.test/jwks"
      });
    }
    outbound.push({
      url,
      authorization: new Headers(init?.headers).get("authorization"),
      body: String(init?.body ?? "")
    });
    if (url === "https://model.example.test/responses") {
      return Response.json({ output_text: "Synthetic governed secret guidance [playbook.reserved-secret]" });
    }
    if (url === "https://idp.example.test/token") {
      return Response.json({ error: "synthetic_stop_after_exchange" }, { status: 400 });
    }
    throw new Error("Unexpected synthetic HTTP destination");
  }));
  const auth = new InMemoryAuthRepository();
  const models = new InMemoryModelProviderConfigRepository();
  const oidc = new InMemoryAuthProviderConfigRepository();
  const policies = new InMemorySecretReferencePolicyRepository();
  const server = buildServer({
    logger: false,
    authRepository: auth,
    providerConfigRepository: models,
    authProviderConfigRepository: oidc,
    secretReferencePolicyRepository: policies,
    providerSecretBindings: bindings,
    bootstrapToken: TEST_BOOTSTRAP_TOKEN,
    registryRepository: new InMemoryRegistryRepository(),
    retrievalRepository: new InMemoryRetrievalRepository(),
    feedbackRepository: new InMemoryManagedQueryFeedbackRepository(),
    oidcStateSecret: "synthetic-reserved-reference-state-signing-key",
    outboundHttpClient: createOutboundHttpClient({
      includeDefaultAllowedOrigins: false,
      allowedOrigins: ["https://model.example.test", "https://idp.example.test", "https://tokens.example.test"],
      resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }],
      transport: async (destination, init) => fetch(destination.url, {
        method: init.method,
        headers: init.headers,
        body: init.body instanceof Uint8Array ? new Uint8Array(init.body) : init.body,
        redirect: "error",
        signal: AbortSignal.timeout(init.timeoutMs)
      })
    })
  });
  servers.push(server);
  const bootstrap = await server.inject({
    method: "POST",
    url: "/auth/bootstrap",
    payload: { bootstrapToken: TEST_BOOTSTRAP_TOKEN, email: "admin@example.test", displayName: "Synthetic Admin" }
  });
  expect(bootstrap.statusCode).toBe(201);
  const headers = { authorization: `Bearer ${bootstrap.json().secret}` };
  if (permissive) {
    const policy = await server.inject({
      method: "PUT",
      url: "/admin/secret-reference-policy",
      headers,
      payload: {
        allowedEnvVarPrefixes: ["FORGETBASE_", "SYNTHETIC_", "AWS_", "APP_"],
        allowedEnvVars: references,
        allowUnlistedEnvVars: false
      }
    });
    expect(policy.statusCode).toBe(200);
  }
  return { server, auth, models, oidc, headers };
}

async function exposeSyntheticSecret(envVar: string, mode: "direct" | "file-fallback"): Promise<void> {
  vi.stubEnv(envVar, undefined);
  vi.stubEnv(`${envVar}_FILE`, undefined);

  if (mode === "direct") {
    vi.stubEnv(envVar, syntheticSecret);
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "forgetbase-reserved-secret-"));
  directories.push(directory);
  const path = join(directory, "synthetic-host-token");
  await writeFile(path, `${syntheticSecret}\n`, { mode: 0o600 });
  vi.stubEnv(`${envVar}_FILE`, path);
}

describe("deployment-owned provider secret admission", () => {
  it("admits a split-origin OIDC client and sends its secret only to the configured token origin", async () => {
    const issuer = "https://idp.example.test";
    const tokenOrigin = "https://tokens.example.test";
    const { server, headers, oidc } = await fixture(true, [
      { envVar: safeOidcReference, provider: "oidc", origin: tokenOrigin, issuerOrigin: issuer }
    ]);
    const config = {
      issuerUrl: issuer, clientId: "synthetic-client", clientSecretEnvVar: safeOidcReference,
      redirectUri: "https://app.example.test/callback", enabled: true, autoProvisionUsers: true
    };
    const put = (issuerUrl: string) => server.inject({
      method: "PUT", url: "/admin/auth-providers/oidc", headers, payload: { ...config, issuerUrl }
    });
    expect((await put(tokenOrigin)).statusCode).toBe(400);
    expect((await put(issuer)).statusCode).toBe(200);
    const secret = "synthetic-split-client-secret";
    vi.stubEnv(safeOidcReference, secret);
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const jwk = { ...await exportJWK(publicKey), kid: "split-client-key", alg: "RS256" };
    let discoveryIssuer = issuer;
    let nonce = "";
    let tokenCalls = 0;
    vi.stubGlobal("fetch", async (url: URL, init?: RequestInit) => {
      if (url.href === `${discoveryIssuer}/.well-known/openid-configuration`) {
        return Response.json({
          issuer: discoveryIssuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${tokenOrigin}/token`,
          jwks_uri: `${issuer}/keys`
        });
      }
      if (url.href === `${issuer}/keys`) return Response.json({ keys: [jwk] });
      if (url.href !== `${tokenOrigin}/token`) throw new Error("Unexpected OIDC URL");
      expect(new URLSearchParams(String(init?.body)).get("client_secret")).toBe(secret);
      tokenCalls++;
      const token = await new SignJWT({ sub: "split-client", email: "reader@example.test", email_verified: true, nonce })
        .setProtectedHeader({ alg: "RS256", kid: jwk.kid }).setIssuer(issuer).setAudience(config.clientId)
        .setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: token });
    });
    const login = async () => {
      const authorize = await server.inject({
        method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" }
      });
      expect(authorize.statusCode).toBe(200);
      const flow = authorize.json();
      nonce = flow.nonce;
      return server.inject({
        method: "POST", url: "/auth/oidc/callback", payload: {
          provider: "oidc", code: "synthetic-code", state: flow.state, nonce, codeVerifier: flow.codeVerifier
        }
      });
    };
    expect((await login()).statusCode).toBe(201);
    expect(tokenCalls).toBe(1);

    discoveryIssuer = tokenOrigin;
    await oidc.upsertAuthProviderConfig({ ...config, provider: "oidc", issuerUrl: discoveryIssuer });
    const stale = await login();
    expect(stale.statusCode).toBe(503);
    expect(stale.json().error).toBe("oidc_client_secret_reference_rejected");
    expect(tokenCalls).toBe(1);
  });

  it("rejects the tenant allow-unlisted escape hatch", async () => {
    const { server, headers } = await fixture(false);
    const response = await server.inject({
      method: "PUT",
      url: "/admin/secret-reference-policy",
      headers,
      payload: { allowUnlistedEnvVars: true }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_error");
  });

  it.each([false, true])("denies host and unbound references with permissive policy=%s", async (permissive) => {
    const { server, models, oidc, headers } = await fixture(permissive);
    const safeModel = await models.upsertProviderConfig({
      provider: "openai",
      enabled: true,
      apiKeyEnvVar: safeModelReference
    });
    const safeAuth = await oidc.upsertAuthProviderConfig({
      provider: "oidc",
      issuerUrl: "https://idp.example.test",
      clientId: "synthetic",
      clientSecretEnvVar: safeOidcReference
    });

    for (const reference of references) {
      for (const [url, payload] of [
        [
          "/admin/model-providers/openai",
          { enabled: true, baseUrl: "https://attacker.example.test", apiKeyEnvVar: reference }
        ],
        [
          "/admin/auth-providers/oidc",
          {
            enabled: true,
            issuerUrl: "https://attacker.example.test",
            clientId: "synthetic",
            clientSecretEnvVar: reference
          }
        ]
      ] as const) {
        const response = await server.inject({ method: "PUT", url, headers, payload });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ error: "secret_reference_rejected" });
      }
    }

    expect(await models.listProviderConfigs()).toEqual([safeModel]);
    expect(await oidc.listAuthProviderConfigs()).toEqual([safeAuth]);
    expect(outbound).toEqual([]);
  });
});

describe("stored provider reference runtime revalidation", () => {
  it("rechecks current tenant narrowing for an already stored provider config", async () => {
    const { server, models, headers } = await fixture(true);
    vi.stubEnv(safeModelReference, "synthetic-allowed-model-secret");
    await models.upsertProviderConfig({
      provider: "openai",
      enabled: true,
      apiKeyEnvVar: safeModelReference,
      baseUrl: "https://model.example.test",
      defaultModel: "synthetic-model"
    });
    const ready = await server.inject({ method: "GET", url: "/admin/model-providers/health", headers });
    expect(ready.json().providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "openai", status: "ready", apiKeyConfigured: true })
    ]));

    const narrowed = await server.inject({
      method: "PUT",
      url: "/admin/secret-reference-policy",
      headers,
      payload: { allowedEnvVarPrefixes: [], allowedEnvVars: [], allowUnlistedEnvVars: false }
    });
    expect(narrowed.statusCode).toBe(200);
    const blocked = await server.inject({ method: "GET", url: "/admin/model-providers/health", headers });
    expect(blocked.json().providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "openai",
        status: "not-ready",
        apiKeyConfigured: false,
        reasons: ["api_key_secret_reference_rejected"]
      })
    ]));
  });

  it.each(runtimeReferences)("blocks model $label before environment reads or HTTP generation", async ({ envVar, mode }) => {
    const { server, auth, models, headers } = await fixture(true);
    vi.stubEnv(safeModelReference, "synthetic-allowed-model-secret");
    const config = await models.upsertProviderConfig({
      provider: "openai",
      enabled: true,
      apiKeyEnvVar: safeModelReference,
      baseUrl: "https://model.example.test",
      defaultModel: "synthetic-model",
      metadata: { maxRetries: 0 }
    });
    const asset = await server.inject({
      method: "POST",
      url: "/assets",
      headers,
      payload: {
        stableId: "playbook.reserved-secret",
        type: "playbook",
        ownerId: "synthetic-admin",
        title: "Reserved Secret Guidance",
        summary: "Synthetic governed secret guidance",
        lifecycleState: "active",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2099-01-01",
        allowedSurfaces: ["api"],
        instruction: {
          instructionKind: "playbook",
          body: "Synthetic governed secret guidance must cite its public source."
        }
      }
    });
    expect(asset.statusCode).toBe(201);
    const query = () => server.inject({
      method: "POST",
      url: "/agent/query",
      headers,
      payload: { query: "governed secret guidance", mode: "provider-routed", provider: "openai" }
    });
    const control = await query();
    expect(control.statusCode).toBe(200);
    expect(control.json().generation.status).toBe("completed");
    expect(outbound).toMatchObject([{
      url: "https://model.example.test/responses",
      authorization: "Bearer synthetic-allowed-model-secret"
    }]);
    outbound.length = 0;
    await exposeSyntheticSecret(envVar, mode);
    const listSpy = vi.spyOn(models, "listProviderConfigs").mockResolvedValue([{ ...config, apiKeyEnvVar: envVar }]);

    const response = await query();
    expect(outbound).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().generation).toMatchObject({
      status: "skipped",
      reason: "api_key_secret_reference_rejected"
    });
    const health = await server.inject({ method: "GET", url: "/admin/model-providers/health", headers });
    expect(health.json().providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "openai",
        status: "not-ready",
        apiKeyConfigured: false,
        reasons: ["api_key_secret_reference_rejected"]
      })
    ]));
    expect(JSON.stringify([response.json(), health.json(), await auth.listAuditEvents()])).not.toContain(syntheticSecret);

    listSpy.mockResolvedValue([{
      ...config,
      apiKeyEnvVar: safeModelReference,
      baseUrl: "https://attacker.example.test"
    }]);
    const wrongOrigin = await query();
    expect(wrongOrigin.json().generation).toMatchObject({
      status: "skipped",
      reason: "api_key_secret_reference_rejected"
    });
    expect(outbound).toEqual([]);
  });

  it.each(runtimeReferences)("blocks OIDC $label before client-secret token exchange", async ({ envVar, mode }) => {
    const { server, auth, oidc } = await fixture(true);
    vi.stubEnv(safeOidcReference, "synthetic-allowed-oidc-secret");
    const config = await oidc.upsertAuthProviderConfig({
      provider: "oidc",
      enabled: true,
      issuerUrl: "https://idp.example.test",
      clientId: "synthetic",
      clientSecretEnvVar: safeOidcReference,
      redirectUri: "https://app.example.test/callback"
    });
    const callback = async () => {
      const authorize = await server.inject({
        method: "POST",
        url: "/auth/oidc/authorize",
        payload: { provider: "oidc" }
      });
      expect(authorize.statusCode).toBe(200);
      const flow = authorize.json();
      return server.inject({
        method: "POST",
        url: "/auth/oidc/callback",
        payload: {
          provider: "oidc",
          code: "synthetic-code",
          state: flow.state,
          nonce: flow.nonce,
          codeVerifier: flow.codeVerifier,
          redirectUri: flow.redirectUri
        }
      });
    };
    const control = await callback();
    expect(control.statusCode).toBe(401);
    expect(control.json().error).toBe("oidc_token_exchange_failed");
    expect(outbound).toHaveLength(1);
    expect(new URLSearchParams(outbound[0]!.body).get("client_secret")).toBe("synthetic-allowed-oidc-secret");
    outbound.length = 0;
    await exposeSyntheticSecret(envVar, mode);
    const listSpy = vi.spyOn(oidc, "listAuthProviderConfigs").mockResolvedValue([{ ...config, clientSecretEnvVar: envVar }]);

    const response = await callback();
    expect(outbound).toEqual([]);
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("oidc_client_secret_reference_rejected");
    expect(JSON.stringify([response.json(), await auth.listAuditEvents()])).not.toContain(syntheticSecret);

    listSpy.mockResolvedValue([{ ...config, clientSecretEnvVar: safeOidcReference }]);
    discoveredTokenEndpoint = "https://tokens.example.test/token";
    const wrongOrigin = await callback();
    expect(wrongOrigin.statusCode).toBe(503);
    expect(wrongOrigin.json().error).toBe("oidc_client_secret_reference_rejected");
    expect(outbound).toEqual([]);
  });
});
