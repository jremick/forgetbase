type BrowserLocation = Pick<Location, "hostname" | "port">;
type BrowserStorage = Pick<Storage, "getItem">;

export const localSplitOriginDefaultApiUrl = "http://127.0.0.1:3000";
export const apiUrlStorageKey = "agentic-cms-api-url";

const localDevHostnamePattern = /^(127\.0\.0\.1|localhost)$/;
const localDevWebPorts = new Set(["5173", "5175"]);

export const localDevLoginDefaults = {
  tenantId: "tenant_demo",
  email: "admin@example.test",
  password: "local-dev-password"
} as const;

function getBrowserLocation(): BrowserLocation | undefined {
  return typeof window === "undefined" ? undefined : window.location;
}

function getBrowserStorage(): BrowserStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function isLocalSplitOriginWeb(location: BrowserLocation | undefined = getBrowserLocation()): boolean {
  return Boolean(
    location &&
    localDevHostnamePattern.test(location.hostname) &&
    localDevWebPorts.has(location.port)
  );
}

export function resolveDefaultApiUrl(
  configuredApiUrl: string | undefined = undefined,
  location: BrowserLocation | undefined = getBrowserLocation()
): string {
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (isLocalSplitOriginWeb(location)) {
    return localSplitOriginDefaultApiUrl;
  }

  return "/api";
}

export function readInitialApiUrl(
  configuredApiUrl: string | undefined = undefined,
  storage: BrowserStorage | undefined = getBrowserStorage(),
  location: BrowserLocation | undefined = getBrowserLocation()
): string {
  const defaultApiUrl = resolveDefaultApiUrl(configuredApiUrl, location);
  const storedApiUrl = storage?.getItem(apiUrlStorageKey);

  if (!storedApiUrl) {
    return defaultApiUrl;
  }

  if (storedApiUrl === "/api" && defaultApiUrl !== "/api") {
    return defaultApiUrl;
  }

  if (storedApiUrl === localSplitOriginDefaultApiUrl && defaultApiUrl !== localSplitOriginDefaultApiUrl) {
    return defaultApiUrl;
  }

  return storedApiUrl;
}

export function readInitialLoginTenantId(
  storage: BrowserStorage | undefined = getBrowserStorage(),
  location: BrowserLocation | undefined = getBrowserLocation()
): string {
  return storage?.getItem("agentic-cms-login-tenant") ?? (isLocalSplitOriginWeb(location) ? localDevLoginDefaults.tenantId : "");
}

export function readInitialLoginEmail(
  storage: BrowserStorage | undefined = getBrowserStorage(),
  location: BrowserLocation | undefined = getBrowserLocation()
): string {
  return storage?.getItem("agentic-cms-login-email") ?? (isLocalSplitOriginWeb(location) ? localDevLoginDefaults.email : "");
}

export function readInitialLoginPassword(location: BrowserLocation | undefined = getBrowserLocation()): string {
  return isLocalSplitOriginWeb(location) ? localDevLoginDefaults.password : "";
}

export function localSplitOriginAuthKey(secret: string, location: BrowserLocation | undefined = getBrowserLocation()): string {
  return isLocalSplitOriginWeb(location) ? secret : "";
}
