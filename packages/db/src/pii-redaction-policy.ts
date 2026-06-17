import type { Pool, QueryResultRow } from "pg";
import {
  piiRedactionPolicyInputSchema,
  piiRedactionPolicySchema,
  piiRedactionRuleKindSchema,
  type PiiRedactionPolicy,
  type PiiRedactionPolicyInput,
  type PiiRedactionRuleKind
} from "@agentic-cms/schema";

export const DEFAULT_PII_REDACTION_POLICY = {
  redactionEnabled: true,
  enabledRuleKinds: [...piiRedactionRuleKindSchema.options] as PiiRedactionRuleKind[]
};

export interface PiiRedactionPolicyRepositoryInput extends PiiRedactionPolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface PiiRedactionPolicyRepository {
  getPolicy(tenantId?: string): Promise<PiiRedactionPolicy>;
  upsertPolicy(input: PiiRedactionPolicyRepositoryInput): Promise<PiiRedactionPolicy>;
}

export class PostgresPiiRedactionPolicyRepository implements PiiRedactionPolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<PiiRedactionPolicy> {
    const result = await this.pool.query<PiiRedactionPolicyRow>(
      "SELECT * FROM pii_redaction_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapPiiRedactionPolicyRow(row) : defaultPiiRedactionPolicy(tenantId);
  }

  async upsertPolicy(input: PiiRedactionPolicyRepositoryInput): Promise<PiiRedactionPolicy> {
    const parsed = piiRedactionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = {
      redactionEnabled: parsed.redactionEnabled ?? current.redactionEnabled,
      enabledRuleKinds: parsed.enabledRuleKinds === undefined
        ? current.enabledRuleKinds
        : uniqueRuleKinds(parsed.enabledRuleKinds)
    };

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<PiiRedactionPolicyRow>(
      `
        INSERT INTO pii_redaction_policies (
          tenant_id,
          redaction_enabled,
          enabled_rule_kinds,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          redaction_enabled = EXCLUDED.redaction_enabled,
          enabled_rule_kinds = EXCLUDED.enabled_rule_kinds,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.redactionEnabled,
        next.enabledRuleKinds,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapPiiRedactionPolicyRow(requireRow(result.rows));
  }
}

export class InMemoryPiiRedactionPolicyRepository implements PiiRedactionPolicyRepository {
  private readonly policies = new Map<string, PiiRedactionPolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<PiiRedactionPolicy> {
    return this.policies.get(tenantId) ?? defaultPiiRedactionPolicy(tenantId);
  }

  async upsertPolicy(input: PiiRedactionPolicyRepositoryInput): Promise<PiiRedactionPolicy> {
    const parsed = piiRedactionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = piiRedactionPolicySchema.parse({
      tenantId: parsed.tenantId,
      redactionEnabled: parsed.redactionEnabled ?? current.redactionEnabled,
      enabledRuleKinds: parsed.enabledRuleKinds === undefined
        ? current.enabledRuleKinds
        : uniqueRuleKinds(parsed.enabledRuleKinds),
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

export function defaultPiiRedactionPolicy(tenantId: string): PiiRedactionPolicy {
  return piiRedactionPolicySchema.parse({
    tenantId,
    ...DEFAULT_PII_REDACTION_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function mapPiiRedactionPolicyRow(row: PiiRedactionPolicyRow): PiiRedactionPolicy {
  return piiRedactionPolicySchema.parse({
    tenantId: row.tenant_id,
    redactionEnabled: row.redaction_enabled,
    enabledRuleKinds: row.enabled_rule_kinds,
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

function uniqueRuleKinds(values: PiiRedactionRuleKind[]): PiiRedactionRuleKind[] {
  return Array.from(new Set(values));
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error("Expected query to return a row");
  }

  return row;
}

interface PiiRedactionPolicyRow extends QueryResultRow {
  tenant_id: string;
  redaction_enabled: boolean;
  enabled_rule_kinds: PiiRedactionRuleKind[];
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
