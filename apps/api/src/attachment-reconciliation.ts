import { createHash } from "node:crypto";
import type { AttachmentRepository } from "@forgetbase/db";
import type { AttachmentRecord } from "@forgetbase/schema";
import type { AttachmentStorageAdapter } from "./attachment-storage.js";

export type AttachmentReconciliationReport = {
  checkedAt: string;
  dryRun: boolean;
  verifyContent: boolean;
  recordCount: number;
  storageObjectCount: number;
  truncated: boolean;
  activeMissingOrUnreadableCount: number;
  activeIntegrityFailureCount: number;
  staleDeletingCount: number;
  orphanedObjectCount: number;
  unexpectedStorageEntryCount: number;
  resolvedDeletingCount: number;
  deletedOrphanCount: number;
};

export async function reconcileAttachments(input: {
  repository: AttachmentRepository;
  storage: AttachmentStorageAdapter;
  tenantId?: string;
  dryRun?: boolean;
  verifyContent?: boolean;
  staleDeletingAfterMs?: number;
  recordLimit?: number;
  now?: Date;
}): Promise<AttachmentReconciliationReport> {
  if (!input.storage.inventory) throw new Error("Attachment storage inventory is unavailable.");
  const dryRun = input.dryRun ?? true;
  const verifyContent = input.verifyContent ?? false;
  const now = input.now ?? new Date();
  const staleDeletingAfterMs = input.staleDeletingAfterMs ?? 15 * 60 * 1_000;
  const recordLimit = Math.min(Math.max(Math.trunc(input.recordLimit ?? 5_000), 1), 9_999);
  const recordsWithSentinel = await input.repository.listAttachmentsForReconciliation({
    tenantId: input.tenantId,
    limit: recordLimit + 1
  });
  const truncated = recordsWithSentinel.length > recordLimit;
  const records = recordsWithSentinel.slice(0, recordLimit);
  const inventory = await input.storage.inventory();
  const storedKeys = new Set(inventory.storageKeys);
  const expectedKeys = new Set(records
    .filter((record) => record.lifecycleState !== "deleted")
    .map((record) => record.storageKey));

  let activeMissingOrUnreadableCount = 0;
  let activeIntegrityFailureCount = 0;
  let staleDeletingCount = 0;
  let resolvedDeletingCount = 0;
  let deletedOrphanCount = 0;

  for (const record of records) {
    if (record.lifecycleState === "active") {
      if (!storedKeys.has(record.storageKey)) {
        activeMissingOrUnreadableCount += 1;
        continue;
      }
      if (verifyContent) {
        const integrity = await verifyAttachmentIntegrity(record, input.storage);
        if (integrity === "unreadable") activeMissingOrUnreadableCount += 1;
        if (integrity === "mismatch") activeIntegrityFailureCount += 1;
      }
    }

    if (record.lifecycleState === "deleting" &&
      now.getTime() - new Date(record.updatedAt).getTime() >= staleDeletingAfterMs) {
      staleDeletingCount += 1;
      if (!dryRun) {
        await input.storage.delete(record.storageKey);
        const deleted = await input.repository.markAttachmentDeleted({
          tenantId: record.tenantId,
          attachmentId: record.id
        });
        if (deleted) resolvedDeletingCount += 1;
      }
    }
  }

  const orphanedKeys = input.tenantId || truncated
    ? []
    : inventory.storageKeys.filter((storageKey) => !expectedKeys.has(storageKey));
  if (!dryRun) {
    for (const storageKey of orphanedKeys) {
      if (await input.storage.delete(storageKey)) deletedOrphanCount += 1;
    }
  }

  return {
    checkedAt: now.toISOString(),
    dryRun,
    verifyContent,
    recordCount: records.length,
    storageObjectCount: input.tenantId
      ? Array.from(expectedKeys).filter((storageKey) => storedKeys.has(storageKey)).length
      : inventory.storageKeys.length,
    truncated,
    activeMissingOrUnreadableCount,
    activeIntegrityFailureCount,
    staleDeletingCount,
    orphanedObjectCount: orphanedKeys.length,
    unexpectedStorageEntryCount: input.tenantId ? 0 : inventory.unexpectedEntryCount,
    resolvedDeletingCount,
    deletedOrphanCount
  };
}

async function verifyAttachmentIntegrity(
  record: AttachmentRecord,
  storage: AttachmentStorageAdapter
): Promise<"ok" | "unreadable" | "mismatch"> {
  try {
    const content = await storage.get(record.storageKey);
    const hash = createHash("sha256").update(content).digest("hex");
    return content.byteLength === record.sizeBytes && hash === record.contentSha256 ? "ok" : "mismatch";
  } catch {
    return "unreadable";
  }
}
