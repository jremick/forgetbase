import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryAssetChangeOutboxRepository, PostgresAssetChangeOutboxRepository } from "./asset-change-outbox.js";
import { PostgresRegistryRepository, runMigrations } from "./index.js";

describe("in-memory asset change outbox", () => {
  it("retains newer generations and fences reclaimed leases", async () => {
    let now = new Date("2026-09-05T00:00:00Z");
    const outbox = new InMemoryAssetChangeOutboxRepository(() => now);
    const change = { tenantId: "tenant_one", assetId: "asset_one", stableId: "policy.one" };
    await outbox.recordChange(change);
    const first = (await outbox.claim({ leaseDurationMs: 100 }))[0]!;
    await outbox.recordChange(change);
    expect(await outbox.complete(first)).toBe(false);
    expect(await outbox.fail(first, "asset_index_failed")).toBe(false);
    const newer = (await outbox.claim({ leaseDurationMs: 100 }))[0]!;
    expect(newer.generation).toBe("2");
    now = new Date(now.getTime() + 101);
    expect(await outbox.complete(newer)).toBe(false);
    const reclaimed = (await outbox.claim())[0]!;
    expect(reclaimed.leaseToken).not.toBe(newer.leaseToken);
    expect(await outbox.complete(newer)).toBe(false);
    expect(await outbox.complete(reclaimed)).toBe(true);
    expect(await outbox.getHealth()).toMatchObject({ pending: 0, processing: 0, failed: 0, oldestPendingAt: null });
  });

  it("slows repeated failures without abandoning recovery", async () => {
    let now = new Date("2026-09-05T00:00:00Z");
    const outbox = new InMemoryAssetChangeOutboxRepository(() => now);
    await outbox.recordChange({ tenantId: "tenant_one", assetId: "asset_one", stableId: "policy.one" });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const work = (await outbox.claim())[0]!;
      expect(work.attempts).toBe(attempt);
      expect(await outbox.fail(work, "asset_index_failed")).toBe(true);
      expect(await outbox.claim()).toEqual([]);
      if (attempt < 8) now = new Date(now.getTime() + 300_000);
    }
    expect(await outbox.getHealth()).toMatchObject({ failed: 1, pending: 0 });
    now = new Date(now.getTime() + 299_999);
    expect(await outbox.claim()).toEqual([]);
    now = new Date(now.getTime() + 1);
    const retry = (await outbox.claim())[0]!;
    expect(retry.attempts).toBe(8);
    expect(await outbox.complete(retry)).toBe(true);
    expect((await outbox.getHealth()).failed).toBe(0);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL canonical asset outbox", () => {
  let pool: Pool;
  let outbox: PostgresAssetChangeOutboxRepository;
  let registry: PostgresRegistryRepository;
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await runMigrations(pool);
    outbox = new PostgresAssetChangeOutboxRepository(pool);
    registry = new PostgresRegistryRepository(pool);
  });
  afterAll(async () => { await pool.end(); });

  async function createAsset() {
    const tenantId = `outbox_${randomUUID()}`;
    return registry.createAsset({
      tenantId, stableId: "policy.outbox", type: "policy", ownerId: "synthetic-owner",
      title: "Durable Policy", lifecycleState: "active", status: "approved", sensitivity: "internal",
      audience: ["team"], reviewDueAt: "2027-09-05", allowedSurfaces: ["api", "mcp"],
      instruction: { instructionKind: "policy", body: "Never store this synthetic body in a commit audit." }
    });
  }

  it("queues only the complete head and atomically rolls back queue and actor-null audit", async () => {
    const detail = await createAsset();
    const { tenantId, id } = detail.asset;
    const work = (await outbox.claim({ tenantId }))[0]!;
    expect(work.generation).toBe("1");
    expect(await outbox.complete(work)).toBe(true);
    const audit = await pool.query("SELECT * FROM audit_events WHERE tenant_id = $1 AND action = 'asset.commit'", [tenantId]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ actor_user_id: null, actor_api_key_id: null, actor_service_account_id: null });
    expect(audit.rows[0].metadata).toEqual({
      source: "asset-row-trigger", operation: "update", transactionId: expect.any(String),
      currentVersionId: detail.asset.currentVersionId, publishedVersionId: detail.asset.publishedVersionId
    });
    expect(JSON.stringify(audit.rows)).not.toContain("synthetic body");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE assets SET title = 'Rolled back' WHERE tenant_id = $1 AND id = $2", [tenantId, id]);
      expect((await client.query("SELECT * FROM asset_change_outbox WHERE tenant_id = $1", [tenantId])).rows).toHaveLength(1);
      expect((await client.query("SELECT * FROM audit_events WHERE tenant_id = $1 AND action = 'asset.commit'", [tenantId])).rows).toHaveLength(2);
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect((await registry.getAssetByStableId(detail.asset.stableId, { tenantId }))?.asset.title).toBe("Durable Policy");
    expect((await outbox.getHealth(tenantId)).pending).toBe(0);
    expect((await pool.query("SELECT * FROM audit_events WHERE tenant_id = $1 AND action = 'asset.commit'", [tenantId])).rows).toHaveLength(1);
  });

  it("does not acknowledge a newer change or another tenant's work", async () => {
    const first = await createAsset();
    const other = await createAsset();
    const old = (await outbox.claim({ tenantId: first.asset.tenantId }))[0]!;
    expect(old.tenantId).toBe(first.asset.tenantId);
    expect(await outbox.complete({ ...old, tenantId: other.asset.tenantId, assetId: other.asset.id })).toBe(false);
    await registry.reviewAsset(first.asset.stableId, { tenantId: first.asset.tenantId, reviewDueAt: "2027-10-05" });
    expect(await outbox.complete(old)).toBe(false);
    expect(await outbox.fail(old, "asset_index_failed")).toBe(false);
    const newer = (await outbox.claim({ tenantId: first.asset.tenantId }))[0]!;
    expect(BigInt(newer.generation)).toBeGreaterThan(BigInt(old.generation));
    expect(await outbox.complete(newer)).toBe(true);
    expect((await outbox.getHealth(other.asset.tenantId)).pending).toBe(1);
    await pool.query("DELETE FROM tenants WHERE id = $1", [other.asset.tenantId]);
    expect(await outbox.getHealth(other.asset.tenantId)).toMatchObject({ pending: 0, processing: 0, failed: 0 });
  });

  it("claims concurrently once and rejects acknowledgement after lease expiry", async () => {
    const detail = await createAsset();
    const tenantId = detail.asset.tenantId;
    const claims = await Promise.all([outbox.claim({ tenantId }), outbox.claim({ tenantId })]);
    const first = claims.flat()[0]!;
    expect(claims.flat()).toHaveLength(1);
    await pool.query("UPDATE asset_change_outbox SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1", [tenantId]);
    expect(await outbox.complete(first)).toBe(false);
    const next = (await outbox.claim({ tenantId }))[0]!;
    expect(next.generation).toBe(first.generation);
    expect(next.leaseToken).not.toBe(first.leaseToken);
    expect(await outbox.fail(first, "asset_index_failed")).toBe(false);
    expect(await outbox.complete(next)).toBe(true);
  });

  it("claims only the requested asset before taking a lease", async () => {
    const first = await createAsset();
    const tenantId = first.asset.tenantId;
    const second = await registry.createAsset({
      tenantId, stableId: "policy.targeted", type: "policy", ownerId: "synthetic-owner", title: "Targeted policy",
      lifecycleState: "active", status: "approved", sensitivity: "internal", audience: ["team"],
      reviewDueAt: "2027-09-05", allowedSurfaces: ["api"],
      instruction: { instructionKind: "policy", body: "Only claim the target of this completed command." }
    });
    const claimed = await outbox.claim({ tenantId, assetId: second.asset.id });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.assetId).toBe(second.asset.id);
    expect(await outbox.claim({ tenantId, assetId: second.asset.id })).toEqual([]);
    expect((await outbox.claim({ tenantId, assetId: first.asset.id }))[0]?.assetId).toBe(first.asset.id);
  });

  it("persists bounded backoff and automatically retries failed work", async () => {
    const detail = await createAsset();
    const tenantId = detail.asset.tenantId;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const work = (await outbox.claim({ tenantId }))[0]!;
      expect(work.attempts).toBe(attempt);
      expect(await outbox.fail(work, "asset_index_failed")).toBe(true);
      expect(await outbox.claim({ tenantId })).toEqual([]);
      if (attempt < 8) {
        await pool.query("UPDATE asset_change_outbox SET available_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1", [tenantId]);
      }
    }
    expect(await outbox.getHealth(tenantId)).toMatchObject({ failed: 1, pending: 0, oldestPendingAt: expect.any(String) });
    const failed = (await pool.query("SELECT state, last_error_code, extract(epoch FROM available_at - clock_timestamp()) AS delay_seconds FROM asset_change_outbox WHERE tenant_id = $1", [tenantId])).rows[0];
    expect(failed).toMatchObject({ state: "failed", last_error_code: "asset_index_failed" });
    expect(Number(failed.delay_seconds)).toBeGreaterThan(295);
    await pool.query("UPDATE asset_change_outbox SET available_at = clock_timestamp() - interval '1 second' WHERE tenant_id = $1", [tenantId]);
    const retry = (await outbox.claim({ tenantId }))[0]!;
    expect(retry.attempts).toBe(8);
    expect(await outbox.complete(retry)).toBe(true);
    expect((await outbox.getHealth(tenantId)).failed).toBe(0);
  });
});
