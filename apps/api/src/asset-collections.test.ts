import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryAuthRepository, InMemoryRegistryRepository, InMemoryRetrievalRepository,
  PostgresAuthRepository, PostgresRegistryRepository, PostgresRetrievalRepository, runMigrations, createPool
} from "@forgetbase/db";
import type { AssetCreateInput } from "@forgetbase/schema";
import { buildServer } from "./server.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

function asset(stableId: string, tenantId: string, sensitivity: "public-demo" | "restricted" = "public-demo"): AssetCreateInput {
  return {
    stableId, tenantId, type: "human-document", ownerId: "synthetic-owner", title: "needle guidance",
    lifecycleState: "active", status: "approved", sensitivity, audience: ["readers"], reviewDueAt: "2027-01-01",
    allowedSurfaces: ["api", "web", "cli", "mcp", "export"], allowedExports: ["demo-agent-pack"],
    humanDocument: { format: "markdown", body: "needle published guidance" }
  };
}

for (const mode of ["memory", "postgres"] as const) {
  describe.skipIf(mode === "postgres" && !process.env.TEST_DATABASE_URL)(`${mode} complete published collections`, () => {
    async function fixture() {
      const tenantId = `collection_${randomUUID()}`;
      const pool = mode === "postgres" ? createPool(process.env.TEST_DATABASE_URL) : null;
      if (pool) { cleanup.push(() => pool.end()); await runMigrations(pool); }
      const registry = pool ? new PostgresRegistryRepository(pool) : new InMemoryRegistryRepository();
      const auth = pool ? new PostgresAuthRepository(pool) : new InMemoryAuthRepository();
      const retrieval = pool ? new PostgresRetrievalRepository(pool) : new InMemoryRetrievalRepository();
      const user = await auth.createUser({ tenantId, email: `${tenantId}@example.test`, displayName: "Reader", role: "reader" });
      const key = await auth.createApiKey({ tenantId, userId: user.id, name: "synthetic", scopes: ["asset:read"], allowedSurfaces: ["api", "web", "cli", "mcp", "export"] });
      const server = buildServer({ logger: false, registryRepository: registry, authRepository: auth, retrievalRepository: retrieval });
      cleanup.push(() => server.close());
      return { tenantId, registry, retrieval, headers: { authorization: `Bearer ${key!.secret}` }, server };
    }

    it("fills pages after denied prefixes and traverses more than 200 assets without silent export truncation", async () => {
      const f = await fixture();
      for (let i = 0; i < 205; i++) {
        await f.registry.createAsset(asset(`a_denied_${String(i).padStart(3, "0")}`, f.tenantId, "restricted"));
        await f.registry.createAsset(asset(`z_visible_${String(i).padStart(3, "0")}`, f.tenantId));
      }
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const response: Awaited<ReturnType<typeof f.server.inject>> = await f.server.inject({ method: "GET", url: `/assets?limit=50${cursor ? `&cursor=${cursor}` : ""}`, headers: f.headers });
        expect(response.statusCode, response.body).toBe(200);
        const page: { assets: Array<{stableId: string}>; nextCursor: string | null; complete: boolean } = response.json();
        expect(page.assets.length).toBeGreaterThan(0);
        if (ids.length === 0) expect(page.assets).toHaveLength(50);
        ids.push(...page.assets.map((item: { stableId: string }) => item.stableId));
        cursor = page.nextCursor;
        expect(page.complete).toBe(cursor === null);
      } while (cursor);
      expect(ids).toHaveLength(205);
      expect(new Set(ids).size).toBe(205);
      expect(ids.every((id) => id.startsWith("z_visible"))).toBe(true);
      for (const format of ["json", "okf"]) {
        const response = await f.server.inject({ method: "GET", url: `/exports/ai-package?limit=1000&format=${format}`, headers: f.headers });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json()).toMatchObject({ assetCount: 205, complete: true, nextCursor: null });
        expect(response.body).not.toContain("a_denied_");
      }
    }, 60000);

    it("applies eligibility before top-k and retains approved retrieval while a draft changes", async () => {
      const f = await fixture();
      for (const id of ["a_denied", "z_visible"]) {
        await f.retrieval.indexAsset(await f.registry.createAsset(asset(id, f.tenantId, id === "a_denied" ? "restricted" : "public-demo")));
      }
      const search = () => f.server.inject({ method: "GET", url: "/search?query=needle&limit=1", headers: f.headers });
      let response = await search();
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().results).toHaveLength(1);
      expect(response.json().results[0].asset.stableId).toBe("z_visible");
      const publishedId = response.json().results[0].citation.versionId;
      const draft = await f.registry.updateAsset("z_visible", { tenantId: f.tenantId, lifecycleState: "draft", status: "draft", title: "unapproved secret", humanDocument: { format: "markdown", body: "needle unapproved secret" } });
      await f.retrieval.indexAsset(draft!);
      response = await search();
      expect(response.json().results).toHaveLength(1);
      expect(response.json().results[0].citation.versionId).toBe(publishedId);
      expect(response.body).not.toContain("unapproved secret");
      await f.registry.publishAsset("z_visible", { tenantId: f.tenantId });
      response = await search();
      expect(response.json().results).toHaveLength(0); // stale index cannot cite a superseded version
      await f.retrieval.indexAsset((await f.registry.getAssetByStableId("z_visible", { tenantId: f.tenantId, view: "published" }))!);
      response = await search();
      expect(response.json().results).toHaveLength(1);
      expect(response.json().results[0].citation.versionId).not.toBe(publishedId);
    });

    it("rejects invalid cursors and reports bounded exports as incomplete", async () => {
      const f = await fixture();
      for (const id of ["first", "second"]) await f.registry.createAsset(asset(id, f.tenantId));
      const invalid = await f.server.inject({ method: "GET", url: "/assets?cursor=bad", headers: f.headers });
      expect(invalid.statusCode).toBe(400);
      const first = await f.server.inject({ method: "GET", url: "/exports/ai-package?limit=1", headers: f.headers });
      expect(first.json()).toMatchObject({ assetCount: 1, complete: false });
      const last = await f.server.inject({ method: "GET", url: `/exports/ai-package?limit=1&cursor=${first.json().nextCursor}`, headers: f.headers });
      expect(last.json()).toMatchObject({ assetCount: 1, complete: true, nextCursor: null });
      expect(last.json().assets[0].stableId).not.toBe(first.json().assets[0].stableId);
      await f.registry.updateAsset("second", { tenantId: f.tenantId, title: "A concurrent edit", humanDocument: { format: "markdown", body: "Updated content during export" } });
      const changed = await f.server.inject({ method: "GET", url: `/exports/ai-package?limit=1&cursor=${first.json().nextCursor}`, headers: f.headers });
      expect(changed.statusCode).toBe(409);
      expect(changed.json().error).toBe("export_changed_retry");
    });
  });
}
