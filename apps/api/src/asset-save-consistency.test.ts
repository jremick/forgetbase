import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createPool,
  InMemoryManagedQueryCacheRepository,
  InMemoryRegistryRepository,
  InMemoryRetrievalRepository,
  PostgresAssetChangeOutboxRepository,
  PostgresAuthRepository,
  PostgresRegistryRepository,
  PostgresRetrievalRepository,
  runMigrations
} from "@forgetbase/db";
import { buildServer } from "./server.js";

let server: ReturnType<typeof buildServer> | undefined;
afterEach(async () => { await server?.close(); });

it("reports a committed save accurately when indexing fails, without exposing the provider error", async () => {
  const registry = new InMemoryRegistryRepository();
  const retrieval = new InMemoryRetrievalRepository();
  retrieval.indexAsset = async () => { throw new Error("private provider diagnostic"); };
  server = buildServer({ logger: false, registryRepository: registry, retrievalRepository: retrieval });
  const response = await server.inject({ method: "POST", url: "/assets", payload: {
    stableId: "saved-despite-outage", type: "human-document", ownerId: "owner", title: "Saved guidance",
    lifecycleState: "active", status: "approved", sensitivity: "public-demo", audience: ["readers"], reviewDueAt: "2027-01-01",
    allowedSurfaces: ["api"], humanDocument: { format: "markdown", body: "Persisted guidance." }
  } });
  expect(response.statusCode, response.body).toBe(201);
  expect(response.json().processing).toEqual({ index: "pending", reconciliation: "pending" });
  expect(response.headers["x-forgetbase-index-state"]).toBe("pending");
  expect(response.body).not.toContain("private provider diagnostic");
  expect((await registry.getAssetByStableId("saved-despite-outage"))?.humanDocuments[0]?.body).toBe("Persisted guidance.");
});

it("does not misreport an unpublished save as failed when index cleanup is unavailable", async () => {
  const registry = new InMemoryRegistryRepository();
  const retrieval = new InMemoryRetrievalRepository();
  retrieval.clearAssetIndex = async () => { throw new Error("index unavailable"); };
  server = buildServer({ logger: false, registryRepository: registry, retrievalRepository: retrieval });
  const response = await server.inject({ method: "POST", url: "/assets", payload: {
    stableId: "saved-draft", type: "human-document", ownerId: "owner", title: "Draft guidance",
    lifecycleState: "draft", status: "draft", sensitivity: "public-demo", audience: ["readers"], reviewDueAt: "2027-01-01",
    allowedSurfaces: ["api"], humanDocument: { format: "markdown", body: "Draft guidance." }
  } });
  expect(response.statusCode).toBe(201);
  expect(response.json().processing.index).toBe("pending");
  expect(await registry.getAssetByStableId("saved-draft", { view: "published" })).toBeNull();
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL asset save reconciliation races", () => {
  let pool: ReturnType<typeof createPool>;
  const tenantIds: string[] = [];
  const draft = {
    stableId: "reconciliation-draft", type: "human-document", ownerId: "synthetic-owner", title: "Draft guidance",
    lifecycleState: "draft", status: "draft", sensitivity: "restricted", audience: ["reviewers"], reviewDueAt: "2027-01-01",
    allowedSurfaces: ["api"], humanDocument: { format: "markdown", body: "Synthetic reconciliation guidance." }
  };

  beforeAll(async () => {
    pool = createPool(process.env.TEST_DATABASE_URL!);
    await runMigrations(pool);
  });
  afterAll(async () => {
    for (const tenantId of tenantIds) await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await pool.end();
  });

  async function fixture() {
    const tenantId = `tenant_save_race_${randomUUID()}`;
    tenantIds.push(tenantId);
    const auth = new PostgresAuthRepository(pool);
    const registry = new PostgresRegistryRepository(pool);
    const retrieval = new PostgresRetrievalRepository(pool);
    const outbox = new PostgresAssetChangeOutboxRepository(pool);
    const cache = new InMemoryManagedQueryCacheRepository();
    const user = await auth.createUser({ tenantId, email: "save-review@example.test", displayName: "Save review", role: "admin" });
    const key = await auth.createApiKey({ tenantId, userId: user.id, name: "save-review", scopes: ["admin"], allowedSurfaces: ["api"] });
    if (!key) throw new Error("Missing synthetic fixture key");
    server = buildServer({
      logger: false, databaseUrl: process.env.TEST_DATABASE_URL, autoMigrate: false,
      registryRepository: registry, authRepository: auth, retrievalRepository: retrieval, cacheRepository: cache,
      attachmentReconciliationEnabled: false
    });
    return { tenantId, user, registry, retrieval, outbox, cache, headers: { authorization: `Bearer ${key.secret}` } };
  }

  it("records the attributed command and invalidates cache when a worker already owns the index lease", async () => {
    const { tenantId, user, registry, retrieval, outbox, cache, headers } = await fixture();
    const createAsset = registry.createAsset.bind(registry);
    let workerClaimed = false;
    vi.spyOn(registry, "createAsset").mockImplementation(async (...args) => {
      const detail = await createAsset(...args);
      workerClaimed = (await outbox.claim({ tenantId, assetId: detail.asset.id, limit: 1 })).length === 1;
      return detail;
    });
    const clear = vi.spyOn(retrieval, "clearAssetIndex");
    const invalidate = vi.spyOn(cache, "invalidateTenant");

    const response = await server!.inject({ method: "POST", url: "/assets", headers, payload: draft });

    expect(response.statusCode, response.body).toBe(201);
    expect(workerClaimed).toBe(true);
    expect(response.json().processing).toEqual({ index: "pending", reconciliation: "pending" });
    expect(clear).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ tenantId, dryRun: false });
    const audits = await pool.query(
      "SELECT actor_user_id FROM audit_events WHERE tenant_id = $1 AND target_id = $2 AND action = 'asset.create'",
      [tenantId, response.json().asset.id]
    );
    expect(audits.rows).toEqual([{ actor_user_id: user.id }]);
  });

  it("reports index cleanup as pending when publication changes between lookup and the fenced clear", async () => {
    const { tenantId, registry, retrieval, outbox, headers } = await fixture();
    const clearAssetIndex = retrieval.clearAssetIndex.bind(retrieval);
    let cleared: boolean | undefined;
    vi.spyOn(retrieval, "clearAssetIndex").mockImplementation(async (input) => {
      await registry.publishAsset(draft.stableId, { tenantId });
      cleared = await clearAssetIndex(input);
      return cleared;
    });

    const response = await server!.inject({ method: "POST", url: "/assets", headers, payload: draft });

    expect(response.statusCode, response.body).toBe(201);
    expect(cleared).toBe(false);
    expect(response.json().processing).toEqual({ index: "pending", reconciliation: "pending" });
    expect(response.headers["x-forgetbase-index-state"]).toBe("pending");
    expect((await registry.getAssetByStableId(draft.stableId, { tenantId, view: "published" }))?.asset.publishedVersionId).toBeTruthy();
    expect(await outbox.getHealth(tenantId)).toMatchObject({ pending: 1, processing: 0, failed: 0 });
  });
});
