import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type QueryResult, type QueryResultRow } from "pg";
import {
  assetCreateInputSchema,
  assetDetailSchema,
  assetPublishInputSchema,
  assetRecordSchema,
  assetReviewInputSchema,
  assetReviewQueueInputSchema,
  assetReviewQueueResponseSchema,
  assetRestoreInputSchema,
  assetUpdateInputSchema,
  assetVersionAssetSnapshotSchema,
  assetVersionSnapshotInputSchema,
  assetVersionSnapshotSchema,
  assetVersionSchema,
  agentInstructionSchema,
  humanDocumentSchema,
  type AssetCreateInput,
  type AssetDetail,
  type AssetPublishInput,
  type AssetReviewInput,
  type AssetReviewQueueInput,
  type AssetReviewQueueResponse,
  type AssetRecord,
  type AssetRestoreInput,
  type AssetUpdateInput,
  type AssetVersionSnapshot,
  type AssetVersionSnapshotInput,
  type AssetVersion,
  type AssetVersionAssetSnapshot,
  type AgentInstructionInput,
  type HumanDocumentInput
} from "@forgetbase/schema";

export * from "./auth.js";
export * from "./attachments.js";
export * from "./auth-provider-config.js";
export * from "./action-execution.js";
export * from "./embeddings.js";
export * from "./eval-runs.js";
export * from "./feedback.js";
export * from "./managed-query-cache.js";
export * from "./managed-query-eval-schedule.js";
export * from "./managed-query-policy.js";
export * from "./managed-query-retention.js";
export * from "./pii-redaction-policy.js";
export * from "./provider-config.js";
export * from "./retrieval.js";
export * from "./retrieval-ranking-policy.js";
export * from "./secret-reference-policy.js";
export * from "./telemetry-retention.js";

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));
const MIGRATION_LOCK_CLASS_ID = 1768122339;
const MIGRATION_LOCK_OBJECT_ID = 20260617;

export interface RegistryListOptions {
  tenantId?: string;
  limit?: number;
}

export interface RegistryGetOptions {
  tenantId?: string;
}

export interface RegistryRepository {
  listAssets(options?: RegistryListOptions): Promise<AssetRecord[]>;
  listAssetsNeedingReview(input?: AssetReviewQueueInput): Promise<AssetReviewQueueResponse>;
  getAssetByStableId(stableId: string, options?: RegistryGetOptions): Promise<AssetDetail | null>;
  getAssetVersionSnapshot(stableId: string, input: AssetVersionSnapshotInput): Promise<AssetVersionSnapshot | null>;
  createAsset(input: AssetCreateInput): Promise<AssetDetail>;
  updateAsset(stableId: string, input: AssetUpdateInput): Promise<AssetDetail | null>;
  reviewAsset(stableId: string, input: AssetReviewInput): Promise<AssetDetail | null>;
  publishAsset(stableId: string, input: AssetPublishInput): Promise<AssetDetail | null>;
  restoreAssetVersion(stableId: string, input: AssetRestoreInput): Promise<AssetDetail | null>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export class DuplicateAssetError extends Error {
  constructor(stableId: string) {
    super(`Asset already exists for stable ID: ${stableId}`);
    this.name = "DuplicateAssetError";
  }
}

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({ connectionString });
}

export async function runMigrations(pool: Pool, migrationsDir = DEFAULT_MIGRATIONS_DIR): Promise<MigrationResult> {
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [MIGRATION_LOCK_CLASS_ID, MIGRATION_LOCK_OBJECT_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const result: MigrationResult = {
      applied: [],
      skipped: []
    };

    for (const file of migrationFiles) {
      const id = file.replace(/\.sql$/, "");
      const existing = await client.query("SELECT id FROM schema_migrations WHERE id = $1", [id]);

      if (existing.rowCount && existing.rowCount > 0) {
        result.skipped.push(id);
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
        await client.query("COMMIT");
        result.applied.push(id);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return result;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [MIGRATION_LOCK_CLASS_ID, MIGRATION_LOCK_OBJECT_ID]);
    } finally {
      client.release();
    }
  }
}

export class PostgresRegistryRepository implements RegistryRepository {
  constructor(private readonly pool: Pool) {}

  async listAssets(options: RegistryListOptions = {}): Promise<AssetRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<AssetRow>(
      `
        SELECT *
        FROM assets
        WHERE tenant_id = $1
        ORDER BY updated_at DESC, stable_id ASC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapAssetRow);
  }

  async listAssetsNeedingReview(input: AssetReviewQueueInput = {}): Promise<AssetReviewQueueResponse> {
    const parsed = assetReviewQueueInputSchema.parse({
      ...input,
      asOf: input.asOf ?? todayDateOnly()
    });
    const asOf = parsed.asOf ?? todayDateOnly();
    const includeApproved = parsed.includeApproved ?? false;
    const limit = parsed.limit ?? 50;
    const result = await this.pool.query<AssetRow>(
      `
        SELECT *
        FROM assets
        WHERE tenant_id = $1
          AND (
            $3::boolean = true
            OR lifecycle_state <> 'active'
            OR status <> 'approved'
            OR review_due_at <= $2::date
          )
        ORDER BY review_due_at ASC, updated_at DESC, stable_id ASC
        LIMIT $4
      `,
      [parsed.tenantId, asOf, includeApproved, limit]
    );

    return assetReviewQueueResponseSchema.parse({
      asOf,
      includeApproved,
      assets: result.rows.map(mapAssetRow)
    });
  }

  async getAssetByStableId(stableId: string, options: RegistryGetOptions = {}): Promise<AssetDetail | null> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const asset = await this.pool.query<AssetRow>(
      "SELECT * FROM assets WHERE tenant_id = $1 AND stable_id = $2",
      [tenantId, stableId]
    );

    if (!asset.rows[0]) {
      return null;
    }

    return this.getAssetDetail(asset.rows[0].id);
  }

  async getAssetVersionSnapshot(
    stableId: string,
    input: AssetVersionSnapshotInput
  ): Promise<AssetVersionSnapshot | null> {
    const parsed = assetVersionSnapshotInputSchema.parse(input);
    return getAssetVersionSnapshot(this.pool, stableId, parsed);
  }

  async createAsset(input: AssetCreateInput): Promise<AssetDetail> {
    const parsed = assetCreateInputSchema.parse(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await ensureTenant(client, parsed.tenantId);

      const duplicate = await client.query("SELECT id FROM assets WHERE tenant_id = $1 AND stable_id = $2", [
        parsed.tenantId,
        parsed.stableId
      ]);

      if (duplicate.rowCount && duplicate.rowCount > 0) {
        throw new DuplicateAssetError(parsed.stableId);
      }

      const asset = await client.query<AssetRow>(
        `
          INSERT INTO assets (
            tenant_id,
            stable_id,
            type,
            owner_id,
            title,
            summary,
            lifecycle_state,
            sensitivity,
            audience,
            status,
            review_due_at,
            source_kind,
            source_ref,
            allowed_surfaces,
            allowed_exports,
            allowed_actions,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12, $13, $14, $15, $16, $17::jsonb)
          RETURNING *
        `,
        [
          parsed.tenantId,
          parsed.stableId,
          parsed.type,
          parsed.ownerId,
          parsed.title,
          parsed.summary ?? null,
          parsed.lifecycleState,
          parsed.sensitivity,
          parsed.audience,
          parsed.status,
          parsed.reviewDueAt,
          parsed.sourceKind,
          parsed.sourceRef ?? null,
          parsed.allowedSurfaces,
          parsed.allowedExports,
          parsed.allowedActions,
          JSON.stringify(parsed.metadata)
        ]
      );
      const assetId = requireRow(asset).id;
      const assetSnapshot = buildAssetSnapshotFromCreate(parsed);
      const versionContent = {
        instructionObjects: parsed.instruction ? [parsed.instruction] : [],
        humanDocuments: parsed.humanDocument ? [parsed.humanDocument] : []
      };
      const contentHash = hashGovernedAssetSnapshot(assetSnapshot, versionContent);
      const version = await client.query<AssetVersionRow>(
        `
          INSERT INTO asset_versions (
            asset_id,
            version_number,
            content_hash,
            metadata,
            asset_snapshot,
            created_by,
            change_note
          )
          VALUES ($1, 1, $2, $3::jsonb, $4::jsonb, $5, $6)
          RETURNING *
        `,
        [
          assetId,
          contentHash,
          JSON.stringify(parsed.metadata),
          JSON.stringify(assetSnapshot),
          parsed.ownerId,
          parsed.changeNote ?? "Initial version"
        ]
      );
      const versionId = requireRow(version).id;

      if (parsed.instruction) {
        await insertInstruction(client, assetId, versionId, parsed.instruction);
      }

      if (parsed.humanDocument) {
        await insertHumanDocument(client, assetId, versionId, parsed.humanDocument);
      }

      await client.query("UPDATE assets SET current_version_id = $1, updated_at = now() WHERE id = $2", [
        versionId,
        assetId
      ]);

      const detail = await getAssetDetail(client, assetId);
      await client.query("COMMIT");
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAsset(stableId: string, input: AssetUpdateInput): Promise<AssetDetail | null> {
    const hasMetadataUpdate = Object.hasOwn(input, "metadata");
    const parsed = assetUpdateInputSchema.parse(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const existing = await client.query<AssetRow>(
        "SELECT * FROM assets WHERE tenant_id = $1 AND stable_id = $2 FOR UPDATE",
        [parsed.tenantId, stableId]
      );
      const asset = existing.rows[0];

      if (!asset) {
        await client.query("ROLLBACK");
        return null;
      }
      const nextMetadata = hasMetadataUpdate ? parsed.metadata : asset.metadata;

      const currentInstructions = await client.query<InstructionObjectRow>(
        "SELECT * FROM instruction_objects WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
        [asset.id, asset.current_version_id]
      );
      const currentDocuments = await client.query<HumanDocumentRow>(
        "SELECT * FROM human_documents WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
        [asset.id, asset.current_version_id]
      );
      const assetSnapshot = buildAssetSnapshotFromUpdate(mapAssetRow(asset), parsed, hasMetadataUpdate);
      const versionContent: GovernedVersionContent = {
        instructionObjects: parsed.instruction
          ? [parsed.instruction]
          : currentInstructions.rows.map(mapInstructionInputRow),
        humanDocuments: parsed.humanDocument
          ? [parsed.humanDocument]
          : currentDocuments.rows.map(mapHumanDocumentInputRow)
      };
      const nextVersion = await client.query<{ version_number: number }>(
        "SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number FROM asset_versions WHERE asset_id = $1",
        [asset.id]
      );
      const versionNumber = Number(nextVersion.rows[0]?.version_number ?? 1);
      const version = await client.query<AssetVersionRow>(
        `
          INSERT INTO asset_versions (
            asset_id,
            version_number,
            content_hash,
            metadata,
            asset_snapshot,
            created_by,
            change_note
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
          RETURNING *
        `,
        [
          asset.id,
          versionNumber,
          hashGovernedAssetSnapshot(assetSnapshot, versionContent),
          JSON.stringify(nextMetadata),
          JSON.stringify(assetSnapshot),
          asset.owner_id,
          parsed.changeNote ?? "Update asset"
        ]
      );
      const versionId = requireRow(version).id;

      if (parsed.instruction) {
        await insertInstruction(client, asset.id, versionId, parsed.instruction);
      } else {
        for (const instruction of currentInstructions.rows) {
          await copyInstruction(client, versionId, instruction);
        }
      }

      if (parsed.humanDocument) {
        await insertHumanDocument(client, asset.id, versionId, parsed.humanDocument);
      } else {
        for (const document of currentDocuments.rows) {
          await copyHumanDocument(client, versionId, document);
        }
      }

      await client.query(
        `
          UPDATE assets
          SET
            title = COALESCE($1, title),
            summary = COALESCE($2, summary),
            lifecycle_state = COALESCE($3, lifecycle_state),
            sensitivity = COALESCE($4, sensitivity),
            audience = COALESCE($5, audience),
            status = COALESCE($6, status),
            review_due_at = COALESCE($7::date, review_due_at),
            source_ref = COALESCE($8, source_ref),
            allowed_surfaces = COALESCE($9, allowed_surfaces),
            allowed_exports = COALESCE($10, allowed_exports),
            allowed_actions = COALESCE($11, allowed_actions),
            metadata = $12::jsonb,
            current_version_id = $13,
            updated_at = now()
          WHERE id = $14
        `,
        [
          parsed.title ?? null,
          parsed.summary ?? null,
          parsed.lifecycleState ?? null,
          parsed.sensitivity ?? null,
          parsed.audience ?? null,
          parsed.status ?? null,
          parsed.reviewDueAt ?? null,
          parsed.sourceRef ?? null,
          parsed.allowedSurfaces ?? null,
          parsed.allowedExports ?? null,
          parsed.allowedActions ?? null,
          JSON.stringify(nextMetadata),
          versionId,
          asset.id
        ]
      );

      const detail = await getAssetDetail(client, asset.id);
      await client.query("COMMIT");
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async restoreAssetVersion(stableId: string, input: AssetRestoreInput): Promise<AssetDetail | null> {
    const parsed = assetRestoreInputSchema.parse(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const target = await client.query<{
        asset_id: string;
        version_id: string;
        asset_snapshot: AssetVersionAssetSnapshot;
      }>(
        `
          SELECT assets.id AS asset_id, asset_versions.id AS version_id, asset_versions.asset_snapshot
          FROM assets
          JOIN asset_versions ON asset_versions.asset_id = assets.id
          WHERE assets.tenant_id = $1
            AND assets.stable_id = $2
            AND (
              ($3::uuid IS NOT NULL AND asset_versions.id = $3::uuid)
              OR ($4::integer IS NOT NULL AND asset_versions.version_number = $4::integer)
            )
          FOR UPDATE OF assets
          LIMIT 1
        `,
        [parsed.tenantId, stableId, parsed.versionId ?? null, parsed.versionNumber ?? null]
      );
      const row = target.rows[0];

      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      const snapshot = assetVersionAssetSnapshotSchema.parse(row.asset_snapshot);
      await updateAssetRecordFromSnapshot(client, row.asset_id, row.version_id, snapshot);

      const detail = await getAssetDetail(client, row.asset_id);
      await client.query("COMMIT");
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reviewAsset(stableId: string, input: AssetReviewInput): Promise<AssetDetail | null> {
    const parsed = assetReviewInputSchema.parse(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<AssetRow>(
        "SELECT * FROM assets WHERE tenant_id = $1 AND stable_id = $2 FOR UPDATE",
        [parsed.tenantId, stableId]
      );
      const asset = result.rows[0];

      if (!asset) {
        await client.query("ROLLBACK");
        return null;
      }

      const snapshot = assetVersionAssetSnapshotSchema.parse({
        ...assetRecordToVersionSnapshot(mapAssetRow(asset)),
        status: parsed.status,
        reviewDueAt: parsed.reviewDueAt,
        sourceRef: parsed.sourceRef ?? asset.source_ref
      });
      const versionId = await createPostgresVersionFromCurrent(
        client,
        asset,
        snapshot,
        parsed.changeNote ?? "Review asset"
      );
      await updateAssetRecordFromSnapshot(client, asset.id, versionId, snapshot);
      const detail = await getAssetDetail(client, asset.id);
      await client.query("COMMIT");
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async publishAsset(stableId: string, input: AssetPublishInput): Promise<AssetDetail | null> {
    const parsed = assetPublishInputSchema.parse(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<AssetRow>(
        "SELECT * FROM assets WHERE tenant_id = $1 AND stable_id = $2 FOR UPDATE",
        [parsed.tenantId, stableId]
      );
      const asset = result.rows[0];

      if (!asset) {
        await client.query("ROLLBACK");
        return null;
      }

      const snapshot = assetVersionAssetSnapshotSchema.parse({
        ...assetRecordToVersionSnapshot(mapAssetRow(asset)),
        lifecycleState: "active",
        status: "approved",
        reviewDueAt: parsed.reviewDueAt ?? toDateOnly(asset.review_due_at)
      });
      const versionId = await createPostgresVersionFromCurrent(
        client,
        asset,
        snapshot,
        parsed.changeNote ?? "Publish asset"
      );
      await updateAssetRecordFromSnapshot(client, asset.id, versionId, snapshot);
      const detail = await getAssetDetail(client, asset.id);
      await client.query("COMMIT");
      return detail;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async getAssetDetail(assetId: string): Promise<AssetDetail> {
    return getAssetDetail(this.pool, assetId);
  }
}

export class InMemoryRegistryRepository implements RegistryRepository {
  private readonly assets = new Map<string, AssetDetail>();
  private sequence = 0;

  async listAssets(options: RegistryListOptions = {}): Promise<AssetRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    return Array.from(this.assets.values())
      .map((detail) => detail.asset)
      .filter((asset) => asset.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.stableId.localeCompare(right.stableId))
      .slice(0, limit);
  }

  async listAssetsNeedingReview(input: AssetReviewQueueInput = {}): Promise<AssetReviewQueueResponse> {
    const parsed = assetReviewQueueInputSchema.parse({
      ...input,
      asOf: input.asOf ?? todayDateOnly()
    });
    const asOf = parsed.asOf ?? todayDateOnly();
    const includeApproved = parsed.includeApproved ?? false;
    const limit = parsed.limit ?? 50;
    const assets = Array.from(this.assets.values())
      .map((detail) => detail.asset)
      .filter((asset) => asset.tenantId === parsed.tenantId)
      .filter((asset) =>
        includeApproved ||
        asset.lifecycleState !== "active" ||
        asset.status !== "approved" ||
        asset.reviewDueAt <= asOf
      )
      .sort((left, right) =>
        left.reviewDueAt.localeCompare(right.reviewDueAt) ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.stableId.localeCompare(right.stableId)
      )
      .slice(0, limit);

    return assetReviewQueueResponseSchema.parse({
      asOf,
      includeApproved,
      assets
    });
  }

  async getAssetByStableId(stableId: string, options: RegistryGetOptions = {}): Promise<AssetDetail | null> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const detail = this.assets.get(`${tenantId}:${stableId}`);
    return detail ? filterCurrentDetail(detail) : null;
  }

  async getAssetVersionSnapshot(
    stableId: string,
    input: AssetVersionSnapshotInput
  ): Promise<AssetVersionSnapshot | null> {
    const parsed = assetVersionSnapshotInputSchema.parse(input);
    const detail = this.assets.get(`${parsed.tenantId}:${stableId}`);

    if (!detail) {
      return null;
    }

    const version = detail.versions.find((candidate) =>
      (parsed.versionId && candidate.id === parsed.versionId) ||
      (parsed.versionNumber && candidate.versionNumber === parsed.versionNumber)
    );

    if (!version) {
      return null;
    }

    return assetVersionSnapshotSchema.parse({
      asset: assetRecordFromVersionSnapshot(detail.asset, version),
      version,
      instructionObjects: detail.instructionObjects.filter((instruction) => instruction.versionId === version.id),
      humanDocuments: detail.humanDocuments.filter((document) => document.versionId === version.id)
    });
  }

  async createAsset(input: AssetCreateInput): Promise<AssetDetail> {
    const parsed = assetCreateInputSchema.parse(input);
    const key = `${parsed.tenantId}:${parsed.stableId}`;

    if (this.assets.has(key)) {
      throw new DuplicateAssetError(parsed.stableId);
    }

    this.sequence += 1;
    const now = new Date().toISOString();
    const assetId = `asset_${this.sequence}`;
    const versionId = `version_${this.sequence}`;
    const instructionId = `instruction_${this.sequence}`;
    const humanDocumentId = `human_document_${this.sequence}`;
    const assetSnapshot = buildAssetSnapshotFromCreate(parsed);
    const versionContent: GovernedVersionContent = {
      instructionObjects: parsed.instruction ? [parsed.instruction] : [],
      humanDocuments: parsed.humanDocument ? [parsed.humanDocument] : []
    };
    const asset = assetRecordSchema.parse({
      id: assetId,
      tenantId: parsed.tenantId,
      stableId: parsed.stableId,
      type: parsed.type,
      ownerId: parsed.ownerId,
      title: parsed.title,
      summary: parsed.summary,
      lifecycleState: parsed.lifecycleState,
      sensitivity: parsed.sensitivity,
      audience: parsed.audience,
      status: parsed.status,
      reviewDueAt: parsed.reviewDueAt,
      sourceKind: parsed.sourceKind,
      sourceRef: parsed.sourceRef ?? null,
      allowedSurfaces: parsed.allowedSurfaces,
      allowedExports: parsed.allowedExports,
      allowedActions: parsed.allowedActions,
      currentVersionId: versionId,
      metadata: parsed.metadata,
      createdAt: now,
      updatedAt: now
    });
    const version = assetVersionSchema.parse({
      id: versionId,
      assetId,
      versionNumber: 1,
      contentHash: hashGovernedAssetSnapshot(assetSnapshot, versionContent),
      metadata: parsed.metadata,
      assetSnapshot,
      createdBy: parsed.ownerId,
      createdAt: now,
      changeNote: parsed.changeNote ?? "Initial version"
    });
    const instructionObjects = parsed.instruction
      ? [
          agentInstructionSchema.parse({
            id: instructionId,
            assetId,
            versionId,
            createdAt: now,
            ...parsed.instruction,
            escalation: parsed.instruction.escalation ?? null
          })
        ]
      : [];
    const humanDocuments = parsed.humanDocument
      ? [
          humanDocumentSchema.parse({
            id: humanDocumentId,
            assetId,
            versionId,
            createdAt: now,
            ...parsed.humanDocument
          })
        ]
      : [];
    const detail = assetDetailSchema.parse({
      asset,
      versions: [version],
      instructionObjects,
      humanDocuments
    });

    this.assets.set(key, detail);
    return filterCurrentDetail(detail);
  }

  async updateAsset(stableId: string, input: AssetUpdateInput): Promise<AssetDetail | null> {
    const hasMetadataUpdate = Object.hasOwn(input, "metadata");
    const parsed = assetUpdateInputSchema.parse(input);
    const key = `${parsed.tenantId}:${stableId}`;
    const detail = this.assets.get(key);

    if (!detail) {
      return null;
    }

    this.sequence += 1;
    const now = new Date().toISOString();
    const versionId = `version_${this.sequence}`;
    const currentVersionId = detail.asset.currentVersionId;
    const currentInstructions = detail.instructionObjects.filter((instruction) => instruction.versionId === currentVersionId);
    const currentDocuments = detail.humanDocuments.filter((document) => document.versionId === currentVersionId);
    const versionNumber = Math.max(...detail.versions.map((version) => version.versionNumber)) + 1;
    const nextMetadata = hasMetadataUpdate ? parsed.metadata : detail.asset.metadata;
    const asset = assetRecordSchema.parse({
      ...detail.asset,
      title: parsed.title ?? detail.asset.title,
      summary: parsed.summary ?? detail.asset.summary,
      lifecycleState: parsed.lifecycleState ?? detail.asset.lifecycleState,
      sensitivity: parsed.sensitivity ?? detail.asset.sensitivity,
      audience: parsed.audience ?? detail.asset.audience,
      status: parsed.status ?? detail.asset.status,
      reviewDueAt: parsed.reviewDueAt ?? detail.asset.reviewDueAt,
      sourceRef: parsed.sourceRef ?? detail.asset.sourceRef,
      allowedSurfaces: parsed.allowedSurfaces ?? detail.asset.allowedSurfaces,
      allowedExports: parsed.allowedExports ?? detail.asset.allowedExports,
      allowedActions: parsed.allowedActions ?? detail.asset.allowedActions,
      currentVersionId: versionId,
      metadata: nextMetadata,
      updatedAt: now
    });
    const nextInstructions = parsed.instruction
      ? [
          agentInstructionSchema.parse({
            id: `instruction_${this.sequence}`,
            assetId: asset.id,
            versionId,
            createdAt: now,
            ...parsed.instruction,
            escalation: parsed.instruction.escalation ?? null
          })
        ]
      : currentInstructions.map((instruction, index) => agentInstructionSchema.parse({
          ...instruction,
          id: `instruction_${this.sequence}_${index}`,
          versionId,
          createdAt: now
        }));
    const nextDocuments = parsed.humanDocument
      ? [
          humanDocumentSchema.parse({
            id: `human_document_${this.sequence}`,
            assetId: asset.id,
            versionId,
            createdAt: now,
            ...parsed.humanDocument
          })
        ]
      : currentDocuments.map((document, index) => humanDocumentSchema.parse({
          ...document,
          id: `human_document_${this.sequence}_${index}`,
          versionId,
          createdAt: now
        }));
    const assetSnapshot = assetRecordToVersionSnapshot(asset);
    const versionContent: GovernedVersionContent = {
      instructionObjects: nextInstructions.map(agentInstructionToInput),
      humanDocuments: nextDocuments.map(humanDocumentToInput)
    };
    const version = assetVersionSchema.parse({
      id: versionId,
      assetId: asset.id,
      versionNumber,
      contentHash: hashGovernedAssetSnapshot(assetSnapshot, versionContent),
      metadata: nextMetadata,
      assetSnapshot,
      createdBy: asset.ownerId,
      createdAt: now,
      changeNote: parsed.changeNote ?? "Update asset"
    });
    const updated = assetDetailSchema.parse({
      asset,
      versions: [version, ...detail.versions],
      instructionObjects: [...detail.instructionObjects, ...nextInstructions],
      humanDocuments: [...detail.humanDocuments, ...nextDocuments]
    });

    this.assets.set(key, updated);
    return filterCurrentDetail(updated);
  }

  async restoreAssetVersion(stableId: string, input: AssetRestoreInput): Promise<AssetDetail | null> {
    const parsed = assetRestoreInputSchema.parse(input);
    const key = `${parsed.tenantId}:${stableId}`;
    const detail = this.assets.get(key);

    if (!detail) {
      return null;
    }

    const version = detail.versions.find((candidate) =>
      (parsed.versionId && candidate.id === parsed.versionId) ||
      (parsed.versionNumber && candidate.versionNumber === parsed.versionNumber)
    );

    if (!version) {
      return null;
    }

    const restored = assetDetailSchema.parse({
      ...detail,
      asset: assetRecordFromVersionSnapshot(detail.asset, version, new Date().toISOString())
    });

    this.assets.set(key, restored);
    return filterCurrentDetail(restored);
  }

  async reviewAsset(stableId: string, input: AssetReviewInput): Promise<AssetDetail | null> {
    const parsed = assetReviewInputSchema.parse(input);
    const key = `${parsed.tenantId}:${stableId}`;
    const detail = this.assets.get(key);

    if (!detail) {
      return null;
    }

    this.sequence += 1;
    const reviewed = createInMemoryVersionFromCurrent(
      detail,
      assetVersionAssetSnapshotSchema.parse({
        ...assetRecordToVersionSnapshot(detail.asset),
        status: parsed.status,
        reviewDueAt: parsed.reviewDueAt,
        sourceRef: parsed.sourceRef ?? detail.asset.sourceRef
      }),
      `version_${this.sequence}`,
      this.sequence,
      parsed.changeNote ?? "Review asset"
    );

    this.assets.set(key, reviewed);
    return filterCurrentDetail(reviewed);
  }

  async publishAsset(stableId: string, input: AssetPublishInput): Promise<AssetDetail | null> {
    const parsed = assetPublishInputSchema.parse(input);
    const key = `${parsed.tenantId}:${stableId}`;
    const detail = this.assets.get(key);

    if (!detail) {
      return null;
    }

    this.sequence += 1;
    const published = createInMemoryVersionFromCurrent(
      detail,
      assetVersionAssetSnapshotSchema.parse({
        ...assetRecordToVersionSnapshot(detail.asset),
        lifecycleState: "active",
        status: "approved",
        reviewDueAt: parsed.reviewDueAt ?? detail.asset.reviewDueAt
      }),
      `version_${this.sequence}`,
      this.sequence,
      parsed.changeNote ?? "Publish asset"
    );

    this.assets.set(key, published);
    return filterCurrentDetail(published);
  }
}

async function createPostgresVersionFromCurrent(
  client: Queryable,
  asset: AssetRow,
  snapshot: AssetVersionAssetSnapshot,
  changeNote: string
): Promise<string> {
  if (!asset.current_version_id) {
    throw new Error(`Asset ${asset.id} does not have a current version`);
  }

  const instructions = await client.query<InstructionObjectRow>(
    "SELECT * FROM instruction_objects WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [asset.id, asset.current_version_id]
  );
  const humanDocuments = await client.query<HumanDocumentRow>(
    "SELECT * FROM human_documents WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [asset.id, asset.current_version_id]
  );
  const nextVersion = await client.query<{ version_number: number }>(
    "SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number FROM asset_versions WHERE asset_id = $1",
    [asset.id]
  );
  const versionNumber = Number(nextVersion.rows[0]?.version_number ?? 1);
  const content: GovernedVersionContent = {
    instructionObjects: instructions.rows.map(mapInstructionInputRow),
    humanDocuments: humanDocuments.rows.map(mapHumanDocumentInputRow)
  };
  const version = await client.query<AssetVersionRow>(
    `
      INSERT INTO asset_versions (
        asset_id,
        version_number,
        content_hash,
        metadata,
        asset_snapshot,
        created_by,
        change_note
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
      RETURNING *
    `,
    [
      asset.id,
      versionNumber,
      hashGovernedAssetSnapshot(snapshot, content),
      JSON.stringify(snapshot.metadata),
      JSON.stringify(snapshot),
      asset.owner_id,
      changeNote
    ]
  );
  const versionId = requireRow(version).id;

  for (const instruction of instructions.rows) {
    await copyInstruction(client, versionId, instruction);
  }

  for (const document of humanDocuments.rows) {
    await copyHumanDocument(client, versionId, document);
  }

  return versionId;
}

async function updateAssetRecordFromSnapshot(
  client: Queryable,
  assetId: string,
  versionId: string,
  snapshot: AssetVersionAssetSnapshot
): Promise<void> {
  await client.query(
    `
      UPDATE assets
      SET
        type = $1,
        owner_id = $2,
        title = $3,
        summary = $4,
        lifecycle_state = $5,
        sensitivity = $6,
        audience = $7,
        status = $8,
        review_due_at = $9::date,
        source_kind = $10,
        source_ref = $11,
        allowed_surfaces = $12,
        allowed_exports = $13,
        allowed_actions = $14,
        metadata = $15::jsonb,
        current_version_id = $16,
        updated_at = now()
      WHERE id = $17
    `,
    [
      snapshot.type,
      snapshot.ownerId,
      snapshot.title,
      snapshot.summary,
      snapshot.lifecycleState,
      snapshot.sensitivity,
      snapshot.audience,
      snapshot.status,
      snapshot.reviewDueAt,
      snapshot.sourceKind,
      snapshot.sourceRef,
      snapshot.allowedSurfaces,
      snapshot.allowedExports,
      snapshot.allowedActions,
      JSON.stringify(snapshot.metadata),
      versionId,
      assetId
    ]
  );
}

function createInMemoryVersionFromCurrent(
  detail: AssetDetail,
  snapshot: AssetVersionAssetSnapshot,
  versionId: string,
  sequence: number,
  changeNote: string
): AssetDetail {
  const now = new Date().toISOString();
  const currentVersionId = detail.asset.currentVersionId;
  const currentInstructions = detail.instructionObjects.filter((instruction) => instruction.versionId === currentVersionId);
  const currentDocuments = detail.humanDocuments.filter((document) => document.versionId === currentVersionId);
  const nextInstructions = currentInstructions.map((instruction, index) => agentInstructionSchema.parse({
    ...instruction,
    id: `instruction_${sequence}_${index}`,
    versionId,
    createdAt: now
  }));
  const nextDocuments = currentDocuments.map((document, index) => humanDocumentSchema.parse({
    ...document,
    id: `human_document_${sequence}_${index}`,
    versionId,
    createdAt: now
  }));
  const content: GovernedVersionContent = {
    instructionObjects: nextInstructions.map(agentInstructionToInput),
    humanDocuments: nextDocuments.map(humanDocumentToInput)
  };
  const version = assetVersionSchema.parse({
    id: versionId,
    assetId: detail.asset.id,
    versionNumber: Math.max(...detail.versions.map((candidate) => candidate.versionNumber)) + 1,
    contentHash: hashGovernedAssetSnapshot(snapshot, content),
    metadata: snapshot.metadata,
    assetSnapshot: snapshot,
    createdBy: detail.asset.ownerId,
    createdAt: now,
    changeNote
  });
  const asset = assetRecordSchema.parse({
    ...detail.asset,
    ...snapshot,
    summary: snapshot.summary ?? undefined,
    currentVersionId: versionId,
    metadata: snapshot.metadata,
    updatedAt: now
  });

  return assetDetailSchema.parse({
    asset,
    versions: [version, ...detail.versions],
    instructionObjects: [...detail.instructionObjects, ...nextInstructions],
    humanDocuments: [...detail.humanDocuments, ...nextDocuments]
  });
}

async function ensureTenant(client: Queryable, tenantId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO tenants (id, slug, name)
      VALUES ($1, $1, $1)
      ON CONFLICT (id) DO NOTHING
    `,
    [tenantId]
  );
}

async function getAssetDetail(client: Queryable, assetId: string): Promise<AssetDetail> {
  const asset = await client.query<AssetRow>("SELECT * FROM assets WHERE id = $1", [assetId]);
  const assetRow = requireRow(asset);
  const versions = await client.query<AssetVersionRow>(
    "SELECT * FROM asset_versions WHERE asset_id = $1 ORDER BY version_number DESC",
    [assetId]
  );
  const instructions = await client.query<InstructionObjectRow>(
    "SELECT * FROM instruction_objects WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [assetId, assetRow.current_version_id]
  );
  const humanDocuments = await client.query<HumanDocumentRow>(
    "SELECT * FROM human_documents WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [assetId, assetRow.current_version_id]
  );

  return assetDetailSchema.parse({
    asset: mapAssetRow(assetRow),
    versions: versions.rows.map(mapAssetVersionRow),
    instructionObjects: instructions.rows.map(mapInstructionObjectRow),
    humanDocuments: humanDocuments.rows.map(mapHumanDocumentRow)
  });
}

async function getAssetVersionSnapshot(
  client: Queryable,
  stableId: string,
  input: AssetVersionSnapshotInput
): Promise<AssetVersionSnapshot | null> {
  const parsed = assetVersionSnapshotInputSchema.parse(input);
  const result = await client.query<AssetVersionSnapshotRow>(
    `
      SELECT
        assets.id AS asset_id,
        asset_versions.id AS version_id
      FROM assets
      JOIN asset_versions ON asset_versions.asset_id = assets.id
      WHERE assets.tenant_id = $1
        AND assets.stable_id = $2
        AND (
          ($3::uuid IS NOT NULL AND asset_versions.id = $3::uuid)
          OR ($4::integer IS NOT NULL AND asset_versions.version_number = $4::integer)
        )
      LIMIT 1
    `,
    [parsed.tenantId, stableId, parsed.versionId ?? null, parsed.versionNumber ?? null]
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const asset = await client.query<AssetRow>("SELECT * FROM assets WHERE id = $1", [row.asset_id]);
  const version = await client.query<AssetVersionRow>("SELECT * FROM asset_versions WHERE id = $1", [row.version_id]);
  const instructions = await client.query<InstructionObjectRow>(
    "SELECT * FROM instruction_objects WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [row.asset_id, row.version_id]
  );
  const humanDocuments = await client.query<HumanDocumentRow>(
    "SELECT * FROM human_documents WHERE asset_id = $1 AND version_id = $2 ORDER BY created_at ASC",
    [row.asset_id, row.version_id]
  );
  const mappedVersion = mapAssetVersionRow(requireRow(version));

  return assetVersionSnapshotSchema.parse({
    asset: assetRecordFromVersionSnapshot(mapAssetRow(requireRow(asset)), mappedVersion),
    version: mappedVersion,
    instructionObjects: instructions.rows.map(mapInstructionObjectRow),
    humanDocuments: humanDocuments.rows.map(mapHumanDocumentRow)
  });
}

async function insertInstruction(
  client: Queryable,
  assetId: string,
  versionId: string,
  instruction: AgentInstructionInput
): Promise<void> {
  await client.query(
    `
      INSERT INTO instruction_objects (
        asset_id,
        version_id,
        instruction_kind,
        target_agents,
        body,
        input_contract,
        output_contract,
        constraints_list,
        examples,
        failure_modes,
        escalation
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
    `,
    [
      assetId,
      versionId,
      instruction.instructionKind,
      instruction.targetAgents,
      instruction.body,
      JSON.stringify(instruction.inputContract),
      JSON.stringify(instruction.outputContract),
      instruction.constraints,
      instruction.examples,
      instruction.failureModes,
      instruction.escalation ?? null
    ]
  );
}

async function insertHumanDocument(
  client: Queryable,
  assetId: string,
  versionId: string,
  document: HumanDocumentInput
): Promise<void> {
  await client.query(
    `
      INSERT INTO human_documents (
        asset_id,
        version_id,
        format,
        body,
        render_options,
        linked_instruction_ids
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    `,
    [
      assetId,
      versionId,
      document.format,
      document.body,
      JSON.stringify(document.renderOptions),
      document.linkedInstructionIds
    ]
  );
}

async function copyInstruction(
  client: Queryable,
  versionId: string,
  instruction: InstructionObjectRow
): Promise<void> {
  await client.query(
    `
      INSERT INTO instruction_objects (
        asset_id,
        version_id,
        instruction_kind,
        target_agents,
        body,
        input_contract,
        output_contract,
        constraints_list,
        examples,
        failure_modes,
        escalation
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
    `,
    [
      instruction.asset_id,
      versionId,
      instruction.instruction_kind,
      instruction.target_agents,
      instruction.body,
      JSON.stringify(instruction.input_contract),
      JSON.stringify(instruction.output_contract),
      instruction.constraints_list,
      instruction.examples,
      instruction.failure_modes,
      instruction.escalation
    ]
  );
}

async function copyHumanDocument(
  client: Queryable,
  versionId: string,
  document: HumanDocumentRow
): Promise<void> {
  await client.query(
    `
      INSERT INTO human_documents (
        asset_id,
        version_id,
        format,
        body,
        render_options,
        linked_instruction_ids
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    `,
    [
      document.asset_id,
      versionId,
      document.format,
      document.body,
      JSON.stringify(document.render_options),
      document.linked_instruction_ids
    ]
  );
}

function filterCurrentDetail(detail: AssetDetail): AssetDetail {
  return assetDetailSchema.parse({
    asset: detail.asset,
    versions: detail.versions,
    instructionObjects: detail.instructionObjects.filter((instruction) =>
      instruction.versionId === detail.asset.currentVersionId
    ),
    humanDocuments: detail.humanDocuments.filter((document) =>
      document.versionId === detail.asset.currentVersionId
    )
  });
}

function requireRow<T extends QueryResultRow>(result: QueryResult<T>): T {
  const row = result.rows[0];

  if (!row) {
    throw new Error("Expected database row");
  }

  return row;
}

type ParsedAssetCreateInput = ReturnType<typeof assetCreateInputSchema.parse>;
type ParsedAssetUpdateInput = ReturnType<typeof assetUpdateInputSchema.parse>;

interface GovernedVersionContent {
  instructionObjects: AgentInstructionInput[];
  humanDocuments: HumanDocumentInput[];
}

function buildAssetSnapshotFromCreate(input: ParsedAssetCreateInput): AssetVersionAssetSnapshot {
  return assetVersionAssetSnapshotSchema.parse({
    stableId: input.stableId,
    type: input.type,
    ownerId: input.ownerId,
    title: input.title,
    summary: input.summary ?? null,
    lifecycleState: input.lifecycleState,
    sensitivity: input.sensitivity,
    audience: input.audience,
    status: input.status,
    reviewDueAt: input.reviewDueAt,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef ?? null,
    allowedSurfaces: input.allowedSurfaces,
    allowedExports: input.allowedExports,
    allowedActions: input.allowedActions,
    metadata: input.metadata
  });
}

function buildAssetSnapshotFromUpdate(
  current: AssetRecord,
  input: ParsedAssetUpdateInput,
  hasMetadataUpdate: boolean
): AssetVersionAssetSnapshot {
  return assetVersionAssetSnapshotSchema.parse({
    ...assetRecordToVersionSnapshot(current),
    title: input.title ?? current.title,
    summary: input.summary ?? current.summary ?? null,
    lifecycleState: input.lifecycleState ?? current.lifecycleState,
    sensitivity: input.sensitivity ?? current.sensitivity,
    audience: input.audience ?? current.audience,
    status: input.status ?? current.status,
    reviewDueAt: input.reviewDueAt ?? current.reviewDueAt,
    sourceRef: input.sourceRef ?? current.sourceRef,
    allowedSurfaces: input.allowedSurfaces ?? current.allowedSurfaces,
    allowedExports: input.allowedExports ?? current.allowedExports,
    allowedActions: input.allowedActions ?? current.allowedActions,
    metadata: hasMetadataUpdate ? input.metadata : current.metadata
  });
}

function assetRecordToVersionSnapshot(asset: AssetRecord): AssetVersionAssetSnapshot {
  return assetVersionAssetSnapshotSchema.parse({
    stableId: asset.stableId,
    type: asset.type,
    ownerId: asset.ownerId,
    title: asset.title,
    summary: asset.summary ?? null,
    lifecycleState: asset.lifecycleState,
    sensitivity: asset.sensitivity,
    audience: asset.audience,
    status: asset.status,
    reviewDueAt: asset.reviewDueAt,
    sourceKind: asset.sourceKind,
    sourceRef: asset.sourceRef,
    allowedSurfaces: asset.allowedSurfaces,
    allowedExports: asset.allowedExports,
    allowedActions: asset.allowedActions,
    metadata: asset.metadata
  });
}

function assetRecordFromVersionSnapshot(
  current: AssetRecord,
  version: AssetVersion,
  updatedAt = version.createdAt
): AssetRecord {
  const snapshot = version.assetSnapshot ?? assetVersionAssetSnapshotSchema.parse({
    ...assetRecordToVersionSnapshot(current),
    metadata: version.metadata
  });

  return assetRecordSchema.parse({
    ...current,
    ...snapshot,
    summary: snapshot.summary ?? undefined,
    currentVersionId: version.id,
    metadata: snapshot.metadata,
    updatedAt
  });
}

function hashGovernedAssetSnapshot(
  assetSnapshot: AssetVersionAssetSnapshot,
  content: GovernedVersionContent
): string {
  const canonicalSnapshot = {
    asset: assetVersionAssetSnapshotSchema.parse(assetSnapshot),
    instructionObjects: content.instructionObjects.map((instruction) => ({
      instructionKind: instruction.instructionKind,
      targetAgents: instruction.targetAgents,
      body: instruction.body,
      inputContract: instruction.inputContract,
      outputContract: instruction.outputContract,
      constraints: instruction.constraints,
      examples: instruction.examples,
      failureModes: instruction.failureModes,
      escalation: instruction.escalation ?? null
    })),
    humanDocuments: content.humanDocuments.map((document) => ({
      format: document.format,
      body: document.body,
      renderOptions: document.renderOptions,
      linkedInstructionIds: document.linkedInstructionIds
    }))
  };

  return createHash("sha256").update(stableJson(canonicalSnapshot)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonValue(entry)])
    );
  }

  return value;
}

function mapInstructionInputRow(row: InstructionObjectRow): AgentInstructionInput {
  return {
    instructionKind: row.instruction_kind,
    targetAgents: row.target_agents,
    body: row.body,
    inputContract: row.input_contract,
    outputContract: row.output_contract,
    constraints: row.constraints_list,
    examples: row.examples,
    failureModes: row.failure_modes,
    escalation: row.escalation ?? undefined
  };
}

function mapHumanDocumentInputRow(row: HumanDocumentRow): HumanDocumentInput {
  return {
    format: row.format as HumanDocumentInput["format"],
    body: row.body,
    renderOptions: row.render_options,
    linkedInstructionIds: row.linked_instruction_ids
  };
}

function agentInstructionToInput(instruction: AssetDetail["instructionObjects"][number]): AgentInstructionInput {
  return {
    instructionKind: instruction.instructionKind,
    targetAgents: instruction.targetAgents,
    body: instruction.body,
    inputContract: instruction.inputContract,
    outputContract: instruction.outputContract,
    constraints: instruction.constraints,
    examples: instruction.examples,
    failureModes: instruction.failureModes,
    escalation: instruction.escalation ?? undefined
  };
}

function humanDocumentToInput(document: AssetDetail["humanDocuments"][number]): HumanDocumentInput {
  return {
    format: document.format,
    body: document.body,
    renderOptions: document.renderOptions,
    linkedInstructionIds: document.linkedInstructionIds
  };
}

function mapAssetRow(row: AssetRow): AssetRecord {
  return assetRecordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    stableId: row.stable_id,
    type: row.type,
    ownerId: row.owner_id,
    title: row.title,
    summary: row.summary ?? undefined,
    lifecycleState: row.lifecycle_state,
    sensitivity: row.sensitivity,
    audience: row.audience,
    status: row.status,
    reviewDueAt: toDateOnly(row.review_due_at),
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    allowedSurfaces: row.allowed_surfaces,
    allowedExports: row.allowed_exports,
    allowedActions: row.allowed_actions,
    currentVersionId: row.current_version_id,
    metadata: row.metadata,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  });
}

function mapAssetVersionRow(row: AssetVersionRow) {
  return assetVersionSchema.parse({
    id: row.id,
    assetId: row.asset_id,
    versionNumber: row.version_number,
    contentHash: row.content_hash,
    metadata: row.metadata,
    assetSnapshot: row.asset_snapshot,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    changeNote: row.change_note
  });
}

function mapInstructionObjectRow(row: InstructionObjectRow) {
  return agentInstructionSchema.parse({
    id: row.id,
    assetId: row.asset_id,
    versionId: row.version_id,
    instructionKind: row.instruction_kind,
    targetAgents: row.target_agents,
    body: row.body,
    inputContract: row.input_contract,
    outputContract: row.output_contract,
    constraints: row.constraints_list,
    examples: row.examples,
    failureModes: row.failure_modes,
    escalation: row.escalation,
    createdAt: toIso(row.created_at)
  });
}

function mapHumanDocumentRow(row: HumanDocumentRow) {
  return humanDocumentSchema.parse({
    id: row.id,
    assetId: row.asset_id,
    versionId: row.version_id,
    format: row.format,
    body: row.body,
    renderOptions: row.render_options,
    linkedInstructionIds: row.linked_instruction_ids,
    createdAt: toIso(row.created_at)
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDateOnly(value: Date | string): string {
  if (!(value instanceof Date)) {
    return value;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

interface AssetRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  stable_id: string;
  type: string;
  owner_id: string;
  title: string;
  summary: string | null;
  lifecycle_state: string;
  sensitivity: string;
  audience: string[];
  status: string;
  review_due_at: Date | string;
  source_kind: string | null;
  source_ref: string | null;
  allowed_surfaces: string[];
  allowed_exports: string[];
  allowed_actions: string[];
  metadata: Record<string, unknown>;
  current_version_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AssetVersionRow extends QueryResultRow {
  id: string;
  asset_id: string;
  version_number: number;
  content_hash: string;
  metadata: Record<string, unknown>;
  asset_snapshot: AssetVersionAssetSnapshot;
  created_by: string | null;
  created_at: Date | string;
  change_note: string | null;
}

interface AssetVersionSnapshotRow extends QueryResultRow {
  asset_id: string;
  version_id: string;
}

interface InstructionObjectRow extends QueryResultRow {
  id: string;
  asset_id: string;
  version_id: string;
  instruction_kind: string;
  target_agents: string[];
  body: string;
  input_contract: Record<string, unknown>;
  output_contract: Record<string, unknown>;
  constraints_list: string[];
  examples: string[];
  failure_modes: string[];
  escalation: string | null;
  created_at: Date | string;
}

interface HumanDocumentRow extends QueryResultRow {
  id: string;
  asset_id: string;
  version_id: string;
  format: string;
  body: string;
  render_options: Record<string, unknown>;
  linked_instruction_ids: string[];
  created_at: Date | string;
}
