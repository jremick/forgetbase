import type { Pool, QueryResultRow } from "pg";
import {
  secretReferencePolicyInputSchema,
  secretReferencePolicySchema,
  type SecretReferencePolicy,
  type SecretReferencePolicyInput
} from "@forgetbase/schema";

export const DEFAULT_SECRET_REFERENCE_POLICY = {
  allowedEnvVarPrefixes: ["FORGETBASE_", "OPENAI_", "ANTHROPIC_", "OPENROUTER_", "ENTRA_", "OIDC_"],
  allowedEnvVars: [] as string[],
  allowUnlistedEnvVars: false
};

export interface SecretReferencePolicyRepositoryInput extends SecretReferencePolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface SecretReferencePolicyRepository {
  getPolicy(tenantId?: string): Promise<SecretReferencePolicy>;
  upsertPolicy(input: SecretReferencePolicyRepositoryInput): Promise<SecretReferencePolicy>;
}

export class PostgresSecretReferencePolicyRepository implements SecretReferencePolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<SecretReferencePolicy> {
    const result = await this.pool.query<SecretReferencePolicyRow>(
      "SELECT * FROM secret_reference_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapSecretReferencePolicyRow(row) : defaultSecretReferencePolicy(tenantId);
  }

  async upsertPolicy(input: SecretReferencePolicyRepositoryInput): Promise<SecretReferencePolicy> {
    const parsed = secretReferencePolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = {
      allowedEnvVarPrefixes: parsed.allowedEnvVarPrefixes === undefined
        ? current.allowedEnvVarPrefixes
        : uniqueValues(parsed.allowedEnvVarPrefixes),
      allowedEnvVars: parsed.allowedEnvVars === undefined
        ? current.allowedEnvVars
        : uniqueValues(parsed.allowedEnvVars),
      allowUnlistedEnvVars: parsed.allowUnlistedEnvVars ?? current.allowUnlistedEnvVars
    };

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<SecretReferencePolicyRow>(
      `
        INSERT INTO secret_reference_policies (
          tenant_id,
          allowed_env_var_prefixes,
          allowed_env_vars,
          allow_unlisted_env_vars,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          allowed_env_var_prefixes = EXCLUDED.allowed_env_var_prefixes,
          allowed_env_vars = EXCLUDED.allowed_env_vars,
          allow_unlisted_env_vars = EXCLUDED.allow_unlisted_env_vars,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.allowedEnvVarPrefixes,
        next.allowedEnvVars,
        next.allowUnlistedEnvVars,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapSecretReferencePolicyRow(requireRow(result.rows));
  }
}

export class InMemorySecretReferencePolicyRepository implements SecretReferencePolicyRepository {
  private readonly policies = new Map<string, SecretReferencePolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<SecretReferencePolicy> {
    return this.policies.get(tenantId) ?? defaultSecretReferencePolicy(tenantId);
  }

  async upsertPolicy(input: SecretReferencePolicyRepositoryInput): Promise<SecretReferencePolicy> {
    const parsed = secretReferencePolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = secretReferencePolicySchema.parse({
      tenantId: parsed.tenantId,
      allowedEnvVarPrefixes: parsed.allowedEnvVarPrefixes === undefined
        ? current.allowedEnvVarPrefixes
        : uniqueValues(parsed.allowedEnvVarPrefixes),
      allowedEnvVars: parsed.allowedEnvVars === undefined
        ? current.allowedEnvVars
        : uniqueValues(parsed.allowedEnvVars),
      allowUnlistedEnvVars: parsed.allowUnlistedEnvVars ?? current.allowUnlistedEnvVars,
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

export function defaultSecretReferencePolicy(tenantId: string): SecretReferencePolicy {
  return secretReferencePolicySchema.parse({
    tenantId,
    ...DEFAULT_SECRET_REFERENCE_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

export function isSecretEnvVarAllowed(policy: SecretReferencePolicy, envVar: string | null | undefined): boolean {
  if (!envVar || policy.allowUnlistedEnvVars) {
    return true;
  }

  if (policy.allowedEnvVars.includes(envVar)) {
    return true;
  }

  return policy.allowedEnvVarPrefixes.some((prefix) => envVar.startsWith(prefix));
}

function mapSecretReferencePolicyRow(row: SecretReferencePolicyRow): SecretReferencePolicy {
  return secretReferencePolicySchema.parse({
    tenantId: row.tenant_id,
    allowedEnvVarPrefixes: row.allowed_env_var_prefixes,
    allowedEnvVars: row.allowed_env_vars,
    allowUnlistedEnvVars: row.allow_unlisted_env_vars,
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

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error("Expected query to return a row");
  }

  return row;
}

interface SecretReferencePolicyRow extends QueryResultRow {
  tenant_id: string;
  allowed_env_var_prefixes: string[];
  allowed_env_vars: string[];
  allow_unlisted_env_vars: boolean;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
