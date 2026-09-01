const pageRouteValues = [
  "reader",
  "account-settings",
  "library",
  "search",
  "asset-read",
  "review",
  "versions",
  "distribute",
  "activity",
  "health",
  "updates",
  "integrations",
  "settings",
  "policies",
  "access",
  "approvals"
] as const;

export type AppRoute = (typeof pageRouteValues)[number];

const routeAliases: Record<string, AppRoute> = {
  admin: "library",
  "admin/content": "library",
  "admin/content/search": "search",
  "admin/content/page": "asset-read",
  "admin/reviews": "review",
  "admin/reviews/version-compare": "versions",
  "admin/exports": "distribute",
  "admin/system": "health",
  "admin/system/activity": "activity",
  "admin/system/health": "health",
  "admin/system/updates": "updates",
  "admin/system/integrations": "integrations",
  "admin/system/settings": "settings",
  "admin/system/policies": "policies",
  "admin/system/access": "access",
  "admin/system/approvals": "approvals",
  exports: "distribute",
  operate: "health",
  operations: "health",
  providers: "integrations",
  telemetry: "activity"
};

const canonicalHashes: Record<AppRoute, string> = {
  "account-settings": "account-settings",
  "asset-read": "admin/content/page",
  search: "admin/content/search",
  reader: "reader",
  library: "admin/content",
  review: "admin/reviews",
  versions: "admin/reviews/version-compare",
  distribute: "admin/exports",
  activity: "admin/system/activity",
  health: "admin/system/health",
  updates: "admin/system/updates",
  integrations: "admin/system/integrations",
  settings: "admin/system/settings",
  policies: "admin/system/policies",
  access: "admin/system/access",
  approvals: "admin/system/approvals"
};

const pageRoutes = new Set<string>(pageRouteValues);

export function normalizeAppRoute(route: string): AppRoute {
  const cleanedRoute = route.replace(/^#/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  const aliasedRoute = routeAliases[cleanedRoute] ?? cleanedRoute;

  return pageRoutes.has(aliasedRoute) ? aliasedRoute as AppRoute : "reader";
}

export function canonicalAppHash(route: string): string {
  return canonicalHashes[normalizeAppRoute(route)];
}

export function isReaderRoute(route: AppRoute): boolean {
  return route === "reader" || route === "account-settings";
}

export function isAdminRoute(route: AppRoute): boolean {
  return !isReaderRoute(route);
}

export function canUseAdministration(principal: Pick<AuthPrincipal, "role" | "scopes">): boolean {
  const hasAdminScope = principal.scopes.includes("admin");
  const canWriteAssets = (principal.role === "admin" || principal.role === "maintainer") &&
    (hasAdminScope || principal.scopes.includes("asset:write"));
  const canManagePermissions = principal.role === "admin" &&
    (hasAdminScope || principal.scopes.includes("permission:write"));

  return canWriteAssets || canManagePermissions;
}
import type { AuthPrincipal } from "@forgetbase/schema";
