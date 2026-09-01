import { randomUUID } from "node:crypto";
import {
  availableUpdateSchema,
  productIdentitySchema,
  recoveryPointSchema,
  updateApplyInputSchema,
  updateJobSchema,
  updatePreflightSchema,
  updateRollbackInputSchema,
  updateSystemStatusSchema,
  type ProductIdentity,
  type RecoveryPoint,
  type ReleaseManifest,
  type SignedReleaseManifest,
  type UpdateApplyInput,
  type UpdateJob,
  type UpdateJobPhase,
  type UpdatePreflight,
  type UpdateRollbackInput,
  type UpdateSystemStatus
} from "@forgetbase/schema";
import { compareSemver, fetchSignedManifest, supportsUpgradeFrom, validateManifestImages } from "./manifest.js";
import { JsonUpdateStore, type PersistedUpdateState } from "./store.js";

const activePhases = new Set<UpdateJobPhase>([
  "queued",
  "scheduled",
  "preflight",
  "backing-up",
  "staging",
  "maintenance",
  "migrating",
  "starting",
  "verifying",
  "rolling-back"
]);

export interface UpdateSystemProbe {
  healthy: boolean;
  dockerAvailable: boolean;
  composeAvailable: boolean;
  configurationValid: boolean;
  configurationDrift: boolean;
  backupWritable: boolean;
  freeBytes: number;
  requiredBytes: number;
  attachmentSnapshotAvailable: boolean;
  details: Record<string, string>;
}

export interface UpdateExecutor {
  probe(manifest: ReleaseManifest): Promise<UpdateSystemProbe>;
  createRecoveryPoint(input: { identity: ProductIdentity; manifest: ReleaseManifest }): Promise<RecoveryPoint>;
  stage(manifest: ReleaseManifest): Promise<void>;
  enterMaintenance(): Promise<void>;
  migrate(manifest: ReleaseManifest): Promise<void>;
  startCandidate(manifest: ReleaseManifest): Promise<void>;
  verifyCandidate(manifest: ReleaseManifest): Promise<void>;
  reopenWrites(manifest: ReleaseManifest): Promise<void>;
  rollbackApplication(point: RecoveryPoint): Promise<void>;
  rollbackDatabase(point: RecoveryPoint): Promise<void>;
  deleteRecoveryPoint(point: RecoveryPoint): Promise<void>;
  refreshIdentity(): Promise<ProductIdentity>;
}

export interface UpdateManagerOptions {
  identity: ProductIdentity;
  store: JsonUpdateStore;
  executor: UpdateExecutor;
  feedUrl?: string;
  publicKeys?: ReadonlyMap<string, string>;
  allowedRegistryPrefixes: readonly string[];
  allowLocalHttpFeed?: boolean;
  enabled?: boolean;
  retentionCount?: number;
  now?: () => Date;
  fetchImplementation?: typeof fetch;
}

export class UpdateManager {
  private identity: ProductIdentity;
  private readonly runningJobs = new Map<string, Promise<void>>();
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: UpdateManagerOptions) {
    this.identity = productIdentitySchema.parse(options.identity);
  }

  async status(): Promise<UpdateSystemStatus> {
    const state = await this.options.store.read();
    return updateSystemStatusSchema.parse({
      enabled: this.enabled,
      identity: this.identity,
      availableUpdate: state.availableUpdate,
      activeJob: state.jobs.find((job) => activePhases.has(job.phase)) ?? null,
      jobs: state.jobs.slice(0, 50),
      recoveryPoints: state.recoveryPoints,
      lastCheckedAt: state.lastCheckedAt,
      feedStatus: this.enabled ? state.feedStatus : "disabled"
    });
  }

  async checkForUpdates(): Promise<UpdateSystemStatus> {
    if (!this.enabled || !this.options.feedUrl || !this.options.publicKeys?.size) {
      await this.mutate((state) => ({ ...state, feedStatus: "disabled" }));
      return this.status();
    }

    const checkedAt = this.now().toISOString();

    try {
      const envelope = await fetchSignedManifest({
        feedUrl: this.options.feedUrl,
        publicKeys: this.options.publicKeys,
        allowHttpForLocalhost: this.options.allowLocalHttpFeed,
        fetchImplementation: this.options.fetchImplementation
      });
      validateManifestImages(envelope.manifest, this.options.allowedRegistryPrefixes);
      const updateAvailable = compareSemver(envelope.manifest.version, this.identity.version) > 0 &&
        envelope.manifest.channel === this.identity.channel;
      const availableUpdate = availableUpdateSchema.parse({
        checkedAt,
        updateAvailable,
        reason: updateAvailable ? "newer-compatible-channel-release" : "current-or-channel-mismatch",
        manifestKeyId: envelope.keyId,
        release: envelope.manifest
      });

      await this.mutate((state) => ({
        ...state,
        availableUpdate,
        lastCheckedAt: checkedAt,
        feedStatus: updateAvailable ? "available" : "current"
      }));
    } catch (error) {
      const invalid = /signature|manifest|image|registry|revoked|semantic version/i.test(errorMessage(error));
      await this.mutate((state) => ({
        ...state,
        lastCheckedAt: checkedAt,
        feedStatus: invalid ? "invalid" : "unreachable"
      }));
      throw error;
    }

    return this.status();
  }

  async preflight(version?: string, currentJobId?: string): Promise<UpdatePreflight> {
    const { envelope, state } = await this.requireAvailableRelease(version);
    const manifest = envelope.manifest;
    const probe = await this.options.executor.probe(manifest);
    const checks = [
      check("managed-install", "Managed installation", this.identity.installationMode === "managed", "Updates can be applied only to managed installations"),
      check("newer-release", "Newer release", compareSemver(manifest.version, this.identity.version) > 0, `${this.identity.version} → ${manifest.version}`),
      check("release-channel", "Release channel", manifest.channel === this.identity.channel, `Installed ${this.identity.channel}; release ${manifest.channel}`),
      check("upgrade-path", "Supported upgrade path", supportsUpgradeFrom(manifest, this.identity.version), `Supported from: ${manifest.upgradeFrom.join(", ")}`),
      check("updater-version", "Updater compatibility", compareSemver(this.identity.updaterVersion ?? "0.0.0", manifest.minUpdaterVersion) >= 0, `Requires updater ${manifest.minUpdaterVersion} or newer`),
      check(
        "migration-contract",
        "Migration contract",
        manifest.migration.compatibility !== "application-only" || (
          manifest.migration.migrationIds.length === 0 &&
          manifest.migration.targetSchemaVersion === this.identity.databaseSchemaVersion
        ),
        manifest.migration.compatibility === "application-only"
          ? "Application-only releases cannot declare database changes"
          : `Migration mode: ${manifest.migration.compatibility}`
      ),
      check(
        "rollback-contract",
        manifest.migration.compatibility === "destructive" ? "Database rollback required" : "Rollback contract compatible",
        manifest.migration.compatibility !== "destructive" || manifest.rollbackMode === "database-restore",
        manifest.migration.compatibility === "destructive"
          ? `Destructive migrations require database-restore; release declares ${manifest.rollbackMode}`
          : `Release declares ${manifest.rollbackMode}`
      ),
      check(
        "application-rollback-compatibility",
        "Application rollback compatibility",
        manifest.rollbackMode !== "application" || ["application-only", "additive"].includes(manifest.migration.compatibility),
        `Application rollback with migration mode ${manifest.migration.compatibility}`
      ),
      check(
        "managed-rollback-mode",
        "Managed rollback mode",
        ["application", "database-restore"].includes(manifest.rollbackMode),
        `Managed installs cannot apply a release with rollback mode ${manifest.rollbackMode}`
      ),
      check(
        "no-active-job",
        "No active update",
        !state.jobs.some((job) => job.id !== currentJobId && activePhases.has(job.phase)),
        "Only one update or rollback can run at a time"
      ),
      check("system-health", "Current system health", probe.healthy, probe.details.health ?? "Current installation must be healthy"),
      check("docker", "Docker available", probe.dockerAvailable, probe.details.docker ?? "Docker is required"),
      check("compose", "Docker Compose available", probe.composeAvailable, probe.details.compose ?? "Docker Compose is required"),
      check("configuration", "Managed configuration valid", probe.configurationValid, probe.details.configuration ?? "Managed Compose configuration must validate"),
      check("configuration-drift", "No unmanaged configuration drift", !probe.configurationDrift, probe.details.configurationDrift ?? "Resolve local deployment drift before updating"),
      check("backup-destination", "Backup destination writable", probe.backupWritable, probe.details.backup ?? "A verified recovery point is required"),
      check("disk-space", "Sufficient disk space", probe.freeBytes >= probe.requiredBytes, `${probe.freeBytes} bytes available; ${probe.requiredBytes} required`),
      check(
        "attachment-recovery",
        "Attachment recovery available",
        manifest.recovery.attachmentMode !== "external-snapshot-required" || probe.attachmentSnapshotAvailable,
        manifest.recovery.attachmentMode === "external-snapshot-required"
          ? "This release requires an external attachment snapshot provider"
          : `Attachment recovery mode: ${manifest.recovery.attachmentMode}`
      )
    ];

    return updatePreflightSchema.parse({
      checkedAt: this.now().toISOString(),
      currentVersion: this.identity.version,
      targetVersion: manifest.version,
      eligible: checks.every((entry) => !entry.blocking || entry.status !== "fail"),
      rollbackMode: manifest.rollbackMode,
      estimatedDowntimeSeconds: manifest.estimatedDowntimeSeconds,
      checks
    });
  }

  async apply(input: UpdateApplyInput): Promise<UpdateJob> {
    const parsed = updateApplyInputSchema.parse(input);
    if (this.options.feedUrl && this.options.publicKeys?.size) await this.checkForUpdates();
    const preflight = await this.preflight(parsed.version);

    if (!preflight.eligible) {
      throw new Error("Update preflight failed");
    }

    const scheduledFor = parsed.scheduledFor ?? null;
    if (scheduledFor && Date.parse(scheduledFor) <= this.now().getTime()) {
      throw new Error("scheduledFor must be in the future");
    }

    const state = await this.options.store.read();
    const manifest = state.availableUpdate?.release;
    if (!manifest || manifest.version !== parsed.version) {
      throw new Error("Selected release is no longer available");
    }

    const job = updateJobSchema.parse({
      id: `update_${randomUUID()}`,
      kind: "update",
      phase: scheduledFor ? "scheduled" : "queued",
      requestedAt: this.now().toISOString(),
      scheduledFor,
      startedAt: null,
      completedAt: null,
      currentVersion: this.identity.version,
      targetVersion: manifest.version,
      manifestKeyId: state.availableUpdate?.manifestKeyId ?? null,
      recoveryPointId: null,
      progressPercent: 0,
      message: scheduledFor ? `Update scheduled for ${scheduledFor}` : "Update queued",
      errorCode: null,
      automaticRollback: parsed.automaticRollback,
      writesReopened: false
    });

    await this.mutate((current) => ({ ...current, jobs: [job, ...current.jobs].slice(0, 200) }));

    if (!scheduledFor) {
      this.launch(job.id, manifest);
    }

    return job;
  }

  async rollback(input: UpdateRollbackInput): Promise<UpdateJob> {
    const parsed = updateRollbackInputSchema.parse(input);
    const state = await this.options.store.read();
    if (state.jobs.some((job) => activePhases.has(job.phase))) {
      throw new Error("Another update operation is already active");
    }

    const point = state.recoveryPoints.find((candidate) => candidate.id === parsed.recoveryPointId);
    if (!point?.verified) {
      throw new Error("Recovery point is unavailable or unverified");
    }

    const laterWriteWindow = state.jobs.some((job) =>
      job.writesReopened && job.completedAt && Date.parse(job.completedAt) > Date.parse(point.createdAt)
    );
    if (laterWriteWindow && parsed.confirmDataLossAfter !== point.createdAt) {
      throw new Error("Rollback may discard post-update writes; explicit data-loss confirmation is required");
    }

    const job = updateJobSchema.parse({
      id: `rollback_${randomUUID()}`,
      kind: "rollback",
      phase: "queued",
      requestedAt: this.now().toISOString(),
      scheduledFor: null,
      startedAt: null,
      completedAt: null,
      currentVersion: this.identity.version,
      targetVersion: point.version,
      manifestKeyId: null,
      recoveryPointId: point.id,
      progressPercent: 0,
      message: "Rollback queued",
      errorCode: null,
      automaticRollback: false,
      writesReopened: false
    });

    await this.mutate((current) => ({ ...current, jobs: [job, ...current.jobs].slice(0, 200) }));
    this.launchRollback(job.id, point);
    return job;
  }

  async cancel(jobId: string): Promise<UpdateJob> {
    return this.updateJob(jobId, (job) => {
      if (!new Set<UpdateJobPhase>(["queued", "scheduled"]).has(job.phase)) {
        throw new Error("Only queued or scheduled jobs can be cancelled safely");
      }

      return {
        ...job,
        phase: "cancelled",
        completedAt: this.now().toISOString(),
        message: "Update cancelled before execution"
      };
    });
  }

  async tick(): Promise<void> {
    const state = await this.options.store.read();
    const now = this.now().getTime();

    for (const job of state.jobs) {
      if (job.phase === "scheduled" && job.scheduledFor && Date.parse(job.scheduledFor) <= now) {
        try {
          if (this.options.feedUrl && this.options.publicKeys?.size) await this.checkForUpdates();
          const currentState = await this.options.store.read();
          const manifest = currentState.availableUpdate?.release;
          if (currentState.feedStatus === "available" && manifest?.version === job.targetVersion) this.launch(job.id, manifest);
          else await this.failJob(job.id, "scheduled_release_unavailable", "Scheduled release is no longer verified and available");
        } catch {
          await this.failJob(job.id, "scheduled_release_verification_failed", "Scheduled release could not be re-verified");
        }
      }
    }
  }

  private get enabled(): boolean {
    return this.options.enabled !== false && this.identity.installationMode !== "hosted";
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private async requireAvailableRelease(version?: string): Promise<{ envelope: SignedReleaseManifest; state: PersistedUpdateState }> {
    const state = await this.options.store.read();
    const release = state.availableUpdate?.release;

    if (!release || !state.availableUpdate?.updateAvailable) {
      throw new Error("No update is currently available");
    }

    if (version && release.version !== version) {
      throw new Error(`Requested release ${version} does not match available release ${release.version}`);
    }

    return {
      envelope: {
        keyId: state.availableUpdate.manifestKeyId ?? "verified-feed",
        signature: "persisted-after-verification",
        manifest: release
      },
      state
    };
  }

  private launch(jobId: string, manifest: ReleaseManifest): void {
    if (this.runningJobs.has(jobId)) return;
    const promise = this.executeUpdate(jobId, manifest).finally(() => this.runningJobs.delete(jobId));
    this.runningJobs.set(jobId, promise);
  }

  private launchRollback(jobId: string, point: RecoveryPoint): void {
    if (this.runningJobs.has(jobId)) return;
    const promise = this.executeRollback(jobId, point).finally(() => this.runningJobs.delete(jobId));
    this.runningJobs.set(jobId, promise);
  }

  private async executeUpdate(jobId: string, manifest: ReleaseManifest): Promise<void> {
    let recoveryPoint: RecoveryPoint | null = null;

    try {
      await this.setPhase(jobId, "preflight", 5, "Rechecking update preflight", { startedAt: this.now().toISOString() });
      const preflight = await this.preflight(manifest.version, jobId);
      if (!preflight.eligible) throw new Error("Update preflight failed at execution time");

      await this.setPhase(jobId, "backing-up", 15, "Creating and verifying recovery point");
      recoveryPoint = recoveryPointSchema.parse(await this.options.executor.createRecoveryPoint({ identity: this.identity, manifest }));
      await this.mutate((state) => ({ ...state, recoveryPoints: [recoveryPoint!, ...state.recoveryPoints] }));
      await this.updateJob(jobId, (job) => ({ ...job, recoveryPointId: recoveryPoint?.id ?? null }));

      await this.setPhase(jobId, "staging", 30, "Pulling digest-pinned release images");
      await this.options.executor.stage(manifest);
      await this.setPhase(jobId, "maintenance", 45, "Entering maintenance mode and stopping writers");
      await this.options.executor.enterMaintenance();
      await this.setPhase(jobId, "migrating", 60, "Applying the verified migration set");
      await this.options.executor.migrate(manifest);
      await this.setPhase(jobId, "starting", 75, "Starting candidate application services");
      await this.options.executor.startCandidate(manifest);
      await this.setPhase(jobId, "verifying", 88, "Verifying candidate health and schema identity");
      await this.options.executor.verifyCandidate(manifest);
      await this.updateJob(jobId, (job) => ({ ...job, writesReopened: true }));
      await this.options.executor.reopenWrites(manifest);
      this.identity = productIdentitySchema.parse(await this.options.executor.refreshIdentity());
      await this.updateJob(jobId, (job) => ({
        ...job,
        phase: "completed",
        progressPercent: 100,
        completedAt: this.now().toISOString(),
        message: `Updated to ${manifest.version}`,
        writesReopened: true
      }));
      await this.pruneRecoveryPoints();
    } catch (error) {
      const message = errorMessage(error);
      const job = (await this.options.store.read()).jobs.find((candidate) => candidate.id === jobId);

      if (job?.automaticRollback && recoveryPoint && !job.writesReopened && !["application", "database-restore"].includes(manifest.rollbackMode)) {
        await this.updateJob(jobId, (current) => ({
          ...current,
          phase: "needs-attention",
          completedAt: this.now().toISOString(),
          message: `Update failed (${message}); this release does not permit automatic rollback`,
          errorCode: classifyError(error)
        }));
        return;
      }

      if (job?.automaticRollback && recoveryPoint && !job.writesReopened) {
        const point = recoveryPoint;
        try {
          await this.setPhase(jobId, "rolling-back", 92, `Update failed; restoring ${point.version}`);
          await this.restoreRecoveryPoint(point, manifest.rollbackMode === "database-restore");
          this.identity = productIdentitySchema.parse(await this.options.executor.refreshIdentity());
          await this.updateJob(jobId, (current) => ({
            ...current,
            phase: "rolled-back",
            progressPercent: 100,
            completedAt: this.now().toISOString(),
            message: `Update failed and automatically restored ${point.version}`,
            errorCode: classifyError(error)
          }));
          return;
        } catch (rollbackError) {
          await this.updateJob(jobId, (current) => ({
            ...current,
            phase: "needs-attention",
            completedAt: this.now().toISOString(),
            message: `Update failed (${message}); automatic rollback also failed (${errorMessage(rollbackError)})`,
            errorCode: "automatic_rollback_failed"
          }));
          return;
        }
      }

      await this.failJob(jobId, classifyError(error), message);
    }
  }

  private async executeRollback(jobId: string, point: RecoveryPoint): Promise<void> {
    try {
      await this.setPhase(jobId, "maintenance", 20, "Stopping writers before rollback", { startedAt: this.now().toISOString() });
      await this.options.executor.enterMaintenance();
      await this.setPhase(jobId, "rolling-back", 55, `Restoring recovery point ${point.id}`);
      await this.restoreRecoveryPoint(point, Boolean(point.backupPath));
      this.identity = productIdentitySchema.parse(await this.options.executor.refreshIdentity());
      await this.updateJob(jobId, (job) => ({
        ...job,
        phase: "rolled-back",
        progressPercent: 100,
        completedAt: this.now().toISOString(),
        message: `Restored ${point.version}`,
        writesReopened: true
      }));
    } catch (error) {
      await this.updateJob(jobId, (job) => ({
        ...job,
        phase: "needs-attention",
        completedAt: this.now().toISOString(),
        message: `Rollback failed: ${errorMessage(error)}`,
        errorCode: classifyError(error)
      }));
    }
  }

  private async restoreRecoveryPoint(point: RecoveryPoint, restoreDatabase: boolean): Promise<void> {
    if (restoreDatabase) {
      await this.options.executor.rollbackDatabase(point);
    } else {
      await this.options.executor.rollbackApplication(point);
    }
  }

  private async setPhase(
    jobId: string,
    phase: UpdateJobPhase,
    progressPercent: number,
    message: string,
    additions: Partial<UpdateJob> = {}
  ): Promise<UpdateJob> {
    return this.updateJob(jobId, (job) => ({ ...job, ...additions, phase, progressPercent, message }));
  }

  private async failJob(jobId: string, errorCode: string, message: string): Promise<void> {
    await this.updateJob(jobId, (job) => ({
      ...job,
      phase: "failed",
      completedAt: this.now().toISOString(),
      message,
      errorCode
    }));
  }

  private async updateJob(jobId: string, update: (job: UpdateJob) => UpdateJob): Promise<UpdateJob> {
    let result: UpdateJob | null = null;
    await this.mutate((state) => ({
      ...state,
      jobs: state.jobs.map((job) => {
        if (job.id !== jobId) return job;
        result = updateJobSchema.parse(update(job));
        return result;
      })
    }));

    if (!result) throw new Error(`Update job not found: ${jobId}`);
    return result;
  }

  private async pruneRecoveryPoints(): Promise<void> {
    const retentionCount = Math.max(1, this.options.retentionCount ?? 3);
    const state = await this.options.store.read();
    const retained: RecoveryPoint[] = [];
    const removed: RecoveryPoint[] = [];

    for (const point of state.recoveryPoints) {
      if (point.protected || retained.length < retentionCount) retained.push(point);
      else removed.push(point);
    }

    for (const point of removed) {
      await this.options.executor.deleteRecoveryPoint(point);
    }

    await this.mutate((current) => ({ ...current, recoveryPoints: retained }));
  }

  private async mutate(update: (state: PersistedUpdateState) => PersistedUpdateState): Promise<void> {
    let release: (() => void) | undefined;
    const previous = this.mutationTail;
    this.mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;

    try {
      const current = await this.options.store.read();
      await this.options.store.write(update(current));
    } finally {
      release?.();
    }
  }
}

function check(id: string, label: string, passed: boolean, detail: string) {
  return {
    id,
    label,
    status: passed ? "pass" as const : "fail" as const,
    detail,
    blocking: true
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyError(error: unknown): string {
  return errorMessage(error).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "update_failed";
}
