import { afterEach, describe, expect, it } from "vitest";
import { InMemoryAuthRepository, InMemoryRegistryRepository } from "@forgetbase/db";
import { buildServer } from "./server.js";

let server: ReturnType<typeof buildServer> | undefined;
afterEach(async () => { await server?.close(); });

describe("page access through the web surface", () => {
  it.each(["user", "group"] as const)("grants and revokes published reader access through a %s without changing audience labels", async (principalType) => {
    const registry = new InMemoryRegistryRepository();
    const auth = new InMemoryAuthRepository();
    const page = await registry.createAsset({
      stableId: "access.web-page", type: "human-document", ownerId: "owner", title: "Synthetic restricted page",
      lifecycleState: "active", status: "approved", sensitivity: "restricted", audience: ["intended-readers"],
      reviewDueAt: "2027-01-01", allowedSurfaces: ["web"], humanDocument: { format: "markdown", body: "Restricted published guidance." }
    });
    const reader = await auth.createUser({ email: "reader@example.test", displayName: "Reader", role: "reader" });
    const admin = await auth.createUser({ email: "admin@example.test", displayName: "Administrator", role: "admin" });
    const group = await auth.createGroup({ slug: "page-readers", name: "Page readers" });
    await auth.addGroupMember({ groupId: group.id, userId: reader.id });
    const readerKey = await auth.createApiKey({ userId: reader.id, name: "reader", scopes: ["asset:read"], allowedSurfaces: ["web"] });
    const adminKey = await auth.createApiKey({ userId: admin.id, name: "admin", scopes: ["admin"], allowedSurfaces: ["web"] });
    const readerHeaders = { authorization: `Bearer ${readerKey?.secret}`, "x-forgetbase-surface": "web" };
    const adminHeaders = { authorization: `Bearer ${adminKey?.secret}`, "x-forgetbase-surface": "web" };
    server = buildServer({ logger: false, registryRepository: registry, authRepository: auth });
    const readerGet = () => server!.inject({ method: "GET", url: `/assets/${page.asset.stableId}`, headers: readerHeaders });
    expect((await readerGet()).statusCode).toBe(403);
    const directory = await server.inject({ method: "GET", url: `/auth/${principalType === "user" ? "users" : "groups"}?limit=200`, headers: adminHeaders });
    expect(directory.statusCode).toBe(200);
    expect(directory.body).toContain(principalType === "user" ? reader.id : group.id);
    const created = await server.inject({ method: "POST", url: `/assets/${page.asset.stableId}/grants`, headers: adminHeaders, payload: { principalType, principalId: principalType === "user" ? reader.id : group.id, action: "read", surfaces: ["web"] } });
    expect(created.statusCode, created.body).toBe(201);
    const allowed = await readerGet();
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().humanDocuments[0].body).toBe("Restricted published guidance.");
    const inventory = await server.inject({ method: "GET", url: `/assets/${page.asset.stableId}/grants?limit=200`, headers: adminHeaders });
    expect(inventory.json().grants.map((grant: { id: string }) => grant.id)).toEqual([created.json().id]);
    const deniedMutation = await server.inject({ method: "DELETE", url: `/assets/${page.asset.stableId}/grants/${created.json().id}`, headers: readerHeaders });
    expect(deniedMutation.statusCode).toBe(403);
    const revoked = await server.inject({ method: "DELETE", url: `/assets/${page.asset.stableId}/grants/${created.json().id}`, headers: adminHeaders });
    expect(revoked.statusCode).toBe(200);
    const denied = await readerGet();
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain("Restricted published guidance.");
    expect((await registry.getAssetByStableId(page.asset.stableId))?.asset.audience).toEqual(["intended-readers"]);
  });
});
