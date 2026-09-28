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

  it("limits rejected credentials before authentication while preserving health and independent peers", async () => {
    let statusCalls = 0;
    let checkCalls = 0;
    const manager = {
      status: async () => { statusCalls += 1; return { ok: true }; },
      checkForUpdates: async () => { checkCalls += 1; return { ok: true }; }
    };
    const server = buildUpdaterServer({ manager: manager as never, apiToken: "a".repeat(32), logger: false });
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const rejected = await server.inject({
          method: "GET", url: "/v1/status", remoteAddress: "192.0.2.10",
          headers: { authorization: `Bearer ${"b".repeat(32)}`, "x-forwarded-for": `198.51.100.${attempt}` }
        });
        expect(rejected.statusCode).toBe(401);
      }
      // A limiter after auth would keep returning 401 and never exhaust its budget.
      for (const [method, url, token] of [
        ["GET", "/v1/status", "wrong"],
        ["GET", "/v1/status", "a".repeat(32)],
        ["POST", "/v1/check", "a".repeat(32)],
        ["GET", "/health-extra", "a".repeat(32)]
      ] as const) {
        const limited = await server.inject({
          method, url, remoteAddress: "192.0.2.10",
          headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.20", forwarded: "for=203.0.113.21" }
        });
        expect(limited.statusCode).toBe(429);
        expect(limited.json()).toMatchObject({ error: "rate_limit_exceeded" });
        expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
      }
      expect(statusCalls).toBe(0);
      expect(checkCalls).toBe(0);
      const health = await server.inject({ method: "GET", url: "/health", remoteAddress: "192.0.2.10" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ status: "ok", service: "forgetbase-updater" });
      const independent = await server.inject({
        method: "GET", url: "/v1/status", remoteAddress: "192.0.2.11",
        headers: { authorization: `Bearer ${"a".repeat(32)}` }
      });
      expect(independent.statusCode).toBe(200);
      expect(independent.json()).toEqual({ ok: true });
      expect(statusCalls).toBe(1);
    } finally { await server.close(); }
  });

  it("refuses weak service tokens", () => {
    expect(() => buildUpdaterServer({ manager: {} as never, apiToken: "short", logger: false }))
      .toThrow("at least 32 bytes");
  });
});
