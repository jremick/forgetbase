import type { Pool, QueryResultRow } from "pg";
import {
  managedQueryEvalRunCreateInputSchema,
  managedQueryEvalRunSchema,
  type ManagedQueryEvalRun,
  type ManagedQueryEvalRunCreateInput
} from "@forgetbase/schema";

export interface ManagedQueryEvalRunListOptions {
  tenantId?: string;
  limit?: number;
}

export interface ManagedQueryEvalRunRepository {
  recordRun(input: ManagedQueryEvalRunCreateInput): Promise<ManagedQueryEvalRun>;
  listRuns(options?: ManagedQueryEvalRunListOptions): Promise<ManagedQueryEvalRun[]>;
}

export class PostgresManagedQueryEvalRunRepository implements ManagedQueryEvalRunRepository {
  constructor(private readonly pool: Pool) {}

  async recordRun(input: ManagedQueryEvalRunCreateInput): Promise<ManagedQueryEvalRun> {
    const parsed = managedQueryEvalRunCreateInputSchema.parse(input);
    const report = parsed.report;
    const result = await this.pool.query<ManagedQueryEvalRunRow>(
      `
        INSERT INTO managed_query_eval_runs (
          tenant_id,
          actor_user_id,
          actor_service_account_id,
          actor_api_key_id,
          ok,
          mode,
          checked_at,
          case_count,
          passed_count,
          failed_count,
          pass_rate,
          minimum_pass_rate,
          threshold_passed,
          report,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.actorUserId ?? null,
        parsed.actorServiceAccountId ?? null,
        parsed.actorApiKeyId ?? null,
        report.ok,
        report.mode,
        report.checkedAt,
        report.caseCount,
        report.passedCount,
        report.failedCount,
        report.passRate,
        report.minimumPassRate,
        report.thresholdPassed,
        JSON.stringify(report),
        JSON.stringify(parsed.metadata)
      ]
    );

    return mapManagedQueryEvalRunRow(requireRow(result.rows));
  }

  async listRuns(options: ManagedQueryEvalRunListOptions = {}): Promise<ManagedQueryEvalRun[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<ManagedQueryEvalRunRow>(
      `
        SELECT *
        FROM managed_query_eval_runs
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapManagedQueryEvalRunRow);
  }
}

export class InMemoryManagedQueryEvalRunRepository implements ManagedQueryEvalRunRepository {
  private readonly runs: ManagedQueryEvalRun[] = [];
  private sequence = 0;

  async recordRun(input: ManagedQueryEvalRunCreateInput): Promise<ManagedQueryEvalRun> {
    const parsed = managedQueryEvalRunCreateInputSchema.parse(input);
    this.sequence += 1;
    const report = parsed.report;
    const run = managedQueryEvalRunSchema.parse({
      id: `managed_query_eval_run_${this.sequence}`,
      tenantId: parsed.tenantId,
      actorUserId: parsed.actorUserId ?? null,
      actorServiceAccountId: parsed.actorServiceAccountId ?? null,
      actorApiKeyId: parsed.actorApiKeyId ?? null,
      ok: report.ok,
      mode: report.mode,
      checkedAt: report.checkedAt,
      caseCount: report.caseCount,
      passedCount: report.passedCount,
      failedCount: report.failedCount,
      passRate: report.passRate,
      minimumPassRate: report.minimumPassRate,
      thresholdPassed: report.thresholdPassed,
      report,
      metadata: parsed.metadata,
      createdAt: new Date().toISOString()
    });

    this.runs.unshift(run);
    return run;
  }

  async listRuns(options: ManagedQueryEvalRunListOptions = {}): Promise<ManagedQueryEvalRun[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return this.runs.filter((run) => run.tenantId === tenantId).slice(0, limit);
  }
}

function mapManagedQueryEvalRunRow(row: ManagedQueryEvalRunRow): ManagedQueryEvalRun {
  return managedQueryEvalRunSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorServiceAccountId: row.actor_service_account_id,
    actorApiKeyId: row.actor_api_key_id,
    ok: row.ok,
    mode: row.mode,
    checkedAt: row.checked_at.toISOString(),
    caseCount: row.case_count,
    passedCount: row.passed_count,
    failedCount: row.failed_count,
    passRate: row.pass_rate,
    minimumPassRate: row.minimum_pass_rate,
    thresholdPassed: row.threshold_passed,
    report: row.report,
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

interface ManagedQueryEvalRunRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_service_account_id: string | null;
  actor_api_key_id: string | null;
  ok: boolean;
  mode: string;
  checked_at: Date;
  case_count: number;
  passed_count: number;
  failed_count: number;
  pass_rate: number;
  minimum_pass_rate: number;
  threshold_passed: boolean;
  report: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
}
