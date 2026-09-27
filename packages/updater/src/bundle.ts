import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { type SignedReleaseManifest } from "@forgetbase/schema";
import { maximumManifestBytes, verifyEd25519Signature, verifySignedManifest } from "./manifest.js";

export const bundleReceiptFilename = "bundle-receipt.json";
export const bundleSignatureFilename = "bundle-receipt.sig.json";
const metadataFiles = new Set([bundleReceiptFilename, bundleSignatureFilename]);

export interface BundleReceipt {
  schemaVersion: "1";
  files: Array<{ path: string; sha256: string }>;
}

/** Only regular files in an operator-protected bundle tree are admissible. */
export async function collectBundleFiles(root: string): Promise<string[]> {
  const paths: string[] = [];
  let entries = 0;
  async function visit(directory: string): Promise<void> {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Bundle directory must not be a symbolic link");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 10_000) throw new Error("Bundle exceeds the entry count limit");
      const file = join(directory, entry.name);
      const path = relative(root, file).split(sep).join("/");
      assertBundlePath(path);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error(`Bundle cannot contain symbolic links: ${path}`);
      if (info.isDirectory()) await visit(file);
      else if (info.isFile()) paths.push(path);
      else throw new Error(`Bundle entry must be a regular file: ${path}`);
    }
  }
  await visit(root);
  return paths.sort();
}

export async function createBundleReceipt(root: string): Promise<BundleReceipt> {
  const files = [];
  for (const path of await collectBundleFiles(root)) {
    if (!metadataFiles.has(path)) files.push({ path, sha256: await hashRegularFile(join(root, path)) });
  }
  return { schemaVersion: "1", files };
}

export async function verifyManagedBundle(input: {
  bundleDir: string;
  manifestPath: string;
  composeFiles: readonly string[];
  publicKeys: ReadonlyMap<string, string>;
}): Promise<SignedReleaseManifest> {
  const root = resolve(input.bundleDir);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Bundle directory must not be a symbolic link");
  const receiptValue: unknown = await readRegularJson(join(root, bundleReceiptFilename), maximumManifestBytes);
  const signatureValue: unknown = await readRegularJson(join(root, bundleSignatureFilename), 4096);
  if (!isObject(signatureValue) || typeof signatureValue.keyId !== "string" || typeof signatureValue.signature !== "string") {
    throw new Error("Invalid bundle receipt signature");
  }
  const publicKey = input.publicKeys.get(signatureValue.keyId);
  if (!publicKey) throw new Error(`Untrusted bundle receipt key: ${signatureValue.keyId}`);
  // Authenticate the complete receipt before inspecting any attacker-selected paths.
  if (!verifyEd25519Signature(receiptValue, signatureValue.signature, publicKey)) {
    throw new Error("Bundle receipt signature verification failed");
  }
  const receipt = parseReceipt(receiptValue);
  const actual = (await collectBundleFiles(root)).filter((path) => !metadataFiles.has(path));
  const listed = new Map(receipt.files.map((entry) => [entry.path, entry.sha256]));
  if (actual.length !== listed.size || actual.some((path) => !listed.has(path))) {
    throw new Error("Bundle receipt coverage does not exactly match bundle files");
  }
  for (const path of [input.manifestPath, ...input.composeFiles]) {
    const relativePath = relative(root, resolve(path)).split(sep).join("/");
    assertBundlePath(relativePath);
    if (!listed.has(relativePath)) throw new Error(`Selected file is not covered by the bundle receipt: ${relativePath}`);
  }
  for (const [path, expected] of listed) {
    if (await hashRegularFile(join(root, path)) !== expected) throw new Error(`Bundle receipt mismatch: ${path}`);
  }
  const envelope = verifySignedManifest(await readRegularJson(input.manifestPath, maximumManifestBytes), input.publicKeys);
  if (envelope.keyId !== signatureValue.keyId) throw new Error("Bundle receipt and release manifest must use the same trusted key");
  return envelope;
}

function assertBundlePath(path: string): void {
  if (!path || path.length > 1024 || /[\\\x00-\x1f\x7f:]/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid bundle receipt path: ${JSON.stringify(path)}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseReceipt(value: unknown): BundleReceipt {
  if (!isObject(value) || value.schemaVersion !== "1" || !Array.isArray(value.files) || value.files.length === 0 || value.files.length > 10_000 || Object.keys(value).some((key) => !["schemaVersion", "files"].includes(key))) {
    throw new Error("Invalid bundle receipt");
  }
  const seen = new Set<string>();
  const files = value.files.map((entry: unknown) => {
    if (!isObject(entry) || typeof entry.path !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) || Object.keys(entry).some((key) => !["path", "sha256"].includes(key))) {
      throw new Error("Invalid bundle receipt entry");
    }
    assertBundlePath(entry.path);
    if (metadataFiles.has(entry.path)) throw new Error("Bundle receipt metadata cannot be listed as payload");
    if (seen.has(entry.path)) throw new Error(`Duplicate bundle receipt path: ${entry.path}`);
    seen.add(entry.path);
    return { path: entry.path, sha256: entry.sha256 };
  });
  return { schemaVersion: "1", files };
}

async function openRegularFile(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Bundle path must be a regular file, not a symbolic link: ${path}`);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  if (!(await file.stat()).isFile()) {
    await file.close();
    throw new Error(`Bundle path must be a regular file: ${path}`);
  }
  return file;
}

async function readRegularJson(path: string, limit: number): Promise<unknown> {
  const file = await openRegularFile(path);
  try {
    if ((await file.stat()).size > limit) throw new Error("Bundle JSON exceeds size limit");
    // A fixed-size read also bounds allocation if a file grows after stat.
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error("Bundle JSON exceeds size limit");
    return JSON.parse(bytes.subarray(0, length).toString("utf8"));
  } finally { await file.close(); }
}

async function hashRegularFile(path: string): Promise<string> {
  const file = await openRegularFile(path);
  try {
    const hash = createHash("sha256");
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    return hash.digest("hex");
  } finally { await file.close(); }
}
