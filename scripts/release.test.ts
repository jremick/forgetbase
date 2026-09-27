import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const prepare = fileURLToPath(new URL("./prepare-release.mjs", import.meta.url));
const buildManifest = fileURLToPath(new URL("./write-build-manifest.mjs", import.meta.url));
const folders: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "forgetbase-release-"));
  folders.push(root);
  mkdirSync(join(root, "packages/db/migrations"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.1.0" }));
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(root, "packages/db/migrations/039_fixture.sql"), "SELECT 1;\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" }).toString().trim();
  git("init", "--initial-branch=main");
  git("add", ".");
  git("-c", "user.name=Release Test", "-c", "user.email=release@example.test", "commit", "-m", "Synthetic release fixture");
  return { root, git };
}
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe("immutable release preparation", () => {
  it("reproduces archive and manifest bytes from the same clean commit", () => {
    const { root, git } = fixture();
    const destination = mkdtempSync(join(tmpdir(), "forgetbase-artifacts-"));
    folders.push(destination);
    for (const folder of ["one", "two"]) {
      execFileSync(process.execPath, [prepare, "0.1.0-beta.3", join(destination, folder)], { cwd: root });
    }
    for (const file of ["forgetbase-0.1.0-beta.3-source.tar.gz", "release-manifest.json", "SHA256SUMS"]) {
      expect(readFileSync(join(destination, "one", file))).toEqual(readFileSync(join(destination, "two", file)));
    }
    const manifest = JSON.parse(readFileSync(join(destination, "one/release-manifest.json"), "utf8"));
    expect(manifest.sourceRevision).toBe(git("rev-parse", "HEAD"));
    expect(manifest.schemaHead).toBe("039_fixture");
    writeFileSync(join(root, "untracked.txt"), "Must never enter a release silently");
    expect(spawnSync(process.execPath, [prepare, "0.1.0-beta.3", join(destination, "dirty")], { cwd: root }).status).not.toBe(0);
  });

  it("embeds identical API and web identity and fails closed without source inputs", () => {
    const { root, git } = fixture();
    const env = { ...process.env, FORGETBASE_SOURCE_REVISION: git("rev-parse", "HEAD"),
      FORGETBASE_SOURCE_DATE_EPOCH: "1788537600", FORGETBASE_RELEASE_VERSION: "0.1.0-beta.3" };
    execFileSync(process.execPath, [buildManifest], { cwd: root, env });
    const initial = readFileSync(join(root, "build-info.json"));
    expect(readFileSync(join(root, "apps/web/public/release.json"))).toEqual(initial);
    execFileSync(process.execPath, [buildManifest], { cwd: root, env });
    expect(readFileSync(join(root, "build-info.json"))).toEqual(initial);
    expect(spawnSync(process.execPath, [buildManifest], { cwd: root, env: { ...env, FORGETBASE_SOURCE_REVISION: "invalid" } }).status).not.toBe(0);
    expect(spawnSync(process.execPath, [buildManifest], { cwd: root, env: { ...env, FORGETBASE_SOURCE_DATE_EPOCH: "" } }).status).not.toBe(0);
  });
});
