import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./server.js";

afterEach(() => vi.unstubAllEnvs());

describe("managed candidate write fence at direct API ingress", () => {
  it.each([undefined, "false"])("rejects every application request before auth or telemetry when permission is %s", async (permission) => {
    vi.stubEnv("FORGETBASE_INSTALLATION_MODE", "managed");
    vi.stubEnv("FORGETBASE_MANAGED_WRITES_ENABLED", permission);
    const server = buildServer({ logger: false });
    try {
      for (const request of [
        { method: "GET" as const, url: "/assets" },
        { method: "GET" as const, url: "/auth/me" },
        { method: "POST" as const, url: "/auth/login", payload: { email: "owner@example.test", password: "synthetic" } },
        { method: "POST" as const, url: "/search", payload: { query: "synthetic" } },
        { method: "POST" as const, url: "/assets/example/attachments", headers: { "content-type": "application/octet-stream" }, payload: Buffer.from("synthetic") },
        { method: "POST" as const, url: "/admin/updates/apply", payload: { version: "0.2.0" } }
      ]) {
        const response = await server.inject(request);
        expect(response.statusCode, `${request.method} ${request.url}`).toBe(503);
        expect(response.json()).toEqual({ error: "managed_update_maintenance" });
      }
      expect((await server.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
      expect((await server.inject({ method: "GET", url: "/ready" })).statusCode).toBe(200);
    } finally { await server.close(); }
  });
  it("preserves source-install health and access", async () => {
    vi.stubEnv("FORGETBASE_INSTALLATION_MODE", "source");
    const server = buildServer({ logger: false });
    try { expect((await server.inject({ method: "GET", url: "/health" })).statusCode).toBe(200); }
    finally { await server.close(); }
  });
});
