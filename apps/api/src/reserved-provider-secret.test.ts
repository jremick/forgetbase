import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAuthRepository, InMemoryAuthProviderConfigRepository, InMemoryModelProviderConfigRepository,
  InMemoryRegistryRepository, InMemoryRetrievalRepository, InMemoryManagedQueryFeedbackRepository,
  InMemorySecretReferencePolicyRepository
} from "@forgetbase/db";
import { buildServer } from "./server.js";

const servers: ReturnType<typeof buildServer>[] = [];
const directories: string[] = [];
const tokenName = "FORGETBASE_UPDATER_API_TOKEN";
const syntheticSecret = "synthetic-host-token-for-reserved-secret-tests";
const references = [tokenName, `${tokenName}_FILE`, `${tokenName}_FILE_FILE`];
const outbound: Array<{ url: string; authorization: string | null; body: string }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  outbound.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fixture(permissive: boolean) {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("FORGETBASE_UPDATER_URL", undefined);
  for (const reference of references) vi.stubEnv(reference, undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://idp.example.test/.well-known/openid-configuration") {
      return Response.json({ issuer: "https://idp.example.test", authorization_endpoint: "https://idp.example.test/authorize", token_endpoint: "https://idp.example.test/token", jwks_uri: "https://idp.example.test/jwks" });
    }
    outbound.push({ url, authorization: new Headers(init?.headers).get("authorization"), body: String(init?.body ?? "") });
    if (url === "https://model.example.test/responses") return Response.json({ output_text: "Synthetic governed secret guidance [playbook.reserved-secret]" });
    if (url === "https://idp.example.test/token") return Response.json({ error: "synthetic_stop_after_exchange" }, { status: 400 });
    throw new Error("Unexpected synthetic HTTP destination");
  }));
  const auth = new InMemoryAuthRepository();
  const models = new InMemoryModelProviderConfigRepository();
  const oidc = new InMemoryAuthProviderConfigRepository();
  const policies = new InMemorySecretReferencePolicyRepository();
  const server = buildServer({
    logger: false, authRepository: auth, providerConfigRepository: models, authProviderConfigRepository: oidc,
    secretReferencePolicyRepository: policies, registryRepository: new InMemoryRegistryRepository(),
    retrievalRepository: new InMemoryRetrievalRepository(), feedbackRepository: new InMemoryManagedQueryFeedbackRepository(),
    oidcStateSecret: "synthetic-reserved-reference-state-signing-key"
  });
  servers.push(server);
  const bootstrap = await server.inject({ method: "POST", url: "/auth/bootstrap", payload: { email: "admin@example.test", displayName: "Synthetic Admin" } });
  expect(bootstrap.statusCode).toBe(201);
  const headers = { authorization: `Bearer ${bootstrap.json().secret}` };
  if (permissive) {
    const policy = await server.inject({ method: "PUT", url: "/admin/secret-reference-policy", headers, payload: { allowedEnvVarPrefixes: ["FORGETBASE_"], allowedEnvVars: references, allowUnlistedEnvVars: true } });
    expect(policy.statusCode).toBe(200);
  }
  return { server, auth, models, oidc, headers };
}

async function exposeSyntheticSecret(mode: string): Promise<string> {
  if (mode === "direct") { vi.stubEnv(tokenName, syntheticSecret); return tokenName; }
  if (mode === "nested-file-reference") { vi.stubEnv(`${tokenName}_FILE_FILE`, syntheticSecret); return `${tokenName}_FILE_FILE`; }
  const directory = await mkdtemp(join(tmpdir(), "forgetbase-reserved-secret-"));
  directories.push(directory);
  const path = join(directory, "synthetic-host-token");
  await writeFile(path, `${syntheticSecret}\n`, { mode: 0o600 });
  vi.stubEnv(`${tokenName}_FILE`, path);
  return mode === "file-fallback" ? tokenName : `${tokenName}_FILE`;
}

describe("reserved updater credentials at provider admission", () => {
  it.each([false, true])("denies model and OIDC references with permissive policy=%s without altering safe configuration", async (permissive) => {
    const { server, models, oidc, headers } = await fixture(permissive);
    const safeModel = await models.upsertProviderConfig({ provider: "openai", enabled: true, apiKeyEnvVar: "OPENAI_API_KEY" });
    const safeAuth = await oidc.upsertAuthProviderConfig({ provider: "oidc", issuerUrl: "https://idp.example.test", clientId: "synthetic", clientSecretEnvVar: "OIDC_CLIENT_SECRET" });
    for (const reference of references) {
      for (const [url, payload] of [
        ["/admin/model-providers/openai", { enabled: true, baseUrl: "https://model.example.test", apiKeyEnvVar: reference }],
        ["/admin/auth-providers/oidc", { enabled: true, issuerUrl: "https://idp.example.test", clientId: "synthetic", clientSecretEnvVar: reference }]
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

describe("legacy provider reference runtime revalidation", () => {
  it.each(["direct", "file-fallback", "file-reference", "nested-file-reference"])("blocks model %s with a permissive policy before default HTTP generation", async (mode) => {
    const { server, auth, models, headers } = await fixture(true);
    vi.stubEnv("FORGETBASE_TEST_MODEL_SECRET", "synthetic-allowed-model-secret");
    const config = await models.upsertProviderConfig({ provider: "openai", enabled: true, apiKeyEnvVar: "FORGETBASE_TEST_MODEL_SECRET", baseUrl: "https://model.example.test", defaultModel: "synthetic-model", metadata: { maxRetries: 0 } });
    const asset = await server.inject({ method: "POST", url: "/assets", headers, payload: {
      stableId: "playbook.reserved-secret", type: "playbook", ownerId: "synthetic-admin", title: "Reserved Secret Guidance", summary: "Synthetic governed secret guidance", lifecycleState: "active", sensitivity: "public-demo", audience: ["ai-team"], status: "approved", reviewDueAt: "2099-01-01", allowedSurfaces: ["api"], instruction: { instructionKind: "playbook", body: "Synthetic governed secret guidance must cite its public source." }
    } });
    expect(asset.statusCode).toBe(201);
    const query = () => server.inject({ method: "POST", url: "/agent/query", headers, payload: { query: "governed secret guidance", mode: "provider-routed", provider: "openai" } });
    const control = await query();
    expect(control.statusCode).toBe(200);
    expect(control.json().generation.status).toBe("completed");
    expect(outbound).toMatchObject([{ url: "https://model.example.test/responses", authorization: "Bearer synthetic-allowed-model-secret" }]);
    outbound.length = 0;
    const reference = await exposeSyntheticSecret(mode);
    // Simulate an already persisted row without admitting it through today's write boundary.
    vi.spyOn(models, "listProviderConfigs").mockResolvedValue([{ ...config, apiKeyEnvVar: reference }]);
    const response = await query();
    expect(outbound).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().generation).toMatchObject({ status: "skipped", reason: "api_key_secret_reference_rejected" });
    const health = await server.inject({ method: "GET", url: "/admin/model-providers/health", headers });
    expect(health.json().providers).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "openai", status: "not-ready", apiKeyConfigured: false, reasons: ["api_key_secret_reference_rejected"] })]));
    expect(JSON.stringify([response.json(), health.json(), await auth.listAuditEvents()])).not.toContain(syntheticSecret);
  });

  it.each(["direct", "file-fallback", "file-reference", "nested-file-reference"])("blocks OIDC %s with a permissive policy before default HTTP token exchange", async (mode) => {
    const { server, auth, oidc } = await fixture(true);
    vi.stubEnv("FORGETBASE_TEST_OIDC_SECRET", "synthetic-allowed-oidc-secret");
    const config = await oidc.upsertAuthProviderConfig({ provider: "oidc", enabled: true, issuerUrl: "https://idp.example.test", clientId: "synthetic", clientSecretEnvVar: "FORGETBASE_TEST_OIDC_SECRET", redirectUri: "https://app.example.test/callback" });
    const callback = async () => {
      const authorize = await server.inject({ method: "POST", url: "/auth/oidc/authorize", payload: { provider: "oidc" } });
      expect(authorize.statusCode).toBe(200);
      const flow = authorize.json();
      return server.inject({ method: "POST", url: "/auth/oidc/callback", payload: { provider: "oidc", code: "synthetic-code", state: flow.state, nonce: flow.nonce, codeVerifier: flow.codeVerifier, redirectUri: flow.redirectUri } });
    };
    const control = await callback();
    expect(control.statusCode).toBe(401);
    expect(control.json().error).toBe("oidc_token_exchange_failed");
    expect(outbound).toHaveLength(1);
    expect(new URLSearchParams(outbound[0]!.body).get("client_secret")).toBe("synthetic-allowed-oidc-secret");
    outbound.length = 0;
    const reference = await exposeSyntheticSecret(mode);
    vi.spyOn(oidc, "listAuthProviderConfigs").mockResolvedValue([{ ...config, clientSecretEnvVar: reference }]);
    const response = await callback();
    expect(outbound).toEqual([]);
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("oidc_client_secret_reference_rejected");
    expect(JSON.stringify([response.json(), await auth.listAuditEvents()])).not.toContain(syntheticSecret);
  });
});
