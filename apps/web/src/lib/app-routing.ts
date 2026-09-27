import type { AuthPrincipal } from "@forgetbase/schema";

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

export type AppAccessPrincipal = Pick<AuthPrincipal, "role" | "scopes" | "allowedSurfaces">;

export interface AppCapabilities {
  administration: boolean;
  readAssets: boolean;
  createAssets: boolean;
  previewAssets: boolean;
  editAssets: boolean;
  reviewAssets: boolean;
  publishAssets: boolean;
  restoreAssets: boolean;
  managePageGrants: boolean;
  exportAssets: boolean;
  exportPrivateAssets: boolean;
  manageSystem: boolean;
}

/**
 * Describes which tasks the browser can offer. Asset grants, tenant boundaries,
 * publication requirements, and asset surface bindings remain API decisions.
 */
export function getAppCapabilities(principal: AppAccessPrincipal | null | undefined): AppCapabilities {
  const webAllowed = Boolean(principal?.allowedSurfaces.includes("web"));
  const hasAdminScope = Boolean(principal?.scopes.includes("admin"));
  const writerRole = principal?.role === "admin" || principal?.role === "maintainer";
  const readAssets = webAllowed && (hasAdminScope || Boolean(principal?.scopes.includes("asset:read")));
  const createAssets = webAllowed && writerRole &&
    (hasAdminScope || Boolean(principal?.scopes.includes("asset:write")));
  // Preview and existing-page commands return content, so the API needs both scopes.
  const previewAssets = createAssets && readAssets;
  const managePageGrants = webAllowed && principal?.role === "admin" &&
    (hasAdminScope || principal.scopes.includes("permission:write"));
  const manageSystem = webAllowed && principal?.role === "admin" && hasAdminScope;
  // Public-demo packages are available without an admin scope. Private assets
  // require that scope; the API still checks each asset's export permission.
  const exportAssets = webAllowed && Boolean(principal?.allowedSurfaces.includes("export"));

  return {
    administration: createAssets || managePageGrants || manageSystem,
    readAssets,
    createAssets,
    previewAssets,
    editAssets: previewAssets,
    reviewAssets: previewAssets,
    publishAssets: previewAssets,
    restoreAssets: previewAssets,
    managePageGrants,
    exportAssets,
    exportPrivateAssets: exportAssets && hasAdminScope,
    manageSystem
  };
}

const administrationRouteCapabilities: Record<Exclude<AppRoute, "reader" | "account-settings">, readonly (keyof AppCapabilities)[]> = {
  library: ["createAssets", "previewAssets"],
  search: ["readAssets"],
  "asset-read": ["previewAssets", "managePageGrants"],
  review: ["reviewAssets"],
  versions: ["previewAssets"],
  distribute: ["exportAssets"],
  activity: ["manageSystem"],
  health: ["manageSystem"],
  integrations: ["manageSystem"],
  settings: ["manageSystem"],
  policies: ["manageSystem"],
  access: ["manageSystem"],
  approvals: ["manageSystem"]
};

export function canAccessAppRoute(principal: AppAccessPrincipal | null | undefined, route: string): boolean {
  const normalizedRoute = normalizeAppRoute(route);
  if (isReaderRoute(normalizedRoute)) {
    return Boolean(principal?.allowedSurfaces.includes("web"));
  }
  const capabilities = getAppCapabilities(principal);
  return capabilities.administration && administrationRouteCapabilities[normalizedRoute as Exclude<AppRoute, "reader" | "account-settings">]
    .some((capability) => capabilities[capability]);
}

export function firstPermittedAdministrationRoute(principal: AppAccessPrincipal | null | undefined): AppRoute | null {
  return pageRouteValues.find((route) => isAdminRoute(route) && canAccessAppRoute(principal, route)) ?? null;
}

export function canUseAdministration(
  principal: Pick<AuthPrincipal, "role" | "scopes"> & Partial<Pick<AuthPrincipal, "allowedSurfaces">>
): boolean {
  // Preserve the existing role/scope-only helper contract. Application callers
  // pass the full principal so a browser-disabled key cannot enter Admin.
  return getAppCapabilities({ ...principal, allowedSurfaces: principal.allowedSurfaces ?? ["web", "export"] }).administration;
}
