import type { ExternalAuthProvider, ModelProvider } from "@forgetbase/schema";
import { isReservedProviderSecretEnvVar } from "@forgetbase/db";

export const PROVIDER_SECRET_BINDINGS_ENV_VAR = "FORGETBASE_PROVIDER_SECRET_BINDINGS";

export type DeploymentProviderId = ModelProvider | ExternalAuthProvider;

export interface DeploymentProviderSecretBinding {
  envVar: string;
  provider: DeploymentProviderId;
  /** Origin receiving the credential. For OIDC, this is the token endpoint. */
  origin: string;
  /** OIDC discovery issuer when it differs from the token endpoint origin. */
  issuerOrigin?: string;
}

const DEFAULT_PROVIDER_SECRET_BINDINGS: readonly DeploymentProviderSecretBinding[] = [
  { envVar: "OPENAI_API_KEY", provider: "openai", origin: "https://api.openai.com" },
  { envVar: "ANTHROPIC_API_KEY", provider: "anthropic", origin: "https://api.anthropic.com" },
  { envVar: "OPENROUTER_API_KEY", provider: "openrouter", origin: "https://openrouter.ai" },
  { envVar: "ENTRA_CLIENT_SECRET", provider: "microsoft-entra", origin: "https://login.microsoftonline.com" }
];

const PROVIDER_IDS = new Set<DeploymentProviderId>([
  "openai",
  "anthropic",
  "openrouter",
  "oidc",
  "microsoft-entra"
]);

const SECRET_ENV_VAR_NAME = /^[A-Z_][A-Z0-9_]*$/;
const MAX_BINDINGS = 200;

export function readDeploymentProviderSecretBindings(
  serialized = process.env[PROVIDER_SECRET_BINDINGS_ENV_VAR]
): readonly DeploymentProviderSecretBinding[] {
  if (!serialized?.trim()) {
    return DEFAULT_PROVIDER_SECRET_BINDINGS;
  }

  let value: unknown;

  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR} must be a JSON array`);
  }

  if (!Array.isArray(value) || value.length > MAX_BINDINGS) {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR} must contain at most ${MAX_BINDINGS} bindings`);
  }

  const configured = value.map((entry, index) => parseBinding(entry, index));
  return requireUniqueBindings([...DEFAULT_PROVIDER_SECRET_BINDINGS, ...configured]);
}

export function validateDeploymentProviderSecretBindings(
  bindings: readonly DeploymentProviderSecretBinding[]
): readonly DeploymentProviderSecretBinding[] {
  if (bindings.length > MAX_BINDINGS) {
    throw new Error(`Deployment provider secret bindings must contain at most ${MAX_BINDINGS} bindings`);
  }

  return requireUniqueBindings(bindings.map((binding, index) => parseBinding(binding, index)));
}

export function isDeploymentProviderSecretAllowed(
  bindings: readonly DeploymentProviderSecretBinding[],
  input: {
    envVar: string;
    provider: DeploymentProviderId;
    destinationUrl: string;
  },
  endpoint: "destination" | "issuer" = "destination"
): boolean {
  if (isReservedProviderSecretEnvVar(input.envVar) || /(?:_FILE)+$/.test(input.envVar)) {
    return false;
  }

  let origin: string;

  try {
    origin = readUrlOrigin(input.destinationUrl);
  } catch {
    return false;
  }

  return bindings.some((binding) =>
    binding.envVar === input.envVar &&
    binding.provider === input.provider &&
    (endpoint === "issuer" ? binding.issuerOrigin ?? binding.origin : binding.origin) === origin
  );
}

function parseBinding(value: unknown, index: number): DeploymentProviderSecretBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR}[${index}] must be an object`);
  }

  const entry = value as Record<string, unknown>;
  const envVar = entry.envVar;
  const provider = entry.provider;
  const origin = entry.origin;

  if (typeof envVar !== "string" || !SECRET_ENV_VAR_NAME.test(envVar)) {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR}[${index}].envVar is invalid`);
  }

  if (isReservedProviderSecretEnvVar(envVar) || /(?:_FILE)+$/.test(envVar)) {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR}[${index}].envVar is reserved`);
  }

  if (typeof provider !== "string" || !PROVIDER_IDS.has(provider as DeploymentProviderId)) {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR}[${index}].provider is invalid`);
  }

  if (typeof origin !== "string") {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR}[${index}].origin is invalid`);
  }

  const issuerOrigin = entry.issuerOrigin;
  if (issuerOrigin !== undefined && (
    typeof issuerOrigin !== "string" || (provider !== "oidc" && provider !== "microsoft-entra")
  )) {
    throw new Error(`${PROVIDER_SECRET_BINDINGS_ENV_VAR}[${index}].issuerOrigin requires an OIDC provider and an exact origin`);
  }

  return {
    envVar,
    provider: provider as DeploymentProviderId,
    origin: parseConfiguredOrigin(origin),
    ...(issuerOrigin === undefined ? {} : { issuerOrigin: parseConfiguredOrigin(issuerOrigin) })
  };
}

function requireUniqueBindings(
  bindings: readonly DeploymentProviderSecretBinding[]
): readonly DeploymentProviderSecretBinding[] {
  const unique = new Map<string, DeploymentProviderSecretBinding>();

  for (const binding of bindings) {
    const existing = unique.get(binding.envVar);

    if (existing && (existing.provider !== binding.provider || existing.origin !== binding.origin ||
      (existing.issuerOrigin ?? existing.origin) !== (binding.issuerOrigin ?? binding.origin))) {
      throw new Error(`Deployment provider secret env var ${binding.envVar} must bind to exactly one provider origin`);
    }

    unique.set(binding.envVar, binding);
  }

  return Array.from(unique.values());
}

function parseConfiguredOrigin(value: string): string {
  const url = parseProviderUrl(value);

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Provider secret binding origins must contain only scheme, host, and optional port");
  }

  return url.origin;
}

function readUrlOrigin(value: string): string {
  return parseProviderUrl(value).origin;
}

function parseProviderUrl(value: string): URL {
  const url = new URL(value);

  if (url.username || url.password || url.origin === "null") {
    throw new Error("Provider secret binding origins must not contain credentials");
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHostname(url.hostname))) {
    throw new Error("Provider secret binding origins require HTTPS except for loopback development");
  }

  return url;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
