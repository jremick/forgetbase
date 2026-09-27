import { describe, expect, it } from "vitest";
import { buildUpdaterServer } from "./server.js";

describe("updater service authorization", () => {
  it("requires a strong local bearer token for control routes", async () => {
    const manager = {
      status: async () => ({ ok: true })
    };
    const server = buildUpdaterServer({
      manager: manager as never,
      apiToken: "a".repeat(32),
      logger: false
    });

    try {
      const denied = await server.inject({ method: "GET", url: "/v1/status" });
      const allowed = await server.inject({
        method: "GET",
        url: "/v1/status",
        headers: { authorization: `Bearer ${"a".repeat(32)}` }
      });
      expect(denied.statusCode).toBe(401);
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toEqual({ ok: true });
    } finally {
      await server.close();
    }
  });

  it("refuses weak service tokens", () => {
    expect(() => buildUpdaterServer({ manager: {} as never, apiToken: "short", logger: false }))
      .toThrow("at least 32 bytes");
  });
});
