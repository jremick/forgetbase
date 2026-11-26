import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryAttachmentRepository } from "@forgetbase/db";
import { describe, expect, it } from "vitest";
import { LocalFilesystemAttachmentStorage, type AttachmentStorageAdapter } from "./attachment-storage.js";
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

  it("removes stale pending uploads without making them available", async () => {
    const repository = new InMemoryAttachmentRepository({
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      generateId: () => "attachment_pending"
    });
    const pending = await repository.reserveAttachment(attachmentInput(1, Buffer.from("pending")));
    const files = new Map([[pending.storageKey, Buffer.from("pending")]]);

    const report = await reconcileAttachments({
      repository,
      storage: memoryStorage(files),
      dryRun: false,
      now: new Date("2026-09-01T01:00:00.000Z")
    });

    expect(report).toMatchObject({ stalePendingCount: 1, resolvedPendingCount: 1 });
    expect(files.size).toBe(0);
    await expect(repository.getAttachment(pending.id, { tenantId: "tenant_one", includeUnavailable: true }))
      .resolves.toMatchObject({ lifecycleState: "deleted" });
  });

  it("recovers unpublished reservations and preserves mismatched bytes on the real filesystem", async () => {
    const root = await mkdtemp(join(tmpdir(), "forgetbase-pending-recovery-"));
    const repository = new InMemoryAttachmentRepository({ now: () => new Date("2026-09-01T00:00:00Z") });
    const storage = new LocalFilesystemAttachmentStorage(root, 1024);
    try {
      const missing = await repository.reserveAttachment(attachmentInput(1, Buffer.from("never published")));
      const mismatch = await repository.reserveAttachment(attachmentInput(2, Buffer.from("new bytes")));
      await storage.put(mismatch.storageKey, Buffer.from("existing bytes"));
      // A bounded or stale storage listing cannot establish that a key is absent.
      const partialInventory: AttachmentStorageAdapter = {
        inventory: async () => ({ storageKeys: [], unexpectedEntryCount: 0 }),
        get: (key) => storage.get(key),
        put: (key, content) => storage.put(key, content),
        delete: (key) => storage.delete(key)
      };
      const result = await reconcileAttachments({
        repository, storage: partialInventory, dryRun: false, now: new Date("2026-09-01T01:00:00Z")
      });
      expect(result).toMatchObject({ stalePendingCount: 2, resolvedPendingCount: 1, deletedOrphanCount: 0 });
      await expect(repository.getAttachment(missing.id, { tenantId: missing.tenantId, includeUnavailable: true }))
        .resolves.toMatchObject({ lifecycleState: "deleted" });
      await expect(storage.get(mismatch.storageKey)).resolves.toEqual(Buffer.from("existing bytes"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("serializes execute reconciliation behind an upload reservation and activation", async () => {
    const repository = new InMemoryAttachmentRepository({
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      generateId: () => "attachment_upload"
    });
    const files = new Map<string, Buffer>();
    let releaseUpload: () => void = () => undefined;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    let markBlobWritten: () => void = () => undefined;
    const blobWritten = new Promise<void>((resolve) => {
      markBlobWritten = resolve;
    });
    const input = attachmentInput(1, Buffer.from("upload"));
    const upload = repository.withAttachmentLifecycleLock(async () => {
      const pending = await repository.reserveAttachment(input);
      files.set(pending.storageKey, Buffer.from("upload"));
      markBlobWritten();
      await uploadGate;
      await repository.activateAttachment({ tenantId: pending.tenantId, attachmentId: pending.id });
    });
    await blobWritten;

    let inventoryCount = 0;
    const storage = memoryStorage(files);
    const inventory = storage.inventory!;
    storage.inventory = async () => {
      inventoryCount += 1;
      return inventory();
    };
    const reconciliation = reconcileAttachments({ repository, storage, dryRun: false });
    await Promise.resolve();
    expect(inventoryCount).toBe(0);

    releaseUpload();
    await upload;
    const report = await reconciliation;
    expect(report.deletedOrphanCount).toBe(0);
    expect(files.has(input.storageKey)).toBe(true);
    await expect(repository.getAttachment("attachment_upload", { tenantId: "tenant_one" }))
      .resolves.toMatchObject({ lifecycleState: "active" });
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
