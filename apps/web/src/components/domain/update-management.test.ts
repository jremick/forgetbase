// Failure cases defined before the host-approval UI change: an unapproved request
// looks executable, a refreshed feed replaces the saved request, approved schedules
// look unapproved, terminal requests remain cancellable, recovery consent loses its
// exact timestamp, and host paths or executable browser approval controls leak.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UpdateJob } from "@forgetbase/schema";
import { Provider } from "../../theme/provider.js";
import { UpdateJobCard } from "./update-management.js";

const requestedAt = "2026-09-28T12:00:00.000Z";
const expiresAt = "2026-09-29T12:00:00.000Z";
const requestDigest = "a".repeat(64);
const manifestDigest = "b".repeat(64);
const recoveryDigest = "c".repeat(64);

function fixture(): UpdateJob {
  return {
    id: "update_synthetic", kind: "update", phase: "awaiting-approval", requestedAt,
    scheduledFor: null, startedAt: null, completedAt: null, currentVersion: "0.1.0",
    targetVersion: "0.1.1", manifestKeyId: "synthetic-key", recoveryPointId: null,
    progressPercent: 0, message: "Request recorded", errorCode: null,
    automaticRollback: true, writesReopened: false,
    approval: {
      requestDigest, decidedAt: null, decision: null, consumedAt: null,
      descriptor: {
        schemaVersion: "1", installationId: "11111111-1111-4111-8111-111111111111",
        jobId: "update_synthetic", kind: "update", requestedAt, scheduledFor: null, expiresAt,
        sourceIdentity: {
          product: "forgetbase", version: "0.1.0", sourceRevision: "d".repeat(40),
          builtAt: requestedAt, channel: "beta", installationMode: "managed",
          databaseSchemaVersion: "001_initial", updaterVersion: "0.1.0", updaterProtocolVersion: "1", managed: true
        },
        targetVersion: "0.1.1", automaticRollback: true, manifestKeyId: "synthetic-key", manifestDigest,
        release: {
          schemaVersion: "1", product: "forgetbase", version: "0.1.1", channel: "beta",
          publishedAt: requestedAt, sourceRevision: "e".repeat(40), minUpdaterVersion: "0.1.0",
          upgradeFrom: ["0.1.0"], risk: "high", estimatedDowntimeSeconds: 120, requiresBackup: true,
          rollbackMode: "database-restore", migration: { compatibility: "destructive", targetSchemaVersion: "002_next", migrationIds: ["002_next"] },
          recovery: { components: ["database", "configuration", "attachments"], attachmentMode: "included" },
          images: [{ component: "api", reference: `registry.example.test/api@sha256:${manifestDigest}`, digest: `sha256:${manifestDigest}` }],
          notes: { summary: "Saved release summary", highlights: [], security: [], breaking: [], configuration: [], knownIssues: [] },
          revoked: false, revocationReason: null
        },
        recoveryPoint: null, recoveryReceiptDigest: null, confirmDataLossAfter: null
      }
    }
  };
}

function render(job: UpdateJob, cancelDisabled = false): string {
  return renderToStaticMarkup(createElement(Provider, { children: createElement(UpdateJobCard, {
    job, canCancel: true, cancelDisabled, onCancel: () => undefined
  }) }));
}

describe("host approval request presentation", () => {
  it("shows the immutable request and bounded host commands without a browser approval action", () => {
    const job = fixture();
    const output = render(job);
    expect(output).toContain("Awaiting host approval");
    expect(output).toContain("Saved release summary");
    expect(output).toContain(requestDigest);
    expect(output).toContain(manifestDigest);
    expect(output).toContain(expiresAt);
    expect(output).toContain("synthetic-key");
    expect(output).toContain("approval.js show");
    expect(output).toContain("approval.js approve");
    expect(output).toContain("approval.js deny");
    expect(output).toContain("--request-digest");
    expect(output).toContain("update_synthetic");
    expect(output).toContain("Cancel request");
    expect(output).not.toMatch(/<button[^>]*>\s*(Approve|Deny)/i);
    expect(output).not.toContain('role="progressbar"');
  });

  it.each(["awaiting-approval", "scheduled"] as const)("distinguishes a host-approved future request in %s", (phase) => {
    const job = fixture();
    job.phase = phase;
    job.scheduledFor = job.approval!.descriptor.scheduledFor = "2026-09-29T11:00:00.000Z";
    job.approval!.decision = "approved";
    job.approval!.decidedAt = requestedAt;
    const output = render(job);
    expect(output).toContain("Host-approved · scheduled");
    expect(output).not.toContain("Awaiting host approval");
    expect(output).not.toContain("approval.js approve");
    expect(output).toContain("Cancel request");
  });

  it.each(["denied", "expired", "cancelled"] as const)("shows %s as terminal without approval or cancellation controls", (phase) => {
    const job = fixture();
    job.phase = phase;
    const output = render(job);
    expect(output).toContain(`Request ${phase}`);
    expect(output).not.toContain("approval.js approve");
    expect(output).not.toContain("Cancel request");
    expect(output).not.toContain('role="progressbar"');
  });

  it("retains the rollback data-loss timestamp and receipt digest without revealing host artifact paths", () => {
    const job = fixture();
    job.kind = job.approval!.descriptor.kind = "rollback";
    job.approval!.descriptor.release = null;
    job.approval!.descriptor.manifestDigest = null;
    job.approval!.descriptor.recoveryReceiptDigest = recoveryDigest;
    job.approval!.descriptor.confirmDataLossAfter = requestedAt;
    job.approval!.descriptor.recoveryPoint = {
      id: "recovery_synthetic", createdAt: requestedAt, version: "0.1.0", sourceRevision: "d".repeat(40),
      databaseSchemaVersion: "001_initial", imageReferences: [], backupPath: "/private/host/database.dump",
      configurationPath: "/private/host/release.env", attachmentSnapshotId: "/private/host/attachments.tar",
      verified: true, protected: false, sizeBytes: 512
    };
    const output = render(job);
    expect(output).toContain("discard database writes and attachment changes");
    expect(output).toContain(requestedAt);
    expect(output).toContain(recoveryDigest);
    expect(output).not.toContain("/private/host");
  });

  it("does not present legacy jobs as host-approved and disables cancellation while reconnecting", () => {
    const job = fixture();
    job.approval = null;
    job.phase = "scheduled";
    const output = render(job, true);
    expect(output).toContain("No host approval record");
    expect(output).not.toContain("Host-approved");
    expect(output).not.toContain("approval.js approve");
    expect(output).toMatch(/<button[^>]*disabled/);
  });
});
