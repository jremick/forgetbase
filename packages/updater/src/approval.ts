import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { updateApprovalDescriptorSchema, updateJobSchema, type UpdateJob } from "@forgetbase/schema";
import { canonicalJson } from "./manifest.js";

export type HostDecision = {
  schemaVersion: "1";
  installationId: string;
  jobId: string;
  requestDigest: string;
  expiresAt: string;
  decision: "approved" | "denied";
  decidedAt: string;
};

export function approvalDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Files in this directory are writable only by the host service/operator account. */
export class HostApprovalAuthority {
  readonly directory: string;
  private readonly stateDir: string;

  constructor(stateDir: string) {
    this.stateDir = resolve(stateDir);
    this.directory = join(this.stateDir, "host-approvals");
  }

  async initialize(): Promise<string> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await privateDirectory(this.stateDir);
    let created = false;
    try { await mkdir(this.directory, { mode: 0o700 }); created = true; }
    catch (error) { if (!hasCode(error, "EEXIST")) throw error; }
    await privateDirectory(this.directory);
    if (created) {
      await publishExclusive(join(this.directory, "installation-id"), `${randomUUID()}\n`);
      await mkdir(join(this.directory, "decisions"), { mode: 0o700 });
      await mkdir(join(this.directory, "consumed"), { mode: 0o700 });
    }
    // An existing but incomplete authority is never silently regenerated.
    return this.installationId();
  }

  async installationId(): Promise<string> {
    await this.checkDirectories();
    const id = (await readPrivateFile(join(this.directory, "installation-id"))).trim();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) {
      throw new Error("Invalid host installation identity");
    }
    return id;
  }

  async validate(job: UpdateJob): Promise<NonNullable<UpdateJob["approval"]>> {
    if (!job.approval) throw new Error("Job has no host approval descriptor");
    const approval = job.approval;
    const descriptor = updateApprovalDescriptorSchema.parse(approval.descriptor);
    if (Buffer.byteLength(canonicalJson(descriptor)) > 256 * 1024) throw new Error("Host approval descriptor exceeds 256 KiB; this signed release is too large to approve");
    if (descriptor.installationId !== await this.installationId()) throw new Error("Host approval belongs to another installation");
    if (approval.requestDigest !== approvalDigest(descriptor)) throw new Error("Host approval request digest mismatch");
    if (job.id !== descriptor.jobId || job.kind !== descriptor.kind || job.requestedAt !== descriptor.requestedAt ||
        job.scheduledFor !== descriptor.scheduledFor || job.currentVersion !== descriptor.sourceIdentity.version ||
        job.targetVersion !== descriptor.targetVersion || job.automaticRollback !== descriptor.automaticRollback ||
        job.manifestKeyId !== descriptor.manifestKeyId ||
        (job.kind === "rollback" && job.recoveryPointId !== descriptor.recoveryPoint?.id)) {
      throw new Error("Immutable host approval request changed");
    }
    if (descriptor.kind === "update" ? (
      !descriptor.release || !descriptor.manifestKeyId || descriptor.manifestDigest !== approvalDigest(descriptor.release) ||
      descriptor.release.version !== descriptor.targetVersion || descriptor.recoveryPoint !== null || descriptor.recoveryReceiptDigest !== null || descriptor.confirmDataLossAfter !== null
    ) : (
      descriptor.release !== null || descriptor.manifestDigest !== null || descriptor.manifestKeyId !== null ||
      !descriptor.recoveryPoint || !descriptor.recoveryReceiptDigest || descriptor.recoveryPoint.version !== descriptor.targetVersion ||
      descriptor.confirmDataLossAfter !== descriptor.recoveryPoint.createdAt
    )) throw new Error("Invalid host approval operation binding");
    const expectedExpiry = Date.parse(descriptor.scheduledFor ?? descriptor.requestedAt) + (descriptor.scheduledFor ? 3_600_000 : 86_400_000);
    if (Date.parse(descriptor.expiresAt) !== expectedExpiry) throw new Error("Invalid host approval expiry");
    return approval;
  }

  async decide(job: UpdateJob, expectedDigest: string, decision: "approved" | "denied"): Promise<HostDecision> {
    const approval = await this.validate(job);
    if (!["awaiting-approval", "scheduled"].includes(job.phase) || job.startedAt || approval.consumedAt || await this.consumed(job)) {
      throw new Error("Only pending unconsumed requests accept a host decision");
    }
    if (expectedDigest !== approval.requestDigest) throw new Error("Expected request digest does not match the displayed request");
    if (Date.now() >= Date.parse(approval.descriptor.expiresAt)) throw new Error("Host approval request has expired");
    const record: HostDecision = { schemaVersion: "1", installationId: approval.descriptor.installationId, jobId: job.id,
      requestDigest: approval.requestDigest, expiresAt: approval.descriptor.expiresAt, decision, decidedAt: new Date().toISOString() };
    await publishExclusive(this.path("decisions", job.id), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }

  async readDecision(job: UpdateJob): Promise<HostDecision | null> {
    const approval = await this.validate(job);
    let record: HostDecision;
    try { record = JSON.parse(await readPrivateFile(this.path("decisions", job.id))); }
    catch (error) { if (hasCode(error, "ENOENT")) return null; throw error; }
    if (record.schemaVersion !== "1" || record.installationId !== approval.descriptor.installationId || record.jobId !== job.id ||
        record.requestDigest !== approval.requestDigest || record.expiresAt !== approval.descriptor.expiresAt ||
        !["approved", "denied"].includes(record.decision) || !Number.isFinite(Date.parse(record.decidedAt)) ||
        Date.parse(record.decidedAt) >= Date.parse(record.expiresAt)) throw new Error("Host decision does not match this immutable request");
    return record;
  }

  async consumed(job: UpdateJob): Promise<boolean> {
    await this.checkDirectories();
    try {
      const record = JSON.parse(await readPrivateFile(this.path("consumed", job.id))) as HostDecision & { consumedAt: string };
      if (record.jobId !== job.id || record.requestDigest !== job.approval?.requestDigest ||
          record.installationId !== await this.installationId() || record.decision !== "approved" || !Number.isFinite(Date.parse(record.consumedAt))) {
        throw new Error("Invalid consumed host approval record");
      }
      return true;
    } catch (error) { if (hasCode(error, "ENOENT")) return false; throw error; }
  }

  async consume(job: UpdateJob): Promise<HostDecision> {
    const record = await this.readDecision(job);
    if (!record || record.decision !== "approved") throw new Error("Host approval is required before execution");
    await publishExclusive(this.path("consumed", job.id), `${JSON.stringify({ ...record, consumedAt: new Date().toISOString() }, null, 2)}\n`);
    return record;
  }

  private path(kind: "decisions" | "consumed", id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid approval job ID");
    return join(this.directory, kind, `${id}.json`);
  }

  private async checkDirectories(): Promise<void> {
    for (const directory of [this.stateDir, this.directory, join(this.directory, "decisions"), join(this.directory, "consumed")]) {
      await privateDirectory(directory);
    }
  }
}

export async function readHostApprovalJob(stateDir: string, jobId: string): Promise<UpdateJob> {
  const authority = new HostApprovalAuthority(stateDir);
  await authority.installationId();
  const ledger = JSON.parse(await readPrivateFile(join(resolve(stateDir), "state.json"), 4 * 1024 * 1024)) as { schemaVersion: string; jobs: unknown[] };
  if (ledger.schemaVersion !== "1" || !Array.isArray(ledger.jobs)) throw new Error("Invalid updater ledger");
  const jobs = ledger.jobs.map((job) => updateJobSchema.parse(job)).filter((job) => job.id === jobId);
  if (jobs.length !== 1) throw new Error("Host approval job not found or ambiguous");
  await authority.validate(jobs[0]!);
  return jobs[0]!;
}

async function privateDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid())) throw new Error("Host authority requires private owned directories without symlinks");
}

async function readPrivateFile(path: string, maxBytes = 2_000_000): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes || (info.mode & 0o077) !== 0 ||
        (process.getuid && info.uid !== process.getuid())) throw new Error("Host authority requires private owned regular files");
    return await file.readFile("utf8");
  } finally { await file.close(); }
}

async function publishExclusive(path: string, content: string): Promise<void> {
  await privateDirectory(dirname(path));
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(content, "utf8"); await file.sync(); await file.close();
    await link(temporary, path);
    const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await file.close(); await unlink(temporary).catch(() => undefined); }
}

function hasCode(error: unknown, code: string): boolean { return (error as NodeJS.ErrnoException)?.code === code; }
