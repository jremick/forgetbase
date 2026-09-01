import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const outputDir = resolve(readArgument("--output"));
const manifestPath = resolve(readArgument("--manifest"));
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

await mkdir(outputDir, { recursive: true, mode: 0o755 });
for (const relativePath of files) {
  await cp(join(repositoryRoot, relativePath), join(outputDir, relativePath), {
    recursive: true,
    force: false,
    filter: (source) => includeBundlePath(source)
  });
}
await cp(manifestPath, join(outputDir, basename(manifestPath)), { force: false });

const receipt = [];
for (const path of await collectRegularFiles(outputDir)) {
  const source = await readFile(path);
  receipt.push({ path: relative(outputDir, path), sha256: createHash("sha256").update(source).digest("hex") });
}
await writeFile(join(outputDir, "bundle-receipt.json"), `${JSON.stringify({ schemaVersion: "1", files: receipt }, null, 2)}\n`);
console.log(JSON.stringify({ outputDir, receiptCount: receipt.length }));

async function collectRegularFiles(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error(`Managed release bundles cannot contain symbolic links: ${relative(outputDir, path)}`);
    if (metadata.isDirectory()) output.push(...await collectRegularFiles(path));
    else if (metadata.isFile()) output.push(path);
    else throw new Error(`Unsupported bundle entry: ${relative(outputDir, path)}`);
  }
  return output.sort();
}

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
