import { describe, expect, it } from "vitest";
import {
  DuplicateAttachmentStorageKeyError,
  InMemoryAttachmentRepository
} from "./attachments.js";

const STORAGE_KEY = "ab/11111111-2222-4333-8444-555555555555";

function attachmentInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant_one",
    assetId: "asset_one",
    filename: "architecture.pdf",
    mediaType: "application/pdf",
    sizeBytes: 12,
    contentSha256: "a".repeat(64),
    storageKey: STORAGE_KEY,
    uploadedByUserId: "user_one",
    metadata: { purpose: "reader-download" },
    ...overrides
  };
}

describe("InMemoryAttachmentRepository", () => {
  it("stores tenant and asset metadata without deriving paths from the filename", async () => {
    const repository = new InMemoryAttachmentRepository({
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      generateId: () => "attachment_one"
    });

    const attachment = await repository.createAttachment(attachmentInput());

    expect(attachment).toMatchObject({
      id: "attachment_one",
      tenantId: "tenant_one",
      assetId: "asset_one",
      filename: "architecture.pdf",
      storageKey: STORAGE_KEY,
      lifecycleState: "active",
      uploadedByUserId: "user_one",
      createdAt: "2026-09-01T00:00:00.000Z"
    });
    await expect(repository.listAttachments({ tenantId: "tenant_two", assetId: "asset_one" }))
      .resolves.toEqual([]);
    await expect(repository.getAttachment("attachment_one", { tenantId: "tenant_two", includeUnavailable: true }))
      .resolves.toBeNull();
    await expect(repository.markAttachmentDeleting({
      tenantId: "tenant_two",
      attachmentId: "attachment_one",
      requestedByApiKeyId: "key_two"
    })).resolves.toBeNull();
    await expect(repository.getAttachment("attachment_one", { tenantId: "tenant_one" }))
      .resolves.toMatchObject({ lifecycleState: "active" });
  });

  it("rejects unsafe display filenames and duplicate generated storage keys", async () => {
    const repository = new InMemoryAttachmentRepository();

    await expect(repository.createAttachment(attachmentInput({ filename: "../private.txt" })))
      .rejects.toThrow();
    await repository.createAttachment(attachmentInput());
    await expect(repository.createAttachment(attachmentInput({ assetId: "asset_two" })))
      .rejects.toBeInstanceOf(DuplicateAttachmentStorageKeyError);
  });

  it("reports tenant and uploader usage without counting deleted attachments", async () => {
    const repository = new InMemoryAttachmentRepository({
      generateId: (() => {
        let id = 0;
        return () => `attachment_${++id}`;
      })()
    });
    await repository.createAttachment(attachmentInput());
    await repository.createAttachment(attachmentInput({
      storageKey: "cd/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      sizeBytes: 8,
      uploadedByUserId: "user_two"
    }));
    const deleting = await repository.markAttachmentDeleting({
      tenantId: "tenant_one",
      attachmentId: "attachment_2",
      requestedByUserId: "user_two"
    });
    await repository.markAttachmentDeleted({ tenantId: "tenant_one", attachmentId: deleting!.id });

    await expect(repository.getAttachmentUsage({ tenantId: "tenant_one" }))
      .resolves.toEqual({ fileCount: 1, totalBytes: 12 });
    await expect(repository.getAttachmentUsage({ tenantId: "tenant_one", uploadedByUserId: "user_one" }))
      .resolves.toEqual({ fileCount: 1, totalBytes: 12 });
    await expect(repository.getAttachmentUsage({ tenantId: "tenant_one", uploadedByUserId: "user_two" }))
      .resolves.toEqual({ fileCount: 0, totalBytes: 0 });
  });

  it("fails closed throughout two-phase deletion and does not allow invalid transitions", async () => {
    const timestamps = [
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-01T00:01:00.000Z"),
      new Date("2026-09-01T00:02:00.000Z")
    ];
    const repository = new InMemoryAttachmentRepository({
      now: () => timestamps.shift() ?? new Date("2026-09-01T00:02:00.000Z"),
      generateId: () => "attachment_one"
    });
    await repository.createAttachment(attachmentInput());

    const deleting = await repository.markAttachmentDeleting({
      tenantId: "tenant_one",
      attachmentId: "attachment_one",
      requestedByApiKeyId: "key_one"
    });

    expect(deleting).toMatchObject({
      lifecycleState: "deleting",
      deletionRequestedByApiKeyId: "key_one",
      deletionRequestedAt: "2026-09-01T00:01:00.000Z"
    });
    await expect(repository.getAttachment("attachment_one", { tenantId: "tenant_one" }))
      .resolves.toBeNull();
    await expect(repository.markAttachmentDeleting({
      tenantId: "tenant_one",
      attachmentId: "attachment_one",
      requestedByUserId: "different_retry_actor"
    })).resolves.toEqual(deleting);

    const deleted = await repository.markAttachmentDeleted({
      tenantId: "tenant_one",
      attachmentId: "attachment_one"
    });
    expect(deleted).toMatchObject({
      lifecycleState: "deleted",
      deletedAt: "2026-09-01T00:02:00.000Z"
    });
    await expect(repository.getAttachment("attachment_one", {
      tenantId: "tenant_one",
      includeUnavailable: true
    })).resolves.toMatchObject({ lifecycleState: "deleted" });
    await expect(repository.markAttachmentDeleted({
      tenantId: "tenant_one",
      attachmentId: "attachment_one"
    })).resolves.toBeNull();
  });
});
