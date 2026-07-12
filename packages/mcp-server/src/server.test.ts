import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOkfExportPackage, type AiExportPackage, type AssetDetail } from "@forgetbase/schema";
import { createMcpServer } from "./server.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ForgetBase MCP server contract", () => {
  it("registers core tools and serves static asset type metadata", async () => {
    const { client, server } = await connectMcp();

    try {
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);
      const searchTool = tools.tools.find((tool) => tool.name === "search_assets");
      const fetchTool = tools.tools.find((tool) => tool.name === "get_asset");
      const exportTool = tools.tools.find((tool) => tool.name === "generate_ai_export");

      expect(toolNames).toEqual(expect.arrayContaining([
        "list_asset_types",
        "get_asset",
        "search_assets",
        "generate_ai_export",
        "validate_context_access"
      ]));
      expect(searchTool?.inputSchema.required).toEqual(["query"]);
      expect(searchTool?.inputSchema.properties).toHaveProperty("limit");
      expect(searchTool?.inputSchema.properties).toHaveProperty("strategy");
      expect(fetchTool?.inputSchema.required).toEqual(["stableId"]);
      expect(exportTool?.inputSchema.properties).toHaveProperty("packageName");
      expect(exportTool?.inputSchema.properties).toHaveProperty("format");
      expect(exportTool?.inputSchema.properties).toHaveProperty("okfVersion");

      const result = await client.callTool({
        name: "list_asset_types",
        arguments: {}
      });
      const payload = parseToolText(result);

      expect(payload.assetTypes).toContain("guardrail");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("forwards search tool calls to the API with MCP surface headers", async () => {
    const { fetchMock, calls } = mockFetch(() => searchResponseFixture("PII"));
    const { client, server } = await connectMcp(fetchMock);

    try {
      const result = await client.callTool({
        name: "search_assets",
        arguments: {
          query: "PII"
        }
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url.pathname).toBe("/search");
      expect(calls[0]?.url.searchParams.get("query")).toBe("PII");
      expect(calls[0]?.url.searchParams.get("limit")).toBe("10");
      expect(calls[0]?.url.searchParams.get("strategy")).toBe("lexical");
      expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-key");
      expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("mcp");
      expect(parseToolText(result)).toMatchObject({
        query: "PII",
        results: []
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("forwards fetch and OKF export tool calls through the canonical API path", async () => {
    const jsonPackage = betaJsonExportPackage();
    const okfPackage = buildOkfExportPackage(jsonPackage, { okfVersion: "0.1" });
    const { fetchMock, calls } = mockFetch((call) => {
      if (call.url.pathname === "/assets/policy.beta-public-export") {
        return betaAssetDetailFixture();
      }

      return okfPackage;
    });
    const { client, server } = await connectMcp(fetchMock);

    try {
      const fetchResult = await client.callTool({
        name: "get_asset",
        arguments: {
          stableId: "policy.beta-public-export"
        }
      });
      const exportResult = await client.callTool({
        name: "generate_ai_export",
        arguments: {
          packageName: "demo-agent-pack",
          format: "okf",
          okfVersion: "0.1"
        }
      });

      expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
        "GET /assets/policy.beta-public-export",
        "GET /exports/ai-package"
      ]);
      expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-key");
      expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("mcp");
      expect(calls[1]?.url.searchParams.get("package")).toBe("demo-agent-pack");
      expect(calls[1]?.url.searchParams.get("format")).toBe("okf");
      expect(calls[1]?.url.searchParams.get("okfVersion")).toBe("0.1");
      expect(calls[1]?.headers.get("authorization")).toBe("Bearer test-key");
      expect(calls[1]?.headers.get("x-forgetbase-surface")).toBe("mcp");
      expect(parseToolText(fetchResult)).toMatchObject({
        asset: {
          stableId: "policy.beta-public-export",
          allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
          allowedExports: ["demo-agent-pack"]
        }
      });
      expect(parseToolText(exportResult)).toMatchObject({
        format: "okf",
        packageName: "demo-agent-pack",
        okfVersion: "0.1",
        assetCount: 1,
        deniedCount: 1,
        rootIndexPath: "index.md"
      });
      const exportPayload = parseToolText(exportResult);
      const conceptFile = (exportPayload.files as Array<{ path: string; content: string }>).find((file) => file.path.startsWith("policies/"));
      expect(conceptFile?.path).toMatch(/^policies\/policy-beta-public-export-[a-f0-9]+\.md$/);
      expect(conceptFile?.content).toContain("stable_id: \"policy.beta-public-export\"");
      expect(JSON.stringify(exportPayload)).not.toContain("Restricted beta export instruction");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("forwards JSON export tool calls through the canonical API path", async () => {
    const { fetchMock, calls } = mockFetch(() => betaJsonExportPackage());
    const { client, server } = await connectMcp(fetchMock);

    try {
      const exportResult = await client.callTool({
        name: "generate_ai_export",
        arguments: {
          packageName: "demo-agent-pack",
          format: "json"
        }
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url.pathname).toBe("/exports/ai-package");
      expect(calls[0]?.url.searchParams.get("package")).toBe("demo-agent-pack");
      expect(calls[0]?.url.searchParams.get("format")).toBe("json");
      expect(calls[0]?.url.searchParams.has("okfVersion")).toBe(false);
      expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-key");
      expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("mcp");
      expect(parseToolText(exportResult)).toMatchObject({
        packageName: "demo-agent-pack",
        assetCount: 1,
        deniedCount: 1,
        assets: [
          {
            stableId: "policy.beta-public-export",
            allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
            allowedExports: ["demo-agent-pack"]
          }
        ]
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it.each([
    { status: 401, code: "authentication_required" },
    { status: 403, code: "access_denied" },
    { status: 404, code: "asset_not_found" }
  ])("converts hidden asset access ($status/$code) into the same denied context result", async ({ status, code }) => {
    const { fetchMock, calls } = mockFetch(() => ({ error: code }), status);
    const { client, server } = await connectMcp(fetchMock);

    try {
      const result = await client.callTool({
        name: "validate_context_access",
        arguments: {
          stableId: "guardrail.hidden"
        }
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url.pathname).toBe("/assets/guardrail.hidden");
      expect(calls[0]?.headers.get("x-forgetbase-surface")).toBe("mcp");
      expect(parseToolText(result)).toEqual({
        stableId: "guardrail.hidden",
        surface: "mcp",
        allowed: false,
        reason: "asset_not_found_or_not_visible"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("propagates server failures even when their response reuses an access-denied code", async () => {
    const { fetchMock } = mockFetch(() => ({ error: "access_denied" }), 500);
    const { client, server } = await connectMcp(fetchMock);

    try {
      const result = await client.callTool({
        name: "validate_context_access",
        arguments: { stableId: "guardrail.hidden" }
      });
      const content = (result as { content?: Array<{ text?: string }>; isError?: boolean }).content?.[0];

      expect(result.isError).toBe(true);
      expect(content?.text).toContain("HTTP 500");
      expect(content?.text).not.toContain("asset_not_found_or_not_visible");
    } finally {
      await client.close();
      await server.close();
    }
  });
});

async function connectMcp(fetchImpl: typeof fetch = unexpectedFetch()): Promise<{
  client: Client;
  server: ReturnType<typeof createMcpServer>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "forgetbase-contract-tests",
    version: "0.0.0"
  });
  const server = createMcpServer({
    apiUrl: "http://forgetbase.test",
    apiKey: "test-key",
    fetchImpl
  });

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);

  return { client, server };
}

function unexpectedFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("Unexpected API request from static MCP tool");
  }) as typeof fetch;
}

function mockFetch(handler: (call: FetchCall) => unknown, status = 200): {
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
      status,
      headers: {
        "content-type": "application/json"
      }
    });
  }) as typeof fetch;

  return { fetchMock, calls };
}

function parseToolText(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content?.[0];
  expect(content?.type).toBe("text");
  expect(content?.text).toBeTruthy();
  return JSON.parse(content?.text ?? "{}") as Record<string, unknown>;
}

function searchResponseFixture(query: string): Record<string, unknown> {
  return {
    query,
    results: [],
    telemetryEventId: null
  };
}

function betaAssetDetailFixture(): AssetDetail {
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
      metadata: {},
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z"
    },
    versions: [
      {
        id: "version_beta_public_1",
        assetId: "asset_beta_public",
        versionNumber: 1,
        contentHash: "sha256:public-content",
        metadata: {},
        createdBy: "user_admin",
        createdAt: "2026-06-19T00:00:00.000Z",
        changeNote: "Initial beta contract fixture"
      }
    ],
    instructionObjects: [
      {
        id: "instruction_beta_public_1",
        assetId: "asset_beta_public",
        versionId: "version_beta_public_1",
        instructionKind: "policy",
        targetAgents: [],
        body: "Beta public export instruction for canonical agent connector packages.",
        inputContract: {},
        outputContract: {},
        constraints: [],
        examples: [],
        failureModes: [],
        escalation: null,
        createdAt: "2026-06-19T00:00:00.000Z"
      }
    ],
    humanDocuments: [
      {
        id: "doc_beta_public_1",
        assetId: "asset_beta_public",
        versionId: "version_beta_public_1",
        format: "markdown",
        body: "# Beta Public Export Policy",
        renderOptions: {},
        linkedInstructionIds: [],
        createdAt: "2026-06-19T00:00:00.000Z"
      }
    ]
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

interface FetchCall {
  url: URL;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}
