import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AssetCreateInput } from "@forgetbase/schema";
import { InMemoryRegistryRepository, PostgresRegistryRepository, runMigrations, type RegistryRepository } from "./index.js";

function reviewQueueContract(repository: () => RegistryRepository) {
  it("reports all 31 due pages with stable continuation and an honest total beyond the end", async () => {
    const repo = repository();
    const tenantId = `tenant_review_${randomUUID()}`;
    const input = {
      tenantId, stableId: "review.page", type: "human-document", ownerId: "review-owner", title: "Synthetic review page",
      lifecycleState: "draft", status: "reviewing", sensitivity: "internal", audience: ["readers"],
      reviewDueAt: "2026-01-01", allowedSurfaces: ["web"], humanDocument: { format: "markdown", body: "Synthetic review guidance." }
    } satisfies AssetCreateInput;
    for (let index = 30; index >= 0; index -= 1) await repo.createAsset({ ...input, stableId: `review.page-${String(index).padStart(2, "0")}` });
    const options = { tenantId, asOf: "2026-09-05", limit: 25 };
    const first = await repo.listAssetsNeedingReview(options);
    const second = await repo.listAssetsNeedingReview({ ...options, offset: first.nextOffset! });
    expect(first).toMatchObject({ totalCount: 31, nextOffset: 25 });
    expect(second).toMatchObject({ totalCount: 31, nextOffset: null });
    expect(first.assets).toHaveLength(25);
    expect(second.assets).toHaveLength(6);
    expect([...first.assets, ...second.assets].map((asset) => asset.stableId)).toEqual(Array.from({ length: 31 }, (_, index) => `review.page-${String(index).padStart(2, "0")}`));
    expect(await repo.listAssetsNeedingReview({ ...options, offset: 100 })).toMatchObject({ assets: [], totalCount: 31, nextOffset: null });
    expect(await repo.listAssetsNeedingReview({ ...options, tenantId: `${tenantId}_empty` })).toMatchObject({ assets: [], totalCount: 0, nextOffset: null });
    await repo.reviewAsset("review.page-00", { tenantId, reviewDueAt: "2027-01-01" });
    const approvedDraft = await repo.listAssetsNeedingReview({ ...options, offset: 25 });
    expect(approvedDraft.totalCount).toBe(31);
    expect(approvedDraft.assets.at(-1)).toMatchObject({ stableId: "review.page-00", lifecycleState: "draft", status: "approved", publishedVersionId: null });
    await repo.publishAsset("review.page-00", { tenantId });
    expect((await repo.listAssetsNeedingReview(options)).totalCount).toBe(30);
  });
}

describe("In-memory review queue pagination", () => { reviewQueueContract(() => new InMemoryRegistryRepository()); });

describe.skipIf(!process.env.TEST_DATABASE_URL)("Postgres review queue pagination", () => {
  let pool: Pool;
  beforeAll(async () => { pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL }); await runMigrations(pool); });
  afterAll(async () => { await pool?.end(); });
  reviewQueueContract(() => new PostgresRegistryRepository(pool));
});
