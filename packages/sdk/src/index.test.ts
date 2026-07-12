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
      headers: new Headers(init?.headers)
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
}
