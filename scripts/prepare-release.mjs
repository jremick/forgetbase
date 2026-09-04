import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const [release, destination] = process.argv.slice(2);
if (!release || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release) || !destination) {
  throw new Error("Usage: node scripts/prepare-release.mjs <version> <output-directory>");
}
const git = (...args) => execFileSync("git", args, { maxBuffer: 128 * 1024 * 1024 });
if (git("status", "--porcelain=v1", "--untracked-files=all").toString().trim()) {
  throw new Error("Prepare a release from a clean tracked checkout");
}
const sourceRevision = git("rev-parse", "HEAD").toString().trim();
const sourceDateEpoch = Number(git("show", "-s", "--format=%ct", sourceRevision).toString().trim());
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const archive = gzipSync(git("archive", "--format=tar", `--prefix=forgetbase-${release}/`, sourceRevision), { level: 9 });
const filename = `forgetbase-${release}-source.tar.gz`;
const manifest = {
  release,
  sourceRevision,
  sourceDate: new Date(sourceDateEpoch * 1000).toISOString(),
  sourceDateEpoch,
  contractVersion: JSON.parse(git("show", `${sourceRevision}:package.json`)).version,
  lockfileSha256: sha256(git("show", `${sourceRevision}:pnpm-lock.yaml`)),
  schemaHead: git("ls-tree", "--name-only", sourceRevision, "packages/db/migrations/").toString().trim()
    .split("\n").filter((name) => name.endsWith(".sql")).sort().at(-1)?.split("/").at(-1)?.replace(/\.sql$/, ""),
  sourceArchive: { filename, sha256: sha256(archive) },
  buildVariables: {
    FORGETBASE_SOURCE_REVISION: sourceRevision,
    FORGETBASE_SOURCE_DATE_EPOCH: String(sourceDateEpoch),
    FORGETBASE_RELEASE_VERSION: release
  }
};
const output = resolve(destination);
mkdirSync(output, { recursive: true });
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
writeFileSync(resolve(output, filename), archive, { flag: "wx" });
writeFileSync(resolve(output, "release-manifest.json"), manifestText, { flag: "wx" });
writeFileSync(resolve(output, "SHA256SUMS"), `${sha256(archive)}  ${filename}\n${sha256(manifestText)}  release-manifest.json\n`, { flag: "wx" });
console.log(JSON.stringify({ output, release, sourceRevision, sourceArchiveSha256: sha256(archive) }));
