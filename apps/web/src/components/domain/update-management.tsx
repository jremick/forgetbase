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

const terminalPhases = new Set(["completed", "failed", "rolled-back", "cancelled", "needs-attention"]);

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
  const latestJob = status?.activeJob ?? status?.jobs[0] ?? null;
  const canCheck = Boolean(identity?.updateManagement.authorized && identity.updateManagement.configured &&
    identity.installationMode !== "hosted");
  const managed = Boolean(canCheck && identity?.installationMode === "managed" &&
    identity.updateManagement.mode === "self-managed" && status?.enabled && status.identity.installationMode === "managed");
  const canMutate = managed && !busy && !awaitingStatus && !connectionError && !status?.activeJob;
  const currentPreflight = preflight && release && preflight.targetVersion === release.version &&
    preflight.currentVersion === status?.identity.version ? preflight : null;
  const canApply = Boolean(canMutate && status?.availableUpdate?.updateAvailable && release &&
    currentPreflight?.eligible && confirmedVersion === release.version);
  const selectedRecovery = status?.recoveryPoints.find((point) => point.id === selectedRecoveryId) ?? null;
  const selectedRecoveryKey = selectedRecovery ? `${selectedRecovery.id}:${selectedRecovery.createdAt}` : null;

  useEffect(() => {
    setPreflight(null);
    setConfirmedVersion(null);
  }, [release?.version, release?.sourceRevision, status?.identity.version]);
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

  function applyUpdate(): void {
    if (!release || !canApply) return;
    void runAction(async () => {
      const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
      if (scheduledDate && (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) {
        throw new Error("Choose a future maintenance time, or clear it to update now.");
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
      {connectionError ? <StatusAlert status="warning" title="Reconnecting to update status" description="Application services may be restarting. This page will retry automatically. Update and rollback controls remain disabled until status is available." /> : null}
      {identity && !identity.updateManagement.authorized ? <StatusAlert status="warning" title="Deployment owner access required" description="Only a configured deployment owner can view update controls." /> : null}
      {identity?.installationMode === "hosted" ? <StatusAlert status="info" title="Platform-managed updates" description="Your hosting platform manages updates and recovery for this installation." /> : null}
      {identity?.installationMode === "source" ? <StatusAlert status="info" title="Source installation" description="Release information is advisory. Use your source deployment and rollback procedure to change this installation." /> : null}
      {identity?.updateManagement.authorized && !identity.updateManagement.configured && identity.installationMode !== "hosted" ? <StatusAlert status="warning" title="Updater not configured" description="The deployment owner must configure the host updater before managed update controls are available." /> : null}
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
          description={currentPreflight.eligible ? "All blocking checks passed." : "Resolve the failed checks before updating."}
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
              <span>I approve {scheduledFor ? "scheduling" : "installing"} version {currentPreflight.targetVersion} and have reviewed its release notes, downtime, migration, backup, and rollback plan.</span>
            </label>
            <Button type="button" disabled={!canApply} onClick={applyUpdate}>{scheduledFor ? "Schedule update" : "Update now"}</Button>
          </div>
        </SectionCard>
      ) : null}

      {canCheck && latestJob ? (
        <SectionCard
          title={`${latestJob.kind === "rollback" ? "Rollback" : "Update"} ${latestJob.phase}`}
          description={latestJob.message}
          variant="tool"
          actions={managed && new Set(["queued", "scheduled"]).has(latestJob.phase)
            ? <Button type="button" disabled={busy || awaitingStatus || Boolean(connectionError)} onClick={() => cancelJob(latestJob.id)}>Cancel</Button>
            : undefined}
        >
          <div className="grid gap-3">
            <Progress value={latestJob.progressPercent} aria-label="Update progress" />
            <DefinitionGrid compact items={[
              { term: "From", description: latestJob.currentVersion },
              { term: "Target", description: latestJob.targetVersion },
              { term: "Requested", description: formatDate(latestJob.requestedAt) },
              { term: "Scheduled", description: formatDate(latestJob.scheduledFor) },
              { term: "Recovery point", description: latestJob.recoveryPointId ?? "not created" },
              { term: "Writes reopened", description: latestJob.writesReopened ? "yes" : "no" }
            ]} />
            {!terminalPhases.has(latestJob.phase) ? <p>The page reconnects automatically while application services restart.</p> : null}
          </div>
        </SectionCard>
      ) : null}

      {managed ? <SectionCard title="History and recovery" description="Choose a verified recovery point and confirm the data-loss warning before restoring it." variant="tool">
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
                <span>I approve restoring version {selectedRecovery.version} from {formatDate(selectedRecovery.createdAt)} and losing any database writes and attachment changes made after that recovery point.</span>
              </label>
              <Button type="button" disabled={!canMutate || !selectedRecovery.verified || rollbackConfirmation !== selectedRecoveryKey} onClick={rollback}>Restore version {selectedRecovery.version}</Button>
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
                  <TableCell><p>{job.phase}</p><p>{job.message}</p></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : null}
        </div>
      </SectionCard> : null}
    </div>
  );
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
