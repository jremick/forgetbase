import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { forgetBaseVersion } from "../packages/schema/src/index.js";
import {
  computeComposeBundleDigest,
  initializeManagedInstallation,
  verifyManagedBundle
} from "../packages/updater/src/index.js";

const bundleDir = resolve(readArgument("--bundle"));
const manifestPath = resolve(bundleDir, readArgument("--manifest"));
const stateDir = resolve(readArgument("--state-dir"));
const keyId = readArgument("--key-id");
const publicKeyPath = resolve(readArgument("--public-key-file"));
const allowedRegistryPrefixes = (readOptionalArgument("--allowed-registries") ?? "ghcr.io/jremick/forgetbase/")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const composeFiles = (readOptionalArgument("--compose-files") ?? "compose.managed.yaml")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => resolve(bundleDir, value));

const publicKeys = new Map([[keyId, await readFile(publicKeyPath, "utf8")]]);
const envelope = await verifyManagedBundle({ bundleDir, manifestPath, composeFiles, publicKeys });

const bundleDigest = await computeComposeBundleDigest(bundleDir, composeFiles);
const result = await initializeManagedInstallation({
  envelope,
  publicKeys,
  allowedRegistryPrefixes,
  stateDir,
  updaterVersion: readOptionalArgument("--updater-version") ?? forgetBaseVersion,
  bundleDigest
});

console.log(JSON.stringify({
  stateDir,
  version: result.identity.version,
  channel: result.identity.channel,
  sourceRevision: result.identity.sourceRevision,
  manifestKeyId: result.envelope.keyId,
  bundleDigest
}));

function readArgument(name: string): string {
  const value = readOptionalArgument(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOptionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) return undefined;
  return value;
}
