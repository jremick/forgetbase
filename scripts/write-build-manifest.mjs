import { createHash } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

const sourceRevision = process.env.FORGETBASE_SOURCE_REVISION || process.env.RAILWAY_GIT_COMMIT_SHA;
if (!sourceRevision || !/^[a-f0-9]{40}$/.test(sourceRevision)) {
  throw new Error("A complete FORGETBASE_SOURCE_REVISION is required for a release build");
}
const sourceEpoch = Number(process.env.FORGETBASE_SOURCE_DATE_EPOCH);
if (!Number.isSafeInteger(sourceEpoch) || sourceEpoch <= 0) {
  throw new Error("FORGETBASE_SOURCE_DATE_EPOCH must identify the source commit time");
}
const release = process.env.FORGETBASE_RELEASE_VERSION;
if (!release || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release)) {
  throw new Error("FORGETBASE_RELEASE_VERSION must be a semantic version");
}
const manifest = {
  release,
  sourceRevision,
  sourceDate: new Date(sourceEpoch * 1000).toISOString(),
  contractVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
  lockfileSha256: createHash("sha256").update(readFileSync("pnpm-lock.yaml")).digest("hex"),
  schemaHead: readdirSync("packages/db/migrations").filter((name) => name.endsWith(".sql")).sort().at(-1)?.replace(/\.sql$/, "")
};
const text = JSON.stringify(manifest, null, 2) + "\n";
mkdirSync("apps/web/public", { recursive: true });
writeFileSync("build-info.json", text);
writeFileSync("apps/web/public/release.json", text);
console.log(JSON.stringify({ release: manifest.release, sourceRevision, schemaHead: manifest.schemaHead }));
