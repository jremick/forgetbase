import type { Pool, QueryResultRow } from "pg";
import {
  retrievalRankingPolicyInputSchema,
  retrievalRankingPolicySchema,
  type RetrievalRankingPolicy,
  type RetrievalRankingPolicyInput
} from "@agentic-cms/schema";

export const DEFAULT_RETRIEVAL_RANKING_POLICY = {
  agentInstructionWeight: 1.2,
  assetSummaryWeight: 1.1,
  humanDocumentWeight: 1,
  exactPhraseBoost: 0.25
} as const;

export interface RetrievalRankingPolicyRepositoryInput extends RetrievalRankingPolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface RetrievalRankingPolicyRepository {
  getPolicy(tenantId?: string): Promise<RetrievalRankingPolicy>;
  upsertPolicy(input: RetrievalRankingPolicyRepositoryInput): Promise<RetrievalRankingPolicy>;
}

export class PostgresRetrievalRankingPolicyRepository implements RetrievalRankingPolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<RetrievalRankingPolicy> {
    const result = await this.pool.query<RetrievalRankingPolicyRow>(
      "SELECT * FROM retrieval_ranking_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapRetrievalRankingPolicyRow(row) : defaultRetrievalRankingPolicy(tenantId);
  }

  async upsertPolicy(input: RetrievalRankingPolicyRepositoryInput): Promise<RetrievalRankingPolicy> {
    const parsed = retrievalRankingPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = retrievalRankingPolicySchema.parse({
      tenantId: parsed.tenantId,
      agentInstructionWeight: parsed.agentInstructionWeight ?? current.agentInstructionWeight,
      assetSummaryWeight: parsed.assetSummaryWeight ?? current.assetSummaryWeight,
      humanDocumentWeight: parsed.humanDocumentWeight ?? current.humanDocumentWeight,
      exactPhraseBoost: parsed.exactPhraseBoost ?? current.exactPhraseBoost,
      source: "stored",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedByServiceAccountId: input.updatedByServiceAccountId ?? null,
      updatedByApiKeyId: input.updatedByApiKeyId ?? null,
      createdAt: current.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<RetrievalRankingPolicyRow>(
      `
        INSERT INTO retrieval_ranking_policies (
          tenant_id,
          agent_instruction_weight,
          asset_summary_weight,
          human_document_weight,
          exact_phrase_boost,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          agent_instruction_weight = EXCLUDED.agent_instruction_weight,
          asset_summary_weight = EXCLUDED.asset_summary_weight,
          human_document_weight = EXCLUDED.human_document_weight,
          exact_phrase_boost = EXCLUDED.exact_phrase_boost,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.agentInstructionWeight,
        next.assetSummaryWeight,
        next.humanDocumentWeight,
        next.exactPhraseBoost,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapRetrievalRankingPolicyRow(requireRow(result.rows));
  }
}

export class InMemoryRetrievalRankingPolicyRepository implements RetrievalRankingPolicyRepository {
  private readonly policies = new Map<string, RetrievalRankingPolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<RetrievalRankingPolicy> {
    return this.policies.get(tenantId) ?? defaultRetrievalRankingPolicy(tenantId);
  }

  async upsertPolicy(input: RetrievalRankingPolicyRepositoryInput): Promise<RetrievalRankingPolicy> {
    const parsed = retrievalRankingPolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = retrievalRankingPolicySchema.parse({
      tenantId: parsed.tenantId,
      agentInstructionWeight: parsed.agentInstructionWeight ?? current.agentInstructionWeight,
      assetSummaryWeight: parsed.assetSummaryWeight ?? current.assetSummaryWeight,
      humanDocumentWeight: parsed.humanDocumentWeight ?? current.humanDocumentWeight,
      exactPhraseBoost: parsed.exactPhraseBoost ?? current.exactPhraseBoost,
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

export function defaultRetrievalRankingPolicy(tenantId: string): RetrievalRankingPolicy {
  return retrievalRankingPolicySchema.parse({
    tenantId,
    ...DEFAULT_RETRIEVAL_RANKING_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function mapRetrievalRankingPolicyRow(row: RetrievalRankingPolicyRow): RetrievalRankingPolicy {
  return retrievalRankingPolicySchema.parse({
    tenantId: row.tenant_id,
    agentInstructionWeight: Number(row.agent_instruction_weight),
    assetSummaryWeight: Number(row.asset_summary_weight),
    humanDocumentWeight: Number(row.human_document_weight),
    exactPhraseBoost: Number(row.exact_phrase_boost),
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
    throw new Error("Expected query to return a row.");
  }

  return row;
}

interface RetrievalRankingPolicyRow extends QueryResultRow {
  tenant_id: string;
  agent_instruction_weight: string | number;
  asset_summary_weight: string | number;
  human_document_weight: string | number;
  exact_phrase_boost: string | number;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
