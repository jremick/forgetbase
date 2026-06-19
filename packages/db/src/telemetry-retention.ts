import type { Pool, QueryResultRow } from "pg";
import {
  telemetryRetentionPolicyInputSchema,
  telemetryRetentionPolicySchema,
  telemetryRetentionPurgeResultSchema,
  type TelemetryRetentionPolicy,
  type TelemetryRetentionPolicyInput,
  type TelemetryRetentionPurgeResult
} from "@forgetbase/schema";
import type { AuthRepository } from "./auth.js";
import type { ManagedQueryFeedbackRepository } from "./feedback.js";
import type { RetrievalRepository } from "./retrieval.js";

export const DEFAULT_TELEMETRY_RETENTION_POLICY = {
  retrievalEventRetentionDays: 30,
  auditEventRetentionDays: 365,
  feedbackRetentionDays: 90
} as const;

export interface TelemetryRetentionPolicyRepositoryInput extends TelemetryRetentionPolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface TelemetryRetentionPolicyListOptions {
  tenantIds?: string[];
  limit?: number;
}

export interface TelemetryRetentionPolicyRepository {
  getPolicy(tenantId?: string): Promise<TelemetryRetentionPolicy>;
  listPolicies(options?: TelemetryRetentionPolicyListOptions): Promise<TelemetryRetentionPolicy[]>;
  upsertPolicy(input: TelemetryRetentionPolicyRepositoryInput): Promise<TelemetryRetentionPolicy>;
}

export class PostgresTelemetryRetentionPolicyRepository implements TelemetryRetentionPolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<TelemetryRetentionPolicy> {
    const result = await this.pool.query<TelemetryRetentionPolicyRow>(
      "SELECT * FROM telemetry_retention_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapTelemetryRetentionPolicyRow(row) : defaultTelemetryRetentionPolicy(tenantId);
  }

  async listPolicies(options: TelemetryRetentionPolicyListOptions = {}): Promise<TelemetryRetentionPolicy[]> {
    if (options.tenantIds?.length) {
      return Promise.all(uniqueSorted(options.tenantIds).map((tenantId) => this.getPolicy(tenantId)));
    }

    const limit = Math.min(Math.max(options.limit ?? 1000, 1), 5000);
    const result = await this.pool.query<{ tenant_id: string }>(
      `
        WITH tenant_ids AS (
          SELECT id AS tenant_id FROM tenants
          UNION
          SELECT tenant_id FROM telemetry_retention_policies
          UNION
          SELECT tenant_id FROM retrieval_events
          UNION
          SELECT tenant_id FROM audit_events
          UNION
          SELECT tenant_id FROM managed_query_feedback
        )
        SELECT tenant_id
        FROM tenant_ids
        WHERE tenant_id IS NOT NULL
        ORDER BY tenant_id ASC
        LIMIT $1
      `,
      [limit]
    );

    return Promise.all(result.rows.map((row) => this.getPolicy(row.tenant_id)));
  }

  async upsertPolicy(input: TelemetryRetentionPolicyRepositoryInput): Promise<TelemetryRetentionPolicy> {
    const parsed = telemetryRetentionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = {
      retrievalEventRetentionDays: parsed.retrievalEventRetentionDays === undefined
        ? current.retrievalEventRetentionDays
        : parsed.retrievalEventRetentionDays,
      auditEventRetentionDays: parsed.auditEventRetentionDays === undefined
        ? current.auditEventRetentionDays
        : parsed.auditEventRetentionDays,
      feedbackRetentionDays: parsed.feedbackRetentionDays === undefined
        ? current.feedbackRetentionDays
        : parsed.feedbackRetentionDays
    };

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<TelemetryRetentionPolicyRow>(
      `
        INSERT INTO telemetry_retention_policies (
          tenant_id,
          retrieval_event_retention_days,
          audit_event_retention_days,
          feedback_retention_days,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          retrieval_event_retention_days = EXCLUDED.retrieval_event_retention_days,
          audit_event_retention_days = EXCLUDED.audit_event_retention_days,
          feedback_retention_days = EXCLUDED.feedback_retention_days,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.retrievalEventRetentionDays,
        next.auditEventRetentionDays,
        next.feedbackRetentionDays,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapTelemetryRetentionPolicyRow(requireRow(result.rows));
  }
}

export class InMemoryTelemetryRetentionPolicyRepository implements TelemetryRetentionPolicyRepository {
  private readonly policies = new Map<string, TelemetryRetentionPolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<TelemetryRetentionPolicy> {
    return this.policies.get(tenantId) ?? defaultTelemetryRetentionPolicy(tenantId);
  }

  async listPolicies(options: TelemetryRetentionPolicyListOptions = {}): Promise<TelemetryRetentionPolicy[]> {
    if (options.tenantIds?.length) {
      return Promise.all(uniqueSorted(options.tenantIds).map((tenantId) => this.getPolicy(tenantId)));
    }

    return Array.from(this.policies.values()).sort((left, right) => left.tenantId.localeCompare(right.tenantId));
  }

  async upsertPolicy(input: TelemetryRetentionPolicyRepositoryInput): Promise<TelemetryRetentionPolicy> {
    const parsed = telemetryRetentionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = telemetryRetentionPolicySchema.parse({
      tenantId: parsed.tenantId,
      retrievalEventRetentionDays: parsed.retrievalEventRetentionDays === undefined
        ? current.retrievalEventRetentionDays
        : parsed.retrievalEventRetentionDays,
      auditEventRetentionDays: parsed.auditEventRetentionDays === undefined
        ? current.auditEventRetentionDays
        : parsed.auditEventRetentionDays,
      feedbackRetentionDays: parsed.feedbackRetentionDays === undefined
        ? current.feedbackRetentionDays
        : parsed.feedbackRetentionDays,
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

export async function purgeTelemetryForRetentionPolicy(input: {
  tenantId: string;
  dryRun: boolean;
  policy: TelemetryRetentionPolicy;
  authRepository: AuthRepository;
  retrievalRepository: RetrievalRepository;
  feedbackRepository: ManagedQueryFeedbackRepository;
  now?: Date;
}): Promise<TelemetryRetentionPurgeResult> {
  const purgedAt = input.now ?? new Date();
  const retrievalCutoff = retentionCutoff(purgedAt, input.policy.retrievalEventRetentionDays);
  const auditCutoff = retentionCutoff(purgedAt, input.policy.auditEventRetentionDays);
  const feedbackCutoff = retentionCutoff(purgedAt, input.policy.feedbackRetentionDays);
  const [retrievalDeleted, auditDeleted, feedbackDeleted] = await Promise.all([
    retrievalCutoff
      ? input.retrievalRepository.purgeRetrievalEvents({
        tenantId: input.tenantId,
        before: retrievalCutoff,
        dryRun: input.dryRun
      })
      : 0,
    auditCutoff
      ? input.authRepository.purgeAuditEvents({
        tenantId: input.tenantId,
        before: auditCutoff,
        dryRun: input.dryRun
      })
      : 0,
    feedbackCutoff
      ? input.feedbackRepository.purgeFeedback({
        tenantId: input.tenantId,
        before: feedbackCutoff,
        dryRun: input.dryRun
      })
      : 0
  ]);

  return telemetryRetentionPurgeResultSchema.parse({
    tenantId: input.tenantId,
    dryRun: input.dryRun,
    purgedAt: purgedAt.toISOString(),
    policy: input.policy,
    retrievalEvents: {
      cutoff: retrievalCutoff,
      deletedCount: retrievalDeleted
    },
    auditEvents: {
      cutoff: auditCutoff,
      deletedCount: auditDeleted
    },
    managedQueryFeedback: {
      cutoff: feedbackCutoff,
      deletedCount: feedbackDeleted
    }
  });
}

function retentionCutoff(now: Date, days: number | null): string | null {
  if (days === null) {
    return null;
  }

  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function defaultTelemetryRetentionPolicy(tenantId: string): TelemetryRetentionPolicy {
  return telemetryRetentionPolicySchema.parse({
    tenantId,
    ...DEFAULT_TELEMETRY_RETENTION_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
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

function mapTelemetryRetentionPolicyRow(row: TelemetryRetentionPolicyRow): TelemetryRetentionPolicy {
  return telemetryRetentionPolicySchema.parse({
    tenantId: row.tenant_id,
    retrievalEventRetentionDays: row.retrieval_event_retention_days,
    auditEventRetentionDays: row.audit_event_retention_days,
    feedbackRetentionDays: row.feedback_retention_days,
    source: "stored",
    updatedByUserId: row.updated_by_user_id,
    updatedByServiceAccountId: row.updated_by_service_account_id,
    updatedByApiKeyId: row.updated_by_api_key_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error("Expected query to return a row");
  }

  return row;
}

interface TelemetryRetentionPolicyRow extends QueryResultRow {
  tenant_id: string;
  retrieval_event_retention_days: number | null;
  audit_event_retention_days: number | null;
  feedback_retention_days: number | null;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
