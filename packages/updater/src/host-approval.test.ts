import { generateKeyPairSync, sign } from "node:crypto";
import { chmod, copyFile, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { productIdentitySchema, recoveryPointSchema, releaseManifestSchema, type ProductIdentity, type RecoveryPoint, type ReleaseManifest } from "@forgetbase/schema";
import { canonicalJson } from "./manifest.js";
import { UpdateManager, type UpdateExecutor } from "./manager.js";
import { emptyUpdateState, JsonUpdateStore } from "./store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("host-only update authority", () => {
  it("rejects oversized immutable requests while retaining discovery without truncation", async () => {
    const f = await fixture();
    for (const field of ["highlights", "security", "breaking"] as const) {
      f.release.notes[field] = Array.from({ length: 100 }, () => "x".repeat(1000));
    }
    await f.manager.checkForUpdates();
    expect((await f.manager.status()).availableUpdate?.release?.notes.highlights).toHaveLength(100);
    await expect(f.manager.apply({ version: "0.2.0" })).rejects.toThrow(/descriptor.*256|too large/i);
    expect((await f.store.read()).jobs).toEqual([]);
    expect(f.executor.effects).toEqual([]);
  });

  it("bounds accumulated terminal history without pruning the pending job or recovery points", async () => {
    const f = await fixture(); const pending = await f.manager.apply({ version: "0.2.0" });
    const history = Array.from({ length: 190 }, (_, index) => ({ ...pending, id: `history_${index}`, phase: "cancelled" as const,
      completedAt: f.now().toISOString(), message: "x".repeat(30_000) }));
    await f.store.write({ ...await f.store.read(), jobs: [pending, ...history] });
    const stored = await f.store.read();
    expect(stored.jobs[0]?.id).toBe(pending.id);
    expect(stored.jobs.length).toBeLessThan(191);
    expect(stored.recoveryPoints).toEqual([f.point]);
    expect((await stat(join(f.root, "state.json"))).size).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(Buffer.byteLength(JSON.stringify(await f.manager.status()))).toBeLessThanOrEqual(5 * 1024 * 1024);
    const { readHostApprovalJob } = await import("./" + "approval.js");
    expect((await readHostApprovalJob(f.root, pending.id)).approval?.requestDigest).toBe(pending.approval?.requestDigest);
  });

  it.each(["update", "rollback"])("HTTP request alone cannot launch %s host mutation", async (kind) => {
    const f = await fixture();
    const { buildUpdaterServer } = await import("../../../apps/" + "updater/src/server.js");
    const server = buildUpdaterServer({ manager: f.manager, apiToken: "synthetic-request-only-token-000000000000", logger: false });
    try {
      const result = await server.inject({ method: "POST", url: kind === "update" ? "/v1/jobs" : "/v1/rollback",
        headers: { authorization: "Bearer synthetic-request-only-token-000000000000" },
        payload: kind === "update" ? { version: "0.2.0" } : { recoveryPointId: f.point.id, confirmDataLossAfter: f.point.createdAt } });
      expect(result.statusCode).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(f.executor.effects).toEqual([]);
      expect(result.json().phase).toBe("awaiting-approval");
      await f.manager.tick();
      expect(f.executor.effects).toEqual([]);
      expect((await server.inject({ method: "POST", url: `/v1/jobs/${result.json().id}/approve`,
        headers: { authorization: "Bearer synthetic-request-only-token-000000000000" } })).statusCode).toBe(404);
    } finally {
      await server.close();
      // The unsafe baseline launches asynchronously; let its synthetic executor
      // finish before deleting the test ledger during the red control.
      for (const job of (await f.manager.status()).jobs) {
        if (!["awaiting-approval", "scheduled"].includes(job.phase)) await terminal(f.manager, job.id);
      }
    }
  });

  it("requires the exact host digest and consumes one decision before concurrent ticks mutate", async () => {
    const f = await fixture(); const job = await f.manager.apply({ version: "0.2.0" });
    const authority = await authorityFor(f.root);
    await expect(authority.decide(job, "0".repeat(64), "approved")).rejects.toThrow(/digest/i);
    expect(f.executor.effects).toEqual([]);
    await authority.decide(job, job.approval!.requestDigest, "approved");
    await expect(authority.decide(job, job.approval!.requestDigest, "denied")).rejects.toThrow(/exist|decision/i);
    f.executor.beforeStage = async () => {
      const claimed = (await f.store.read()).jobs[0]!;
      expect(claimed.approval?.consumedAt).not.toBeNull();
      expect(await authority.consumed(claimed)).toBe(true);
    };
    await Promise.all([f.manager.tick(), f.manager.tick(), f.manager.tick()]);
    expect((await terminal(f.manager, job.id)).phase).toBe("completed");
    expect(f.executor.effects.filter((value) => value === "stage")).toHaveLength(1);
    expect((await stat(join(f.root, "host-approvals"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(f.root, "host-approvals", "decisions", `${job.id}.json`))).mode & 0o777).toBe(0o600);
  });

  it.each(["denied", "expired", "cancelled"])("terminates %s requests without mutation", async (phase) => {
    const f = await fixture(); const job = await f.manager.apply({ version: "0.2.0" });
    if (phase === "denied") await (await authorityFor(f.root)).decide(job, job.approval!.requestDigest, "denied");
    if (phase === "expired") f.advance(24 * 60 * 60 * 1000 + 1);
    if (phase === "cancelled") await f.manager.cancel(job.id);
    await f.manager.tick();
    expect((await f.manager.status()).jobs[0]?.phase).toBe(phase);
    expect(f.executor.effects).toEqual([]);
  });

  it("retains approved future requests across restart, then verifies and claims only when due", async () => {
    const f = await fixture(); const due = new Date(f.now().getTime() + 60_000).toISOString();
    const job = await f.manager.apply({ version: "0.2.0", scheduledFor: due });
    expect(Date.parse(job.approval!.descriptor.expiresAt) - Date.parse(due)).toBe(3_600_000);
    await (await authorityFor(f.root)).decide(job, job.approval!.requestDigest, "approved");
    await f.manager.tick();
    expect((await f.manager.status()).jobs[0]).toMatchObject({ phase: "scheduled", approval: { decision: "approved", consumedAt: null } });
    const restarted = f.restart(); await restarted.reconcileInterruptedJobs(); await restarted.tick();
    expect(f.executor.effects).toEqual([]);
    f.advance(60_001); await restarted.tick();
    expect((await terminal(restarted, job.id)).phase).toBe("completed");
  });

  it("keeps unapproved requests across restart but never replays consumed work", async () => {
    const f = await fixture(); const job = await f.manager.apply({ version: "0.2.0" });
    const restarted = f.restart(); await restarted.reconcileInterruptedJobs();
    expect((await restarted.status()).jobs[0]?.phase).toBe("awaiting-approval");
    const authority = await authorityFor(f.root);
    await authority.decide(job, job.approval!.requestDigest, "approved");
    await authority.consume(job);
    const afterCrash = f.restart(); await afterCrash.reconcileInterruptedJobs(); await afterCrash.tick();
    expect((await afterCrash.status()).jobs[0]).toMatchObject({ phase: "needs-attention", errorCode: "approval_consumption_interrupted" });
    expect(f.executor.effects).toEqual([]);
  });

  it.each(["schedule", "automaticRollback", "manifest", "key", "identity", "descriptor", "digest", "jobId", "expiry"])(
    "rejects changed approved %s before executor mutation", async (field) => {
      const f = await fixture(); const job = await f.manager.apply({ version: "0.2.0" });
      await (await authorityFor(f.root)).decide(job, job.approval!.requestDigest, "approved");
      if (field === "manifest") f.release.notes.summary = "Changed same-version release";
      else if (field === "key") f.keyId = "replacement-key";
      else if (field === "identity") f.executor.identity = { ...f.executor.identity, sourceRevision: "f".repeat(40) };
      else {
        const state = await f.store.read(); const stored = state.jobs[0]!;
        if (field === "schedule") stored.scheduledFor = new Date(f.now().getTime() + 60_000).toISOString();
        if (field === "automaticRollback") stored.automaticRollback = false;
        if (field === "descriptor") stored.approval!.descriptor.targetVersion = "0.3.0";
        if (field === "digest") stored.approval!.requestDigest = "0".repeat(64);
        if (field === "jobId") stored.approval!.descriptor.jobId = "update_replaced";
        if (field === "expiry") stored.approval!.descriptor.expiresAt = new Date(f.now().getTime() + 7 * 86_400_000).toISOString();
        await f.store.write(state);
      }
      await f.manager.tick();
      expect((await f.manager.status()).jobs[0]?.phase).toBe("failed");
      expect(f.executor.effects).toEqual([]);
    }
  );

  it("rejects cross-installation decisions and changed recovery receipts before maintenance", async () => {
    const left = await fixture(); const right = await fixture();
    const leftJob = await left.manager.apply({ version: "0.2.0" });
    const rightJob = await right.manager.apply({ version: "0.2.0" });
    await (await authorityFor(left.root)).decide(leftJob, leftJob.approval!.requestDigest, "approved");
    await copyFile(join(left.root, "host-approvals", "decisions", `${leftJob.id}.json`), join(right.root, "host-approvals", "decisions", `${rightJob.id}.json`));
    await right.manager.tick(); expect(right.executor.effects).toEqual([]);
    expect((await right.manager.status()).jobs[0]?.phase).toBe("failed");
    await left.manager.cancel(leftJob.id);
    const restore = await left.manager.rollback({ recoveryPointId: left.point.id, confirmDataLossAfter: left.point.createdAt });
    await (await authorityFor(left.root)).decide(restore, restore.approval!.requestDigest, "approved");
    left.executor.receipt = "b".repeat(64);
    await left.manager.tick(); expect(left.executor.effects).toEqual([]);
    expect((await left.manager.status()).jobs[0]?.phase).toBe("failed");
  });

  it("requires separately approved rollback and exact data-loss time", async () => {
    const f = await fixture();
    await expect(f.manager.rollback({ recoveryPointId: f.point.id })).rejects.toThrow(/confirmation/i);
    const job = await f.manager.rollback({ recoveryPointId: f.point.id, confirmDataLossAfter: f.point.createdAt });
    expect(job.approval?.descriptor.recoveryReceiptDigest).toBe(f.executor.receipt);
    expect(job.approval?.descriptor.confirmDataLossAfter).toBe(f.point.createdAt);
    await (await authorityFor(f.root)).decide(job, job.approval!.requestDigest, "approved");
    await f.manager.tick(); expect((await terminal(f.manager, job.id)).phase).toBe("rolled-back");
    expect(f.executor.effects).toEqual(["maintenance", "restore"]);
  });

  it("fails closed for legacy scheduled requests without an approval descriptor", async () => {
    const f = await fixture(); const job = await f.manager.apply({ version: "0.2.0" });
    await f.store.write({ ...await f.store.read(), jobs: [{ ...job, approval: null, phase: "scheduled", scheduledFor: f.now().toISOString() }] });
    await f.manager.reconcileInterruptedJobs(); await f.manager.tick();
    expect((await f.manager.status()).jobs[0]?.phase).toBe("needs-attention");
    expect(f.executor.effects).toEqual([]);
  });

  it("rejects unsafe authority paths, missing installation identity and symlink decisions", async () => {
    const f = await fixture(); const job = await f.manager.apply({ version: "0.2.0" });
    const authority = await authorityFor(f.root);
    const decisions = join(f.root, "host-approvals", "decisions");
    await chmod(decisions, 0o777);
    await expect(authority.decide(job, job.approval!.requestDigest, "approved")).rejects.toThrow(/private|permission|owner/i);
    await chmod(decisions, 0o700);
    const outside = join(f.root, "outside.json"); await writeFile(outside, "{}", { mode: 0o600 });
    await symlink(outside, join(decisions, `${job.id}.json`));
    await expect(authority.readDecision(job)).rejects.toThrow();
    await rm(join(f.root, "host-approvals", "installation-id"));
    await expect(authority.initialize()).rejects.toThrow();
  });
});

async function authorityFor(root: string) {
  const module = await import("./" + "approval.js");
  return new module.HostApprovalAuthority(root);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "forgetbase-host-approval-")); roots.push(root);
  let now = new Date();
  const identity = productIdentitySchema.parse({ product: "forgetbase", version: "0.1.0", sourceRevision: "1".repeat(40), builtAt: null, channel: "beta", installationMode: "managed", databaseSchemaVersion: "032_base", updaterVersion: "0.1.0", updaterProtocolVersion: "1", managed: true });
  const release = releaseManifestSchema.parse({ schemaVersion: "1", product: "forgetbase", version: "0.2.0", channel: "beta", publishedAt: now.toISOString(), sourceRevision: "2".repeat(40), minUpdaterVersion: "0.1.0", upgradeFrom: [">=0.1.0 <0.2.0"], risk: "medium", estimatedDowntimeSeconds: 60, requiresBackup: true, rollbackMode: "database-restore", migration: { compatibility: "destructive", targetSchemaVersion: "033_update", migrationIds: ["033_update"] }, recovery: { components: ["database", "configuration", "attachments"], attachmentMode: "included" }, images: ["api", "web", "worker", "migrate", "proxy"].map((component) => ({ component, reference: `registry.example.test/forgetbase/${component}@sha256:${"a".repeat(64)}`, digest: `sha256:${"a".repeat(64)}` })), notes: { summary: "Synthetic host-approved update" } });
  const point = recoveryPointSchema.parse({ id: "recovery_synthetic", createdAt: now.toISOString(), version: "0.1.0", sourceRevision: identity.sourceRevision, databaseSchemaVersion: "032_base", imageReferences: [], backupPath: "/synthetic/database.dump", configurationPath: "/synthetic/release.env", attachmentSnapshotId: "/synthetic/attachments.tar", verified: true, protected: false, sizeBytes: 100 });
  const store = new JsonUpdateStore(join(root, "state.json"));
  await store.write({ ...emptyUpdateState(), recoveryPoints: [point], feedStatus: "available", availableUpdate: { checkedAt: now.toISOString(), updateAvailable: true, reason: "synthetic", manifestKeyId: "synthetic", release } });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const executor = new ApprovalExecutor(identity, point);
  const f = { root, store, executor, release, point, keyId: "synthetic", now: () => now, advance: (ms: number) => { now = new Date(now.getTime() + ms); }, manager: null as unknown as UpdateManager, restart: () => new UpdateManager(options) };
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const options = { identity, store, executor, now: f.now, allowedRegistryPrefixes: ["registry.example.test/forgetbase/"], feedUrl: "https://updates.example.test/beta.json", publicKeys: new Map([["synthetic", pem], ["replacement-key", pem]]), fetchImplementation: async () => new Response(JSON.stringify({ keyId: f.keyId, manifest: release, signature: sign(null, Buffer.from(canonicalJson(release)), privateKey).toString("base64") }), { headers: { "content-type": "application/json" } }) };
  f.manager = new UpdateManager(options); return f;
}

class ApprovalExecutor implements UpdateExecutor {
  effects: string[] = []; receipt = "a".repeat(64); beforeStage?: () => Promise<void>;
  constructor(public identity: ProductIdentity, readonly point: RecoveryPoint) {}
  async probe() { this.effects.push("probe"); return { healthy: true, dockerAvailable: true, composeAvailable: true, configurationValid: true, configurationDrift: false, backupWritable: true, freeBytes: 1000, requiredBytes: 1, attachmentSnapshotAvailable: true, details: {} }; }
  async recoveryReceiptDigest() { return this.receipt; }
  async createRecoveryPoint() { this.effects.push("backup"); return { ...this.point, id: "recovery_created" }; }
  async stage() { await this.beforeStage?.(); this.effects.push("stage"); }
  async enterMaintenance() { this.effects.push("maintenance"); }
  async resumeCurrent() { this.effects.push("resume"); }
  async migrate() { this.effects.push("migrate"); }
  async startCandidate() { this.effects.push("start"); }
  async verifyCandidate() { this.effects.push("verify"); }
  async reopenWrites(release: ReleaseManifest) { this.effects.push("reopen"); this.identity = { ...this.identity, version: release.version, sourceRevision: release.sourceRevision, databaseSchemaVersion: release.migration.targetSchemaVersion }; }
  async rollbackApplication() { this.effects.push("restore"); }
  async rollbackDatabase() { this.effects.push("restore"); }
  async refreshIdentity() { return this.identity; }
  async deleteRecoveryPoint() { this.effects.push("delete"); }
}
async function terminal(manager: UpdateManager, id: string) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const job = (await manager.status()).jobs.find((candidate) => candidate.id === id)!;
    if (["completed", "rolled-back", "failed", "needs-attention", "denied", "expired", "cancelled"].includes(job.phase)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Job did not terminate");
}
