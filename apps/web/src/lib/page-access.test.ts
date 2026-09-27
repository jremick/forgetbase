import { describe, expect, it, vi } from "vitest";
import type { PermissionGrant } from "@forgetbase/schema";
import type { AppRequest } from "./app-api.js";
import { grantMutationMessage, loadGrantPrincipals, loadPageGrants, pageAccessError, pageGrantPayload } from "./page-access.js";

const grant: PermissionGrant = { id: "grant-one", tenantId: "tenant_demo", assetId: "asset-one", stableId: "page/one", principalType: "user", principalId: "user-one", action: "read", surfaces: ["web"], createdBy: null, createdAt: "2026-09-05T00:00:00.000Z" };

describe("page access workflows", () => {
  it("loads every grant without duplicating an overlapping page and safely encodes IDs", async () => {
    const request = vi.fn<AppRequest>()
      .mockResolvedValueOnce({ grants: [grant], nextCursor: "grant next" })
      .mockResolvedValueOnce({ grants: [grant, { ...grant, id: "grant-two" }], nextCursor: null });
    expect((await loadPageGrants(request as AppRequest, grant.stableId)).map((item) => item.id)).toEqual(["grant-one", "grant-two"]);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/assets/page%2Fone/grants?limit=200",
      "/assets/page%2Fone/grants?limit=200&cursor=grant+next"
    ]);
  });

  it("rejects incomplete listings instead of representing partial access as complete", async () => {
    const request = vi.fn<AppRequest>().mockResolvedValue({ grants: [grant], nextCursor: "repeated" });
    await expect(loadPageGrants(request as AppRequest, grant.stableId)).rejects.toThrow("did not complete");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("retains the usable group picker when people listing is denied", async () => {
    const request = vi.fn<AppRequest>()
      .mockRejectedValueOnce(new Error('403 {"error":"access_denied"}'))
      .mockResolvedValueOnce({ groups: [{ id: "group-one", name: "Readers" }] });
    const directory = await loadGrantPrincipals(request as AppRequest);
    expect(directory.groups).toEqual([{ id: "group-one", name: "Readers" }]);
    expect(directory.users).toEqual([]);
    expect(directory.errors).toEqual(["People: Your account cannot perform this access operation."]);
  });

  it("marks a capped directory honestly so missing entries can use an explicit ID", async () => {
    const request = vi.fn<AppRequest>()
      .mockResolvedValueOnce({ users: Array.from({ length: 200 }, (_, index) => ({ id: `user-${index}` })) })
      .mockResolvedValueOnce({ groups: [] });
    expect((await loadGrantPrincipals(request as AppRequest)).mayBeIncomplete).toBe(true);
  });

  it("cannot submit an empty principal or grant a surface outside the page boundary", () => {
    const draft = { principalType: "group" as const, principalId: " group-one ", action: "read" as const, surfaces: ["web", "api", "web"] as const };
    expect(pageGrantPayload({ ...draft, surfaces: [...draft.surfaces] }, ["web"])).toEqual({ principalType: "group", principalId: "group-one", action: "read", surfaces: ["web"] });
    expect(() => pageGrantPayload({ ...draft, principalId: " ", surfaces: ["web"] }, ["web"])).toThrow("Choose a person");
    expect(() => pageGrantPayload({ ...draft, surfaces: ["api"] }, ["web"])).toThrow("at least one surface");
  });

  it("reports committed changes with pending reconciliation without falsely claiming completion", () => {
    const message = grantMutationMessage({ ...grant, reconciliation: { status: "pending", pendingActions: ["cache-invalidation"] } }, "revoked");
    expect(message).toContain("Grant revoked");
    expect(message).toContain("still completing cache-invalidation");
    expect(message).not.toContain("has been refreshed");
    expect(pageAccessError(new Error('401 {"error":"authentication_required"}'))).toContain("Sign in again");
  });
});
