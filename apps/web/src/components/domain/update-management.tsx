import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SystemVersionResponse,
  UpdateJob,
  UpdatePreflight,
  UpdateSystemStatus
} from "@forgetbase/schema";
import type { AppRequest } from "../../lib/app-api.js";
import { DefinitionGrid } from "../app/definition-grid.js";
import { SectionCard } from "../app/section-card.js";
import { StatusAlert } from "../app/status-alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { Progress } from "../ui/progress.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../ui/table.js";

export interface UpdateManagementPanelProps {
  request: AppRequest;
  onAvailabilityChange?: (available: boolean) => void;
}

const terminalPhases = new Set(["completed", "failed", "rolled-back", "cancelled", "denied", "expired", "needs-attention"]);
const cancellablePhases = new Set(["awaiting-approval", "queued", "scheduled"]);

export function UpdateManagementPanel({ request, onAvailabilityChange }: UpdateManagementPanelProps) {
  const [identity, setIdentity] = useState<SystemVersionResponse | null>(null);
  const [status, setStatus] = useState<UpdateSystemStatus | null>(null);
  const [preflight, setPreflight] = useState<UpdatePreflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [awaitingStatus, setAwaitingStatus] = useState(false);
  const [confirmedVersion, setConfirmedVersion] = useState<string | null>(null);
  const [selectedRecoveryId, setSelectedRecoveryId] = useState<string | null>(null);
  const [rollbackConfirmation, setRollbackConfirmation] = useState<string | null>(null);
  const [automaticRollback, setAutomaticRollback] = useState(true);
  const [scheduledFor, setScheduledFor] = useState("");
  const requestRef = useRef(request);
  const loadSequence = useRef(0);
  const mutationPending = useRef(false);

  useEffect(() => { requestRef.current = request; }, [request]);

  const commitStatus = useCallback((nextStatus: UpdateSystemStatus) => {
    setStatus(nextStatus);
    onAvailabilityChange?.(Boolean(nextStatus.availableUpdate?.updateAvailable));
  }, [onAvailabilityChange]);

  const load = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    const sequence = ++loadSequence.current;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = window.setTimeout(abort, 10_000);
    try {
      const nextIdentity = await requestRef.current<SystemVersionResponse>("/system/version", { signal: controller.signal });
      if (signal?.aborted || sequence !== loadSequence.current) return true;
      setIdentity(nextIdentity);
      if (!nextIdentity.updateManagement.authorized || !nextIdentity.updateManagement.configured ||
          nextIdentity.installationMode === "hosted") {
        setStatus(null);
        onAvailabilityChange?.(false);
        setConnectionError("");
        setAwaitingStatus(false);
        return false;
      }
      const nextStatus = await requestRef.current<UpdateSystemStatus>("/system/updates", { signal: controller.signal });
      if (signal?.aborted || sequence !== loadSequence.current) return true;
      commitStatus(nextStatus);
      setConnectionError("");
      if (!mutationPending.current) setAwaitingStatus(false);
      return Boolean(nextStatus.activeJob);
    } catch (loadError) {
      if (!signal?.aborted && sequence === loadSequence.current) setConnectionError(messageFromError(loadError));
      return true;
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }, [commitStatus, onAvailabilityChange]);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: number | undefined;
    const poll = async () => {
      const retrySoon = await load(controller.signal);
      if (!controller.signal.aborted) timeout = window.setTimeout(() => void poll(), retrySoon ? 2_000 : 15_000);
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [load]);

  const release = status?.availableUpdate?.release ?? null;
  const releaseKey = release ? JSON.stringify(release) : null;
  const latestJob = status?.activeJob ?? status?.jobs[0] ?? null;
  const canCheck = Boolean(identity?.updateManagement.authorized && identity.updateManagement.configured &&
    identity.installationMode !== "hosted");
  const managed = Boolean(canCheck && identity?.installationMode === "managed" &&
    identity.updateManagement.mode === "self-managed" && status?.enabled && status.identity.installationMode === "managed" &&
    status.hostApprovalRequired === true);
  const canMutate = managed && !busy && !awaitingStatus && !connectionError && !status?.activeJob;
  const currentPreflight = preflight && release && preflight.targetVersion === release.version &&
    preflight.currentVersion === status?.identity.version ? preflight : null;
  const canRequestUpdate = Boolean(canMutate && status?.availableUpdate?.updateAvailable && release &&
    currentPreflight?.eligible && confirmedVersion === release.version);
  const selectedRecovery = status?.recoveryPoints.find((point) => point.id === selectedRecoveryId) ?? null;
  const selectedRecoveryKey = selectedRecovery ? `${selectedRecovery.id}:${selectedRecovery.createdAt}` : null;

  useEffect(() => {
    setPreflight(null);
    setConfirmedVersion(null);
    setRollbackConfirmation(null);
  }, [releaseKey, status?.identity.version, status?.hostApprovalRequired]);
  const notes = useMemo(() => {
    if (!release) return [];
    const sections: Array<[string, string[]]> = [
      ["Highlights", release.notes.highlights],
      ["Security", release.notes.security],
      ["Breaking changes", release.notes.breaking],
      ["Configuration", release.notes.configuration],
      ["Known issues", release.notes.knownIssues]
    ];
    return sections.filter(([, items]) => items.length > 0);
  }, [release]);

  async function runAction(action: () => Promise<void>): Promise<void> {
    if (mutationPending.current) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(messageFromError(actionError));
    } finally {
      setBusy(false);
    }
  }

  function checkForUpdates(): void {
    if (!canCheck || busy || awaitingStatus) return;
    setPreflight(null);
    setConfirmedVersion(null);
    void runAction(async () => {
      commitStatus(await request<UpdateSystemStatus>("/system/updates/check", { method: "POST" }));
      await load();
    });
  }

  function runPreflight(): void {
    if (!release || !canMutate) return;
    setPreflight(null);
    setConfirmedVersion(null);
    void runAction(async () => {
      setPreflight(await request<UpdatePreflight>("/system/updates/preflight", {
        method: "POST",
        body: JSON.stringify({ version: release.version })
      }));
    });
  }

  async function runMutation(path: string, body?: unknown): Promise<void> {
    mutationPending.current = true;
    setAwaitingStatus(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    // Ignore status requests that started before this mutation was submitted.
    loadSequence.current += 1;
    try {
      const job = await request<UpdateJob>(path, {
        method: "POST", signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      setStatus((previous) => previous ? {
        ...previous,
        activeJob: terminalPhases.has(job.phase) ? null : job,
        jobs: [job, ...previous.jobs.filter((existing) => existing.id !== job.id)]
      } : previous);
    } finally {
      window.clearTimeout(timeout);
      mutationPending.current = false;
      // Reconcile even when the response is lost. Never repeat a mutation to reconnect.
      await load();
    }
  }

  function requestUpdate(): void {
    if (!release || !canRequestUpdate) return;
    void runAction(async () => {
      const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
      if (scheduledDate && (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) {
        throw new Error("Choose a future maintenance time, or clear it to request an update after host approval.");
      }
      setConfirmedVersion(null);
      setPreflight(null);
      await runMutation("/system/updates/jobs", {
        version: release.version, scheduledFor: scheduledDate?.toISOString() ?? null, automaticRollback
      });
    });
  }

  function cancelJob(jobId: string): void {
    if (!managed || busy || awaitingStatus || connectionError) return;
    void runAction(async () => {
      await runMutation(`/system/updates/jobs/${encodeURIComponent(jobId)}/cancel`);
    });
  }

  function rollback(): void {
    if (!canMutate || !selectedRecovery?.verified || rollbackConfirmation !== selectedRecoveryKey) return;
    void runAction(async () => {
      setRollbackConfirmation(null);
      await runMutation("/system/updates/rollback", {
        recoveryPointId: selectedRecovery.id, confirmDataLossAfter: selectedRecovery.createdAt
      });
    });
  }

  return (
    <div className="grid gap-4">
      {error ? <StatusAlert status="error" title="Update request needs attention" description={error} /> : null}
      {connectionError ? <StatusAlert status="warning" title="Reconnecting to update status" description="Application services may be restarting. This page will retry automatically. Request controls remain disabled until status is available." /> : null}
      {identity && !identity.updateManagement.authorized ? <StatusAlert status="warning" title="Deployment owner access required" description="Only a configured deployment owner can view update controls." /> : null}
      {identity?.installationMode === "hosted" ? <StatusAlert status="info" title="Platform-managed updates" description="Your hosting platform manages updates and recovery for this installation." /> : null}
      {identity?.installationMode === "source" ? <StatusAlert status="info" title="Source installation" description="Release information is advisory. Use your source deployment and rollback procedure to change this installation." /> : null}
      {identity?.updateManagement.authorized && !identity.updateManagement.configured && identity.installationMode !== "hosted" ? <StatusAlert status="warning" title="Updater not configured" description="The deployment owner must configure the host updater before managed update controls are available." /> : null}
      {canCheck && identity?.installationMode === "managed" && status && status.hostApprovalRequired !== true ? <StatusAlert status="warning" title="Host updater upgrade required" description="This host updater has not confirmed support for separate host approval. Upgrade it on the host before requesting an update or restore. Release discovery and status remain available." /> : null}
      <SectionCard
        title="Version and update channel"
        description="Release identity comes from the installed bundle. The updater never accepts an arbitrary image or command from this page."
        variant="tool"
        actions={canCheck ? <Button type="button" disabled={busy || awaitingStatus || Boolean(connectionError) || Boolean(status?.activeJob)} onClick={checkForUpdates}>Check for updates</Button> : undefined}
      >
        <DefinitionGrid compact items={[
          { term: "Installed version", description: status?.identity.version ?? identity?.version ?? "loading" },
          { term: "Channel", description: identity?.channel ?? status?.identity.channel ?? "loading" },
          { term: "Install mode", description: identity?.installationMode ?? status?.identity.installationMode ?? "loading" },
          { term: "Build revision", description: shortRevision(identity?.sourceRevision ?? status?.identity.sourceRevision) },
          { term: "Database schema", description: identity?.databaseSchemaVersion ?? status?.identity.databaseSchemaVersion ?? "unknown" },
          { term: "Updater", description: status?.identity.updaterVersion ?? "not connected" },
          { term: "Manifest key", description: status?.availableUpdate?.manifestKeyId ?? "not checked" },
          { term: "Feed", description: <Badge variant={status?.feedStatus === "available" ? "warning" : status?.feedStatus === "current" ? "success" : "neutral"}>{status?.feedStatus ?? "loading"}</Badge> },
          { term: "Last checked", description: formatDate(status?.lastCheckedAt) }
        ]} />
      </SectionCard>

      {canCheck && release && status?.availableUpdate?.updateAvailable ? (
        <SectionCard
          title={`Update ${release.version}`}
          description={release.notes.summary}
          variant="tool"
          actions={<Badge variant={release.risk === "critical" || release.risk === "high" ? "destructive" : "warning"}>{release.risk} risk</Badge>}
        >
          <div className="grid gap-4">
            <DefinitionGrid compact items={[
              { term: "Published", description: formatDate(release.publishedAt) },
              { term: "Downtime estimate", description: `${release.estimatedDowntimeSeconds} seconds` },
              { term: "Migration", description: release.migration.compatibility },
              { term: "Rollback", description: release.rollbackMode },
              { term: "Backup", description: release.requiresBackup ? "required" : "not required" },
              { term: "Recovery coverage", description: release.recovery.components.join(", ") }
            ]} />
            {notes.map(([title, items]) => (
              <div key={title} className="grid gap-1">
                <strong>{title}</strong>
                <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ))}
            <div className="toolbar-row">
              {managed ? <Button type="button" disabled={!canMutate} onClick={runPreflight}>Run preflight</Button> : null}
            </div>
          </div>
        </SectionCard>
      ) : canCheck && status ? (
        <StatusAlert
          status={status?.feedStatus === "unreachable" || status?.feedStatus === "invalid" ? "warning" : "success"}
          title={status?.feedStatus === "unreachable" ? "Update feed unavailable" : status?.feedStatus === "invalid" ? "Update feed rejected" : "No newer update selected"}
          description={status?.feedStatus === "invalid" ? "ForgetBase rejected the release metadata or signature and kept the current installation unchanged." : "The running installation remains unchanged."}
        />
      ) : null}

      {managed && currentPreflight ? (
        <SectionCard
          title={`Preflight for ${currentPreflight.targetVersion}`}
          description={currentPreflight.eligible ? "All blocking checks passed. Submit a request, then ask the host operator to review and approve it." : "Resolve the failed checks before requesting an update."}
          variant="tool"
        >
          <div className="grid gap-4">
            <Table>
              <TableHeader><TableRow><TableHead>Check</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
              <TableBody>
                {currentPreflight.checks.map((check) => (
                  <TableRow key={check.id}>
                    <TableCell>{check.label}</TableCell>
                    <TableCell><Badge variant={check.status === "pass" ? "success" : check.status === "warning" ? "warning" : "destructive"}>{check.status}</Badge></TableCell>
                    <TableCell>{check.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <label className="field-row">
              <span>Maintenance window in your local time (optional)</span>
              <input type="datetime-local" value={scheduledFor} disabled={!canMutate} onChange={(event) => { setScheduledFor(event.target.value); setConfirmedVersion(null); }} />
            </label>
            <label className="checkbox-row">
              <Checkbox checked={automaticRollback} disabled={!canMutate} onCheckedChange={(value) => { setAutomaticRollback(value === true); setConfirmedVersion(null); }} />
              <span>Automatically restore the verified recovery point if failure occurs before writes reopen.</span>
            </label>
            <label className="checkbox-row">
              <Checkbox checked={confirmedVersion === currentPreflight.targetVersion} disabled={!canMutate || !currentPreflight.eligible} onCheckedChange={(value) => setConfirmedVersion(value === true ? currentPreflight.targetVersion : null)} />
              <span>I request {scheduledFor ? "a scheduled update to" : "version"} {currentPreflight.targetVersion} and have reviewed its release notes, downtime, migration, backup, and rollback plan. A host operator must approve this exact request before it can run.</span>
            </label>
            <Button type="button" disabled={!canRequestUpdate} onClick={requestUpdate}>{scheduledFor ? "Request scheduled update" : "Request update"}</Button>
          </div>
        </SectionCard>
      ) : null}

      {canCheck && latestJob ? (
        <UpdateJobCard job={latestJob} canCancel={managed} cancelDisabled={busy || awaitingStatus || Boolean(connectionError)} onCancel={cancelJob} />
      ) : null}

      {managed ? <SectionCard title="History and recovery" description="Choose a verified recovery point and confirm the data-loss warning to request a restore. The host operator must separately approve the request." variant="tool">
        <div className="grid gap-4">
          <Table>
            <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Version</TableHead><TableHead>Schema</TableHead><TableHead>State</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {(status?.recoveryPoints ?? []).map((point) => (
                <TableRow key={point.id}>
                  <TableCell>{formatDate(point.createdAt)}</TableCell>
                  <TableCell>{point.version}</TableCell>
                  <TableCell>{point.databaseSchemaVersion ?? "unknown"}</TableCell>
                  <TableCell><Badge variant={point.verified ? "success" : "destructive"}>{point.verified ? "verified" : "unverified"}</Badge></TableCell>
                  <TableCell><Button type="button" disabled={!canMutate || !point.verified} aria-pressed={selectedRecoveryId === point.id} onClick={() => { setSelectedRecoveryId(point.id); setRollbackConfirmation(null); }}>Select rollback</Button></TableCell>
                </TableRow>
              ))}
              {!status?.recoveryPoints.length ? <TableRow><TableCell colSpan={5}>No recovery points have been created.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
          {selectedRecovery ? (
            <div className="grid gap-3">
              <StatusAlert status="warning" title={`Restore version ${selectedRecovery.version}`} description={`Restoring this recovery point can discard database writes and attachment changes made after ${formatDate(selectedRecovery.createdAt)} (${selectedRecovery.createdAt}).`} />
              <label className="checkbox-row">
                <Checkbox checked={rollbackConfirmation === selectedRecoveryKey} disabled={!canMutate || !selectedRecovery.verified} onCheckedChange={(value) => setRollbackConfirmation(value === true ? selectedRecoveryKey : null)} />
                <span>I request restoring version {selectedRecovery.version} from {formatDate(selectedRecovery.createdAt)} and accept losing any database writes and attachment changes made after that recovery point. A host operator must also approve this restore.</span>
              </label>
              <Button type="button" disabled={!canMutate || !selectedRecovery.verified || rollbackConfirmation !== selectedRecoveryKey} onClick={rollback}>Request restore of version {selectedRecovery.version}</Button>
            </div>
          ) : null}
          {status?.jobs.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Requested</TableHead><TableHead>Operation</TableHead><TableHead>Target</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{status.jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>{formatDate(job.requestedAt)}</TableCell>
                  <TableCell>{job.kind}</TableCell>
                  <TableCell>{job.targetVersion}</TableCell>
                  <TableCell><p>{jobPhaseLabel(job)}</p><p>{job.message}</p></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : null}
        </div>
      </SectionCard> : null}
    </div>
  );
}

export function UpdateJobCard({ job, canCancel, cancelDisabled, onCancel }: {
  job: UpdateJob;
  canCancel: boolean;
  cancelDisabled: boolean;
  onCancel: (jobId: string) => void;
}) {
  const approval = job.approval;
  const descriptor = approval?.descriptor;
  const pending = cancellablePhases.has(job.phase);
  const awaitingApproval = pending && approval && !approval.decision;
  const release = descriptor?.release;
  const scheduledFor = descriptor ? descriptor.scheduledFor : job.scheduledFor;
  const hostCommand = `node apps/updater/dist/approval.js`;
  const hostArguments = `--state-dir '<host-state>' --job-id ${shellArgument(job.id)}`;

  return (
    <SectionCard
      title={`${job.kind === "rollback" ? "Rollback" : "Update"} request`}
      description={job.message}
      variant="tool"
      actions={canCancel && pending ? <Button type="button" disabled={cancelDisabled} onClick={() => onCancel(job.id)}>Cancel request</Button> : undefined}
    >
      <div className="grid gap-3">
        <Badge variant={job.phase === "completed" || job.phase === "rolled-back" ? "success" : terminalPhases.has(job.phase) ? "neutral" : "warning"}>{jobPhaseLabel(job)}</Badge>
        {!pending && !["denied", "expired", "cancelled"].includes(job.phase) ? <Progress value={job.progressPercent} aria-label="Update progress" /> : null}
        {release ? <p>{release.notes.summary}</p> : null}
        <DefinitionGrid compact items={[
          { term: "Request ID", description: job.id },
          { term: "Installation ID", description: descriptor?.installationId ?? "not recorded" },
          { term: "From", description: descriptor?.sourceIdentity.version ?? job.currentVersion },
          { term: "Target", description: descriptor?.targetVersion ?? job.targetVersion },
          { term: "Requested", description: formatDate(descriptor?.requestedAt ?? job.requestedAt) },
          { term: "Scheduled", description: scheduledFor ? <time dateTime={scheduledFor}>{formatDate(scheduledFor)} ({scheduledFor})</time> : "After host approval" },
          { term: "Host decision", description: approval?.decision ?? "not approved" },
          { term: "Decision recorded", description: formatDate(approval?.decidedAt) },
          { term: "Approval expiry", description: descriptor ? <time dateTime={descriptor.expiresAt}>{formatDate(descriptor.expiresAt)} ({descriptor.expiresAt})</time> : "not available" },
          { term: "Request digest", description: approval ? <code>{approval.requestDigest}</code> : "not available" },
          { term: "Manifest key", description: descriptor?.manifestKeyId ?? job.manifestKeyId ?? "not applicable" },
          { term: "Manifest digest", description: descriptor?.manifestDigest ? <code>{descriptor.manifestDigest}</code> : "not applicable" },
          { term: "Risk", description: release?.risk ?? "not applicable" },
          { term: "Downtime estimate", description: release ? `${release.estimatedDowntimeSeconds} seconds` : "not available" },
          { term: "Migration", description: release?.migration.compatibility ?? "not applicable" },
          { term: "Rollback", description: release?.rollbackMode ?? "recovery point restore" },
          { term: "Automatic recovery", description: (descriptor?.automaticRollback ?? job.automaticRollback) ? "Allowed before writes reopen" : "Disabled" },
          { term: "Recovery point", description: descriptor?.recoveryPoint?.id ?? job.recoveryPointId ?? "created after host approval" },
          { term: "Recovery receipt digest", description: descriptor?.recoveryReceiptDigest ? <code>{descriptor.recoveryReceiptDigest}</code> : "not applicable" },
          { term: "Writes reopened", description: job.writesReopened ? "yes" : "no" }
        ]} />
        {descriptor?.confirmDataLossAfter ? <StatusAlert status="warning" title="Restore data-loss consent" description={`This request can discard database writes and attachment changes made after ${formatDate(descriptor.confirmDataLossAfter)} (${descriptor.confirmDataLossAfter}). Host approval is required for this exact recovery point and timestamp.`} /> : null}
        {awaitingApproval ? (
          <div className="grid gap-2">
            <p>No host changes will start until the host operator approves this exact request. The saved request and expiry do not change when the release feed refreshes.</p>
            <p>On the updater host, replace <code>&lt;host-state&gt;</code> with its state directory. Inspect the request, verify its digest and details, then approve or deny it:</p>
            <strong>Inspect on host</strong>
            <pre className="whitespace-pre-wrap break-all"><code>{`${hostCommand} show ${hostArguments}`}</code></pre>
            <strong>Approve after review</strong>
            <pre className="whitespace-pre-wrap break-all"><code>{`${hostCommand} approve ${hostArguments} --request-digest ${shellArgument(approval.requestDigest)}`}</code></pre>
            <strong>Deny instead</strong>
            <pre className="whitespace-pre-wrap break-all"><code>{`${hostCommand} deny ${hostArguments} --request-digest ${shellArgument(approval.requestDigest)}`}</code></pre>
          </div>
        ) : pending && !approval ? <StatusAlert status="warning" title="No host approval record" description="This older request cannot run without host approval. Cancel it and create a new request for the host operator to review." /> : null}
        {pending && approval?.decision === "approved" ? <p>The host approved this exact request. It runs only while that approval remains valid; the updater rechecks the installation and release before making changes.</p> : null}
        {!pending && !terminalPhases.has(job.phase) ? <p>The page reconnects automatically while application services restart.</p> : null}
      </div>
    </SectionCard>
  );
}

function jobPhaseLabel(job: UpdateJob): string {
  if (["denied", "expired", "cancelled"].includes(job.phase)) return `Request ${job.phase}`;
  if (cancellablePhases.has(job.phase) && job.approval?.decision === "approved") {
    return job.approval.descriptor.scheduledFor ? "Host-approved · scheduled" : "Host-approved · awaiting execution";
  }
  if (job.phase === "awaiting-approval") return "Awaiting host approval";
  return job.phase.replaceAll("-", " ");
}

function shellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "not available";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function shortRevision(value: string | null | undefined): string {
  if (!value) return "unknown";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
