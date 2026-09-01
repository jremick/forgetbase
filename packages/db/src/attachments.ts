import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  attachmentCreateInputSchema,
  attachmentRecordSchema,
  type AttachmentRecord,
  type AttachmentCreateInput
} from "@forgetbase/schema";

export interface AttachmentListOptions {
  tenantId?: string;
  assetId: string;
  includeUnavailable?: boolean;
  limit?: number;
}

export interface AttachmentGetOptions {
  tenantId?: string;
  includeUnavailable?: boolean;
}

export interface AttachmentDeletionRequestInput {
  tenantId?: string;
  attachmentId: string;
  requestedByUserId?: string;
  requestedByServiceAccountId?: string;
  requestedByApiKeyId?: string;
}

export interface AttachmentDeletionCompleteInput {
  tenantId?: string;
  attachmentId: string;
}

export interface AttachmentRepository {
  createAttachment(input: AttachmentCreateInput): Promise<AttachmentRecord>;
  getAttachment(attachmentId: string, options?: AttachmentGetOptions): Promise<AttachmentRecord | null>;
  listAttachments(options: AttachmentListOptions): Promise<AttachmentRecord[]>;
  markAttachmentDeleting(input: AttachmentDeletionRequestInput): Promise<AttachmentRecord | null>;
  markAttachmentDeleted(input: AttachmentDeletionCompleteInput): Promise<AttachmentRecord | null>;
}

export class AttachmentAssetNotFoundError extends Error {
  constructor(assetId: string) {
    super(`Attachment asset not found in tenant: ${assetId}`);
    this.name = "AttachmentAssetNotFoundError";
  }
}

export class DuplicateAttachmentStorageKeyError extends Error {
  constructor() {
    super("Attachment storage key already exists.");
    this.name = "DuplicateAttachmentStorageKeyError";
  }
}

export class PostgresAttachmentRepository implements AttachmentRepository {
  constructor(private readonly pool: Pool) {}

  async createAttachment(input: AttachmentCreateInput): Promise<AttachmentRecord> {
    const parsed = attachmentCreateInputSchema.parse(input);
    const result = await this.pool.query<AttachmentRow>(
      `
        INSERT INTO attachments (
          tenant_id,
          asset_id,
          filename,
          media_type,
          size_bytes,
          content_sha256,
          storage_key,
          metadata,
          uploaded_by_user_id,
          uploaded_by_service_account_id,
          uploaded_by_api_key_id
        )
        SELECT $1, assets.id, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11
        FROM assets
        WHERE assets.tenant_id = $1
          AND assets.id = $2
        RETURNING attachments.*
      `,
      [
        parsed.tenantId,
        parsed.assetId,
        parsed.filename,
        parsed.mediaType,
        parsed.sizeBytes,
        parsed.contentSha256,
        parsed.storageKey,
        JSON.stringify(parsed.metadata),
        parsed.uploadedByUserId ?? null,
        parsed.uploadedByServiceAccountId ?? null,
        parsed.uploadedByApiKeyId ?? null
      ]
    ).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new DuplicateAttachmentStorageKeyError();
      }

      throw error;
    });
    const row = result.rows[0];

    if (!row) {
      throw new AttachmentAssetNotFoundError(parsed.assetId);
    }

    return mapAttachmentRow(row);
  }

  async getAttachment(
    attachmentId: string,
    options: AttachmentGetOptions = {}
  ): Promise<AttachmentRecord | null> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const result = await this.pool.query<AttachmentRow>(
      `
        SELECT *
        FROM attachments
        WHERE tenant_id = $1
          AND id = $2
          AND ($3::boolean OR lifecycle_state = 'active')
        LIMIT 1
      `,
      [tenantId, requireIdentifier(attachmentId, "attachmentId"), options.includeUnavailable ?? false]
    );
    const row = result.rows[0];
    return row ? mapAttachmentRow(row) : null;
  }

  async listAttachments(options: AttachmentListOptions): Promise<AttachmentRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = boundedLimit(options.limit);
    const result = await this.pool.query<AttachmentRow>(
      `
        SELECT *
        FROM attachments
        WHERE tenant_id = $1
          AND asset_id = $2
          AND ($3::boolean OR lifecycle_state = 'active')
        ORDER BY created_at DESC, id ASC
        LIMIT $4
      `,
      [
        tenantId,
        requireIdentifier(options.assetId, "assetId"),
        options.includeUnavailable ?? false,
        limit
      ]
    );

    return result.rows.map(mapAttachmentRow);
  }

  async markAttachmentDeleting(input: AttachmentDeletionRequestInput): Promise<AttachmentRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const result = await this.pool.query<AttachmentRow>(
      `
        UPDATE attachments
        SET
          lifecycle_state = 'deleting',
          deletion_requested_by_user_id = CASE
            WHEN lifecycle_state = 'active' THEN $3
            ELSE deletion_requested_by_user_id
          END,
          deletion_requested_by_service_account_id = CASE
            WHEN lifecycle_state = 'active' THEN $4
            ELSE deletion_requested_by_service_account_id
          END,
          deletion_requested_by_api_key_id = CASE
            WHEN lifecycle_state = 'active' THEN $5
            ELSE deletion_requested_by_api_key_id
          END,
          deletion_requested_at = COALESCE(deletion_requested_at, now()),
          updated_at = CASE
            WHEN lifecycle_state = 'active' THEN now()
            ELSE updated_at
          END
        WHERE tenant_id = $1
          AND id = $2
          AND lifecycle_state IN ('active', 'deleting')
        RETURNING *
      `,
      [
        tenantId,
        requireIdentifier(input.attachmentId, "attachmentId"),
        input.requestedByUserId ?? null,
        input.requestedByServiceAccountId ?? null,
        input.requestedByApiKeyId ?? null
      ]
    );
    const row = result.rows[0];
    return row ? mapAttachmentRow(row) : null;
  }

  async markAttachmentDeleted(input: AttachmentDeletionCompleteInput): Promise<AttachmentRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const result = await this.pool.query<AttachmentRow>(
      `
        UPDATE attachments
        SET
          lifecycle_state = 'deleted',
          deleted_at = now(),
          updated_at = now()
        WHERE tenant_id = $1
          AND id = $2
          AND lifecycle_state = 'deleting'
        RETURNING *
      `,
      [tenantId, requireIdentifier(input.attachmentId, "attachmentId")]
    );
    const row = result.rows[0];
    return row ? mapAttachmentRow(row) : null;
  }
}

export interface InMemoryAttachmentRepositoryOptions {
  now?: () => Date;
  generateId?: () => string;
}

export class InMemoryAttachmentRepository implements AttachmentRepository {
  private readonly attachments = new Map<string, AttachmentRecord>();
  private readonly storageKeys = new Set<string>();
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(options: InMemoryAttachmentRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? randomUUID;
  }

  async createAttachment(input: AttachmentCreateInput): Promise<AttachmentRecord> {
    const parsed = attachmentCreateInputSchema.parse(input);

    if (this.storageKeys.has(parsed.storageKey)) {
      throw new DuplicateAttachmentStorageKeyError();
    }

    const now = this.now().toISOString();
    const attachment = attachmentRecordSchema.parse({
      id: this.generateId(),
      tenantId: parsed.tenantId,
      assetId: parsed.assetId,
      filename: parsed.filename,
      mediaType: parsed.mediaType,
      sizeBytes: parsed.sizeBytes,
      contentSha256: parsed.contentSha256,
      storageKey: parsed.storageKey,
      lifecycleState: "active",
      metadata: parsed.metadata,
      uploadedByUserId: parsed.uploadedByUserId ?? null,
      uploadedByServiceAccountId: parsed.uploadedByServiceAccountId ?? null,
      uploadedByApiKeyId: parsed.uploadedByApiKeyId ?? null,
      deletionRequestedByUserId: null,
      deletionRequestedByServiceAccountId: null,
      deletionRequestedByApiKeyId: null,
      deletionRequestedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });

    this.storageKeys.add(parsed.storageKey);
    this.attachments.set(attachment.id, attachment);
    return attachment;
  }

  async getAttachment(
    attachmentId: string,
    options: AttachmentGetOptions = {}
  ): Promise<AttachmentRecord | null> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const attachment = this.attachments.get(requireIdentifier(attachmentId, "attachmentId"));

    if (
      !attachment ||
      attachment.tenantId !== tenantId ||
      (!options.includeUnavailable && attachment.lifecycleState !== "active")
    ) {
      return null;
    }

    return attachment;
  }

  async listAttachments(options: AttachmentListOptions): Promise<AttachmentRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = boundedLimit(options.limit);

    return Array.from(this.attachments.values())
      .filter((attachment) =>
        attachment.tenantId === tenantId &&
        attachment.assetId === options.assetId &&
        (options.includeUnavailable || attachment.lifecycleState === "active")
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  async markAttachmentDeleting(input: AttachmentDeletionRequestInput): Promise<AttachmentRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const attachment = this.attachments.get(requireIdentifier(input.attachmentId, "attachmentId"));

    if (!attachment || attachment.tenantId !== tenantId || attachment.lifecycleState === "deleted") {
      return null;
    }
    if (attachment.lifecycleState === "deleting") {
      return attachment;
    }

    const now = this.now().toISOString();
    const updated = attachmentRecordSchema.parse({
      ...attachment,
      lifecycleState: "deleting",
      deletionRequestedByUserId: input.requestedByUserId ?? null,
      deletionRequestedByServiceAccountId: input.requestedByServiceAccountId ?? null,
      deletionRequestedByApiKeyId: input.requestedByApiKeyId ?? null,
      deletionRequestedAt: now,
      updatedAt: now
    });
    this.attachments.set(updated.id, updated);
    return updated;
  }

  async markAttachmentDeleted(input: AttachmentDeletionCompleteInput): Promise<AttachmentRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const attachment = this.attachments.get(requireIdentifier(input.attachmentId, "attachmentId"));

    if (!attachment || attachment.tenantId !== tenantId || attachment.lifecycleState !== "deleting") {
      return null;
    }

    const now = this.now().toISOString();
    const updated = attachmentRecordSchema.parse({
      ...attachment,
      lifecycleState: "deleted",
      deletedAt: now,
      updatedAt: now
    });
    this.attachments.set(updated.id, updated);
    return updated;
  }
}

function mapAttachmentRow(row: AttachmentRow): AttachmentRecord {
  return attachmentRecordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    assetId: row.asset_id,
    filename: row.filename,
    mediaType: row.media_type,
    sizeBytes: Number(row.size_bytes),
    contentSha256: row.content_sha256,
    storageKey: row.storage_key,
    lifecycleState: row.lifecycle_state,
    metadata: row.metadata,
    uploadedByUserId: row.uploaded_by_user_id,
    uploadedByServiceAccountId: row.uploaded_by_service_account_id,
    uploadedByApiKeyId: row.uploaded_by_api_key_id,
    deletionRequestedByUserId: row.deletion_requested_by_user_id,
    deletionRequestedByServiceAccountId: row.deletion_requested_by_service_account_id,
    deletionRequestedByApiKeyId: row.deletion_requested_by_api_key_id,
    deletionRequestedAt: row.deletion_requested_at?.toISOString() ?? null,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

function requireIdentifier(value: string, name: string): string {
  if (!value.trim()) {
    throw new Error(`${name} must not be empty.`);
  }

  return value;
}

function boundedLimit(limit = 100): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

interface AttachmentRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  asset_id: string;
  filename: string;
  media_type: string;
  size_bytes: string | number;
  content_sha256: string;
  storage_key: string;
  lifecycle_state: string;
  metadata: Record<string, unknown>;
  uploaded_by_user_id: string | null;
  uploaded_by_service_account_id: string | null;
  uploaded_by_api_key_id: string | null;
  deletion_requested_by_user_id: string | null;
  deletion_requested_by_service_account_id: string | null;
  deletion_requested_by_api_key_id: string | null;
  deletion_requested_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
