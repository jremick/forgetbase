import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool, runMigrations, InMemoryAssetChangeOutboxRepository, InMemoryRegistryRepository,
  InMemoryRetrievalRepository, InMemoryManagedQueryCacheRepository, LocalHashEmbeddingProvider,
  PostgresAssetChangeOutboxRepository, PostgresRegistryRepository, PostgresRetrievalRepository,
  PostgresManagedQueryCacheRepository, type EmbeddingProvider
} from "@forgetbase/db";
import type { AssetCreateInput } from "@forgetbase/schema";
import { reconcileAssetChanges } from "./asset-changes.js";

const assetInput = {
  stableId: "policy.worker", type: "policy", ownerId: "synthetic-owner", title: "Worker policy",
  lifecycleState: "active", status: "approved", sensitivity: "internal", audience: ["team"],
  reviewDueAt: "2027-09-05", allowedSurfaces: ["api", "mcp"],
  instruction: { instructionKind: "policy", body: "publishedoutboxanchor" }
} satisfies AssetCreateInput;

describe("asset change reconciliation", () => {
  it("keeps failed work retryable, indexes only published content, and reports no raw errors", async () => {
    let now = new Date("2026-09-05T00:00:00Z");
    const outbox = new InMemoryAssetChangeOutboxRepository(() => now);
    const registry = new InMemoryRegistryRepository();
    let failCache = true;
    class FlakyCache extends InMemoryManagedQueryCacheRepository {
      override async invalidateTenant(input: { tenantId?: string; dryRun?: boolean } = {}): Promise<number> {
        if (failCache) throw new Error("provider-secret-and-private-content");
        return super.invalidateTenant(input);
      }
    }
    const retrieval = new InMemoryRetrievalRepository();
    const cache = new FlakyCache();
    const detail = await registry.createAsset(assetInput);
    await registry.updateAsset(detail.asset.stableId, {
      lifecycleState: "draft", status: "draft",
      instruction: { instructionKind: "policy", body: "unapprovedoutboxanchor" }
    });
    await outbox.recordChange({ tenantId: detail.asset.tenantId, assetId: detail.asset.id, stableId: detail.asset.stableId });
    const first = await reconcileAssetChanges({ outbox, registry, retrieval, cache });
    expect(first).toMatchObject({ completed: 0, retryScheduled: 1, errors: { asset_cache_invalidation_failed: 1 }, health: { pending: 1 } });
    expect(JSON.stringify(first)).not.toContain("provider-secret");
    expect(await retrieval.search({ query: "unapprovedoutboxanchor" })).toEqual([]);
    expect((await retrieval.search({ query: "publishedoutboxanchor" }))[0]?.content).toBe("publishedoutboxanchor");
    failCache = false;
    now = new Date(now.getTime() + 1_000);
    const second = await reconcileAssetChanges({ outbox, registry, retrieval, cache });
    expect(second).toMatchObject({ completed: 1, retryScheduled: 0, health: { pending: 0, processing: 0, failed: 0 } });
  });

  it("clears an inaccessible published projection while retaining another tenant's index", async () => {
    const outbox = new InMemoryAssetChangeOutboxRepository();
    const registry = new InMemoryRegistryRepository();
    const retrieval = new InMemoryRetrievalRepository();
    const cache = new InMemoryManagedQueryCacheRepository();
    const first = await registry.createAsset({ ...assetInput, tenantId: "tenant_one" });
    const other = await registry.createAsset({ ...assetInput, tenantId: "tenant_two" });
    await retrieval.indexAsset(first);
    await retrieval.indexAsset(other);
    await registry.updateAsset(first.asset.stableId, {
      tenantId: "tenant_one", allowedSurfaces: ["web"], status: "draft", lifecycleState: "draft",
      instruction: assetInput.instruction
    });
    expect(await registry.getAssetByStableId(first.asset.stableId, { tenantId: "tenant_one", view: "published" })).toBeNull();
    await outbox.recordChange({ tenantId: "tenant_one", assetId: first.asset.id, stableId: first.asset.stableId });
    expect((await reconcileAssetChanges({ outbox, registry, retrieval, cache }, { tenantId: "tenant_one" })).completed).toBe(1);
    expect(await retrieval.search({ tenantId: "tenant_one", query: "publishedoutboxanchor" })).toEqual([]);
    expect(await retrieval.search({ tenantId: "tenant_two", query: "publishedoutboxanchor" })).toHaveLength(1);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL asset change reconciliation", () => {
  let pool: ReturnType<typeof createPool>;
  let registry: PostgresRegistryRepository;
  let outbox: PostgresAssetChangeOutboxRepository;
  let cache: PostgresManagedQueryCacheRepository;
  beforeAll(async () => {
    pool = createPool(process.env.TEST_DATABASE_URL);
    await runMigrations(pool);
    registry = new PostgresRegistryRepository(pool);
    outbox = new PostgresAssetChangeOutboxRepository(pool);
    cache = new PostgresManagedQueryCacheRepository(pool);
  });
  afterAll(async () => { await pool.end(); });

  async function seed() {
    return registry.createAsset({ ...assetInput, tenantId: `worker_outbox_${randomUUID()}` });
  }
  async function makeDue(tenantId: string) {
    await pool.query("UPDATE asset_change_outbox SET available_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1", [tenantId]);
  }
  async function seedCache(tenantId: string) {
    await pool.query(`INSERT INTO managed_query_cache (
      tenant_id, cache_key, provider, model, mode, query_hash, surface, principal_hash, context_hash, answer, generation, expires_at
    ) VALUES ($1, 'synthetic', 'openai', 'synthetic', 'provider-routed', 'query', 'api', 'principal', 'context', 'old answer', '{}', now() + interval '1 day')`, [tenantId]);
  }

  it("recovers from an indexing outage and invalidates only the changed tenant's cache", async () => {
    const detail = await seed();
    const other = await seed();
    const tenantId = detail.asset.tenantId;
    await seedCache(tenantId);
    await seedCache(other.asset.tenantId);
    const hash = new LocalHashEmbeddingProvider();
    let failIndex = true;
    const provider: EmbeddingProvider = {
      provider: hash.provider, model: hash.model, dimensions: hash.dimensions,
      async embedTexts(texts) {
        if (failIndex) throw new Error("provider-token-and-private-corpus");
        return hash.embedTexts(texts);
      }
    };
    const retrieval = new PostgresRetrievalRepository(pool, undefined, provider);
    const first = await reconcileAssetChanges({ outbox, registry, retrieval, cache }, { tenantId });
    expect(first).toMatchObject({ retryScheduled: 1, errors: { asset_index_failed: 1 }, health: { pending: 1 } });
    expect(JSON.stringify(first)).not.toContain("provider-token");
    expect((await pool.query("SELECT * FROM asset_chunks WHERE tenant_id = $1", [tenantId])).rows).toHaveLength(0);
    expect((await pool.query("SELECT last_error_code FROM asset_change_outbox WHERE tenant_id = $1", [tenantId])).rows[0]?.last_error_code).toBe("asset_index_failed");
    failIndex = false;
    await makeDue(tenantId);
    expect((await reconcileAssetChanges({ outbox, registry, retrieval, cache }, { tenantId })).completed).toBe(1);
    expect((await retrieval.search({ tenantId, query: "publishedoutboxanchor" }))[0]?.citation.versionId).toBe(detail.asset.publishedVersionId);
    expect((await pool.query("SELECT * FROM managed_query_cache WHERE tenant_id = $1", [tenantId])).rows).toHaveLength(0);
    expect((await pool.query("SELECT * FROM managed_query_cache WHERE tenant_id = $1", [other.asset.tenantId])).rows).toHaveLength(1);
  });

  it.each(["publication", "exposure"] as const)("fences an older in-flight index after a newer %s change", async (change) => {
    const detail = await seed();
    const tenantId = detail.asset.tenantId;
    const hash = new LocalHashEmbeddingProvider();
    let unblock!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => { unblock = resolve; });
    const indexingStarted = new Promise<void>((resolve) => { started = resolve; });
    const provider: EmbeddingProvider = {
      provider: hash.provider, model: hash.model, dimensions: hash.dimensions,
      async embedTexts(texts) { started(); await blocked; return hash.embedTexts(texts); }
    };
    const oldRun = reconcileAssetChanges({
      outbox, registry, cache, retrieval: new PostgresRetrievalRepository(pool, undefined, provider)
    }, { tenantId, limit: 1 });
    try {
      await indexingStarted;
      let publishedVersionId: string | null | undefined;
      if (change === "publication") {
        await registry.updateAsset(detail.asset.stableId, {
          tenantId, status: "draft", lifecycleState: "draft",
          instruction: { instructionKind: "policy", body: "newpublishedoutboxanchor" }
        });
        publishedVersionId = (await registry.publishAsset(detail.asset.stableId, { tenantId }))?.asset.publishedVersionId;
      } else {
        const current = await registry.updateAsset(detail.asset.stableId, {
          tenantId, status: "draft", lifecycleState: "draft", allowedSurfaces: ["web"], instruction: assetInput.instruction
        });
        expect(current?.asset.publishedVersionId).toBe(detail.asset.publishedVersionId);
        expect(await registry.getAssetByStableId(detail.asset.stableId, { tenantId, view: "published" })).toBeNull();
      }
      const retrieval = new PostgresRetrievalRepository(pool);
      expect((await reconcileAssetChanges({ outbox, registry, retrieval, cache }, { tenantId })).completed).toBe(1);
      unblock();
      expect(await oldRun).toMatchObject({ completed: 0, retryScheduled: 0, leaseLost: 1 });
      const chunks = (await pool.query("SELECT body, version_id FROM asset_chunks WHERE tenant_id = $1", [tenantId])).rows;
      expect(chunks).toEqual(change === "publication"
        ? [expect.objectContaining({ body: "newpublishedoutboxanchor", version_id: publishedVersionId })]
        : []);
      expect(await outbox.getHealth(tenantId)).toMatchObject({ pending: 0, processing: 0, failed: 0 });
    } finally {
      unblock();
      await oldRun;
    }
  });

  it("clears an unpublished asset and finishes durable deletion reconciliation", async () => {
    const detail = await seed();
    const tenantId = detail.asset.tenantId;
    const retrieval = new PostgresRetrievalRepository(pool);
    const dependencies = { outbox, registry, retrieval, cache };
    expect((await reconcileAssetChanges(dependencies, { tenantId })).completed).toBe(1);
    await registry.updateAsset(detail.asset.stableId, { tenantId, lifecycleState: "archived", instruction: assetInput.instruction });
    expect((await reconcileAssetChanges(dependencies, { tenantId })).completed).toBe(1);
    expect((await pool.query("SELECT * FROM asset_chunks WHERE tenant_id = $1", [tenantId])).rows).toHaveLength(0);
    await pool.query("DELETE FROM assets WHERE tenant_id = $1 AND id = $2", [tenantId, detail.asset.id]);
    expect((await outbox.getHealth(tenantId)).pending).toBe(1);
    const replacement = await registry.createAsset({ ...assetInput, tenantId });
    await retrieval.indexAsset(replacement);
    expect((await reconcileAssetChanges(dependencies, { tenantId, assetId: detail.asset.id })).completed).toBe(1);
    expect((await outbox.getHealth(tenantId)).pending).toBe(1);
    expect((await pool.query("SELECT asset_id FROM asset_chunks WHERE tenant_id = $1", [tenantId])).rows)
      .toEqual([expect.objectContaining({ asset_id: replacement.asset.id })]);
    expect((await reconcileAssetChanges(dependencies, { tenantId })).completed).toBe(1);
    expect((await outbox.getHealth(tenantId)).pending).toBe(0);
  });
});
