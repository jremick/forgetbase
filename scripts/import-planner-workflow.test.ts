import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../apps/api/src/server.js";
import { main as runCli } from "../packages/cli/src/index.js";
import { createPool, InMemoryAuthRepository, InMemoryRegistryRepository, PostgresAuthRepository, PostgresRegistryRepository, runMigrations } from "../packages/db/src/index.js";
import { createMcpServer } from "../packages/mcp-server/src/server.js";
import { ForgetBaseClient } from "../packages/sdk/src/index.js";
import { agentInstructionInputSchema, humanDocumentInputSchema, type AssetDetail, type Surface } from "../packages/schema/src/index.js";
import { deriveImportSourceScopeId, importPlanSchema, type ImportEffectiveAccess, type ImportPlanRequest } from "../packages/schema/src/import-planner.js";

const source = { system: "synthetic", rootId: "planner-fixture", scopeId: "guides", sourceRefPrefix: "synthetic://planner/guides/" };
const sourceScopeId = deriveImportSourceScopeId(source);
const surfaces: Surface[] = ["api", "cli", "mcp"];
type Adapter = "memory" | "postgres";
const adapters: Adapter[] = process.env.TEST_DATABASE_URL ? ["memory", "postgres"] : ["memory"];

describe.each(adapters)("%s report-only governed import planning workflow", (adapter) => {
  it("classifies mixed draft targets through API, SDK, CLI and MCP without changing governed state", { timeout: 30_000 }, async () => {
    const fixture = await createFixture(adapter);
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
      const before = await fixture.state();
      const response = await fixture.post(fixture.request);
      expect(response.status).toBe(200);
      const report = importPlanSchema.parse(await response.json());
      expect(report).toMatchObject({ classificationComplete: true, executable: false, safeToApply: false, truncated: false });
      expect(report.counts).toEqual({ "would-create": 1, "would-noop": 2, "would-update-version": 2, "would-source-missing": 2, conflict: 0, excluded: 0 });
      expect(report.errors).toEqual([]);
      expect(report.items.find((item) => item.entity === "source" && item.sourceId === "same")?.action).toBe("would-noop");
      expect(report.items.find((item) => item.entity === "source" && item.sourceId === "changed")?.action).toBe("would-update-version");
      expect(report.items.find((item) => item.entity === "target" && item.sourceId === "missing")?.action).toBe("would-source-missing");
      expect(await fixture.author.getAsset("guide.same")).toBeNull();
      expect(await fixture.author.planImport(fixture.request)).toEqual(report);
      expect(await fixture.author.planImport(fixture.request)).toEqual(report);
      const cli = await fixture.cli(fixture.request, ["--fail-on-conflicts"]);
      expect(cli).toEqual({ code: 0, report });
      const example = JSON.parse(await readFile(new URL("../corpus/demo/import-plan.json", import.meta.url), "utf8")) as ImportPlanRequest;
      const exampleReport = await fixture.author.planImport({ ...example, tenantId: fixture.tenantId });
      expect(exampleReport.classificationComplete).toBe(true);
      expect(exampleReport.counts["would-create"]).toBe(1);
      expect(exampleReport.counts.conflict).toBe(0);
      await expect(runCli(["corpus", "plan", "--api-url", fixture.baseUrl, "--api-key", fixture.adminKey])).rejects.toThrow(/--file/);
      mcp = await connectMcp(fixture.baseUrl, fixture.adminKey);
      const tools = await mcp.client.listTools();
      const planTool = tools.tools.find((tool: { name: string }) => tool.name === "plan_import");
      expect(planTool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(planTool?.inputSchema.required).toEqual(["input"]);
      const mcpResult = await mcp.client.callTool({ name: "plan_import", arguments: { input: fixture.request } });
      expect(mcpResult.isError).not.toBe(true);
      expect(toolPayload(mcpResult)).toEqual(report);
      expect(await fixture.state()).toEqual(before);
      const openapi = await fetch(`${fixture.baseUrl}/openapi.json`).then((result) => result.json());
      expect(openapi.paths["/imports/plan"].post.responses).toHaveProperty("409");
      if (process.env.FORGETBASE_IMPORT_PLAN_EVIDENCE) {
        const path = resolve(`${process.env.FORGETBASE_IMPORT_PLAN_EVIDENCE}.${adapter}.json`);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify({
          adapter, contract: report.reportType, planDigest: report.planDigest, counts: report.counts,
          classificationComplete: report.classificationComplete, executable: report.executable,
          unchangedRegistryRevision: before.revision, unchangedGovernedState: true,
          verifiedConsumers: ["API", "SDK", "CLI", "MCP"], repeatedReportEqual: true
        }, null, 2)}\n`);
      }
    } finally {
      await mcp?.client.close();
      await mcp?.server.close();
      await fixture.close();
    }
  });

  it("reports duplicate and foreign-identity conflicts and makes strict CLI exit status actionable", { timeout: 30_000 }, async () => {
    const fixture = await createFixture(adapter);
    try {
      const foreign = structuredClone(fixture.request.candidates[0]!);
      await fixture.author.createAsset({
        stableId: foreign.governedSnapshot.assetSnapshot.stableId, type: "guideline", ownerId: fixture.ownerId,
        title: "Foreign source identity", lifecycleState: "draft", status: "review", sensitivity: "restricted",
        audience: ["reviewers"], reviewDueAt: "2027-12-31", allowedSurfaces: surfaces,
        sourceRef: "synthetic://another-root/foreign", metadata: { importSource: { ...sourceIdentity("foreign"), rootId: "another-root" } },
        humanDocument: { format: "markdown", body: "Foreign synthetic guidance." }
      });
      const conflicted = structuredClone(fixture.request);
      conflicted.candidates.push(structuredClone(conflicted.candidates[1]!));
      const before = await fixture.state();
      const report = await fixture.author.planImport(conflicted);
      expect(report.classificationComplete).toBe(false);
      expect(report.counts.conflict).toBeGreaterThan(0);
      expect(report.items.every((item) => !item.action.startsWith("would-"))).toBe(true);
      expect(await fixture.cli(conflicted)).toEqual({ code: 0, report });
      expect(await fixture.cli(conflicted, ["--fail-on-conflicts"])).toEqual({ code: 1, report });
      const incomplete = structuredClone(fixture.request);
      incomplete.snapshot.complete = false;
      incomplete.snapshot.continuation = { version: "continuation-v1", complete: false, nextCursor: "next-page", proof: "cursor" };
      const incompleteCli = await fixture.cli(incomplete, ["--fail-on-conflicts"]);
      expect(incompleteCli.code).toBe(1);
      expect(incompleteCli.report.classificationComplete).toBe(false);
      expect(await fixture.state()).toEqual(before);
      const malformedSources = [
        { sourceKind: source.system, metadata: { importSource: { ...sourceIdentity("malformed-extra"), unexpected: "field" } } },
        { sourceKind: source.system, metadata: { importSource: { system: source.system, scopeId: source.scopeId, sourceScopeId, sourceId: "malformed-missing-root" } } },
        { sourceKind: source.system, metadata: {} }
      ];
      for (const [index, malformed] of malformedSources.entries()) {
        await fixture.author.createAsset({
          stableId: `guide.malformed-${index}`, type: "guideline", ownerId: fixture.ownerId,
          title: "Unknown import identity", lifecycleState: "draft", status: "review", sensitivity: "restricted",
          audience: ["reviewers"], reviewDueAt: "2027-12-31", allowedSurfaces: surfaces,
          sourceKind: malformed.sourceKind, sourceRef: `${source.sourceRefPrefix}malformed-${index}`, metadata: malformed.metadata,
          humanDocument: { format: "markdown", body: "Synthetic malformed target body remains private." }
        });
      }
      const emptySource = structuredClone(fixture.request);
      emptySource.snapshot.records = [];
      emptySource.snapshot.totalCount = 0;
      emptySource.candidates = [];
      const beforeUnknownPlan = await fixture.state();
      const unknownReport = await fixture.author.planImport(emptySource);
      expect(unknownReport.classificationComplete).toBe(false);
      for (let index = 0; index < malformedSources.length; index++) {
        const item = unknownReport.items.find((entry) => entry.entity === "target" && entry.stableId === `guide.malformed-${index}`);
        expect(item, `Malformed scoped target ${index} must not disappear`).toBeDefined();
        expect(["conflict", "excluded"]).toContain(item?.action);
      }
      expect(JSON.stringify(unknownReport)).not.toContain("Synthetic malformed target body");
      expect(await fixture.state()).toEqual(beforeUnknownPlan);
      // Use an independent source scope so other malformed targets cannot hide this failure.
      const kindSource = { ...source, scopeId: "kind-binding", sourceRefPrefix: "synthetic://planner/kind-binding/" };
      await fixture.author.createAsset({
        stableId: "guide.kind-mismatch", type: "guideline", ownerId: fixture.ownerId,
        title: "Mismatched source kind", lifecycleState: "draft", status: "review", sensitivity: "restricted",
        audience: ["reviewers"], reviewDueAt: "2027-12-31", allowedSurfaces: surfaces,
        sourceKind: "different-source", sourceRef: `${kindSource.sourceRefPrefix}kind-mismatch`,
        metadata: { importSource: { system: kindSource.system, rootId: kindSource.rootId, scopeId: kindSource.scopeId,
          sourceScopeId: deriveImportSourceScopeId(kindSource), sourceId: "kind-mismatch" } },
        humanDocument: { format: "markdown", body: "Synthetic source-kind mismatch." }
      });
      const kindRequest = structuredClone(fixture.request);
      kindRequest.snapshot.source = kindSource;
      const kindCandidate = structuredClone(fixture.request.candidates[0]!);
      kindCandidate.sourceId = "kind-mismatch";
      kindCandidate.sourceContentSha256 = sourceDigest("kind-mismatch");
      Object.assign(kindCandidate.governedSnapshot.assetSnapshot, {
        stableId: "guide.kind-mismatch", sourceRef: `${kindSource.sourceRefPrefix}kind-mismatch`,
        metadata: { importSource: { system: kindSource.system, rootId: kindSource.rootId, scopeId: kindSource.scopeId,
          sourceScopeId: deriveImportSourceScopeId(kindSource), sourceId: "kind-mismatch" } }
      });
      kindRequest.candidates = [kindCandidate];
      const kindRecord = structuredClone(fixture.request.snapshot.records[0]!);
      kindRecord.sourceId = kindCandidate.sourceId;
      kindRecord.sourceContentSha256 = kindCandidate.sourceContentSha256;
      Object.assign(kindRecord.provenance, {
        sourceScopeId: deriveImportSourceScopeId(kindSource), sourceId: kindCandidate.sourceId,
        sourcePath: kindCandidate.governedSnapshot.assetSnapshot.sourceRef
      });
      kindRequest.snapshot.records = [kindRecord];
      kindRequest.snapshot.totalCount = 1;
      const beforeKindPlan = await fixture.state();
      const kindReport = await fixture.author.planImport(kindRequest);
      expect(kindReport.classificationComplete).toBe(false);
      const kindItem = kindReport.items.find((entry) => entry.entity === "target" && entry.stableId === "guide.kind-mismatch");
      expect(kindItem).toBeDefined();
      expect(["conflict", "excluded"]).toContain(kindItem?.action);
      expect(await fixture.state()).toEqual(beforeKindPlan);
    } finally { await fixture.close(); }
  });

  it("rejects client target assertions, malformed provenance, wrong tenants and unauthorized consumers", { timeout: 30_000 }, async () => {
    const fixture = await createFixture(adapter);
    let mcp: Awaited<ReturnType<typeof connectMcp>> | undefined;
    try {
      const before = await fixture.state();
      const forgedHash = structuredClone(fixture.request) as Record<string, any>;
      forgedHash.candidates[0].candidateContentHash = "a".repeat(64);
      const badProvenance = structuredClone(fixture.request) as Record<string, any>;
      badProvenance.candidates[0].governedSnapshot.assetSnapshot.metadata.importSource.sourceId = "forged-identity";
      const whitespaceReferences = [
        ` ${source.sourceRefPrefix}new`, `${source.sourceRefPrefix}new `, ` ${source.sourceRefPrefix}new `
      ].map((sourceRef) => {
        const input = structuredClone(fixture.request);
        input.candidates[0]!.governedSnapshot.assetSnapshot.sourceRef = sourceRef;
        input.snapshot.records[0]!.provenance.sourcePath = sourceRef;
        return input;
      });
      for (const invalid of [
        { ...fixture.request, targetManifest: { complete: true, targets: [] } }, forgedHash, badProvenance,
        { ...fixture.request, candidates: [{ sourceId: "invalid" }] }, ...whitespaceReferences
      ]) {
        const response = await fixture.post(invalid);
        expect(response.status).toBe(400);
        expect(await response.text()).not.toContain("Synthetic current body");
      }
      expect((await fixture.post({ ...fixture.request, tenantId: "tenant_other" })).status).toBe(403);
      expect((await fixture.post(fixture.request, null)).status).toBe(401);
      const maintainer = await fixture.author.createUser({ email: "planner-maintainer@example.test", displayName: "Planner maintainer", role: "maintainer" });
      const key = await fixture.author.createApiKey({ userId: maintainer.id, name: "planner-maintainer", scopes: ["asset:read", "asset:write"], allowedSurfaces: surfaces });
      const planner = new ForgetBaseClient({ baseUrl: fixture.baseUrl, apiKey: key.secret });
      const denied = await fixture.post(fixture.request, key.secret);
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ error: "access_denied" });
      const grants = [];
      for (const stableId of ["guide.same", "guide.changed", "guide.missing"]) {
        for (const action of ["read", "write"] as const) {
          grants.push(await fixture.author.grantAssetPermission({ stableId, principalType: "user", principalId: maintainer.id, action, surfaces }));
        }
      }
      expect((await planner.planImport(fixture.request)).reportType).toBe("classification-report-only-v1");
      const writeOnlyKey = await fixture.author.createApiKey({ userId: maintainer.id, name: "write-only", scopes: ["asset:write"], allowedSurfaces: surfaces });
      expect((await fixture.post(fixture.request, writeOnlyKey.secret)).status).toBe(403);
      const apiOnlyKey = await fixture.author.createApiKey({ userId: maintainer.id, name: "api-only", scopes: ["asset:read", "asset:write"], allowedSurfaces: ["api"] });
      expect((await fixture.post(fixture.request, apiOnlyKey.secret, "mcp")).status).toBe(403);
      mcp = await connectMcp(fixture.baseUrl, key.secret);
      const grant = grants.find((item) => item.stableId === "guide.same" && item.action === "read")!;
      await fixture.author.revokeAssetPermissionGrant(grant.stableId, grant.id);
      const afterGrantChanges = await fixture.state();
      await expect(planner.planImport(fixture.request)).rejects.toMatchObject({ status: 403 });
      expect((await mcp.client.callTool({ name: "plan_import", arguments: { input: fixture.request } })).isError).toBe(true);
      await expect(fixture.cli(fixture.request, [], key.secret)).rejects.toMatchObject({ status: 403 });
      expect(await fixture.state()).toEqual(afterGrantChanges);
      expect(afterGrantChanges.revision).toBe(before.revision);
      expect(afterGrantChanges.assets).toEqual(before.assets);
    } finally {
      await mcp?.client.close();
      await mcp?.server.close();
      await fixture.close();
    }
  });

  it("rejects a content revision change during target capture instead of returning a mixed report", { timeout: 30_000 }, async () => {
    const fixture = await createFixture(adapter);
    const readRevision = fixture.registry.getContentRevision.bind(fixture.registry);
    const control = vi.spyOn(fixture.registry, "getContentRevision").mockImplementationOnce(async (tenantId) => {
      const before = await readRevision(tenantId);
      await fixture.registry.updateAsset("guide.same", {
        tenantId, title: "Concurrent title change", metadata: { importSource: sourceIdentity("same") },
        instruction: { instructionKind: "guideline", body: "Synthetic concurrent version." }
      });
      return before;
    });
    try {
      const response = await fixture.post(fixture.request);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "import_target_changed" });
      expect((await fixture.author.getAsset("guide.same", { preview: true }))?.versions).toHaveLength(2);
    } finally { control.mockRestore(); await fixture.close(); }
  });

  it("rejects changed grant inventory even when the requesting administrator still has access", { timeout: 30_000 }, async () => {
    const fixture = await createFixture(adapter);
    const readGrants = fixture.auth.listPermissionGrants.bind(fixture.auth);
    const control = vi.spyOn(fixture.auth, "listPermissionGrants").mockImplementationOnce(async (input) => {
      const before = await readGrants(input);
      await fixture.auth.createPermissionGrant({ tenantId: fixture.tenantId, stableId: input.stableId, principalType: "user", principalId: fixture.ownerId, action: "export", surfaces: ["api"] });
      return before;
    });
    try {
      const revision = await fixture.registry.getContentRevision(fixture.tenantId);
      const response = await fixture.post(fixture.request);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "import_target_changed" });
      expect(await fixture.registry.getContentRevision(fixture.tenantId)).toBe(revision);
      control.mockRestore();
      const inFlightKey = await fixture.author.createApiKey({
        userId: fixture.ownerId, name: "revoked-during-plan", scopes: ["asset:read", "asset:write"], allowedSurfaces: surfaces
      });
      const readRevision = fixture.registry.getContentRevision.bind(fixture.registry);
      const revokeDuringCapture = vi.spyOn(fixture.registry, "getContentRevision").mockImplementationOnce(async (tenantId) => {
        const before = await readRevision(tenantId);
        await fixture.author.revokeApiKey(inFlightKey.apiKey.id);
        return before;
      });
      try {
        const denied = await fixture.post(fixture.request, inFlightKey.secret);
        expect(denied.status).toBe(401);
        expect(await denied.json()).not.toHaveProperty("planDigest");
        expect(await fixture.registry.getContentRevision(fixture.tenantId)).toBe(revision);
      } finally { revokeDuringCapture.mockRestore(); }
    } finally { control.mockRestore(); await fixture.close(); }
  });
});

async function createFixture(adapter: Adapter) {
  const pool = adapter === "postgres" ? createPool(process.env.TEST_DATABASE_URL!) : undefined;
  if (pool) await runMigrations(pool);
  const tenantId = adapter === "postgres" ? `tenant_import_plan_${randomUUID()}` : "tenant_demo";
  const registry = pool ? new PostgresRegistryRepository(pool) : new InMemoryRegistryRepository();
  const auth = pool ? new PostgresAuthRepository(pool) : new InMemoryAuthRepository();
  const api = buildServer({ logger: false, registryRepository: registry, authRepository: auth });
  const baseUrl = await api.listen({ host: "127.0.0.1", port: 0 });
  const directory = await mkdtemp(join(tmpdir(), "forgetbase-import-plan-"));
  const bootstrap = await new ForgetBaseClient({ baseUrl }).bootstrapAuth({ tenantId, email: "planner-admin@example.test", displayName: "Planner admin" });
  const author = new ForgetBaseClient({ baseUrl, apiKey: bootstrap.secret });
  const details: AssetDetail[] = [];
  for (const sourceId of ["same", "changed", "missing"]) {
    details.push(await author.createAsset({
      stableId: `guide.${sourceId}`, type: "guideline", ownerId: bootstrap.user.id, title: `Synthetic ${sourceId} guidance`,
      summary: "Synthetic report-only fixture", lifecycleState: "draft", status: sourceId === "same" ? "reviewing" : "review", sensitivity: "restricted",
      audience: ["reviewers"], reviewDueAt: "2027-12-31", sourceKind: "synthetic", sourceRef: `${source.sourceRefPrefix}${sourceId}`,
      allowedSurfaces: surfaces, metadata: { importSource: sourceIdentity(sourceId), "10": "ten", "2": "two", nested: { "20": "twenty", "3": "three" } },
      instruction: { instructionKind: "guideline", body: `Synthetic current body ${sourceId}.` },
      humanDocument: { format: "markdown", body: `# Synthetic ${sourceId} guidance\n\nReview before publication.` }
    }));
  }
  const grants = (await author.listAssetPermissionGrants("guide.same")).grants;
  const effectiveAccess: ImportEffectiveAccess = {
    accessContractVersion: "effective-access-v1", lifecycleState: "draft", publicationState: "draft", reviewState: "pending",
    sensitivity: "restricted", audience: ["reviewers"], allowedSurfaces: surfaces, allowedExports: [], allowedActions: [],
    effectiveGrants: grants.flatMap((grant) => grant.surfaces.map((surface) => ({ principalType: grant.principalType, principalId: grant.principalId, action: grant.action, surface, exportName: null })))
  };
  const candidates = details.map((detail): ImportPlanRequest["candidates"][number] => {
    const sourceId = detail.asset.stableId.slice("guide.".length);
    const version = detail.versions.find((entry) => entry.id === detail.asset.currentVersionId)!;
    if (!version.assetSnapshot) throw new Error("Fixture current version lacks governed metadata");
    return {
      sourceId, sourceContentSha256: sourceDigest(sourceId), effectiveAccess,
      governedSnapshot: {
        assetSnapshot: { ...version.assetSnapshot, ...(sourceId === "changed" ? { title: "Proposed changed guidance" } : {}) },
        instructionObjects: detail.instructionObjects.map((instruction) => agentInstructionInputSchema.parse({ ...instruction, escalation: instruction.escalation ?? undefined })),
        humanDocuments: detail.humanDocuments.map((document) => humanDocumentInputSchema.parse(document))
      }
    };
  });
  const newCandidate = structuredClone(candidates[0]!);
  newCandidate.sourceId = "new";
  newCandidate.sourceContentSha256 = sourceDigest("new");
  Object.assign(newCandidate.governedSnapshot.assetSnapshot, { stableId: "guide.new", title: "Proposed new guidance", sourceRef: `${source.sourceRefPrefix}new`, metadata: { importSource: sourceIdentity("new") } });
  candidates.unshift(newCandidate);
  const request: ImportPlanRequest = {
    tenantId,
    snapshot: {
      schemaVersion: "3", kind: "forgetbase.import-snapshot", snapshotId: "synthetic-planner-snapshot", source,
      capturedAt: "2026-09-28T00:00:00.000Z", sourceReadRevision: "synthetic-revision-1", correlationId: "synthetic-planner-workflow",
      complete: true, totalCount: 3, continuation: { version: "continuation-v1", complete: true, nextCursor: null, proof: "exhaustive" }, truncated: false,
      records: ["new", "same", "changed"].map((sourceId) => ({
        sourceId, sourceContentSha256: sourceDigest(sourceId), effectiveAccess,
        provenance: { sourceScopeId, sourceSystem: source.system, sourceRootId: source.rootId, sourceId, sourceParentId: null, sourceRevision: "synthetic-revision-1", snapshotId: "synthetic-planner-snapshot", sourcePath: `${source.sourceRefPrefix}${sourceId}` }
      }))
    }, candidates
  };
  return {
    api, registry, auth, tenantId, baseUrl, author, request, ownerId: bootstrap.user.id, adminKey: bootstrap.secret,
    post(input: unknown, apiKey: string | null = bootstrap.secret, surface = "api") {
      return fetch(`${baseUrl}/imports/plan`, { method: "POST", headers: { "content-type": "application/json", "x-forgetbase-surface": surface, ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(input) });
    },
    async cli(input: ImportPlanRequest, flags: string[] = [], apiKey = bootstrap.secret) {
      const file = join(directory, "plan.json");
      await writeFile(file, JSON.stringify(input));
      const output: string[] = [];
      const stdout = vi.spyOn(console, "log").mockImplementation((value) => output.push(String(value)));
      try {
        const code = await runCli(["corpus", "plan", "--file", file, ...flags, "--api-url", baseUrl, "--api-key", apiKey]);
        return { code, report: importPlanSchema.parse(JSON.parse(output.at(-1) ?? "null")) };
      } finally { stdout.mockRestore(); }
    },
    async state() {
      const records = await registry.listAssets({ tenantId, view: "current", limit: 200 });
      return {
        revision: await registry.getContentRevision(tenantId),
        assets: await Promise.all(records.map((asset) => registry.getAssetByStableId(asset.stableId, { tenantId, view: "current" }))),
        grants: await Promise.all(records.map((asset) => auth.listPermissionGrants({ tenantId, stableId: asset.stableId, limit: 200 })))
      };
    },
    async close() {
      await api.close();
      if (pool) { await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]); await pool.end(); }
      await rm(directory, { recursive: true, force: true });
    }
  };
}

function sourceIdentity(sourceId: string) { return { system: source.system, rootId: source.rootId, scopeId: source.scopeId, sourceScopeId, sourceId }; }
function sourceDigest(sourceId: string) { return createHash("sha256").update(`Synthetic source ${sourceId}`).digest("hex"); }

async function connectMcp(apiUrl: string, apiKey: string) {
  const requireMcp = createRequire(new URL("../packages/mcp-server/package.json", import.meta.url));
  const { Client } = await import(pathToFileURL(requireMcp.resolve("@modelcontextprotocol/sdk/client/index.js")).href);
  const { InMemoryTransport } = await import(pathToFileURL(requireMcp.resolve("@modelcontextprotocol/sdk/inMemory.js")).href);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "import-planner-workflow-test", version: "0.0.0" });
  const server = createMcpServer({ apiUrl, apiKey });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

function toolPayload(result: unknown): unknown {
  const text = (result as { content?: Array<{ type?: string; text?: string }> }).content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool returned no text payload");
  return JSON.parse(text);
}
