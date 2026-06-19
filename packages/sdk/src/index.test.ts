import { describe, expect, it, vi } from "vitest";
import { buildOkfExportPackage, type AiExportPackage } from "@agentic-cms/schema";
import { AgenticCmsClient } from "./index.js";

describe("Agentic CMS SDK beta contract", () => {
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
    const client = new AgenticCmsClient({
      baseUrl: "http://agentic-cms.test/",
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
      expect(call.headers.get("x-agentic-cms-surface")).toBe("api");
    }
  });
});

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
