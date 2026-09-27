import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  forgetBaseVersion,
  installationModeSchema,
  productIdentitySchema,
  releaseChannelSchema
} from "@forgetbase/schema";
import { JsonUpdateStore, ManagedComposeExecutor, UpdateManager } from "@forgetbase/updater";
import { buildUpdaterServer } from "./server.js";
import { acquireHostLock } from "./host-lock.js";

const apiToken = requiredEnv("FORGETBASE_UPDATER_API_TOKEN");
const bundleDir = resolve(process.env.FORGETBASE_UPDATE_BUNDLE_DIR ?? process.cwd());
const stateDir = resolve(process.env.FORGETBASE_UPDATER_STATE_DIR ?? "work/updater");
const hostLock = process.env.FORGETBASE_INSTALLATION_MODE === "managed"
  ? await acquireHostLock(stateDir) : undefined;
const configuredIdentity = productIdentitySchema.parse({
  product: "forgetbase",
  version: process.env.FORGETBASE_VERSION ?? forgetBaseVersion,
  sourceRevision: process.env.FORGETBASE_SOURCE_REVISION ?? "development",
  builtAt: process.env.FORGETBASE_BUILT_AT ?? null,
  channel: releaseChannelSchema.parse(process.env.FORGETBASE_RELEASE_CHANNEL ?? "beta"),
  installationMode: installationModeSchema.parse(process.env.FORGETBASE_INSTALLATION_MODE ?? "source"),
  databaseSchemaVersion: process.env.FORGETBASE_DATABASE_SCHEMA_VERSION ?? null,
  updaterVersion: forgetBaseVersion,
  updaterProtocolVersion: "1",
  managed: process.env.FORGETBASE_INSTALLATION_MODE === "managed"
});
const identity = await readInstalledIdentity(configuredIdentity);
const publicKeys = await readPublicKeys();
const executor = new ManagedComposeExecutor({
  bundleDir,
  composeFiles: (process.env.FORGETBASE_UPDATE_COMPOSE_FILES ?? "compose.managed.yaml")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  stateDir,
  currentIdentity: identity,
  lockFileDescriptor: hostLock?.descriptor,
  apiHealthUrl: process.env.FORGETBASE_UPDATE_API_HEALTH_URL,
  webHealthUrl: process.env.FORGETBASE_UPDATE_WEB_HEALTH_URL,
  composeProjectName: process.env.FORGETBASE_UPDATE_COMPOSE_PROJECT_NAME,
  postgresDatabase: process.env.FORGETBASE_UPDATE_POSTGRES_DATABASE,
  minimumFreeBytes: readOptionalPositiveInteger(process.env.FORGETBASE_UPDATE_MINIMUM_FREE_BYTES),
  environment: process.env
});
const manager = new UpdateManager({
  identity,
  store: new JsonUpdateStore(resolve(stateDir, "state.json")),
  executor,
  feedUrl: process.env.FORGETBASE_UPDATE_FEED_URL,
  publicKeys,
  allowedRegistryPrefixes: (process.env.FORGETBASE_UPDATE_ALLOWED_REGISTRIES ?? "ghcr.io/jremick/forgetbase/")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  allowLocalHttpFeed: process.env.FORGETBASE_UPDATE_ALLOW_LOCAL_HTTP === "true",
  enabled: process.env.FORGETBASE_UPDATES_ENABLED === "true",
  retentionCount: readOptionalPositiveInteger(process.env.FORGETBASE_UPDATE_RECOVERY_RETENTION_COUNT) ?? 3
});
await manager.reconcileInterruptedJobs();
const server = buildUpdaterServer({ manager, apiToken });
const port = Number.parseInt(process.env.PORT ?? "3010", 10);
const host = process.env.HOST ?? "127.0.0.1";
const tickInterval = setInterval(() => void manager.tick().catch((error) => {
  server.log.error({ err: error }, "Scheduled updater tick failed");
}), 30_000);
tickInterval.unref();

const checkIntervalMs = readOptionalPositiveInteger(process.env.FORGETBASE_UPDATE_CHECK_INTERVAL_MS) ?? 6 * 60 * 60 * 1_000;
const checkInterval = setInterval(() => void manager.checkForUpdates().catch((error) => {
  server.log.warn({ err: error }, "Periodic update check failed closed");
}), checkIntervalMs);
checkInterval.unref();

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(tickInterval);
  clearInterval(checkInterval);
  server.log.info({ signal }, "ForgetBase updater shutting down");
  await server.close();
  // Active commands may still be running; keep ownership until the process exits.
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  const address = await server.listen({ port, host });
  server.log.info({ address }, "ForgetBase updater listening");
} catch (error) {
  server.log.error(error, "Failed to start ForgetBase updater");
  await hostLock?.release();
  process.exitCode = 1;
}

async function readPublicKeys(): Promise<Map<string, string>> {
  const keyId = process.env.FORGETBASE_UPDATE_PUBLIC_KEY_ID;
  const keyFile = process.env.FORGETBASE_UPDATE_PUBLIC_KEY_FILE;
  if (!keyId || !keyFile) return new Map();
  return new Map([[keyId, await readFile(resolve(keyFile), "utf8")]]);
}

async function readInstalledIdentity(fallback: typeof configuredIdentity): Promise<typeof configuredIdentity> {
  try {
    const installed = productIdentitySchema.parse(JSON.parse(await readFile(resolve(stateDir, "identity.json"), "utf8")));
    if (installed.installationMode !== fallback.installationMode) {
      throw new Error("Installed and configured installation modes must match");
    }
    return productIdentitySchema.parse({ ...installed, updaterVersion: forgetBaseVersion });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (fallback.installationMode === "managed") {
      throw new Error("Managed installation identity is missing; run the verified bootstrap installer");
    }
    return fallback;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || Number.parseInt(value, 10) <= 0) throw new Error(`Expected a positive integer, received ${value}`);
  return Number.parseInt(value, 10);
}
