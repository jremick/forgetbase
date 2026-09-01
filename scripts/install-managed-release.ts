import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { forgetBaseVersion } from "../packages/schema/src/index.js";
import {
  computeComposeBundleDigest,
  initializeManagedInstallation
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

assertWithin(bundleDir, manifestPath, "Manifest");
for (const composeFile of composeFiles) assertWithin(bundleDir, composeFile, "Compose file");
await verifyBundleReceipt(bundleDir, manifestPath);

const envelope = JSON.parse(await readFile(manifestPath, "utf8"));
const publicKeys = new Map([[keyId, await readFile(publicKeyPath, "utf8")]]);
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

async function verifyBundleReceipt(root: string, requiredManifestPath: string): Promise<void> {
  const receiptPath = join(root, "bundle-receipt.json");
  const receipt = parseReceipt(JSON.parse(await readFile(receiptPath, "utf8")));
  const seen = new Set<string>();

  for (const entry of receipt.files) {
    if (seen.has(entry.path)) throw new Error(`Duplicate bundle receipt path: ${entry.path}`);
    seen.add(entry.path);
    const file = resolve(root, entry.path);
    assertWithin(root, file, "Bundle receipt path");
    const digest = createHash("sha256").update(await readFile(file)).digest("hex");
    if (digest !== entry.sha256) throw new Error(`Bundle receipt mismatch: ${entry.path}`);
  }

  const manifestRelativePath = relative(root, requiredManifestPath);
  if (!seen.has(manifestRelativePath)) throw new Error("Signed release manifest is not covered by the bundle receipt");
}

function parseReceipt(value: unknown): { schemaVersion: "1"; files: Array<{ path: string; sha256: string }> } {
  if (!value || typeof value !== "object") throw new Error("Invalid bundle receipt");
  const candidate = value as { schemaVersion?: unknown; files?: unknown };
  if (candidate.schemaVersion !== "1" || !Array.isArray(candidate.files) || candidate.files.length === 0) {
    throw new Error("Invalid bundle receipt");
  }

  const files = candidate.files.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid bundle receipt entry");
    const item = entry as { path?: unknown; sha256?: unknown };
    if (typeof item.path !== "string" || item.path.length === 0 || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw new Error("Invalid bundle receipt entry");
    }
    return { path: item.path, sha256: item.sha256 };
  });
  return { schemaVersion: "1", files };
}

function assertWithin(root: string, target: string, label: string): void {
  const path = relative(root, target);
  if (path !== "" && (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))) {
    throw new Error(`${label} must remain within ${root}`);
  }
}

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
