import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssetCreateInput } from "@forgetbase/schema";
import { AssetVersionConflictError, InMemoryRegistryRepository, PostgresRegistryRepository, runMigrations, type RegistryRepository } from "./index.js";

function assetInput(): AssetCreateInput {
  return {
    tenantId: `tenant_publication_${randomUUID()}`,
    stableId: "publication.guide",
    type: "human-document",
    ownerId: "publication-author",
    title: "Approved title",
    summary: "Approved summary",
    lifecycleState: "active",
    status: "approved",
    sensitivity: "public-demo",
    audience: ["everyone"],
    reviewDueAt: "2027-01-01",
    sourceRef: "source://approved",
    allowedSurfaces: ["api", "web", "mcp", "cli", "export"],
    allowedExports: ["approved-pack"],
    allowedActions: ["approved-action"],
    metadata: { readerSection: "Approved navigation" },
    humanDocument: { format: "markdown", body: "Approved guidance." }
  };
}

function publicationContract(repository: () => RegistryRepository) {
  it("allows only one editor to commit from a shared base and rejects an exact retry without creating another version", async () => {
    const input = assetInput();
    const repo = repository();
    const created = await repo.createAsset(input);
    const edits = ["Editor one", "Editor two"].map((body) => ({
      tenantId: input.tenantId,
      expectedVersionId: created.asset.currentVersionId!,
      lifecycleState: "draft" as const,
      humanDocument: { format: "markdown" as const, body }
    }));
    const results = await Promise.allSettled(edits.map((edit) => repo.updateAsset(input.stableId, edit)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const conflict = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(conflict.reason).toBeInstanceOf(AssetVersionConflictError);
    const current = await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId });
    expect(current?.versions).toHaveLength(2);
    const winningEdit = edits.find((edit) => edit.humanDocument.body === current?.humanDocuments[0]?.body)!;
    const revision = await repo.getContentRevision(input.tenantId);
    await expect(repo.updateAsset(input.stableId, winningEdit)).rejects.toBeInstanceOf(AssetVersionConflictError);
    expect(await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId })).toEqual(current);
    expect(await repo.getContentRevision(input.tenantId)).toBe(revision);
  });

  it.each(["review", "publish", "restore"] as const)("checks the expected head before %s and makes retries conflict without mutation", async (operation) => {
    const input = assetInput();
    const repo = repository();
    const created = await repo.createAsset(input);
    const edited = await repo.updateAsset(input.stableId, {
      tenantId: input.tenantId, expectedVersionId: created.asset.currentVersionId!, lifecycleState: "draft",
      humanDocument: { format: "markdown", body: "The newer draft" }
    });
    const mutate = (expectedVersionId: string) => operation === "review"
      ? repo.reviewAsset(input.stableId, { tenantId: input.tenantId, expectedVersionId, reviewDueAt: "2028-01-01" })
      : operation === "publish"
        ? repo.publishAsset(input.stableId, { tenantId: input.tenantId, expectedVersionId })
        : repo.restoreAssetVersion(input.stableId, { tenantId: input.tenantId, expectedVersionId, versionNumber: 1 });
    await expect(mutate(created.asset.currentVersionId!)).rejects.toBeInstanceOf(AssetVersionConflictError);
    expect(await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId })).toEqual(edited);
    const succeeded = await mutate(edited!.asset.currentVersionId!);
    expect(succeeded?.versions).toHaveLength(3);
    const revision = await repo.getContentRevision(input.tenantId);
    await expect(mutate(edited!.asset.currentVersionId!)).rejects.toBeInstanceOf(AssetVersionConflictError);
    expect(await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId })).toEqual(succeeded);
    expect(await repo.getContentRevision(input.tenantId)).toBe(revision);
  });

  it("retains only published content and metadata through editing and review until explicit publication", async () => {
    const input = assetInput();
    const repo = repository();
    const created = await repo.createAsset(input);
    const draft = await repo.updateAsset(input.stableId, {
      tenantId: input.tenantId,
      lifecycleState: "draft",
      status: "draft",
      title: "Confidential draft title",
      summary: "Confidential draft summary",
      sourceRef: "source://confidential-draft",
      metadata: { readerSection: "Confidential draft navigation" },
      humanDocument: { format: "markdown", body: "Confidential draft guidance." }
    });
    await repo.reviewAsset(input.stableId, { tenantId: input.tenantId, status: "approved", reviewDueAt: "2028-01-01" });
    const published = await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" });
    expect(draft?.asset.currentVersionId).not.toBe(created.asset.currentVersionId);
    expect(published?.asset.currentVersionId).toBe(created.asset.currentVersionId);
    expect(published?.asset.publishedVersionId).toBe(created.asset.currentVersionId);
    expect(published?.asset).toMatchObject({
      title: input.title, summary: input.summary, sourceRef: input.sourceRef,
      metadata: input.metadata, lifecycleState: "active", status: "approved", reviewDueAt: input.reviewDueAt
    });
    expect(published?.versions).toHaveLength(1);
    expect(published?.humanDocuments.map((document) => document.body)).toEqual(["Approved guidance."]);
    expect(JSON.stringify(published)).not.toContain("Confidential draft");

    const publication = await repo.publishAsset(input.stableId, { tenantId: input.tenantId });
    const next = await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" });
    expect(next?.asset.currentVersionId).toBe(publication?.asset.currentVersionId);
    expect(next?.humanDocuments[0]?.body).toBe("Confidential draft guidance.");
    expect(next?.versions).toHaveLength(1);
  });

  it("keeps a new draft unavailable even when an update or review marks it approved", async () => {
    const input = { ...assetInput(), lifecycleState: "draft" as const, status: "draft" };
    const repo = repository();
    await repo.createAsset(input);
    await repo.updateAsset(input.stableId, {
      tenantId: input.tenantId, lifecycleState: "active", status: "approved",
      humanDocument: { format: "markdown", body: "Still needs explicit publication." }
    });
    await repo.reviewAsset(input.stableId, { tenantId: input.tenantId, status: "approved", reviewDueAt: "2028-01-01" });
    expect(await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" })).toBeNull();
    expect((await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "current" }))?.humanDocuments[0]?.body)
      .toBe("Still needs explicit publication.");
  });

  it("applies tightened access immediately and restores content into a new draft without restoring older permissions", async () => {
    const input = assetInput();
    const repo = repository();
    const original = await repo.createAsset(input);
    await repo.updateAsset(input.stableId, {
      tenantId: input.tenantId, lifecycleState: "draft", status: "draft",
      sensitivity: "restricted", audience: ["security"], allowedSurfaces: ["api"],
      allowedExports: [], allowedActions: [],
      humanDocument: { format: "markdown", body: "Restricted newer guidance." }
    });
    const tightened = await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" });
    expect(tightened?.asset).toMatchObject({ sensitivity: "restricted", allowedSurfaces: ["api"], allowedExports: [], allowedActions: [] });
    expect(tightened?.humanDocuments[0]?.body).toBe("Approved guidance.");
    const newer = await repo.publishAsset(input.stableId, { tenantId: input.tenantId });
    const restored = await repo.restoreAssetVersion(input.stableId, { tenantId: input.tenantId, versionNumber: 1 });
    expect(restored?.asset.currentVersionId).not.toBe(original.asset.currentVersionId);
    expect(restored?.asset).toMatchObject({
      lifecycleState: "draft", status: "draft", sensitivity: "restricted", audience: ["security"],
      allowedSurfaces: ["api"], allowedExports: [], allowedActions: [], publishedVersionId: newer?.asset.currentVersionId
    });
    expect(restored?.humanDocuments[0]?.body).toBe("Approved guidance.");
    const visible = await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" });
    expect(visible?.humanDocuments[0]?.body).toBe("Restricted newer guidance.");
    await repo.publishAsset(input.stableId, { tenantId: input.tenantId });
    expect((await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" }))?.humanDocuments[0]?.body)
      .toBe("Approved guidance.");
  });

  it("withdraws publication on archival and requires explicit publication after restore", async () => {
    const input = assetInput();
    const repo = repository();
    await repo.createAsset(input);
    await repo.updateAsset(input.stableId, {
      tenantId: input.tenantId, lifecycleState: "archived", humanDocument: { format: "markdown", body: "Archived." }
    });
    expect(await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" })).toBeNull();
    await repo.restoreAssetVersion(input.stableId, { tenantId: input.tenantId, versionNumber: 1 });
    expect(await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" })).toBeNull();
  });

  it("does not widen published permissions when a draft lowers sensitivity or adds surfaces", async () => {
    const input = { ...assetInput(), sensitivity: "restricted" as const, allowedSurfaces: ["api"] as const };
    const repo = repository();
    await repo.createAsset({ ...input, allowedSurfaces: [...input.allowedSurfaces] });
    await repo.updateAsset(input.stableId, {
      tenantId: input.tenantId, lifecycleState: "draft", sensitivity: "public-demo", allowedSurfaces: ["api", "web"],
      humanDocument: { format: "markdown", body: "Unpublished permission widening." }
    });
    const visible = await repo.getAssetByStableId(input.stableId, { tenantId: input.tenantId, view: "published" });
    expect(visible?.asset.sensitivity).toBe("restricted");
    expect(visible?.asset.allowedSurfaces).toEqual(["api"]);
  });
}

describe("in-memory publication isolation", () => publicationContract(() => new InMemoryRegistryRepository()));

describe.skipIf(!process.env.TEST_DATABASE_URL)("Postgres publication isolation", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await runMigrations(pool);
  });
  afterAll(async () => { await pool?.end(); });
  publicationContract(() => new PostgresRegistryRepository(pool));

  it("migrates only a currently approved head and rejects a published pointer to another asset", async () => {
    const client = await pool.connect();
    const approvedAsset = randomUUID();
    const draftAsset = randomUUID();
    const approvedVersion = randomUUID();
    const historicalVersion = randomUUID();
    const draftVersion = randomUUID();
    try {
      await client.query("BEGIN");
      // Temporary tables shadow production names only on this test connection.
      await client.query(`CREATE TEMP TABLE assets (
        id uuid PRIMARY KEY, tenant_id text, lifecycle_state text, status text, current_version_id uuid
      ) ON COMMIT DROP`);
      await client.query(`CREATE TEMP TABLE asset_versions (
        id uuid PRIMARY KEY, asset_id uuid, asset_snapshot jsonb, UNIQUE (asset_id, id)
      ) ON COMMIT DROP`);
      await client.query(`INSERT INTO assets VALUES
        ($1, 'tenant_migration', 'active', 'approved', $2),
        ($3, 'tenant_migration', 'draft', 'draft', $4)`, [approvedAsset, approvedVersion, draftAsset, draftVersion]);
      await client.query(`INSERT INTO asset_versions VALUES
        ($1, $2, '{"lifecycleState":"active","status":"approved"}'),
        ($3, $4, '{"lifecycleState":"active","status":"approved"}'),
        ($5, $4, '{"lifecycleState":"draft","status":"draft"}')`,
      [approvedVersion, approvedAsset, historicalVersion, draftAsset, draftVersion]);
      await client.query(await readFile(new URL("../migrations/038_published_versions.sql", import.meta.url), "utf8"));
      const migrated = await client.query<{ id: string; published_version_id: string | null }>("SELECT id, published_version_id FROM assets");
      expect(migrated.rows.find((row) => row.id === approvedAsset)?.published_version_id).toBe(approvedVersion);
      expect(migrated.rows.find((row) => row.id === draftAsset)?.published_version_id).toBeNull();
      await client.query("UPDATE assets SET published_version_id = $1 WHERE id = $2", [approvedVersion, draftAsset]);
      await expect(client.query("SET CONSTRAINTS ALL IMMEDIATE")).rejects.toThrow(/assets_published_asset_version_fkey/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
