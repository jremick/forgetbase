import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { cp, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { bundleReceiptFilename, bundleSignatureFilename, createBundleReceipt } from "../packages/updater/src/bundle.js";
import { canonicalJson, requireEd25519Key, verifySignedManifest } from "../packages/updater/src/manifest.js";

const outputDir = resolve(readArgument("--output"));
const manifestPath = resolve(readArgument("--manifest"));
const privateKey = requireEd25519Key(createPrivateKey(await readFile(resolve(readArgument("--private-key-file")), "utf8")));
const keyId = readArgument("--key-id");
const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
const manifestInfo = await lstat(manifestPath);
if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error("Manifest must be a regular file");
verifySignedManifest(JSON.parse(await readFile(manifestPath, "utf8")), new Map([[keyId, publicKey]]));
if ([bundleReceiptFilename, bundleSignatureFilename].includes(basename(manifestPath))) throw new Error("Manifest filename is reserved for bundle metadata");
const repositoryRoot = resolve(import.meta.dirname, "..");
const files = [
  "compose.managed.yaml",
  "compose.same-origin.yaml",
  "compose.tls.yaml",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "scripts/backup-attachments.sh",
  "scripts/backup-set.sh",
  "scripts/backup-postgres.sh",
  "scripts/install-managed-release.ts",
  "scripts/restore-attachments.sh",
  "scripts/restore-postgres.sh",
  "scripts/verify-backup-set.sh",
  "apps/updater",
  "packages/updater",
  "packages/schema",
  "infra/docker/postgres-init",
  "infra/docker/nginx.same-origin.conf",
  "infra/docker/nginx.tls.conf",
  "docs/runbooks/INSTALL_MANAGED_COMPOSE.md",
  "docs/runbooks/ROLLBACK.md"
];

// An existing output can contain stale or unreviewed files. Never merge into it.
await mkdir(dirname(outputDir), { recursive: true });
await mkdir(outputDir, { mode: 0o755 });
for (const relativePath of files) {
  await cp(join(repositoryRoot, relativePath), join(outputDir, relativePath), {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: async (source) => {
      if (!includeBundlePath(source)) return false;
      if ((await lstat(source)).isSymbolicLink()) throw new Error(`Bundle source must not contain symbolic links: ${relative(repositoryRoot, source)}`);
      return true;
    }
  });
}
await cp(manifestPath, join(outputDir, basename(manifestPath)), { force: false, errorOnExist: true });

const receipt = await createBundleReceipt(outputDir);
const signature = sign(null, Buffer.from(canonicalJson(receipt), "utf8"), privateKey).toString("base64");
await writeFile(join(outputDir, bundleReceiptFilename), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
await writeFile(join(outputDir, bundleSignatureFilename), `${JSON.stringify({ keyId, signature }, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ outputDir, receiptCount: receipt.files.length, keyId }));

function includeBundlePath(source: string): boolean {
  const path = relative(repositoryRoot, source);
  return !path.split(/[\\/]/).some((segment) =>
    ["node_modules", "dist", "coverage", ".turbo", ".DS_Store"].includes(segment)
  );
}

function readArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}
