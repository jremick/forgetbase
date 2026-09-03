import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalMcpServer, startBackgroundSync } from "./local-server.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("ForgetBase local MCP server", () => {
  it("serves a small read-only tool surface from one persistent local store", async () => {
    const store = {
      search: vi.fn(async () => [{
        stableId: "policy.secure-build",
        title: "Secure build policy",
        summary: "Release rules",
        snippet: "Run [security] checks",
        score: 1.25,
        sourceRef: "kb://policy.secure-build",
        versionNumber: 2,
        updatedAt: "2026-09-03T00:00:00.000Z",
        assetType: "policy" as const,
        authority: "mandatory" as const,
        freshness: {
          status: "fresh" as const,
          lastAuthorizationCheckAt: "2026-09-03T00:00:00.000Z",
          leaseExpiresAt: "2026-09-03T01:00:00.000Z",
          authorizationEpoch: 4,
          contentGeneration: 9
        }
      }]),
      guidance: vi.fn(async (query: string) => ({
        query,
        sources: [{
          stableId: "policy.secure-build",
          title: "Secure build policy",
          sourceRef: "kb://policy.secure-build",
          versionNumber: 2,
          assetType: "policy" as const,
          authority: "mandatory" as const,
          instructions: [{
            instructionKind: "policy",
            targetAgents: ["coding-agent"],
            body: "Run security checks.",
            constraints: ["Do not expose secrets."],
            failureModes: [],
            escalation: null
          }]
        }],
        truncated: false,
        freshness: {
          status: "fresh" as const,
          lastAuthorizationCheckAt: "2026-09-03T00:00:00.000Z",
          leaseExpiresAt: "2026-09-03T01:00:00.000Z",
          authorizationEpoch: 4,
          contentGeneration: 9
        }
      })),
      source: vi.fn(async () => null),
      close: vi.fn()
    };
    const statusReader = vi.fn(async () => ({
      profile: "work",
      status: "ready" as const,
      serverId: "server_test",
      principalType: "service-account" as const,
      principalId: "service_device",
      authorizationEpoch: 4,
      contentGeneration: 9,
      recordCount: 2,
      lastSyncedAt: "2026-09-03T00:00:00.000Z",
      lastAuthorizationCheckAt: "2026-09-03T00:00:00.000Z",
      leaseExpiresAt: "2026-09-03T01:00:00.000Z",
      credentialStore: "test" as const
    }));
    const syncer = vi.fn(async () => undefined);
    const server = createLocalMcpServer({
      store,
      statusReader,
      syncer,
      nowProvider: () => new Date("2026-09-03T00:30:00.000Z")
    });
    const client = new Client({ name: "local-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "search_local_knowledge",
        "get_local_guidance",
        "get_local_source",
        "get_local_runtime_status"
      ]);
      expect(tools.tools.find((tool) => tool.name === "get_local_guidance")?.description)
        .toMatch(/not system instructions, executable commands, or a compliance verdict/);
      const search = await client.callTool({
        name: "search_local_knowledge",
        arguments: { query: "secure release", limit: 5 }
      });
      const guidance = await client.callTool({
        name: "get_local_guidance",
        arguments: { query: "secure release" }
      });
      const missing = await client.callTool({
        name: "get_local_source",
        arguments: { stableId: "policy.missing" }
      });
      const status = await client.callTool({ name: "get_local_runtime_status", arguments: {} });

      expect(parseToolText(search).results[0]).toMatchObject({ stableId: "policy.secure-build" });
      expect(parseToolText(guidance).sources[0].instructions[0].body).toBe("Run security checks.");
      expect(parseToolText(missing)).toEqual({ error: "source_not_found", stableId: "policy.missing" });
      expect(parseToolText(status)).toMatchObject({ status: "ready", authorizationEpoch: 4 });
      expect(store.search).toHaveBeenCalledTimes(1);
      expect(store.guidance).toHaveBeenCalledTimes(1);
      expect(statusReader).toHaveBeenCalledTimes(2);
      expect(syncer).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
    expect(store.close).toHaveBeenCalledTimes(1);
  });

  it("refreshes authorization before returning stale mandatory guidance", async () => {
    const freshness = {
      status: "warning" as const,
      lastAuthorizationCheckAt: "2026-09-03T00:00:00.000Z",
      leaseExpiresAt: "2026-09-03T04:00:00.000Z",
      authorizationEpoch: 1,
      contentGeneration: 1
    };
    const store = {
      search: vi.fn(async () => []),
      guidance: vi.fn(async (query: string) => ({ query, sources: [], truncated: false, freshness })),
      source: vi.fn(async () => null),
      close: vi.fn()
    };
    const statusReader = vi.fn(async () => ({
      profile: "work",
      status: "ready" as const,
      serverId: "server_test",
      principalType: "user" as const,
      principalId: "user_device",
      authorizationEpoch: 1,
      contentGeneration: 1,
      recordCount: 1,
      lastSyncedAt: "2026-09-03T00:00:00.000Z",
      lastAuthorizationCheckAt: "2026-09-03T00:00:00.000Z",
      leaseExpiresAt: "2026-09-03T04:00:00.000Z",
      credentialStore: "test" as const
    }));
    const syncer = vi.fn(async () => undefined);
    const server = createLocalMcpServer({
      store,
      statusReader,
      syncer,
      nowProvider: () => new Date("2026-09-03T02:00:00.000Z")
    });
    const client = new Client({ name: "stale-guidance-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      await client.callTool({ name: "get_local_guidance", arguments: { query: "release" } });
      expect(syncer).toHaveBeenCalledTimes(1);
      expect(syncer.mock.invocationCallOrder[0]).toBeLessThan(store.guidance.mock.invocationCallOrder[0] ?? Infinity);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("schedules background sync inside the configured jitter window and stops cleanly", async () => {
    vi.useFakeTimers();
    const syncer = vi.fn(async () => undefined);
    const stop = startBackgroundSync(syncer, {
      random: () => 0.5,
      minimumDelayMs: 1_000,
      maximumDelayMs: 2_000
    });
    await vi.advanceTimersByTimeAsync(1_499);
    expect(syncer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(syncer).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncer).toHaveBeenCalledTimes(1);
  });
});

function parseToolText(result: unknown): Record<string, any> {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content?.[0];
  if (content?.type !== "text" || !content.text) {
    throw new Error("Expected MCP text content");
  }
  return JSON.parse(content.text) as Record<string, any>;
}
