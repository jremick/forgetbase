import type { Pool, QueryResultRow } from "pg";
import {
  managedQueryPolicyInputSchema,
  managedQueryPolicySchema,
  type ManagedQueryMode,
  type ManagedQueryPolicy,
  type ManagedQueryPolicyInput
} from "@forgetbase/schema";

export const DEFAULT_MANAGED_QUERY_POLICY = {
  defaultMode: "deterministic-retrieval" as ManagedQueryMode,
  allowedModes: ["deterministic-retrieval", "provider-routed"] as ManagedQueryMode[],
  minimumCitationCount: 1,
  requireGrounded: false
} as const;

export interface ManagedQueryPolicyRepositoryInput extends ManagedQueryPolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface ManagedQueryPolicyRepository {
  getPolicy(tenantId?: string): Promise<ManagedQueryPolicy>;
  upsertPolicy(input: ManagedQueryPolicyRepositoryInput): Promise<ManagedQueryPolicy>;
}

export class PostgresManagedQueryPolicyRepository implements ManagedQueryPolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryPolicy> {
    const result = await this.pool.query<ManagedQueryPolicyRow>(
      "SELECT * FROM managed_query_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapManagedQueryPolicyRow(row) : defaultManagedQueryPolicy(tenantId);
  }

  async upsertPolicy(input: ManagedQueryPolicyRepositoryInput): Promise<ManagedQueryPolicy> {
    const parsed = managedQueryPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = managedQueryPolicySchema.parse({
      tenantId: parsed.tenantId,
      defaultMode: parsed.defaultMode ?? current.defaultMode,
      allowedModes: parsed.allowedModes === undefined ? current.allowedModes : uniqueModes(parsed.allowedModes),
      minimumCitationCount: parsed.minimumCitationCount ?? current.minimumCitationCount,
      requireGrounded: parsed.requireGrounded ?? current.requireGrounded,
      source: "stored",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedByServiceAccountId: input.updatedByServiceAccountId ?? null,
      updatedByApiKeyId: input.updatedByApiKeyId ?? null,
      createdAt: current.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<ManagedQueryPolicyRow>(
      `
        INSERT INTO managed_query_policies (
          tenant_id,
          default_mode,
          allowed_modes,
          minimum_citation_count,
          require_grounded,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          default_mode = EXCLUDED.default_mode,
          allowed_modes = EXCLUDED.allowed_modes,
          minimum_citation_count = EXCLUDED.minimum_citation_count,
          require_grounded = EXCLUDED.require_grounded,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.defaultMode,
        next.allowedModes,
        next.minimumCitationCount,
        next.requireGrounded,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapManagedQueryPolicyRow(requireRow(result.rows));
  }
}

export class InMemoryManagedQueryPolicyRepository implements ManagedQueryPolicyRepository {
  private readonly policies = new Map<string, ManagedQueryPolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryPolicy> {
    return this.policies.get(tenantId) ?? defaultManagedQueryPolicy(tenantId);
  }

  async upsertPolicy(input: ManagedQueryPolicyRepositoryInput): Promise<ManagedQueryPolicy> {
    const parsed = managedQueryPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = managedQueryPolicySchema.parse({
      tenantId: parsed.tenantId,
      defaultMode: parsed.defaultMode ?? current.defaultMode,
      allowedModes: parsed.allowedModes === undefined ? current.allowedModes : uniqueModes(parsed.allowedModes),
      minimumCitationCount: parsed.minimumCitationCount ?? current.minimumCitationCount,
      requireGrounded: parsed.requireGrounded ?? current.requireGrounded,
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

export function defaultManagedQueryPolicy(tenantId: string): ManagedQueryPolicy {
  return managedQueryPolicySchema.parse({
    tenantId,
    ...DEFAULT_MANAGED_QUERY_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function mapManagedQueryPolicyRow(row: ManagedQueryPolicyRow): ManagedQueryPolicy {
  return managedQueryPolicySchema.parse({
    tenantId: row.tenant_id,
    defaultMode: row.default_mode,
    allowedModes: row.allowed_modes,
    minimumCitationCount: row.minimum_citation_count,
    requireGrounded: row.require_grounded,
    source: "stored",
    updatedByUserId: row.updated_by_user_id,
    updatedByServiceAccountId: row.updated_by_service_account_id,
    updatedByApiKeyId: row.updated_by_api_key_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

function uniqueModes(modes: ManagedQueryMode[]): ManagedQueryMode[] {
  return Array.from(new Set(modes));
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
    throw new Error("Expected query to return a row.");
  }

  return row;
}

interface ManagedQueryPolicyRow extends QueryResultRow {
  tenant_id: string;
  default_mode: ManagedQueryMode;
  allowed_modes: ManagedQueryMode[];
  minimum_citation_count: number;
  require_grounded: boolean;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
