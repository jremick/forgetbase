import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { releaseManifestSchema } from "../packages/schema/src/index.js";
import { canonicalJson, fetchSignedManifest, validateManifestImages, verifySignedManifest } from "../packages/updater/src/manifest.js";

const key = generateKeyPairSync("ed25519");
const keyId = "synthetic-bundle-test";
const publicKey = key.publicKey.export({ type: "spki", format: "pem" }).toString();
const keys = new Map([[keyId, publicKey]]);
const digest = `sha256:${"a".repeat(64)}`;
const manifest = releaseManifestSchema.parse({
  schemaVersion: "1", product: "forgetbase", version: "0.2.0", channel: "beta",
  publishedAt: "2026-09-28T00:00:00.000Z", sourceRevision: "a".repeat(40),
  minUpdaterVersion: "0.1.0", upgradeFrom: ["*"], risk: "medium", estimatedDowntimeSeconds: 60,
  requiresBackup: true, rollbackMode: "application",
  migration: { compatibility: "application-only", targetSchemaVersion: "039_fixture", migrationIds: [] },
  recovery: { components: ["database", "configuration", "attachments"], attachmentMode: "included" },
  images: ["api", "web", "worker", "migrate", "proxy"].map((component) => ({ component, reference: `registry.example.test/forgetbase/${component}@${digest}`, digest })),
  notes: { summary: "Synthetic managed bundle acceptance fixture" }
});
const envelope = { keyId, manifest, signature: sign(null, Buffer.from(canonicalJson(manifest)), key.privateKey).toString("base64") };
let directory: string;
let bundle: string;
let sequence = 0;

function cli(script: string, args: string[]) {
  return spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts", script), ...args], {
    encoding: "utf8", timeout: 30_000, maxBuffer: 1024 * 1024
  });
}
function build(output: string, extra: string[] = []) {
  return cli("build-managed-release-bundle.ts", ["--output", output, "--manifest", join(directory, "release.json"), "--private-key-file", join(directory, "key.pem"), "--key-id", keyId, ...extra]);
}
async function copyBundle() {
  const root = join(directory, `copy-${sequence++}`);
  await cp(bundle, root, { recursive: true });
  return root;
}
async function install(root: string, extra: string[] = []) {
  const stateDir = join(directory, `state-${sequence++}`);
  const result = cli("install-managed-release.ts", ["--bundle", root, "--manifest", "release.json", "--state-dir", stateDir, "--public-key-file", join(directory, "key.pub"), "--key-id", keyId, "--allowed-registries", "registry.example.test/forgetbase/", ...extra]);
  return { result, stateDir };
}
async function rewriteReceipt(root: string, mutate: (receipt: { schemaVersion: string; files: Array<{ path: string; sha256: string }> }) => void, authenticate = false) {
  const receipt = JSON.parse(await readFile(join(root, "bundle-receipt.json"), "utf8"));
  mutate(receipt);
  await writeFile(join(root, "bundle-receipt.json"), JSON.stringify(receipt));
  if (authenticate) await writeFile(join(root, "bundle-receipt.sig.json"), JSON.stringify({ keyId, signature: sign(null, Buffer.from(canonicalJson(receipt)), key.privateKey).toString("base64") }));
}
async function expectRejected(root: string, message: RegExp) {
  const { result, stateDir } = await install(root);
  expect(result.status, result.stderr).not.toBe(0);
  expect(result.stderr).toMatch(message);
  await expect(lstat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "forgetbase-bundle-trust-"));
  bundle = join(directory, "bundle");
  await writeFile(join(directory, "key.pem"), key.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  await writeFile(join(directory, "key.pub"), publicKey);
  await writeFile(join(directory, "release.json"), JSON.stringify(envelope));
  const result = build(bundle);
  expect(result.status, result.stderr).toBe(0);
}, 30_000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe("signed managed bundle command boundary", () => {
  it("builds reproducible signed receipts and initializes exact release state once", async () => {
    const second = join(directory, "second");
    expect(build(second).status).toBe(0);
    for (const filename of ["bundle-receipt.json", "bundle-receipt.sig.json"]) {
      expect(await readFile(join(second, filename))).toEqual(await readFile(join(bundle, filename)));
    }
    const { result, stateDir } = await install(bundle);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(await readFile(join(stateDir, "identity.json"), "utf8"))).toMatchObject({ version: "0.2.0", installationMode: "managed" });
    expect((await lstat(join(stateDir, "identity.json"))).mode & 0o777).toBe(0o600);
    const prior = await readFile(join(stateDir, "current-release.env"));
    const again = cli("install-managed-release.ts", ["--bundle", bundle, "--manifest", "release.json", "--state-dir", stateDir, "--public-key-file", join(directory, "key.pub"), "--key-id", keyId, "--allowed-registries", "registry.example.test/forgetbase/"]);
    expect(again.status).not.toBe(0);
    expect(again.stderr).toContain("state already exists");
    expect(await readFile(join(stateDir, "current-release.env"))).toEqual(prior);
  });

  it("rejects a modified privileged helper even after the attacker recomputes its receipt hash", async () => {
    const root = await copyBundle();
    const content = "#!/bin/sh\necho unauthorized-helper\n";
    await writeFile(join(root, "scripts/restore-postgres.sh"), content);
    await rewriteReceipt(root, (receipt) => { receipt.files.find((entry) => entry.path === "scripts/restore-postgres.sh")!.sha256 = createHash("sha256").update(content).digest("hex"); });
    await expectRejected(root, /signature verification failed/);
  });

  it("requires the receipt signature before reading listed paths", async () => {
    const root = await copyBundle();
    await rm(join(root, "bundle-receipt.sig.json"), { force: true });
    await expectRejected(root, /bundle-receipt.sig.json|signature/);
  });

  it.each(["extra", "omitted", "missing", "duplicate", "traversal", "absolute", "backslash", "symlink-file", "symlink-directory", "symlink-receipt"]) ("rejects %s bundle coverage/containment failures before writing state", async (failure) => {
    const root = await copyBundle();
    if (failure === "extra") await writeFile(join(root, "unlisted-helper.sh"), "exit 0\n");
    if (failure === "omitted") await rewriteReceipt(root, (receipt) => { receipt.files = receipt.files.filter((entry) => entry.path !== "scripts/restore-postgres.sh"); }, true);
    if (failure === "missing") await rm(join(root, "scripts/restore-postgres.sh"));
    if (failure === "duplicate") await rewriteReceipt(root, (receipt) => { receipt.files.push(receipt.files[0]!); }, true);
    if (["traversal", "absolute", "backslash"].includes(failure)) await rewriteReceipt(root, (receipt) => { receipt.files[0]!.path = failure === "traversal" ? "../escape" : failure === "absolute" ? "/tmp/escape" : "scripts\\escape"; }, true);
    if (failure === "symlink-file") {
      const outside = join(directory, "outside-helper");
      await cp(join(root, "scripts/restore-postgres.sh"), outside);
      await rm(join(root, "scripts/restore-postgres.sh"));
      await symlink(outside, join(root, "scripts/restore-postgres.sh"));
    }
    if (failure === "symlink-directory") {
      const outside = join(directory, `outside-scripts-${sequence++}`);
      await cp(join(root, "scripts"), outside, { recursive: true });
      await rm(join(root, "scripts"), { recursive: true });
      await symlink(outside, join(root, "scripts"));
    }
    if (failure === "symlink-receipt") {
      const outside = join(directory, "outside-receipt");
      await cp(join(root, "bundle-receipt.json"), outside);
      await rm(join(root, "bundle-receipt.json"));
      await symlink(outside, join(root, "bundle-receipt.json"));
    }
    await expectRejected(root, /coverage|Duplicate|path|symbolic|regular file|missing/i);
  });

  it("authenticates the receipt before interpreting attacker-controlled file paths", async () => {
    const root = await copyBundle();
    await rewriteReceipt(root, (receipt) => { receipt.files[0]!.path = "../outside-secret"; });
    await expectRejected(root, /signature verification failed/);
  });
  it("rejects an unknown receipt key identity", async () => {
    const root = await copyBundle();
    const path = join(root, "bundle-receipt.sig.json");
    const signature = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...signature, keyId: "untrusted" }));
    await expectRejected(root, /Untrusted/);
  });
  it("requires selected Compose files to be authenticated regular bundle files", async () => {
    const { result, stateDir } = await install(bundle, ["--compose-files", "bundle-receipt.json"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/covered|coverage/);
    await expect(lstat(stateDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects a builder key that does not verify the release manifest", async () => {
    const other = generateKeyPairSync("ed25519");
    const path = join(directory, "other.pem");
    await writeFile(path, other.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    const result = cli("build-managed-release-bundle.ts", ["--output", join(directory, "wrong-key"), "--manifest", join(directory, "release.json"), "--private-key-file", path, "--key-id", keyId]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("signature verification failed");
  });
  it("rejects manifest output names that collide with bundle metadata", async () => {
    const path = join(directory, "bundle-receipt.json");
    await writeFile(path, JSON.stringify(envelope));
    const result = cli("build-managed-release-bundle.ts", ["--output", join(directory, "collision"), "--manifest", path, "--private-key-file", join(directory, "key.pem"), "--key-id", keyId]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/reserved|collision|already exists/);
  });
  it("rejects a non-Ed25519 manifest signing key", async () => {
    const other = generateKeyPairSync("ed448");
    const path = join(directory, "manifest-ed448.pem");
    await writeFile(path, other.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    await writeFile(join(directory, "unsigned.json"), JSON.stringify(manifest));
    const result = cli("generate-release-manifest.ts", ["--input", join(directory, "unsigned.json"), "--output", join(directory, "wrong-algorithm.json"), "--private-key-file", path, "--key-id", keyId]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Ed25519");
  });

  it("refuses to reuse a bundle directory", () => { expect(build(bundle).status).not.toBe(0); });
  it("refuses a non-Ed25519 bundle signing key", async () => {
    const ed448 = generateKeyPairSync("ed448");
    const privatePath = join(directory, "ed448.pem");
    await writeFile(privatePath, ed448.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    const result = cli("build-managed-release-bundle.ts", ["--output", join(directory, "ed448"), "--manifest", join(directory, "release.json"), "--private-key-file", privatePath, "--key-id", keyId]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Ed25519");
  });
});

describe("release manifest trust policy", () => {
  it("rejects valid signatures made by a different asymmetric algorithm", () => {
    const ed448 = generateKeyPairSync("ed448");
    const other = { ...envelope, signature: sign(null, Buffer.from(canonicalJson(manifest)), ed448.privateKey).toString("base64") };
    expect(() => verifySignedManifest(other, new Map([[keyId, ed448.publicKey.export({ type: "spki", format: "pem" }).toString()]]))).toThrow("Ed25519");
  });
  it.each(["registry.example.test/forgetbase-evil/api", "registry.example.test/forgetbase/api${UNTRUSTED}", "registry.example.test/forgetbase/api\nOTHER=bad", "registry.example.test/forgetbase/https://evil/api", "registry.example.test/forgetbase/api?bad", "registry.example.test/forgetbase/../api"]) ("rejects unsafe image repository %s", (repository) => {
    const candidate = structuredClone(manifest);
    candidate.images[0]!.reference = `${repository}@${digest}`;
    expect(() => validateManifestImages(candidate, ["registry.example.test/forgetbase"])).toThrow();
  });
  it("accepts exact repository and slash-delimited namespace policies with digest pins", () => {
    expect(() => validateManifestImages(manifest, ["registry.example.test/forgetbase"])).not.toThrow();
    expect(() => validateManifestImages(manifest, manifest.images.map((image) => image.reference.split("@")[0]!))).not.toThrow();
  });
  it("bounds and cancels oversized chunked feeds without trusting Content-Length", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(Buffer.from(" ".repeat(2 * 1024 * 1024 + 1))); controller.enqueue(Buffer.from(JSON.stringify(envelope))); controller.close(); },
      cancel() { cancelled = true; }
    });
    const request = fetchSignedManifest({ feedUrl: "https://updates.example.test/beta.json", publicKeys: keys, fetchImplementation: (async () => new Response(body)) as typeof fetch });
    await expect(request).rejects.toThrow(/exceeds|too large|size limit/);
    expect(cancelled).toBe(true);
  }, 1000);
  it("rejects an oversized declared feed before parsing its body", async () => {
    await expect(fetchSignedManifest({ feedUrl: "https://updates.example.test/beta.json", publicKeys: keys, fetchImplementation: (async () => new Response(JSON.stringify(envelope), { headers: { "content-length": String(2 * 1024 * 1024 + 1) } })) as typeof fetch })).rejects.toThrow(/exceeds|too large|size limit/);
  });
});
