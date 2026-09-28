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
import { approvalDigest, HostApprovalAuthority } from "./approval.js";

const activePhases = new Set<UpdateJobPhase>([
  "awaiting-approval",
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
  recoveryReceiptDigest(point: RecoveryPoint): Promise<string>;
  probe(manifest: ReleaseManifest): Promise<UpdateSystemProbe>;
  createRecoveryPoint(input: { identity: ProductIdentity; manifest: ReleaseManifest }): Promise<RecoveryPoint>;
  stage(manifest: ReleaseManifest): Promise<void>;
  enterMaintenance(): Promise<void>;
  resumeCurrent(): Promise<void>;
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
  private tickTail: Promise<void> = Promise.resolve();
  private readonly authority: HostApprovalAuthority;

  constructor(private readonly options: UpdateManagerOptions) {
    this.identity = productIdentitySchema.parse(options.identity);
    this.authority = new HostApprovalAuthority(options.store.directory);
  }

  /** Call once under the service's exclusive process lock, before accepting work. */
  async reconcileInterruptedJobs(): Promise<void> {
    if (this.runningJobs.size) throw new Error("Cannot reconcile while an updater operation is running");
    await this.mutate(async (state) => {
      const active = state.jobs.filter((job) => activePhases.has(job.phase));
      return {
        ...state,
        jobs: await Promise.all(state.jobs.map(async (job) => {
          if (!activePhases.has(job.phase)) return job;
          if (active.length === 1 && ["awaiting-approval", "scheduled"].includes(job.phase) && job.approval && !job.startedAt && !job.writesReopened) {
            try {
              await this.authority.validate(job);
              if (job.approval.consumedAt || await this.authority.consumed(job)) {
                return { ...job, phase: "needs-attention" as const, completedAt: this.now().toISOString(), errorCode: "approval_consumption_interrupted", message: "Host approval was consumed before interruption; execution was not replayed" };
              }
              if (this.now().getTime() >= Date.parse(job.approval.descriptor.expiresAt)) {
                return { ...job, phase: "expired" as const, completedAt: this.now().toISOString(), message: "Host approval request expired before execution" };
              }
              return job;
            } catch { /* Invalid or missing authority remains quarantined below. */ }
          }
          const mayHaveMutated = !["queued", "scheduled", "preflight", "staging"].includes(job.phase);
          const recovery = job.recoveryPointId
            ? `Inspect the installation and recovery point ${job.recoveryPointId}; explicitly confirm any manual restore and possible data loss.`
            : "Inspect the installation, maintenance state, and host recovery files before submitting a new operation.";
          return updateJobSchema.parse({
            ...job,
            phase: "needs-attention",
            completedAt: this.now().toISOString(),
            writesReopened: job.writesReopened || mayHaveMutated,
            errorCode: "updater_interrupted",
            message: `Updater interrupted during ${job.phase}; no operation was replayed. ${recovery}`
          });
        }))
      };
    });
  }

  async status(): Promise<UpdateSystemStatus> {
    const state = await this.options.store.read();
    return updateSystemStatusSchema.parse({
      hostApprovalRequired: true,
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

  async preflight(version?: string, currentJobId?: string, approvedManifest?: ReleaseManifest): Promise<UpdatePreflight> {
    const state = await this.options.store.read();
    const manifest = approvedManifest ?? (await this.requireAvailableRelease(version)).envelope.manifest;
    const probe = await this.options.executor.probe(manifest);
    const checks = [
      check("updates-enabled", "Updates enabled", this.enabled, "Managed updates and a separate host approval are required before execution"),
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
        manifest.recovery.components.includes("attachments") &&
          manifest.recovery.attachmentMode === "included" &&
          probe.attachmentSnapshotAvailable,
        manifest.recovery.attachmentMode === "not-configured"
          ? "Managed releases must include attachment recovery"
          : manifest.recovery.attachmentMode === "external-snapshot-required"
            ? "Managed Compose updates require an included attachment recovery set"
          : probe.details.attachments ?? `Attachment recovery mode: ${manifest.recovery.attachmentMode}`
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
    this.assertManagedMutation();
    this.identity = productIdentitySchema.parse(await this.options.executor.refreshIdentity());
    this.assertManagedMutation();
    await this.authority.initialize();
    if (!this.options.feedUrl || !this.options.publicKeys?.size) throw new Error("A verified signed feed is required for an update request");
    await this.checkForUpdates();

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
      phase: "awaiting-approval",
      requestedAt: this.now().toISOString(),
      scheduledFor,
      startedAt: null,
      completedAt: null,
      currentVersion: this.identity.version,
      targetVersion: manifest.version,
      manifestKeyId: state.availableUpdate?.manifestKeyId ?? null,
      recoveryPointId: null,
      progressPercent: 0,
      message: "Awaiting a separate host operator approval",
      errorCode: null,
      automaticRollback: parsed.automaticRollback,
      writesReopened: false
    });
    job.approval = await this.approvalFor(job, manifest, null, null, null);
    await this.authority.validate(job);

    await this.mutate((current) => {
      this.assertNoActiveJob(current);
      if (current.feedStatus !== "available" || current.availableUpdate?.release?.version !== manifest.version) {
        throw new Error("Selected release is no longer verified and available");
      }
      return { ...current, jobs: [job, ...current.jobs].slice(0, 200) };
    });

    return job;
  }

  async rollback(input: UpdateRollbackInput): Promise<UpdateJob> {
    const parsed = updateRollbackInputSchema.parse(input);
    this.assertManagedMutation();
    this.identity = productIdentitySchema.parse(await this.options.executor.refreshIdentity());
    this.assertManagedMutation();
    await this.authority.initialize();
    const state = await this.options.store.read();
    if (state.jobs.some((job) => activePhases.has(job.phase))) {
      throw new Error("Another update operation is already active");
    }

    const point = state.recoveryPoints.find((candidate) => candidate.id === parsed.recoveryPointId);
    if (!point?.verified) {
      throw new Error("Recovery point is unavailable or unverified");
    }

    if (parsed.confirmDataLossAfter !== point.createdAt) {
      throw new Error("Rollback may discard post-update writes; explicit data-loss confirmation is required");
    }

    const job = updateJobSchema.parse({
      id: `rollback_${randomUUID()}`,
      kind: "rollback",
      phase: "awaiting-approval",
      requestedAt: this.now().toISOString(),
      scheduledFor: null,
      startedAt: null,
      completedAt: null,
      currentVersion: this.identity.version,
      targetVersion: point.version,
      manifestKeyId: null,
      recoveryPointId: point.id,
      progressPercent: 0,
      message: "Awaiting a separate host operator approval for this recovery timestamp",
      errorCode: null,
      automaticRollback: false,
      writesReopened: false
    });
    const receiptDigest = await this.options.executor.recoveryReceiptDigest(point);
    job.approval = await this.approvalFor(job, null, point, receiptDigest, parsed.confirmDataLossAfter);
    await this.authority.validate(job);

    await this.mutate((current) => {
      this.assertNoActiveJob(current);
      if (!current.recoveryPoints.some((candidate) => candidate.id === point.id && candidate.verified)) {
        throw new Error("Recovery point is unavailable or unverified");
      }
      return { ...current, jobs: [job, ...current.jobs].slice(0, 200) };
    });
    return job;
  }

  async cancel(jobId: string): Promise<UpdateJob> {
    return this.updateJob(jobId, (job) => {
      if (!new Set<UpdateJobPhase>(["awaiting-approval", "queued", "scheduled"]).has(job.phase) || job.approval?.consumedAt) {
        throw new Error("Only pending unconsumed jobs can be cancelled safely");
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
    const result = this.tickTail.then(() => this.tickPending());
    this.tickTail = result.catch(() => undefined);
    return result;
  }

  private async tickPending(): Promise<void> {
    const state = await this.options.store.read();
    for (const snapshot of state.jobs) {
      if (!["awaiting-approval", "scheduled", "queued"].includes(snapshot.phase)) continue;
      try {
        if (!snapshot.approval) {
          await this.finishPending(snapshot.id, "needs-attention", "host_approval_missing", "Legacy request has no host approval; submit a new request");
          continue;
        }
        await this.authority.validate(snapshot);
        if (snapshot.approval.consumedAt || await this.authority.consumed(snapshot)) {
          await this.finishPending(snapshot.id, "needs-attention", "approval_consumption_interrupted", "Consumed approval cannot be replayed");
          continue;
        }
        if (this.now().getTime() >= Date.parse(snapshot.approval.descriptor.expiresAt)) {
          await this.finishPending(snapshot.id, "expired", "host_approval_expired", "Host approval request expired before execution");
          continue;
        }
        const decision = await this.authority.readDecision(snapshot);
        if (!decision) continue;
        if (decision.decision === "denied") {
          await this.updateJob(snapshot.id, (job) => this.pending(job) ? {
            ...job, phase: "denied", completedAt: this.now().toISOString(), message: "Host operator denied this request",
            approval: { ...job.approval!, decision: "denied", decidedAt: decision.decidedAt }
          } : job);
          continue;
        }
        if (snapshot.scheduledFor && Date.parse(snapshot.scheduledFor) > this.now().getTime()) {
          await this.updateJob(snapshot.id, (job) => this.pending(job) ? {
            ...job, phase: "scheduled", message: `Host-approved update scheduled for ${job.scheduledFor}`,
            approval: { ...job.approval!, decision: "approved", decidedAt: decision.decidedAt }
          } : job);
          continue;
        }

        // All external checks are read-only. The final serialized claim below
        // rechecks phase, exact request, timing and the exclusive decision.
        this.assertManagedMutation();
        const descriptor = snapshot.approval.descriptor;
        const identity = productIdentitySchema.parse(await this.options.executor.refreshIdentity());
        if (approvalDigest(identity) !== approvalDigest(descriptor.sourceIdentity)) throw new Error("Installed source identity changed after the request");
        let manifest: ReleaseManifest | null = null;
        let point: RecoveryPoint | null = null;
        if (snapshot.kind === "update") {
          if (!this.options.feedUrl || !this.options.publicKeys?.size) throw new Error("Signed release verification is unavailable");
          const envelope = await fetchSignedManifest({ feedUrl: this.options.feedUrl, publicKeys: this.options.publicKeys,
            allowHttpForLocalhost: this.options.allowLocalHttpFeed, fetchImplementation: this.options.fetchImplementation });
          validateManifestImages(envelope.manifest, this.options.allowedRegistryPrefixes);
          if (envelope.keyId !== descriptor.manifestKeyId || approvalDigest(envelope.manifest) !== descriptor.manifestDigest) {
            throw new Error("Signed release or signing key changed after host approval");
          }
          manifest = envelope.manifest;
          this.identity = identity;
          const preflight = await this.preflight(manifest.version, snapshot.id, manifest);
          if (!preflight.eligible) throw new Error("Update preflight failed before host approval consumption");
        } else {
          point = (await this.options.store.read()).recoveryPoints.find((candidate) => candidate.id === snapshot.recoveryPointId) ?? null;
          if (!point || !point.verified || approvalDigest(point) !== approvalDigest(descriptor.recoveryPoint) ||
              await this.options.executor.recoveryReceiptDigest(point) !== descriptor.recoveryReceiptDigest) {
            throw new Error("Recovery point or verified receipt changed after host approval");
          }
        }

        let claimed = false;
        await this.mutate(async (current) => {
          const job = current.jobs.find((candidate) => candidate.id === snapshot.id);
          if (!job || !this.pending(job)) return current;
          await this.authority.validate(job);
          if (job.approval!.requestDigest !== snapshot.approval!.requestDigest) throw new Error("Host approval request changed during validation");
          if (this.now().getTime() >= Date.parse(job.approval!.descriptor.expiresAt)) {
            return { ...current, jobs: current.jobs.map((entry) => entry.id === job.id ? {
              ...entry, phase: "expired", completedAt: this.now().toISOString(), errorCode: "host_approval_expired", message: "Host approval expired during validation"
            } : entry) };
          }
          if (job.scheduledFor && Date.parse(job.scheduledFor) > this.now().getTime()) return current;
          if (current.jobs.some((candidate) => candidate.id !== job.id && activePhases.has(candidate.phase))) throw new Error("Another update operation is already active");
          // Exclusive durable consumption precedes the ledger claim. A crash in
          // between is detectable and must never cause an automatic replay.
          const consumed = await this.authority.consume(job);
          const claimedAt = this.now().toISOString();
          claimed = true;
          return { ...current, jobs: current.jobs.map((entry) => entry.id === job.id ? {
            ...entry, phase: "preflight", progressPercent: 5, startedAt: claimedAt, message: "Host approval consumed; validating execution preflight",
            approval: { ...entry.approval!, decision: "approved", decidedAt: consumed.decidedAt, consumedAt: claimedAt }
          } : entry) };
        });
        if (claimed) {
          this.identity = identity;
          if (manifest) this.launch(snapshot.id, manifest);
          else this.launchRollback(snapshot.id, point!);
        }
      } catch (error) {
        const consumed = await this.authority.consumed(snapshot).catch(() => false);
        await this.finishPending(snapshot.id, consumed ? "needs-attention" : "failed",
          consumed ? "approval_consumption_interrupted" : "host_approval_validation_failed", errorMessage(error));
      }
    }
  }

  private pending(job: UpdateJob): boolean {
    return ["awaiting-approval", "scheduled", "queued"].includes(job.phase) && !job.startedAt && !job.approval?.consumedAt;
  }

  private async finishPending(jobId: string, phase: "failed" | "needs-attention" | "expired", errorCode: string, message: string): Promise<void> {
    await this.updateJob(jobId, (job) => this.pending(job) ? { ...job, phase, completedAt: this.now().toISOString(), errorCode, message } : job);
  }

  private async approvalFor(job: UpdateJob, release: ReleaseManifest | null, recoveryPoint: RecoveryPoint | null,
    recoveryReceiptDigest: string | null, confirmDataLossAfter: string | null): Promise<NonNullable<UpdateJob["approval"]>> {
    const descriptor = {
      schemaVersion: "1" as const, installationId: await this.authority.installationId(), jobId: job.id, kind: job.kind,
      requestedAt: job.requestedAt, scheduledFor: job.scheduledFor,
      expiresAt: new Date(Date.parse(job.scheduledFor ?? job.requestedAt) + (job.scheduledFor ? 3_600_000 : 86_400_000)).toISOString(),
      sourceIdentity: this.identity, targetVersion: job.targetVersion, automaticRollback: job.automaticRollback,
      manifestKeyId: job.manifestKeyId, manifestDigest: release ? approvalDigest(release) : null,
      release, recoveryPoint, recoveryReceiptDigest, confirmDataLossAfter
    };
    return { descriptor, requestDigest: approvalDigest(descriptor), decision: null, decidedAt: null, consumedAt: null };
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
    let maintenanceEntered = false;

    try {
      await this.setPhase(jobId, "staging", 20, "Pulling digest-pinned release images");
      await this.options.executor.stage(manifest);
      await this.setPhase(jobId, "maintenance", 35, "Entering maintenance mode and stopping writers");
      maintenanceEntered = true;
      await this.options.executor.enterMaintenance();

      await this.setPhase(jobId, "backing-up", 50, "Creating and verifying database and attachment recovery point");
      const candidatePoint = recoveryPointSchema.parse(await this.options.executor.createRecoveryPoint({ identity: this.identity, manifest }));
      if (!candidatePoint.verified) throw new Error("Recovery point verification failed");
      recoveryPoint = candidatePoint;
      await this.mutate((state) => ({ ...state, recoveryPoints: [recoveryPoint!, ...state.recoveryPoints] }));
      await this.updateJob(jobId, (job) => ({ ...job, recoveryPointId: recoveryPoint?.id ?? null }));

      await this.setPhase(jobId, "migrating", 60, "Applying the verified migration set");
      await this.options.executor.migrate(manifest);
      await this.setPhase(jobId, "starting", 75, "Starting candidate application services");
      await this.options.executor.startCandidate(manifest);
      await this.setPhase(jobId, "verifying", 88, "Verifying candidate health and schema identity");
      await this.options.executor.verifyCandidate(manifest);
      await this.updateJob(jobId, (job) => ({ ...job, writesReopened: true }));
      await this.options.executor.reopenWrites(manifest);
      maintenanceEntered = false;
      this.identity = productIdentitySchema.parse(await this.options.executor.refreshIdentity());
      await this.pruneRecoveryPoints();
      await this.updateJob(jobId, (job) => ({
        ...job,
        phase: "completed",
        progressPercent: 100,
        completedAt: this.now().toISOString(),
        message: `Updated to ${manifest.version}`,
        writesReopened: true
      }));
    } catch (error) {
      const message = errorMessage(error);
      const job = (await this.options.store.read()).jobs.find((candidate) => candidate.id === jobId);

      if (maintenanceEntered && !recoveryPoint) {
        try {
          await this.updateJob(jobId, (current) => ({ ...current, writesReopened: true }));
          await this.options.executor.resumeCurrent();
          maintenanceEntered = false;
          await this.failJob(jobId, classifyError(error), `${message}; current release resumed`);
        } catch (resumeError) {
          await this.updateJob(jobId, (current) => ({
            ...current,
            phase: "needs-attention",
            completedAt: this.now().toISOString(),
            message: `Update failed before recovery completed (${message}); current release also failed to resume (${errorMessage(resumeError)})`,
            errorCode: "current_release_resume_failed"
          }));
        }
        return;
      }

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
          await this.updateJob(jobId, (current) => ({ ...current, writesReopened: true }));
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

      if (job?.writesReopened) {
        await this.updateJob(jobId, (current) => ({
          ...current,
          phase: "needs-attention",
          completedAt: this.now().toISOString(),
          errorCode: classifyError(error),
          message: `Update failed after writes may have reopened (${message}); inspect the running release before an explicitly confirmed manual recovery`
        }));
      } else {
        await this.failJob(jobId, classifyError(error), message);
      }
    }
  }

  private async executeRollback(jobId: string, point: RecoveryPoint): Promise<void> {
    try {
      await this.setPhase(jobId, "maintenance", 20, "Stopping writers before rollback");
      await this.options.executor.enterMaintenance();
      await this.setPhase(jobId, "rolling-back", 55, `Restoring recovery point ${point.id}`, { writesReopened: true });
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

  private assertNoActiveJob(state: PersistedUpdateState): void {
    if (state.jobs.some((job) => activePhases.has(job.phase))) throw new Error("Another update operation is already active");
  }

  private assertManagedMutation(): void {
    if (!this.enabled || this.identity.installationMode !== "managed") {
      throw new Error("An enabled managed installation is required for update operations");
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

  private async mutate(update: (state: PersistedUpdateState) => PersistedUpdateState | Promise<PersistedUpdateState>): Promise<void> {
    let release: (() => void) | undefined;
    const previous = this.mutationTail;
    this.mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;

    try {
      const current = await this.options.store.read();
      await this.options.store.write(await update(current));
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
