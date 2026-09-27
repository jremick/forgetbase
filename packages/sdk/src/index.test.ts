import { describe, expect, it, vi } from "vitest";
import { buildOkfExportPackage, type AiExportPackage } from "@forgetbase/schema";
import { ForgetBaseClient, ForgetBaseHttpError } from "./index.js";

describe("ForgetBase SDK beta contract", () => {
  it("maps search and export calls to the canonical machine-consumer API path", async () => {
    const jsonPackage = betaJsonExportPackage();
    const okfPackage = buildOkfExportPackage(jsonPackage, { okfVersion: "0.1" });
    const { fetchMock, calls } = mockFetch((call) => {
      if (call.url.pathname === "/search") {
        return {
          query: call.url.searchParams.get("query"),
          results: [],
          telemetryEventId: null
        };
      }

      if (call.url.searchParams.get("format") === "okf") {
        return okfPackage;
      }

      return jsonPackage;
    });
    const client = new ForgetBaseClient({
      baseUrl: "http://forgetbase.test/",
      apiKey: "test-key",
      surface: "api",
      fetchImpl: fetchMock
    });

    const searchResult = await client.search({
      query: "beta connector",
      limit: 5,
      strategy: "hybrid"
    });
    const jsonResult = await client.exportAiPackage("demo-agent-pack", { format: "json" });
    const okfResult = await client.exportAiPackage("demo-agent-pack", { format: "okf", okfVersion: "0.1" });

    expect(searchResult).toMatchObject({
      query: "beta connector",
      results: [],
      telemetryEventId: null
    });
    expect(jsonResult).toMatchObject({
      packageName: "demo-agent-pack",
      assetCount: 1,
      deniedCount: 1
    });
    expect(okfResult).toMatchObject({
      format: "okf",
      okfVersion: "0.1",
      sourcePackageHash: expect.any(String),
      projectionHash: expect.any(String)
    });
    expect(okfResult.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      "index.md",
      "manifest.md",
      "log.md"
    ]));
    const conceptFile = okfResult.files.find((file) => file.path.startsWith("policies/"));
    expect(conceptFile?.path).toMatch(/^policies\/policy-beta-public-export-[a-f0-9]+\.md$/);
    expect(conceptFile?.content).toContain("stable_id: \"policy.beta-public-export\"");

    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "GET /search",
      "GET /exports/ai-package",
      "GET /exports/ai-package"
    ]);
    expect(calls[0]?.url.searchParams.get("query")).toBe("beta connector");
    expect(calls[0]?.url.searchParams.get("limit")).toBe("5");
    expect(calls[0]?.url.searchParams.get("strategy")).toBe("hybrid");
    expect(calls[1]?.url.searchParams.get("package")).toBe("demo-agent-pack");
    expect(calls[1]?.url.searchParams.get("format")).toBe("json");
    expect(calls[2]?.url.searchParams.get("package")).toBe("demo-agent-pack");
    expect(calls[2]?.url.searchParams.get("format")).toBe("okf");
    expect(calls[2]?.url.searchParams.get("okfVersion")).toBe("0.1");

    for (const call of calls) {
      expect(call.headers.get("authorization")).toBe("Bearer test-key");
      expect(call.headers.get("x-forgetbase-surface")).toBe("api");
    }
  });

  it.each([
    {
      name: "JSON",
      status: 400,
      body: JSON.stringify({ error: "validation_error" }),
      contentType: "application/json",
      expectedCode: "validation_error",
      expectedBody: JSON.stringify({ error: "validation_error" })
    },
    {
      name: "text",
      status: 400,
      body: "Bad request",
      contentType: "text/plain",
      expectedCode: null,
      expectedBody: "Bad request"
    },
    {
      name: "empty",
      status: 400,
      body: "",
      contentType: "text/plain",
      expectedCode: null,
      expectedBody: null
    },
    {
      name: "malformed JSON",
      status: 400,
      body: '{"error":',
      contentType: "application/json",
      expectedCode: null,
      expectedBody: '{"error":'
    },
    {
      name: "JSON with an unsafe error code",
      status: 400,
      body: JSON.stringify({ error: "invalid code <script>" }),
      contentType: "application/json",
      expectedCode: null,
      expectedBody: JSON.stringify({ error: "invalid code <script>" })
    },
    {
      name: "401",
      status: 401,
      body: JSON.stringify({ error: "authentication_required" }),
      contentType: "application/json",
      expectedCode: "authentication_required",
      expectedBody: JSON.stringify({ error: "authentication_required" })
    },
    {
      name: "403",
      status: 403,
      body: JSON.stringify({ error: "access_denied" }),
      contentType: "application/json",
      expectedCode: "access_denied",
      expectedBody: JSON.stringify({ error: "access_denied" })
    },
    {
      name: "404",
      status: 404,
      body: JSON.stringify({ error: "asset_not_found" }),
      contentType: "application/json",
      expectedCode: "asset_not_found",
      expectedBody: JSON.stringify({ error: "asset_not_found" })
    },
    {
      name: "500",
      status: 500,
      body: JSON.stringify({ error: "registry_unavailable" }),
      contentType: "application/json",
      expectedCode: "registry_unavailable",
      expectedBody: JSON.stringify({ error: "registry_unavailable" })
    }
  ])("returns a bounded typed HTTP error for $name responses", async ({
    status,
    body,
    contentType,
    expectedCode,
    expectedBody
  }) => {
    const client = clientReturning(new Response(body, {
      status,
      headers: {
        "content-type": contentType,
        "x-request-id": "request_test"
      }
    }));

    const error = await client.listAssets().catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ForgetBaseHttpError);
    expect(error).toMatchObject({
      name: "ForgetBaseHttpError",
      status,
      code: expectedCode,
      responseBody: expectedBody,
      responseBodyTruncated: false,
      responseContentType: contentType,
      responseRequestId: "request_test"
    });
    expect((error as Error).message).toBe(
      `ForgetBase request failed with HTTP ${status}${expectedCode ? ` (${expectedCode})` : ""}`
    );
  });

  it("bounds error response bodies and metadata without exposing the response body in the message", async () => {
    const body = "sensitive:" + "x".repeat(8_192);
    const client = clientReturning(new Response(body, {
      status: 500,
      statusText: "Internal Server Error",
      headers: {
        "content-type": `text/plain; detail=${"m".repeat(300)}`,
        "x-request-id": "r".repeat(300)
      }
    }));

    const error = await client.listAssets().catch((cause: unknown) => cause) as ForgetBaseHttpError;

    expect(error).toBeInstanceOf(ForgetBaseHttpError);
    expect(new TextEncoder().encode(error.responseBody ?? "")).toHaveLength(4_096);
    expect(error.responseBodyTruncated).toBe(true);
    expect(error.responseContentType).toHaveLength(256);
    expect(error.responseRequestId).toHaveLength(256);
    expect(error.message).toBe("ForgetBase request failed with HTTP 500");
    expect(error.message).not.toContain("sensitive");
  });

  it("keeps getAsset's nullable 404 contract while using the typed error path for other failures", async () => {
    const missingClient = clientReturning(new Response(JSON.stringify({ error: "asset_not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    }));
    const deniedClient = clientReturning(new Response(JSON.stringify({ error: "access_denied" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    }));

    await expect(missingClient.getAsset("asset.missing")).resolves.toBeNull();
    await expect(deniedClient.getAsset("asset.hidden")).rejects.toMatchObject({
      name: "ForgetBaseHttpError",
      status: 403,
      code: "access_denied"
    });
  });

  it("maps local configuration and high-water manifest calls to the versioned sync API", async () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const { fetchMock, calls } = mockFetch((call) => call.url.pathname.endsWith("configuration")
      ? {
          protocolVersion: "1",
          serverId: "server_test",
          tenantId: "tenant_demo",
          principalType: "service-account",
          principalId: "service_device",
          signingKeyId: "key_1",
          signingPublicKey: "test-public-key",
          leaseDurationSeconds: 3_600,
          minimumClientVersion: "0.1.0",
          allowedSensitivities: ["public-demo"],
          maxRecords: 5_000,
          maxRecordsPerPage: 100,
          maxRecordBytes: 2 * 1024 * 1024,
          maxSnapshotBytes: 100 * 1024 * 1024
        }
      : {
          pages: [{
            protocolVersion: "1",
            mode: "unchanged",
            serverId: "server_test",
            tenantId: "tenant_demo",
            principalType: "service-account",
            principalId: "service_device",
            snapshotId: "snapshot_1",
            authorizationEpoch: 4,
            contentGeneration: 9,
            entitlementHash: digest,
            recordSetHash: digest,
            baseRecordSetHash: null,
            issuedAt: "2026-09-03T00:00:00.000Z",
            serverTime: "2026-09-03T00:00:00.000Z",
            leaseExpiresAt: "2026-09-03T01:00:00.000Z",
            minimumClientVersion: "0.1.0",
            allowedSensitivities: ["public-demo"],
            pageIndex: 0,
            pageCount: 1,
            recordCount: 2,
            changedRecordCount: 0,
            removalCount: 0,
            previousPageHash: null,
            records: [],
            removedStableIds: [],
            pageHash: digest,
            signingKeyId: "key_1",
            signature: "dGVzdA"
          }]
        });
    const client = new ForgetBaseClient({
      baseUrl: "https://forgetbase.example.test",
      apiKey: "local-secret",
      surface: "local-cache",
      fetchImpl: fetchMock
    });

    await client.getLocalSyncConfiguration();
    await client.getLocalSyncManifest({
      knownAuthorizationEpoch: 4,
      knownContentGeneration: 9,
      knownRecordSetHash: digest
    });

    expect(calls.map((call) => call.url.pathname)).toEqual([
      "/local-sync/v1/configuration",
      "/local-sync/v1/manifest"
    ]);
    expect(calls[1]?.url.searchParams.get("knownAuthorizationEpoch")).toBe("4");
    expect(calls[1]?.url.searchParams.get("knownContentGeneration")).toBe("9");
    expect(calls[1]?.url.searchParams.get("knownRecordSetHash")).toBe(digest);
    expect(calls[1]?.headers.get("authorization")).toBe("Bearer local-secret");
    expect(calls[1]?.headers.get("x-forgetbase-surface")).toBe("local-cache");
  });

  it("rejects an oversized local-sync body before parsing it", async () => {
    const client = clientReturning(new Response('{"pages":[]}', {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(129 * 1024 * 1024)
      }
    }));

    await expect(client.getLocalSyncManifest()).rejects.toThrow(/client safety limit/);
  });

  it("maps the local-device enrollment, rotation, inventory, and revocation lifecycle", async () => {
    const token = localDeviceTokenFixture();
    const { fetchMock, calls } = mockFetch((call) => {
      if (call.url.pathname === "/local-sync/v1/device-sessions" && call.method === "POST") {
        return {
          approvalUrl: "https://forgetbase.example.test/?local-device-request=request-token",
          requestToken: "request-token",
          expiresAt: "2026-09-03T00:05:00.000Z"
        };
      }
      if (call.url.pathname.endsWith("/authorization/preview") && call.method === "POST") {
        return {
          serverId: "server_test",
          serverOrigin: "https://forgetbase.example.test",
          signingKeyId: "key_1",
          deviceName: "Test laptop",
          redirectHost: "127.0.0.1:45731",
          expiresAt: "2026-09-03T00:05:00.000Z"
        };
      }
      if (call.url.pathname.endsWith("/authorization") && call.method === "POST") {
        return { redirectUrl: "http://127.0.0.1:45731/forgetbase/local/callback?code=code&state=state" };
      }
      if (call.url.pathname.endsWith("/token") || call.url.pathname.endsWith("/refresh")) return token;
      if (call.url.pathname === "/local-sync/v1/device-sessions" && call.method === "GET") {
        return { devices: [token.deviceSession] };
      }
      return { session: { ...token.deviceSession, revokedAt: "2026-09-03T00:10:00.000Z" }, apiKey: apiKeyFixture() };
    });
    const publicClient = new ForgetBaseClient({
      baseUrl: "https://forgetbase.example.test",
      surface: "local-cache",
      fetchImpl: fetchMock
    });
    const browserClient = new ForgetBaseClient({
      baseUrl: "https://forgetbase.example.test",
      apiKey: "browser-key",
      surface: "web",
      fetchImpl: fetchMock
    });

    await publicClient.startLocalDeviceAuthorization({
      deviceName: "Test laptop",
      redirectUri: "http://127.0.0.1:45731/forgetbase/local/callback",
      state: "s".repeat(43),
      codeChallenge: "c".repeat(43),
      codeChallengeMethod: "S256"
    });
    await browserClient.getLocalDeviceAuthorizationPreview("request-token");
    await browserClient.approveLocalDeviceAuthorization({ requestToken: "request-token" });
    await publicClient.exchangeLocalDeviceAuthorization({ code: "authorization-code", codeVerifier: "v".repeat(43) });
    await publicClient.refreshLocalDeviceSession({ refreshToken: "r".repeat(40) });
    expect(await browserClient.listLocalDeviceSessions()).toEqual([token.deviceSession]);
    await browserClient.revokeLocalDeviceSession(token.deviceSession.id);

    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "POST /local-sync/v1/device-sessions",
      "POST /local-sync/v1/device-sessions/authorization/preview",
      "POST /local-sync/v1/device-sessions/authorization",
      "POST /local-sync/v1/device-sessions/token",
      "POST /local-sync/v1/device-sessions/refresh",
      "GET /local-sync/v1/device-sessions",
      `DELETE /local-sync/v1/device-sessions/${token.deviceSession.id}`
    ]);
    expect(calls[0]?.body).toMatchObject({ deviceName: "Test laptop", codeChallengeMethod: "S256" });
    expect(calls[1]?.body).toEqual({ requestToken: "request-token" });
    expect(calls[4]?.body).toEqual({ refreshToken: "r".repeat(40) });
    expect(calls[0]?.headers.get("authorization")).toBeNull();
    expect(calls[5]?.headers.get("authorization")).toBe("Bearer browser-key");
  });
});

function clientReturning(response: Response): ForgetBaseClient {
  return new ForgetBaseClient({
    baseUrl: "http://forgetbase.test",
    fetchImpl: vi.fn(async () => response) as typeof fetch
  });
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

    return new Response(JSON.stringify(handler(call)), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  }) as typeof fetch;

  return { fetchMock, calls };
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

interface FetchCall {
  url: URL;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

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
      clientUserAgent: "sdk-test",
      createdAt: "2026-09-03T00:00:00.000Z",
      expiresAt: "2026-09-03T00:30:00.000Z",
      absoluteExpiresAt: "2026-10-03T00:00:00.000Z",
      lastSeenAt: null,
      revokedAt: null
    }
  };
}

function apiKeyFixture() {
  return {
    id: "key_device",
    tenantId: "tenant_demo",
    userId: "user_device",
    serviceAccountId: null,
    name: "local-device:Test laptop",
    secretPreview: "fbase_...test",
    scopes: ["local:sync"],
    allowedSurfaces: ["local-cache"],
    expiresAt: "2026-09-03T00:30:00.000Z",
    lastUsedAt: null,
    revokedAt: "2026-09-03T00:10:00.000Z",
    createdAt: "2026-09-03T00:00:00.000Z"
  };
}
