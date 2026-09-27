import { afterEach, describe, expect, it } from "vitest";
import { InMemoryAuthRepository, InMemoryRegistryRepository } from "@forgetbase/db";
import type { UserRole } from "@forgetbase/schema";
import { buildServer } from "./server.js";

let server: ReturnType<typeof buildServer> | undefined;
afterEach(async () => { await server?.close(); });

async function fixture() {
  const registry = new InMemoryRegistryRepository();
  const auth = new InMemoryAuthRepository();
  const created = await registry.createAsset({
    stableId: "publication.api-guide", type: "human-document", ownerId: "owner", title: "Approved title",
    lifecycleState: "active", status: "approved", sensitivity: "internal", audience: ["readers"],
    reviewDueAt: "2027-01-01", allowedSurfaces: ["api", "web", "mcp", "cli"],
    humanDocument: { format: "markdown", body: "Approved guidance." }
  });
  const draft = await registry.updateAsset(created.asset.stableId, {
    lifecycleState: "draft", status: "draft", title: "Secret draft title", metadata: { secretDraft: true },
    humanDocument: { format: "markdown", body: "Secret draft guidance." }
  });
  server = buildServer({ logger: false, registryRepository: registry, authRepository: auth });
  async function identity(role: UserRole, grants: Array<"read" | "write">, surfaces: Array<"api" | "web" | "mcp" | "cli"> = ["api", "web", "mcp", "cli"]) {
    const user = await auth.createUser({ email: `${role}-${grants.join("-")}@example.test`, displayName: role, role });
    const key = await auth.createApiKey({
      userId: user.id, name: "publication-test", scopes: role === "reader" ? ["asset:read"] : ["asset:read", "asset:write"],
      allowedSurfaces: surfaces
    });
    for (const action of grants) await auth.createPermissionGrant({
      stableId: created.asset.stableId, principalType: "user", principalId: user.id, action, surfaces
    });
    return { authorization: `Bearer ${key?.secret}` };
  }
  return { registry, created, draft, identity };
}

describe("published API reads and explicit preview", () => {
  it("keeps public approved content available during editing and immediately denies tightened access", async () => {
    const { registry } = await fixture();
    const published = await registry.createAsset({
      stableId: "publication.public-guide", type: "human-document", ownerId: "owner", title: "Public approved title",
      lifecycleState: "active", status: "approved", sensitivity: "public-demo", audience: ["everyone"],
      reviewDueAt: "2027-01-01", allowedSurfaces: ["api"],
      humanDocument: { format: "markdown", body: "Public approved guidance." }
    });
    await registry.updateAsset(published.asset.stableId, {
      lifecycleState: "draft", status: "draft", title: "Unpublished title",
      humanDocument: { format: "markdown", body: "Unpublished guidance." }
    });
    const available = await server!.inject({ method: "GET", url: `/assets/${published.asset.stableId}` });
    expect(available.statusCode, available.body).toBe(200);
    expect(available.json().humanDocuments[0].body).toBe("Public approved guidance.");
    expect(available.body).not.toContain("Unpublished");
    await registry.updateAsset(published.asset.stableId, {
      sensitivity: "restricted", humanDocument: { format: "markdown", body: "Restricted draft." }
    });
    const denied = await server!.inject({ method: "GET", url: `/assets/${published.asset.stableId}` });
    expect(denied.statusCode).toBe(401);
    expect(denied.body).not.toContain("Public approved guidance");
  });

  it("serves the same approved version on every ordinary surface without draft history or metadata", async () => {
    const { identity, created } = await fixture();
    const headers = await identity("reader", ["read"]);
    for (const surface of ["api", "web", "cli", "mcp"]) {
      const response = await server!.inject({
        method: "GET", url: `/assets/${created.asset.stableId}`,
        headers: { ...headers, "x-forgetbase-surface": surface }
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().asset.currentVersionId).toBe(created.asset.currentVersionId);
      expect(response.json().versions).toHaveLength(1);
      expect(response.json().humanDocuments[0].body).toBe("Approved guidance.");
      expect(response.body).not.toContain("Secret draft");
      expect(response.body).not.toContain("secretDraft");
    }
  });

  it("requires current target read and write grants for previews and historical draft versions", async () => {
    const { identity, created, draft } = await fixture();
    const reader = await identity("reader", ["read"]);
    const maintainerRead = await identity("maintainer", ["read"]);
    const maintainerWrite = await identity("maintainer", ["write"]);
    const maintainerBoth = await identity("maintainer", ["read", "write"]);
    for (const headers of [reader, maintainerRead, maintainerWrite]) {
      for (const url of [
        `/assets/${created.asset.stableId}?preview=true`,
        `/assets/${created.asset.stableId}/versions/2`,
        `/assets/${created.asset.stableId}/versions/by-id/${draft!.asset.currentVersionId}`
      ]) {
        const response = await server!.inject({ method: "GET", url, headers });
        expect(response.statusCode, response.body).toBe(403);
        expect(response.body).not.toContain("Secret draft");
      }
    }
    const allowed = await server!.inject({ method: "GET", url: `/assets/${created.asset.stableId}?preview=true`, headers: maintainerBoth });
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(allowed.json().humanDocuments[0].body).toBe("Secret draft guidance.");
    const history = await server!.inject({ method: "GET", url: `/assets/${created.asset.stableId}/versions/2`, headers: maintainerBoth });
    expect(history.statusCode, history.body).toBe(200);
  });

  it("denies historical access when current permissions remove the requesting surface", async () => {
    const { identity, created, registry } = await fixture();
    const headers = await identity("maintainer", ["read", "write"]);
    await registry.updateAsset(created.asset.stableId, {
      lifecycleState: "draft", sensitivity: "restricted", allowedSurfaces: ["web"],
      humanDocument: { format: "markdown", body: "Web-only draft." }
    });
    const response = await server!.inject({ method: "GET", url: `/assets/${created.asset.stableId}/versions/1`, headers });
    expect(response.statusCode, response.body).toBe(403);
    expect(response.body).not.toContain("Approved guidance");
  });

  it("makes never-published drafts unavailable to readers and available only through authorized preview", async () => {
    const { identity, created, registry } = await fixture();
    const reader = await identity("reader", ["read"]);
    const maintainer = await identity("maintainer", ["read", "write"]);
    await registry.updateAsset(created.asset.stableId, {
      lifecycleState: "archived", humanDocument: { format: "markdown", body: "Withdrawn." }
    });
    await registry.restoreAssetVersion(created.asset.stableId, { versionNumber: 1 });
    const ordinary = await server!.inject({ method: "GET", url: `/assets/${created.asset.stableId}`, headers: reader });
    expect(ordinary.statusCode).toBe(404);
    const preview = await server!.inject({ method: "GET", url: `/assets/${created.asset.stableId}?preview=true`, headers: maintainer });
    expect(preview.statusCode, preview.body).toBe(200);
  });
});
