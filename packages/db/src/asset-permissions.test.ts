import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import type { AssetCreateInput } from "@forgetbase/schema";
import { InMemoryAuthRepository, PostgresAuthRepository, type AuthRepository } from "./auth.js";
import { InMemoryRegistryRepository, PostgresRegistryRepository, runMigrations, type RegistryRepository } from "./index.js";

const sample = {
  stableId: "policy.grants",
  type: "policy",
  ownerId: "synthetic-owner",
  title: "Permission contract fixture",
  lifecycleState: "active",
  sensitivity: "restricted",
  audience: ["security"],
  status: "approved",
  reviewDueAt: "2027-01-31",
  allowedSurfaces: ["api", "mcp", "web"],
  instruction: { instructionKind: "policy", body: "Use only authorized synthetic context." }
} satisfies AssetCreateInput;

for (const kind of ["memory", "postgres"] as const) {
  describe.skipIf(kind === "postgres" && !process.env.TEST_DATABASE_URL)(`${kind} asset permission contract`, () => {
    let pool: Pool | undefined;
    beforeAll(async () => {
      if (kind === "postgres") {
        pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
        await runMigrations(pool);
      }
    });
    afterAll(async () => { await pool?.end(); });

    function repositories(): { auth: AuthRepository; registry: RegistryRepository; tenantId: string } {
      return {
        auth: pool ? new PostgresAuthRepository(pool) : new InMemoryAuthRepository(),
        registry: pool ? new PostgresRegistryRepository(pool) : new InMemoryRegistryRepository(),
        tenantId: `tenant_permissions_${randomUUID()}`
      };
    }

    it("creates authenticated creator grants independently of owner metadata and constrains tenant and surfaces", async () => {
      const { auth, registry, tenantId } = repositories();
      const user = await auth.createUser({ tenantId, email: "creator@example.test", displayName: "Creator", role: "maintainer" });
      const key = await auth.createApiKey({ tenantId, userId: user.id, name: "creator", scopes: ["asset:read", "asset:write"], allowedSurfaces: ["api"] });
      const principal = await auth.authenticateApiKey(key?.secret ?? "");
      if (!principal) throw new Error("Missing fixture principal");
      const context = { creator: principal, grantCreatorPermissions: (grants: Parameters<AuthRepository["createPermissionGrants"]>[0]) => auth.createPermissionGrants(grants) };
      const created = await registry.createAsset({ ...sample, tenantId, ownerId: "semantic-owner", lifecycleState: "draft", status: "draft" }, context);
      expect(created.asset.ownerId).toBe("semantic-owner");
      const grants = (await auth.listPermissionGrants({ tenantId, stableId: created.asset.stableId })).grants;
      expect(grants).toHaveLength(2);
      expect(grants.every((grant) => grant.principalId === user.id && grant.createdBy === user.id && grant.surfaces.join() === "api")).toBe(true);
      expect(new Set(grants.map((grant) => grant.action))).toEqual(new Set(["read", "write"]));
      for (const action of ["read", "write"] as const) {
        expect(await auth.canAccessAsset({ principal, asset: created.asset, action, surface: "api" })).toBe(true);
        expect(await auth.canAccessAsset({ principal, asset: created.asset, action, surface: "mcp" })).toBe(false);
      }
      await expect(registry.createAsset({ ...sample, tenantId: `${tenantId}_other`, stableId: "policy.foreign" }, context)).rejects.toThrow("creator tenant mismatch");
      await expect(registry.createAsset({ ...sample, tenantId, stableId: "policy.no-surface", allowedSurfaces: ["mcp"] }, context)).rejects.toThrow("no permitted surface");
      expect(await registry.getAssetByStableId("policy.no-surface", { tenantId })).toBeNull();
    });

    it("validates a grant batch before persisting any of it", async () => {
      const { auth, registry, tenantId } = repositories();
      const created = await registry.createAsset({ ...sample, tenantId });
      const user = await auth.createUser({ tenantId, email: "batch@example.test", displayName: "Batch", role: "maintainer" });
      const grant = { tenantId, stableId: created.asset.stableId, principalType: "user" as const, principalId: user.id, action: "read" as const, surfaces: ["api" as const] };
      await expect(auth.createPermissionGrants([grant, { ...grant, action: "write", surfaces: [] }])).rejects.toThrow();
      expect((await auth.listPermissionGrants({ tenantId, stableId: created.asset.stableId })).grants).toEqual([]);
    });

    if (kind === "postgres") {
      it("rolls back the asset, first creator grant, and outbox entry when the second grant insert fails", async () => {
        const { auth, registry, tenantId } = repositories();
        const user = await auth.createUser({ tenantId, email: "rollback@example.test", displayName: "Rollback", role: "maintainer" });
        const failingPool = {
          async connect() {
            const client = await pool!.connect();
            return new Proxy(client, {
              get(target, property) {
                if (property === "query") return async (...args: unknown[]) => {
                  const sql = args[0];
                  const values = args[1] as unknown[] | undefined;
                  if (typeof sql === "string" && sql.includes("INSERT INTO permission_grants") && values?.[4] === "write") {
                    throw new Error("Synthetic second creator grant failure");
                  }
                  return Reflect.apply(target.query, target, args);
                };
                if (property === "release") return target.release.bind(target);
                return Reflect.get(target, property);
              }
            });
          }
        } as unknown as Pool;
        const failing = new PostgresRegistryRepository(failingPool);
        await expect(failing.createAsset({ ...sample, tenantId }, {
          creator: { tenantId, principalType: "user", principalId: user.id, allowedSurfaces: ["api"] }
        })).rejects.toThrow("second creator grant failure");
        expect(await registry.getAssetByStableId(sample.stableId, { tenantId })).toBeNull();
        expect((await auth.listPermissionGrants({ tenantId, stableId: sample.stableId })).grants).toEqual([]);
        const pending = await pool!.query("SELECT count(*)::integer AS count FROM asset_change_outbox WHERE tenant_id = $1", [tenantId]);
        expect(pending.rows[0].count).toBe(0);
      });
    }

    it("pages the complete inventory, preserves upsert identity, and revokes only the named tenant and asset", async () => {
      const { auth, registry, tenantId } = repositories();
      const asset = await registry.createAsset({ ...sample, tenantId });
      const other = await registry.createAsset({ ...sample, tenantId, stableId: "policy.other" });
      const foreignTenant = `${tenantId}_other`;
      await registry.createAsset({ ...sample, tenantId: foreignTenant });
      const user = await auth.createUser({ tenantId, email: "reader@example.test", displayName: "Reader", role: "reader" });
      const key = await auth.createApiKey({ tenantId, userId: user.id, name: "reader", scopes: ["asset:read"] });
      const principal = await auth.authenticateApiKey(key?.secret ?? "");
      const grantInput = { tenantId, stableId: asset.asset.stableId, principalType: "user" as const, principalId: user.id, action: "read" as const, surfaces: ["api" as const] };
      const created = await auth.createPermissionGrant(grantInput);
      const updated = await auth.createPermissionGrant({ ...grantInput, surfaces: ["api", "mcp"] });
      expect(updated.id).toBe(created.id);
      expect(updated.createdAt).toBe(created.createdAt);
      await auth.createPermissionGrant({ ...grantInput, action: "write" });
      await auth.createPermissionGrant({ ...grantInput, action: "export" });
      await auth.createPermissionGrant({ ...grantInput, tenantId: foreignTenant });
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await auth.listPermissionGrants({ tenantId, stableId: asset.asset.stableId, limit: 1, cursor });
        expect(page.grants).toHaveLength(1);
        seen.push(...page.grants.map((grant) => grant.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor && seen.length < 10);
      expect(seen).toHaveLength(3);
      expect(new Set(seen).size).toBe(3);
      expect(await auth.revokePermissionGrant({ tenantId: foreignTenant, stableId: asset.asset.stableId, grantId: created.id })).toBeNull();
      expect(await auth.revokePermissionGrant({ tenantId, stableId: other.asset.stableId, grantId: created.id })).toBeNull();
      expect(await auth.canAccessAsset({ principal, asset: asset.asset, action: "read", surface: "api" })).toBe(true);
      expect((await auth.revokePermissionGrant({ tenantId, stableId: asset.asset.stableId, grantId: created.id }))?.id).toBe(created.id);
      // Use the same authenticated principal: grant revocation must be checked live.
      expect(await auth.canAccessAsset({ principal, asset: asset.asset, action: "read", surface: "api" })).toBe(false);
      expect(await auth.canAccessAsset({ principal, asset: asset.asset, action: "read", surface: "mcp" })).toBe(false);
      expect((await auth.listPermissionGrants({ tenantId, stableId: asset.asset.stableId })).grants).toHaveLength(2);
      expect((await auth.listPermissionGrants({ tenantId: foreignTenant, stableId: asset.asset.stableId })).grants).toHaveLength(1);
    });

    it("evaluates a mixed corpus with identical single and batch policy, in original order", async () => {
      const { auth, registry, tenantId } = repositories();
      const direct = await registry.createAsset({ ...sample, tenantId, stableId: "policy.direct" });
      const denied = await registry.createAsset({ ...sample, tenantId, stableId: "policy.denied" });
      const grouped = await registry.createAsset({ ...sample, tenantId, stableId: "policy.group" });
      const publicAsset = await registry.createAsset({ ...sample, tenantId, stableId: "policy.public", sensitivity: "public-demo" });
      const wrongSurface = await registry.createAsset({ ...sample, tenantId, stableId: "policy.mcp-only", allowedSurfaces: ["mcp"] });
      const foreign = await registry.createAsset({ ...sample, tenantId: `${tenantId}_foreign`, stableId: "policy.direct" });
      const user = await auth.createUser({ tenantId, email: "reader@example.test", displayName: "Reader", role: "reader" });
      const group = await auth.createGroup({ tenantId, slug: "readers", name: "Readers" });
      await auth.addGroupMember({ tenantId, userId: user.id, groupId: group.id });
      const key = await auth.createApiKey({ tenantId, userId: user.id, name: "reader", scopes: ["asset:read"], allowedSurfaces: ["api"] });
      const principal = await auth.authenticateApiKey(key?.secret ?? "");
      await auth.createPermissionGrant({ tenantId, stableId: direct.asset.stableId, principalType: "user", principalId: user.id, surfaces: ["api"] });
      await auth.createPermissionGrant({ tenantId, stableId: grouped.asset.stableId, principalType: "group", principalId: group.id, surfaces: ["api"] });
      const assets = [denied, grouped, wrongSurface, publicAsset, foreign, direct].map((detail) => detail.asset);
      const querySpy = pool ? vi.spyOn(pool, "query") : null;
      const allowed = await auth.filterAccessibleAssets({ principal, assets, action: "read", surface: "api" });
      expect(allowed.map((asset) => asset.id)).toEqual([grouped.asset.id, publicAsset.asset.id, direct.asset.id]);
      if (querySpy) {
        expect(querySpy).toHaveBeenCalledTimes(1);
        querySpy.mockRestore();
      }
      const individuallyAllowed = [];
      for (const asset of assets) {
        if (await auth.canAccessAsset({ principal, asset, action: "read", surface: "api" })) individuallyAllowed.push(asset);
      }
      expect(allowed).toEqual(individuallyAllowed);
      expect(await auth.filterAccessibleAssets({ principal, assets, action: "write", surface: "api" })).toEqual([]);
      expect(await auth.filterAccessibleAssets({ principal, assets, action: "read", surface: "mcp" })).toEqual([]);
      expect(await auth.filterAccessibleAssets({ principal: null, assets, action: "read", surface: "api" })).toEqual([publicAsset.asset]);
    });

    it("shares public export eligibility without bypassing surface bindings", async () => {
      const { auth, registry, tenantId } = repositories();
      const exported = await registry.createAsset({ ...sample, tenantId, sensitivity: "public-demo", allowedExports: ["demo-agent-pack"], allowedSurfaces: ["api", "export"] });
      const notListed = await registry.createAsset({ ...sample, tenantId, stableId: "policy.no-package", sensitivity: "public-demo", allowedSurfaces: ["api", "export"] });
      const draft = await registry.createAsset({ ...sample, tenantId, stableId: "policy.draft", sensitivity: "public-demo", lifecycleState: "draft", status: "draft", allowedExports: ["demo-agent-pack"], allowedSurfaces: ["api", "export"] });
      const noSurface = await registry.createAsset({ ...sample, tenantId, stableId: "policy.no-surface", sensitivity: "public-demo", allowedExports: ["demo-agent-pack"], allowedSurfaces: ["api"] });
      const assets = [notListed, exported, draft, noSurface].map((detail) => detail.asset);
      expect(await auth.filterAccessibleAssets({ principal: null, assets, action: "export", surface: "export" })).toEqual([exported.asset]);
      const admin = await auth.createUser({ tenantId, email: "admin@example.test", displayName: "Admin", role: "admin" });
      const key = await auth.createApiKey({ tenantId, userId: admin.id, name: "api-only", scopes: ["admin"], allowedSurfaces: ["api"] });
      const principal = await auth.authenticateApiKey(key?.secret ?? "");
      expect(await auth.canAccessAsset({ principal, asset: exported.asset, action: "export", surface: "export" })).toBe(false);
      expect(await auth.filterAccessibleAssets({ principal, assets, action: "export", surface: "export" })).toEqual([]);
    });
  });
}
