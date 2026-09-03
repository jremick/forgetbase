import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOkfExportPackage, type AiExportPackage } from "@forgetbase/schema";
import { MemoryLocalCredentialStore } from "@forgetbase/local-runtime";
import { main } from "./index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ForgetBase CLI contract", () => {
  it("maps local bootstrap flags to the private-beta setup API contract", async () => {
    const { fetchMock, calls } = mockFetch(() => authBootstrapFixture());
    const logs = captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "auth",
      "bootstrap",
      "--tenant-id",
      "tenant_beta",
      "--email",
      "admin@example.test",
      "--display-name",
      "Beta Admin",
      "--password",
      "local-dev-password",
      "--key-name",
      "beta-admin",
      "--api-url",
      "http://forgetbase.test"
    ]);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/auth/bootstrap");
    expect(calls[0]?.body).toMatchObject({
      tenantId: "tenant_beta",
      email: "admin@example.test",
      displayName: "Beta Admin",
      password: "local-dev-password",
      keyName: "beta-admin"
    });
    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({
      user: {
        tenantId: "tenant_beta",
        email: "admin@example.test",
        role: "admin"
      },
      apiKey: {
        scopes: ["admin", "asset:read", "asset:write", "permission:write"]
      },
      secret: "fb_test_secret"
    });
  });

  it("maps corpus import and asset fetch to the private-beta first-run API contract", async () => {
    const corpusFile = await writeTempCorpus([betaAssetCreateInput()]);
    const { fetchMock, calls } = mockFetch((call) => {
      if (call.method === "GET" && call.url.pathname === "/assets/policy.beta-public-export") {
        return mockHttp(404, { error: "not_found" });
      }

      if (call.method === "POST" && call.url.pathname === "/assets") {
        return betaAssetDetailFixture();
      }

      throw new Error(`Unexpected request ${call.method} ${call.url.pathname}`);
    });
    const logs = captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "corpus",
      "import",
      "--file",
      corpusFile,
      "--api-url",
      "http://forgetbase.test",
      "--api-key",
      "test-key"
    ]);

    expect(code).toBe(0);
    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "GET /assets/policy.beta-public-export",
      "POST /assets"
    ]);
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-key");
    expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("cli");
    expect(calls[1]?.headers.get("authorization")).toBe("Bearer test-key");
    expect(calls[1]?.body).toMatchObject({
      stableId: "policy.beta-public-export",
      allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
      allowedExports: ["demo-agent-pack"]
    });
    expect(JSON.parse(logs[0] ?? "{}")).toEqual({
      total: 1,
      created: 1,
      skipped: 0
    });

    const fetchRun = mockFetch(() => betaAssetDetailFixture());
    const fetchLogs = captureStdout();
    vi.stubGlobal("fetch", fetchRun.fetchMock);

    const fetchCode = await main([
      "assets",
      "get",
      "policy.beta-public-export",
      "--api-url",
      "http://forgetbase.test",
      "--api-key",
      "test-key"
    ]);

    expect(fetchCode).toBe(0);
    expect(fetchRun.calls).toHaveLength(1);
    expect(fetchRun.calls[0]?.method).toBe("GET");
    expect(fetchRun.calls[0]?.url.pathname).toBe("/assets/policy.beta-public-export");
    expect(JSON.parse(fetchLogs[0] ?? "{}")).toMatchObject({
      asset: {
        stableId: "policy.beta-public-export"
      }
    });
  });

  it("maps search flags to the search API contract", async () => {
    const { fetchMock, calls } = mockFetch(() => searchResponseFixture("PII redaction"));
    const logs = captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "search",
      "--query",
      "PII redaction",
      "--limit",
      "3",
      "--strategy",
      "hybrid",
      "--api-url",
      "http://forgetbase.test",
      "--api-key",
      "test-key"
    ]);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.pathname).toBe("/search");
    expect(calls[0]?.url.searchParams.get("query")).toBe("PII redaction");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("3");
    expect(calls[0]?.url.searchParams.get("strategy")).toBe("hybrid");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-key");
    expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("cli");
    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({
      query: "PII redaction",
      results: []
    });
  });

  it.each([
    {
      label: "trailing characters in an integer",
      argv: ["search", "--query", "policy", "--limit", "3items"],
      error: "Invalid numeric value for --limit: 3items"
    },
    {
      label: "fractional integer",
      argv: ["search", "--query", "policy", "--limit", "1.5"],
      error: "Invalid integer value for --limit: 1.5"
    },
    {
      label: "zero positive integer",
      argv: ["search", "--query", "policy", "--limit", "0"],
      error: "Invalid integer value for --limit: 0"
    },
    {
      label: "integer above the command boundary",
      argv: ["search", "--query", "policy", "--limit", "51"],
      error: "Invalid integer value for --limit: 51"
    },
    {
      label: "unsafe integer",
      argv: ["audit", "events", "--limit", "9007199254740992"],
      error: "Invalid integer value for --limit: 9007199254740992"
    },
    {
      label: "negative non-negative integer",
      argv: ["auth", "api-key-rotation-due", "--due-within-days", "-1"],
      error: "Invalid integer value for --due-within-days: -1"
    },
    {
      label: "out-of-range feedback score",
      argv: [
        "agent",
        "feedback",
        "--telemetry-event-id",
        "retrieval_1",
        "--query",
        "policy",
        "--outcome",
        "accepted",
        "--policy-compliance",
        "6"
      ],
      error: "Invalid integer value for --policy-compliance: 6"
    },
    {
      label: "invalid retention suffix",
      argv: ["telemetry", "retention-set", "--retrieval-event-days", "30days"],
      error: "Invalid numeric value for --retrieval-event-days: 30days"
    },
    {
      label: "fractional retry count",
      argv: ["admin", "model-provider-set", "--provider", "openai", "--max-retries", "1.5"],
      error: "Invalid integer value for --max-retries: 1.5"
    },
    {
      label: "temperature above the supported boundary",
      argv: ["admin", "model-provider-set", "--provider", "openai", "--temperature", "2.1"],
      error: "Invalid numeric value for --temperature: 2.1"
    },
    {
      label: "missing explicit option value",
      argv: ["search", "--query", "policy", "--limit"],
      error: "Missing value for option: --limit"
    }
  ])("rejects $label before issuing a request", async ({ argv, error }) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(main(argv)).rejects.toThrow(error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["1", "50"])("preserves the valid search limit boundary %s", async (limit) => {
    const { fetchMock, calls } = mockFetch(() => searchResponseFixture("policy"));
    captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    await expect(main(["search", "--query", "policy", "--limit", limit])).resolves.toBe(0);
    expect(calls[0]?.url.searchParams.get("limit")).toBe(limit);
  });

  it("preserves opaque option values that begin with dashes", async () => {
    const { fetchMock, calls } = mockFetch(() => authBootstrapFixture());
    captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    await expect(main([
      "auth",
      "login",
      "--email",
      "admin@example.test",
      "--password=--local-secret",
      "--api-url",
      "http://forgetbase.test"
    ])).resolves.toBe(0);

    expect(calls[0]?.body).toMatchObject({ password: "--local-secret" });
  });

  it("rejects a missing value followed by another known option", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(main([
      "auth",
      "login",
      "--email",
      "admin@example.test",
      "--password",
      "--api-key",
      "real-key"
    ])).rejects.toThrow("Missing value for option: --password");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "search strategy",
      argv: ["search", "--query", "policy", "--strategy", "semantic"],
      error: "Invalid value for --strategy: semantic"
    },
    {
      label: "request surface",
      argv: ["search", "--query", "policy", "--surface", "mobile"],
      error: "Invalid value for --surface: mobile"
    },
    {
      label: "user role",
      argv: ["auth", "user-create", "--email", "reader@example.test", "--display-name", "Reader", "--role", "owner"],
      error: "Invalid value for --role: owner"
    },
    {
      label: "user status",
      argv: ["auth", "user-update", "--user-id", "user_1", "--status", "pending"],
      error: "Invalid value for --status: pending"
    },
    {
      label: "API-key scope",
      argv: ["auth", "api-key-create", "--user-id", "user_1", "--name", "cli", "--scopes", "asset:read,root"],
      error: "Invalid value for --scopes: root"
    },
    {
      label: "API-key surface",
      argv: ["auth", "api-key-create", "--user-id", "user_1", "--name", "cli", "--allowed-surfaces", "cli,mobile"],
      error: "Invalid value for --allowed-surfaces: mobile"
    },
    {
      label: "permission principal type",
      argv: ["auth", "grant", "--stable-id", "policy.example", "--principal-id", "team_1", "--principal-type", "organization"],
      error: "Invalid value for --principal-type: organization"
    },
    {
      label: "permission action",
      argv: ["auth", "grant", "--stable-id", "policy.example", "--principal-id", "user_1", "--action", "delete"],
      error: "Invalid value for --action: delete"
    },
    {
      label: "permission surface",
      argv: ["auth", "grant", "--stable-id", "policy.example", "--principal-id", "user_1", "--surfaces", "api,mobile"],
      error: "Invalid value for --surfaces: mobile"
    },
    {
      label: "auth-provider default role",
      argv: [
        "admin",
        "auth-provider-set",
        "--provider",
        "oidc",
        "--issuer-url",
        "https://idp.example.test",
        "--client-id",
        "forgetbase",
        "--default-role",
        "owner"
      ],
      error: "Invalid value for --default-role: owner"
    },
    {
      label: "auth-provider account linking mode",
      argv: [
        "admin",
        "auth-provider-set",
        "--provider",
        "oidc",
        "--issuer-url",
        "https://idp.example.test",
        "--client-id",
        "forgetbase",
        "--account-linking-mode",
        "automatic"
      ],
      error: "Invalid value for --account-linking-mode: automatic"
    }
  ])("rejects an invalid $label before issuing a request", async ({ argv, error }) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(main(argv)).rejects.toThrow(error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves valid role, scope, surface, principal, and action values", async () => {
    const { fetchMock, calls } = mockFetch((call) => {
      if (call.url.pathname === "/auth/api-keys") {
        return apiKeyCreatedFixture();
      }

      if (call.url.pathname === "/assets/policy.example/grants") {
        return permissionGrantFixture();
      }

      throw new Error(`Unexpected request ${call.method} ${call.url.pathname}`);
    });
    captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    await expect(main([
      "auth",
      "api-key-create",
      "--user-id",
      "user_1",
      "--name",
      "cli",
      "--scopes",
      "asset:read,agent:execute",
      "--allowed-surfaces",
      "cli,mcp"
    ])).resolves.toBe(0);
    await expect(main([
      "auth",
      "grant",
      "--stable-id",
      "policy.example",
      "--principal-type",
      "group",
      "--principal-id",
      "group_1",
      "--action",
      "write",
      "--surfaces",
      "api,web"
    ])).resolves.toBe(0);

    expect(calls[0]?.body).toMatchObject({
      userId: "user_1",
      scopes: ["asset:read", "agent:execute"],
      allowedSurfaces: ["cli", "mcp"]
    });
    expect(calls[1]?.body).toMatchObject({
      principalType: "group",
      principalId: "group_1",
      action: "write",
      surfaces: ["api", "web"]
    });
  });

  it("maps managed-query flags to a provider-routed POST body", async () => {
    const { fetchMock, calls } = mockFetch(() => managedQueryResponseFixture("PII redaction"));
    captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "agent",
      "query",
      "--query",
      "PII redaction",
      "--limit",
      "2",
      "--mode",
      "provider-routed",
      "--provider",
      "openai",
      "--model",
      "gpt-5.1",
      "--cache",
      "false",
      "--api-url",
      "http://forgetbase.test",
      "--api-key",
      "test-key"
    ]);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.pathname).toBe("/agent/query");
    expect(calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("cli");
    expect(calls[0]?.body).toMatchObject({
      tenantId: "tenant_demo",
      query: "PII redaction",
      limit: 2,
      mode: "provider-routed",
      provider: "openai",
      model: "gpt-5.1",
      cache: false
    });
  });

  it("maps admin managed-query policy flags to typed JSON", async () => {
    const { fetchMock, calls } = mockFetch(() => managedQueryPolicyFixture());
    captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "admin",
      "managed-query-policy-set",
      "--default-mode",
      "deterministic-retrieval",
      "--allowed-modes",
      "deterministic-retrieval,provider-routed",
      "--minimum-citation-count",
      "2",
      "--require-grounded",
      "false",
      "--api-url",
      "http://forgetbase.test",
      "--api-key",
      "admin-key"
    ]);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url.pathname).toBe("/admin/managed-query-policy");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer admin-key");
    expect(calls[0]?.body).toMatchObject({
      tenantId: "tenant_demo",
      defaultMode: "deterministic-retrieval",
      allowedModes: ["deterministic-retrieval", "provider-routed"],
      minimumCitationCount: 2,
      requireGrounded: false
    });
  });

  it("maps OKF export flags to the export API contract", async () => {
    const { fetchMock, calls } = mockFetch(() => buildOkfExportPackage(betaJsonExportPackage(), { okfVersion: "0.1" }));
    const logs = captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "exports",
      "ai-package",
      "--package",
      "demo-agent-pack",
      "--format",
      "okf",
      "--okf-version",
      "0.1",
      "--api-url",
      "http://forgetbase.test",
      "--api-key",
      "test-key"
    ]);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.pathname).toBe("/exports/ai-package");
    expect(calls[0]?.url.searchParams.get("package")).toBe("demo-agent-pack");
    expect(calls[0]?.url.searchParams.get("format")).toBe("okf");
    expect(calls[0]?.url.searchParams.get("okfVersion")).toBe("0.1");
    const payload = JSON.parse(logs[0] ?? "{}");
    expect(payload).toMatchObject({
      format: "okf",
      packageName: "demo-agent-pack",
      okfVersion: "0.1",
      assetCount: 1,
      deniedCount: 1,
      rootIndexPath: "index.md"
    });
    expect(payload.sourcePackageHash).toBeTruthy();
    expect(payload.projectionHash).toBeTruthy();
    expect(payload.files.map((file: { path: string }) => file.path)).toEqual(expect.arrayContaining([
      "index.md",
      "manifest.md",
      "log.md"
    ]));
    const conceptFile = payload.files.find((file: { path: string }) => file.path.startsWith("policies/"));
    expect(conceptFile?.path).toMatch(/^policies\/policy-beta-public-export-[a-f0-9]+\.md$/);
    expect(conceptFile?.content).toContain("stable_id: \"policy.beta-public-export\"");
    expect(JSON.stringify(payload)).not.toContain("Restricted beta export instruction");
  });

  it("maps JSON export flags to the export API contract", async () => {
    const { fetchMock, calls } = mockFetch(() => betaJsonExportPackage());
    const logs = captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "exports",
      "ai-package",
      "--package",
      "demo-agent-pack",
      "--format",
      "json",
      "--api-url",
      "http://forgetbase.test",
      "--api-key",
      "test-key"
    ]);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.pathname).toBe("/exports/ai-package");
    expect(calls[0]?.url.searchParams.get("package")).toBe("demo-agent-pack");
    expect(calls[0]?.url.searchParams.get("format")).toBe("json");
    expect(calls[0]?.url.searchParams.has("okfVersion")).toBe(false);
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-key");
    expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("cli");
    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({
      packageName: "demo-agent-pack",
      assetCount: 1,
      deniedCount: 1,
      assets: [
        {
          stableId: "policy.beta-public-export",
          sourceVersion: {
            versionNumber: 1,
            contentHash: "sha256:public-content"
          },
          allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
          allowedExports: ["demo-agent-pack"]
        }
      ]
    });
  });

  it("connects through browser authorization and stores no device secret in the profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "forgetbase-cli-local-"));
    tempDirs.push(root);
    const credentialStore = new MemoryLocalCredentialStore();
    const { fetchMock, calls } = mockFetch((call) => {
      if (call.url.pathname === "/local-sync/v1/device-sessions") {
        return mockHttp(201, {
          approvalUrl: "https://forgetbase.example.test/?local-device-request=request-token",
          requestToken: "request-token",
          expiresAt: "2026-09-03T00:05:00.000Z"
        });
      }
      if (call.url.pathname === "/local-sync/v1/device-sessions/token") {
        return mockHttp(201, localDeviceTokenFixture());
      }
      if (call.url.pathname === "/local-sync/v1/configuration") {
        return {
          protocolVersion: "1",
          serverId: "server_test",
          tenantId: "tenant_demo",
          principalType: "user",
          principalId: "user_device",
          signingKeyId: "key_1",
          signingPublicKey: "test-public-key",
          leaseDurationSeconds: 3_600,
          minimumClientVersion: "0.1.0",
          allowedSensitivities: ["public-demo"],
          maxRecords: 5_000,
          maxRecordsPerPage: 100,
          maxRecordBytes: 2 * 1024 * 1024,
          maxSnapshotBytes: 100 * 1024 * 1024
        };
      }
      throw new Error(`Unexpected request ${call.method} ${call.url.pathname}`);
    });
    const logs = captureStdout();
    vi.stubGlobal("fetch", fetchMock);

    const code = await main([
      "local",
      "connect",
      "--api-url",
      "https://forgetbase.example.test",
      "--device-name",
      "Test laptop",
      "--profile",
      "work",
      "--root",
      root
    ], {
      credentialStore,
      localBrowserAuthorizer: async () => "browser-authorization-code"
    });

    expect(code).toBe(0);
    expect(calls.map((call) => call.url.pathname)).toEqual([
      "/local-sync/v1/device-sessions",
      "/local-sync/v1/device-sessions/token",
      "/local-sync/v1/configuration"
    ]);
    expect(calls[2]?.headers.get("authorization")).toBe(`Bearer ${localDeviceTokenFixture().accessToken}`);
    expect(calls.every((call) => call.headers.get("x-forgetbase-surface") === "local-cache")).toBe(true);
    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({ profile: "work", state: "not-built" });
    const profile = await readFile(join(root, "profiles", "work", "profile.json"), "utf8");
    expect(profile).not.toContain(localDeviceTokenFixture().refreshToken);
    expect(profile).not.toContain(localDeviceTokenFixture().accessToken);
  });

  it("requires an explicit profile when more than one local profile exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "forgetbase-cli-profiles-"));
    tempDirs.push(root);
    await mkdir(join(root, "profiles", "default"), { recursive: true });
    await mkdir(join(root, "profiles", "work"), { recursive: true });

    await expect(main(["local", "status", "--root", root], {
      credentialStore: new MemoryLocalCredentialStore()
    })).rejects.toThrow(/select one with --profile/);
  });
});

function localDeviceTokenFixture() {
  return {
    accessToken: "access-token".padEnd(40, "x"),
    accessTokenExpiresAt: "2026-09-03T00:30:00.000Z",
    refreshToken: "refresh-token".padEnd(40, "x"),
    refreshTokenExpiresAt: "2026-09-10T00:00:00.000Z",
    deviceSession: {
      id: "session_device",
      tenantId: "tenant_demo",
      userId: "user_device",
      apiKeyId: "key_device",
      source: "local-device",
      deviceLabel: "Test laptop",
      clientUserAgent: "vitest",
      createdAt: "2026-09-03T00:00:00.000Z",
      expiresAt: "2026-09-03T00:30:00.000Z",
      absoluteExpiresAt: "2026-10-03T00:00:00.000Z",
      lastSeenAt: null,
      revokedAt: null
    }
  };
}

function captureStdout(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((value) => {
    logs.push(String(value));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  return logs;
}

function mockFetch(handler: (call: FetchCall) => unknown): {
  fetchMock: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null
    };
    calls.push(call);
    const handled = handler(call);
    const response = isMockHttpResponse(handled) ? handled : mockHttp(200, handled);

    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: {
        "content-type": "application/json"
      }
    });
  }) as typeof fetch;

  return { fetchMock, calls };
}

function mockHttp(status: number, body: unknown): MockHttpResponse {
  return {
    __mockHttpResponse: true,
    status,
    body
  };
}

function isMockHttpResponse(value: unknown): value is MockHttpResponse {
  return Boolean(value && typeof value === "object" && "__mockHttpResponse" in value);
}

async function writeTempCorpus(assets: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "forgetbase-cli-contract-"));
  tempDirs.push(dir);
  const file = join(dir, "assets.json");
  await writeFile(file, JSON.stringify({ assets }, null, 2));
  return file;
}

function authBootstrapFixture(): Record<string, unknown> {
  return {
    user: {
      id: "user_admin",
      tenantId: "tenant_beta",
      email: "admin@example.test",
      displayName: "Beta Admin",
      role: "admin",
      status: "active",
      authProvider: "local",
      externalProvider: null,
      externalSubject: null,
      externalIssuer: null,
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z"
    },
    apiKey: {
      id: "api_key_admin",
      tenantId: "tenant_beta",
      userId: "user_admin",
      serviceAccountId: null,
      name: "beta-admin",
      keyPrefix: "fb_test",
      secretPreview: "fb_test...",
      scopes: ["admin", "asset:read", "asset:write", "permission:write"],
      allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
      expiresAt: null,
      revokedAt: null,
      createdAt: "2026-06-19T00:00:00.000Z",
      lastUsedAt: null
    },
    secret: "fb_test_secret"
  };
}

function apiKeyCreatedFixture(): Record<string, unknown> {
  return {
    apiKey: {
      id: "api_key_1",
      tenantId: "tenant_demo",
      userId: "user_1",
      serviceAccountId: null,
      name: "cli",
      secretPreview: "fb_test...",
      scopes: ["asset:read", "agent:execute"],
      allowedSurfaces: ["cli", "mcp"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-06-19T00:00:00.000Z"
    },
    secret: "fb_test_secret"
  };
}

function permissionGrantFixture(): Record<string, unknown> {
  return {
    id: "grant_1",
    tenantId: "tenant_demo",
    assetId: "asset_1",
    stableId: "policy.example",
    principalType: "group",
    principalId: "group_1",
    action: "write",
    surfaces: ["api", "web"],
    createdBy: null,
    createdAt: "2026-06-19T00:00:00.000Z"
  };
}

function searchResponseFixture(query: string): Record<string, unknown> {
  return {
    query,
    results: [],
    telemetryEventId: null
  };
}

function managedQueryResponseFixture(query: string): Record<string, unknown> {
  return {
    query,
    mode: "provider-routed",
    answer: "Use the cited governed assets.",
    results: [],
    citations: [],
    telemetryEventId: "retrieval_test_1",
    checks: {
      grounded: true,
      resultCount: 0,
      citationCount: 0,
      deniedCount: 0
    },
    generation: {
      provider: "openai",
      model: "gpt-5.1",
      status: "completed",
      reason: null,
      latencyMs: 12,
      usage: {
        inputTokens: 10,
        outputTokens: 8,
        totalTokens: 18,
        estimatedCostUsd: null
      },
      attempts: [
        {
          provider: "openai",
          model: "gpt-5.1",
          status: "completed",
          reason: null,
          latencyMs: 12
        }
      ]
    },
    cache: {
      status: "miss",
      hit: false,
      cacheKey: null,
      expiresAt: null,
      reason: null
    },
    warnings: []
  };
}

function managedQueryPolicyFixture(): Record<string, unknown> {
  return {
    tenantId: "tenant_demo",
    defaultMode: "deterministic-retrieval",
    allowedModes: ["deterministic-retrieval", "provider-routed"],
    minimumCitationCount: 2,
    requireGrounded: false,
    source: "stored",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T00:00:00.000Z"
  };
}

function betaJsonExportPackage(): AiExportPackage {
  return {
    packageName: "demo-agent-pack",
    generatedAt: "2026-06-19T00:00:00.000Z",
    tenantId: "tenant_demo",
    assetCount: 1,
    deniedCount: 1,
    assets: [
      {
        stableId: "policy.beta-public-export",
        assetId: "asset_beta_public",
        type: "policy",
        title: "Beta Public Export Policy",
        summary: "Synthetic beta contract asset.",
        audience: ["ai-team"],
        status: "approved",
        sensitivity: "public-demo",
        lifecycleState: "active",
        sourceRef: null,
        currentVersionId: "version_beta_public_1",
        sourceVersion: {
          id: "version_beta_public_1",
          versionNumber: 1,
          contentHash: "sha256:public-content",
          createdAt: "2026-06-19T00:00:00.000Z",
          changeNote: "Initial beta contract fixture"
        },
        allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
        allowedExports: ["demo-agent-pack"],
        instructions: [
          {
            id: "instruction_beta_public_1",
            instructionKind: "policy",
            targetAgents: [],
            body: "Beta public export instruction for canonical agent connector packages.",
            constraints: [],
            failureModes: [],
            escalation: null
          }
        ],
        humanDocuments: [
          {
            id: "doc_beta_public_1",
            format: "markdown",
            body: "# Beta Public Export Policy"
          }
        ],
        citations: [
          {
            stableId: "policy.beta-public-export",
            assetId: "asset_beta_public",
            chunkId: "chunk_beta_public_1",
            sourceKind: "agent-instruction",
            sourceId: "instruction_beta_public_1",
            sourceRef: null,
            versionId: "version_beta_public_1",
            title: "Beta Public Export Policy",
            chunkIndex: 0,
            snippet: "Beta public export instruction"
          }
        ]
      }
    ]
  };
}

function betaAssetCreateInput(): Record<string, unknown> {
  return {
    stableId: "policy.beta-public-export",
    type: "policy",
    ownerId: "user_admin",
    title: "Beta Public Export Policy",
    summary: "Synthetic beta contract asset.",
    lifecycleState: "active",
    sensitivity: "public-demo",
    audience: ["ai-team"],
    status: "approved",
    reviewDueAt: "2027-01-31",
    allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
    allowedExports: ["demo-agent-pack"],
    instruction: {
      instructionKind: "policy",
      body: "Beta public export instruction for canonical agent connector packages."
    },
    humanDocument: {
      format: "markdown",
      body: "# Beta Public Export Policy"
    }
  };
}

function betaAssetDetailFixture(): Record<string, unknown> {
  return {
    asset: {
      id: "asset_beta_public",
      tenantId: "tenant_demo",
      stableId: "policy.beta-public-export",
      type: "policy",
      ownerId: "user_admin",
      title: "Beta Public Export Policy",
      summary: "Synthetic beta contract asset.",
      lifecycleState: "active",
      sensitivity: "public-demo",
      audience: ["ai-team"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
      allowedExports: ["demo-agent-pack"],
      allowedActions: [],
      sourceKind: "manual",
      sourceRef: null,
      currentVersionId: "version_beta_public_1",
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z"
    },
    versions: [],
    instructionObjects: [],
    humanDocuments: []
  };
}

interface FetchCall {
  url: URL;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

interface MockHttpResponse {
  __mockHttpResponse: true;
  status: number;
  body: unknown;
}
