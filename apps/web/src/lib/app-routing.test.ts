import { describe, expect, it } from "vitest";
import { canUseAdministration, canonicalAppHash, isAdminRoute, isReaderRoute, normalizeAppRoute } from "./app-routing.js";

describe("app routing", () => {
  it("canonicalizes public and legacy routes", () => {
    expect(normalizeAppRoute("#reader")).toBe("reader");
    expect(normalizeAppRoute("admin/content")).toBe("library");
    expect(normalizeAppRoute("exports")).toBe("distribute");
    expect(canonicalAppHash("library")).toBe("admin/content");
    expect(canonicalAppHash("settings")).toBe("admin/system/settings");
  });

  it("defaults unknown routes to the reader", () => {
    expect(normalizeAppRoute("unknown-route")).toBe("reader");
  });

  it("keeps the authorization boundary explicit", () => {
    expect(isReaderRoute("reader")).toBe(true);
    expect(isReaderRoute("account-settings")).toBe(true);
    expect(isAdminRoute("library")).toBe(true);
    expect(isAdminRoute("access")).toBe(true);
  });

  it.each([
    { role: "admin", scopes: ["admin"], allowed: true },
    { role: "admin", scopes: ["asset:write"], allowed: true },
    { role: "admin", scopes: ["permission:write"], allowed: true },
    { role: "maintainer", scopes: ["asset:write"], allowed: true },
    { role: "maintainer", scopes: ["admin"], allowed: true },
    { role: "maintainer", scopes: ["permission:write"], allowed: false },
    { role: "reader", scopes: ["admin", "asset:write", "permission:write"], allowed: false },
    { role: "admin", scopes: ["asset:read"], allowed: false },
    { role: "maintainer", scopes: ["asset:read"], allowed: false }
  ] as const)("matches API role-and-scope authorization for $role with $scopes", ({ role, scopes, allowed }) => {
    expect(canUseAdministration({ role, scopes: [...scopes] })).toBe(allowed);
  });
});
