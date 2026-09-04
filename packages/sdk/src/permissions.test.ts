import { describe, expect, it, vi } from "vitest";
import { ForgetBaseClient } from "./index.js";

describe("permission grant client", () => {
  it("retains inventory continuation and routes revocation with authenticated surface headers", async () => {
    const grant = {
      id: "grant/one",
      tenantId: "tenant_demo",
      assetId: "asset_one",
      stableId: "policy/restricted",
      principalType: "user",
      principalId: "user_one",
      action: "read",
      surfaces: ["api"],
      createdBy: "admin_one",
      createdAt: "2026-09-05T00:00:00.000Z"
    };
    const mutation = { ...grant, reconciliation: { status: "pending", pendingActions: ["audit-recording"] } };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) =>
      Response.json(init?.method === "DELETE" ? mutation : { grants: [grant], nextCursor: grant.id })
    );
    const client = new ForgetBaseClient({ baseUrl: "https://forgetbase.test", apiKey: "synthetic-key", surface: "api", fetchImpl: fetchMock });
    expect(await client.listAssetPermissionGrants(grant.stableId, { limit: 1, cursor: "grant before" })).toEqual({ grants: [grant], nextCursor: grant.id });
    expect(await client.revokeAssetPermissionGrant(grant.stableId, grant.id)).toEqual(mutation);
    const [list, revoke] = fetchMock.mock.calls;
    expect(String(list?.[0])).toBe("https://forgetbase.test/assets/policy%2Frestricted/grants?limit=1&cursor=grant+before");
    expect(String(revoke?.[0])).toBe("https://forgetbase.test/assets/policy%2Frestricted/grants/grant%2Fone");
    expect(revoke?.[1]?.method).toBe("DELETE");
    for (const call of fetchMock.mock.calls) {
      const headers = new Headers(call[1]?.headers);
      expect(headers.get("authorization")).toBe("Bearer synthetic-key");
      expect(headers.get("x-forgetbase-surface")).toBe("api");
    }
    await expect(client.listAssetPermissionGrants(grant.stableId, { limit: 201 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
