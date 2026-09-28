import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { productIdentitySchema, recoveryPointSchema, releaseManifestSchema,
  type ProductIdentity, type RecoveryPoint, type UpdateJob } from "@forgetbase/schema";
import { HostApprovalAuthority } from "./approval.js";
import { ManagedComposeExecutor } from "./executor.js";
import { UpdateManager } from "./manager.js";
import { canonicalJson } from "./manifest.js";
import { durableWriteFile, emptyUpdateState, JsonUpdateStore } from "./store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("new host-approved requests after failed restored API readiness", () => {
  it("binds a separately approved manual restore retry to the freshly installed baseline and executes once", async () => {
    const f = await fixture();
    const first = await f.failFirstRestore();
    expect(first).toMatchObject({ phase: "needs-attention", writesReopened: true });
    expect(first.message).toContain("Restored API readiness failed");
    expect(first.approval?.consumedAt).not.toBeNull();
    expect(await f.executor.refreshIdentity()).toEqual(f.baseline);
    const consumedFirst = await readFile(join(f.root, "host-approvals", "consumed", `${first.id}.json`), "utf8");

    const retry = await f.manager.rollback(f.rollbackInput);
    expect.soft(retry.currentVersion).toBe(f.baseline.version);
    expect.soft(retry.approval?.descriptor.sourceIdentity).toEqual(f.baseline);
    expect(retry.id).not.toBe(first.id);
    expect(retry.approval?.requestDigest).not.toBe(first.approval?.requestDigest);
    expect(retry).toMatchObject({ phase: "awaiting-approval", approval: { consumedAt: null } });
    await f.manager.tick();
    expect(f.executor.effects).toEqual(["maintenance", "restore", "resume"]);
    expect((await f.store.read()).jobs.find((job) => job.id === retry.id)?.phase).toBe("awaiting-approval");

    await f.approve(retry);
    const completed = await terminal(f.manager, retry.id);
    expect(completed, completed.message).toMatchObject({ phase: "rolled-back", currentVersion: f.baseline.version });
    expect(f.executor.effects.filter((effect) => effect === "restore")).toHaveLength(2);
    expect((await f.store.read()).jobs.find((job) => job.id === first.id)).toEqual(first);
    expect(await readFile(join(f.root, "host-approvals", "consumed", `${first.id}.json`), "utf8")).toBe(consumedFirst);
    await f.manager.tick();
    expect(f.executor.effects.filter((effect) => effect === "restore")).toHaveLength(2);
  });

  it("re-evaluates update availability and binds the new request to the fresh restored baseline", async () => {
    const f = await fixture(); await f.failFirstRestore();
    const requested = await f.manager.apply({ version: f.candidate.version });
    expect(requested).toMatchObject({ phase: "awaiting-approval", currentVersion: f.baseline.version,
      approval: { descriptor: { sourceIdentity: f.baseline }, consumedAt: null } });
    expect((await f.manager.status()).availableUpdate?.updateAvailable).toBe(true);
    await f.manager.tick();
    expect(f.executor.effects).toEqual(["maintenance", "restore", "resume"]);
  });

  it.each(["update", "rollback"] as const)("fails closed on a missing fresh identity before admitting %s", async (kind) => {
    const f = await fixture(); await f.failFirstRestore();
    await rm(join(f.root, "identity.json"));
    const before = await f.store.read();
    await expect(kind === "update" ? f.manager.apply({ version: f.candidate.version }) : f.manager.rollback(f.rollbackInput))
      .rejects.toThrow(/identity.*missing/i);
    expect((await f.store.read()).jobs).toEqual(before.jobs);
    expect(f.executor.effects).toEqual(["maintenance", "restore", "resume"]);
  });

  it.each(["update", "rollback"] as const)("fails closed on an unreadable fresh identity before admitting %s", async (kind) => {
    const f = await fixture(); await f.failFirstRestore();
    await rm(join(f.root, "identity.json"));
    await mkdir(join(f.root, "identity.json"), { mode: 0o700 });
    const before = await f.store.read();
    await expect(kind === "update" ? f.manager.apply({ version: f.candidate.version }) : f.manager.rollback(f.rollbackInput))
      .rejects.toThrow(/EISDIR|directory/i);
    expect((await f.store.read()).jobs).toEqual(before.jobs);
    expect(f.executor.effects).toEqual(["maintenance", "restore", "resume"]);
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "forgetbase-restore-readiness-")); roots.push(root);
  const timestamp = new Date().toISOString();
  const candidate = productIdentitySchema.parse({ product: "forgetbase", version: "0.2.0", sourceRevision: "2".repeat(40), builtAt: timestamp,
    channel: "beta", installationMode: "managed", databaseSchemaVersion: "033_update", updaterVersion: "0.1.0", updaterProtocolVersion: "1", managed: true });
  const baseline = { ...candidate, version: "0.1.0", sourceRevision: "1".repeat(40), databaseSchemaVersion: "032_base" };
  const point = recoveryPointSchema.parse({ id: "recovery_verified_baseline", createdAt: timestamp, version: baseline.version,
    sourceRevision: baseline.sourceRevision, databaseSchemaVersion: baseline.databaseSchemaVersion, imageReferences: [],
    backupPath: "/synthetic/database.dump", configurationPath: "/synthetic/release.env", attachmentSnapshotId: "/synthetic/attachments.tar",
    verified: true, protected: false, sizeBytes: 100 });
  const release = releaseManifestSchema.parse({ schemaVersion: "1", product: "forgetbase", version: candidate.version, channel: "beta",
    publishedAt: timestamp, sourceRevision: candidate.sourceRevision, minUpdaterVersion: "0.1.0", upgradeFrom: [">=0.1.0 <0.2.0"], risk: "medium",
    estimatedDowntimeSeconds: 60, requiresBackup: true, rollbackMode: "database-restore",
    migration: { compatibility: "destructive", targetSchemaVersion: "033_update", migrationIds: ["033_update"] },
    recovery: { components: ["database", "configuration", "attachments"], attachmentMode: "included" },
    images: ["api", "web", "worker", "migrate", "proxy"].map((component) => ({ component,
      reference: `registry.example.test/forgetbase/${component}@sha256:${"a".repeat(64)}`, digest: `sha256:${"a".repeat(64)}` })),
    notes: { summary: "Synthetic retry after partial restore" } });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const executor = new ReadinessFailureExecutor(root, candidate, baseline);
  await durableWriteFile(join(root, "identity.json"), JSON.stringify(candidate));
  const store = new JsonUpdateStore(join(root, "state.json"));
  await store.write({ ...emptyUpdateState(), recoveryPoints: [point] });
  const authority = new HostApprovalAuthority(root); await authority.initialize();
  const manager = new UpdateManager({ identity: candidate, store, executor, allowedRegistryPrefixes: ["registry.example.test/forgetbase/"],
    feedUrl: "https://updates.example.test/beta.json", publicKeys: new Map([["synthetic", publicKey.export({ type: "spki", format: "pem" }).toString()]]),
    fetchImplementation: async () => new Response(JSON.stringify({ keyId: "synthetic", manifest: release,
      signature: sign(null, Buffer.from(canonicalJson(release)), privateKey).toString("base64") }), { headers: { "content-type": "application/json" } }) });
  const rollbackInput = { recoveryPointId: point.id, confirmDataLossAfter: point.createdAt };
  const approve = async (job: UpdateJob) => { await authority.decide(job, job.approval!.requestDigest, "approved"); await manager.tick(); };
  const failFirstRestore = async () => { const first = await manager.rollback(rollbackInput); await approve(first); return terminal(manager, first.id); };
  return { root, manager, store, executor, candidate, baseline, rollbackInput, approve, failFirstRestore };
}

/** Production identity reads plus the real restore ordering, without Docker. */
class ReadinessFailureExecutor extends ManagedComposeExecutor {
  effects: string[] = []; private restoreCount = 0;
  constructor(private readonly root: string, candidate: ProductIdentity, private readonly baseline: ProductIdentity) {
    super({ stateDir: root, bundleDir: root, composeFiles: [], currentIdentity: candidate });
  }
  override async recoveryReceiptDigest(_point: RecoveryPoint) { return "a".repeat(64); }
  override async enterMaintenance() { this.effects.push("maintenance"); }
  override async rollbackDatabase(_point: RecoveryPoint) {
    this.effects.push("restore"); this.restoreCount++;
    // Production persists the recovered identity before resumeCurrent readiness.
    await durableWriteFile(join(this.root, "identity.json"), JSON.stringify(this.baseline));
    await this.resumeCurrent();
  }
  override async resumeCurrent() {
    this.effects.push("resume");
    if (this.restoreCount === 1) throw new Error("Restored API readiness failed");
  }
}

async function terminal(manager: UpdateManager, id: string): Promise<UpdateJob> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const job = (await manager.status()).jobs.find((entry) => entry.id === id)!;
    if (["rolled-back", "failed", "needs-attention"].includes(job.phase)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Rollback did not terminate");
}
