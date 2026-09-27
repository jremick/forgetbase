import type { AuthPrincipal } from "@forgetbase/schema";
import { describe, expect, it } from "vitest";
import {
  canAccessAppRoute,
  canUseAdministration,
  canonicalAppHash,
  firstPermittedAdministrationRoute,
  getAppCapabilities,
  isAdminRoute,
  isReaderRoute,
  normalizeAppRoute,
  type AppAccessPrincipal,
  type AppRoute
} from "./app-routing.js";

const administrationRoutes: AppRoute[] = [
  "library", "search", "asset-read", "review", "versions", "distribute",
  "activity", "health", "integrations", "settings", "policies", "access", "approvals"
];

function principal(
  role: AuthPrincipal["role"],
  scopes: AuthPrincipal["scopes"],
  allowedSurfaces: AuthPrincipal["allowedSurfaces"] = ["web", "export"]
): AppAccessPrincipal {
  return { role, scopes, allowedSurfaces };
}

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

  it.each([
    {
      name: "reader",
      principal: principal("reader", ["asset:read"]),
      routes: [],
      first: null
    },
    {
      name: "reader with elevated scopes",
      principal: principal("reader", ["admin", "asset:write", "permission:write"]),
      routes: [],
      first: null
    },
    {
      name: "maintainer",
      principal: principal("maintainer", ["asset:read", "asset:write"]),
      routes: ["library", "search", "asset-read", "review", "versions", "distribute"],
      first: "library"
    },
    {
      name: "maintainer with admin scope",
      principal: principal("maintainer", ["admin"]),
      routes: ["library", "search", "asset-read", "review", "versions", "distribute"],
      first: "library"
    },
    {
      name: "content-scoped admin",
      principal: principal("admin", ["asset:read", "asset:write"]),
      routes: ["library", "search", "asset-read", "review", "versions", "distribute"],
      first: "library"
    },
    {
      name: "write-only admin",
      principal: principal("admin", ["asset:write"]),
      routes: ["library", "distribute"],
      first: "library"
    },
    {
      name: "permission-scoped admin",
      principal: principal("admin", ["permission:write"]),
      routes: ["asset-read", "distribute"],
      first: "asset-read"
    },
    {
      name: "read-only admin",
      principal: principal("admin", ["asset:read"]),
      routes: [],
      first: null
    },
    {
      name: "full admin",
      principal: principal("admin", ["admin"]),
      routes: administrationRoutes,
      first: "library"
    },
    {
      name: "admin without web surface",
      principal: principal("admin", ["admin"], ["api", "export"]),
      routes: [],
      first: null
    },
    {
      name: "maintainer without export surface",
      principal: principal("maintainer", ["asset:read", "asset:write"], ["web"]),
      routes: ["library", "search", "asset-read", "review", "versions"],
      first: "library"
    }
  ])("offers usable administration routes to $name", ({ principal, routes, first }) => {
    expect(administrationRoutes.filter((route) => canAccessAppRoute(principal, route))).toEqual(routes);
    expect(firstPermittedAdministrationRoute(principal)).toBe(first);
    expect(canUseAdministration(principal)).toBe(first !== null);
  });

  it("checks canonical and legacy deep links with the same capabilities", () => {
    const maintainer = principal("maintainer", ["asset:read", "asset:write"]);
    expect(canAccessAppRoute(maintainer, "#admin/reviews")).toBe(true);
    expect(canAccessAppRoute(maintainer, "exports")).toBe(true);
    expect(canAccessAppRoute(maintainer, "#admin/system/access")).toBe(false);
    expect(canAccessAppRoute(maintainer, "operations")).toBe(false);
    expect(canAccessAppRoute(maintainer, "providers")).toBe(false);
  });

  it("requires read and write scopes before offering existing-page commands", () => {
    const writeOnly = getAppCapabilities(principal("maintainer", ["asset:write"]));
    expect(writeOnly).toMatchObject({
      createAssets: true,
      readAssets: false,
      previewAssets: false,
      editAssets: false,
      reviewAssets: false,
      publishAssets: false,
      restoreAssets: false
    });
    const author = getAppCapabilities(principal("maintainer", ["asset:read", "asset:write"]));
    expect(author).toMatchObject({
      createAssets: true,
      previewAssets: true,
      editAssets: true,
      reviewAssets: true,
      publishAssets: true,
      restoreAssets: true,
      managePageGrants: false,
      manageSystem: false
    });
  });

  it("separates page grants from user, group, and system administration", () => {
    expect(getAppCapabilities(principal("admin", ["permission:write"]))).toMatchObject({
      managePageGrants: true,
      manageSystem: false,
      previewAssets: false
    });
    expect(getAppCapabilities(principal("maintainer", ["admin"]))).toMatchObject({
      managePageGrants: false,
      manageSystem: false
    });
    expect(getAppCapabilities(principal("admin", ["admin"]))).toMatchObject({
      managePageGrants: true,
      manageSystem: true
    });
  });

  it("distinguishes public package export from the private export scope", () => {
    expect(getAppCapabilities(principal("maintainer", ["asset:read", "asset:write"]))).toMatchObject({
      exportAssets: true,
      exportPrivateAssets: false
    });
    expect(getAppCapabilities(principal("maintainer", ["admin"]))).toMatchObject({
      exportAssets: true,
      exportPrivateAssets: true
    });
    expect(getAppCapabilities(principal("admin", ["admin"], ["web"]))).toMatchObject({
      exportAssets: false,
      exportPrivateAssets: false
    });
  });

  it("requires a web-enabled principal for routes and exposes no anonymous actions", () => {
    expect(canAccessAppRoute(principal("reader", ["asset:read"]), "reader")).toBe(true);
    expect(canAccessAppRoute(principal("reader", ["asset:read"]), "account-settings")).toBe(true);
    expect(canAccessAppRoute(principal("admin", ["admin"], ["api"]), "reader")).toBe(false);
    expect(canAccessAppRoute(null, "library")).toBe(false);
    expect(canAccessAppRoute(null, "reader")).toBe(false);
    expect(firstPermittedAdministrationRoute(undefined)).toBeNull();
    expect(Object.values(getAppCapabilities(null)).every((allowed) => allowed === false)).toBe(true);
  });
});
