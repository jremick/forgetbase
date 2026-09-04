import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../apps/api/src/server.js";
import { main as runCli } from "../packages/cli/src/index.js";
import { InMemoryAuthRepository, InMemoryRegistryRepository, InMemoryRetrievalRepository } from "../packages/db/src/index.js";
import { createMcpServer } from "../packages/mcp-server/src/server.js";
import { ForgetBaseClient, ForgetBaseHttpError } from "../packages/sdk/src/index.js";
import { assetDetailSchema, managedQueryResponseSchema, searchResponseSchema, type AssetCreateInput } from "../packages/schema/src/index.js";

describe("governed instruction and human-document workflow", () => {
  it("authors through CLI, consumes published versions through SDK and MCP, and enforces revocation on the existing clients", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const api = buildServer({ logger: false, registryRepository, authRepository, retrievalRepository });
    const directory = await mkdtemp(join(tmpdir(), "forgetbase-governed-workflow-"));
    const output: string[] = [];
    const stdout = vi.spyOn(console, "log").mockImplementation((value) => { output.push(String(value)); });
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    let connection: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
      const baseUrl = await api.listen({ host: "127.0.0.1", port: 0 });
      const bootstrap = await new ForgetBaseClient({ baseUrl }).bootstrapAuth({
        email: "workflow-admin@example.test", displayName: "Workflow Admin"
      });
      const author = new ForgetBaseClient({ baseUrl, apiKey: bootstrap.secret });
      const readerUser = await author.createUser({ email: "workflow-reader@example.test", displayName: "Workflow Reader", role: "reader" });
      const readerKey = await author.createApiKey({
        userId: readerUser.id, name: "workflow-reader", scopes: ["asset:read"], allowedSurfaces: ["api", "web", "cli", "mcp", "export"]
      });
      const reader = new ForgetBaseClient({ baseUrl, apiKey: readerKey.secret });
      connection = await connectMcp(baseUrl, readerKey.secret);
      const cli = async (args: string[], apiKey = bootstrap.secret) => {
        output.length = 0;
        expect(await runCli([...args, "--api-url", baseUrl, "--api-key", apiKey])).toBe(0);
        return JSON.parse(output.at(-1) ?? "null") as unknown;
      };
      const stableId = "playbook.governed-workflow";
      const input: AssetCreateInput = {
        stableId, type: "playbook", ownerId: bootstrap.user.id, title: "Governed release workflow",
        summary: "Synthetic guidance shared by people and agents.", lifecycleState: "draft", status: "draft",
        sensitivity: "internal", audience: ["release-operators"], reviewDueAt: "2027-12-31", sourceKind: "manual",
        allowedSurfaces: ["api", "web", "cli", "mcp", "export"], allowedExports: ["workflow-pack"],
        instruction: { instructionKind: "playbook", targetAgents: ["release-agent"], body: "governedworkflowfirst: check the approved release checklist before promotion." },
        humanDocument: { format: "markdown", body: "# Release checklist\n\ngovernedworkflowfirst: the operator checks the approved release checklist before promotion." }
      };
      const assetFile = join(directory, "asset.json");
      const corpusFile = join(directory, "corpus.json");
      await writeFile(assetFile, JSON.stringify(input));
      await writeFile(corpusFile, JSON.stringify([input]));
      const created = assetDetailSchema.parse(await cli(["assets", "create", "--file", assetFile]));
      expect(created.instructionObjects[0]?.versionId).toBe(created.humanDocuments[0]?.versionId);
      expect(created.instructionObjects[0]?.assetId).toBe(created.humanDocuments[0]?.assetId);
      expect(await cli(["corpus", "import", "--file", corpusFile])).toEqual({ total: 1, created: 0, skipped: 1 });
      expect(assetDetailSchema.parse(await cli(["assets", "get", stableId, "--preview"])).asset.currentVersionId).toBe(created.asset.currentVersionId);
      const grant = await author.grantAssetPermission({
        stableId, principalType: "user", principalId: readerUser.id, action: "read", surfaces: ["api", "web", "cli", "mcp"]
      });
      expect(await reader.getAsset(stableId)).toBeNull();

      await cli(["assets", "review", stableId, "--review-due-at", "2027-12-31"]);
      expect(await reader.getAsset(stableId)).toBeNull();
      const firstPublication = assetDetailSchema.parse(await cli(["assets", "publish", stableId]));
      const first = await reader.getAsset(stableId);
      expect(first?.asset.currentVersionId).toBe(firstPublication.asset.currentVersionId);
      expect(first?.instructionObjects[0]?.body).toContain("governedworkflowfirst");
      const mcpFirst = assetDetailSchema.parse(toolPayload(await connection.client.callTool({ name: "get_asset", arguments: { stableId } })));
      expect(mcpFirst.asset.currentVersionId).toBe(firstPublication.asset.currentVersionId);
      const search = await reader.search({ query: "governedworkflowfirst", limit: 10 });
      expect(new Set(search.results.map((result) => result.citation.sourceKind))).toEqual(new Set(["agent-instruction", "human-document"]));
      expect(search.results.every((result) => result.citation.versionId === firstPublication.asset.currentVersionId)).toBe(true);
      const managed = managedQueryResponseSchema.parse(toolPayload(await connection.client.callTool({
        name: "managed_query", arguments: { query: "governedworkflowfirst", mode: "deterministic-retrieval", limit: 5 }
      })));
      expect(managed.citations.length).toBeGreaterThan(0);
      expect(managed.citations.every((citation) => citation.stableId === stableId && citation.versionId === firstPublication.asset.currentVersionId)).toBe(true);

      const updateFile = join(directory, "update.json");
      await writeFile(updateFile, JSON.stringify({
        lifecycleState: "draft", status: "draft", changeNote: "Add the recovery checkpoint",
        instruction: { instructionKind: "playbook", targetAgents: ["release-agent"], body: "governedworkflowsecond: verify a recovery checkpoint before promotion." },
        humanDocument: { format: "markdown", body: "# Release checklist\n\ngovernedworkflowsecond: the operator verifies a recovery checkpoint before promotion." }
      }));
      await cli(["assets", "update", stableId, "--file", updateFile]);
      expect((await author.getAsset(stableId, { preview: true }))?.instructionObjects[0]?.body).toContain("governedworkflowsecond");
      expect((await reader.getAsset(stableId))?.asset.currentVersionId).toBe(firstPublication.asset.currentVersionId);
      expect(searchResponseSchema.parse(toolPayload(await connection.client.callTool({ name: "search_assets", arguments: { query: "governedworkflowsecond" } }))).results).toHaveLength(0);
      const nextPublication = assetDetailSchema.parse(await cli(["assets", "publish", stableId]));
      expect(nextPublication.asset.currentVersionId).not.toBe(firstPublication.asset.currentVersionId);
      const updatedMcp = assetDetailSchema.parse(toolPayload(await connection.client.callTool({ name: "get_asset", arguments: { stableId } })));
      expect(updatedMcp.instructionObjects[0]?.body).toContain("governedworkflowsecond");
      expect(updatedMcp.humanDocuments[0]?.body).toContain("governedworkflowsecond");
      const updatedSearch = searchResponseSchema.parse(await cli(["search", "--query", "governedworkflowsecond"], readerKey.secret));
      expect(updatedSearch.results.length).toBeGreaterThan(0);
      expect(updatedSearch.results.every((result) => result.citation.versionId === nextPublication.asset.currentVersionId)).toBe(true);
      expect((await reader.search({ query: "governedworkflowfirst" })).results).toHaveLength(0);

      await author.revokeAssetPermissionGrant(stableId, grant.id);
      await expect(reader.getAsset(stableId)).rejects.toMatchObject({ name: ForgetBaseHttpError.name, status: 403 });
      expect((await connection.client.callTool({ name: "get_asset", arguments: { stableId } })).isError).toBe(true);
      expect(searchResponseSchema.parse(toolPayload(await connection.client.callTool({ name: "search_assets", arguments: { query: "governedworkflowsecond" } }))).results).toHaveLength(0);
      expect(searchResponseSchema.parse(await cli(["search", "--query", "governedworkflowsecond"], readerKey.secret)).results).toHaveLength(0);
      expect((await reader.managedQuery({ query: "governedworkflowsecond", mode: "deterministic-retrieval" })).citations).toHaveLength(0);
      const webRead = await fetch(`${baseUrl}/assets/${stableId}`, {
        headers: { authorization: `Bearer ${readerKey.secret}`, "x-forgetbase-surface": "web" }
      });
      expect(webRead.status).toBe(403);
      expect(await webRead.text()).not.toContain("governedworkflowsecond");
    } finally {
      await connection?.client.close();
      await connection?.server.close();
      await api.close();
      stdout.mockRestore();
      stderr.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function connectMcp(apiUrl: string, apiKey: string) {
  // Resolve protocol dependencies from their owning workspace package.
  const requireMcp = createRequire(new URL("../packages/mcp-server/package.json", import.meta.url));
  const { Client } = await import(pathToFileURL(requireMcp.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
  const { InMemoryTransport } = await import(pathToFileURL(requireMcp.resolve("@modelcontextprotocol/sdk/inMemory.js")).href);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "governed-workflow-test", version: "0.0.0" });
  const server = createMcpServer({ apiUrl, apiKey });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

function toolPayload(result: unknown): unknown {
  const content = (result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean }).content;
  const text = content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool returned no text payload");
  return JSON.parse(text);
}
