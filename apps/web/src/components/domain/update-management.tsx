import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [confirmed, setConfirmed] = useState(false);
  const [rollbackConfirmed, setRollbackConfirmed] = useState(false);
  const [automaticRollback, setAutomaticRollback] = useState(true);
  const [scheduledFor, setScheduledFor] = useState("");

  const commitStatus = useCallback((nextStatus: UpdateSystemStatus) => {
    setStatus(nextStatus);
    onAvailabilityChange?.(Boolean(nextStatus.availableUpdate?.updateAvailable));
  }, [onAvailabilityChange]);

  const load = useCallback(async () => {
    const [nextIdentity, nextStatus] = await Promise.all([
      request<SystemVersionResponse>("/system/version"),
      request<UpdateSystemStatus>("/system/updates")
    ]);
    setIdentity(nextIdentity);
    commitStatus(nextStatus);
  }, [commitStatus, request]);

  useEffect(() => {
    void load().catch((loadError) => setError(messageFromError(loadError)));
  }, [load]);

  useEffect(() => {
    if (!status?.activeJob) return;
    const interval = window.setInterval(() => {
      void load().catch((loadError) => setError(messageFromError(loadError)));
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [load, status?.activeJob]);

  const release = status?.availableUpdate?.release ?? null;
  const latestJob = status?.activeJob ?? status?.jobs[0] ?? null;
  const canApply = Boolean(release && preflight?.eligible && confirmed && !status?.activeJob);
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
    void runAction(async () => {
      commitStatus(await request<UpdateSystemStatus>("/system/updates/check", { method: "POST" }));
      setPreflight(null);
      setConfirmed(false);
    });
  }

  function runPreflight(): void {
    if (!release) return;
    void runAction(async () => {
      setPreflight(await request<UpdatePreflight>("/system/updates/preflight", {
        method: "POST",
        body: JSON.stringify({ version: release.version })
      }));
      setConfirmed(false);
    });
  }

  function applyUpdate(): void {
    if (!release || !canApply) return;
    void runAction(async () => {
      const scheduledIso = scheduledFor ? new Date(scheduledFor).toISOString() : null;
      await request<UpdateJob>("/system/updates/jobs", {
        method: "POST",
        body: JSON.stringify({ version: release.version, scheduledFor: scheduledIso, automaticRollback })
      });
      setConfirmed(false);
      commitStatus(await request<UpdateSystemStatus>("/system/updates"));
    });
  }

  function cancelJob(jobId: string): void {
    void runAction(async () => {
      await request<UpdateJob>(`/system/updates/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      commitStatus(await request<UpdateSystemStatus>("/system/updates"));
    });
  }

  function rollback(recoveryPointId: string, createdAt: string): void {
    if (!rollbackConfirmed) return;
    void runAction(async () => {
      await request<UpdateJob>("/system/updates/rollback", {
        method: "POST",
        body: JSON.stringify({ recoveryPointId, confirmDataLossAfter: createdAt })
      });
      setRollbackConfirmed(false);
      commitStatus(await request<UpdateSystemStatus>("/system/updates"));
    });
  }

  return (
    <div className="grid gap-4">
      {error ? <StatusAlert status="error" title="Update operation failed" description={error} /> : null}
      <SectionCard
        title="Version and update channel"
        description="Release identity comes from the installed bundle. The updater never accepts an arbitrary image or command from this page."
        variant="tool"
        actions={<Button type="button" disabled={busy} onClick={checkForUpdates}>Check for updates</Button>}
      >
        <DefinitionGrid compact items={[
          { term: "Installed version", description: identity?.version ?? status?.identity.version ?? "loading" },
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

      {release && status?.availableUpdate?.updateAvailable ? (
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
              <Button type="button" disabled={busy || Boolean(status.activeJob)} onClick={runPreflight}>Run preflight</Button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <StatusAlert
          status={status?.feedStatus === "unreachable" || status?.feedStatus === "invalid" ? "warning" : "success"}
          title={status?.feedStatus === "unreachable" ? "Update feed unavailable" : status?.feedStatus === "invalid" ? "Update feed rejected" : "No newer update selected"}
          description={status?.feedStatus === "invalid" ? "ForgetBase rejected the release metadata or signature and kept the current installation unchanged." : "The running installation remains unchanged."}
        />
      )}

      {preflight ? (
        <SectionCard
          title="Preflight"
          description={preflight.eligible ? "All blocking checks passed." : "Resolve the failed checks before updating."}
          variant="tool"
        >
          <div className="grid gap-4">
            <Table>
              <TableHeader><TableRow><TableHead>Check</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
              <TableBody>
                {preflight.checks.map((check) => (
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
              <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
            </label>
            <label className="checkbox-row">
              <Checkbox checked={automaticRollback} onCheckedChange={(value) => setAutomaticRollback(value === true)} />
              <span>Automatically restore the verified recovery point if failure occurs before writes reopen.</span>
            </label>
            <label className="checkbox-row">
              <Checkbox checked={confirmed} disabled={!preflight.eligible} onCheckedChange={(value) => setConfirmed(value === true)} />
              <span>I reviewed the release notes, downtime, migration, backup, and rollback plan for {preflight.targetVersion}.</span>
            </label>
            <Button type="button" disabled={busy || !canApply} onClick={applyUpdate}>{scheduledFor ? "Schedule update" : "Update now"}</Button>
          </div>
        </SectionCard>
      ) : null}

      {latestJob ? (
        <SectionCard
          title={`${latestJob.kind === "rollback" ? "Rollback" : "Update"} ${latestJob.phase}`}
          description={latestJob.message}
          variant="tool"
          actions={new Set(["queued", "scheduled"]).has(latestJob.phase)
            ? <Button type="button" disabled={busy} onClick={() => cancelJob(latestJob.id)}>Cancel</Button>
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

      <SectionCard title="History and recovery" description="Recovery metadata is stored outside the application database." variant="tool">
        <div className="grid gap-4">
          <label className="checkbox-row">
            <Checkbox checked={rollbackConfirmed} onCheckedChange={(value) => setRollbackConfirmed(value === true)} />
            <span>I understand that restoring this recovery set can discard database writes and attachment changes made after its timestamp.</span>
          </label>
          <Table>
            <TableHeader><TableRow><TableHead>Created</TableHead><TableHead>Version</TableHead><TableHead>Schema</TableHead><TableHead>State</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {(status?.recoveryPoints ?? []).map((point) => (
                <TableRow key={point.id}>
                  <TableCell>{formatDate(point.createdAt)}</TableCell>
                  <TableCell>{point.version}</TableCell>
                  <TableCell>{point.databaseSchemaVersion ?? "unknown"}</TableCell>
                  <TableCell><Badge variant={point.verified ? "success" : "destructive"}>{point.verified ? "verified" : "unverified"}</Badge></TableCell>
                  <TableCell><Button type="button" disabled={busy || !rollbackConfirmed || !point.verified || Boolean(status?.activeJob)} onClick={() => rollback(point.id, point.createdAt)}>Rollback</Button></TableCell>
                </TableRow>
              ))}
              {!status?.recoveryPoints.length ? <TableRow><TableCell colSpan={5}>No recovery points have been created.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
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
