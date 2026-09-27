import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  productIdentitySchema, recoveryPointSchema, releaseManifestSchema, updateJobSchema,
  type ProductIdentity, type RecoveryPoint, type ReleaseManifest, type UpdateJob, type UpdateJobPhase
} from "@forgetbase/schema";
import { canonicalJson } from "./manifest.js";
import { UpdateManager, type UpdateExecutor, type UpdateManagerOptions } from "./manager.js";
import { emptyUpdateState, JsonUpdateStore } from "./store.js";

const timestamp = "2026-09-28T00:00:00.000Z";
const future = "2026-09-29T00:00:00.000Z";
const identity = productIdentitySchema.parse({ product: "forgetbase", version: "0.1.0", sourceRevision: "1".repeat(40), builtAt: timestamp, channel: "beta", installationMode: "managed", databaseSchemaVersion: "032_base", updaterVersion: "0.1.0", updaterProtocolVersion: "1", managed: true });
const point = recoveryPointSchema.parse({ id: "recovery_synthetic", createdAt: timestamp, version: "0.1.0", sourceRevision: "1".repeat(40), databaseSchemaVersion: "032_base", imageReferences: ["registry.example.test/forgetbase/api@sha256:" + "a".repeat(64)], backupPath: "/synthetic/database.dump", configurationPath: "/synthetic/release.env", attachmentSnapshotId: "/synthetic/attachments.tar", verified: true, protected: false, sizeBytes: 100 });


const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("durable interrupted update recovery", () => {
  it.each<UpdateJobPhase>(["queued", "preflight", "staging", "maintenance", "backing-up", "migrating", "starting", "verifying", "rolling-back"])(
    "reconciles interrupted %s without replay and permits explicit operator recovery", async (phase) => {
      const { manager, store, executor, statePath } = await fixture();
      const interrupted = job({ phase, recoveryPointId: point.id, startedAt: phase === "queued" ? null : timestamp });
      await store.write({ ...await store.read(), jobs: [interrupted], recoveryPoints: [point] });
      await manager.reconcileInterruptedJobs();
      const status = await manager.status();
      expect(status.activeJob).toBeNull();
      expect(status.jobs[0]).toMatchObject({ phase: "needs-attention", errorCode: "updater_interrupted", recoveryPointId: point.id });
      expect(status.jobs[0]?.message).toContain(phase);
      expect(status.jobs[0]?.message).toContain(point.id);
      expect(status.jobs[0]?.completedAt).not.toBeNull();
      if (!["queued", "preflight", "staging"].includes(phase)) expect(status.jobs[0]?.writesReopened).toBe(true);
      expect(executor.effects).toEqual([]);
      const reconciled = await readFile(statePath, "utf8");
      await manager.reconcileInterruptedJobs();
      expect(await readFile(statePath, "utf8")).toBe(reconciled);
      const recovery = await manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: point.createdAt });
      expect((await terminal(manager, recovery.id)).phase).toBe("rolled-back");
      expect(executor.effects.filter((effect) => effect === "restore")).toHaveLength(1);
    }
  );

  it("retains one unstarted schedule, then re-verifies it at its approved time", async () => {
    let now = new Date(timestamp);
    const manifest = release();
    const feed = signedFeed(manifest);
    const { manager, store, executor } = await fixture({ ...feed.options, now: () => now });
    await store.write({ ...await store.read(), jobs: [job({ phase: "scheduled", scheduledFor: "2026-09-28T01:00:00.000Z" })] });
    await manager.reconcileInterruptedJobs();
    await manager.tick();
    expect(executor.effects).toEqual([]);
    expect(feed.calls()).toBe(0);
    now = new Date("2026-09-28T01:00:01.000Z");
    await manager.tick();
    expect((await terminal(manager, "update_interrupted")).phase).toBe("completed");
    expect(feed.calls()).toBe(1);
    expect(executor.effects.filter((effect) => effect === "migrate")).toHaveLength(1);
  });

  it("quarantines conflicting persisted schedules instead of launching either", async () => {
    const { manager, store, executor } = await fixture();
    await store.write({ ...await store.read(), jobs: ["one", "two"].map((id) => job({ id, phase: "scheduled", scheduledFor: timestamp })) });
    await manager.reconcileInterruptedJobs();
    await manager.tick();
    expect((await manager.status()).jobs.map((entry) => entry.phase)).toEqual(["needs-attention", "needs-attention"]);
    expect(executor.effects).toEqual([]);
  });
});

describe("single-operation admission and cancellation", () => {
  it("admits only one of simultaneous apply requests after both preflights pass", async () => {
    const { manager, executor } = await fixture();
    const gate = deferred();
    executor.probeGate = gate.promise;
    const requests = [manager.apply({ version: "0.2.0", scheduledFor: future }), manager.apply({ version: "0.2.0", scheduledFor: future })];
    await until(() => executor.probes === 2);
    gate.resolve();
    const results = await Promise.allSettled(requests);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await manager.status()).jobs).toHaveLength(1);
  });

  it("admits only one competing rollback while its executor is paused", async () => {
    const { manager, store, executor } = await fixture();
    await store.write({ ...await store.read(), recoveryPoints: [point] });
    const gate = deferred();
    executor.maintenanceGate = gate.promise;
    const results = await Promise.allSettled([1, 2].map(() => manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: point.createdAt })));
    gate.resolve();
    for (const result of results) if (result.status === "fulfilled") await terminal(manager, result.value.id);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(executor.effects.filter((effect) => effect === "restore")).toHaveLength(1);
  });

  it("rejects apply when rollback was admitted during apply preflight", async () => {
    const { manager, store, executor } = await fixture();
    await store.write({ ...await store.read(), recoveryPoints: [point] });
    const probe = deferred();
    const maintenance = deferred();
    executor.probeGate = probe.promise;
    executor.maintenanceGate = maintenance.promise;
    const applying = manager.apply({ version: "0.2.0", scheduledFor: future });
    const applyingResult = Promise.allSettled([applying]);
    await until(() => executor.probes === 1);
    const rollingBack = await manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: point.createdAt });
    probe.resolve();
    const results = await applyingResult;
    maintenance.resolve();
    await terminal(manager, rollingBack.id);
    expect(results[0]?.status).toBe("rejected");
    expect((await manager.status()).jobs).toHaveLength(1);
  });

  it.each([false, true])("does not launch or overwrite cancellation while feed verification finishes (fails=%s)", async (failFeed) => {
    const gate = deferred();
    const feed = signedFeed(release(), async () => { await gate.promise; if (failFeed) throw new Error("feed unavailable"); });
    const { manager, store, executor } = await fixture(feed.options);
    await store.write({ ...await store.read(), jobs: [job({ phase: "scheduled", scheduledFor: timestamp })] });
    const ticking = manager.tick();
    await until(() => feed.calls() === 1);
    await manager.cancel("update_interrupted");
    gate.resolve();
    await ticking;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await manager.status()).jobs[0]?.phase).toBe("cancelled");
    expect(executor.effects).toEqual([]);
  });
});

describe("write boundary and explicit recovery", () => {
  it.each([
    { mode: "source" as const, enabled: true, operation: "apply" as const },
    { mode: "hosted" as const, enabled: true, operation: "apply" as const },
    { mode: "managed" as const, enabled: false, operation: "apply" as const },
    { mode: "source" as const, enabled: true, operation: "rollback" as const },
    { mode: "hosted" as const, enabled: true, operation: "rollback" as const },
    { mode: "managed" as const, enabled: false, operation: "rollback" as const }
  ])("refuses $operation when mode=$mode and enabled=$enabled", async ({ mode, enabled, operation }) => {
    const { manager, store, executor } = await fixture({ identity: { ...identity, installationMode: mode, managed: mode === "managed" }, enabled });
    await store.write({ ...await store.read(), recoveryPoints: [point] });
    const result = await Promise.allSettled([operation === "apply"
      ? manager.apply({ version: "0.2.0" })
      : manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: point.createdAt })]);
    if (result[0]?.status === "fulfilled") await terminal(manager, result[0].value.id);
    expect(result[0]?.status).toBe("rejected");
    expect(executor.effects).toEqual([]);
  });

  it("resumes the current release when recovery verification fails, without migrating or publishing that point", async () => {
    const { manager, store, executor } = await fixture();
    executor.recoveryVerified = false;
    const update = await manager.apply({ version: "0.2.0", automaticRollback: true });
    expect((await terminal(manager, update.id)).phase).toBe("failed");
    expect(executor.effects).toContain("resume");
    expect(executor.effects).not.toContain("migrate");
    expect(executor.effects).not.toContain("restore");
    expect((await store.read()).recoveryPoints).toEqual([]);
  });

  it("requires exact data-loss consent even when the recovery ledger has no completed update", async () => {
    const { manager, store, executor } = await fixture();
    await store.write({ ...await store.read(), recoveryPoints: [point] });
    await expect(manager.rollback({ recoveryPointId: point.id })).rejects.toThrow("explicit data-loss confirmation");
    await expect(manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: future })).rejects.toThrow("explicit data-loss confirmation");
    expect(executor.effects).toEqual([]);
  });

  it("persists the write boundary before rollback can reopen writers and preserves it on failure", async () => {
    const { manager, store, executor } = await fixture();
    await store.write({ ...await store.read(), recoveryPoints: [point] });
    executor.beforeRestore = async () => {
      expect((await store.read()).jobs[0]?.writesReopened).toBe(true);
      throw new Error("proxy reopened but identity persistence failed");
    };
    const recovery = await manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: point.createdAt });
    expect(await terminal(manager, recovery.id)).toMatchObject({ phase: "needs-attention", writesReopened: true });
  });

  it("never restores the database when reopening succeeds partially then fails", async () => {
    const { manager, executor } = await fixture();
    executor.failReopen = true;
    const update = await manager.apply({ version: "0.2.0", automaticRollback: true });
    expect(await terminal(manager, update.id)).toMatchObject({ phase: "needs-attention", writesReopened: true });
    expect(executor.effects).not.toContain("restore");
  });
});

describe("durable state file boundary", () => {
  it.each([
    "{broken", JSON.stringify({ ...emptyUpdateState(), jobs: null }),
    JSON.stringify({ ...emptyUpdateState(), recoveryPoints: {} }),
    JSON.stringify({ ...emptyUpdateState(), feedStatus: "corrupt" }),
    JSON.stringify({ ...emptyUpdateState(), lastCheckedAt: "yesterday" }),
    JSON.stringify({ ...emptyUpdateState(), jobs: [job(), job()] }),
    JSON.stringify({ ...emptyUpdateState(), schemaVersion: "99" })
  ])("fails closed on corrupt state without replacing its bytes: %s", async (raw) => {
    const directory = await directoryForTest();
    const path = join(directory, "state.json");
    const store = new JsonUpdateStore(path);
    expect(await store.read()).toEqual(emptyUpdateState());
    await writeFile(path, raw);
    await expect(store.read()).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(raw);
  });

  it("writes complete private snapshots under concurrent writes and removes temporary files", async () => {
    const directory = await directoryForTest();
    const path = join(directory, "state.json");
    const store = new JsonUpdateStore(path);
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => store.write({ ...emptyUpdateState(), jobs: [job({ id: `job_${index}` })] })));
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect((await store.read()).jobs).toHaveLength(1);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readdir(directory)).toEqual(["state.json"]);
  });
});


function job(overrides: Partial<UpdateJob> = {}): UpdateJob {
  return updateJobSchema.parse({ id: "update_interrupted", kind: "update", phase: "queued", requestedAt: timestamp, scheduledFor: null, startedAt: null, completedAt: null, currentVersion: "0.1.0", targetVersion: "0.2.0", manifestKeyId: "synthetic", recoveryPointId: null, progressPercent: 0, message: "Synthetic interrupted job", errorCode: null, automaticRollback: true, writesReopened: false, ...overrides });
}

function release(): ReleaseManifest {
  const digest = `sha256:${"a".repeat(64)}`;
  return releaseManifestSchema.parse({ schemaVersion: "1", product: "forgetbase", version: "0.2.0", channel: "beta", publishedAt: timestamp, sourceRevision: "2".repeat(40), minUpdaterVersion: "0.1.0", upgradeFrom: [">=0.1.0 <0.2.0"], risk: "medium", estimatedDowntimeSeconds: 60, requiresBackup: true, rollbackMode: "database-restore", migration: { compatibility: "destructive", targetSchemaVersion: "033_update", migrationIds: ["033_update"] }, recovery: { components: ["database", "configuration", "attachments"], attachmentMode: "included" }, images: ["api", "web", "worker", "migrate", "proxy"].map((component) => ({ component, reference: `registry.example.test/forgetbase/${component}@${digest}`, digest })), notes: { summary: "Synthetic recovery update" } });
}

async function directoryForTest() { const path = await mkdtemp(join(tmpdir(), "forgetbase-recovery-")); directories.push(path); return path; }
async function fixture(overrides: Partial<UpdateManagerOptions> = {}) {
  const statePath = join(await directoryForTest(), "state.json");
  const store = new JsonUpdateStore(statePath);
  const executor = new RecordingExecutor();
  const manager = new UpdateManager({ identity, store, executor, allowedRegistryPrefixes: ["registry.example.test/forgetbase/"], now: () => new Date(timestamp), ...overrides });
  await store.write({ ...emptyUpdateState(), feedStatus: "available", availableUpdate: { checkedAt: timestamp, updateAvailable: true, reason: "synthetic", manifestKeyId: "synthetic", release: release() } });
  return { manager, store, executor, statePath };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }
async function until(predicate: () => boolean) { for (let attempt = 0; attempt < 300; attempt++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 5)); } throw new Error("Timed out waiting for controlled interleaving"); }
async function terminal(manager: UpdateManager, id: string): Promise<UpdateJob> {
  for (let attempt = 0; attempt < 300; attempt++) { const found = (await manager.status()).jobs.find((entry) => entry.id === id); if (found && ["completed", "failed", "rolled-back", "needs-attention", "cancelled"].includes(found.phase)) return found; await new Promise((resolve) => setTimeout(resolve, 5)); }
  throw new Error("Job did not terminate");
}
function signedFeed(manifest: ReleaseManifest, wait?: () => Promise<void>) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const envelope = { keyId: "synthetic", manifest, signature: sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString("base64") };
  let calls = 0;
  return { calls: () => calls, options: { feedUrl: "https://updates.example.test/beta.json", publicKeys: new Map([["synthetic", publicKey.export({ type: "spki", format: "pem" }).toString()]]), fetchImplementation: async () => { calls++; await wait?.(); return new Response(JSON.stringify(envelope), { headers: { "content-type": "application/json" } }); } } };
}
class RecordingExecutor implements UpdateExecutor {
  effects: string[] = []; probes = 0; probeGate?: Promise<void>; maintenanceGate?: Promise<void>; failReopen = false;
  recoveryVerified = true;
  beforeRestore?: () => Promise<void>; currentIdentity: ProductIdentity = identity;
  async probe() { this.probes++; await this.probeGate; return { healthy: true, dockerAvailable: true, composeAvailable: true, configurationValid: true, configurationDrift: false, backupWritable: true, freeBytes: 10000, requiredBytes: 100, attachmentSnapshotAvailable: true, details: {} }; }
  async createRecoveryPoint() { this.effects.push("backup"); return { ...point, verified: this.recoveryVerified }; }
  async stage() { this.effects.push("stage"); }
  async enterMaintenance() { this.effects.push("maintenance"); await this.maintenanceGate; }
  async resumeCurrent() { this.effects.push("resume"); }
  async migrate() { this.effects.push("migrate"); }
  async startCandidate() { this.effects.push("start"); }
  async verifyCandidate() { this.effects.push("verify"); }
  async reopenWrites(manifest: ReleaseManifest) { this.effects.push("reopen"); if (this.failReopen) throw new Error("reopen partially completed"); this.currentIdentity = { ...identity, version: manifest.version }; }
  async rollbackApplication() { this.effects.push("restore-application"); await this.beforeRestore?.(); }
  async rollbackDatabase(_point: RecoveryPoint) { this.effects.push("restore"); await this.beforeRestore?.(); }
  async deleteRecoveryPoint() { this.effects.push("delete"); }
  async refreshIdentity() { return this.currentIdentity; }
}
