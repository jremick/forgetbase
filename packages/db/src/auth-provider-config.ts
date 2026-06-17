import type { Pool, QueryResultRow } from "pg";
import {
  authProviderConfigInputSchema,
  authProviderConfigSchema,
  type AuthProviderConfig,
  type AuthProviderConfigInput,
  type ExternalAuthProvider,
  type UserRole
} from "@agentic-cms/schema";

export interface AuthProviderConfigListOptions {
  tenantId?: string;
}

export interface AuthProviderConfigRepository {
  listAuthProviderConfigs(options?: AuthProviderConfigListOptions): Promise<AuthProviderConfig[]>;
  upsertAuthProviderConfig(input: AuthProviderConfigInput): Promise<AuthProviderConfig>;
}

export class PostgresAuthProviderConfigRepository implements AuthProviderConfigRepository {
  constructor(private readonly pool: Pool) {}

  async listAuthProviderConfigs(options: AuthProviderConfigListOptions = {}): Promise<AuthProviderConfig[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const result = await this.pool.query<AuthProviderConfigRow>(
      `
        SELECT *
        FROM auth_provider_configs
        WHERE tenant_id = $1
        ORDER BY priority ASC, provider ASC
      `,
      [tenantId]
    );

    return result.rows.map(mapAuthProviderConfigRow);
  }

  async upsertAuthProviderConfig(input: AuthProviderConfigInput): Promise<AuthProviderConfig> {
    const parsed = authProviderConfigInputSchema.parse(input);
    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<AuthProviderConfigRow>(
      `
        INSERT INTO auth_provider_configs (
          tenant_id,
          provider,
          enabled,
          display_name,
          issuer_url,
          client_id,
          client_secret_env_var,
          redirect_uri,
          scopes,
          email_claim,
          display_name_claim,
          group_claim,
          role_claim,
          default_role,
          auto_provision_users,
          account_linking_mode,
          group_sync_enabled,
          allowed_domains,
          pkce_required,
          priority,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb)
        ON CONFLICT (tenant_id, provider) DO UPDATE
        SET
          enabled = EXCLUDED.enabled,
          display_name = EXCLUDED.display_name,
          issuer_url = EXCLUDED.issuer_url,
          client_id = EXCLUDED.client_id,
          client_secret_env_var = EXCLUDED.client_secret_env_var,
          redirect_uri = EXCLUDED.redirect_uri,
          scopes = EXCLUDED.scopes,
          email_claim = EXCLUDED.email_claim,
          display_name_claim = EXCLUDED.display_name_claim,
          group_claim = EXCLUDED.group_claim,
          role_claim = EXCLUDED.role_claim,
          default_role = EXCLUDED.default_role,
          auto_provision_users = EXCLUDED.auto_provision_users,
          account_linking_mode = EXCLUDED.account_linking_mode,
          group_sync_enabled = EXCLUDED.group_sync_enabled,
          allowed_domains = EXCLUDED.allowed_domains,
          pkce_required = EXCLUDED.pkce_required,
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
        parsed.issuerUrl,
        parsed.clientId,
        parsed.clientSecretEnvVar ?? null,
        parsed.redirectUri ?? null,
        parsed.scopes,
        parsed.emailClaim,
        parsed.displayNameClaim,
        parsed.groupClaim ?? null,
        parsed.roleClaim ?? null,
        parsed.defaultRole,
        parsed.autoProvisionUsers,
        parsed.accountLinkingMode,
        parsed.groupSyncEnabled,
        parsed.allowedDomains,
        parsed.pkceRequired,
        parsed.priority,
        JSON.stringify(parsed.metadata)
      ]
    );

    return mapAuthProviderConfigRow(requireRow(result.rows));
  }
}

export class InMemoryAuthProviderConfigRepository implements AuthProviderConfigRepository {
  private readonly configs = new Map<string, AuthProviderConfig>();
  private sequence = 0;

  async listAuthProviderConfigs(options: AuthProviderConfigListOptions = {}): Promise<AuthProviderConfig[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    return Array.from(this.configs.values())
      .filter((config) => config.tenantId === tenantId)
      .sort((left, right) => left.priority - right.priority || left.provider.localeCompare(right.provider));
  }

  async upsertAuthProviderConfig(input: AuthProviderConfigInput): Promise<AuthProviderConfig> {
    const parsed = authProviderConfigInputSchema.parse(input);
    const key = `${parsed.tenantId}:${parsed.provider}`;
    const existing = this.configs.get(key);
    this.sequence += existing ? 0 : 1;
    const now = new Date().toISOString();
    const config = authProviderConfigSchema.parse({
      id: existing?.id ?? `auth_provider_config_${this.sequence}`,
      tenantId: parsed.tenantId,
      provider: parsed.provider,
      enabled: parsed.enabled,
      displayName: parsed.displayName ?? null,
      issuerUrl: parsed.issuerUrl,
      clientId: parsed.clientId,
      clientSecretEnvVar: parsed.clientSecretEnvVar ?? null,
      redirectUri: parsed.redirectUri ?? null,
      scopes: parsed.scopes,
      emailClaim: parsed.emailClaim,
      displayNameClaim: parsed.displayNameClaim,
      groupClaim: parsed.groupClaim ?? null,
      roleClaim: parsed.roleClaim ?? null,
      defaultRole: parsed.defaultRole,
      autoProvisionUsers: parsed.autoProvisionUsers,
      accountLinkingMode: parsed.accountLinkingMode,
      groupSyncEnabled: parsed.groupSyncEnabled,
      allowedDomains: parsed.allowedDomains,
      pkceRequired: parsed.pkceRequired,
      priority: parsed.priority,
      metadata: parsed.metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    this.configs.set(key, config);
    return config;
  }
}

function mapAuthProviderConfigRow(row: AuthProviderConfigRow): AuthProviderConfig {
  return authProviderConfigSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    enabled: row.enabled,
    displayName: row.display_name,
    issuerUrl: row.issuer_url,
    clientId: row.client_id,
    clientSecretEnvVar: row.client_secret_env_var,
    redirectUri: row.redirect_uri,
    scopes: row.scopes,
    emailClaim: row.email_claim,
    displayNameClaim: row.display_name_claim,
    groupClaim: row.group_claim,
    roleClaim: row.role_claim,
    defaultRole: row.default_role,
    autoProvisionUsers: row.auto_provision_users,
    accountLinkingMode: row.account_linking_mode,
    groupSyncEnabled: row.group_sync_enabled,
    allowedDomains: row.allowed_domains,
    pkceRequired: row.pkce_required,
    priority: row.priority,
    metadata: row.metadata,
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
    throw new Error("Expected query to return a row");
  }

  return row;
}

interface AuthProviderConfigRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  provider: ExternalAuthProvider;
  enabled: boolean;
  display_name: string | null;
  issuer_url: string;
  client_id: string;
  client_secret_env_var: string | null;
  redirect_uri: string | null;
  scopes: string[];
  email_claim: string;
  display_name_claim: string;
  group_claim: string | null;
  role_claim: string | null;
  default_role: UserRole;
  auto_provision_users: boolean;
  account_linking_mode: "disabled" | "verified-email" | "email";
  group_sync_enabled: boolean;
  allowed_domains: string[];
  pkce_required: boolean;
  priority: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
