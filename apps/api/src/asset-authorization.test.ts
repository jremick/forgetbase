import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAuthRepository,
  InMemoryAttachmentRepository,
  InMemoryManagedQueryCacheRepository,
  InMemoryRegistryRepository
} from "@forgetbase/db";
import type { AssetCreateInput, Surface } from "@forgetbase/schema";
import { buildServer } from "./server.js";

const assetInput = {
  stableId: "policy.restricted-lifecycle",
  type: "policy",
  ownerId: "synthetic-owner",
  title: "Restricted lifecycle fixture",
  lifecycleState: "active",
  sensitivity: "restricted",
  audience: ["security"],
  status: "approved",
  reviewDueAt: "2027-01-31",
  allowedSurfaces: ["api", "mcp", "web"],
  instruction: { instructionKind: "policy", body: "Restricted synthetic body must remain confidential." }
} satisfies AssetCreateInput;

const commands = [
  { route: "versions", payload: { instruction: { instructionKind: "policy", body: "Unauthorized replacement." } } },
  { route: "review", payload: { reviewDueAt: "2028-01-31" } },
  { route: "publish", payload: { reviewDueAt: "2028-01-31" } },
  { route: "restore", payload: { versionNumber: 1 } }
] as const;

const servers: ReturnType<typeof buildServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});

async function fixture(allowedSurfaces: Surface[] = ["api", "mcp", "web"]) {
  const registry = new InMemoryRegistryRepository();
  const auth = new InMemoryAuthRepository();
  const cache = new InMemoryManagedQueryCacheRepository();
  const attachments = new InMemoryAttachmentRepository();
  const files = new Map<string, Buffer>();
  const storage = {
    async put(key: string, content: Uint8Array) { files.set(key, Buffer.from(content)); },
    async get(key: string) { const content = files.get(key); if (!content) throw new Error("Missing fixture attachment"); return content; },
    async delete(key: string) { return files.delete(key); }
  };
  const asset = await registry.createAsset(assetInput);
  const maintainer = await auth.createUser({ email: "maintainer@example.test", displayName: "Maintainer", role: "maintainer" });
  const key = await auth.createApiKey({ userId: maintainer.id, name: "maintainer", scopes: ["asset:read", "asset:write"], allowedSurfaces });
  if (!key) throw new Error("Missing fixture key");
  const server = buildServer({ logger: false, registryRepository: registry, authRepository: auth, cacheRepository: cache, attachmentRepository: attachments, attachmentStorage: storage, attachmentScanRequired: false });
  servers.push(server);
  return { server, registry, auth, cache, asset, maintainer, headers: { authorization: `Bearer ${key.secret}` } };
}

describe("asset lifecycle authorization", () => {
  it("requires read scope for public unpublished preview, history, and current collections", async () => {
    const { server, registry, auth, maintainer } = await fixture();
    const published = await registry.createAsset({ ...assetInput, stableId: "policy.public-preview", sensitivity: "public-demo" });
    await registry.updateAsset(published.asset.stableId, { instruction: { instructionKind: "policy", body: "Unapproved scope-only body." } });
    const key = await auth.createApiKey({ userId: maintainer.id, name: "write-only", scopes: ["asset:write"] });
    await auth.createPermissionGrant({ stableId: published.asset.stableId, principalType: "user", principalId: maintainer.id, action: "write", surfaces: ["api"] });
    for (const url of [`/assets/${published.asset.stableId}?preview=true`, `/assets/${published.asset.stableId}/versions/2`, "/assets?preview=true", "/assets/review-queue"]) {
      const denied = await server.inject({ method: "GET", url, headers: { authorization: `Bearer ${key?.secret}` } });
      expect(denied.statusCode, url).toBe(403);
      expect(denied.body).not.toContain("Unapproved scope-only body.");
    }
  });

  it.each(commands)("denies an ungranted maintainer's $route without returning content or changing state", async ({ route, payload }) => {
    const { server, registry, asset, headers } = await fixture();
    const before = await registry.getAssetByStableId(asset.asset.stableId);
    const read = await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}`, headers });
    const mutation = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/${route}`, headers, payload });
    expect(read.statusCode).toBe(403);
    expect(mutation.statusCode).toBe(403);
    expect(mutation.json()).toEqual({ error: "access_denied" });
    expect(await registry.getAssetByStableId(asset.asset.stableId)).toEqual(before);
  });

  it.each(commands)("requires both read and write permission for the $route response", async ({ route, payload }) => {
    const { server, registry, auth, asset, maintainer, headers } = await fixture();
    const before = await registry.getAssetByStableId(asset.asset.stableId);
    const writeGrant = await auth.createPermissionGrant({ stableId: asset.asset.stableId, principalType: "user", principalId: maintainer.id, action: "write", surfaces: ["api"] });
    const writeOnly = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/${route}`, headers, payload });
    expect(writeOnly.statusCode).toBe(403);
    await auth.revokePermissionGrant({ stableId: asset.asset.stableId, grantId: writeGrant.id });
    await auth.createPermissionGrant({ stableId: asset.asset.stableId, principalType: "user", principalId: maintainer.id, action: "read", surfaces: ["api"] });
    const readOnly = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/${route}`, headers, payload });
    expect(readOnly.statusCode).toBe(403);
    expect(await registry.getAssetByStableId(asset.asset.stableId)).toEqual(before);
  });

  it.each(commands)("intersects grants with key and asset surfaces for $route", async ({ route, payload }) => {
    const { server, auth, asset, maintainer, headers } = await fixture();
    for (const action of ["read", "write"] as const) {
      await auth.createPermissionGrant({ stableId: asset.asset.stableId, principalType: "user", principalId: maintainer.id, action, surfaces: ["mcp"] });
    }
    const wrongSurface = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/${route}`, headers, payload });
    expect(wrongSurface.statusCode).toBe(403);
    const apiOnlyKey = await auth.createApiKey({ userId: maintainer.id, name: "api-only", scopes: ["asset:read", "asset:write"], allowedSurfaces: ["api"] });
    const forgedSurface = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/${route}`, headers: { authorization: `Bearer ${apiOnlyKey?.secret}`, "x-forgetbase-surface": "mcp" }, payload });
    expect(forgedSurface.statusCode).toBe(403);
    const authorized = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/${route}`, headers: { ...headers, "x-forgetbase-surface": "mcp" }, payload });
    expect(authorized.statusCode).toBe(200);
  });

  it.each(commands)("ignores a foreign tenant supplied to $route", async ({ route, payload }) => {
    const { server, registry, auth, asset, headers } = await fixture();
    const foreign = await registry.createAsset({ ...assetInput, tenantId: "tenant_other", stableId: "policy.foreign-only" });
    const denied = await server.inject({ method: "POST", url: `/assets/${foreign.asset.stableId}/${route}`, headers, payload: { ...payload, tenantId: "tenant_other" } });
    expect(denied.statusCode).toBe(404);
    expect(await registry.getAssetByStableId(foreign.asset.stableId, { tenantId: "tenant_other" })).toEqual(foreign);
    expect(await auth.listPermissionGrants({ stableId: asset.asset.stableId })).toEqual({ grants: [], nextCursor: null });
  });
});

describe("authenticated asset creators", () => {
  it("lets the creator preview, edit, and publish using grants bounded by their key surfaces", async () => {
    const { server, auth, maintainer, headers } = await fixture(["api", "mcp"]);
    const other = await auth.createUser({ email: "other-maintainer@example.test", displayName: "Other", role: "maintainer" });
    const created = await server.inject({ method: "POST", url: "/assets", headers, payload: { ...assetInput, stableId: "policy.created", ownerId: other.id, lifecycleState: "draft", status: "draft", tenantId: "tenant_ignored", creator: { principalId: other.id } } });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().asset).toMatchObject({ tenantId: "tenant_demo", ownerId: other.id });
    const grants = (await auth.listPermissionGrants({ stableId: "policy.created" })).grants;
    expect(grants.map((grant) => ({ principalId: grant.principalId, action: grant.action, surfaces: grant.surfaces }))).toEqual([
      { principalId: maintainer.id, action: "read", surfaces: ["api", "mcp"] },
      { principalId: maintainer.id, action: "write", surfaces: ["api", "mcp"] }
    ]);
    expect((await server.inject({ method: "GET", url: "/assets/policy.created?preview=true", headers })).statusCode).toBe(200);
    expect((await server.inject({ method: "POST", url: "/assets/policy.created/versions", headers, payload: { instruction: { instructionKind: "policy", body: "Creator's next draft." } } })).statusCode).toBe(200);
    expect((await server.inject({ method: "POST", url: "/assets/policy.created/publish", headers, payload: {} })).statusCode).toBe(200);
    const otherKey = await auth.createApiKey({ userId: other.id, name: "other", scopes: ["asset:read", "asset:write"] });
    expect((await server.inject({ method: "GET", url: "/assets/policy.created?preview=true", headers: { authorization: `Bearer ${otherKey?.secret}` } })).statusCode).toBe(403);
    expect((await auth.listPermissionGrants({ tenantId: "tenant_ignored", stableId: "policy.created" })).grants).toEqual([]);
    expect((await server.inject({ method: "POST", url: "/assets", headers, payload: { ...assetInput, stableId: "policy.no-key-surface", allowedSurfaces: ["web"] } })).statusCode).toBe(403);
  });

  it("does not persist an in-memory asset when its creator grant batch fails", async () => {
    const { server, registry, auth, headers } = await fixture();
    vi.spyOn(auth, "createPermissionGrants").mockRejectedValueOnce(new Error("Synthetic creator permission failure"));
    const response = await server.inject({ method: "POST", url: "/assets", headers, payload: { ...assetInput, stableId: "policy.failed-create", lifecycleState: "draft", status: "draft" } });
    expect(response.statusCode).toBe(500);
    expect(await registry.getAssetByStableId("policy.failed-create")).toBeNull();
    expect((await auth.listPermissionGrants({ stableId: "policy.failed-create" })).grants).toEqual([]);
  });
});

describe("attachment publication boundary", () => {
  it("rejects upload and deletion until the current asset version is published", async () => {
    const { server, registry, auth, asset } = await fixture();
    const admin = await auth.createUser({ email: "attachment-admin@example.test", displayName: "Admin", role: "admin" });
    const key = await auth.createApiKey({ userId: admin.id, name: "attachments", scopes: ["admin"] });
    const headers = { authorization: `Bearer ${key?.secret}` };
    const upload = (stableId: string, filename: string) => server.inject({ method: "POST", url: `/assets/${stableId}/attachments`, headers: { ...headers, "content-type": "application/octet-stream", "x-forgetbase-attachment-filename-encoded": encodeURIComponent(filename), "x-forgetbase-attachment-media-type": "text/plain" }, payload: Buffer.from("Synthetic attachment.") });
    const existing = await upload(asset.asset.stableId, "approved.txt");
    expect(existing.statusCode).toBe(201);
    await registry.updateAsset(asset.asset.stableId, { lifecycleState: "draft", status: "draft", instruction: { instructionKind: "policy", body: "Unapproved next draft." } });
    const deniedUpload = await upload(asset.asset.stableId, "unapproved.txt");
    expect(deniedUpload.statusCode).toBe(409);
    expect(deniedUpload.json().error).toBe("publication_required");
    const deniedDelete = await server.inject({ method: "DELETE", url: `/assets/${asset.asset.stableId}/attachments/${existing.json().id}`, headers });
    expect(deniedDelete.statusCode).toBe(409);
    expect(deniedDelete.json().error).toBe("publication_required");
    const listed = await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}/attachments`, headers });
    expect(listed.json().attachments.map((attachment: { filename: string }) => attachment.filename)).toEqual(["approved.txt"]);
    const newDraft = await registry.createAsset({ ...assetInput, stableId: "policy.new-draft", lifecycleState: "draft", status: "draft" });
    expect((await upload(newDraft.asset.stableId, "new-draft.txt")).statusCode).toBe(409);
    await registry.publishAsset(asset.asset.stableId, {});
    expect((await upload(asset.asset.stableId, "published.txt")).statusCode).toBe(201);
    expect((await server.inject({ method: "DELETE", url: `/assets/${asset.asset.stableId}/attachments/${existing.json().id}`, headers })).statusCode).toBe(200);
  });
});

describe("individual asset grant administration", () => {
  it.each(["cache-invalidation", "audit-recording", "both"] as const)("acknowledges committed grant changes when %s needs reconciliation", async (failure) => {
    const { server, auth, cache, asset, maintainer } = await fixture();
    const admin = await auth.createUser({ email: "admin@example.test", displayName: "Admin", role: "admin" });
    const key = await auth.createApiKey({ userId: admin.id, name: "admin", scopes: ["admin"] });
    const headers = { authorization: `Bearer ${key?.secret}` };
    const expectedActions = failure === "both" ? ["cache-invalidation", "audit-recording"] : [failure];
    if (failure !== "audit-recording") vi.spyOn(cache, "invalidateTenant").mockRejectedValue(new Error("Synthetic cache outage"));
    if (failure !== "cache-invalidation") vi.spyOn(auth, "recordAuditEvent").mockRejectedValue(new Error("Synthetic audit outage"));
    const created = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/grants`, headers, payload: { principalType: "user", principalId: maintainer.id, action: "read", surfaces: ["api"] } });
    expect(created.statusCode).toBe(201);
    expect(created.json().reconciliation).toEqual({ status: "pending", pendingActions: expectedActions });
    expect((await auth.listPermissionGrants({ stableId: asset.asset.stableId })).grants.map((grant) => grant.id)).toEqual([created.json().id]);
    const revoked = await server.inject({ method: "DELETE", url: `/assets/${asset.asset.stableId}/grants/${created.json().id}`, headers });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().reconciliation).toEqual({ status: "pending", pendingActions: expectedActions });
    expect((await auth.listPermissionGrants({ stableId: asset.asset.stableId })).grants).toEqual([]);
  });

  it("lists every grant and revokes access immediately with cache invalidation and an audit record", async () => {
    const { server, auth, cache, asset, maintainer, headers } = await fixture();
    const adminUser = await auth.createUser({ email: "admin@example.test", displayName: "Admin", role: "admin" });
    const adminKey = await auth.createApiKey({ userId: adminUser.id, name: "admin", scopes: ["admin"] });
    const adminHeaders = { authorization: `Bearer ${adminKey?.secret}` };
    const invalidate = vi.spyOn(cache, "invalidateTenant");
    for (const action of ["read", "write"] as const) {
      const created = await server.inject({ method: "POST", url: `/assets/${asset.asset.stableId}/grants`, headers: adminHeaders, payload: { principalType: "user", principalId: maintainer.id, action, surfaces: ["api", "mcp"] } });
      expect(created.statusCode).toBe(201);
    }
    const pageOne = await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}/grants?limit=1`, headers: adminHeaders });
    expect(pageOne.statusCode).toBe(200);
    expect(pageOne.json().grants).toHaveLength(1);
    expect(pageOne.json().nextCursor).toEqual(expect.any(String));
    const pageTwo = await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}/grants?limit=1&cursor=${pageOne.json().nextCursor}`, headers: adminHeaders });
    expect(pageTwo.json().nextCursor).toBeNull();
    const grants = [...pageOne.json().grants, ...pageTwo.json().grants];
    expect(grants).toHaveLength(2);
    expect(new Set(grants.map((grant) => grant.id)).size).toBe(2);
    expect((await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}`, headers })).statusCode).toBe(200);
    const readGrant = grants.find((grant) => grant.action === "read");
    const deniedRevoke = await server.inject({ method: "DELETE", url: `/assets/${asset.asset.stableId}/grants/${readGrant.id}`, headers });
    expect(deniedRevoke.statusCode).toBe(403);
    const revoked = await server.inject({ method: "DELETE", url: `/assets/${asset.asset.stableId}/grants/${readGrant.id}`, headers: adminHeaders });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().id).toBe(readGrant.id);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenLastCalledWith({ tenantId: "tenant_demo", dryRun: false });
    for (const surface of ["api", "mcp"] as const) {
      expect((await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}`, headers: { ...headers, "x-forgetbase-surface": surface } })).statusCode).toBe(403);
    }
    expect((await server.inject({ method: "DELETE", url: `/assets/${asset.asset.stableId}/grants/${readGrant.id}`, headers: adminHeaders })).statusCode).toBe(404);
    expect((await auth.listAuditEvents()).find((event) => event.action === "permission.revoke")?.metadata.grantId).toBe(readGrant.id);
  });

  it("binds inventories and revocation to the authenticated tenant, target asset, and surface", async () => {
    const { server, registry, auth, asset, maintainer } = await fixture();
    const admin = await auth.createUser({ email: "admin@example.test", displayName: "Admin", role: "admin" });
    const adminKey = await auth.createApiKey({ userId: admin.id, name: "admin", scopes: ["admin"], allowedSurfaces: ["api"] });
    const headers = { authorization: `Bearer ${adminKey?.secret}` };
    const foreign = await registry.createAsset({ ...assetInput, tenantId: "tenant_other", stableId: "policy.foreign" });
    const other = await registry.createAsset({ ...assetInput, stableId: "policy.other" });
    const grant = await auth.createPermissionGrant({ stableId: asset.asset.stableId, principalType: "user", principalId: maintainer.id, action: "read", surfaces: ["api"] });
    expect((await server.inject({ method: "GET", url: `/assets/${foreign.asset.stableId}/grants?tenantId=tenant_other`, headers })).statusCode).toBe(404);
    expect((await server.inject({ method: "DELETE", url: `/assets/${foreign.asset.stableId}/grants/${grant.id}`, headers })).statusCode).toBe(404);
    expect((await server.inject({ method: "DELETE", url: `/assets/${other.asset.stableId}/grants/${grant.id}`, headers })).statusCode).toBe(404);
    expect((await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}/grants`, headers: { ...headers, "x-forgetbase-surface": "mcp" } })).statusCode).toBe(403);
    expect((await auth.listPermissionGrants({ stableId: asset.asset.stableId })).grants).toHaveLength(1);
    expect((await server.inject({ method: "GET", url: `/assets/${asset.asset.stableId}/grants?limit=201`, headers })).statusCode).toBe(400);
  });
});

describe("public export credential boundaries", () => {
  it("exports explicitly published public packages anonymously but rejects revoked or surface-limited credentials", async () => {
    const { server, registry, auth } = await fixture();
    const publicAsset = await registry.createAsset({ ...assetInput, stableId: "policy.public-export", sensitivity: "public-demo", allowedSurfaces: ["api", "export"], allowedExports: ["demo-agent-pack"] });
    await registry.createAsset({ ...assetInput, stableId: "policy.public-not-exportable", sensitivity: "public-demo", allowedSurfaces: ["api"], allowedExports: ["demo-agent-pack"] });
    const anonymous = await server.inject({ method: "GET", url: "/exports/ai-package?package=demo-agent-pack" });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json().assets.map((asset: { stableId: string }) => asset.stableId)).toEqual([publicAsset.asset.stableId]);
    expect((await server.inject({ method: "GET", url: "/exports/ai-package?package=not-allowed" })).json().assets).toEqual([]);
    const admin = await auth.createUser({ email: "export-admin@example.test", displayName: "Admin", role: "admin" });
    const limitedKey = await auth.createApiKey({ userId: admin.id, name: "api-only", scopes: ["admin"], allowedSurfaces: ["api"] });
    const limited = await server.inject({ method: "GET", url: "/exports/ai-package?package=demo-agent-pack", headers: { authorization: `Bearer ${limitedKey?.secret}`, "x-forgetbase-surface": "export" } });
    expect(limited.statusCode).toBe(200);
    expect(limited.json().assets).toEqual([]);
    const exportKey = await auth.createApiKey({ userId: admin.id, name: "export", scopes: ["admin"], allowedSurfaces: ["export"] });
    if (!exportKey) throw new Error("Missing fixture key");
    await auth.revokeApiKey({ apiKeyId: exportKey.apiKey.id });
    for (const authorization of [`Bearer ${exportKey.secret}`, "Bearer invalid", "Basic invalid"]) {
      const denied = await server.inject({ method: "GET", url: "/exports/ai-package?package=demo-agent-pack", headers: { authorization } });
      expect(denied.statusCode).toBe(401);
      expect(denied.json()).toEqual({ error: "authentication_required" });
    }
  });
});
