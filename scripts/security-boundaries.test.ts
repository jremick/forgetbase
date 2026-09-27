import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPool,
  InMemoryAuthRepository,
  InMemoryAuthProviderConfigRepository,
  InMemoryModelProviderConfigRepository,
  InMemoryRegistryRepository,
  InMemoryRetrievalRepository,
  PostgresAuthRepository,
  runMigrations
} from "../packages/db/src/index.js";
import { OpenAiEmbeddingProvider } from "../packages/db/src/embeddings.js";
import { ForgetBaseClient } from "../packages/sdk/src/index.js";
import { buildServer } from "../apps/api/src/server.js";
import { runApiKeyRotationReminderMaintenance } from "../apps/worker/src/index.js";

const { generateKeyPair, exportJWK, SignJWT } = await import(createRequire(new URL("../apps/api/package.json", import.meta.url)).resolve("jose"));

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function httpFixture(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  return `http://127.0.0.1:${address.port}`;
}

function api(options: Parameters<typeof buildServer>[0] = {}) {
  const server = buildServer({ logger: false, ...options });
  cleanups.push(() => server.close());
  return server;
}

async function oidcFixture(issuerUrl: string) {
  const config = new InMemoryAuthProviderConfigRepository();
  await config.upsertAuthProviderConfig({
    provider: "oidc", enabled: true, issuerUrl, clientId: "synthetic-client",
    redirectUri: "http://localhost:5175/callback", autoProvisionUsers: true,
    clientSecretEnvVar: "FORGETBASE_TEST_OIDC_SECRET"
  });
  vi.stubEnv("FORGETBASE_TEST_OIDC_SECRET", "synthetic-client-secret");
  return api({ authProviderConfigRepository: config, authRepository: new InMemoryAuthRepository(), oidcStateSecret: "synthetic-state-signing-key" });
}

function discovery(issuer: string) {
  return { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` };
}

describe("outbound credential boundaries", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("does not redirect a signed worker notification to a different recipient", async () => {
    vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
    const pool = createPool(process.env.TEST_DATABASE_URL!);
    const tenantId = `tenant_security_webhook_${randomUUID()}`;
    cleanups.push(async () => {
      try { await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]); }
      finally { await pool.end(); }
    });
    await runMigrations(pool);
    const auth = new PostgresAuthRepository(pool);
    const account = await auth.createServiceAccount({ tenantId, slug: "synthetic-account", name: "Synthetic Account", role: "reader" });
    await auth.createApiKey({ tenantId, serviceAccountId: account.id, name: "synthetic-key", scopes: ["asset:read"], expiresAt: new Date(Date.now() - 60_000).toISOString() });
    let forwarded = 0;
    let requests = 0;
    const destination = await httpFixture((_req, res) => { forwarded += 1; res.writeHead(200).end(); });
    const source = await httpFixture((_req, res) => { requests += 1; res.writeHead(307, { location: destination }).end(); });
    const result = await runApiKeyRotationReminderMaintenance({
      tenantIds: [tenantId], dryRun: false, dedupeWindowHours: 0,
      notificationWebhookUrl: source, notificationWebhookSigningSecret: "synthetic-signing-secret"
    });
    expect(requests).toBe(1);
    expect(forwarded).toBe(0);
    expect(result.notificationDelivery).toMatchObject({ failedCount: 1, deliveredCount: 0 });
  });

  it("does not forward SDK login passwords across a redirect", async () => {
    let forwarded = 0;
    const destination = await httpFixture((_req, res) => { forwarded += 1; res.writeHead(500).end(); });
    const source = await httpFixture((_req, res) => res.writeHead(307, { location: destination }).end());
    const client = new ForgetBaseClient({ baseUrl: source });
    await expect(client.login({ email: "reader@example.test", password: "synthetic-password" })).rejects.toThrow();
    expect(forwarded).toBe(0);
  });

  it("does not forward embedding input across a redirect", async () => {
    let forwarded = 0;
    const destination = await httpFixture((_req, res) => { forwarded += 1; res.writeHead(500).end(); });
    const source = await httpFixture((_req, res) => res.writeHead(308, { location: destination }).end());
    const provider = new OpenAiEmbeddingProvider({ apiKey: "synthetic-key", baseUrl: source });
    await expect(provider.embedTexts(["synthetic private content"])).rejects.toThrow();
    expect(forwarded).toBe(0);
  });

  it("does not forward model context or an Anthropic key across a redirect", async () => {
    let forwarded = 0;
    let requests = 0;
    const destination = await httpFixture((_req, res) => { forwarded += 1; res.writeHead(500).end(); });
    const source = await httpFixture((_req, res) => { requests += 1; res.writeHead(307, { location: destination }).end(); });
    const registry = new InMemoryRegistryRepository();
    const retrieval = new InMemoryRetrievalRepository();
    const providers = new InMemoryModelProviderConfigRepository();
    const auth = new InMemoryAuthRepository();
    const admin = await auth.bootstrapAdmin({ tenantId: "tenant_demo", email: "admin@example.test", displayName: "Admin", keyName: "synthetic-admin" });
    const asset = await registry.createAsset({
      stableId: "policy.outbound", type: "policy", ownerId: "synthetic-owner", title: "Outbound security",
      lifecycleState: "active", sensitivity: "internal", audience: ["readers"], status: "approved",
      reviewDueAt: "2028-01-01", allowedSurfaces: ["api"],
      instruction: { instructionKind: "policy", body: "Synthetic private outbound security guidance." }
    });
    await retrieval.indexAsset(asset);
    vi.stubEnv("FORGETBASE_TEST_MODEL_SECRET", "synthetic-model-secret");
    await providers.upsertProviderConfig({
      provider: "anthropic", enabled: true, apiKeyEnvVar: "FORGETBASE_TEST_MODEL_SECRET", baseUrl: source,
      defaultModel: "synthetic-model", availableModels: ["synthetic-model"], metadata: { maxRetries: 0 }
    });
    const server = api({ registryRepository: registry, retrievalRepository: retrieval, authRepository: auth, providerConfigRepository: providers });
    const response = await server.inject({ method: "POST", url: "/agent/query", headers: { authorization: `Bearer ${admin?.secret}` },
      payload: { query: "outbound security", mode: "provider-routed", provider: "anthropic" } });
    expect(response.statusCode).toBe(200);
    expect(requests).toBeGreaterThan(0);
    expect(forwarded).toBe(0);
    expect(response.json().generation.status).not.toBe("completed");
  });
});

describe("OIDC provider trust", () => {
  it("rejects discovery from a different issuer before returning a login URL", async () => {
    const server = await oidcFixture("https://trusted.example.test");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(discovery("https://other.example.test"))));
    const response = await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe("oidc_issuer_mismatch");
  });

  it.each([
    ["authorization_endpoint", "javascript:alert(1)"],
    ["token_endpoint", "http://untrusted.example.test/token"],
    ["jwks_uri", "https://user:password@idp.example.test/jwks"],
    ["jwks_uri", "https://idp.example.test/jwks#fragment"]
  ])("rejects unsafe discovery field %s", async (field, value) => {
    const issuer = "https://trusted.example.test";
    const server = await oidcFixture(issuer);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...discovery(issuer), [field]: value })));
    expect((await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } })).statusCode).toBe(502);
  });

  it("allows a matching HTTPS issuer with separate HTTPS endpoint hosts", async () => {
    const issuer = "https://trusted.example.test/tenant";
    const server = await oidcFixture(issuer);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ...discovery(issuer), token_endpoint: "https://tokens.example.test/token", jwks_uri: "https://keys.example.test/jwks"
    })));
    expect((await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } })).statusCode).toBe(200);
  });

  it("rejects oversized discovery metadata and cancels its stream", async () => {
    const issuer = "https://trusted.example.test";
    const server = await oidcFixture(issuer);
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    const response = await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } });
    expect(response.statusCode).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not follow a discovery redirect", async () => {
    let forwarded = 0;
    const destination = await httpFixture((_req, res) => { forwarded += 1; res.writeHead(500).end(); });
    const issuer = await httpFixture((_req, res) => res.writeHead(302, { location: destination }).end());
    const server = await oidcFixture(issuer);
    const response = await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(forwarded).toBe(0);
  });

  it("does not send an OIDC client secret to a redirected token endpoint", async () => {
    let forwarded = 0;
    const destination = await httpFixture((_req, res) => { forwarded += 1; res.writeHead(500).end(); });
    const issuer = await httpFixture((req, res) => {
      if (req.url?.endsWith("openid-configuration")) res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(discovery(issuer)));
      else res.writeHead(307, { location: destination }).end();
    });
    const server = await oidcFixture(issuer);
    const authorization = await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } });
    expect(authorization.statusCode).toBe(200);
    const { state, nonce, codeVerifier } = authorization.json();
    const callback = await server.inject({ method: "POST", url: "/auth/oidc/callback", payload: { provider: "oidc", code: "synthetic-code", state, nonce, codeVerifier } });
    expect(callback.statusCode).toBeGreaterThanOrEqual(400);
    expect(forwarded).toBe(0);
  });

  it.each(["valid", "missing-exp", "missing-iat", "expired", "wrong-audience", "wrong-issuer", "wrong-nonce"])(
    "validates a signed ID token: %s", async (variant) => {
      const { privateKey, publicKey } = await generateKeyPair("RS256");
      const jwk = { ...await exportJWK(publicKey), kid: "synthetic-key", alg: "RS256", use: "sig" };
      let token = "";
      const issuer = await httpFixture((req, res) => {
        const body = req.url?.endsWith("openid-configuration") ? discovery(issuer) : req.url === "/jwks" ? { keys: [jwk] } : { id_token: token };
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
      });
      const server = await oidcFixture(issuer);
      const authorization = await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } });
      expect(authorization.statusCode).toBe(200);
      const { state, nonce, codeVerifier } = authorization.json();
      const now = Math.floor(Date.now() / 1000);
      token = await new SignJWT({
        sub: "synthetic-subject", email: "reader@example.test", email_verified: true,
        nonce: variant === "wrong-nonce" ? "other-nonce" : nonce,
        ...(variant === "missing-iat" ? {} : { iat: now }),
        ...(variant === "missing-exp" ? {} : { exp: variant === "expired" ? now - 60 : now + 300 })
      }).setProtectedHeader({ alg: "RS256", kid: jwk.kid })
        .setIssuer(variant === "wrong-issuer" ? "https://other.example.test" : issuer)
        .setAudience(variant === "wrong-audience" ? "other-client" : "synthetic-client").sign(privateKey);
      const callback = await server.inject({ method: "POST", url: "/auth/oidc/callback", payload: { provider: "oidc", code: "synthetic-code", state, nonce, codeVerifier } });
      expect(callback.statusCode).toBe(variant === "valid" ? 201 : 401);
      if (variant !== "valid") expect(callback.headers["set-cookie"]).toBeUndefined();
    }
  );
});

describe("request privacy and browser origin enforcement", () => {
  it.each(["/auth/login", "/missing-upload"])("rejects attachment-sized binary bodies on %s before authentication", async (url) => {
    const auth = new InMemoryAuthRepository();
    const authenticate = vi.spyOn(auth, "authenticateApiKey");
    const response = await api({ authRepository: auth, requireAuthentication: true }).inject({
      method: "POST", url, headers: { "content-type": "application/octet-stream", authorization: "Bearer synthetic-invalid-key" },
      payload: Buffer.alloc(2 * 1024 * 1024)
    });
    expect(response.statusCode).toBe(415);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("does not persist search text, cookies, or authorization headers in request logs", async () => {
    let logs = "";
    const server = api({ logger: { stream: { write(chunk: string) { logs += chunk; } } } });
    await server.inject({ url: "/search?query=synthetic-private-query", headers: { cookie: "secret=synthetic-cookie", authorization: "Bearer synthetic-bearer" } });
    expect(logs).toContain("incoming request");
    expect(logs).not.toMatch(/synthetic-(private-query|cookie|bearer)/);
  });

  it("does not expose upstream exception text in responses or logs", async () => {
    let logs = "";
    const retrieval = new InMemoryRetrievalRepository();
    vi.spyOn(retrieval, "search").mockRejectedValue(new Error("synthetic-private-upstream-error"));
    const server = api({ retrievalRepository: retrieval, logger: { stream: { write(chunk: string) { logs += chunk; } } } });
    const response = await server.inject("/search?query=security");
    expect(response.statusCode).toBe(500);
    expect(response.body + logs).not.toContain("synthetic-private-upstream-error");
    expect(response.json().error).toBe("internal_server_error");
    server.log.warn({ err: new Error("synthetic-private-warning") }, "Dependency warning");
    expect(logs).toContain("Dependency warning");
    expect(logs).not.toContain("synthetic-private-warning");
  });

  it("does not echo malformed JSON input in error responses", async () => {
    const response = await api().inject({ method: "POST", url: "/auth/login", headers: { "content-type": "application/json" }, payload: "private-secret-not-json" });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("private");
  });

  it("rejects a disallowed browser origin before rotating a refresh token", async () => {
    const auth = new InMemoryAuthRepository();
    const refresh = vi.spyOn(auth, "refreshLoginSession");
    const server = api({ authRepository: auth, allowedOrigins: ["https://knowledge.example.test"] });
    await auth.bootstrapAdmin({ tenantId: "tenant_demo", email: "reader@example.test", displayName: "Reader", password: "synthetic-password", keyName: "synthetic-admin" });
    const login = await server.inject({ method: "POST", url: "/auth/login", payload: { email: "reader@example.test", password: "synthetic-password" } });
    const cookies = login.headers["set-cookie"];
    const cookie = (Array.isArray(cookies) ? cookies : [String(cookies)]).map((item) => item.split(";")[0]).join("; ");
    const denied = await server.inject({ method: "POST", url: "/auth/session/refresh", headers: { cookie, origin: "https://untrusted.example.test", "content-type": "text/plain" }, payload: "" });
    expect(denied.statusCode).toBe(403);
    expect(refresh).not.toHaveBeenCalled();
    const allowed = await server.inject({ method: "POST", url: "/auth/session/refresh", headers: { cookie, origin: "https://knowledge.example.test" } });
    expect(allowed.statusCode).toBe(200);
  });
});
