import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssetCreateInput } from "@forgetbase/schema";
import {
  InMemoryRegistryRepository,
  InMemoryRetrievalRepository,
  PostgresRegistryRepository,
  PostgresRetrievalRepository,
  runMigrations,
  type RegistryRepository
} from "./index.js";
import type { RetrievalRepository } from "./retrieval.js";

function fixture(): AssetCreateInput {
  return {
    tenantId: `tenant_raw_retrieval_${randomUUID()}`,
    stableId: "raw-retrieval.guide",
    type: "guardrail",
    ownerId: "retrieval-author",
    title: "Approved retrieval title",
    summary: "Approved retrieval summary",
    lifecycleState: "active",
    status: "approved",
    sensitivity: "internal",
    audience: ["team"],
    reviewDueAt: "2027-01-01",
    sourceRef: "source://approved",
    allowedSurfaces: ["api", "mcp"],
    allowedExports: ["approved-pack"],
    allowedActions: ["approved-action"],
    metadata: { readerSection: "Approved navigation" },
    instruction: { instructionKind: "guardrail", body: "publishedretrievaltoken" }
  };
}

function rawRetrievalContract(repositories: () => { registry: RegistryRepository; retrieval: RetrievalRepository }) {
  it("returns published metadata and version with the latest reconciled policy after a draft edit", async () => {
    const { registry, retrieval } = repositories();
    const input = fixture();
    const created = await registry.createAsset(input);
    await retrieval.indexAsset(created);
    const draft = await registry.updateAsset(input.stableId, {
      tenantId: input.tenantId,
      lifecycleState: "draft",
      status: "draft",
      title: "private-draft title",
      summary: "private-draft summary",
      sourceRef: "source://private-draft",
      metadata: { readerSection: "private-draft navigation" },
      sensitivity: "restricted",
      allowedSurfaces: ["api"],
      allowedExports: [],
      allowedActions: [],
      instruction: { instructionKind: "guardrail", body: "privatedraftretrievaltoken" }
    });
    expect(await retrieval.indexAsset(draft!)).toMatchObject({ chunksIndexed: 0 });

    // Call the repository directly: no API projection or authorization wrapper.
    const results = await retrieval.search({ tenantId: input.tenantId, query: "publishedretrievaltoken" });
    const published = await registry.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" });
    expect(results).toHaveLength(1);
    expect(results[0]?.asset).toEqual(published?.asset);
    expect(results[0]?.asset).toMatchObject({
      title: input.title, summary: input.summary, sourceRef: input.sourceRef, metadata: input.metadata,
      currentVersionId: created.asset.currentVersionId, publishedVersionId: created.asset.currentVersionId,
      sensitivity: "restricted", allowedSurfaces: ["api"], allowedExports: [], allowedActions: []
    });
    expect(results[0]?.citation).toMatchObject({
      versionId: created.asset.currentVersionId, title: `${input.title} instruction`, sourceRef: input.sourceRef
    });
    expect(JSON.stringify(results)).not.toContain("private-draft");
    expect(await retrieval.search({ tenantId: input.tenantId, query: "privatedraftretrievaltoken" })).toEqual([]);
  });

  it("excludes a withdrawn publication before the result limit when current and published surfaces no longer overlap", async () => {
    const { registry, retrieval } = repositories();
    const input = fixture();
    const blocked = await registry.createAsset({ ...input, stableId: "a.blocked", allowedSurfaces: ["api"] });
    const visible = await registry.createAsset({ ...input, stableId: "z.visible", allowedSurfaces: ["api"] });
    await retrieval.indexAsset(blocked);
    await retrieval.indexAsset(visible);
    const draft = await registry.updateAsset(blocked.asset.stableId, {
      tenantId: input.tenantId,
      allowedSurfaces: ["web"],
      instruction: { instructionKind: "guardrail", body: "Unpublished replacement" }
    });
    await retrieval.indexAsset(draft!);
    expect(await registry.getAssetByStableId(blocked.asset.stableId, { tenantId: input.tenantId, view: "published" })).toBeNull();
    const results = await retrieval.search({ tenantId: input.tenantId, query: "publishedretrievaltoken", limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]?.asset.id).toBe(visible.asset.id);
  });
}

describe("in-memory raw retrieval publication", () => rawRetrievalContract(() => ({
  registry: new InMemoryRegistryRepository(), retrieval: new InMemoryRetrievalRepository()
})));

describe.skipIf(!process.env.TEST_DATABASE_URL)("Postgres raw retrieval publication", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await runMigrations(pool);
  });
  afterAll(async () => { await pool?.end(); });
  rawRetrievalContract(() => ({
    registry: new PostgresRegistryRepository(pool), retrieval: new PostgresRetrievalRepository(pool)
  }));
});
