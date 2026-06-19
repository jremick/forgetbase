import type { Pool, QueryResultRow } from "pg";
import {
  managedQueryRetentionPolicyInputSchema,
  managedQueryRetentionPolicySchema,
  type ManagedQueryRetentionCaptureMode,
  type ManagedQueryRetentionPolicy,
  type ManagedQueryRetentionPolicyInput
} from "@forgetbase/schema";

export const DEFAULT_MANAGED_QUERY_RETENTION_POLICY = {
  promptCaptureMode: "disabled",
  responseCaptureMode: "disabled",
  metadataRetentionDays: 30
} as const;

export interface ManagedQueryRetentionPolicyRepositoryInput extends ManagedQueryRetentionPolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface ManagedQueryRetentionPolicyRepository {
  getPolicy(tenantId?: string): Promise<ManagedQueryRetentionPolicy>;
  upsertPolicy(input: ManagedQueryRetentionPolicyRepositoryInput): Promise<ManagedQueryRetentionPolicy>;
}

export class PostgresManagedQueryRetentionPolicyRepository implements ManagedQueryRetentionPolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryRetentionPolicy> {
    const result = await this.pool.query<ManagedQueryRetentionPolicyRow>(
      "SELECT * FROM managed_query_retention_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapManagedQueryRetentionPolicyRow(row) : defaultManagedQueryRetentionPolicy(tenantId);
  }

  async upsertPolicy(input: ManagedQueryRetentionPolicyRepositoryInput): Promise<ManagedQueryRetentionPolicy> {
    const parsed = managedQueryRetentionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = {
      promptCaptureMode: parsed.promptCaptureMode === undefined
        ? current.promptCaptureMode
        : parsed.promptCaptureMode,
      responseCaptureMode: parsed.responseCaptureMode === undefined
        ? current.responseCaptureMode
        : parsed.responseCaptureMode,
      metadataRetentionDays: parsed.metadataRetentionDays === undefined
        ? current.metadataRetentionDays
        : parsed.metadataRetentionDays
    };

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<ManagedQueryRetentionPolicyRow>(
      `
        INSERT INTO managed_query_retention_policies (
          tenant_id,
          prompt_capture_mode,
          response_capture_mode,
          metadata_retention_days,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          prompt_capture_mode = EXCLUDED.prompt_capture_mode,
          response_capture_mode = EXCLUDED.response_capture_mode,
          metadata_retention_days = EXCLUDED.metadata_retention_days,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.promptCaptureMode,
        next.responseCaptureMode,
        next.metadataRetentionDays,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapManagedQueryRetentionPolicyRow(requireRow(result.rows));
  }
}

export class InMemoryManagedQueryRetentionPolicyRepository implements ManagedQueryRetentionPolicyRepository {
  private readonly policies = new Map<string, ManagedQueryRetentionPolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryRetentionPolicy> {
    return this.policies.get(tenantId) ?? defaultManagedQueryRetentionPolicy(tenantId);
  }

  async upsertPolicy(input: ManagedQueryRetentionPolicyRepositoryInput): Promise<ManagedQueryRetentionPolicy> {
    const parsed = managedQueryRetentionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = managedQueryRetentionPolicySchema.parse({
      tenantId: parsed.tenantId,
      promptCaptureMode: parsed.promptCaptureMode === undefined
        ? current.promptCaptureMode
        : parsed.promptCaptureMode,
      responseCaptureMode: parsed.responseCaptureMode === undefined
        ? current.responseCaptureMode
        : parsed.responseCaptureMode,
      metadataRetentionDays: parsed.metadataRetentionDays === undefined
        ? current.metadataRetentionDays
        : parsed.metadataRetentionDays,
      source: "stored",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedByServiceAccountId: input.updatedByServiceAccountId ?? null,
      updatedByApiKeyId: input.updatedByApiKeyId ?? null,
      createdAt: current.createdAt ?? now,
      updatedAt: now
    });

    this.policies.set(parsed.tenantId, policy);
    return policy;
  }
}

export function defaultManagedQueryRetentionPolicy(tenantId: string): ManagedQueryRetentionPolicy {
  return managedQueryRetentionPolicySchema.parse({
    tenantId,
    ...DEFAULT_MANAGED_QUERY_RETENTION_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function mapManagedQueryRetentionPolicyRow(row: ManagedQueryRetentionPolicyRow): ManagedQueryRetentionPolicy {
  return managedQueryRetentionPolicySchema.parse({
    tenantId: row.tenant_id,
    promptCaptureMode: row.prompt_capture_mode,
    responseCaptureMode: row.response_capture_mode,
    metadataRetentionDays: row.metadata_retention_days,
    source: "stored",
    updatedByUserId: row.updated_by_user_id,
    updatedByServiceAccountId: row.updated_by_service_account_id,
    updatedByApiKeyId: row.updated_by_api_key_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

async function ensureTenant(pool: Pool, tenantId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO tenants (id, slug, name)
      VALUES ($1, $1, $1)
      ON CONFLICT (id) DO NOTHING
    `,
    [tenantId]
  );
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error("Expected query to return a row");
  }

  return row;
}

interface ManagedQueryRetentionPolicyRow extends QueryResultRow {
  tenant_id: string;
  prompt_capture_mode: ManagedQueryRetentionCaptureMode;
  response_capture_mode: ManagedQueryRetentionCaptureMode;
  metadata_retention_days: number | null;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
