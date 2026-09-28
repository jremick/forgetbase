import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  productIdentitySchema,
  recoveryPointSchema,
  releaseManifestSchema,
  type ProductIdentity,
  type RecoveryPoint,
  type ReleaseManifest,
  type UpdateJob
} from "@forgetbase/schema";
import { canonicalJson, compareSemver, verifySignedManifest } from "./manifest.js";
import { initializeManagedInstallation } from "./bootstrap.js";
import { HttpUpdateControlClient } from "./client.js";
import { UpdateManager, type UpdateExecutor, type UpdateManagerOptions, type UpdateSystemProbe } from "./manager.js";
import { JsonUpdateStore } from "./store.js";
import { HostApprovalAuthority } from "./approval.js";

const temporaryDirectories: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("signed release manifests", () => {
  // Release fields reach a Compose env file and a comma-delimited migration plan.
  // A valid publisher signature must not admit extra env lines, interpolation,
  // shell syntax, or additional migration IDs through one field.
  it.each(["039_ok\nFORGETBASE_MANAGED_WRITES_ENABLED=true", "039_ok\rBAD=value", "$(touch marker)", "${UNTRUSTED}", "039_ok,040_extra", "../039_bad", "039 ok"])(
    "rejects unsafe migration identifiers even in a signed release: %s", (value) => {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const keys = new Map([["test-key", publicKey.export({ type: "spki", format: "pem" }).toString()]]);
      for (const field of ["targetSchemaVersion", "migrationIds"] as const) {
        const manifest = buildManifest();
        if (field === "targetSchemaVersion") manifest.migration.targetSchemaVersion = value;
        else manifest.migration.migrationIds = [value];
        const envelope = { keyId: "test-key", manifest,
          signature: sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString("base64") };
        expect(() => verifySignedManifest(envelope, keys)).toThrow();
      }
    }
  );

  it("verifies canonical Ed25519 signatures and rejects tampering", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const manifest = buildManifest();
    const envelope = {
      keyId: "test-key",
      signature: sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString("base64"),
      manifest
    };
    const keys = new Map([["test-key", publicKey.export({ type: "spki", format: "pem" }).toString()]]);

    expect(verifySignedManifest(envelope, keys).manifest.version).toBe("0.2.0");
    expect(() => verifySignedManifest({ ...envelope, manifest: { ...manifest, version: "0.2.1" } }, keys))
      .toThrow("signature verification failed");
  });

  it("orders stable and prerelease semantic versions", () => {
    expect(compareSemver("0.2.0", "0.2.0-beta.2")).toBeGreaterThan(0);
    expect(compareSemver("0.2.0-beta.10", "0.2.0-beta.2")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("managed installation bootstrap", () => {
  it("verifies the signed initial release and creates non-overwriting state", async () => {
    const directory = await createTemporaryDirectory();
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const manifest = buildManifest();
    const envelope = {
      keyId: "test-key",
      signature: sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString("base64"),
      manifest
    };
    const publicKeys = new Map([["test-key", publicKey.export({ type: "spki", format: "pem" }).toString()]]);
    const input = {
      envelope,
      publicKeys,
      allowedRegistryPrefixes: ["registry.example.test/forgetbase/"],
      stateDir: directory,
      updaterVersion: "0.1.0",
      bundleDigest: "b".repeat(64)
    };

    const initialized = await initializeManagedInstallation(input);
    const releaseEnvironment = await readFile(initialized.releaseEnvironmentPath, "utf8");

    expect(initialized.identity.installationMode).toBe("managed");
    expect(releaseEnvironment).toContain("FORGETBASE_API_IMAGE=registry.example.test/forgetbase/api@sha256:");
    expect((await stat(initialized.releaseEnvironmentPath)).mode & 0o777).toBe(0o600);
    await expect(initializeManagedInstallation(input)).rejects.toThrow("state already exists");
  });
});

describe("updater control transport", () => {
  it("requires explicit approval for plain HTTP transport", () => {
    expect(() => new HttpUpdateControlClient("http://host.docker.internal:3010", "a".repeat(32)))
      .toThrow("explicit trusted-host override");
    expect(() => new HttpUpdateControlClient(
      "http://host.docker.internal:3010",
      "a".repeat(32),
      fetch,
      { allowInsecureHttp: true }
    )).not.toThrow();
    expect(() => new HttpUpdateControlClient("https://updates.internal.example:3010", "a".repeat(32))).not.toThrow();
  });
});

describe("update manager", () => {
  it("keeps an API update request pending without any host mutation", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { manager } = buildManager(directory, executor);
    await seedAvailableRelease(manager, buildManifest());

    const requested = await manager.apply({ version: "0.2.0", automaticRollback: true });
    await manager.tick();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const observed = (await manager.status()).jobs.find((job) => job.id === requested.id);
    if (observed?.phase !== "awaiting-approval") await waitForTerminalJob(manager, requested.id);
    expect(observed?.phase).toBe("awaiting-approval");
    expect(executor.phases.filter((phase) => phase !== "probe")).toEqual([]);
  });

  it("keeps an API restore request pending even with exact data-loss consent", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { manager, store } = buildManager(directory, executor);
    const recovery = await executor.createRecoveryPoint();
    executor.phases.length = 0;
    await store.write({ ...await store.read(), recoveryPoints: [recovery] });

    const requested = await manager.rollback({ recoveryPointId: recovery.id, confirmDataLossAfter: recovery.createdAt });
    await manager.tick();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect((await manager.status()).jobs.find((job) => job.id === requested.id)?.phase).toBe("awaiting-approval");
    expect(executor.phases).toEqual([]);
  });

  it("runs preflight, persists phases, and completes a managed update", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { manager } = buildManager(directory, executor);
    await seedAvailableRelease(manager, buildManifest());

    const preflight = await manager.preflight("0.2.0");
    expect(preflight.eligible).toBe(true);
    const job = await manager.apply({ version: "0.2.0", automaticRollback: true });
    await approveRequest(directory, manager, job);
    const completed = await waitForTerminalJob(manager, job.id);

    expect(completed.phase, completed.message).toBe("completed");
    expect(completed.writesReopened).toBe(true);
    expect(executor.phases).toEqual([
      "probe",
      "identity",
      "probe",
      "stage",
      "maintenance",
      "backup",
      "migrate",
      "start",
      "verify",
      "reopen",
      "identity"
    ]);
    expect((await manager.status()).recoveryPoints).toHaveLength(1);
  });

  it("automatically restores a verified point when migration fails before writes reopen", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor("migrate");
    const { manager } = buildManager(directory, executor);
    await seedAvailableRelease(manager, buildManifest());

    const job = await manager.apply({ version: "0.2.0", automaticRollback: true });
    await approveRequest(directory, manager, job);
    const completed = await waitForTerminalJob(manager, job.id);

    expect(completed.phase, completed.message).toBe("rolled-back");
    expect(completed.writesReopened).toBe(true);
    expect(executor.phases).toContain("rollback-application");
  });

  it("resumes the current release if coordinated recovery creation fails", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor("backup");
    const { manager } = buildManager(directory, executor);
    await seedAvailableRelease(manager, buildManifest());

    const job = await manager.apply({ version: "0.2.0", automaticRollback: true });
    await approveRequest(directory, manager, job);
    const completed = await waitForTerminalJob(manager, job.id);

    expect(completed.phase).toBe("failed");
    expect(completed.message).toContain("current release resumed");
    expect(executor.phases).toEqual([
      "identity",
      "probe",
      "stage",
      "maintenance",
      "backup",
      "resume-current"
    ]);
  });

  it("fails closed for source installations", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { manager } = buildManager(directory, executor, { installationMode: "source", managed: false });
    await seedAvailableRelease(manager, buildManifest());

    const preflight = await manager.preflight("0.2.0");
    expect(preflight.eligible).toBe(false);
    expect(preflight.checks.find((check) => check.id === "managed-install")?.status).toBe("fail");
  });

  it("rejects incompatible destructive and manual migration contracts", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { manager } = buildManager(directory, executor);
    await seedAvailableRelease(manager, buildManifest({ migration: { compatibility: "destructive", targetSchemaVersion: "033_update_system", migrationIds: ["033_update_system"] }, rollbackMode: "application" }));

    let preflight = await manager.preflight("0.2.0");
    expect(preflight.eligible).toBe(false);
    expect(preflight.checks.find((check) => check.id === "rollback-contract")?.status).toBe("fail");

    await seedAvailableRelease(manager, buildManifest({ migration: { compatibility: "application-only", targetSchemaVersion: "033_update_system", migrationIds: ["033_update_system"] }, rollbackMode: "unavailable" }));
    preflight = await manager.preflight("0.2.0");
    expect(preflight.eligible).toBe(false);
    expect(preflight.checks.find((check) => check.id === "migration-contract")?.status).toBe("fail");
    expect(preflight.checks.find((check) => check.id === "managed-rollback-mode")?.status).toBe("fail");
  });

  it("rejects managed releases without included attachment recovery", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { manager } = buildManager(directory, executor);
    await seedAvailableRelease(manager, buildManifest({
      recovery: { components: ["database", "configuration"], attachmentMode: "not-configured" }
    }));

    const preflight = await manager.preflight("0.2.0");

    expect(preflight.eligible).toBe(false);
    expect(preflight.checks.find((check) => check.id === "attachment-recovery")?.status).toBe("fail");
  });

  it("does not automatically restore after the write boundary may have opened", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor("reopen");
    const { manager } = buildManager(directory, executor);
    await seedAvailableRelease(manager, buildManifest());

    const job = await manager.apply({ version: "0.2.0", automaticRollback: true });
    await approveRequest(directory, manager, job);
    const completed = await waitForTerminalJob(manager, job.id);

    expect(completed.phase).toBe("needs-attention");
    expect(completed.writesReopened).toBe(true);
    expect(executor.phases).not.toContain("rollback-application");
  });

  it("requires confirmation for the exact recovery timestamp before a manual database restore", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { manager, store } = buildManager(directory, executor);
    const state = await store.read();
    const point = await executor.createRecoveryPoint();
    await store.write({
      ...state,
      recoveryPoints: [point],
      jobs: [{
        id: "update_completed",
        kind: "update",
        phase: "completed",
        requestedAt: "2026-09-02T00:00:01.000Z",
        scheduledFor: null,
        startedAt: "2026-09-02T00:00:02.000Z",
        completedAt: "2026-09-02T00:01:00.000Z",
        currentVersion: "0.1.0",
        targetVersion: "0.2.0",
        manifestKeyId: "test-key",
        recoveryPointId: point.id,
        progressPercent: 100,
        message: "Updated",
        errorCode: null,
        automaticRollback: true,
        writesReopened: true,
        approval: null
      }]
    });

    await expect(manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: "2026-09-02T00:00:01.000Z" }))
      .rejects.toThrow("explicit data-loss confirmation");
    const job = await manager.rollback({ recoveryPointId: point.id, confirmDataLossAfter: point.createdAt });
    await approveRequest(directory, manager, job);
    expect((await waitForTerminalJob(manager, job.id)).phase).toBe("rolled-back");
  });

  it("re-verifies a scheduled release and fails closed if its signature changes", async () => {
    const directory = await createTemporaryDirectory();
    const executor = new FakeExecutor();
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const manifest = buildManifest();
    const envelope = {
      keyId: "test-key",
      signature: sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString("base64"),
      manifest
    };
    let tampered = false;
    let now = new Date("2026-09-02T00:00:00.000Z");
    const { manager } = buildManager(directory, executor, {}, {
      feedUrl: "https://updates.example.test/beta.json",
      publicKeys: new Map([["test-key", publicKey.export({ type: "spki", format: "pem" }).toString()]]),
      fetchImplementation: async () => new Response(JSON.stringify(tampered
        ? { ...envelope, manifest: { ...manifest, version: "0.2.1" } }
        : envelope), { status: 200, headers: { "content-type": "application/json" } }),
      now: () => now
    });

    const job = await manager.apply({ version: "0.2.0", scheduledFor: "2026-09-02T01:00:00.000Z" });
    await approveRequest(directory, manager, job);
    tampered = true;
    now = new Date("2026-09-02T01:00:01.000Z");
    await manager.tick();

    const failed = (await manager.status()).jobs.find((candidate) => candidate.id === job.id);
    expect(failed?.phase).toBe("failed");
    expect(failed?.errorCode).toBe("host_approval_validation_failed");
    expect(failed?.message).toContain("signature verification failed");
    expect(executor.phases.filter((phase) => phase !== "identity")).toEqual([]);
  });
});

function buildManager(
  directory: string,
  executor: FakeExecutor,
  identityOverrides: Partial<ProductIdentity> = {},
  optionOverrides: Partial<Omit<UpdateManagerOptions, "identity" | "store" | "executor" | "allowedRegistryPrefixes">> = {}
) {
  const identity = productIdentitySchema.parse({
    product: "forgetbase",
    version: "0.1.0",
    sourceRevision: "1".repeat(40),
    builtAt: "2026-09-01T00:00:00.000Z",
    channel: "beta",
    installationMode: "managed",
    databaseSchemaVersion: "032_api_key_surface_bindings",
    updaterVersion: "0.1.0",
    updaterProtocolVersion: "1",
    managed: true,
    ...identityOverrides
  });
  executor.identity = identity;
  const store = new JsonUpdateStore(join(directory, "state.json"));
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    manager: new UpdateManager({
      identity,
      store,
      executor,
      allowedRegistryPrefixes: ["registry.example.test/forgetbase/"],
      enabled: true,
      feedUrl: "https://updates.example.test/beta.json",
      publicKeys: new Map([["test-key", publicKey.export({ type: "spki", format: "pem" }).toString()]]),
      fetchImplementation: async () => {
        const manifest = (await store.read()).availableUpdate?.release ?? buildManifest();
        return new Response(JSON.stringify({ keyId: "test-key", manifest,
          signature: sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString("base64") }),
        { headers: { "content-type": "application/json" } });
      },
      ...optionOverrides
    }),
    store
  };
}

async function approveRequest(directory: string, manager: UpdateManager, job: UpdateJob) {
  expect(job.phase).toBe("awaiting-approval");
  expect(job.approval?.requestDigest).toMatch(/^[a-f0-9]{64}$/);
  await new HostApprovalAuthority(directory).decide(job, job.approval!.requestDigest, "approved");
  await manager.tick();
}

async function seedAvailableRelease(manager: UpdateManager, manifest: ReleaseManifest): Promise<void> {
  const internalStore = (manager as unknown as { options: { store: JsonUpdateStore } }).options.store;
  const state = await internalStore.read();
  await internalStore.write({
    ...state,
    lastCheckedAt: "2026-09-02T00:00:00.000Z",
    feedStatus: "available",
    availableUpdate: {
      checkedAt: "2026-09-02T00:00:00.000Z",
      updateAvailable: true,
      reason: "test-release",
      manifestKeyId: "test-key",
      release: manifest
    }
  });
}

async function waitForTerminalJob(manager: UpdateManager, jobId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = (await manager.status()).jobs.find((candidate) => candidate.id === jobId);
    if (job && ["completed", "failed", "rolled-back", "needs-attention"].includes(job.phase)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("update job did not reach a terminal phase");
}

function buildManifest(overrides: Partial<ReleaseManifest> = {}): ReleaseManifest {
  const digest = `sha256:${"a".repeat(64)}`;
  return releaseManifestSchema.parse({
    schemaVersion: "1",
    product: "forgetbase",
    version: "0.2.0",
    channel: "beta",
    publishedAt: "2026-09-02T00:00:00.000Z",
    sourceRevision: "2".repeat(40),
    minUpdaterVersion: "0.1.0",
    upgradeFrom: [">=0.1.0 <0.2.0"],
    risk: "medium",
    estimatedDowntimeSeconds: 60,
    requiresBackup: true,
    rollbackMode: "application",
    migration: {
      compatibility: "additive",
      targetSchemaVersion: "033_update_system",
      migrationIds: ["033_update_system"]
    },
    recovery: { components: ["database", "configuration", "attachments"], attachmentMode: "included" },
    images: ["api", "web", "worker", "migrate", "proxy"].map((component) => ({
      component,
      reference: `registry.example.test/forgetbase/${component}@${digest}`,
      digest
    })),
    notes: { summary: "Test update" },
    ...overrides
  });
}

class FakeExecutor implements UpdateExecutor {
  phases: string[] = [];
  identity!: ProductIdentity;

  constructor(private readonly failPhase?: string) {}

  async recoveryReceiptDigest(): Promise<string> { return "b".repeat(64); }

  async probe(_manifest: ReleaseManifest): Promise<UpdateSystemProbe> {
    this.phases.push("probe");
    return {
      healthy: true,
      dockerAvailable: true,
      composeAvailable: true,
      configurationValid: true,
      configurationDrift: false,
      backupWritable: true,
      freeBytes: 10_000,
      requiredBytes: 1_000,
      attachmentSnapshotAvailable: true,
      details: {}
    };
  }

  async createRecoveryPoint(): Promise<RecoveryPoint> {
    this.step("backup");
    return recoveryPointSchema.parse({
      id: "recovery_test",
      createdAt: "2026-09-02T00:00:00.000Z",
      version: "0.1.0",
      sourceRevision: "1".repeat(40),
      databaseSchemaVersion: "032_api_key_surface_bindings",
      imageReferences: ["registry.example.test/forgetbase/api@sha256:test"],
      backupPath: "/safe/forgetbase.dump",
      configurationPath: "/safe/release.env",
      attachmentSnapshotId: "/safe/attachments.tar",
      verified: true,
      protected: false,
      sizeBytes: 100
    });
  }

  async stage(): Promise<void> { this.step("stage"); }
  async enterMaintenance(): Promise<void> { this.step("maintenance"); }
  async resumeCurrent(): Promise<void> { this.step("resume-current"); }
  async migrate(): Promise<void> { this.step("migrate"); }
  async startCandidate(): Promise<void> { this.step("start"); }
  async verifyCandidate(): Promise<void> { this.step("verify"); }
  async reopenWrites(manifest: ReleaseManifest): Promise<void> {
    this.step("reopen");
    this.identity = productIdentitySchema.parse({
      ...this.identity,
      version: manifest.version,
      sourceRevision: manifest.sourceRevision,
      databaseSchemaVersion: manifest.migration.targetSchemaVersion
    });
  }
  async rollbackApplication(): Promise<void> { this.step("rollback-application"); }
  async rollbackDatabase(): Promise<void> { this.step("rollback-database"); }
  async deleteRecoveryPoint(): Promise<void> { this.step("delete-recovery"); }
  async refreshIdentity(): Promise<ProductIdentity> { this.step("identity"); return this.identity; }

  private step(phase: string): void {
    this.phases.push(phase);
    if (this.failPhase === phase) throw new Error(`Injected failure at ${phase}`);
  }
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "forgetbase-updater-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
