import { describe, expect, it, vi } from "vitest";
import { ForgetBaseClient } from "./index.js";

describe("review queue continuation", () => {
  it("forwards the offset and retains permission-filtered completeness metadata", async () => {
    const response = { asOf: "2026-09-05", includeApproved: false, assets: [], totalCount: 31, nextOffset: null };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    const client = new ForgetBaseClient({ baseUrl: "https://forgetbase.test", fetchImpl: fetchMock });
    expect(await client.listAssetsNeedingReview({ asOf: response.asOf, limit: 25, offset: 25 })).toEqual(response);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://forgetbase.test/assets/review-queue?asOf=2026-09-05&includeApproved=false&limit=25&offset=25");
    await expect(client.listAssetsNeedingReview({ offset: -1 })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still accepts a response from a server without pagination metadata", async () => {
    const response = { asOf: "2026-09-05", includeApproved: false, assets: [] };
    const client = new ForgetBaseClient({ baseUrl: "https://forgetbase.test", fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)) });
    expect(await client.listAssetsNeedingReview()).toEqual(response);
  });
});
