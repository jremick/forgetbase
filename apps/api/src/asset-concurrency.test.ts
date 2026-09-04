import { describe, expect, it } from "vitest";
import { InMemoryAuthRepository, InMemoryRegistryRepository } from "@forgetbase/db";
import { buildServer } from "./server.js";

describe("asset mutation preconditions", () => {
  it.each([
    { path: "versions", body: { humanDocument: { format: "markdown", body: "Second editor" } } },
    { path: "review", body: { reviewDueAt: "2028-01-01" } },
    { path: "publish", body: {} },
    { path: "restore", body: { versionNumber: 1 } }
  ])("returns a structured 409 before a stale $path command changes content", async ({ path, body }) => {
    const registry = new InMemoryRegistryRepository();
    const auth = new InMemoryAuthRepository();
    const api = buildServer({ logger: false, registryRepository: registry, authRepository: auth });
    try {
      const bootstrap = await api.inject({ method: "POST", url: "/auth/bootstrap", payload: { email: "editor@example.test", displayName: "Editor" } });
      const headers = { authorization: `Bearer ${bootstrap.json().secret}` };
      const created = await api.inject({ method: "POST", url: "/assets", headers, payload: {
        stableId: "page.concurrent", type: "human-document", ownerId: bootstrap.json().user.id, title: "Concurrent page",
        lifecycleState: "active", status: "approved", sensitivity: "internal", audience: ["editors"],
        reviewDueAt: "2027-12-31", allowedSurfaces: ["api"], humanDocument: { format: "markdown", body: "Initial content" }
      } });
      expect(created.statusCode, created.body).toBe(201);
      const expectedVersionId = created.json().asset.currentVersionId as string;
      const firstPayload = { expectedVersionId, lifecycleState: "draft", humanDocument: { format: "markdown", body: "First editor" } };
      const first = await api.inject({ method: "POST", url: "/assets/page.concurrent/versions", headers, payload: firstPayload });
      expect(first.statusCode, first.body).toBe(200);
      const before = await registry.getAssetByStableId("page.concurrent");
      const revision = await registry.getContentRevision();
      const stale = await api.inject({ method: "POST", url: `/assets/page.concurrent/${path}`, headers, payload: { ...body, expectedVersionId } });
      expect(stale.statusCode, stale.body).toBe(409);
      expect(stale.json()).toMatchObject({
        error: "asset_version_conflict", expectedVersionId, currentVersionId: first.json().asset.currentVersionId
      });
      const retry = await api.inject({ method: "POST", url: "/assets/page.concurrent/versions", headers, payload: firstPayload });
      expect(retry.statusCode, retry.body).toBe(409);
      expect(retry.json().error).toBe("asset_version_conflict");
      expect(await registry.getAssetByStableId("page.concurrent")).toEqual(before);
      expect(await registry.getContentRevision()).toBe(revision);
      expect((await auth.listAuditEvents()).filter((event) => event.action === "asset.update" && event.outcome === "success")).toHaveLength(1);
    } finally {
      await api.close();
    }
  });
});
