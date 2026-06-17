import type { Pool, QueryResultRow } from "pg";
import {
  managedQueryEvalSchedulePolicyInputSchema,
  managedQueryEvalSchedulePolicySchema,
  type ManagedQueryEvalSchedulePolicy,
  type ManagedQueryEvalSchedulePolicyInput,
  type ManagedQueryEvalScheduleStatus
} from "@agentic-cms/schema";

export const DEFAULT_MANAGED_QUERY_EVAL_SCHEDULE_POLICY = {
  enabled: false,
  intervalMinutes: 24 * 60,
  evalInput: null,
  lastRunAt: null,
  lastEvalRunId: null,
  lastStatus: "not-run" as ManagedQueryEvalScheduleStatus,
  lastError: null
} as const;

export class ManagedQueryEvalSchedulePolicyError extends Error {
  constructor(
    public readonly code: "managed_query_eval_schedule_requires_cases"
  ) {
    super(code);
    this.name = "ManagedQueryEvalSchedulePolicyError";
  }
}

export interface ManagedQueryEvalSchedulePolicyRepositoryInput extends ManagedQueryEvalSchedulePolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface ManagedQueryEvalSchedulePolicyListOptions {
  tenantIds?: string[];
  limit?: number;
}

export interface ManagedQueryEvalSchedulePolicyDueOptions {
  now?: Date | string;
  limit?: number;
}

export interface ManagedQueryEvalScheduleRunResultInput {
  tenantId: string;
  evalRunId?: string | null;
  status: Exclude<ManagedQueryEvalScheduleStatus, "not-run">;
  error?: string | null;
  ranAt?: Date | string;
}

export interface ManagedQueryEvalSchedulePolicyRepository {
  getPolicy(tenantId?: string): Promise<ManagedQueryEvalSchedulePolicy>;
  listPolicies(options?: ManagedQueryEvalSchedulePolicyListOptions): Promise<ManagedQueryEvalSchedulePolicy[]>;
  listDuePolicies(options?: ManagedQueryEvalSchedulePolicyDueOptions): Promise<ManagedQueryEvalSchedulePolicy[]>;
  upsertPolicy(input: ManagedQueryEvalSchedulePolicyRepositoryInput): Promise<ManagedQueryEvalSchedulePolicy>;
  recordRunResult(input: ManagedQueryEvalScheduleRunResultInput): Promise<ManagedQueryEvalSchedulePolicy>;
}

export class PostgresManagedQueryEvalSchedulePolicyRepository implements ManagedQueryEvalSchedulePolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryEvalSchedulePolicy> {
    const result = await this.pool.query<ManagedQueryEvalSchedulePolicyRow>(
      "SELECT * FROM managed_query_eval_schedule_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapManagedQueryEvalSchedulePolicyRow(row) : defaultManagedQueryEvalSchedulePolicy(tenantId);
  }

  async listPolicies(
    options: ManagedQueryEvalSchedulePolicyListOptions = {}
  ): Promise<ManagedQueryEvalSchedulePolicy[]> {
    if (options.tenantIds?.length) {
      return Promise.all(uniqueSorted(options.tenantIds).map((tenantId) => this.getPolicy(tenantId)));
    }

    const limit = Math.min(Math.max(options.limit ?? 1000, 1), 5000);
    const result = await this.pool.query<ManagedQueryEvalSchedulePolicyRow>(
      `
        SELECT *
        FROM managed_query_eval_schedule_policies
        ORDER BY tenant_id ASC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map(mapManagedQueryEvalSchedulePolicyRow);
  }

  async listDuePolicies(
    options: ManagedQueryEvalSchedulePolicyDueOptions = {}
  ): Promise<ManagedQueryEvalSchedulePolicy[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const now = normalizeTimestamp(options.now ?? new Date());
    const result = await this.pool.query<ManagedQueryEvalSchedulePolicyRow>(
      `
        SELECT *
        FROM managed_query_eval_schedule_policies
        WHERE enabled = true
          AND eval_input IS NOT NULL
          AND (
            last_run_at IS NULL
            OR last_run_at <= ($1::timestamptz - make_interval(mins => interval_minutes))
          )
        ORDER BY COALESCE(last_run_at, 'epoch'::timestamptz) ASC, tenant_id ASC
        LIMIT $2
      `,
      [now, limit]
    );

    return result.rows.map(mapManagedQueryEvalSchedulePolicyRow);
  }

  async upsertPolicy(input: ManagedQueryEvalSchedulePolicyRepositoryInput): Promise<ManagedQueryEvalSchedulePolicy> {
    const parsed = managedQueryEvalSchedulePolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = managedQueryEvalSchedulePolicySchema.parse({
      tenantId: parsed.tenantId,
      enabled: parsed.enabled ?? current.enabled,
      intervalMinutes: parsed.intervalMinutes ?? current.intervalMinutes,
      evalInput: parsed.evalInput === undefined ? current.evalInput : parsed.evalInput,
      lastRunAt: current.lastRunAt,
      lastEvalRunId: current.lastEvalRunId,
      lastStatus: current.lastStatus,
      lastError: current.lastError,
      source: "stored",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedByServiceAccountId: input.updatedByServiceAccountId ?? null,
      updatedByApiKeyId: input.updatedByApiKeyId ?? null,
      createdAt: current.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (next.enabled && !next.evalInput) {
      throw new ManagedQueryEvalSchedulePolicyError("managed_query_eval_schedule_requires_cases");
    }

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<ManagedQueryEvalSchedulePolicyRow>(
      `
        INSERT INTO managed_query_eval_schedule_policies (
          tenant_id,
          enabled,
          interval_minutes,
          eval_input,
          last_run_at,
          last_eval_run_id,
          last_status,
          last_error,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::uuid, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          enabled = EXCLUDED.enabled,
          interval_minutes = EXCLUDED.interval_minutes,
          eval_input = EXCLUDED.eval_input,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        next.tenantId,
        next.enabled,
        next.intervalMinutes,
        next.evalInput ? JSON.stringify(next.evalInput) : null,
        next.lastRunAt,
        next.lastEvalRunId,
        next.lastStatus,
        next.lastError,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapManagedQueryEvalSchedulePolicyRow(requireRow(result.rows));
  }

  async recordRunResult(input: ManagedQueryEvalScheduleRunResultInput): Promise<ManagedQueryEvalSchedulePolicy> {
    const ranAt = normalizeTimestamp(input.ranAt ?? new Date());
    const result = await this.pool.query<ManagedQueryEvalSchedulePolicyRow>(
      `
        UPDATE managed_query_eval_schedule_policies
        SET
          last_run_at = $2::timestamptz,
          last_eval_run_id = $3::uuid,
          last_status = $4,
          last_error = $5,
          updated_at = now()
        WHERE tenant_id = $1
        RETURNING *
      `,
      [input.tenantId, ranAt, input.evalRunId ?? null, input.status, input.error ?? null]
    );

    return mapManagedQueryEvalSchedulePolicyRow(requireRow(result.rows));
  }
}

export class InMemoryManagedQueryEvalSchedulePolicyRepository implements ManagedQueryEvalSchedulePolicyRepository {
  private readonly policies = new Map<string, ManagedQueryEvalSchedulePolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryEvalSchedulePolicy> {
    return this.policies.get(tenantId) ?? defaultManagedQueryEvalSchedulePolicy(tenantId);
  }

  async listPolicies(
    options: ManagedQueryEvalSchedulePolicyListOptions = {}
  ): Promise<ManagedQueryEvalSchedulePolicy[]> {
    if (options.tenantIds?.length) {
      return Promise.all(uniqueSorted(options.tenantIds).map((tenantId) => this.getPolicy(tenantId)));
    }

    return Array.from(this.policies.values()).sort((left, right) => left.tenantId.localeCompare(right.tenantId));
  }

  async listDuePolicies(
    options: ManagedQueryEvalSchedulePolicyDueOptions = {}
  ): Promise<ManagedQueryEvalSchedulePolicy[]> {
    const now = Date.parse(normalizeTimestamp(options.now ?? new Date()));
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);

    return Array.from(this.policies.values())
      .filter((policy) => policy.enabled && policy.evalInput)
      .filter((policy) => {
        if (!policy.lastRunAt) {
          return true;
        }

        return Date.parse(policy.lastRunAt) + policy.intervalMinutes * 60_000 <= now;
      })
      .sort((left, right) =>
        (left.lastRunAt ?? "").localeCompare(right.lastRunAt ?? "") ||
        left.tenantId.localeCompare(right.tenantId)
      )
      .slice(0, limit);
  }

  async upsertPolicy(input: ManagedQueryEvalSchedulePolicyRepositoryInput): Promise<ManagedQueryEvalSchedulePolicy> {
    const parsed = managedQueryEvalSchedulePolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = managedQueryEvalSchedulePolicySchema.parse({
      tenantId: parsed.tenantId,
      enabled: parsed.enabled ?? current.enabled,
      intervalMinutes: parsed.intervalMinutes ?? current.intervalMinutes,
      evalInput: parsed.evalInput === undefined ? current.evalInput : parsed.evalInput,
      lastRunAt: current.lastRunAt,
      lastEvalRunId: current.lastEvalRunId,
      lastStatus: current.lastStatus,
      lastError: current.lastError,
      source: "stored",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedByServiceAccountId: input.updatedByServiceAccountId ?? null,
      updatedByApiKeyId: input.updatedByApiKeyId ?? null,
      createdAt: current.createdAt ?? now,
      updatedAt: now
    });

    if (policy.enabled && !policy.evalInput) {
      throw new ManagedQueryEvalSchedulePolicyError("managed_query_eval_schedule_requires_cases");
    }

    this.policies.set(parsed.tenantId, policy);
    return policy;
  }

  async recordRunResult(input: ManagedQueryEvalScheduleRunResultInput): Promise<ManagedQueryEvalSchedulePolicy> {
    const current = await this.getPolicy(input.tenantId);
    const policy = managedQueryEvalSchedulePolicySchema.parse({
      ...current,
      lastRunAt: normalizeTimestamp(input.ranAt ?? new Date()),
      lastEvalRunId: input.evalRunId ?? null,
      lastStatus: input.status,
      lastError: input.error ?? null,
      source: "stored",
      updatedAt: new Date().toISOString()
    });

    this.policies.set(input.tenantId, policy);
    return policy;
  }
}

export function defaultManagedQueryEvalSchedulePolicy(tenantId: string): ManagedQueryEvalSchedulePolicy {
  return managedQueryEvalSchedulePolicySchema.parse({
    tenantId,
    ...DEFAULT_MANAGED_QUERY_EVAL_SCHEDULE_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function mapManagedQueryEvalSchedulePolicyRow(row: ManagedQueryEvalSchedulePolicyRow): ManagedQueryEvalSchedulePolicy {
  return managedQueryEvalSchedulePolicySchema.parse({
    tenantId: row.tenant_id,
    enabled: row.enabled,
    intervalMinutes: row.interval_minutes,
    evalInput: row.eval_input,
    lastRunAt: row.last_run_at?.toISOString() ?? null,
    lastEvalRunId: row.last_eval_run_id,
    lastStatus: row.last_status,
    lastError: row.last_error,
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

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error("Expected query to return a row.");
  }

  return row;
}

interface ManagedQueryEvalSchedulePolicyRow extends QueryResultRow {
  tenant_id: string;
  enabled: boolean;
  interval_minutes: number;
  eval_input: Record<string, unknown> | null;
  last_run_at: Date | null;
  last_eval_run_id: string | null;
  last_status: ManagedQueryEvalScheduleStatus;
  last_error: string | null;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
