import type { Pool, QueryResultRow } from "pg";
import {
  modelProviderConfigInputSchema,
  modelProviderConfigSchema,
  type ModelProvider,
  type ModelProviderConfig,
  type ModelProviderConfigInput
} from "@forgetbase/schema";

export interface ModelProviderConfigListOptions {
  tenantId?: string;
}

export interface ModelProviderConfigRepository {
  listProviderConfigs(options?: ModelProviderConfigListOptions): Promise<ModelProviderConfig[]>;
  upsertProviderConfig(input: ModelProviderConfigInput): Promise<ModelProviderConfig>;
}

export class PostgresModelProviderConfigRepository implements ModelProviderConfigRepository {
  constructor(private readonly pool: Pool) {}

  async listProviderConfigs(options: ModelProviderConfigListOptions = {}): Promise<ModelProviderConfig[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const result = await this.pool.query<ModelProviderConfigRow>(
      `
        SELECT *
        FROM model_provider_configs
        WHERE tenant_id = $1
        ORDER BY priority ASC, provider ASC
      `,
      [tenantId]
    );

    return result.rows.map(mapModelProviderConfigRow);
  }

  async upsertProviderConfig(input: ModelProviderConfigInput): Promise<ModelProviderConfig> {
    const parsed = modelProviderConfigInputSchema.parse(input);
    const result = await this.pool.query<ModelProviderConfigRow>(
      `
        INSERT INTO model_provider_configs (
          tenant_id,
          provider,
          enabled,
          display_name,
          base_url,
          api_key_env_var,
          default_model,
          available_models,
          priority,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (tenant_id, provider) DO UPDATE
        SET
          enabled = EXCLUDED.enabled,
          display_name = EXCLUDED.display_name,
          base_url = EXCLUDED.base_url,
          api_key_env_var = EXCLUDED.api_key_env_var,
          default_model = EXCLUDED.default_model,
          available_models = EXCLUDED.available_models,
          priority = EXCLUDED.priority,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.provider,
        parsed.enabled,
        parsed.displayName ?? null,
        parsed.baseUrl ?? null,
        parsed.apiKeyEnvVar ?? null,
        parsed.defaultModel ?? null,
        parsed.availableModels,
        parsed.priority,
        JSON.stringify(parsed.metadata)
      ]
    );

    return mapModelProviderConfigRow(requireRow(result.rows));
  }
}

export class InMemoryModelProviderConfigRepository implements ModelProviderConfigRepository {
  private readonly configs = new Map<string, ModelProviderConfig>();
  private sequence = 0;

  async listProviderConfigs(options: ModelProviderConfigListOptions = {}): Promise<ModelProviderConfig[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    return Array.from(this.configs.values())
      .filter((config) => config.tenantId === tenantId)
      .sort((left, right) => left.priority - right.priority || left.provider.localeCompare(right.provider));
  }

  async upsertProviderConfig(input: ModelProviderConfigInput): Promise<ModelProviderConfig> {
    const parsed = modelProviderConfigInputSchema.parse(input);
    const key = `${parsed.tenantId}:${parsed.provider}`;
    const existing = this.configs.get(key);
    this.sequence += existing ? 0 : 1;
    const now = new Date().toISOString();
    const config = modelProviderConfigSchema.parse({
      id: existing?.id ?? `provider_config_${this.sequence}`,
      tenantId: parsed.tenantId,
      provider: parsed.provider,
      enabled: parsed.enabled,
      displayName: parsed.displayName ?? null,
      baseUrl: parsed.baseUrl ?? null,
      apiKeyEnvVar: parsed.apiKeyEnvVar ?? null,
      defaultModel: parsed.defaultModel ?? null,
      availableModels: parsed.availableModels,
      priority: parsed.priority,
      metadata: parsed.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    this.configs.set(key, config);
    return config;
  }
}

function mapModelProviderConfigRow(row: ModelProviderConfigRow): ModelProviderConfig {
  return modelProviderConfigSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    enabled: row.enabled,
    displayName: row.display_name,
    baseUrl: row.base_url,
    apiKeyEnvVar: row.api_key_env_var,
    defaultModel: row.default_model,
    availableModels: row.available_models,
    priority: row.priority,
    metadata: row.metadata,
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

interface ModelProviderConfigRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  provider: ModelProvider;
  enabled: boolean;
  display_name: string | null;
  base_url: string | null;
  api_key_env_var: string | null;
  default_model: string | null;
  available_models: string[];
  priority: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
