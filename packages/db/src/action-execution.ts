import type { Pool, QueryResultRow } from "pg";
import {
  agentActionDecisionInputSchema,
  agentActionExecuteInputSchema,
  agentActionExecutionPolicyInputSchema,
  agentActionExecutionPolicySchema,
  agentActionRequestSchema,
  type AgentActionDecisionInput,
  type AgentActionExecuteInput,
  type AgentActionExecutionPolicy,
  type AgentActionExecutionPolicyInput,
  type AgentActionRequest,
  type AgentActionStatus,
  type AgentActionType
} from "@forgetbase/schema";

export const DEFAULT_AGENT_ACTION_EXECUTION_POLICY = {
  enabled: false,
  allowedActionTypes: [] as AgentActionType[],
  requireApproval: true,
  dryRunDefault: true,
  killSwitch: false,
  maxRequestsPerHour: 60,
  approvalExpiresInMinutes: 1440
} as const;

export interface AgentActionExecutionPolicyRepositoryInput extends AgentActionExecutionPolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface AgentActionRequestCreateInput extends AgentActionExecuteInput {
  status: AgentActionStatus;
  dryRun: boolean;
  result?: Record<string, unknown>;
  reason?: string | null;
  policySnapshot?: Record<string, unknown>;
  approvalExpiresAt?: string | null;
  requestedByUserId?: string;
  requestedByServiceAccountId?: string;
  requestedByApiKeyId?: string;
}

export interface AgentActionRequestDecisionInput extends AgentActionDecisionInput {
  status: Extract<AgentActionStatus, "approved" | "denied" | "executed" | "expired">;
  result?: Record<string, unknown>;
  decidedByUserId?: string;
  decidedByServiceAccountId?: string;
  decidedByApiKeyId?: string;
}

export interface AgentActionRequestListOptions {
  tenantId?: string;
  limit?: number;
}

export interface AgentActionExpiredApprovalListOptions {
  tenantIds?: string[];
  now?: Date | string;
  limit?: number;
}

export interface AgentActionRequestIdempotencyLookup {
  tenantId: string;
  idempotencyKey: string;
  requestedByUserId?: string | null;
  requestedByServiceAccountId?: string | null;
}

export interface AgentActionExecutionRepository {
  getPolicy(tenantId?: string): Promise<AgentActionExecutionPolicy>;
  upsertPolicy(input: AgentActionExecutionPolicyRepositoryInput): Promise<AgentActionExecutionPolicy>;
  createRequest(input: AgentActionRequestCreateInput): Promise<AgentActionRequest>;
  getRequestByIdempotencyKey(input: AgentActionRequestIdempotencyLookup): Promise<AgentActionRequest | null>;
  getRequest(tenantId: string, actionRequestId: string): Promise<AgentActionRequest | null>;
  listRequests(options?: AgentActionRequestListOptions): Promise<AgentActionRequest[]>;
  listExpiredApprovalRequests(options?: AgentActionExpiredApprovalListOptions): Promise<AgentActionRequest[]>;
  countRequestsSince(tenantId: string, since: Date | string): Promise<number>;
  decideRequest(input: AgentActionRequestDecisionInput): Promise<AgentActionRequest | null>;
}

export class PostgresAgentActionExecutionRepository implements AgentActionExecutionRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<AgentActionExecutionPolicy> {
    const result = await this.pool.query<AgentActionExecutionPolicyRow>(
      "SELECT * FROM action_execution_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapPolicyRow(row) : defaultAgentActionExecutionPolicy(tenantId);
  }

  async upsertPolicy(input: AgentActionExecutionPolicyRepositoryInput): Promise<AgentActionExecutionPolicy> {
    const parsed = agentActionExecutionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = agentActionExecutionPolicySchema.parse({
      tenantId: parsed.tenantId,
      enabled: parsed.enabled ?? current.enabled,
      allowedActionTypes: parsed.allowedActionTypes === undefined
        ? current.allowedActionTypes
        : uniqueValues(parsed.allowedActionTypes),
      requireApproval: parsed.requireApproval ?? current.requireApproval,
      dryRunDefault: parsed.dryRunDefault ?? current.dryRunDefault,
      killSwitch: parsed.killSwitch ?? current.killSwitch,
      maxRequestsPerHour: parsed.maxRequestsPerHour ?? current.maxRequestsPerHour,
      approvalExpiresInMinutes: parsed.approvalExpiresInMinutes ?? current.approvalExpiresInMinutes,
      source: "stored",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedByServiceAccountId: input.updatedByServiceAccountId ?? null,
      updatedByApiKeyId: input.updatedByApiKeyId ?? null,
      createdAt: current.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<AgentActionExecutionPolicyRow>(
      `
        INSERT INTO action_execution_policies (
          tenant_id,
          enabled,
          allowed_action_types,
          require_approval,
          dry_run_default,
          kill_switch,
          max_requests_per_hour,
          approval_expires_in_minutes,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          enabled = EXCLUDED.enabled,
          allowed_action_types = EXCLUDED.allowed_action_types,
          require_approval = EXCLUDED.require_approval,
          dry_run_default = EXCLUDED.dry_run_default,
          kill_switch = EXCLUDED.kill_switch,
          max_requests_per_hour = EXCLUDED.max_requests_per_hour,
          approval_expires_in_minutes = EXCLUDED.approval_expires_in_minutes,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.enabled,
        next.allowedActionTypes,
        next.requireApproval,
        next.dryRunDefault,
        next.killSwitch,
        next.maxRequestsPerHour,
        next.approvalExpiresInMinutes,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapPolicyRow(requireRow(result.rows));
  }

  async createRequest(input: AgentActionRequestCreateInput): Promise<AgentActionRequest> {
    const parsed = agentActionExecuteInputSchema.parse(input);
    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<AgentActionRequestRow>(
      `
        INSERT INTO agent_action_requests (
          tenant_id,
          action_type,
          title,
          description,
          target,
          idempotency_key,
          status,
          dry_run,
          payload,
          result,
          reason,
          policy_snapshot,
          metadata,
          requested_by_user_id,
          requested_by_service_account_id,
          requested_by_api_key_id,
          approval_expires_at,
          executed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18)
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.actionType,
        parsed.title,
        parsed.description ?? null,
        parsed.target ?? null,
        parsed.idempotencyKey ?? null,
        input.status,
        input.dryRun,
        JSON.stringify(parsed.payload),
        JSON.stringify(input.result ?? {}),
        input.reason ?? null,
        JSON.stringify(input.policySnapshot ?? {}),
        JSON.stringify(parsed.metadata),
        input.requestedByUserId ?? null,
        input.requestedByServiceAccountId ?? null,
        input.requestedByApiKeyId ?? null,
        input.approvalExpiresAt ?? null,
        input.status === "executed" ? new Date().toISOString() : null
      ]
    ).catch(async (error: unknown) => {
      if (isUniqueViolation(error) && parsed.idempotencyKey) {
        const existing = await this.getRequestByIdempotencyKey({
          tenantId: parsed.tenantId,
          idempotencyKey: parsed.idempotencyKey,
          requestedByUserId: input.requestedByUserId,
          requestedByServiceAccountId: input.requestedByServiceAccountId
        });

        if (existing) {
          return { rows: [existing as unknown as AgentActionRequestRow] };
        }
      }

      throw error;
    });

    const row = requireRow(result.rows);
    return agentActionRequestSchema.safeParse(row).success
      ? agentActionRequestSchema.parse(row)
      : mapRequestRow(row);
  }

  async getRequestByIdempotencyKey(input: AgentActionRequestIdempotencyLookup): Promise<AgentActionRequest | null> {
    const parsed = zodIdempotencyLookup(input);
    const identityColumn = parsed.requestedByServiceAccountId ? "requested_by_service_account_id" : "requested_by_user_id";
    const identityValue = parsed.requestedByServiceAccountId ?? parsed.requestedByUserId;

    if (!identityValue) {
      return null;
    }

    const result = await this.pool.query<AgentActionRequestRow>(
      `
        SELECT *
        FROM agent_action_requests
        WHERE tenant_id = $1
          AND idempotency_key = $2
          AND ${identityColumn} = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [parsed.tenantId, parsed.idempotencyKey, identityValue]
    );
    const row = result.rows[0];

    return row ? mapRequestRow(row) : null;
  }

  async listRequests(options: AgentActionRequestListOptions = {}): Promise<AgentActionRequest[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<AgentActionRequestRow>(
      `
        SELECT *
        FROM agent_action_requests
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapRequestRow);
  }

  async listExpiredApprovalRequests(
    options: AgentActionExpiredApprovalListOptions = {}
  ): Promise<AgentActionRequest[]> {
    const now = normalizeTimestamp(options.now ?? new Date());
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
    const tenantIds = options.tenantIds?.filter(Boolean) ?? [];
    const tenantClause = tenantIds.length ? "AND tenant_id = ANY($3::text[])" : "";
    const values: unknown[] = [now, limit];

    if (tenantIds.length) {
      values.push(tenantIds);
    }

    const result = await this.pool.query<AgentActionRequestRow>(
      `
        SELECT *
        FROM agent_action_requests
        WHERE status = 'approval-required'
          AND approval_expires_at IS NOT NULL
          AND approval_expires_at <= $1::timestamptz
          ${tenantClause}
        ORDER BY approval_expires_at ASC, created_at ASC
        LIMIT $2
      `,
      values
    );

    return result.rows.map(mapRequestRow);
  }

  async countRequestsSince(tenantId: string, since: Date | string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM agent_action_requests
        WHERE tenant_id = $1
          AND created_at >= $2::timestamptz
      `,
      [tenantId, normalizeTimestamp(since)]
    );

    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async getRequest(tenantId: string, actionRequestId: string): Promise<AgentActionRequest | null> {
    const result = await this.pool.query<AgentActionRequestRow>(
      "SELECT * FROM agent_action_requests WHERE tenant_id = $1 AND id = $2",
      [tenantId, actionRequestId]
    );
    const row = result.rows[0];

    return row ? mapRequestRow(row) : null;
  }

  async decideRequest(input: AgentActionRequestDecisionInput): Promise<AgentActionRequest | null> {
    const parsed = agentActionDecisionInputSchema.parse(input);
    const result = await this.pool.query<AgentActionRequestRow>(
      `
        UPDATE agent_action_requests
        SET
          status = $3,
          result = $4::jsonb,
          reason = $5,
          metadata = metadata || $6::jsonb,
          decided_by_user_id = $7,
          decided_by_service_account_id = $8,
          decided_by_api_key_id = $9,
          decided_at = now(),
          executed_at = CASE WHEN $3 = 'executed' THEN now() ELSE executed_at END,
          updated_at = now()
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.actionRequestId,
        input.status,
        JSON.stringify(input.result ?? {}),
        parsed.reason ?? null,
        JSON.stringify(parsed.metadata),
        input.decidedByUserId ?? null,
        input.decidedByServiceAccountId ?? null,
        input.decidedByApiKeyId ?? null
      ]
    );
    const row = result.rows[0];

    return row ? mapRequestRow(row) : null;
  }
}

export class InMemoryAgentActionExecutionRepository implements AgentActionExecutionRepository {
  private readonly policies = new Map<string, AgentActionExecutionPolicy>();
  private readonly requests = new Map<string, AgentActionRequest>();
  private nextRequestId = 1;

  async getPolicy(tenantId = "tenant_demo"): Promise<AgentActionExecutionPolicy> {
    return this.policies.get(tenantId) ?? defaultAgentActionExecutionPolicy(tenantId);
  }

  async upsertPolicy(input: AgentActionExecutionPolicyRepositoryInput): Promise<AgentActionExecutionPolicy> {
    const parsed = agentActionExecutionPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = agentActionExecutionPolicySchema.parse({
      tenantId: parsed.tenantId,
      enabled: parsed.enabled ?? current.enabled,
      allowedActionTypes: parsed.allowedActionTypes === undefined
        ? current.allowedActionTypes
        : uniqueValues(parsed.allowedActionTypes),
      requireApproval: parsed.requireApproval ?? current.requireApproval,
      dryRunDefault: parsed.dryRunDefault ?? current.dryRunDefault,
      killSwitch: parsed.killSwitch ?? current.killSwitch,
      maxRequestsPerHour: parsed.maxRequestsPerHour ?? current.maxRequestsPerHour,
      approvalExpiresInMinutes: parsed.approvalExpiresInMinutes ?? current.approvalExpiresInMinutes,
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

  async createRequest(input: AgentActionRequestCreateInput): Promise<AgentActionRequest> {
    const parsed = agentActionExecuteInputSchema.parse(input);
    const now = new Date().toISOString();
    const request = agentActionRequestSchema.parse({
      id: `agent_action_${this.nextRequestId++}`,
      tenantId: parsed.tenantId,
      actionType: parsed.actionType,
      title: parsed.title,
      description: parsed.description ?? null,
      target: parsed.target ?? null,
      idempotencyKey: parsed.idempotencyKey ?? null,
      status: input.status,
      dryRun: input.dryRun,
      payload: parsed.payload,
      result: input.result ?? {},
      reason: input.reason ?? null,
      policySnapshot: input.policySnapshot ?? {},
      metadata: parsed.metadata,
      requestedByUserId: input.requestedByUserId ?? null,
      requestedByServiceAccountId: input.requestedByServiceAccountId ?? null,
      requestedByApiKeyId: input.requestedByApiKeyId ?? null,
      decidedByUserId: null,
      decidedByServiceAccountId: null,
      decidedByApiKeyId: null,
      createdAt: now,
      updatedAt: now,
      decidedAt: null,
      approvalExpiresAt: input.approvalExpiresAt ?? null,
      executedAt: input.status === "executed" ? now : null
    });

    this.requests.set(request.id, request);
    return request;
  }

  async getRequestByIdempotencyKey(input: AgentActionRequestIdempotencyLookup): Promise<AgentActionRequest | null> {
    const parsed = zodIdempotencyLookup(input);

    return Array.from(this.requests.values()).find((request) => (
      request.tenantId === parsed.tenantId &&
      request.idempotencyKey === parsed.idempotencyKey &&
      (
        (parsed.requestedByServiceAccountId && request.requestedByServiceAccountId === parsed.requestedByServiceAccountId) ||
        (parsed.requestedByUserId && request.requestedByUserId === parsed.requestedByUserId)
      )
    )) ?? null;
  }

  async listRequests(options: AgentActionRequestListOptions = {}): Promise<AgentActionRequest[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    return Array.from(this.requests.values())
      .filter((request) => request.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async listExpiredApprovalRequests(
    options: AgentActionExpiredApprovalListOptions = {}
  ): Promise<AgentActionRequest[]> {
    const nowTime = Date.parse(normalizeTimestamp(options.now ?? new Date()));
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000);
    const tenantIds = options.tenantIds?.filter(Boolean);
    const allowedTenantIds = tenantIds?.length ? new Set(tenantIds) : null;

    return Array.from(this.requests.values())
      .filter((request) => request.status === "approval-required")
      .filter((request) => Boolean(request.approvalExpiresAt))
      .filter((request) => Date.parse(request.approvalExpiresAt ?? "") <= nowTime)
      .filter((request) => !allowedTenantIds || allowedTenantIds.has(request.tenantId))
      .sort((left, right) =>
        (left.approvalExpiresAt ?? "").localeCompare(right.approvalExpiresAt ?? "") ||
        left.createdAt.localeCompare(right.createdAt)
      )
      .slice(0, limit);
  }

  async countRequestsSince(tenantId: string, since: Date | string): Promise<number> {
    const sinceTime = Date.parse(normalizeTimestamp(since));

    return Array.from(this.requests.values())
      .filter((request) => request.tenantId === tenantId)
      .filter((request) => Date.parse(request.createdAt) >= sinceTime)
      .length;
  }

  async getRequest(tenantId: string, actionRequestId: string): Promise<AgentActionRequest | null> {
    const request = this.requests.get(actionRequestId);

    return request && request.tenantId === tenantId ? request : null;
  }

  async decideRequest(input: AgentActionRequestDecisionInput): Promise<AgentActionRequest | null> {
    const parsed = agentActionDecisionInputSchema.parse(input);
    const current = this.requests.get(parsed.actionRequestId);

    if (!current || current.tenantId !== parsed.tenantId) {
      return null;
    }

    const now = new Date().toISOString();
    const request = agentActionRequestSchema.parse({
      ...current,
      status: input.status,
      result: input.result ?? {},
      reason: parsed.reason ?? null,
      metadata: {
        ...current.metadata,
        ...parsed.metadata
      },
      decidedByUserId: input.decidedByUserId ?? null,
      decidedByServiceAccountId: input.decidedByServiceAccountId ?? null,
      decidedByApiKeyId: input.decidedByApiKeyId ?? null,
      decidedAt: now,
      executedAt: input.status === "executed" ? now : current.executedAt,
      updatedAt: now
    });

    this.requests.set(request.id, request);
    return request;
  }
}

export function defaultAgentActionExecutionPolicy(tenantId: string): AgentActionExecutionPolicy {
  return agentActionExecutionPolicySchema.parse({
    tenantId,
    ...DEFAULT_AGENT_ACTION_EXECUTION_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function mapPolicyRow(row: AgentActionExecutionPolicyRow): AgentActionExecutionPolicy {
  return agentActionExecutionPolicySchema.parse({
    tenantId: row.tenant_id,
    enabled: row.enabled,
    allowedActionTypes: row.allowed_action_types,
    requireApproval: row.require_approval,
    dryRunDefault: row.dry_run_default,
    killSwitch: row.kill_switch,
    maxRequestsPerHour: row.max_requests_per_hour,
    approvalExpiresInMinutes: row.approval_expires_in_minutes,
    source: "stored",
    updatedByUserId: row.updated_by_user_id,
    updatedByServiceAccountId: row.updated_by_service_account_id,
    updatedByApiKeyId: row.updated_by_api_key_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  });
}

function mapRequestRow(row: AgentActionRequestRow): AgentActionRequest {
  return agentActionRequestSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    actionType: row.action_type,
    title: row.title,
    description: row.description,
    target: row.target,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    dryRun: row.dry_run,
    payload: row.payload,
    result: row.result,
    reason: row.reason,
    policySnapshot: row.policy_snapshot,
    metadata: row.metadata,
    requestedByUserId: row.requested_by_user_id,
    requestedByServiceAccountId: row.requested_by_service_account_id,
    requestedByApiKeyId: row.requested_by_api_key_id,
    decidedByUserId: row.decided_by_user_id,
    decidedByServiceAccountId: row.decided_by_service_account_id,
    decidedByApiKeyId: row.decided_by_api_key_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
    approvalExpiresAt: row.approval_expires_at?.toISOString() ?? null,
    executedAt: row.executed_at?.toISOString() ?? null
  });
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function zodIdempotencyLookup(input: AgentActionRequestIdempotencyLookup): AgentActionRequestIdempotencyLookup {
  return {
    tenantId: input.tenantId,
    idempotencyKey: agentActionExecuteInputSchema.shape.idempotencyKey.unwrap().parse(input.idempotencyKey),
    requestedByUserId: input.requestedByUserId ?? null,
    requestedByServiceAccountId: input.requestedByServiceAccountId ?? null
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505";
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

interface AgentActionExecutionPolicyRow extends QueryResultRow {
  tenant_id: string;
  enabled: boolean;
  allowed_action_types: AgentActionType[];
  require_approval: boolean;
  dry_run_default: boolean;
  kill_switch: boolean;
  max_requests_per_hour: number;
  approval_expires_in_minutes: number;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AgentActionRequestRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  action_type: AgentActionType;
  title: string;
  description: string | null;
  target: string | null;
  idempotency_key: string | null;
  status: AgentActionStatus;
  dry_run: boolean;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  reason: string | null;
  policy_snapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  requested_by_user_id: string | null;
  requested_by_service_account_id: string | null;
  requested_by_api_key_id: string | null;
  decided_by_user_id: string | null;
  decided_by_service_account_id: string | null;
  decided_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
  decided_at: Date | null;
  approval_expires_at: Date | null;
  executed_at: Date | null;
}
