import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiExportPackageSchema, healthResponseSchema, okfExportPackageSchema } from "@forgetbase/schema";
import {
  InMemoryAgentActionExecutionRepository,
  InMemoryAuthRepository,
  InMemoryAuthProviderConfigRepository,
  InMemoryManagedQueryEvalRunRepository,
  InMemoryManagedQueryEvalSchedulePolicyRepository,
  InMemoryManagedQueryCachePolicyRepository,
  InMemoryManagedQueryCacheRepository,
  InMemoryManagedQueryFeedbackRepository,
  InMemoryManagedQueryPolicyRepository,
  InMemoryManagedQueryRetentionPolicyRepository,
  InMemoryModelProviderConfigRepository,
  InMemoryPiiRedactionPolicyRepository,
  InMemoryRetrievalRankingPolicyRepository,
  InMemoryRegistryRepository,
  InMemoryRetrievalRepository,
  InMemorySecretReferencePolicyRepository,
  InMemoryTelemetryRetentionPolicyRepository
} from "@forgetbase/db";
import { buildServer, type ModelRuntimeRequest } from "./server.js";

let server = buildServer({ logger: false });

afterEach(async () => {
  vi.useRealTimers();
  await server.close();
  server = buildServer({ logger: false });
});

function readSetCookieHeaders(value: string | string[] | number | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  return typeof value === "string" ? [value] : [];
}

function findSetCookie(value: string | string[] | number | undefined, name: string): string {
  return readSetCookieHeaders(value).find((cookie) => cookie.startsWith(`${name}=`)) ?? "";
}

function readCookiePair(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

function readCookieValue(setCookie: string): string {
  const pair = readCookiePair(setCookie);
  const separatorIndex = pair.indexOf("=");

  if (separatorIndex === -1) {
    return "";
  }

  return decodeURIComponent(pair.slice(separatorIndex + 1));
}

function readCookieMaxAge(setCookie: string): number {
  const match = /(?:^|;\s*)Max-Age=(\d+)/.exec(setCookie);

  return match?.[1] ? Number.parseInt(match[1], 10) : -1;
}

describe("API health route", () => {
  it("returns the shared health response shape", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({
      status: "ok",
      service: "forgetbase-api",
      version: "0.1.0"
    });
  });

  it("allows DELETE in CORS preflight responses", async () => {
    const response = await server.inject({
      method: "OPTIONS",
      url: "/auth/groups/group_123/members/user_123",
      headers: {
        origin: "http://127.0.0.1:5175"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5175");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    expect(response.headers["access-control-allow-headers"]).toContain("x-forgetbase-csrf");
  });

  it("allows configured credentialed CORS origins", async () => {
    server = buildServer({
      logger: false,
      allowedOrigins: ["https://cms.example.test/"]
    });

    const response = await server.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: {
        origin: "https://cms.example.test"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://cms.example.test");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers.vary).toBe("Origin");
  });

  it("rejects credentialed CORS preflights from unlisted origins", async () => {
    server = buildServer({
      logger: false,
      allowedOrigins: ["https://cms.example.test"]
    });

    const response = await server.inject({
      method: "OPTIONS",
      url: "/auth/logout",
      headers: {
        origin: "https://untrusted.example.test"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("origin_not_allowed");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("keeps non-browser requests available without credentialed CORS", async () => {
    server = buildServer({
      logger: false,
      allowedOrigins: ["https://cms.example.test"]
    });

    const response = await server.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("separates liveness from dependency readiness", async () => {
    server = buildServer({
      logger: false,
      readinessCheck: async () => {
        throw new Error("database unavailable");
      }
    });

    const liveness = await server.inject({ method: "GET", url: "/health" });
    const readiness = await server.inject({ method: "GET", url: "/ready" });

    expect(liveness.statusCode).toBe(200);
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toMatchObject({
      status: "not-ready",
      checks: {
        database: "unavailable",
        migrations: "unknown"
      }
    });
  });

  it("allows unauthenticated readiness probes when global authentication is required", async () => {
    server = buildServer({
      logger: false,
      authRepository: new InMemoryAuthRepository(),
      requireAuthentication: true,
      readinessCheck: async () => undefined
    });

    const response = await server.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ready");
  });

  it("fails startup on invalid boolean environment values", async () => {
    const previousValue = process.env.FORGETBASE_REQUIRE_AUTHENTICATION;
    process.env.FORGETBASE_REQUIRE_AUTHENTICATION = "true ";
    let validServer: ReturnType<typeof buildServer> | null = null;

    try {
      validServer = buildServer({ logger: false });
      process.env.FORGETBASE_REQUIRE_AUTHENTICATION = "definitely";
      expect(() => buildServer({ logger: false })).toThrow("Invalid boolean environment value");
    } finally {
      await validServer?.close();
      if (previousValue === undefined) {
        delete process.env.FORGETBASE_REQUIRE_AUTHENTICATION;
      } else {
        process.env.FORGETBASE_REQUIRE_AUTHENTICATION = previousValue;
      }
    }
  });

  it("blocks unauthenticated bootstrap when global authentication is required", async () => {
    server = buildServer({
      logger: false,
      authRepository: new InMemoryAuthRepository(),
      requireAuthentication: true
    });

    const response = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("authentication_required");
  });

  it("reuses bearer authentication between the global guard and protected handler", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({ logger: false, authRepository });
    const bootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { email: "cached-admin@example.test", displayName: "Cached Admin" }
    });
    const authenticateApiKey = vi.spyOn(authRepository, "authenticateApiKey");

    await server.close();
    server = buildServer({ logger: false, authRepository, requireAuthentication: true });
    const response = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${bootstrap.json().secret}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().email).toBe("cached-admin@example.test");
    expect(authenticateApiKey).toHaveBeenCalledTimes(1);
  });

  it("looks up and touches a cookie session once per accepted protected request", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({ logger: false, authRepository });
    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "cached-session@example.test",
        displayName: "Cached Session",
        password: "cached-session-password"
      }
    });
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "cached-session@example.test", password: "cached-session-password" }
    });
    const sessionCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_session");
    const authenticateApiKey = vi.spyOn(authRepository, "authenticateApiKey");
    const findSession = vi.spyOn(authRepository, "findActiveLoginSessionByApiKeyId");
    const touchSession = vi.spyOn(authRepository, "touchLoginSession");

    await server.close();
    server = buildServer({ logger: false, authRepository, requireAuthentication: true });
    const response = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: readCookiePair(sessionCookie) }
    });

    expect(response.statusCode).toBe(200);
    expect(authenticateApiKey).toHaveBeenCalledTimes(1);
    expect(findSession).toHaveBeenCalledTimes(1);
    expect(touchSession).toHaveBeenCalledTimes(1);
    expect((await authRepository.listLoginSessions())[0]?.lastSeenAt).toEqual(expect.any(String));
  });

  it("does not extend a cookie session when CSRF validation rejects the request", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({ logger: false, authRepository });
    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "csrf-session@example.test",
        displayName: "CSRF Session",
        password: "csrf-session-password"
      }
    });
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "csrf-session@example.test", password: "csrf-session-password" }
    });
    const sessionCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_session");
    const authenticateApiKey = vi.spyOn(authRepository, "authenticateApiKey");
    const findSession = vi.spyOn(authRepository, "findActiveLoginSessionByApiKeyId");
    const touchSession = vi.spyOn(authRepository, "touchLoginSession");

    expect((await authRepository.listLoginSessions())[0]?.lastSeenAt).toBeNull();
    await server.close();
    server = buildServer({ logger: false, authRepository, requireAuthentication: true });
    const response = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: readCookiePair(sessionCookie) }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("csrf_required");
    expect(authenticateApiKey).toHaveBeenCalledTimes(1);
    expect(findSession).toHaveBeenCalledTimes(1);
    expect(touchSession).not.toHaveBeenCalled();
    expect((await authRepository.listLoginSessions())[0]?.lastSeenAt).toBeNull();
  });

  it("preserves role denial and audit identity with cached authentication", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({ logger: false, authRepository });
    const bootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { email: "role-admin@example.test", displayName: "Role Admin" }
    });
    const adminKey = bootstrap.json().secret;
    const readerResponse = await server.inject({
      method: "POST",
      url: "/auth/users",
      headers: { authorization: `Bearer ${adminKey}` },
      payload: { email: "role-reader@example.test", displayName: "Role Reader", role: "reader" }
    });
    const readerKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: { authorization: `Bearer ${adminKey}` },
      payload: { userId: readerResponse.json().id, name: "role-reader", scopes: ["asset:read"] }
    });
    const authenticateApiKey = vi.spyOn(authRepository, "authenticateApiKey");

    await server.close();
    server = buildServer({ logger: false, authRepository, requireAuthentication: true });
    const response = await server.inject({
      method: "GET",
      url: "/admin/service-account-policy",
      headers: { authorization: `Bearer ${readerKeyResponse.json().secret}` }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("access_denied");
    expect(authenticateApiKey).toHaveBeenCalledTimes(1);
    expect((await authRepository.listAuditEvents()).find((event) => event.action === "auth.admin")).toMatchObject({
      actorUserId: readerResponse.json().id,
      action: "auth.admin",
      outcome: "denied"
    });
  });

  it("serializes concurrent first-admin bootstrap attempts", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({ logger: false, authRepository });
    const payload = {
      tenantId: "tenant_concurrent_bootstrap",
      email: "admin@example.test",
      displayName: "Admin",
      password: "bootstrap-password-123"
    };
    const responses = await Promise.all([
      server.inject({ method: "POST", url: "/auth/bootstrap", payload }),
      server.inject({ method: "POST", url: "/auth/bootstrap", payload })
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(await authRepository.countUsers(payload.tenantId)).toBe(1);
    expect((await authRepository.listApiKeys({ tenantId: payload.tenantId }))).toHaveLength(1);
    expect((await authRepository.listAuditEvents({ tenantId: payload.tenantId })))
      .toHaveLength(1);
  });

  it("throttles repeated password failures and records safe audit evidence", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository,
      loginThrottleMaxAttempts: 2,
      loginThrottleWindowMs: 60_000,
      loginThrottleBlockMs: 60_000,
      loginThrottleMaxEntries: 10
    });
    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        tenantId: "tenant_login_throttle",
        email: "admin@example.test",
        displayName: "Admin",
        password: "correct-password-123"
      }
    });
    const invalidLogin = {
      tenantId: "tenant_login_throttle",
      email: "admin@example.test",
      password: "incorrect"
    };
    const first = await server.inject({ method: "POST", url: "/auth/login", payload: invalidLogin });
    const second = await server.inject({ method: "POST", url: "/auth/login", payload: invalidLogin });
    const blocked = await server.inject({ method: "POST", url: "/auth/login", payload: invalidLogin });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(429);
    expect(blocked.statusCode).toBe(429);
    expect(Number.parseInt(String(blocked.headers["retry-after"]), 10)).toBeGreaterThan(0);

    const failedLogins = (await authRepository.listAuditEvents({ tenantId: "tenant_login_throttle" }))
      .filter((event) => event.action === "auth.login" && event.outcome === "denied");
    expect(failedLogins).toHaveLength(3);
    expect(failedLogins.map((event) => event.reason)).toEqual(expect.arrayContaining([
      "invalid_credentials",
      "login_rate_limited"
    ]));
    expect(failedLogins[0]?.metadata).toMatchObject({
      emailHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      remoteAddressHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(JSON.stringify(failedLogins)).not.toContain("admin@example.test");
    expect(JSON.stringify(failedLogins)).not.toContain("incorrect");
  });
});

describe("API asset registry routes", () => {
  it("creates, lists, and fetches governed assets", async () => {
    server = buildServer({
      logger: false,
      registryRepository: new InMemoryRegistryRepository(),
      authRepository: new InMemoryAuthRepository()
    });

    const bootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const bootstrapBody = bootstrap.json();
    const apiKey = bootstrapBody.secret;

    const createResponse = await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      payload: {
        stableId: "guardrail.test-context",
        type: "guardrail",
        ownerId: "user_admin",
        title: "Test Context Guardrail",
        lifecycleState: "active",
        sensitivity: "internal",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "guardrail",
          body: "Keep context inside the permitted asset boundary."
        },
        humanDocument: {
          format: "markdown",
          body: "# Test Context Guardrail"
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().asset.stableId).toBe("guardrail.test-context");

    const listResponse = await server.inject({
      method: "GET",
      url: "/assets",
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().assets).toHaveLength(1);

    const fetchResponse = await server.inject({
      method: "GET",
      url: "/assets/guardrail.test-context",
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });

    expect(fetchResponse.statusCode).toBe(200);
    expect(fetchResponse.json().instructionObjects[0].body).toContain("permitted");
  });

  it("does not trust a caller-declared surface and intersects admin access with asset surfaces", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      registryRepository: new InMemoryRegistryRepository(),
      authRepository
    });
    const bootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { email: "surface-admin@example.test", displayName: "Surface Admin" }
    });
    const bootstrapBody = bootstrap.json();
    const apiKey = bootstrapBody.secret;
    await server.inject({
      method: "POST",
      url: "/assets",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        stableId: "guardrail.mcp-only",
        type: "guardrail",
        ownerId: "user_admin",
        title: "MCP-only Guardrail",
        lifecycleState: "active",
        sensitivity: "internal",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["mcp"],
        instruction: { instructionKind: "guardrail", body: "Only MCP may read this." }
      }
    });

    const apiOnlyKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        userId: bootstrapBody.user.id,
        name: "api-only",
        scopes: ["asset:read"],
        allowedSurfaces: ["api"]
      }
    });
    const apiOnlyKey = apiOnlyKeyResponse.json().secret;
    const denied = await server.inject({
      method: "GET",
      url: "/assets/guardrail.mcp-only",
      headers: {
        authorization: `Bearer ${apiOnlyKey}`,
        "x-forgetbase-surface": "mcp"
      }
    });

    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("access_denied");

    const mcpKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        userId: bootstrapBody.user.id,
        name: "mcp-bound",
        scopes: ["asset:read"],
        allowedSurfaces: ["mcp"]
      }
    });
    const allowed = await server.inject({
      method: "GET",
      url: "/assets/guardrail.mcp-only",
      headers: {
        authorization: `Bearer ${mcpKeyResponse.json().secret}`,
        "x-forgetbase-surface": "mcp"
      }
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().asset.stableId).toBe("guardrail.mcp-only");
  });

  it("lists review queue items and marks assets reviewed", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      registryRepository: new InMemoryRegistryRepository(),
      authRepository,
      retrievalRepository: new InMemoryRetrievalRepository()
    });

    const unauthenticatedQueue = await server.inject({
      method: "GET",
      url: "/assets/review-queue?asOf=2026-06-16"
    });

    expect(unauthenticatedQueue.statusCode).toBe(401);

    const bootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin-review@example.test",
        displayName: "Review Admin"
      }
    });
    const apiKey = bootstrap.json().secret;

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      payload: {
        stableId: "guardrail.review-route",
        type: "guardrail",
        ownerId: "user_admin",
        title: "Review Route Guardrail",
        lifecycleState: "active",
        sensitivity: "internal",
        audience: ["ai-team"],
        status: "reviewing",
        reviewDueAt: "2026-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "guardrail",
          body: "Review route coverage."
        }
      }
    });

    const queue = await server.inject({
      method: "GET",
      url: "/assets/review-queue?asOf=2026-06-16",
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });

    expect(queue.statusCode).toBe(200);
    expect(queue.json().assets.map((asset: { stableId: string }) => asset.stableId)).toEqual([
      "guardrail.review-route"
    ]);

    const reviewed = await server.inject({
      method: "POST",
      url: "/assets/guardrail.review-route/review",
      headers: {
        authorization: `Bearer ${apiKey}`
      },
      payload: {
        reviewDueAt: "2027-06-30",
        changeNote: "Reviewed route behavior"
      }
    });

    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().asset.status).toBe("approved");
    expect(reviewed.json().asset.reviewDueAt).toBe("2027-06-30");
    expect(reviewed.json().versions).toHaveLength(2);

    const nextQueue = await server.inject({
      method: "GET",
      url: "/assets/review-queue?asOf=2026-06-16",
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    });
    const auditEvents = await authRepository.listAuditEvents({ limit: 20 });

    expect(nextQueue.statusCode).toBe(200);
    expect(nextQueue.json().assets).toHaveLength(0);
    expect(auditEvents.map((event) => event.action)).toContain("asset.review");
  });

  it("returns validation errors for invalid asset payloads", async () => {
    server = buildServer({
      logger: false,
      registryRepository: new InMemoryRegistryRepository()
    });

    const response = await server.inject({
      method: "POST",
      url: "/assets",
      payload: {
        stableId: "invalid.asset"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_error");
  });

  it("enforces scoped API keys, grants, and audited denials for restricted assets", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const restrictedAsset = await registryRepository.createAsset({
      stableId: "guardrail.restricted-test",
      type: "guardrail",
      ownerId: "user_admin",
      title: "Restricted Test Guardrail",
      lifecycleState: "active",
      sensitivity: "restricted",
      audience: ["security-team"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      allowedSurfaces: ["api", "cli", "mcp"],
      instruction: {
        instructionKind: "guardrail",
        body: "Restricted agent instruction."
      }
    });

    const denied = await server.inject({
      method: "GET",
      url: `/assets/${restrictedAsset.asset.stableId}`
    });

    expect(denied.statusCode).toBe(401);
    expect((await authRepository.listAuditEvents()).at(0)?.outcome).toBe("denied");

    const userResponse = await server.inject({
      method: "POST",
      url: "/auth/users",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        email: "reader@example.test",
        displayName: "Reader",
        role: "reader"
      }
    });
    const user = userResponse.json();

    const noReadKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        userId: user.id,
        name: "write-only",
        scopes: ["asset:write"]
      }
    });
    const noReadKey = noReadKeyResponse.json().secret;

    const scopedDenied = await server.inject({
      method: "GET",
      url: `/assets/${restrictedAsset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${noReadKey}`
      }
    });

    expect(scopedDenied.statusCode).toBe(403);

    const readKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        userId: user.id,
        name: "reader",
        scopes: ["asset:read"]
      }
    });
    const readKey = readKeyResponse.json().secret;

    await server.inject({
      method: "POST",
      url: `/assets/${restrictedAsset.asset.stableId}/grants`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        principalType: "user",
        principalId: user.id,
        action: "read",
        surfaces: ["api"]
      }
    });

    const allowed = await server.inject({
      method: "GET",
      url: `/assets/${restrictedAsset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${readKey}`
      }
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().asset.sensitivity).toBe("restricted");
  });

  it("lets local users log in with passwords and receive scoped API keys", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository
    });

    const bootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin",
        password: "correct-horse-battery"
      }
    });

    const invalidLogin = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.test",
        password: "wrong-password"
      }
    });

    expect(invalidLogin.statusCode).toBe(401);

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: {
        "user-agent": "ForgetBaseWebTest/1.0"
      },
      payload: {
        email: "admin@example.test",
        password: "correct-horse-battery",
        keyName: "admin-login",
        deviceLabel: "Work laptop",
        expiresInSeconds: 600
      }
    });

    expect(login.statusCode).toBe(201);
    expect(login.json().apiKey.name).toBe("admin-login");
    expect(login.json().apiKey.expiresAt).toBeTruthy();
    expect(login.json().apiKey.scopes).toEqual(["admin", "asset:read", "asset:write", "permission:write"]);
    const sessionCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_session");
    const csrfCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_csrf");
    const refreshCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_refresh");
    expect(sessionCookie).toContain("forgetbase_session=");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(readCookieMaxAge(sessionCookie)).toBeLessThanOrEqual(600);
    expect(readCookieMaxAge(sessionCookie)).toBeGreaterThan(0);
    expect(csrfCookie).toContain("forgetbase_csrf=");
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(csrfCookie).toContain("SameSite=Lax");
    expect(readCookieMaxAge(csrfCookie)).toBeLessThanOrEqual(600);
    expect(readCookieMaxAge(csrfCookie)).toBeGreaterThan(0);
    expect(refreshCookie).toContain("forgetbase_refresh=");
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("SameSite=Lax");
    expect(readCookieMaxAge(refreshCookie)).toBeLessThanOrEqual(60 * 60 * 24 * 7);
    expect(readCookieMaxAge(refreshCookie)).toBeGreaterThan(0);

    const me = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("admin@example.test");

    const cookieMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: readCookiePair(sessionCookie)
      }
    });

    expect(cookieMe.statusCode).toBe(200);
    expect(cookieMe.json().email).toBe("admin@example.test");

    const nonLoginCookieMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: `forgetbase_session=${encodeURIComponent(bootstrap.json().secret)}`
      }
    });

    expect(nonLoginCookieMe.statusCode).toBe(401);

    const sessions = await server.inject({
      method: "GET",
      url: "/auth/sessions",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(sessions.statusCode).toBe(200);
    expect(sessions.json().sessions).toHaveLength(1);
    expect(sessions.json().sessions[0]).toMatchObject({
      userId: login.json().apiKey.userId,
      apiKeyId: login.json().apiKey.id,
      source: "password",
      deviceLabel: "Work laptop",
      clientUserAgent: "ForgetBaseWebTest/1.0",
      revokedAt: null
    });

    const missingCsrfLogout = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: readCookiePair(sessionCookie)
      }
    });

    expect(missingCsrfLogout.statusCode).toBe(403);
    expect(missingCsrfLogout.json().error).toBe("csrf_required");

    const logout = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: `${readCookiePair(sessionCookie)}; ${readCookiePair(csrfCookie)}`,
        "x-forgetbase-csrf": readCookieValue(csrfCookie)
      }
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json().apiKey.id).toBe(login.json().apiKey.id);
    expect(logout.json().apiKey.revokedAt).toBeTruthy();
    expect(findSetCookie(logout.headers["set-cookie"], "forgetbase_session")).toContain("Max-Age=0");
    expect(findSetCookie(logout.headers["set-cookie"], "forgetbase_csrf")).toContain("Max-Age=0");
    expect(findSetCookie(logout.headers["set-cookie"], "forgetbase_refresh")).toContain("Max-Age=0");

    const afterLogout = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(afterLogout.statusCode).toBe(401);

    const secondLogin = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.test",
        password: "correct-horse-battery",
        keyName: "admin-login-bearer",
        expiresInSeconds: 600
      }
    });

    const bearerLogout = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        authorization: `Bearer ${secondLogin.json().secret}`
      }
    });

    expect(bearerLogout.statusCode).toBe(200);
    expect(bearerLogout.json().apiKey.id).toBe(secondLogin.json().apiKey.id);
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toContain("auth.logout");
  });

  it("caps interactive login key and cookie expiry to the server session policy", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository,
      loginSessionMaxAgeSeconds: 60
    });

    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin",
        password: "correct-horse-battery"
      }
    });

    const beforeLogin = Date.now();
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.test",
        password: "correct-horse-battery",
        keyName: "long-requested-login",
        expiresInSeconds: 60 * 60 * 24 * 30
      }
    });

    expect(login.statusCode).toBe(201);
    expect(Date.parse(login.json().apiKey.expiresAt) - beforeLogin).toBeLessThanOrEqual(65_000);
    expect(Date.parse(login.json().apiKey.expiresAt) - beforeLogin).toBeGreaterThan(0);
    expect(readCookieMaxAge(findSetCookie(login.headers["set-cookie"], "forgetbase_session"))).toBeLessThanOrEqual(60);
    expect(readCookieMaxAge(findSetCookie(login.headers["set-cookie"], "forgetbase_csrf"))).toBeLessThanOrEqual(60);

    const loginAuditEvent = (await authRepository.listAuditEvents()).find((event) => event.action === "auth.login");
    expect(loginAuditEvent?.metadata).toMatchObject({
      requestedExpiresInSeconds: 60 * 60 * 24 * 30,
      effectiveExpiresInSeconds: 60,
      sessionMaxAgeSeconds: 60,
      expiresAt: login.json().apiKey.expiresAt
    });
  });

  it("rotates browser login sessions with a one-time HttpOnly refresh cookie", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository,
      loginSessionMaxAgeSeconds: 60,
      loginRefreshTokenMaxAgeSeconds: 120
    });

    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin",
        password: "correct-horse-battery"
      }
    });

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.test",
        password: "correct-horse-battery",
        keyName: "refreshable-session",
        deviceLabel: "Refresh test browser"
      }
    });
    const refreshCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_refresh");

    expect(login.statusCode).toBe(201);
    expect(refreshCookie).toContain("HttpOnly");
    expect(readCookieMaxAge(refreshCookie)).toBeLessThanOrEqual(120);

    const refreshed = await server.inject({
      method: "POST",
      url: "/auth/session/refresh",
      headers: {
        cookie: readCookiePair(refreshCookie)
      }
    });
    const nextSessionCookie = findSetCookie(refreshed.headers["set-cookie"], "forgetbase_session");
    const nextRefreshCookie = findSetCookie(refreshed.headers["set-cookie"], "forgetbase_refresh");

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().secret).toBeUndefined();
    expect(refreshed.json().apiKey.id).not.toBe(login.json().apiKey.id);
    expect(refreshed.json().session.apiKeyId).toBe(refreshed.json().apiKey.id);
    expect(refreshed.json().session.deviceLabel).toBe("Refresh test browser");
    expect(nextSessionCookie).toContain("HttpOnly");
    expect(nextRefreshCookie).toContain("HttpOnly");

    const oldBearer = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(oldBearer.statusCode).toBe(401);

    const refreshedCookieMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: readCookiePair(nextSessionCookie)
      }
    });

    expect(refreshedCookieMe.statusCode).toBe(200);
    expect(refreshedCookieMe.json().apiKeyId).toBe(refreshed.json().apiKey.id);

    const reusedRefresh = await server.inject({
      method: "POST",
      url: "/auth/session/refresh",
      headers: {
        cookie: readCookiePair(refreshCookie)
      }
    });

    expect(reusedRefresh.statusCode).toBe(401);
    expect(findSetCookie(reusedRefresh.headers["set-cookie"], "forgetbase_refresh")).toContain("Max-Age=0");
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toContain("auth.session.refresh");
  });

  it("enforces absolute browser session lifetime without changing bearer keys", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository,
      loginSessionMaxAgeSeconds: 120,
      loginSessionAbsoluteMaxAgeSeconds: 60,
      loginRefreshTokenMaxAgeSeconds: 120
    });

    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin",
        password: "correct-horse-battery"
      }
    });

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.test",
        password: "correct-horse-battery",
        keyName: "absolute-session",
        expiresInSeconds: 120
      }
    });
    const sessionCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_session");
    const refreshCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_refresh");

    expect(login.statusCode).toBe(201);
    expect(readCookieMaxAge(sessionCookie)).toBeLessThanOrEqual(60);
    expect(readCookieMaxAge(refreshCookie)).toBeLessThanOrEqual(60);
    expect(Date.parse(login.json().apiKey.expiresAt) - Date.now()).toBeLessThanOrEqual(60_000);

    const session = (await authRepository.listLoginSessions({ userId: login.json().apiKey.userId }))[0];
    expect(session?.absoluteExpiresAt).toBeTruthy();
    const loginSessions = (authRepository as unknown as {
      loginSessions: Map<string, Record<string, unknown>>;
    }).loginSessions;
    loginSessions.set(session?.id ?? "", {
      ...loginSessions.get(session?.id ?? ""),
      absoluteExpiresAt: new Date(Date.now() - 1_000).toISOString()
    });

    const expiredCookieMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: readCookiePair(sessionCookie)
      }
    });

    expect(expiredCookieMe.statusCode).toBe(401);

    const expiredRefresh = await server.inject({
      method: "POST",
      url: "/auth/session/refresh",
      headers: {
        cookie: readCookiePair(refreshCookie)
      }
    });

    expect(expiredRefresh.statusCode).toBe(401);
    expect(expiredRefresh.json().error).toBe("refresh_invalid");

    const bearerMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(bearerMe.statusCode).toBe(200);
  });

  it("revokes login sessions and their underlying login keys", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository
    });

    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin",
        password: "correct-horse-battery"
      }
    });

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.test",
        password: "correct-horse-battery",
        keyName: "revocable-session"
      }
    });
    const sessionCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_session");
    const sessions = await server.inject({
      method: "GET",
      url: "/auth/sessions",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });
    const sessionId = sessions.json().sessions[0].id;

    const revoked = await server.inject({
      method: "DELETE",
      url: `/auth/sessions/${sessionId}`,
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().session.revokedAt).toBeTruthy();
    expect(revoked.json().apiKey.revokedAt).toBeTruthy();
    expect(findSetCookie(revoked.headers["set-cookie"], "forgetbase_session")).toContain("Max-Age=0");

    const afterRevokeCookie = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: readCookiePair(sessionCookie)
      }
    });

    expect(afterRevokeCookie.statusCode).toBe(401);

    const afterRevokeBearer = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(afterRevokeBearer.statusCode).toBe(401);
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toContain("auth.session.revoke");
  });

  it("enforces idle timeout for browser login sessions without changing bearer keys", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository,
      loginSessionIdleTimeoutSeconds: 60
    });

    await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin",
        password: "correct-horse-battery"
      }
    });

    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.test",
        password: "correct-horse-battery",
        keyName: "idle-session"
      }
    });
    const sessionCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_session");
    const refreshCookie = findSetCookie(login.headers["set-cookie"], "forgetbase_refresh");
    const session = (await authRepository.listLoginSessions({ userId: login.json().apiKey.userId }))[0];
    expect(session).toBeTruthy();
    const loginSessions = (authRepository as unknown as {
      loginSessions: Map<string, Record<string, unknown>>;
    }).loginSessions;

    loginSessions.set(session?.id ?? "", {
      ...loginSessions.get(session?.id ?? ""),
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      lastSeenAt: null
    });

    const idleCookieMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: readCookiePair(sessionCookie)
      }
    });

    expect(idleCookieMe.statusCode).toBe(401);

    const idleRefresh = await server.inject({
      method: "POST",
      url: "/auth/session/refresh",
      headers: {
        cookie: readCookiePair(refreshCookie)
      }
    });

    expect(idleRefresh.statusCode).toBe(401);
    expect(idleRefresh.json().error).toBe("refresh_invalid");

    const bearerMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${login.json().secret}`
      }
    });

    expect(bearerMe.statusCode).toBe(200);
    expect(bearerMe.json().email).toBe("admin@example.test");
  });

  it("lets admins list local users without exposing password hashes", async () => {
    server = buildServer({
      logger: false,
      authRepository: new InMemoryAuthRepository()
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const userResponse = await server.inject({
      method: "POST",
      url: "/auth/users",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        email: "listed-reader@example.test",
        displayName: "Listed Reader",
        role: "reader",
        password: "correct-horse-battery"
      }
    });
    const user = userResponse.json();
    const listResponse = await server.inject({
      method: "GET",
      url: "/auth/users",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().users.map((listedUser: { id: string }) => listedUser.id)).toContain(user.id);
    expect(JSON.stringify(listResponse.json())).not.toContain("correct-horse-battery");
    expect(JSON.stringify(listResponse.json())).not.toContain("password");
  });

  it("lets admins update local users and disables password login", async () => {
    server = buildServer({
      logger: false,
      authRepository: new InMemoryAuthRepository()
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const userResponse = await server.inject({
      method: "POST",
      url: "/auth/users",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        email: "update-reader@example.test",
        displayName: "Update Reader",
        role: "reader",
        password: "initial-password-123"
      }
    });
    const user = userResponse.json();

    const updateResponse = await server.inject({
      method: "PUT",
      url: `/auth/users/${user.id}`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        displayName: "Updated Reader",
        role: "maintainer",
        password: "updated-password-123"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().displayName).toBe("Updated Reader");
    expect(updateResponse.json().role).toBe("maintainer");
    expect(JSON.stringify(updateResponse.json())).not.toContain("updated-password-123");
    expect(JSON.stringify(updateResponse.json())).not.toContain("password");

    const oldLogin = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "update-reader@example.test",
        password: "initial-password-123"
      }
    });
    const newLogin = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "update-reader@example.test",
        password: "updated-password-123"
      }
    });

    expect(oldLogin.statusCode).toBe(401);
    expect(newLogin.statusCode).toBe(201);

    const disabledResponse = await server.inject({
      method: "PUT",
      url: `/auth/users/${user.id}`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        status: "disabled"
      }
    });
    const disabledLogin = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "update-reader@example.test",
        password: "updated-password-123"
      }
    });
    const auditResponse = await server.inject({
      method: "GET",
      url: "/audit/events?limit=8",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(disabledResponse.statusCode).toBe(200);
    expect(disabledResponse.json().status).toBe("disabled");
    expect(disabledLogin.statusCode).toBe(401);
    expect(auditResponse.json().events.map((event: { action: string }) => event.action)).toContain("auth.user.update");
  });

  it("lets admins create groups and grant restricted asset access to group members", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;
    const asset = await registryRepository.createAsset({
      stableId: "guardrail.group-restricted",
      type: "guardrail",
      ownerId: "user_admin",
      title: "Group Restricted Guardrail",
      lifecycleState: "active",
      sensitivity: "restricted",
      audience: ["ai-team"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      allowedSurfaces: ["api", "cli", "mcp"],
      instruction: {
        instructionKind: "guardrail",
        body: "Group-only restricted instruction."
      }
    });
    const userResponse = await server.inject({
      method: "POST",
      url: "/auth/users",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        email: "group-reader@example.test",
        displayName: "Group Reader",
        role: "reader"
      }
    });
    const user = userResponse.json();
    const readerKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        userId: user.id,
        name: "group-reader",
        scopes: ["asset:read"]
      }
    });
    const readerKey = readerKeyResponse.json().secret;

    const deniedBeforeGroup = await server.inject({
      method: "GET",
      url: `/assets/${asset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${readerKey}`
      }
    });

    expect(deniedBeforeGroup.statusCode).toBe(403);

    const groupResponse = await server.inject({
      method: "POST",
      url: "/auth/groups",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        slug: "ai-readers",
        name: "AI Readers"
      }
    });
    const group = groupResponse.json();

    expect(groupResponse.statusCode).toBe(201);

    const memberResponse = await server.inject({
      method: "POST",
      url: `/auth/groups/${group.id}/members`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        userId: user.id
      }
    });

    expect(memberResponse.statusCode).toBe(201);
    expect(memberResponse.json().userEmail).toBe("group-reader@example.test");

    const groups = await server.inject({
      method: "GET",
      url: "/auth/groups",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });
    const members = await server.inject({
      method: "GET",
      url: `/auth/groups/${group.id}/members`,
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(groups.json().groups.map((listedGroup: { id: string }) => listedGroup.id)).toContain(group.id);
    expect(members.json().members.map((member: { userId: string }) => member.userId)).toContain(user.id);

    const grantResponse = await server.inject({
      method: "POST",
      url: `/assets/${asset.asset.stableId}/grants`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        principalType: "group",
        principalId: group.id,
        action: "read",
        surfaces: ["api"]
      }
    });

    expect(grantResponse.statusCode).toBe(201);

    const allowed = await server.inject({
      method: "GET",
      url: `/assets/${asset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${readerKey}`
      }
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().asset.stableId).toBe(asset.asset.stableId);

    const removeMemberResponse = await server.inject({
      method: "DELETE",
      url: `/auth/groups/${group.id}/members/${user.id}`,
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });
    const deniedAfterMemberRemoval = await server.inject({
      method: "GET",
      url: `/assets/${asset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${readerKey}`
      }
    });

    expect(removeMemberResponse.statusCode).toBe(200);
    expect(removeMemberResponse.json().userId).toBe(user.id);
    expect(deniedAfterMemberRemoval.statusCode).toBe(403);

    const memberAgainResponse = await server.inject({
      method: "POST",
      url: `/auth/groups/${group.id}/members`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        userId: user.id
      }
    });
    const allowedAgain = await server.inject({
      method: "GET",
      url: `/assets/${asset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${readerKey}`
      }
    });

    expect(memberAgainResponse.statusCode).toBe(201);
    expect(allowedAgain.statusCode).toBe(200);

    const deleteGroupResponse = await server.inject({
      method: "DELETE",
      url: `/auth/groups/${group.id}`,
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });
    const deniedAfterGroupDelete = await server.inject({
      method: "GET",
      url: `/assets/${asset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${readerKey}`
      }
    });
    const groupsAfterDelete = await server.inject({
      method: "GET",
      url: "/auth/groups",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(deleteGroupResponse.statusCode).toBe(200);
    expect(deleteGroupResponse.json().id).toBe(group.id);
    expect(deniedAfterGroupDelete.statusCode).toBe(403);
    expect(groupsAfterDelete.json().groups.map((listedGroup: { id: string }) => listedGroup.id)).not.toContain(group.id);
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toEqual(expect.arrayContaining([
      "auth.group.create",
      "auth.group.member.add",
      "auth.group.member.remove",
      "auth.group.delete",
      "permission.grant"
    ]));
  });

  it("lets admins manage service accounts and grant restricted asset access to service principals", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;
    const asset = await registryRepository.createAsset({
      stableId: "guardrail.service-account-restricted",
      type: "guardrail",
      ownerId: "user_admin",
      title: "Service Account Restricted Guardrail",
      lifecycleState: "active",
      sensitivity: "restricted",
      audience: ["automation"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      allowedSurfaces: ["api", "cli", "mcp"],
      instruction: {
        instructionKind: "guardrail",
        body: "Service-account-only restricted instruction."
      }
    });

    const serviceAccountResponse = await server.inject({
      method: "POST",
      url: "/auth/service-accounts",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        slug: "automation",
        name: "Automation",
        role: "reader"
      }
    });
    const serviceAccount = serviceAccountResponse.json();

    expect(serviceAccountResponse.statusCode).toBe(201);
    expect(serviceAccount.slug).toBe("automation");

    const listResponse = await server.inject({
      method: "GET",
      url: "/auth/service-accounts",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().serviceAccounts.map((listed: { id: string }) => listed.id))
      .toContain(serviceAccount.id);

    const missingOwnerKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        serviceAccountId: "missing-service-account",
        name: "missing-owner",
        scopes: ["asset:read"]
      }
    });

    expect(missingOwnerKeyResponse.statusCode).toBe(404);

    const serviceKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        serviceAccountId: serviceAccount.id,
        name: "automation-reader",
        scopes: ["asset:read"]
      }
    });
    const serviceKey = serviceKeyResponse.json();

    expect(serviceKeyResponse.statusCode).toBe(201);
    expect(serviceKey.apiKey.userId).toBeNull();
    expect(serviceKey.apiKey.serviceAccountId).toBe(serviceAccount.id);

    const serviceMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${serviceKey.secret}`
      }
    });

    expect(serviceMe.statusCode).toBe(200);
    expect(serviceMe.json()).toMatchObject({
      principalType: "service-account",
      principalId: serviceAccount.id,
      userId: null,
      serviceAccountId: serviceAccount.id,
      email: null,
      displayName: "Automation",
      role: "reader",
      groupIds: []
    });

    const deniedBeforeGrant = await server.inject({
      method: "GET",
      url: `/assets/${asset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${serviceKey.secret}`
      }
    });

    expect(deniedBeforeGrant.statusCode).toBe(403);

    const grantResponse = await server.inject({
      method: "POST",
      url: `/assets/${asset.asset.stableId}/grants`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        principalType: "service-account",
        principalId: serviceAccount.id,
        action: "read",
        surfaces: ["api", "mcp"]
      }
    });

    expect(grantResponse.statusCode).toBe(201);

    const allowed = await server.inject({
      method: "GET",
      url: `/assets/${asset.asset.stableId}`,
      headers: {
        authorization: `Bearer ${serviceKey.secret}`
      }
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().asset.stableId).toBe(asset.asset.stableId);

    const keysResponse = await server.inject({
      method: "GET",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(keysResponse.statusCode).toBe(200);
    expect(keysResponse.json().apiKeys.map((apiKey: { serviceAccountId: string | null }) => apiKey.serviceAccountId))
      .toContain(serviceAccount.id);
    expect(JSON.stringify(keysResponse.json())).not.toContain(serviceKey.secret);

    const disabledResponse = await server.inject({
      method: "PUT",
      url: `/auth/service-accounts/${serviceAccount.id}`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        status: "disabled"
      }
    });
    const disabledMe = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${serviceKey.secret}`
      }
    });

    expect(disabledResponse.statusCode).toBe(200);
    expect(disabledResponse.json().status).toBe("disabled");
    expect(disabledMe.statusCode).toBe(401);
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toEqual(expect.arrayContaining([
      "auth.service_account.create",
      "auth.service_account.update",
      "auth.api_key.create",
      "permission.grant"
    ]));
  });

  it("lets admins manage service account policy and blocks policy violations", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const defaultPolicy = await server.inject({
      method: "GET",
      url: "/admin/service-account-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultPolicy.statusCode).toBe(200);
    expect(defaultPolicy.json()).toMatchObject({
      maxServiceAccounts: 50,
      maxActiveApiKeysPerServiceAccount: 5,
      defaultApiKeyExpiresInDays: 90,
      source: "default"
    });

    const policyUpdate = await server.inject({
      method: "PUT",
      url: "/admin/service-account-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        maxServiceAccounts: 1,
        maxActiveApiKeysPerServiceAccount: 1,
        defaultApiKeyExpiresInDays: 30
      }
    });

    expect(policyUpdate.statusCode).toBe(200);
    expect(policyUpdate.json()).toMatchObject({
      maxServiceAccounts: 1,
      maxActiveApiKeysPerServiceAccount: 1,
      defaultApiKeyExpiresInDays: 30,
      source: "stored"
    });

    const serviceAccountResponse = await server.inject({
      method: "POST",
      url: "/auth/service-accounts",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        slug: "policy-automation",
        name: "Policy Automation",
        role: "reader"
      }
    });
    const serviceAccount = serviceAccountResponse.json();

    expect(serviceAccountResponse.statusCode).toBe(201);

    const blockedServiceAccount = await server.inject({
      method: "POST",
      url: "/auth/service-accounts",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        slug: "blocked-policy-automation",
        name: "Blocked Policy Automation",
        role: "reader"
      }
    });

    expect(blockedServiceAccount.statusCode).toBe(409);
    expect(blockedServiceAccount.json()).toMatchObject({
      error: "max_service_accounts_exceeded",
      limit: 1
    });

    const serviceKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        serviceAccountId: serviceAccount.id,
        name: "policy-automation-reader",
        scopes: ["asset:read"]
      }
    });

    expect(serviceKeyResponse.statusCode).toBe(201);
    expect(serviceKeyResponse.json().apiKey.expiresAt).toBeTruthy();

    const blockedServiceKey = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        serviceAccountId: serviceAccount.id,
        name: "blocked-policy-automation-reader",
        scopes: ["asset:read"]
      }
    });

    expect(blockedServiceKey.statusCode).toBe(409);
    expect(blockedServiceKey.json()).toMatchObject({
      error: "max_active_api_keys_per_service_account_exceeded",
      limit: 1
    });
    const blockedRotation = await server.inject({
      method: "POST",
      url: `/auth/api-keys/${serviceKeyResponse.json().apiKey.id}/rotate`,
      headers: { authorization: `Bearer ${adminKey}` },
      payload: { name: "blocked-policy-rotation", revokeOld: false }
    });

    expect(blockedRotation.statusCode).toBe(409);
    expect(blockedRotation.json()).toMatchObject({
      error: "max_active_api_keys_per_service_account_exceeded",
      limit: 1
    });
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).not.toContain(
      "auth.api_key.rotate"
    );

    const allowedRotation = await server.inject({
      method: "POST",
      url: `/auth/api-keys/${serviceKeyResponse.json().apiKey.id}/rotate`,
      headers: { authorization: `Bearer ${adminKey}` },
      payload: { name: "allowed-policy-rotation", revokeOld: true }
    });

    expect(allowedRotation.statusCode).toBe(201);
    expect(allowedRotation.json().revokedApiKey.id).toBe(serviceKeyResponse.json().apiKey.id);
    expect((await authRepository.listApiKeys()).filter((apiKey) =>
      apiKey.serviceAccountId === serviceAccount.id && apiKey.revokedAt === null
    )).toHaveLength(1);
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toContain(
      "auth.api_key.rotate"
    );
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toContain(
      "auth.service_account_policy.update"
    );
  });

  it("lets admins list and revoke API keys without exposing raw secrets", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const userResponse = await server.inject({
      method: "POST",
      url: "/auth/users",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        email: "reader@example.test",
        displayName: "Reader",
        role: "reader"
      }
    });
    const user = userResponse.json();

    const readerKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        userId: user.id,
        name: "reader",
        scopes: ["asset:read"]
      }
    });
    const readerKey = readerKeyResponse.json();

    const serviceAccountResponse = await server.inject({
      method: "POST",
      url: "/auth/service-accounts",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        slug: "rotation-automation",
        name: "Rotation Automation",
        role: "reader"
      }
    });
    const serviceAccount = serviceAccountResponse.json();

    const serviceKeyResponse = await server.inject({
      method: "POST",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        serviceAccountId: serviceAccount.id,
        name: "service-due",
        scopes: ["asset:read"],
        expiresAt: "2026-06-20T00:00:00.000Z"
      }
    });
    const serviceKey = serviceKeyResponse.json();

    const rotationDueResponse = await server.inject({
      method: "GET",
      url: "/auth/api-keys/rotation-due?asOf=2026-06-16T00:00:00.000Z&dueWithinDays=7",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(rotationDueResponse.statusCode).toBe(200);
    expect(rotationDueResponse.json().reminders).toHaveLength(1);
    expect(rotationDueResponse.json().reminders[0]).toMatchObject({
      ownerType: "service-account",
      rotationState: "due-soon",
      daysUntilExpiry: 4,
      apiKey: {
        id: serviceKey.apiKey.id,
        secretPreview: serviceKey.apiKey.secretPreview
      }
    });
    expect(JSON.stringify(rotationDueResponse.json())).not.toContain(serviceKey.secret);
    expect(JSON.stringify(rotationDueResponse.json())).not.toContain(readerKey.secret);

    const listResponse = await server.inject({
      method: "GET",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().apiKeys.map((apiKey: { id: string }) => apiKey.id)).toContain(readerKey.apiKey.id);
    expect(JSON.stringify(listResponse.json())).not.toContain(readerKey.secret);
    expect(JSON.stringify(listResponse.json())).not.toContain(adminKey);

    const rotateResponse = await server.inject({
      method: "POST",
      url: `/auth/api-keys/${readerKey.apiKey.id}/rotate`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        name: "reader-rotated"
      }
    });

    expect(rotateResponse.statusCode).toBe(201);
    expect(rotateResponse.json().apiKey.userId).toBe(user.id);
    expect(rotateResponse.json().apiKey.scopes).toEqual(["asset:read"]);
    expect(rotateResponse.json().apiKey.name).toBe("reader-rotated");
    expect(rotateResponse.json().rotatedFrom.id).toBe(readerKey.apiKey.id);
    expect(rotateResponse.json().revokedApiKey).toBeNull();

    const rotatedAuth = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${rotateResponse.json().secret}`
      }
    });

    expect(rotatedAuth.statusCode).toBe(200);

    const listAfterRotate = await server.inject({
      method: "GET",
      url: "/auth/api-keys",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(JSON.stringify(listAfterRotate.json())).not.toContain(rotateResponse.json().secret);

    const revokeResponse = await server.inject({
      method: "POST",
      url: `/auth/api-keys/${readerKey.apiKey.id}/revoke`,
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json().apiKey.revokedAt).toBeTruthy();

    const revokedAuth = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${readerKey.secret}`
      }
    });

    expect(revokedAuth.statusCode).toBe(401);
    const auditActions = (await authRepository.listAuditEvents()).map((event) => event.action);
    expect(auditActions).toContain("auth.api_key.rotate");
    expect(auditActions).toContain("auth.api_key.revoke");
  });

  it("validates asset payloads with stale review reporting and audit events", async () => {
    const authRepository = new InMemoryAuthRepository();
    server = buildServer({
      logger: false,
      authRepository
    });

    const anonymousValidation = await server.inject({
      method: "POST",
      url: "/validation/assets",
      payload: {
        assets: []
      }
    });

    expect(anonymousValidation.statusCode).toBe(401);

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const validationResponse = await server.inject({
      method: "POST",
      url: "/validation/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        asOf: "2026-06-16",
        assets: [
          {
            stableId: "guardrail.validation-stale",
            type: "guardrail",
            ownerId: "user_admin",
            title: "Validation Stale Guardrail",
            lifecycleState: "active",
            sensitivity: "public-demo",
            audience: ["ai-team"],
            status: "approved",
            reviewDueAt: "2026-01-01",
            allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
            allowedExports: ["demo-agent-pack"],
            instruction: {
              instructionKind: "guardrail",
              body: "Validate stale review dates before import."
            }
          },
          {
            stableId: "policy.validation-restricted-export",
            type: "policy",
            title: "Restricted Export Mistake",
            lifecycleState: "active",
            sensitivity: "restricted",
            audience: ["ai-team"],
            status: "approved",
            reviewDueAt: "2027-01-31",
            allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
            allowedExports: ["demo-agent-pack"],
            instruction: {
              instructionKind: "policy",
              body: "This invalid fixture is missing ownerId and leaks into a public package."
            }
          }
        ]
      }
    });

    expect(validationResponse.statusCode).toBe(200);
    expect(validationResponse.json()).toMatchObject({
      ok: false,
      assetCount: 2,
      staleCount: 1
    });
    expect(validationResponse.json().issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining([
      "review.stale",
      "schema.invalid"
    ]));
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toContain("validation.assets");
  });

  it("updates and restores asset versions with audit events and reindexing", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const telemetryRetentionPolicyRepository = new InMemoryTelemetryRetentionPolicyRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      telemetryRetentionPolicyRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        tenantId: "tenant_rollback_test",
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const createResponse = await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "guardrail.rollback-test",
        type: "guardrail",
        ownerId: "user_admin",
        title: "Rollback Test Guardrail",
        lifecycleState: "active",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "guardrail",
          body: "Original rollback-safe instruction."
        },
        humanDocument: {
          format: "markdown",
          body: "# Original rollback-safe document"
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);

    const updateResponse = await server.inject({
      method: "POST",
      url: "/assets/guardrail.rollback-test/versions",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        instruction: {
          instructionKind: "guardrail",
          body: "Updated rollbackupdatedtoken instruction."
        },
        changeNote: "Update rollback fixture"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().versions.map((version: { versionNumber: number }) => version.versionNumber)).toEqual([2, 1]);
    expect(updateResponse.json().instructionObjects).toHaveLength(1);
    expect(updateResponse.json().instructionObjects[0].body).toContain("rollbackupdatedtoken");
    expect(updateResponse.json().humanDocuments[0].body).toContain("Original rollback-safe document");

    const updatedSearch = await server.inject({
      method: "GET",
      url: "/search?query=rollbackupdatedtoken",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(updatedSearch.statusCode).toBe(200);
    expect(uniqueStableIds(updatedSearch.json().results)).toEqual(["guardrail.rollback-test"]);

    const anonymousVersionSnapshot = await server.inject({
      method: "GET",
      url: "/assets/guardrail.rollback-test/versions/1"
    });

    expect(anonymousVersionSnapshot.statusCode).toBe(401);

    const versionSnapshot = await server.inject({
      method: "GET",
      url: "/assets/guardrail.rollback-test/versions/1",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(versionSnapshot.statusCode).toBe(200);
    expect(versionSnapshot.json().version.versionNumber).toBe(1);
    expect(versionSnapshot.json().asset.currentVersionId).toBe(versionSnapshot.json().version.id);
    expect(versionSnapshot.json().instructionObjects[0].body).toContain("Original rollback-safe instruction");
    expect(versionSnapshot.json().humanDocuments[0].body).toContain("Original rollback-safe document");

    const restoreResponse = await server.inject({
      method: "POST",
      url: "/assets/guardrail.rollback-test/restore",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        versionNumber: 1
      }
    });

    expect(restoreResponse.statusCode).toBe(200);
    expect(restoreResponse.json().asset.currentVersionId).toBe(restoreResponse.json().versions.find(
      (version: { versionNumber: number }) => version.versionNumber === 1
    ).id);
    expect(restoreResponse.json().instructionObjects[0].body).toContain("Original rollback-safe instruction");

    const restoredSearch = await server.inject({
      method: "GET",
      url: "/search?query=rollbackupdatedtoken",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(restoredSearch.statusCode).toBe(200);
    expect(restoredSearch.json().results).toHaveLength(0);
    expect((await authRepository.listAuditEvents({ tenantId: "tenant_rollback_test" })).map((event) => event.action)).toEqual(expect.arrayContaining([
      "asset.update",
      "asset.restore"
    ]));
  });

  it("keeps public-demo drafts private until an admin publishes them", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const createResponse = await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "guardrail.publish-test",
        type: "guardrail",
        ownerId: "user_admin",
        title: "Publish Test Guardrail",
        lifecycleState: "draft",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "reviewing",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        allowedExports: ["demo-agent-pack"],
        instruction: {
          instructionKind: "guardrail",
          body: "Publish draft token publishdrafttoken must stay private before approval."
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);

    const draftFetch = await server.inject({
      method: "GET",
      url: "/assets/guardrail.publish-test"
    });
    const draftSearch = await server.inject({
      method: "GET",
      url: "/search?query=publishdrafttoken"
    });
    const draftExport = await server.inject({
      method: "GET",
      url: "/exports/ai-package?package=demo-agent-pack"
    });

    expect(draftFetch.statusCode).toBe(401);
    expect(draftSearch.statusCode).toBe(200);
    expect(draftSearch.json().results).toHaveLength(0);
    expect(draftExport.statusCode).toBe(200);
    expect(draftExport.json().assets.map((asset: { stableId: string }) => asset.stableId)).not.toContain("guardrail.publish-test");

    const publishResponse = await server.inject({
      method: "POST",
      url: "/assets/guardrail.publish-test/publish",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        reviewDueAt: "2027-06-30",
        changeNote: "Approve public demo release"
      }
    });

    expect(publishResponse.statusCode).toBe(200);
    expect(publishResponse.json().asset.lifecycleState).toBe("active");
    expect(publishResponse.json().asset.status).toBe("approved");
    expect(publishResponse.json().asset.reviewDueAt).toBe("2027-06-30");
    expect(publishResponse.json().versions).toHaveLength(2);

    const publicFetch = await server.inject({
      method: "GET",
      url: "/assets/guardrail.publish-test"
    });
    const publicSearch = await server.inject({
      method: "GET",
      url: "/search?query=publishdrafttoken"
    });

    expect(publicFetch.statusCode).toBe(200);
    expect(publicSearch.statusCode).toBe(200);
    expect(uniqueStableIds(publicSearch.json().results)).toEqual(["guardrail.publish-test"]);
    expect((await authRepository.listAuditEvents()).map((event) => event.action)).toEqual(expect.arrayContaining([
      "asset.publish"
    ]));
  });

  it("searches indexed chunks with permission filtering, citations, and telemetry", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "guardrail.public-search",
        type: "guardrail",
        ownerId: "user_admin",
        title: "Public Search Guardrail",
        summary: "PII redaction guidance that public demo users can retrieve.",
        lifecycleState: "active",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "guardrail",
          body: "Use PII redaction before model context is assembled."
        }
      }
    });

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "guardrail.restricted-search",
        type: "guardrail",
        ownerId: "user_admin",
        title: "Restricted Search Guardrail",
        summary: "PII redaction details for restricted operators only.",
        lifecycleState: "active",
        sensitivity: "restricted",
        audience: ["security-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "guardrail",
          body: "Restricted PII redaction escalation path."
        }
      }
    });

    const githubToken = `ghp_${"a".repeat(36)}`;
    const publicSearch = await server.inject({
      method: "GET",
      url: `/search?query=${encodeURIComponent(
        `PII redaction for jane@example.test from 203.0.113.42 with code=abcdef123456 and token ${githubToken}`
      )}`
    });

    expect(publicSearch.statusCode).toBe(200);
    expect(uniqueStableIds(publicSearch.json().results)).toEqual(["guardrail.public-search"]);
    expect(publicSearch.json().results[0].citation.stableId).toBe("guardrail.public-search");
    const publicTelemetryEvent = (await retrievalRepository.listRetrievalEvents())[0];
    expect(publicTelemetryEvent?.deniedCount).toBeGreaterThan(0);
    expect(publicTelemetryEvent?.query).toBe(
      "PII redaction for [REDACTED_EMAIL] from [REDACTED_IP_ADDRESS] with code=[REDACTED_URL_SECRET] and token [REDACTED_API_KEY]"
    );
    expect(publicTelemetryEvent?.metadata.telemetryRedaction).toMatchObject({
      applied: true,
      findings: [
        { kind: "api-key", count: 1 },
        { kind: "url-secret", count: 1 },
        { kind: "email", count: 1 },
        { kind: "ip-address", count: 1 }
      ]
    });

    const adminSearch = await server.inject({
      method: "GET",
      url: "/search?query=PII%20redaction",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(adminSearch.statusCode).toBe(200);
    expect(uniqueStableIds(adminSearch.json().results)).toContain("guardrail.restricted-search");
  });

  it("honors admin PII redaction policy for telemetry and feedback", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const piiRedactionPolicyRepository = new InMemoryPiiRedactionPolicyRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      piiRedactionPolicyRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "guardrail.pii-policy",
        type: "guardrail",
        ownerId: "user_admin",
        title: "PII Policy Guardrail",
        summary: "PII redaction policy guidance that public demo users can retrieve.",
        lifecycleState: "active",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "guardrail",
          body: "Use tenant PII redaction policy before sensitive telemetry is stored."
        }
      }
    });

    const defaultPolicy = await server.inject({
      method: "GET",
      url: "/admin/pii-redaction-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultPolicy.statusCode).toBe(200);
    expect(defaultPolicy.json()).toMatchObject({
      redactionEnabled: true,
      enabledRuleKinds: expect.arrayContaining(["email", "ip-address", "url-secret"]),
      source: "default"
    });

    const storedPolicy = await server.inject({
      method: "PUT",
      url: "/admin/pii-redaction-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        redactionEnabled: true,
        enabledRuleKinds: ["email"]
      }
    });

    expect(storedPolicy.statusCode).toBe(200);
    expect(storedPolicy.json()).toMatchObject({
      redactionEnabled: true,
      enabledRuleKinds: ["email"],
      source: "stored"
    });

    const search = await server.inject({
      method: "GET",
      url: "/search?query=PII%20redaction%20for%20jane%40example.test%20from%20203.0.113.42%20with%20code%3Dabcdef123456"
    });

    expect(search.statusCode).toBe(200);
    expect(search.json().telemetryEventId).toBe("retrieval_1");
    const telemetryEvent = (await retrievalRepository.listRetrievalEvents())[0];
    expect(telemetryEvent?.query).toBe(
      "PII redaction for [REDACTED_EMAIL] from 203.0.113.42 with code=abcdef123456"
    );
    expect(telemetryEvent?.metadata.telemetryRedaction).toMatchObject({
      applied: true,
      findings: [
        { kind: "email", count: 1 }
      ]
    });
    expect(telemetryEvent?.metadata.ranking).toMatchObject({
      strategy: "lexical-weighted-v1"
    });

    const feedback = await server.inject({
      method: "POST",
      url: "/agent/query/feedback",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        telemetryEventId: "retrieval_1",
        query: "PII redaction for jane@example.test from 203.0.113.42 with code=abcdef123456",
        outcome: "accepted",
        notes: "Approved by jane@example.test from 203.0.113.42."
      }
    });

    expect(feedback.statusCode).toBe(201);
    const feedbackRecord = (await feedbackRepository.listFeedback())[0];
    expect(feedbackRecord?.query).toBe(
      "PII redaction for [REDACTED_EMAIL] from 203.0.113.42 with code=abcdef123456"
    );
    expect(feedbackRecord?.notes).toBe("Approved by [REDACTED_EMAIL] from 203.0.113.42.");
    expect(feedbackRecord?.metadata.feedbackRedaction).toMatchObject({
      query: {
        applied: true,
        findings: [
          { kind: "email", count: 1 }
        ]
      },
      notes: {
        applied: true,
        findings: [
          { kind: "email", count: 1 }
        ]
      }
    });
    expect((await authRepository.listAuditEvents()).some((event) =>
      event.action === "admin.pii_redaction_policy.update"
    )).toBe(true);
  });

  it("runs deterministic managed query with permission-filtered citations", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const evalRunRepository = new InMemoryManagedQueryEvalRunRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const telemetryRetentionPolicyRepository = new InMemoryTelemetryRetentionPolicyRepository();
    const piiRedactionPolicyRepository = new InMemoryPiiRedactionPolicyRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      evalRunRepository,
      feedbackRepository,
      telemetryRetentionPolicyRepository,
      piiRedactionPolicyRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "playbook.managed-public",
        type: "playbook",
        ownerId: "user_admin",
        title: "Managed Query Public Playbook",
        summary: "Managed query response guidance for public demo users.",
        lifecycleState: "active",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "playbook",
          body: "Managed query answers must preserve citations and avoid uncited claims."
        }
      }
    });

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "playbook.managed-restricted",
        type: "playbook",
        ownerId: "user_admin",
        title: "Managed Query Restricted Playbook",
        summary: "Managed query response guidance for restricted teams.",
        lifecycleState: "active",
        sensitivity: "restricted",
        audience: ["security-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp"],
        instruction: {
          instructionKind: "playbook",
          body: "Restricted managed query escalation details."
        }
      }
    });

    const publicQuery = await server.inject({
      method: "POST",
      url: "/agent/query",
      payload: {
        query: "managed query citations",
        limit: 5
      }
    });

    expect(publicQuery.statusCode).toBe(200);
    expect(publicQuery.json().mode).toBe("deterministic-retrieval");
    expect(publicQuery.json().generation).toMatchObject({
      provider: null,
      model: null,
      status: "not-requested",
      reason: null,
      latencyMs: null,
      attempts: []
    });
    expect(publicQuery.json().answer).toContain("Managed Query Public Playbook");
    expect(uniqueStableIds(publicQuery.json().results)).toEqual(["playbook.managed-public"]);
    expect(publicQuery.json().citations[0].stableId).toBe("playbook.managed-public");
    expect(publicQuery.json().checks.grounded).toBe(true);
    expect(publicQuery.json().checks.deniedCount).toBeGreaterThan(0);

    const adminQuery = await server.inject({
      method: "POST",
      url: "/agent/query",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        query: "managed query citations",
        limit: 5
      }
    });

    expect(adminQuery.statusCode).toBe(200);
    expect(uniqueStableIds(adminQuery.json().results)).toContain("playbook.managed-restricted");
    expect((await retrievalRepository.listRetrievalEvents())[0]?.metadata.queryKind).toBe("managed-query");

    const unauthenticatedFeedback = await server.inject({
      method: "POST",
      url: "/agent/query/feedback",
      payload: {
        telemetryEventId: publicQuery.json().telemetryEventId,
        query: "managed query citations",
        outcome: "accepted"
      }
    });

    expect(unauthenticatedFeedback.statusCode).toBe(401);

    const feedback = await server.inject({
      method: "POST",
      url: "/agent/query/feedback",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        telemetryEventId: adminQuery.json().telemetryEventId,
        query: "managed query citations from jane@example.test",
        outcome: "accepted",
        factualCitationAccuracy: 5,
        policyCompliance: 5,
        taskCompletionQuality: 4,
        consistency: 4,
        responseEffectiveness: 5,
        notes: "Accepted by jane@example.test because citations were grounded."
      }
    });

    expect(feedback.statusCode).toBe(201);
    expect(feedback.json().query).toBe("managed query citations from [REDACTED_EMAIL]");
    expect(feedback.json().notes).toContain("[REDACTED_EMAIL]");
    expect(feedback.json().factualCitationAccuracy).toBe(5);
    expect(feedback.json().metadata.feedbackRedaction.query.applied).toBe(true);

    const listedFeedback = await server.inject({
      method: "GET",
      url: "/agent/query/feedback?limit=5",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(listedFeedback.statusCode).toBe(200);
    expect(listedFeedback.json().feedback[0].id).toBe(feedback.json().id);
    expect((await authRepository.listAuditEvents())[0]?.action).toBe("agent.query.feedback");

    const unauthenticatedSummary = await server.inject({
      method: "GET",
      url: "/telemetry/summary"
    });

    expect(unauthenticatedSummary.statusCode).toBe(401);

    const summary = await server.inject({
      method: "GET",
      url: "/telemetry/summary?limit=20",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json().retrieval).toMatchObject({
      eventCount: 2,
      deniedCount: expect.any(Number),
      byQueryKind: [{ key: "managed-query", count: 2 }]
    });
    expect(summary.json().feedback).toMatchObject({
      recordCount: 1,
      byOutcome: [{ key: "accepted", count: 1 }],
      averageScores: {
        factualCitationAccuracy: 5,
        policyCompliance: 5,
        taskCompletionQuality: 4,
        consistency: 4,
        responseEffectiveness: 5
      }
    });
    expect(summary.json().audit.byAction).toEqual(expect.arrayContaining([
      { key: "agent.query.feedback", count: 1 }
    ]));
    expect(summary.json().assets.bySensitivity).toEqual(expect.arrayContaining([
      { key: "public-demo", count: 1 },
      { key: "restricted", count: 1 }
    ]));

    const unauthenticatedRetentionPolicy = await server.inject({
      method: "GET",
      url: "/admin/telemetry-retention"
    });

    expect(unauthenticatedRetentionPolicy.statusCode).toBe(401);

    const defaultRetentionPolicy = await server.inject({
      method: "GET",
      url: "/admin/telemetry-retention",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultRetentionPolicy.statusCode).toBe(200);
    expect(defaultRetentionPolicy.json()).toMatchObject({
      retrievalEventRetentionDays: 30,
      auditEventRetentionDays: 365,
      feedbackRetentionDays: 90,
      source: "default"
    });

    const updatedRetentionPolicy = await server.inject({
      method: "PUT",
      url: "/admin/telemetry-retention",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        retrievalEventRetentionDays: 14,
        auditEventRetentionDays: null,
        feedbackRetentionDays: 30
      }
    });

    expect(updatedRetentionPolicy.statusCode).toBe(200);
    expect(updatedRetentionPolicy.json()).toMatchObject({
      retrievalEventRetentionDays: 14,
      auditEventRetentionDays: null,
      feedbackRetentionDays: 30,
      source: "stored"
    });

    const purgePreview = await server.inject({
      method: "POST",
      url: "/admin/telemetry-retention/purge",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {}
    });

    expect(purgePreview.statusCode).toBe(200);
    expect(purgePreview.json()).toMatchObject({
      dryRun: true,
      retrievalEvents: {
        deletedCount: 0
      },
      auditEvents: {
        cutoff: null,
        deletedCount: 0
      },
      managedQueryFeedback: {
        deletedCount: 0
      }
    });

    const purgeExecute = await server.inject({
      method: "POST",
      url: "/admin/telemetry-retention/purge",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        dryRun: false
      }
    });

    expect(purgeExecute.statusCode).toBe(200);
    expect(purgeExecute.json().dryRun).toBe(false);
    expect((await authRepository.listAuditEvents())[0]?.action).toBe("admin.telemetry_retention.purge");

    const unauthenticatedEval = await server.inject({
      method: "POST",
      url: "/agent/evals/run",
      payload: {
        cases: [
          {
            id: "eval.managed-query",
            query: "managed query citations",
            expectedStableIds: ["playbook.managed-public"]
          }
        ]
      }
    });

    expect(unauthenticatedEval.statusCode).toBe(401);

    const evalResponse = await server.inject({
      method: "POST",
      url: "/agent/evals/run",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        tagMinimumPassRates: {
          "citation-accuracy": 1
        },
        cases: [
          {
            id: "eval.managed-query",
            query: "managed query citations from jane@example.test",
            expectedStableIds: ["playbook.managed-public", "playbook.managed-restricted"],
            requiredCitationCount: 2,
            tags: ["citation-accuracy"]
          }
        ]
      }
    });

    expect(evalResponse.statusCode).toBe(200);
    expect(evalResponse.json()).toMatchObject({
      ok: true,
      caseCount: 1,
      passedCount: 1,
      failedCount: 0
    });
    expect(evalResponse.json().results[0].resultStableIds).toEqual(expect.arrayContaining([
      "playbook.managed-public",
      "playbook.managed-restricted"
    ]));
    expect(evalResponse.json().results[0].telemetryEventId).toBeTruthy();
    expect(evalResponse.json().results[0].query).toBe("managed query citations from jane@example.test");
    expect((await retrievalRepository.listRetrievalEvents())[0]?.metadata.queryKind).toBe("managed-query-eval");
    const evalRuns = await evalRunRepository.listRuns({ tenantId: "tenant_demo" });
    expect(evalRuns[0]).toMatchObject({
      ok: true,
      caseCount: 1,
      passedCount: 1,
      failedCount: 0
    });
    expect(evalRuns[0]?.report.results[0]?.id).toBe("eval.managed-query");
    expect(evalRuns[0]?.report.results[0]?.query).toBe("managed query citations from [REDACTED_EMAIL]");
    expect(evalRuns[0]?.metadata.evalReportRedaction).toMatchObject({
      applied: true,
      findings: [{ kind: "email", count: 1 }],
      queryCount: 1
    });
    const evalAuditEvent = (await authRepository.listAuditEvents())[0];
    expect(evalAuditEvent?.action).toBe("agent.eval.run");
    expect(evalAuditEvent?.targetId).toBe(evalRuns[0]?.id);

    const evalRunsResponse = await server.inject({
      method: "GET",
      url: "/agent/evals/runs?limit=5",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(evalRunsResponse.statusCode).toBe(200);
    expect(evalRunsResponse.json().runs[0].id).toBe(evalRuns[0]?.id);

    const evalSummaryResponse = await server.inject({
      method: "GET",
      url: "/agent/evals/summary?limit=5",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(evalSummaryResponse.statusCode).toBe(200);
    expect(evalSummaryResponse.json()).toMatchObject({
      runCount: 1,
      latestRunId: evalRuns[0]?.id,
      latestPassRate: 1,
      latestThresholdPassed: true,
      averagePassRate: 1,
      passedRunCount: 1,
      failedRunCount: 0,
      thresholdPassedCount: 1,
      thresholdFailedCount: 0,
      totalCaseCount: 1,
      totalPassedCount: 1,
      totalFailedCount: 0,
      casePassRate: 1,
      byMode: [{ key: "deterministic-retrieval", count: 1 }],
      byTag: [{
        tag: "citation-accuracy",
        runCount: 1,
        caseCount: 1,
        passedCount: 1,
        failedCount: 0,
        passRate: 1,
        thresholdCount: 1,
        thresholdPassedCount: 1,
        thresholdFailedCount: 0,
        thresholdPassRate: 1
      }]
    });
    expect(evalSummaryResponse.json().recentRuns[0]).toMatchObject({
      id: evalRuns[0]?.id,
      ok: true,
      passRate: 1
    });

    const thresholdResponse = await server.inject({
      method: "POST",
      url: "/agent/evals/run",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        minimumPassRate: 0.5,
        tagMinimumPassRates: {
          "policy-compliance": 1,
          "missing-threshold-tag": 1
        },
        cases: [
          {
            id: "eval.threshold-pass",
            query: "managed query citations",
            expectedStableIds: ["playbook.managed-public"],
            tags: ["citation-accuracy"]
          },
          {
            id: "eval.threshold-fail",
            query: "managed query citations",
            expectedStableIds: ["missing.asset"],
            tags: ["policy-compliance"]
          }
        ]
      }
    });

    expect(thresholdResponse.statusCode).toBe(200);
    expect(thresholdResponse.json()).toMatchObject({
      ok: false,
      caseCount: 2,
      passedCount: 1,
      failedCount: 1,
      passRate: 0.5,
      minimumPassRate: 0.5,
      thresholdPassed: false
    });
    expect(thresholdResponse.json().tagResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tag: "citation-accuracy",
        caseCount: 1,
        passedCount: 1,
        passRate: 1
      }),
      expect.objectContaining({
        tag: "policy-compliance",
        caseCount: 1,
        passedCount: 0,
        passRate: 0
      })
    ]));
	    expect(thresholdResponse.json().tagThresholdResults).toEqual(expect.arrayContaining([
	      expect.objectContaining({
	        tag: "policy-compliance",
	        passed: false,
        reason: "Pass rate 0% is below required 100%."
      }),
      expect.objectContaining({
        tag: "missing-threshold-tag",
        passed: false,
        reason: "No eval cases matched this threshold."
	      })
	    ]));
		  });

  it("manages scheduled deterministic eval policy for admins", async () => {
    const authRepository = new InMemoryAuthRepository();
    const managedQueryEvalSchedulePolicyRepository = new InMemoryManagedQueryEvalSchedulePolicyRepository();

    server = buildServer({
      logger: false,
      authRepository,
      managedQueryEvalSchedulePolicyRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const defaultPolicy = await server.inject({
      method: "GET",
      url: "/admin/managed-query-eval-schedule-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultPolicy.statusCode).toBe(200);
    expect(defaultPolicy.json()).toMatchObject({
      enabled: false,
      intervalMinutes: 1440,
      evalInput: null,
      lastStatus: "not-run",
      source: "default"
    });

    const invalidEnable = await server.inject({
      method: "PUT",
      url: "/admin/managed-query-eval-schedule-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true
      }
    });

    expect(invalidEnable.statusCode).toBe(400);
    expect(invalidEnable.json()).toMatchObject({
      error: "managed_query_eval_schedule_requires_cases"
    });

    const storedPolicy = await server.inject({
      method: "PUT",
      url: "/admin/managed-query-eval-schedule-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        intervalMinutes: 30,
        evalInput: {
          minimumPassRate: 1,
          tagMinimumPassRates: {
            "citation-accuracy": 1
          },
          cases: [
            {
              id: "eval.schedule",
              query: "scheduled eval citations",
              expectedStableIds: ["policy.schedule"],
              requiredCitationCount: 1,
              tags: ["citation-accuracy"]
            }
          ]
        }
      }
    });

    expect(storedPolicy.statusCode).toBe(200);
    expect(storedPolicy.json()).toMatchObject({
      enabled: true,
      intervalMinutes: 30,
      source: "stored",
      evalInput: {
        minimumPassRate: 1,
        tagMinimumPassRates: {
          "citation-accuracy": 1
        },
        cases: [
          {
            id: "eval.schedule",
            query: "scheduled eval citations"
          }
        ]
      }
    });

    const auditActions = (await authRepository.listAuditEvents()).map((event) => event.action);
    expect(auditActions).toContain("admin.managed_query_eval_schedule_policy.update");
  });

  it("enforces managed query policy for mode selection and citation floor", async () => {
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const managedQueryPolicyRepository = new InMemoryManagedQueryPolicyRepository();
    const capturedRequests: ModelRuntimeRequest[] = [];

    server = buildServer({
      logger: false,
      authRepository,
      retrievalRepository,
      managedQueryPolicyRepository,
      modelRuntime: {
        async generate(input) {
          capturedRequests.push(input);
          return {
            text: "Provider answer should not be called without enough citations."
          };
        }
      }
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const defaultPolicy = await server.inject({
      method: "GET",
      url: "/admin/managed-query-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultPolicy.statusCode).toBe(200);
    expect(defaultPolicy.json()).toMatchObject({
      defaultMode: "deterministic-retrieval",
      allowedModes: ["deterministic-retrieval", "provider-routed"],
      minimumCitationCount: 1,
      requireGrounded: false,
      source: "default"
    });

    const deterministicOnly = await server.inject({
      method: "PUT",
      url: "/admin/managed-query-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        defaultMode: "deterministic-retrieval",
        allowedModes: ["deterministic-retrieval"],
        minimumCitationCount: 1,
        requireGrounded: false
      }
    });

    expect(deterministicOnly.statusCode).toBe(200);
    expect(deterministicOnly.json()).toMatchObject({
      allowedModes: ["deterministic-retrieval"],
      source: "stored"
    });

    const coercedQuery = await server.inject({
      method: "POST",
      url: "/agent/query",
      payload: {
        query: "provider mode should be disabled by policy",
        mode: "provider-routed"
      }
    });

    expect(coercedQuery.statusCode).toBe(200);
    expect(coercedQuery.json()).toMatchObject({
      mode: "deterministic-retrieval",
      generation: {
        status: "not-requested"
      }
    });
    expect(coercedQuery.json().warnings).toEqual(expect.arrayContaining([
      "Managed query mode provider-routed is disabled by tenant policy; using deterministic-retrieval."
    ]));

    const citationFloorPolicy = await server.inject({
      method: "PUT",
      url: "/admin/managed-query-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        defaultMode: "deterministic-retrieval",
        allowedModes: ["deterministic-retrieval", "provider-routed"],
        minimumCitationCount: 2,
        requireGrounded: true
      }
    });

    expect(citationFloorPolicy.statusCode).toBe(200);
    expect(citationFloorPolicy.json()).toMatchObject({
      minimumCitationCount: 2,
      requireGrounded: true
    });

    const skippedProvider = await server.inject({
      method: "POST",
      url: "/agent/query",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        query: "provider mode should require citations",
        mode: "provider-routed",
        provider: "openai"
      }
    });

    expect(skippedProvider.statusCode).toBe(200);
    expect(skippedProvider.json().generation).toMatchObject({
      provider: "openai",
      status: "skipped",
      reason: "tenant_policy_minimum_citations_unmet"
    });
    expect(skippedProvider.json().warnings).toEqual(expect.arrayContaining([
      "Tenant managed-query policy expected at least 2 citation(s); retrieval returned 0.",
      "Tenant managed-query policy requires grounded retrieval context before provider generation."
    ]));
    expect(capturedRequests).toHaveLength(0);
  });

  it("applies admin retrieval ranking policy to permissioned search", async () => {
    const authRepository = new InMemoryAuthRepository();
    const registryRepository = new InMemoryRegistryRepository();
    const rankingPolicyRepository = new InMemoryRetrievalRankingPolicyRepository();
    const retrievalRepository = new InMemoryRetrievalRepository(rankingPolicyRepository);

    server = buildServer({
      logger: false,
      authRepository,
      registryRepository,
      retrievalRepository,
      retrievalRankingPolicyRepository: rankingPolicyRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin-ranking@example.test",
        displayName: "Admin Ranking"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const defaultPolicy = await server.inject({
      method: "GET",
      url: "/admin/retrieval-ranking-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultPolicy.statusCode).toBe(200);
    expect(defaultPolicy.json()).toMatchObject({
      agentInstructionWeight: 1.2,
      assetSummaryWeight: 1.1,
      humanDocumentWeight: 1,
      exactPhraseBoost: 0.25,
      source: "default"
    });

    const storedPolicy = await server.inject({
      method: "PUT",
      url: "/admin/retrieval-ranking-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        agentInstructionWeight: 1,
        assetSummaryWeight: 1,
        humanDocumentWeight: 2,
        exactPhraseBoost: 0
      }
    });

    expect(storedPolicy.statusCode).toBe(200);
    expect(storedPolicy.json()).toMatchObject({
      humanDocumentWeight: 2,
      source: "stored"
    });

    const asset = await registryRepository.createAsset({
      stableId: "guardrail.ranking-policy-api",
      type: "guardrail",
      ownerId: "user_admin",
      title: "Ranking Policy API",
      lifecycleState: "active",
      sensitivity: "internal",
      audience: ["ai-team"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      allowedSurfaces: ["api", "cli", "mcp", "web"],
      instruction: {
        instructionKind: "guardrail",
        body: "rankpolicyapitoken"
      },
      humanDocument: {
        format: "markdown",
        body: "rankpolicyapitoken"
      }
    });
    await retrievalRepository.indexAsset(asset);

    const search = await server.inject({
      method: "GET",
      url: "/search?query=rankpolicyapitoken",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(search.statusCode).toBe(200);
    expect(search.json().results.map((result: { sourceKind: string }) => result.sourceKind)).toEqual([
      "human-document",
      "agent-instruction"
    ]);
    expect(search.json().results[0].ranking.sourceKindWeight).toBe(2);

    const auditEvent = (await authRepository.listAuditEvents())
      .find((event) => event.action === "admin.retrieval_ranking_policy.update");

    expect(auditEvent).toMatchObject({
      outcome: "success",
      metadata: {
        humanDocumentWeight: 2,
        exactPhraseBoost: 0
      }
    });
  });

  it("exposes vector and hybrid retrieval strategies through search", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    server = buildServer({ logger: false, registryRepository, retrievalRepository });
    const asset = await registryRepository.createAsset({
      stableId: "guardrail.vector-search-api",
      type: "guardrail",
      ownerId: "user_admin",
      title: "Vector Search API",
      summary: "Searchable vector strategy guidance for apivectortoken.",
      lifecycleState: "active",
      sensitivity: "public-demo",
      audience: ["ai-team"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
      allowedExports: ["demo-agent-pack"],
      instruction: {
        instructionKind: "guardrail",
        body: "Use the vector retrieval strategy for deterministic embedding smoke tests."
      }
    });
    await retrievalRepository.indexAsset(asset);

    const vectorSearch = await server.inject({
      method: "GET",
      url: "/search?query=apivectortoken&strategy=vector"
    });
    const hybridSearch = await server.inject({
      method: "GET",
      url: "/search?query=apivectortoken&strategy=hybrid"
    });

    expect(vectorSearch.statusCode).toBe(200);
    expect(vectorSearch.json().results[0]).toMatchObject({
      asset: { stableId: "guardrail.vector-search-api" },
      ranking: {
        strategy: "vector-hash-v1",
        vectorSimilarity: expect.any(Number)
      }
    });
    expect(hybridSearch.statusCode).toBe(200);
    expect(hybridSearch.json().results[0].ranking).toMatchObject({
      strategy: "hybrid-hash-lexical-v1",
      vectorWeight: expect.any(Number)
    });
  });

  it("keeps agent action execution disabled by default and gates approved internal actions", async () => {
    const authRepository = new InMemoryAuthRepository();
    const actionExecutionRepository = new InMemoryAgentActionExecutionRepository();

    server = buildServer({
      logger: false,
      authRepository,
      actionExecutionRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const defaultPolicy = await server.inject({
      method: "GET",
      url: "/admin/action-execution-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultPolicy.statusCode).toBe(200);
    expect(defaultPolicy.json()).toMatchObject({
      enabled: false,
      allowedActionTypes: [],
      requireApproval: true,
      dryRunDefault: true,
      killSwitch: false,
      approvalExpiresInMinutes: 1440,
      source: "default"
    });

    const reader = await authRepository.createUser({
      tenantId: "tenant_demo",
      email: "reader@example.test",
      displayName: "Reader",
      role: "reader",
      status: "active"
    });
    const readerKey = await authRepository.createApiKey({
      tenantId: "tenant_demo",
      userId: reader.id,
      name: "reader-key",
      scopes: ["asset:read"]
    });
    const scopeDenied = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${readerKey?.secret}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create review task",
        dryRun: false
      }
    });

    expect(scopeDenied.statusCode).toBe(403);
    expect(scopeDenied.json()).toMatchObject({
      error: "access_denied"
    });
    expect(await actionExecutionRepository.listRequests({ tenantId: "tenant_demo" })).toHaveLength(0);

    const blocked = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create review task",
        dryRun: false
      }
    });

    expect(blocked.statusCode).toBe(201);
    expect(blocked.json()).toMatchObject({
      actionType: "create-task-record",
      status: "blocked",
      dryRun: false,
      reason: "action_execution_disabled",
      result: {
        externalSideEffects: false
      },
      policySnapshot: {
        enabled: false,
        allowedActionTypes: [],
        requireApproval: true,
        dryRunDefault: true,
        killSwitch: false
      }
    });

    const storedPolicy = await server.inject({
      method: "PUT",
      url: "/admin/action-execution-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        allowedActionTypes: ["create-task-record"],
        requireApproval: true,
        dryRunDefault: false,
        killSwitch: false,
        maxRequestsPerHour: 10,
        approvalExpiresInMinutes: 60
      }
    });

    expect(storedPolicy.statusCode).toBe(200);
    expect(storedPolicy.json()).toMatchObject({
      enabled: true,
      allowedActionTypes: ["create-task-record"],
      requireApproval: true,
      dryRunDefault: false,
      killSwitch: false,
      maxRequestsPerHour: 10,
      approvalExpiresInMinutes: 60,
      source: "stored"
    });

    const executor = await authRepository.createUser({
      tenantId: "tenant_demo",
      email: "executor@example.test",
      displayName: "Executor",
      role: "reader",
      status: "active"
    });
    const executorKey = await authRepository.createApiKey({
      tenantId: "tenant_demo",
      userId: executor.id,
      name: "executor-key",
      scopes: ["agent:execute"]
    });
    const scopedPending = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${executorKey?.secret}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create scoped review task",
        dryRun: false
      }
    });

    expect(scopedPending.statusCode).toBe(201);
    expect(scopedPending.json()).toMatchObject({
      actionType: "create-task-record",
      title: "Create scoped review task",
      status: "approval-required",
      dryRun: false,
      reason: "approval_required",
      requestedByUserId: executor.id,
      requestedByApiKeyId: executorKey?.apiKey.id
    });
    expect(Date.parse(scopedPending.json().approvalExpiresAt)).toBeGreaterThan(Date.now());

    const githubToken = `ghp_${"a".repeat(36)}`;
    const pending = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create review task",
        target: "task://review",
        dryRun: false,
        payload: {
          taskSummary: `Review pasted token ${githubToken}`,
          nested: {
            callback: "https://example.test/callback?code=abcdef1234567890"
          }
        },
        metadata: {
          source: "test",
          pastedSecret: githubToken
        }
      }
    });

    expect(pending.statusCode).toBe(201);
    expect(pending.json()).toMatchObject({
      actionType: "create-task-record",
      title: "Create review task",
      target: "task://review",
      status: "approval-required",
      dryRun: false,
      reason: "approval_required",
      payload: {
        taskSummary: "Review pasted token [REDACTED_API_KEY]",
        nested: {
          callback: "https://example.test/callback?code=[REDACTED_URL_SECRET]"
        }
      },
      metadata: {
        source: "test",
        pastedSecret: "[REDACTED_API_KEY]",
        actionRequestRedaction: {
          applied: true,
          redactedStringCount: 3,
          sources: {
            payload: 2,
            metadata: 1
          }
        }
      },
      policySnapshot: {
        approvalExpiresInMinutes: 60
      }
    });
    expect(pending.json().metadata.actionRequestRedaction.findings).toEqual(expect.arrayContaining([
      { kind: "api-key", count: 2 },
      { kind: "url-secret", count: 1 }
    ]));
    expect(JSON.stringify(pending.json())).not.toContain(githubToken);
    expect(JSON.stringify(pending.json())).not.toContain("abcdef1234567890");
    expect(Date.parse(pending.json().approvalExpiresAt)).toBeGreaterThan(Date.now());

    const approve = await server.inject({
      method: "POST",
      url: `/agent/actions/${pending.json().id}/decision`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        decision: "approve",
        reason: "Approved in test"
      }
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      id: pending.json().id,
      status: "executed",
      reason: "Approved in test",
      result: {
        taskRecordCreated: true,
        externalSideEffects: false,
        approvedFromRequestId: pending.json().id
      }
    });
    expect(approve.json().decidedAt).toBeTruthy();
    expect(approve.json().executedAt).toBeTruthy();

    const list = await server.inject({
      method: "GET",
      url: "/agent/actions?limit=5",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().actions.map((action: { id: string }) => action.id)).toEqual(expect.arrayContaining([
      blocked.json().id,
      scopedPending.json().id,
      pending.json().id
    ]));

    const conflict = await server.inject({
      method: "POST",
      url: `/agent/actions/${pending.json().id}/decision`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        decision: "approve"
      }
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: "action_request_not_awaiting_approval",
      status: "executed"
    });

    const auditEvents = await authRepository.listAuditEvents();
    const actionRequestAudit = auditEvents.find((event) =>
      event.action === "agent.action.execute_request" &&
      event.targetId === pending.json().id
    );
    expect(actionRequestAudit?.metadata.actionRequestRedaction).toMatchObject({
      applied: true,
      redactedStringCount: 3,
      sources: {
        payload: 2,
        metadata: 1
      }
    });
    expect(JSON.stringify(actionRequestAudit)).not.toContain(githubToken);
    expect(JSON.stringify(actionRequestAudit)).not.toContain("abcdef1234567890");
    const auditActions = auditEvents.map((event) => event.action);
    expect(auditActions).toEqual(expect.arrayContaining([
      "admin.action_execution_policy.update",
      "agent.action.execute_request",
      "agent.action.decision"
    ]));
  });

  it("expires stale agent action approvals before execution", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-17T00:00:00.000Z"));

    const authRepository = new InMemoryAuthRepository();
    const actionExecutionRepository = new InMemoryAgentActionExecutionRepository();

    server = buildServer({
      logger: false,
      authRepository,
      actionExecutionRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin-expiry@example.test",
        displayName: "Admin Expiry"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const storedPolicy = await server.inject({
      method: "PUT",
      url: "/admin/action-execution-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        allowedActionTypes: ["create-task-record"],
        requireApproval: true,
        dryRunDefault: false,
        killSwitch: false,
        maxRequestsPerHour: 10,
        approvalExpiresInMinutes: 1
      }
    });

    expect(storedPolicy.statusCode).toBe(200);
    expect(storedPolicy.json()).toMatchObject({
      approvalExpiresInMinutes: 1
    });

    const pending = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create expiring review task",
        dryRun: false
      }
    });

    expect(pending.statusCode).toBe(201);
    expect(pending.json()).toMatchObject({
      status: "approval-required",
      reason: "approval_required",
      approvalExpiresAt: "2026-06-17T00:01:00.000Z"
    });

    vi.setSystemTime(new Date("2026-06-17T00:01:01.000Z"));

    const approve = await server.inject({
      method: "POST",
      url: `/agent/actions/${pending.json().id}/decision`,
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        decision: "approve",
        reason: "Approve after expiry"
      }
    });

    expect(approve.statusCode).toBe(409);
    expect(approve.json()).toMatchObject({
      error: "action_request_approval_expired",
      status: "expired",
      approvalExpiresAt: "2026-06-17T00:01:00.000Z",
      action: {
        id: pending.json().id,
        status: "expired",
        reason: "approval_expired",
        result: {
          approved: false,
          expired: true,
          externalSideEffects: false
        },
        metadata: {
          attemptedDecision: "approve",
          approvalExpiresAt: "2026-06-17T00:01:00.000Z"
        }
      }
    });

    const stored = await actionExecutionRepository.getRequest("tenant_demo", pending.json().id);
    expect(stored).toMatchObject({
      status: "expired",
      reason: "approval_expired",
      executedAt: null
    });

    const audit = (await authRepository.listAuditEvents())
      .find((event) => event.reason === "approval_expired");
    expect(audit).toMatchObject({
      action: "agent.action.decision",
      outcome: "denied",
      targetId: pending.json().id,
      metadata: {
        decision: "approve",
        status: "expired",
        approvalExpiresAt: "2026-06-17T00:01:00.000Z",
        externalSideEffects: false
      }
    });
  });

  it("rate-limits scoped agent action requests before storing durable requests", async () => {
    const authRepository = new InMemoryAuthRepository();
    const actionExecutionRepository = new InMemoryAgentActionExecutionRepository();

    server = buildServer({
      logger: false,
      authRepository,
      actionExecutionRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin-rate@example.test",
        displayName: "Admin Rate"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const storedPolicy = await server.inject({
      method: "PUT",
      url: "/admin/action-execution-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        allowedActionTypes: ["create-task-record"],
        requireApproval: true,
        dryRunDefault: false,
        killSwitch: false,
        maxRequestsPerHour: 1
      }
    });

    expect(storedPolicy.statusCode).toBe(200);
    expect(storedPolicy.json()).toMatchObject({
      maxRequestsPerHour: 1
    });

    const first = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create first task",
        idempotencyKey: "rate-limit-idempotent-retry",
        dryRun: false
      }
    });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      idempotencyKey: "rate-limit-idempotent-retry"
    });
    expect(await actionExecutionRepository.listRequests({ tenantId: "tenant_demo" })).toHaveLength(1);

    const replay = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create first task retry",
        idempotencyKey: "rate-limit-idempotent-retry",
        dryRun: false
      }
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      id: first.json().id,
      idempotencyKey: "rate-limit-idempotent-retry"
    });
    expect(await actionExecutionRepository.listRequests({ tenantId: "tenant_demo" })).toHaveLength(1);

    const limited = await server.inject({
      method: "POST",
      url: "/agent/actions/execute",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        actionType: "create-task-record",
        title: "Create second task",
        dryRun: false
      }
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: "action_rate_limit_exceeded",
      maxRequestsPerHour: 1,
      recentRequestCount: 1
    });
    expect(await actionExecutionRepository.listRequests({ tenantId: "tenant_demo" })).toHaveLength(1);

    const replayAudit = (await authRepository.listAuditEvents())
      .find((event) => event.reason === "action_request_idempotent_replay");
    expect(replayAudit).toMatchObject({
      action: "agent.action.execute_request",
      outcome: "success",
      targetId: first.json().id,
      metadata: {
        actionType: "create-task-record",
        idempotencyKeyHash: expect.any(String)
      }
    });

    const auditEvent = (await authRepository.listAuditEvents())
      .find((event) => event.reason === "action_rate_limit_exceeded");
    expect(auditEvent).toMatchObject({
      action: "agent.action.execute_request",
      outcome: "denied",
      metadata: {
        actionType: "create-task-record",
        maxRequestsPerHour: 1,
        recentRequestCount: 1
      }
    });
  });

  it("runs provider-routed managed query with filtered context and deterministic fallback", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const providerConfigRepository = new InMemoryModelProviderConfigRepository();
    const capturedRequests: ModelRuntimeRequest[] = [];
    const previousProviderKey = process.env.FORGETBASE_TEST_PROVIDER_KEY;
    const previousProviderKeyFile = process.env.FORGETBASE_TEST_PROVIDER_KEY_FILE;
    let tempSecretDirectory: string | null = null;
    process.env.FORGETBASE_TEST_PROVIDER_KEY = "placeholder-provider-value";

    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      providerConfigRepository,
      modelRuntime: {
        async generate(input) {
          capturedRequests.push(input);
          return {
            text: "Provider managed answer grounded in public context [playbook.provider-public]",
            usage: {
              inputTokens: 100,
              outputTokens: 25,
              totalTokens: 125
            }
          };
        }
      }
    });

    try {
      const adminBootstrap = await server.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: "admin@example.test",
          displayName: "Admin"
        }
      });
      const adminKey = adminBootstrap.json().secret;

      await providerConfigRepository.upsertProviderConfig({
        provider: "openai",
        enabled: true,
        apiKeyEnvVar: "FORGETBASE_TEST_PROVIDER_KEY",
        defaultModel: "gpt-test",
        availableModels: ["gpt-test"],
        priority: 1,
        metadata: {
          maxOutputTokens: 512,
          temperature: 0.1,
          timeoutMs: 5000,
          inputCostPerMillionTokens: 2,
          outputCostPerMillionTokens: 8
        }
      });

      const readyHealth = await server.inject({
        method: "GET",
        url: "/admin/model-providers/health",
        headers: {
          authorization: `Bearer ${adminKey}`
        }
      });

      expect(readyHealth.statusCode).toBe(200);
      expect(readyHealth.json().providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          provider: "openai",
          status: "ready",
          apiKeyEnvVar: "FORGETBASE_TEST_PROVIDER_KEY",
          apiKeyConfigured: true,
          reasons: []
        }),
        expect.objectContaining({
          provider: "anthropic",
          status: "not-configured",
          apiKeyConfigured: false,
          reasons: ["provider_config_missing"]
        })
      ]));

      await server.inject({
        method: "POST",
        url: "/assets",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          stableId: "playbook.provider-public",
          type: "playbook",
          ownerId: "user_admin",
          title: "Provider Routed Public Playbook",
          summary: "Provider routed guidance for public demo users.",
          lifecycleState: "active",
          sensitivity: "public-demo",
          audience: ["ai-team"],
          status: "approved",
          reviewDueAt: "2027-01-31",
          allowedSurfaces: ["api", "cli", "mcp"],
          instruction: {
            instructionKind: "playbook",
            body: "Provider routed answers must cite public governed context."
          }
        }
      });

      await server.inject({
        method: "POST",
        url: "/assets",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          stableId: "playbook.provider-restricted",
          type: "playbook",
          ownerId: "user_admin",
          title: "Provider Routed Restricted Playbook",
          summary: "Provider routed guidance for restricted teams.",
          lifecycleState: "active",
          sensitivity: "restricted",
          audience: ["security-team"],
          status: "approved",
          reviewDueAt: "2027-01-31",
          allowedSurfaces: ["api", "cli", "mcp"],
          instruction: {
            instructionKind: "playbook",
            body: "Restricted provider routed escalation details."
          }
        }
      });

      const reader = await authRepository.createUser({
        email: "reader@example.test",
        displayName: "Reader",
        role: "reader"
      });
      const readerKey = await authRepository.createApiKey({
        userId: reader.id,
        name: "reader-key",
        scopes: ["asset:read"]
      });

      if (!readerKey) {
        throw new Error("Expected reader API key.");
      }

      const unauthenticated = await server.inject({
        method: "POST",
        url: "/agent/query",
        payload: {
          query: "provider routed citations",
          mode: "provider-routed"
        }
      });

      expect(unauthenticated.statusCode).toBe(401);
      expect(capturedRequests).toHaveLength(0);

      const providerResponse = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider routed citations",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(providerResponse.statusCode).toBe(200);
      expect(providerResponse.json().answer).toBe("Provider managed answer grounded in public context [playbook.provider-public]");
      expect(providerResponse.json().generation).toMatchObject({
        provider: "openai",
        model: "gpt-test",
        status: "completed",
        reason: null,
        attempts: [
          {
            provider: "openai",
            model: "gpt-test",
            status: "completed",
            reason: null,
            latencyMs: expect.any(Number)
          }
        ]
      });
      expect(providerResponse.json().generation.usage).toEqual({
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
        estimatedCostUsd: 0.0004
      });
      expect(providerResponse.json().generation.latencyMs).toEqual(expect.any(Number));
      expect(uniqueStableIds(providerResponse.json().results)).toEqual(["playbook.provider-public"]);
      expect(providerResponse.json().checks.deniedCount).toBeGreaterThan(0);
      expect(capturedRequests[0]).toMatchObject({
        provider: "openai",
        model: "gpt-test",
        apiKey: "placeholder-provider-value",
        baseUrl: "https://api.openai.com/v1",
        metadata: {
          maxOutputTokens: 512,
          temperature: 0.1,
          timeoutMs: 5000,
          inputCostPerMillionTokens: 2,
          outputCostPerMillionTokens: 8
        }
      });
      const providerRuntimeRequest = capturedRequests[0];

      if (!providerRuntimeRequest) {
        throw new Error("Expected provider runtime request.");
      }

      expect(providerRuntimeRequest.prompt).toContain("playbook.provider-public");
      expect(providerRuntimeRequest.prompt).not.toContain("playbook.provider-restricted");

      tempSecretDirectory = await mkdtemp(join(tmpdir(), "forgetbase-provider-secret-"));
      const providerSecretFile = join(tempSecretDirectory, "api-key");
      await writeFile(providerSecretFile, "provider-file-secret\n", "utf8");
      delete process.env.FORGETBASE_TEST_PROVIDER_KEY;
      process.env.FORGETBASE_TEST_PROVIDER_KEY_FILE = providerSecretFile;
      capturedRequests.length = 0;

      const fileHealth = await server.inject({
        method: "GET",
        url: "/admin/model-providers/health",
        headers: {
          authorization: `Bearer ${adminKey}`
        }
      });

      expect(fileHealth.statusCode).toBe(200);
      expect(fileHealth.json().providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          provider: "openai",
          status: "ready",
          apiKeyEnvVar: "FORGETBASE_TEST_PROVIDER_KEY",
          apiKeyConfigured: true,
          reasons: []
        })
      ]));

      const fileSecretResponse = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider routed citations",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(fileSecretResponse.statusCode).toBe(200);
      expect(fileSecretResponse.json().generation.status).toBe("completed");
      expect(capturedRequests[0]?.apiKey).toBe("provider-file-secret");

      process.env.FORGETBASE_TEST_PROVIDER_KEY = "placeholder-provider-value";
      delete process.env.FORGETBASE_TEST_PROVIDER_KEY_FILE;
      capturedRequests.length = 0;

      const generateAudit = (await authRepository.listAuditEvents())
        .find((event) => event.action === "agent.query.generate");
      expect(generateAudit).toMatchObject({
        targetType: "model_provider",
        targetId: "openai",
        outcome: "success",
        metadata: {
          mode: "provider-routed",
          provider: "openai",
          model: "gpt-test",
          generationStatus: "completed",
          resultCount: expect.any(Number),
          usage: {
            inputTokens: 100,
            outputTokens: 25,
            totalTokens: 125,
            estimatedCostUsd: 0.0004
          }
        }
      });

      capturedRequests.length = 0;

      await providerConfigRepository.upsertProviderConfig({
        provider: "openai",
        enabled: true,
        apiKeyEnvVar: "FORGETBASE_TEST_PROVIDER_KEY",
        defaultModel: "gpt-test",
        availableModels: ["gpt-test"],
        priority: 1,
        metadata: {
          maxOutputTokens: 512,
          inputCostPerMillionTokens: 2,
          outputCostPerMillionTokens: 8,
          maxEstimatedTotalTokensPerQuery: 1
        }
      });

      const quotaFallbackResponse = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider routed citations",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(quotaFallbackResponse.statusCode).toBe(200);
      expect(quotaFallbackResponse.json().answer).toContain("Answer from the pages I can access");
      expect(quotaFallbackResponse.json().generation).toMatchObject({
        provider: "openai",
        model: "gpt-test",
        status: "skipped",
        reason: "preflight_total_token_limit_exceeded",
        attempts: [
          {
            provider: "openai",
            model: "gpt-test",
            status: "skipped",
            reason: "preflight_total_token_limit_exceeded",
            latencyMs: null
          }
        ]
      });
      expect(quotaFallbackResponse.json().warnings).toContain(
        "Provider generation skipped (preflight_total_token_limit_exceeded); deterministic fallback returned."
      );
      expect(capturedRequests).toHaveLength(0);

      const quotaAudit = (await authRepository.listAuditEvents())
        .find((event) => event.action === "agent.query.generate" && event.reason === "preflight_total_token_limit_exceeded");
      expect(quotaAudit).toMatchObject({
        targetType: "model_provider",
        targetId: "openai",
        outcome: "error",
        metadata: {
          generationStatus: "skipped",
          preflightEstimate: {
            estimatedInputTokens: expect.any(Number),
            estimatedOutputTokens: 512,
            estimatedTotalTokens: expect.any(Number),
            estimatedCostUsd: expect.any(Number)
          }
        }
      });

      delete process.env.FORGETBASE_TEST_PROVIDER_KEY;

      const fallbackResponse = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider routed citations",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(fallbackResponse.statusCode).toBe(200);
      expect(fallbackResponse.json().answer).toContain("Answer from the pages I can access");
      expect(fallbackResponse.json().generation).toMatchObject({
        provider: "openai",
        model: "gpt-test",
        status: "skipped",
        reason: "api_key_env_var_unset",
        latencyMs: null,
        attempts: [
          {
            provider: "openai",
            model: "gpt-test",
            status: "skipped",
            reason: "api_key_env_var_unset",
            latencyMs: null
          }
        ],
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCostUsd: null
        }
      });
      expect(fallbackResponse.json().warnings).toContain(
        "Provider generation skipped (api_key_env_var_unset); deterministic fallback returned."
      );
      expect(capturedRequests).toHaveLength(0);

      const summary = await server.inject({
        method: "GET",
        url: "/telemetry/summary?limit=50",
        headers: {
          authorization: `Bearer ${adminKey}`
        }
      });

      expect(summary.statusCode).toBe(200);
      expect(summary.json().providerGeneration).toMatchObject({
        eventCount: 4,
        completedCount: 2,
        skippedCount: 2,
        failedCount: 0,
        totalInputTokens: 200,
        totalOutputTokens: 50,
        totalTokens: 250,
        estimatedCostUsd: 0.0008,
        byProvider: [{ key: "openai", count: 4 }],
        byStatus: expect.arrayContaining([
          { key: "completed", count: 2 },
          { key: "skipped", count: 2 }
        ]),
        byReason: expect.arrayContaining([
          { key: "api_key_env_var_unset", count: 1 },
          { key: "preflight_total_token_limit_exceeded", count: 1 }
        ])
      });
    } finally {
      if (tempSecretDirectory) {
        await rm(tempSecretDirectory, { recursive: true, force: true });
      }

      if (previousProviderKey === undefined) {
        delete process.env.FORGETBASE_TEST_PROVIDER_KEY;
      } else {
        process.env.FORGETBASE_TEST_PROVIDER_KEY = previousProviderKey;
      }

      if (previousProviderKeyFile === undefined) {
        delete process.env.FORGETBASE_TEST_PROVIDER_KEY_FILE;
      } else {
        process.env.FORGETBASE_TEST_PROVIDER_KEY_FILE = previousProviderKeyFile;
      }
    }
  });

  it("retries provider-routed managed query generation before deterministic fallback", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const providerConfigRepository = new InMemoryModelProviderConfigRepository();
    const capturedRequests: ModelRuntimeRequest[] = [];
    const previousProviderKey = process.env.FORGETBASE_TEST_RETRY_PROVIDER_KEY;
    process.env.FORGETBASE_TEST_RETRY_PROVIDER_KEY = "placeholder-retry-provider-value";

    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      providerConfigRepository,
      modelRuntime: {
        async generate(input) {
          capturedRequests.push(input);

          if (capturedRequests.length === 1) {
            throw new Error("transient provider failure");
          }

          return {
            text: "Retry provider answer grounded in public context [playbook.provider-retry]",
            usage: {
              inputTokens: 40,
              outputTokens: 10,
              totalTokens: 50
            }
          };
        }
      }
    });

    try {
      const adminBootstrap = await server.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: "admin@example.test",
          displayName: "Admin"
        }
      });
      const adminKey = adminBootstrap.json().secret;

      await providerConfigRepository.upsertProviderConfig({
        provider: "openai",
        enabled: true,
        apiKeyEnvVar: "FORGETBASE_TEST_RETRY_PROVIDER_KEY",
        defaultModel: "retry-model",
        availableModels: ["retry-model"],
        priority: 1,
        metadata: {
          maxOutputTokens: 512,
          maxRetries: 1,
          retryBackoffMs: 0
        }
      });

      await server.inject({
        method: "POST",
        url: "/assets",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          stableId: "playbook.provider-retry",
          type: "playbook",
          ownerId: "user_admin",
          title: "Provider Retry Playbook",
          summary: "Provider retry guidance for public demo users.",
          lifecycleState: "active",
          sensitivity: "public-demo",
          audience: ["ai-team"],
          status: "approved",
          reviewDueAt: "2027-01-31",
          allowedSurfaces: ["api", "cli", "mcp"],
          instruction: {
            instructionKind: "playbook",
            body: "Provider retry answers must cite governed context."
          }
        }
      });

      const reader = await authRepository.createUser({
        email: "reader@example.test",
        displayName: "Reader",
        role: "reader"
      });
      const readerKey = await authRepository.createApiKey({
        userId: reader.id,
        name: "reader-key",
        scopes: ["asset:read"]
      });

      if (!readerKey) {
        throw new Error("Expected reader API key.");
      }

      const response = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider retry citations",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().answer).toBe("Retry provider answer grounded in public context [playbook.provider-retry]");
      expect(response.json().generation).toMatchObject({
        provider: "openai",
        model: "retry-model",
        status: "completed",
        reason: null,
        attempts: [
          {
            provider: "openai",
            model: "retry-model",
            status: "failed",
            reason: "provider_generation_failed",
            latencyMs: expect.any(Number)
          },
          {
            provider: "openai",
            model: "retry-model",
            status: "completed",
            reason: null,
            latencyMs: expect.any(Number)
          }
        ],
        usage: {
          inputTokens: 40,
          outputTokens: 10,
          totalTokens: 50,
          estimatedCostUsd: null
        }
      });
      expect(response.json().generation.latencyMs).toEqual(expect.any(Number));
      expect(capturedRequests).toHaveLength(2);
      expect(capturedRequests[0]).toMatchObject({
        provider: "openai",
        model: "retry-model",
        metadata: {
          maxRetries: 1,
          retryBackoffMs: 0
        }
      });

      const auditEvents = await authRepository.listAuditEvents({ limit: 20 });
      const generationAudit = auditEvents.find((event) => event.action === "agent.query.generate");
      expect(generationAudit?.metadata.attempts).toEqual(response.json().generation.attempts);
    } finally {
      if (previousProviderKey === undefined) {
        delete process.env.FORGETBASE_TEST_RETRY_PROVIDER_KEY;
      } else {
        process.env.FORGETBASE_TEST_RETRY_PROVIDER_KEY = previousProviderKey;
      }
    }
  });

  it("falls back across enabled providers by priority when no provider is requested", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const providerConfigRepository = new InMemoryModelProviderConfigRepository();
    const capturedRequests: ModelRuntimeRequest[] = [];
    const previousPrimaryKey = process.env.FORGETBASE_TEST_PRIMARY_PROVIDER_KEY;
    const previousFallbackKey = process.env.FORGETBASE_TEST_FALLBACK_PROVIDER_KEY;
    delete process.env.FORGETBASE_TEST_PRIMARY_PROVIDER_KEY;
    process.env.FORGETBASE_TEST_FALLBACK_PROVIDER_KEY = "placeholder-fallback-provider-value";

    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      providerConfigRepository,
      modelRuntime: {
        async generate(input) {
          capturedRequests.push(input);

          return {
            text: "Fallback provider answer grounded in public context [playbook.provider-fallback]",
            usage: {
              inputTokens: 80,
              outputTokens: 20,
              totalTokens: 100
            }
          };
        }
      }
    });

    try {
      const adminBootstrap = await server.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: "admin@example.test",
          displayName: "Admin"
        }
      });
      const adminKey = adminBootstrap.json().secret;

      await providerConfigRepository.upsertProviderConfig({
        provider: "openai",
        enabled: true,
        apiKeyEnvVar: "FORGETBASE_TEST_PRIMARY_PROVIDER_KEY",
        defaultModel: "primary-model",
        availableModels: ["primary-model"],
        priority: 1,
        metadata: {
          maxOutputTokens: 512
        }
      });
      await providerConfigRepository.upsertProviderConfig({
        provider: "anthropic",
        enabled: true,
        apiKeyEnvVar: "FORGETBASE_TEST_FALLBACK_PROVIDER_KEY",
        defaultModel: "fallback-model",
        availableModels: ["fallback-model"],
        priority: 2,
        metadata: {
          maxOutputTokens: 512,
          inputCostPerMillionTokens: 3,
          outputCostPerMillionTokens: 15
        }
      });

      await server.inject({
        method: "POST",
        url: "/assets",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          stableId: "playbook.provider-fallback",
          type: "playbook",
          ownerId: "user_admin",
          title: "Provider Fallback Playbook",
          summary: "Provider fallback guidance for public demo users.",
          lifecycleState: "active",
          sensitivity: "public-demo",
          audience: ["ai-team"],
          status: "approved",
          reviewDueAt: "2027-01-31",
          allowedSurfaces: ["api", "cli", "mcp"],
          instruction: {
            instructionKind: "playbook",
            body: "Provider fallback answers must cite governed context."
          }
        }
      });

      const reader = await authRepository.createUser({
        email: "reader@example.test",
        displayName: "Reader",
        role: "reader"
      });
      const readerKey = await authRepository.createApiKey({
        userId: reader.id,
        name: "reader-key",
        scopes: ["asset:read"]
      });

      if (!readerKey) {
        throw new Error("Expected reader API key.");
      }

      const response = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider fallback citations",
          mode: "provider-routed",
          limit: 5
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().answer).toBe("Fallback provider answer grounded in public context [playbook.provider-fallback]");
      expect(response.json().generation).toMatchObject({
        provider: "anthropic",
        model: "fallback-model",
        status: "completed",
        reason: null,
        usage: {
          inputTokens: 80,
          outputTokens: 20,
          totalTokens: 100,
          estimatedCostUsd: 0.00054
        },
        attempts: [
          {
            provider: "openai",
            model: "primary-model",
            status: "skipped",
            reason: "api_key_env_var_unset",
            latencyMs: null
          },
          {
            provider: "anthropic",
            model: "fallback-model",
            status: "completed",
            reason: null,
            latencyMs: expect.any(Number)
          }
        ]
      });
      expect(response.json().warnings).toContain(
        "Provider attempt openai skipped (api_key_env_var_unset); trying next provider."
      );
      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0]).toMatchObject({
        provider: "anthropic",
        model: "fallback-model",
        apiKey: "placeholder-fallback-provider-value",
        metadata: {
          maxOutputTokens: 512,
          inputCostPerMillionTokens: 3,
          outputCostPerMillionTokens: 15
        }
      });
      expect(capturedRequests[0]?.prompt).toContain("playbook.provider-fallback");

      const generateAudit = (await authRepository.listAuditEvents())
        .find((event) => event.action === "agent.query.generate");
      expect(generateAudit).toMatchObject({
        targetType: "model_provider",
        targetId: "anthropic",
        outcome: "success",
        metadata: {
          provider: "anthropic",
          generationStatus: "completed",
          attempts: [
            {
              provider: "openai",
              model: "primary-model",
              status: "skipped",
              reason: "api_key_env_var_unset",
              latencyMs: null
            },
            {
              provider: "anthropic",
              model: "fallback-model",
              status: "completed",
              reason: null,
              latencyMs: expect.any(Number)
            }
          ]
        }
      });
    } finally {
      if (previousPrimaryKey === undefined) {
        delete process.env.FORGETBASE_TEST_PRIMARY_PROVIDER_KEY;
      } else {
        process.env.FORGETBASE_TEST_PRIMARY_PROVIDER_KEY = previousPrimaryKey;
      }

      if (previousFallbackKey === undefined) {
        delete process.env.FORGETBASE_TEST_FALLBACK_PROVIDER_KEY;
      } else {
        process.env.FORGETBASE_TEST_FALLBACK_PROVIDER_KEY = previousFallbackKey;
      }
    }
  });

  it("caches provider-routed managed query responses after fresh permissioned retrieval", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const cacheRepository = new InMemoryManagedQueryCacheRepository();
    const cachePolicyRepository = new InMemoryManagedQueryCachePolicyRepository();
    const managedQueryRetentionPolicyRepository = new InMemoryManagedQueryRetentionPolicyRepository();
    const providerConfigRepository = new InMemoryModelProviderConfigRepository();
    const capturedRequests: ModelRuntimeRequest[] = [];
    const previousProviderKey = process.env.FORGETBASE_TEST_CACHE_PROVIDER_KEY;
    process.env.FORGETBASE_TEST_CACHE_PROVIDER_KEY = "placeholder-cache-provider-value";

    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      cacheRepository,
      cachePolicyRepository,
      managedQueryRetentionPolicyRepository,
      providerConfigRepository,
      modelRuntime: {
        async generate(input) {
          capturedRequests.push(input);
          return {
            text: "Cached provider answer grounded in public context [playbook.provider-cache]",
            usage: {
              inputTokens: 50,
              outputTokens: 10,
              totalTokens: 60
            }
          };
        }
      }
    });

    try {
      const adminBootstrap = await server.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: "admin@example.test",
          displayName: "Admin"
        }
      });
      const adminKey = adminBootstrap.json().secret;
      const defaultPolicy = await server.inject({
        method: "GET",
        url: "/admin/managed-query-cache/policy",
        headers: {
          authorization: `Bearer ${adminKey}`
        }
      });

      expect(defaultPolicy.statusCode).toBe(200);
      expect(defaultPolicy.json()).toMatchObject({
        cacheEnabled: true,
        maxCacheTtlSeconds: 3600,
        source: "default"
      });
      const savedPolicy = await server.inject({
        method: "PUT",
        url: "/admin/managed-query-cache/policy",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          cacheEnabled: true,
          maxCacheTtlSeconds: 5
        }
      });

      expect(savedPolicy.statusCode).toBe(200);
      expect(savedPolicy.json()).toMatchObject({
        cacheEnabled: true,
        maxCacheTtlSeconds: 5,
        source: "stored"
      });
      const defaultRetentionPolicy = await server.inject({
        method: "GET",
        url: "/admin/managed-query-retention/policy",
        headers: {
          authorization: `Bearer ${adminKey}`
        }
      });

      expect(defaultRetentionPolicy.statusCode).toBe(200);
      expect(defaultRetentionPolicy.json()).toMatchObject({
        promptCaptureMode: "disabled",
        responseCaptureMode: "disabled",
        metadataRetentionDays: 30,
        source: "default"
      });

      const savedRetentionPolicy = await server.inject({
        method: "PUT",
        url: "/admin/managed-query-retention/policy",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          promptCaptureMode: "metadata-only",
          responseCaptureMode: "metadata-only",
          metadataRetentionDays: null
        }
      });

      expect(savedRetentionPolicy.statusCode).toBe(200);
      expect(savedRetentionPolicy.json()).toMatchObject({
        promptCaptureMode: "metadata-only",
        responseCaptureMode: "metadata-only",
        metadataRetentionDays: null,
        source: "stored"
      });

      await providerConfigRepository.upsertProviderConfig({
        provider: "openai",
        enabled: true,
        apiKeyEnvVar: "FORGETBASE_TEST_CACHE_PROVIDER_KEY",
        defaultModel: "gpt-cache-test",
        availableModels: ["gpt-cache-test"],
        priority: 1,
        metadata: {
          cacheTtlSeconds: 60
        }
      });

      await server.inject({
        method: "POST",
        url: "/assets",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          stableId: "playbook.provider-cache",
          type: "playbook",
          ownerId: "user_admin",
          title: "Provider Cache Playbook",
          summary: "Provider cache guidance for public demo users.",
          lifecycleState: "active",
          sensitivity: "public-demo",
          audience: ["ai-team"],
          status: "approved",
          reviewDueAt: "2027-01-31",
          allowedSurfaces: ["api", "cli", "mcp"],
          instruction: {
            instructionKind: "playbook",
            body: "Provider cache answers must cite governed context."
          }
        }
      });

      const reader = await authRepository.createUser({
        email: "reader@example.test",
        displayName: "Reader",
        role: "reader"
      });
      const readerKey = await authRepository.createApiKey({
        userId: reader.id,
        name: "reader-key",
        scopes: ["asset:read"]
      });

      if (!readerKey) {
        throw new Error("Expected reader API key.");
      }

      const beforeFirstQuery = Date.now();
      const first = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider cache citations",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });
      const second = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider cache citations",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(capturedRequests).toHaveLength(1);
      expect(first.json().cache).toMatchObject({
        status: "stored",
        hit: false,
        cacheKey: expect.any(String),
        expiresAt: expect.any(String),
        reason: null
      });
      expect(Date.parse(first.json().cache.expiresAt) - beforeFirstQuery).toBeLessThanOrEqual(7000);
      expect(Date.parse(first.json().cache.expiresAt) - beforeFirstQuery).toBeGreaterThan(0);
      expect(second.json().answer).toBe(first.json().answer);
      expect(second.json().cache).toMatchObject({
        status: "hit",
        hit: true,
        cacheKey: first.json().cache.cacheKey,
        expiresAt: expect.any(String),
        reason: null
      });
      expect(second.json().generation).toMatchObject({
        provider: "openai",
        model: "gpt-cache-test",
        status: "completed",
        reason: "cache_hit",
        latencyMs: 0,
        usage: {
          inputTokens: 50,
          outputTokens: 10,
          totalTokens: 60,
          estimatedCostUsd: null
        },
        attempts: [
          {
            provider: "openai",
            model: "gpt-cache-test",
            status: "completed",
            reason: "cache_hit",
            latencyMs: 0
          }
        ]
      });

      const cacheList = await server.inject({
        method: "GET",
        url: "/admin/managed-query-cache?limit=5",
        headers: {
          authorization: `Bearer ${adminKey}`
        }
      });

      expect(cacheList.statusCode).toBe(200);
      expect(cacheList.json().entries[0]).toMatchObject({
        cacheKey: first.json().cache.cacheKey,
        provider: "openai",
        model: "gpt-cache-test",
        hitCount: 1
      });
	      expect(cacheList.json().entries[0].answer).toBeUndefined();

	      const updateAsset = await server.inject({
	        method: "POST",
	        url: "/assets/playbook.provider-cache/versions",
	        headers: {
	          authorization: `Bearer ${adminKey}`
	        },
	        payload: {
	          instruction: {
	            instructionKind: "playbook",
	            body: "Provider cache answers must cite refreshed governed context."
	          },
	          changeNote: "Refresh provider cache source"
	        }
	      });

	      expect(updateAsset.statusCode).toBe(200);
	      expect(await cacheRepository.listEntries()).toHaveLength(0);
	      expect((await authRepository.listAuditEvents()).some((event) =>
	        event.action === "asset.update" &&
	        event.metadata.managedQueryCacheInvalidatedCount === 1
	      )).toBe(true);

	      const refreshed = await server.inject({
	        method: "POST",
	        url: "/agent/query",
	        headers: {
	          authorization: `Bearer ${readerKey.secret}`
	        },
	        payload: {
	          query: "provider cache citations",
	          mode: "provider-routed",
	          provider: "openai",
	          limit: 5
	        }
	      });

	      expect(refreshed.statusCode).toBe(200);
	      expect(capturedRequests).toHaveLength(2);
	      expect(refreshed.json().cache).toMatchObject({
	        status: "stored",
	        hit: false,
	        cacheKey: expect.any(String)
	      });
	      expect(refreshed.json().cache.cacheKey).not.toBe(first.json().cache.cacheKey);

	      const deleteEntry = await server.inject({
	        method: "DELETE",
	        url: `/admin/managed-query-cache/${encodeURIComponent(refreshed.json().cache.cacheKey)}`,
	        headers: {
	          authorization: `Bearer ${adminKey}`
	        }
	      });

	      expect(deleteEntry.statusCode).toBe(200);
	      expect(deleteEntry.json()).toMatchObject({
	        cacheKey: refreshed.json().cache.cacheKey,
	        provider: "openai",
	        model: "gpt-cache-test",
	        hitCount: 0
	      });
	      expect(deleteEntry.json().answer).toBeUndefined();
	      expect(await cacheRepository.listEntries()).toHaveLength(0);

	      const missingDelete = await server.inject({
	        method: "DELETE",
	        url: `/admin/managed-query-cache/${encodeURIComponent(refreshed.json().cache.cacheKey)}`,
	        headers: {
	          authorization: `Bearer ${adminKey}`
        }
      });

      expect(missingDelete.statusCode).toBe(404);
      expect(missingDelete.json().error).toBe("managed_query_cache_entry_not_found");

      const disabledPolicy = await server.inject({
        method: "PUT",
        url: "/admin/managed-query-cache/policy",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          cacheEnabled: false
        }
      });

      expect(disabledPolicy.statusCode).toBe(200);
      expect(disabledPolicy.json()).toMatchObject({
        cacheEnabled: false,
        maxCacheTtlSeconds: 5,
        source: "stored"
      });

      const third = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider cache governed context",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(third.statusCode).toBe(200);
      expect(third.json().cache).toMatchObject({
        status: "disabled",
        hit: false,
        reason: "tenant_cache_disabled"
      });
	      expect(capturedRequests).toHaveLength(3);
      expect(await cacheRepository.listEntries()).toHaveLength(0);
      expect((await authRepository.listAuditEvents()).some((event) =>
        event.action === "admin.managed_query_cache_policy.update" &&
        event.metadata.cacheEnabled === false
      )).toBe(true);
      expect((await authRepository.listAuditEvents()).some((event) =>
        event.action === "admin.managed_query_retention_policy.update" &&
        event.metadata.promptCaptureMode === "metadata-only" &&
        event.metadata.responseCaptureMode === "metadata-only"
      )).toBe(true);
      expect((await authRepository.listAuditEvents()).some((event) =>
	        event.action === "admin.managed_query_cache.delete" &&
	        event.targetId === refreshed.json().cache.cacheKey
	      )).toBe(true);
      const generationEvents = (await authRepository.listAuditEvents({ limit: 50 })).filter((event) =>
        event.action === "agent.query.generate"
      );
      const generationMetadata = JSON.stringify(generationEvents.map((event) => event.metadata));
      const retentionMetadata = generationEvents
        .map((event) => event.metadata.retention)
        .filter((retention): retention is Record<string, unknown> =>
          Boolean(retention && typeof retention === "object" && !Array.isArray(retention))
        );

	      expect(retentionMetadata).toHaveLength(4);
      expect(retentionMetadata.every((retention) =>
        retention.promptCaptureMode === "metadata-only" &&
        retention.responseCaptureMode === "metadata-only" &&
        retention.rawPromptStored === false &&
        retention.rawResponseStored === false &&
        typeof retention.promptHash === "string" &&
        typeof retention.responseHash === "string"
      )).toBe(true);
      expect(generationMetadata).not.toContain("Cached provider answer");
      expect(generationMetadata).not.toContain("Provider cache answers must cite governed context.");

      const purgePreview = await server.inject({
        method: "POST",
        url: "/admin/managed-query-cache/purge",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          dryRun: true
        }
      });

      expect(purgePreview.statusCode).toBe(200);
      expect(purgePreview.json()).toMatchObject({
        dryRun: true,
        deletedCount: 0
      });

      const summary = await server.inject({
        method: "GET",
        url: "/telemetry/summary?limit=50",
        headers: {
          authorization: `Bearer ${adminKey}`
        }
      });

	      expect(summary.statusCode).toBe(200);
	      expect(summary.json().providerGeneration).toMatchObject({
	        eventCount: 4,
	        completedCount: 4,
	        cacheHitCount: 1,
	        byCacheStatus: expect.arrayContaining([
	          { key: "disabled", count: 1 },
	          { key: "hit", count: 1 },
	          { key: "stored", count: 2 }
	        ]),
        byReason: expect.arrayContaining([
          { key: "cache_hit", count: 1 }
        ])
      });
    } finally {
      if (previousProviderKey === undefined) {
        delete process.env.FORGETBASE_TEST_CACHE_PROVIDER_KEY;
      } else {
        process.env.FORGETBASE_TEST_CACHE_PROVIDER_KEY = previousProviderKey;
      }
    }
  });

  it("uses PII redaction policy for provider cache bypass decisions", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const cacheRepository = new InMemoryManagedQueryCacheRepository();
    const cachePolicyRepository = new InMemoryManagedQueryCachePolicyRepository();
    const providerConfigRepository = new InMemoryModelProviderConfigRepository();
    const piiRedactionPolicyRepository = new InMemoryPiiRedactionPolicyRepository();
    const previousProviderKey = process.env.FORGETBASE_TEST_PII_CACHE_PROVIDER_KEY;
    process.env.FORGETBASE_TEST_PII_CACHE_PROVIDER_KEY = "placeholder-pii-cache-provider-value";

    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      cacheRepository,
      cachePolicyRepository,
      providerConfigRepository,
      piiRedactionPolicyRepository,
      modelRuntime: {
        async generate() {
          return {
            text: "Provider cache answer grounded in PII cache context [playbook.pii-cache]",
            usage: {
              inputTokens: 40,
              outputTokens: 10,
              totalTokens: 50
            }
          };
        }
      }
    });

    try {
      const adminBootstrap = await server.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: "admin@example.test",
          displayName: "Admin"
        }
      });
      const adminKey = adminBootstrap.json().secret;

      await providerConfigRepository.upsertProviderConfig({
        provider: "openai",
        enabled: true,
        apiKeyEnvVar: "FORGETBASE_TEST_PII_CACHE_PROVIDER_KEY",
        defaultModel: "gpt-cache-test",
        availableModels: ["gpt-cache-test"],
        priority: 1
      });

      await server.inject({
        method: "POST",
        url: "/assets",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          stableId: "playbook.pii-cache",
          type: "playbook",
          ownerId: "user_admin",
          title: "PII Cache Playbook",
          summary: "Provider cache guidance for public demo users.",
          lifecycleState: "active",
          sensitivity: "public-demo",
          audience: ["ai-team"],
          status: "approved",
          reviewDueAt: "2027-01-31",
          allowedSurfaces: ["api", "cli", "mcp"],
          instruction: {
            instructionKind: "playbook",
            body: "Provider cache answers must avoid direct identifier cache keys."
          }
        }
      });

      const reader = await authRepository.createUser({
        email: "reader@example.test",
        displayName: "Reader",
        role: "reader"
      });
      const readerKey = await authRepository.createApiKey({
        userId: reader.id,
        name: "reader-key",
        scopes: ["asset:read"]
      });

      if (!readerKey) {
        throw new Error("Expected reader API key.");
      }

      const redactedQuery = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider cache for jane@example.test",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(redactedQuery.statusCode).toBe(200);
      expect(redactedQuery.json().cache).toMatchObject({
        status: "bypass",
        hit: false,
        reason: "query_redacted"
      });
      expect(await cacheRepository.listEntries()).toHaveLength(0);

      const disabledPolicy = await server.inject({
        method: "PUT",
        url: "/admin/pii-redaction-policy",
        headers: {
          authorization: `Bearer ${adminKey}`
        },
        payload: {
          redactionEnabled: false
        }
      });

      expect(disabledPolicy.statusCode).toBe(200);
      expect(disabledPolicy.json()).toMatchObject({
        redactionEnabled: false,
        source: "stored"
      });

      const unredactedQuery = await server.inject({
        method: "POST",
        url: "/agent/query",
        headers: {
          authorization: `Bearer ${readerKey.secret}`
        },
        payload: {
          query: "provider cache for jane@example.test",
          mode: "provider-routed",
          provider: "openai",
          limit: 5
        }
      });

      expect(unredactedQuery.statusCode).toBe(200);
      expect(unredactedQuery.json().cache).toMatchObject({
        status: "stored",
        hit: false,
        reason: null
      });
      expect(await cacheRepository.listEntries()).toHaveLength(1);
    } finally {
      if (previousProviderKey === undefined) {
        delete process.env.FORGETBASE_TEST_PII_CACHE_PROVIDER_KEY;
      } else {
        process.env.FORGETBASE_TEST_PII_CACHE_PROVIDER_KEY = previousProviderKey;
      }
    }
  });

  it("lets admins configure provider stubs without storing secrets", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const providerConfigRepository = new InMemoryModelProviderConfigRepository();
    const secretReferencePolicyRepository = new InMemorySecretReferencePolicyRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      providerConfigRepository,
      secretReferencePolicyRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const unauthenticatedList = await server.inject({
      method: "GET",
      url: "/admin/model-providers"
    });

    expect(unauthenticatedList.statusCode).toBe(401);

    const unauthenticatedHealth = await server.inject({
      method: "GET",
      url: "/admin/model-providers/health"
    });

    expect(unauthenticatedHealth.statusCode).toBe(401);

    const defaultSecretPolicy = await server.inject({
      method: "GET",
      url: "/admin/secret-reference-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(defaultSecretPolicy.statusCode).toBe(200);
    expect(defaultSecretPolicy.json()).toMatchObject({
      allowedEnvVarPrefixes: expect.arrayContaining(["OPENAI_", "ENTRA_"]),
      allowedEnvVars: [],
      allowUnlistedEnvVars: false,
      source: "default"
    });

    const blockedSecretReference = await server.inject({
      method: "PUT",
      url: "/admin/model-providers/openai",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        apiKeyEnvVar: "PATH"
      }
    });

    expect(blockedSecretReference.statusCode).toBe(400);
    expect(blockedSecretReference.json().error).toBe("secret_reference_rejected");

    const secretMetadata = await server.inject({
      method: "PUT",
      url: "/admin/model-providers/openai",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        metadata: {
          apiKey: "do-not-store"
        }
      }
    });

    expect(secretMetadata.statusCode).toBe(400);
    expect(secretMetadata.json().error).toBe("secret_metadata_rejected");

    const storedSecretPolicy = await server.inject({
      method: "PUT",
      url: "/admin/secret-reference-policy",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        allowedEnvVarPrefixes: ["CUSTOM_"],
        allowedEnvVars: ["OPENAI_API_KEY"],
        allowUnlistedEnvVars: false
      }
    });

    expect(storedSecretPolicy.statusCode).toBe(200);
    expect(storedSecretPolicy.json()).toMatchObject({
      allowedEnvVarPrefixes: ["CUSTOM_"],
      allowedEnvVars: ["OPENAI_API_KEY"],
      allowUnlistedEnvVars: false,
      source: "stored"
    });

    const upsert = await server.inject({
      method: "PUT",
      url: "/admin/model-providers/openai",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        displayName: "OpenAI",
        apiKeyEnvVar: "OPENAI_API_KEY",
        defaultModel: "gpt-5.1",
        availableModels: ["gpt-5.1"],
        priority: 10,
        metadata: {
          routingTier: "primary",
          maxOutputTokens: 700,
          inputCostPerMillionTokens: 2,
          outputCostPerMillionTokens: 8,
          maxEstimatedInputTokensPerQuery: 2000,
          maxEstimatedTotalTokensPerQuery: 3000,
          maxEstimatedCostUsdPerQuery: 0.05
        }
      }
    });

    expect(upsert.statusCode).toBe(200);
    expect(upsert.json()).toMatchObject({
      provider: "openai",
      enabled: true,
      apiKeyEnvVar: "OPENAI_API_KEY",
      defaultModel: "gpt-5.1",
      metadata: {
        routingTier: "primary",
        maxOutputTokens: 700,
        inputCostPerMillionTokens: 2,
        outputCostPerMillionTokens: 8,
        maxEstimatedInputTokensPerQuery: 2000,
        maxEstimatedTotalTokensPerQuery: 3000,
        maxEstimatedCostUsdPerQuery: 0.05
      }
    });
    expect(upsert.json()).not.toHaveProperty("apiKey");

    const list = await server.inject({
      method: "GET",
      url: "/admin/model-providers",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().providers[0].provider).toBe("openai");

    const health = await server.inject({
      method: "GET",
      url: "/admin/model-providers/health",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(health.statusCode).toBe(200);
    expect(health.json().providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "openai",
        status: "not-ready",
        apiKeyConfigured: false,
        reasons: ["api_key_env_var_unset"]
      })
    ]));
    expect((await authRepository.listAuditEvents()).some((event) =>
      event.action === "admin.secret_reference_policy.update"
    )).toBe(true);
    expect((await authRepository.listAuditEvents()).some((event) =>
      event.action === "admin.model_provider_config.upsert"
    )).toBe(true);
  });

  it("lets admins configure external auth provider stubs without storing client secrets", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const authProviderConfigRepository = new InMemoryAuthProviderConfigRepository();
    const secretReferencePolicyRepository = new InMemorySecretReferencePolicyRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      authProviderConfigRepository,
      secretReferencePolicyRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    const unauthenticatedList = await server.inject({
      method: "GET",
      url: "/admin/auth-providers"
    });

    expect(unauthenticatedList.statusCode).toBe(401);

    const blockedSecretReference = await server.inject({
      method: "PUT",
      url: "/admin/auth-providers/microsoft-entra",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        issuerUrl: "https://login.microsoftonline.com/common/v2.0",
        clientId: "forgetbase",
        clientSecretEnvVar: "PATH"
      }
    });

    expect(blockedSecretReference.statusCode).toBe(400);
    expect(blockedSecretReference.json().error).toBe("secret_reference_rejected");

    const secretMetadata = await server.inject({
      method: "PUT",
      url: "/admin/auth-providers/microsoft-entra",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        issuerUrl: "https://login.microsoftonline.com/common/v2.0",
        clientId: "forgetbase",
        metadata: {
          clientSecret: "do-not-store"
        }
      }
    });

    expect(secretMetadata.statusCode).toBe(400);
    expect(secretMetadata.json().error).toBe("secret_metadata_rejected");

    const upsert = await server.inject({
      method: "PUT",
      url: "/admin/auth-providers/microsoft-entra",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        enabled: true,
        displayName: "Microsoft Entra ID",
        issuerUrl: "https://login.microsoftonline.com/common/v2.0",
        clientId: "forgetbase",
        clientSecretEnvVar: "ENTRA_CLIENT_SECRET",
        redirectUri: "http://localhost:3000/auth/oidc/callback",
        groupClaim: "groups",
        autoProvisionUsers: true,
        groupSyncEnabled: true,
        allowedDomains: ["example.com"],
        priority: 10,
        metadata: {
          directoryTenant: "common"
        }
      }
    });

    expect(upsert.statusCode).toBe(200);
    expect(upsert.json()).toMatchObject({
      provider: "microsoft-entra",
      enabled: true,
	      clientSecretEnvVar: "ENTRA_CLIENT_SECRET",
	      defaultRole: "reader",
	      accountLinkingMode: "verified-email",
	      groupSyncEnabled: true
	    });
    expect(upsert.json()).not.toHaveProperty("clientSecret");

    const list = await server.inject({
      method: "GET",
      url: "/admin/auth-providers",
      headers: {
        authorization: `Bearer ${adminKey}`
      }
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().authProviders[0].provider).toBe("microsoft-entra");
    expect((await authRepository.listAuditEvents()).some((event) =>
      event.action === "admin.auth_provider_config.upsert"
    )).toBe(true);
  });

  it("runs OIDC authorization-code login with signed state and auto-provisioned local users", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const feedbackRepository = new InMemoryManagedQueryFeedbackRepository();
    const authProviderConfigRepository = new InMemoryAuthProviderConfigRepository();
    let expectedNonce = "";
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      authProviderConfigRepository,
      loginSessionMaxAgeSeconds: 60,
      oidcStateSecret: "test-oidc-state-secret",
      oidcRuntime: {
        async discover() {
          return {
            issuer: "https://idp.example.test",
            authorizationEndpoint: "https://idp.example.test/authorize",
            tokenEndpoint: "https://idp.example.test/token",
            jwksUri: "https://idp.example.test/jwks"
          };
        },
        async exchangeCode(input) {
          expect(input.code).toBe("auth-code");
          expect(input.codeVerifier).toHaveLength(86);
          return { idToken: "id-token" };
        },
        async verifyIdToken() {
          return {
            iss: "https://idp.example.test",
            aud: "forgetbase",
            sub: "external-subject-1",
	            email: "reader@example.com",
	            name: "Reader Example",
	            role: "maintainer",
	            email_verified: true,
	            groups: ["engineering-readers", "ops-reviewers"],
	            nonce: expectedNonce
	          };
        }
      }
    });

    await authProviderConfigRepository.upsertAuthProviderConfig({
      tenantId: "tenant_oidc",
      provider: "oidc",
      enabled: true,
      issuerUrl: "https://idp.example.test",
      clientId: "forgetbase",
	      redirectUri: "http://localhost:5175/oidc/callback",
	      roleClaim: "role",
	      groupClaim: "groups",
	      autoProvisionUsers: true,
	      groupSyncEnabled: true,
	      allowedDomains: ["example.com"]
	    });

    const authorize = await server.inject({
      method: "POST",
      url: "/auth/oidc/authorize",
      payload: {
        tenantId: "tenant_oidc",
        provider: "oidc"
      }
    });

    expect(authorize.statusCode).toBe(200);
    expect(authorize.json().authorizationUrl).toContain("code_challenge_method=S256");
    expectedNonce = authorize.json().nonce;

    const beforeCallback = Date.now();
    const callback = await server.inject({
      method: "POST",
      url: "/auth/oidc/callback",
      headers: {
        "user-agent": "ForgetBaseOIDCTest/1.0"
      },
      payload: {
        tenantId: "tenant_oidc",
        provider: "oidc",
        code: "auth-code",
        state: authorize.json().state,
        nonce: authorize.json().nonce,
        codeVerifier: authorize.json().codeVerifier,
        deviceLabel: "OIDC work browser",
        expiresInSeconds: 60 * 60 * 24 * 30
      }
    });

    expect(callback.statusCode).toBe(201);
    expect(callback.json().user).toMatchObject({
      email: "reader@example.com",
      displayName: "Reader Example",
	      role: "maintainer",
	      authProvider: "oidc",
	      externalProvider: "oidc",
	      externalIssuer: "https://idp.example.test",
	      externalSubject: "external-subject-1"
	    });
	    expect(callback.json().secret).toMatch(/^fbase_/);
	    expect(callback.json().apiKey).toMatchObject({
	      scopes: ["asset:read", "asset:write"],
	      allowedSurfaces: ["api", "cli", "mcp", "web", "export"]
	    });
	    expect(Date.parse(callback.json().apiKey.expiresAt) - beforeCallback).toBeLessThanOrEqual(65_000);
	    const oidcSessionCookie = findSetCookie(callback.headers["set-cookie"], "forgetbase_session");
	    const oidcCsrfCookie = findSetCookie(callback.headers["set-cookie"], "forgetbase_csrf");
	    const oidcRefreshCookie = findSetCookie(callback.headers["set-cookie"], "forgetbase_refresh");
	    expect(readCookieMaxAge(oidcSessionCookie)).toBeLessThanOrEqual(60);
	    expect(readCookieMaxAge(oidcCsrfCookie)).toBeLessThanOrEqual(60);
	    expect(oidcRefreshCookie).toContain("HttpOnly");
	    expect(oidcRefreshCookie).toContain("SameSite=Lax");
	    expect(readCookieMaxAge(oidcRefreshCookie)).toBeGreaterThan(0);
	    expect((await authRepository.listLoginSessions({ tenantId: "tenant_oidc", userId: callback.json().user.id }))[0])
	      .toMatchObject({
	        source: "oidc",
	        deviceLabel: "OIDC work browser",
	        clientUserAgent: "ForgetBaseOIDCTest/1.0"
	      });

	    const syncedGroups = await authRepository.listGroups({ tenantId: "tenant_oidc" });
	    const engineeringGroup = syncedGroups.find((group) => group.externalId === "engineering-readers");

	    expect(syncedGroups.map((group) => group.externalId).sort()).toEqual(["engineering-readers", "ops-reviewers"]);
	    expect(engineeringGroup?.externalProvider).toBe("oidc");

	    const me = await server.inject({
	      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: `Bearer ${callback.json().secret}`
      }
    });

    expect(me.statusCode).toBe(200);
	    expect(me.json()).toMatchObject({
	      email: "reader@example.com",
	      role: "maintainer"
	    });
	    expect(me.json().groupIds.sort()).toEqual(syncedGroups.map((group) => group.id).sort());

	    const restrictedAsset = await registryRepository.createAsset({
	      tenantId: "tenant_oidc",
	      stableId: "guardrail.oidc-group-restricted",
	      type: "guardrail",
	      ownerId: "user_admin",
	      title: "OIDC Group Restricted Guardrail",
	      lifecycleState: "active",
	      sensitivity: "restricted",
	      audience: ["ai-team"],
	      status: "approved",
	      reviewDueAt: "2027-01-31",
	      allowedSurfaces: ["api"],
	      instruction: {
	        instructionKind: "guardrail",
	        body: "Only synced OIDC group members can read this instruction."
	      }
	    });
	    await authRepository.createPermissionGrant({
	      tenantId: "tenant_oidc",
	      stableId: restrictedAsset.asset.stableId,
	      principalType: "group",
	      principalId: engineeringGroup?.id ?? "",
	      action: "read",
	      surfaces: ["api"]
	    });
	    const groupAllowed = await server.inject({
	      method: "GET",
	      url: `/assets/${restrictedAsset.asset.stableId}`,
	      headers: {
	        authorization: `Bearer ${callback.json().secret}`
	      }
	    });

	    expect(groupAllowed.statusCode).toBe(200);
	    const oidcLoginAudit = (await authRepository.listAuditEvents({ tenantId: "tenant_oidc" }))
	      .find((event) => event.action === "auth.login.oidc");
	    expect(oidcLoginAudit).toMatchObject({
	      actorUserId: callback.json().user.id,
	      actorApiKeyId: callback.json().apiKey.id,
	      outcome: "success",
	      metadata: expect.objectContaining({
	        provider: "oidc",
	        issuer: "https://idp.example.test",
	        subject: "external-subject-1",
	        apiKeyId: callback.json().apiKey.id,
	        sessionId: expect.any(String),
	        sessionIdleTimeoutSeconds: 60 * 60 * 4,
	        accountLinkingOutcome: "provisioned_external_user"
	      })
	    });

	    const refreshed = await server.inject({
	      method: "POST",
	      url: "/auth/session/refresh",
	      headers: { cookie: readCookiePair(oidcRefreshCookie) }
	    });
	    const reusedRefresh = await server.inject({
	      method: "POST",
	      url: "/auth/session/refresh",
	      headers: { cookie: readCookiePair(oidcRefreshCookie) }
	    });

	    expect(refreshed.statusCode).toBe(200);
	    expect(refreshed.json().session.source).toBe("oidc");
	    expect(reusedRefresh.statusCode).toBe(401);
  });

	  it("rejects OIDC callback inputs that do not match the signed state", async () => {
	    const authProviderConfigRepository = new InMemoryAuthProviderConfigRepository();
    server = buildServer({
      logger: false,
      registryRepository: new InMemoryRegistryRepository(),
      authRepository: new InMemoryAuthRepository(),
      retrievalRepository: new InMemoryRetrievalRepository(),
      feedbackRepository: new InMemoryManagedQueryFeedbackRepository(),
      authProviderConfigRepository,
      oidcStateSecret: "test-oidc-state-secret",
      oidcRuntime: {
        async discover() {
          return {
            issuer: "https://idp.example.test",
            authorizationEndpoint: "https://idp.example.test/authorize",
            tokenEndpoint: "https://idp.example.test/token",
            jwksUri: "https://idp.example.test/jwks"
          };
        },
        async exchangeCode() {
          throw new Error("Token exchange should not run when state mismatches");
        },
        async verifyIdToken() {
          throw new Error("ID token verification should not run when state mismatches");
        }
      }
    });

    await authProviderConfigRepository.upsertAuthProviderConfig({
      tenantId: "tenant_oidc_state",
      provider: "oidc",
      enabled: true,
      issuerUrl: "https://idp.example.test",
      clientId: "forgetbase",
      redirectUri: "http://localhost:5175/oidc/callback",
      autoProvisionUsers: true
    });

    const authorize = await server.inject({
      method: "POST",
      url: "/auth/oidc/authorize",
      payload: {
        tenantId: "tenant_oidc_state",
        provider: "oidc"
      }
    });
    const callback = await server.inject({
      method: "POST",
      url: "/auth/oidc/callback",
      payload: {
        tenantId: "tenant_oidc_state",
        provider: "oidc",
        code: "auth-code",
        state: authorize.json().state,
        nonce: "wrong-nonce",
        codeVerifier: authorize.json().codeVerifier
      }
    });

	    expect(callback.statusCode).toBe(401);
	    expect(callback.json().error).toBe("oidc_state_mismatch");
	  });

	  it("links existing local users only when verified-email account linking is satisfied", async () => {
	    const authRepository = new InMemoryAuthRepository();
	    const authProviderConfigRepository = new InMemoryAuthProviderConfigRepository();
	    let expectedNonce = "";
	    let emailVerified = false;
	    server = buildServer({
	      logger: false,
	      registryRepository: new InMemoryRegistryRepository(),
	      authRepository,
	      retrievalRepository: new InMemoryRetrievalRepository(),
	      feedbackRepository: new InMemoryManagedQueryFeedbackRepository(),
	      authProviderConfigRepository,
	      oidcStateSecret: "test-oidc-state-secret",
	      oidcRuntime: {
	        async discover() {
	          return {
	            issuer: "https://idp.example.test",
	            authorizationEndpoint: "https://idp.example.test/authorize",
	            tokenEndpoint: "https://idp.example.test/token",
	            jwksUri: "https://idp.example.test/jwks"
	          };
	        },
	        async exchangeCode() {
	          return { idToken: "id-token" };
	        },
	        async verifyIdToken() {
	          return {
	            sub: "linked-local-subject",
	            email: "linked@example.com",
	            name: "Linked Local",
	            email_verified: emailVerified,
	            nonce: expectedNonce
	          };
	        }
	      }
	    });
	    const localUser = await authRepository.createUser({
	      tenantId: "tenant_oidc_link",
	      email: "linked@example.com",
	      displayName: "Linked Local",
	      role: "reader",
	      password: "correct-horse-battery"
	    });

	    await authProviderConfigRepository.upsertAuthProviderConfig({
	      tenantId: "tenant_oidc_link",
	      provider: "oidc",
	      enabled: true,
	      issuerUrl: "https://idp.example.test",
	      clientId: "forgetbase",
	      redirectUri: "http://localhost:5175/oidc/callback",
	      autoProvisionUsers: false,
	      allowedDomains: ["example.com"]
	    });

	    const deniedAuthorize = await server.inject({
	      method: "POST",
	      url: "/auth/oidc/authorize",
	      payload: {
	        tenantId: "tenant_oidc_link",
	        provider: "oidc"
	      }
	    });
	    expectedNonce = deniedAuthorize.json().nonce;
	    const deniedCallback = await server.inject({
	      method: "POST",
	      url: "/auth/oidc/callback",
	      payload: {
	        tenantId: "tenant_oidc_link",
	        provider: "oidc",
	        code: "auth-code",
	        state: deniedAuthorize.json().state,
	        nonce: deniedAuthorize.json().nonce,
	        codeVerifier: deniedAuthorize.json().codeVerifier
	      }
	    });

	    expect(deniedCallback.statusCode).toBe(403);
	    expect(deniedCallback.json().error).toBe("external_email_unverified");
	    expect((await authRepository.findUserByExternalIdentity({
	      tenantId: "tenant_oidc_link",
	      provider: "oidc",
	      issuer: "https://idp.example.test",
	      subject: "linked-local-subject"
	    }))).toBeNull();

	    emailVerified = true;
	    const allowedAuthorize = await server.inject({
	      method: "POST",
	      url: "/auth/oidc/authorize",
	      payload: {
	        tenantId: "tenant_oidc_link",
	        provider: "oidc"
	      }
	    });
	    expectedNonce = allowedAuthorize.json().nonce;
	    const allowedCallback = await server.inject({
	      method: "POST",
	      url: "/auth/oidc/callback",
	      payload: {
	        tenantId: "tenant_oidc_link",
	        provider: "oidc",
	        code: "auth-code",
	        state: allowedAuthorize.json().state,
	        nonce: allowedAuthorize.json().nonce,
	        codeVerifier: allowedAuthorize.json().codeVerifier
	      }
	    });

	    expect(allowedCallback.statusCode).toBe(201);
	    expect(allowedCallback.json().user).toMatchObject({
	      id: localUser.id,
	      authProvider: "local",
	      externalProvider: "oidc",
	      externalIssuer: "https://idp.example.test",
	      externalSubject: "linked-local-subject"
	    });

	    const localLogin = await server.inject({
	      method: "POST",
	      url: "/auth/login",
	      payload: {
	        tenantId: "tenant_oidc_link",
	        email: "linked@example.com",
	        password: "correct-horse-battery"
	      }
	    });

	    expect(localLogin.statusCode).toBe(201);
	  });

	  it("denies OIDC login for unknown users when auto provisioning is disabled", async () => {
    const authRepository = new InMemoryAuthRepository();
    const authProviderConfigRepository = new InMemoryAuthProviderConfigRepository();
    let expectedNonce = "";
    server = buildServer({
      logger: false,
      registryRepository: new InMemoryRegistryRepository(),
      authRepository,
      retrievalRepository: new InMemoryRetrievalRepository(),
      feedbackRepository: new InMemoryManagedQueryFeedbackRepository(),
      authProviderConfigRepository,
      oidcStateSecret: "test-oidc-state-secret",
      oidcRuntime: {
        async discover() {
          return {
            issuer: "https://idp.example.test",
            authorizationEndpoint: "https://idp.example.test/authorize",
            tokenEndpoint: "https://idp.example.test/token",
            jwksUri: "https://idp.example.test/jwks"
          };
        },
        async exchangeCode() {
          return { idToken: "id-token" };
        },
        async verifyIdToken() {
          return {
            sub: "external-subject-2",
            email: "unknown@example.com",
            name: "Unknown User",
            nonce: expectedNonce
          };
        }
      }
    });

    await authProviderConfigRepository.upsertAuthProviderConfig({
      tenantId: "tenant_oidc_no_auto",
      provider: "oidc",
      enabled: true,
      issuerUrl: "https://idp.example.test",
      clientId: "forgetbase",
      redirectUri: "http://localhost:5175/oidc/callback",
      autoProvisionUsers: false
    });

    const authorize = await server.inject({
      method: "POST",
      url: "/auth/oidc/authorize",
      payload: {
        tenantId: "tenant_oidc_no_auto",
        provider: "oidc"
      }
    });
    expectedNonce = authorize.json().nonce;

    const callback = await server.inject({
      method: "POST",
      url: "/auth/oidc/callback",
      payload: {
        tenantId: "tenant_oidc_no_auto",
        provider: "oidc",
        code: "auth-code",
        state: authorize.json().state,
        nonce: authorize.json().nonce,
        codeVerifier: authorize.json().codeVerifier
      }
    });

    expect(callback.statusCode).toBe(403);
    expect(callback.json().error).toBe("external_user_not_provisioned");
    expect((await authRepository.listAuditEvents({ tenantId: "tenant_oidc_no_auto" }))[0]?.reason)
      .toBe("external_user_not_provisioned");
  });

  it("serves OpenAPI and exports public AI packages without restricted leakage", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository
    });

    const adminBootstrap = await server.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        email: "admin@example.test",
        displayName: "Admin"
      }
    });
    const adminKey = adminBootstrap.json().secret;

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "policy.export-public",
        type: "policy",
        ownerId: "user_admin",
        title: "Public Export Policy",
        summary: "Public package material for agent connectors.",
        lifecycleState: "active",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
        allowedExports: ["demo-agent-pack"],
        instruction: {
          instructionKind: "policy",
          body: "Use this public export instruction in demo agent packages."
        },
        humanDocument: {
          format: "markdown",
          body: "# Public Export Policy"
        }
      }
    });

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "policy.export-surface-denied",
        type: "policy",
        ownerId: "user_admin",
        title: "API-only Public Policy",
        lifecycleState: "active",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api"],
        allowedExports: ["demo-agent-pack"],
        instruction: {
          instructionKind: "policy",
          body: "This public asset does not permit the export surface."
        }
      }
    });

    await server.inject({
      method: "POST",
      url: "/assets",
      headers: {
        authorization: `Bearer ${adminKey}`
      },
      payload: {
        stableId: "policy.export-restricted",
        type: "policy",
        ownerId: "user_admin",
        title: "Restricted Export Policy",
        summary: "Restricted package material that must not leak to anonymous exports.",
        lifecycleState: "active",
        sensitivity: "restricted",
        audience: ["security-team"],
        status: "approved",
        reviewDueAt: "2027-01-31",
        allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
        allowedExports: ["demo-agent-pack"],
        instruction: {
          instructionKind: "policy",
          body: "Restricted export instruction."
        }
      }
    });

    const openApiResponse = await server.inject({
      method: "GET",
      url: "/openapi.json"
    });

    expect(openApiResponse.statusCode).toBe(200);
    expect(Object.keys(openApiResponse.json().paths)).toEqual(expect.arrayContaining([
      "/auth/login",
      "/auth/session/refresh",
      "/auth/logout",
      "/auth/oidc/authorize",
      "/auth/oidc/callback",
      "/auth/api-keys/rotation-due",
      "/auth/api-keys/{apiKeyId}/rotate",
      "/assets/review-queue",
      "/assets/{stableId}/review",
      "/assets/{stableId}/versions/{versionNumber}",
      "/assets/{stableId}/publish",
      "/validation/assets",
      "/agent/query",
      "/agent/query/feedback",
      "/agent/evals/run",
      "/agent/evals/runs",
      "/agent/evals/summary",
      "/agent/actions",
      "/agent/actions/execute",
      "/agent/actions/{actionRequestId}/decision",
      "/admin/service-account-policy",
      "/admin/secret-reference-policy",
      "/admin/retrieval-ranking-policy",
      "/admin/managed-query-policy",
      "/admin/action-execution-policy",
      "/admin/managed-query-cache/policy",
      "/admin/managed-query-cache/{cacheKey}",
      "/admin/managed-query-retention/policy",
      "/admin/model-providers",
      "/admin/model-providers/{provider}",
      "/admin/auth-providers",
      "/admin/auth-providers/{provider}",
      "/search",
      "/exports/ai-package",
      "/telemetry/summary"
    ]));
    expect(
      openApiResponse.json().paths["/search"].get.parameters
        .map((parameter: { name: string }) => parameter.name)
    ).toEqual(expect.arrayContaining(["query", "strategy", "limit"]));
    expect(
      openApiResponse.json().paths["/exports/ai-package"].get.parameters
        .map((parameter: { name: string }) => parameter.name)
    ).toEqual(expect.arrayContaining(["package", "format", "okfVersion", "limit"]));

    const exportResponse = await server.inject({
      method: "GET",
      url: "/exports/ai-package?package=demo-agent-pack"
    });

    expect(exportResponse.statusCode).toBe(200);
    const exportPackage = aiExportPackageSchema.parse(exportResponse.json());
    expect(exportPackage.packageName).toBe("demo-agent-pack");
    expect(exportPackage.deniedCount).toBe(2);
    expect(exportPackage.assets.map((asset) => asset.stableId)).toEqual(["policy.export-public"]);
    expect(exportPackage.assets[0]?.citations[0]?.stableId).toBe("policy.export-public");
    expect(exportPackage.assets[0]?.instructions[0]?.body).toContain("public export instruction");
    expect(exportPackage.assets[0]?.sourceVersion?.versionNumber).toBe(1);

    const okfExportResponse = await server.inject({
      method: "GET",
      url: "/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1"
    });

    expect(okfExportResponse.statusCode).toBe(200);
    const okfExportPackage = okfExportPackageSchema.parse(okfExportResponse.json());
    expect(okfExportPackage.format).toBe("okf");
    expect(okfExportPackage.okfVersion).toBe("0.1");
    expect(okfExportPackage.assetCount).toBe(1);
    expect(okfExportPackage.deniedCount).toBe(2);
    expect(okfExportPackage.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      "index.md",
      "manifest.md",
      "log.md"
    ]));
    const publicConcept = okfExportPackage.files.find((file) => file.path.startsWith("policies/"));
    expect(publicConcept?.content).toContain("stable_id: \"policy.export-public\"");
    expect(publicConcept?.content).toContain("source_version_number: 1");
    expect(JSON.stringify(okfExportPackage)).not.toContain("Restricted export instruction");
  });
});

function uniqueStableIds(results: Array<{ asset: { stableId: string } }>): string[] {
  return Array.from(new Set(results.map((result) => result.asset.stableId))).sort();
}
