import { afterEach, describe, expect, it } from "vitest";
import { InMemoryAuthRepository, InMemoryRegistryRepository } from "@forgetbase/db";
import type { AssetCreateInput, AssetReviewQueueResponse } from "@forgetbase/schema";
import { buildServer } from "./server.js";

let server: ReturnType<typeof buildServer> | undefined;
afterEach(async () => { await server?.close(); });

const page = {
  stableId: "review.page", type: "human-document", ownerId: "review-owner", title: "Synthetic review page",
  lifecycleState: "draft", status: "reviewing", sensitivity: "restricted", audience: ["readers"],
  reviewDueAt: "2026-01-01", allowedSurfaces: ["web"], humanDocument: { format: "markdown", body: "Synthetic draft." }
} satisfies AssetCreateInput;

async function fixture() {
  const registry = new InMemoryRegistryRepository();
  const auth = new InMemoryAuthRepository();
  const user = await auth.createUser({ email: "reviewer@example.test", displayName: "Reviewer", role: "maintainer" });
  const key = await auth.createApiKey({ userId: user.id, name: "reviewer", scopes: ["asset:read", "asset:write"], allowedSurfaces: ["web"] });
  server = buildServer({ logger: false, registryRepository: registry, authRepository: auth });
  const headers = { authorization: `Bearer ${key?.secret}`, "x-forgetbase-surface": "web" };
  async function permit(stableId: string) {
    for (const action of ["read", "write"] as const) await auth.createPermissionGrant({ stableId, principalType: "user", principalId: user.id, action, surfaces: ["web"] });
  }
  return { registry, headers, permit };
}

describe("complete permission-aware review queue", () => {
  it("exposes every item past the first 25 without leaking denied items through rows or counts", async () => {
    const { registry, headers, permit } = await fixture();
    for (let index = 0; index < 31; index += 1) {
      const stableId = `review.page-${String(index).padStart(2, "0")}`;
      await registry.createAsset({ ...page, stableId });
      await permit(stableId);
    }
    await registry.createAsset({ ...page, stableId: "review.denied", title: "Denied synthetic page" });
    const first = await server!.inject({ method: "GET", url: "/assets/review-queue?asOf=2026-09-05&limit=25", headers });
    expect(first.statusCode).toBe(200);
    const firstPage = first.json<AssetReviewQueueResponse>();
    expect(firstPage).toMatchObject({ totalCount: 31, nextOffset: 25 });
    expect(firstPage.assets).toHaveLength(25);
    const second = await server!.inject({ method: "GET", url: `/assets/review-queue?asOf=${firstPage.asOf}&limit=25&offset=${firstPage.nextOffset}`, headers });
    const secondPage = second.json<AssetReviewQueueResponse>();
    expect(secondPage).toMatchObject({ totalCount: 31, nextOffset: null });
    expect(secondPage.assets).toHaveLength(6);
    expect(new Set([...firstPage.assets, ...secondPage.assets].map((asset) => asset.stableId)).size).toBe(31);
    expect(first.body + second.body).not.toContain("Denied synthetic page");
    const end = await server!.inject({ method: "GET", url: "/assets/review-queue?asOf=2026-09-05&offset=100", headers });
    expect(end.json()).toMatchObject({ assets: [], totalCount: 31, nextOffset: null });
    for (const offset of ["-1", "1.5", "not-a-number"]) expect((await server!.inject({ method: "GET", url: `/assets/review-queue?offset=${offset}`, headers })).statusCode).toBe(400);
  });

  it("keeps an approved draft in the queue until publication and preserves the reader's published version", async () => {
    const { registry, headers, permit } = await fixture();
    const created = await registry.createAsset({ ...page, lifecycleState: "active", status: "approved", humanDocument: { format: "markdown", body: "Published guidance." } });
    await permit(page.stableId);
    await registry.updateAsset(page.stableId, { lifecycleState: "draft", status: "reviewing", humanDocument: { format: "markdown", body: "Unpublished guidance." } });
    const reviewed = await server!.inject({ method: "POST", url: `/assets/${page.stableId}/review`, headers, payload: { reviewDueAt: "2027-09-05" } });
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect(reviewed.json().asset).toMatchObject({ lifecycleState: "draft", status: "approved", publishedVersionId: created.asset.currentVersionId });
    const queue = await server!.inject({ method: "GET", url: "/assets/review-queue?asOf=2026-09-05", headers });
    expect(queue.json().assets.map((asset: { stableId: string }) => asset.stableId)).toEqual([page.stableId]);
    const reader = await server!.inject({ method: "GET", url: `/assets/${page.stableId}`, headers });
    expect(reader.json().humanDocuments[0].body).toBe("Published guidance.");
    const published = await server!.inject({ method: "POST", url: `/assets/${page.stableId}/publish`, headers, payload: {} });
    expect(published.statusCode, published.body).toBe(200);
    const complete = await server!.inject({ method: "GET", url: "/assets/review-queue?asOf=2026-09-05", headers });
    expect(complete.json()).toMatchObject({ assets: [], totalCount: 0, nextOffset: null });
  });
});
