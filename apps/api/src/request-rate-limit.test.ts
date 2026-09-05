import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryAuthRepository } from "@forgetbase/db";
import { buildServer } from "./server.js";

let server: ReturnType<typeof buildServer> | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("request rate limits", () => {
  it("rejects excess requests across routes before authentication or body parsing", async () => {
    const auth = new InMemoryAuthRepository();
    const authenticate = vi.spyOn(auth, "authenticateApiKey");
    server = buildServer({ logger: false, authRepository: auth, requireAuthentication: true, requestRateLimitMax: 2 });
    const headers = { authorization: "Bearer invalid-test-token" };
    expect((await server.inject({ url: "/auth/me", headers })).statusCode).toBe(401);
    expect((await server.inject({ url: "/assets", headers })).statusCode).toBe(401);
    const rejected = await server.inject({ method: "POST", url: "/assets", headers: { ...headers, "content-type": "application/json" }, payload: "{invalid json" });
    expect(rejected.statusCode).toBe(429);
    expect(Number(rejected.headers["retry-after"])).toBeGreaterThan(0);
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it("also bounds unknown routes before the global authentication guard", async () => {
    const auth = new InMemoryAuthRepository();
    const authenticate = vi.spyOn(auth, "authenticateApiKey");
    server = buildServer({ logger: false, authRepository: auth, requireAuthentication: true, requestRateLimitMax: 1 });
    const headers = { authorization: "Bearer invalid-test-token" };
    expect((await server.inject({ url: "/missing-one", headers })).statusCode).toBe(401);
    expect((await server.inject({ url: "/missing-two", headers })).statusCode).toBe(429);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("ignores spoofed forwarding headers and resets an exhausted window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.now();
    server = buildServer({ logger: false, requestRateLimitMax: 1, requestRateLimitWindowMs: 1000 });
    expect((await server.inject({ url: "/", remoteAddress: "192.0.2.1", headers: { "x-forwarded-for": "192.0.2.2" } })).statusCode).toBe(200);
    expect((await server.inject({ url: "/", remoteAddress: "192.0.2.1", headers: { "x-forwarded-for": "192.0.2.3", forwarded: "for=192.0.2.4" } })).statusCode).toBe(429);
    expect((await server.inject({ url: "/", remoteAddress: "192.0.2.2" })).statusCode).toBe(200);
    vi.setSystemTime(now + 1001);
    expect((await server.inject({ url: "/", remoteAddress: "192.0.2.1" })).statusCode).toBe(200);
  });

  it("groups rotating IPv6 addresses within the same /64", async () => {
    server = buildServer({ logger: false, requestRateLimitMax: 1 });
    expect((await server.inject({ url: "/", remoteAddress: "2001:db8:1234:5678::1" })).statusCode).toBe(200);
    expect((await server.inject({ url: "/", remoteAddress: "2001:db8:1234:5678::2" })).statusCode).toBe(429);
    expect((await server.inject({ url: "/", remoteAddress: "2001:db8:1234:5679::1" })).statusCode).toBe(200);
  });

  it("keeps liveness available and gives readiness a separate bounded budget", async () => {
    const readinessCheck = vi.fn(async () => {});
    server = buildServer({ logger: false, requestRateLimitMax: 1, readinessCheck });
    expect((await server.inject("/")).statusCode).toBe(200);
    expect((await server.inject("/")).statusCode).toBe(429);
    expect((await server.inject("/health")).statusCode).toBe(200);
    for (let index = 0; index < 60; index += 1) expect((await server.inject("/ready")).statusCode).toBe(200);
    expect((await server.inject("/ready")).statusCode).toBe(429);
    expect(readinessCheck).toHaveBeenCalledTimes(60);
    expect((await server.inject("/health")).statusCode).toBe(200);
  });

  it.each([0, -1, 1.5, Infinity, 100_001])("rejects an invalid request maximum: %s", (requestRateLimitMax) => {
    expect(() => buildServer({ logger: false, requestRateLimitMax })).toThrow("FORGETBASE_REQUEST_RATE_LIMIT_MAX");
  });

  it("rejects unbounded environment values and cache/window settings", () => {
    vi.stubEnv("FORGETBASE_REQUEST_RATE_LIMIT_MAX", "9".repeat(400));
    expect(() => buildServer({ logger: false })).toThrow("FORGETBASE_REQUEST_RATE_LIMIT_MAX");
    vi.unstubAllEnvs();
    expect(() => buildServer({ logger: false, requestRateLimitMaxEntries: 100_001 })).toThrow("FORGETBASE_REQUEST_RATE_LIMIT_MAX_ENTRIES");
    expect(() => buildServer({ logger: false, requestRateLimitWindowMs: 3_600_001 })).toThrow("FORGETBASE_REQUEST_RATE_LIMIT_WINDOW_MS");
  });
});
