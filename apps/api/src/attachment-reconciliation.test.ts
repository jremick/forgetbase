import { createHash } from "node:crypto";
import { InMemoryAttachmentRepository } from "@forgetbase/db";
import { describe, expect, it } from "vitest";
import type { AttachmentStorageAdapter } from "./attachment-storage.js";
import { reconcileAttachments } from "./attachment-reconciliation.js";

function storageKey(index: number): string {
  return `${index.toString(16).padStart(2, "0")}/00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

describe("attachment reconciliation", () => {
  it("reports missing, corrupt, stale, orphaned, and unexpected storage state without exposing keys", async () => {
    const repository = new InMemoryAttachmentRepository({
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      generateId: (() => { let id = 0; return () => `attachment_${++id}`; })()
    });
    const clean = Buffer.from("clean");
    const corrupt = Buffer.from("corrupt");
    const records = await Promise.all([
      repository.createAttachment(attachmentInput(1, clean)),
      repository.createAttachment(attachmentInput(2, Buffer.from("expected"))),
      repository.createAttachment(attachmentInput(3, Buffer.from("missing"))),
      repository.createAttachment(attachmentInput(4, Buffer.from("deleting")))
    ]);
    await repository.markAttachmentDeleting({ tenantId: "tenant_one", attachmentId: records[3]!.id });
    const files = new Map([
      [storageKey(1), clean],
      [storageKey(2), corrupt],
      [storageKey(4), Buffer.from("deleting")],
      [storageKey(5), Buffer.from("orphan")]
    ]);
    const storage = memoryStorage(files, 2);

    const report = await reconcileAttachments({
      repository,
      storage,
      verifyContent: true,
      now: new Date("2026-09-01T01:00:00.000Z")
    });

    expect(report).toMatchObject({
      dryRun: true,
      activeMissingOrUnreadableCount: 1,
      activeIntegrityFailureCount: 1,
      staleDeletingCount: 1,
      orphanedObjectCount: 1,
      unexpectedStorageEntryCount: 2,
      resolvedDeletingCount: 0,
      deletedOrphanCount: 0
    });
    expect(JSON.stringify(report)).not.toContain(storageKey(1));
  });

  it("resolves stale deletes and removes orphans only in execute mode", async () => {
    const repository = new InMemoryAttachmentRepository({
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      generateId: () => "attachment_one"
    });
    const record = await repository.createAttachment(attachmentInput(1, Buffer.from("deleting")));
    await repository.markAttachmentDeleting({ tenantId: "tenant_one", attachmentId: record.id });
    const files = new Map([
      [record.storageKey, Buffer.from("deleting")],
      [storageKey(2), Buffer.from("orphan")]
    ]);

    const report = await reconcileAttachments({
      repository,
      storage: memoryStorage(files),
      dryRun: false,
      now: new Date("2026-09-01T01:00:00.000Z")
    });

    expect(report).toMatchObject({ resolvedDeletingCount: 1, deletedOrphanCount: 1 });
    expect(files.size).toBe(0);
    await expect(repository.getAttachment(record.id, { tenantId: "tenant_one", includeUnavailable: true }))
      .resolves.toMatchObject({ lifecycleState: "deleted" });
  });

  it("keeps tenant-admin reconciliation inside its tenant and never classifies shared blobs as orphans", async () => {
    const repository = new InMemoryAttachmentRepository({
      generateId: (() => { let id = 0; return () => `attachment_${++id}`; })()
    });
    const tenantOne = await repository.createAttachment(attachmentInput(1, Buffer.from("one")));
    const tenantTwo = await repository.createAttachment({
      ...attachmentInput(2, Buffer.from("two")),
      tenantId: "tenant_two",
      assetId: "asset_two"
    });
    const files = new Map([
      [tenantOne.storageKey, Buffer.from("one")],
      [tenantTwo.storageKey, Buffer.from("two")]
    ]);

    const report = await reconcileAttachments({
      repository,
      storage: memoryStorage(files, 3),
      tenantId: "tenant_one",
      dryRun: false,
      verifyContent: true
    });

    expect(report).toMatchObject({
      recordCount: 1,
      storageObjectCount: 1,
      orphanedObjectCount: 0,
      unexpectedStorageEntryCount: 0,
      deletedOrphanCount: 0
    });
    expect(files.has(tenantTwo.storageKey)).toBe(true);
  });
});

function attachmentInput(index: number, content: Buffer) {
  return {
    tenantId: "tenant_one",
    assetId: "asset_one",
    filename: `attachment-${index}.txt`,
    mediaType: "text/plain",
    sizeBytes: content.byteLength,
    contentSha256: createHash("sha256").update(content).digest("hex"),
    storageKey: storageKey(index),
    uploadedByUserId: "user_one"
  };
}

function memoryStorage(files: Map<string, Buffer>, unexpectedEntryCount = 0): AttachmentStorageAdapter {
  return {
    async put(key, content) { files.set(key, Buffer.from(content)); },
    async get(key) {
      const content = files.get(key);
      if (!content) throw new Error("missing");
      return content;
    },
    async delete(key) { return files.delete(key); },
    async inventory() { return { storageKeys: Array.from(files.keys()).sort(), unexpectedEntryCount }; }
  };
}
