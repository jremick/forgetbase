import type { Pool, QueryResultRow } from "pg";
import {
  managedQueryFeedbackCreateInputSchema,
  managedQueryFeedbackSchema,
  type ManagedQueryFeedback,
  type ManagedQueryFeedbackCreateInput
} from "@forgetbase/schema";

export interface ManagedQueryFeedbackListOptions {
  tenantId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface ManagedQueryFeedbackPurgeOptions {
  tenantId?: string;
  before: string;
  dryRun?: boolean;
}

export interface ManagedQueryFeedbackRepository {
  recordFeedback(input: ManagedQueryFeedbackCreateInput): Promise<ManagedQueryFeedback>;
  listFeedback(options?: ManagedQueryFeedbackListOptions): Promise<ManagedQueryFeedback[]>;
  purgeFeedback(options: ManagedQueryFeedbackPurgeOptions): Promise<number>;
}

export class PostgresManagedQueryFeedbackRepository implements ManagedQueryFeedbackRepository {
  constructor(private readonly pool: Pool) {}

  async recordFeedback(input: ManagedQueryFeedbackCreateInput): Promise<ManagedQueryFeedback> {
    const parsed = managedQueryFeedbackCreateInputSchema.parse(input);
    const result = await this.pool.query<ManagedQueryFeedbackRow>(
      `
        INSERT INTO managed_query_feedback (
          tenant_id,
          telemetry_event_id,
          actor_user_id,
          actor_service_account_id,
          actor_api_key_id,
          query,
          outcome,
          factual_citation_accuracy,
          policy_compliance,
          task_completion_quality,
          consistency,
          response_effectiveness,
          notes,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.telemetryEventId,
        parsed.actorUserId ?? null,
        parsed.actorServiceAccountId ?? null,
        parsed.actorApiKeyId ?? null,
        parsed.query,
        parsed.outcome,
        parsed.factualCitationAccuracy ?? null,
        parsed.policyCompliance ?? null,
        parsed.taskCompletionQuality ?? null,
        parsed.consistency ?? null,
        parsed.responseEffectiveness ?? null,
        parsed.notes ?? null,
        JSON.stringify(parsed.metadata)
      ]
    );

    return mapManagedQueryFeedbackRow(requireRow(result.rows));
  }

  async listFeedback(options: ManagedQueryFeedbackListOptions = {}): Promise<ManagedQueryFeedback[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<ManagedQueryFeedbackRow>(
      `
        SELECT *
        FROM managed_query_feedback
        WHERE tenant_id = $1
          AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [tenantId, options.since ?? null, options.until ?? null, limit]
    );

    return result.rows.map(mapManagedQueryFeedbackRow);
  }

  async purgeFeedback(options: ManagedQueryFeedbackPurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";

    if (options.dryRun ?? true) {
      const result = await this.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM managed_query_feedback WHERE tenant_id = $1 AND created_at < $2::timestamptz",
        [tenantId, options.before]
      );

      return Number.parseInt(result.rows[0]?.count ?? "0", 10);
    }

    const result = await this.pool.query<{ id: string }>(
      "DELETE FROM managed_query_feedback WHERE tenant_id = $1 AND created_at < $2::timestamptz RETURNING id",
      [tenantId, options.before]
    );

    return result.rowCount ?? 0;
  }
}

export class InMemoryManagedQueryFeedbackRepository implements ManagedQueryFeedbackRepository {
  private readonly feedback: ManagedQueryFeedback[] = [];
  private sequence = 0;

  async recordFeedback(input: ManagedQueryFeedbackCreateInput): Promise<ManagedQueryFeedback> {
    const parsed = managedQueryFeedbackCreateInputSchema.parse(input);
    this.sequence += 1;
    const feedback = managedQueryFeedbackSchema.parse({
      id: `feedback_${this.sequence}`,
      tenantId: parsed.tenantId,
      telemetryEventId: parsed.telemetryEventId,
      actorUserId: parsed.actorUserId ?? null,
      actorServiceAccountId: parsed.actorServiceAccountId ?? null,
      actorApiKeyId: parsed.actorApiKeyId ?? null,
      query: parsed.query,
      outcome: parsed.outcome,
      factualCitationAccuracy: parsed.factualCitationAccuracy ?? null,
      policyCompliance: parsed.policyCompliance ?? null,
      taskCompletionQuality: parsed.taskCompletionQuality ?? null,
      consistency: parsed.consistency ?? null,
      responseEffectiveness: parsed.responseEffectiveness ?? null,
      notes: parsed.notes ?? null,
      metadata: parsed.metadata,
      createdAt: new Date().toISOString()
    });

    this.feedback.unshift(feedback);
    return feedback;
  }

  async listFeedback(options: ManagedQueryFeedbackListOptions = {}): Promise<ManagedQueryFeedback[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const since = options.since ? Date.parse(options.since) : undefined;
    const until = options.until ? Date.parse(options.until) : undefined;

    return this.feedback
      .filter((feedback) => feedback.tenantId === tenantId)
      .filter((feedback) => isCreatedAtInWindow(feedback.createdAt, since, until))
      .slice(0, limit);
  }

  async purgeFeedback(options: ManagedQueryFeedbackPurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const cutoff = Date.parse(options.before);
    const matches = this.feedback.filter((feedback) =>
      feedback.tenantId === tenantId &&
      !Number.isNaN(Date.parse(feedback.createdAt)) &&
      Date.parse(feedback.createdAt) < cutoff
    );

    if (!(options.dryRun ?? true)) {
      const matchIds = new Set(matches.map((feedback) => feedback.id));
      this.feedback.splice(0, this.feedback.length, ...this.feedback.filter((feedback) => !matchIds.has(feedback.id)));
    }

    return matches.length;
  }
}

function isCreatedAtInWindow(createdAt: string, since?: number, until?: number): boolean {
  const value = Date.parse(createdAt);

  return !Number.isNaN(value) &&
    (since === undefined || value >= since) &&
    (until === undefined || value <= until);
}

function mapManagedQueryFeedbackRow(row: ManagedQueryFeedbackRow): ManagedQueryFeedback {
  return managedQueryFeedbackSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    telemetryEventId: row.telemetry_event_id,
    actorUserId: row.actor_user_id,
    actorServiceAccountId: row.actor_service_account_id,
    actorApiKeyId: row.actor_api_key_id,
    query: row.query,
    outcome: row.outcome,
    factualCitationAccuracy: row.factual_citation_accuracy,
    policyCompliance: row.policy_compliance,
    taskCompletionQuality: row.task_completion_quality,
    consistency: row.consistency,
    responseEffectiveness: row.response_effectiveness,
    notes: row.notes,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString()
  });
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error("Expected query to return a row");
  }

  return row;
}

interface ManagedQueryFeedbackRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  telemetry_event_id: string;
  actor_user_id: string | null;
  actor_service_account_id: string | null;
  actor_api_key_id: string | null;
  query: string;
  outcome: string;
  factual_citation_accuracy: number | null;
  policy_compliance: number | null;
  task_completion_quality: number | null;
  consistency: number | null;
  response_effectiveness: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}
