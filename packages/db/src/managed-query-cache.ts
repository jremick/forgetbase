import type { Pool, QueryResultRow } from "pg";
import {
  managedQueryCachePolicyInputSchema,
  managedQueryCachePolicySchema,
  managedQueryGenerationSchema,
  type ManagedQueryCachePolicy,
  type ManagedQueryCachePolicyInput,
  type ManagedQueryGeneration,
  type ManagedQueryMode,
  type ModelProvider,
  type Surface
} from "@agentic-cms/schema";

export const DEFAULT_MANAGED_QUERY_CACHE_POLICY = {
  cacheEnabled: true,
  maxCacheTtlSeconds: 3600
} as const;

export interface ManagedQueryCacheEntry {
  id: string;
  tenantId: string;
  cacheKey: string;
  provider: ModelProvider;
  model: string;
  mode: Extract<ManagedQueryMode, "provider-routed">;
  queryHash: string;
  surface: Surface;
  principalHash: string;
  contextHash: string;
  answer: string;
  generation: ManagedQueryGeneration;
  metadata: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  lastHitAt: string | null;
  hitCount: number;
}

export interface ManagedQueryCacheLookupInput {
  tenantId?: string;
  cacheKey: string;
  now?: Date;
}

export interface ManagedQueryCacheListOptions {
  tenantId?: string;
  limit?: number;
}

export interface ManagedQueryCacheDeleteInput {
  tenantId?: string;
  cacheKey: string;
}

export interface ManagedQueryCachePurgeOptions {
  tenantId?: string;
  expiredBefore: string;
  dryRun?: boolean;
}

export interface ManagedQueryCacheInvalidateTenantInput {
  tenantId?: string;
  dryRun?: boolean;
}

export interface ManagedQueryCacheTenantPurgeResult {
  tenantId: string;
  deletedCount: number;
}

export interface ManagedQueryCachePurgeAllTenantsOptions {
  expiredBefore: string;
  dryRun?: boolean;
}

export interface ManagedQueryCachePolicyRepositoryInput extends ManagedQueryCachePolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export interface ManagedQueryCacheUpsertInput {
  tenantId?: string;
  cacheKey: string;
  provider: ModelProvider;
  model: string;
  mode: Extract<ManagedQueryMode, "provider-routed">;
  queryHash: string;
  surface: Surface;
  principalHash: string;
  contextHash: string;
  answer: string;
  generation: ManagedQueryGeneration;
  metadata?: Record<string, unknown>;
  expiresAt: string;
}

export interface ManagedQueryCacheRepository {
  getFresh(input: ManagedQueryCacheLookupInput): Promise<ManagedQueryCacheEntry | null>;
  upsert(input: ManagedQueryCacheUpsertInput): Promise<ManagedQueryCacheEntry>;
  listEntries(options?: ManagedQueryCacheListOptions): Promise<ManagedQueryCacheEntry[]>;
  deleteEntry(input: ManagedQueryCacheDeleteInput): Promise<ManagedQueryCacheEntry | null>;
  invalidateTenant(input?: ManagedQueryCacheInvalidateTenantInput): Promise<number>;
  purgeExpired(options: ManagedQueryCachePurgeOptions): Promise<number>;
  purgeExpiredForAllTenants(
    options: ManagedQueryCachePurgeAllTenantsOptions
  ): Promise<ManagedQueryCacheTenantPurgeResult[]>;
}

export interface ManagedQueryCachePolicyRepository {
  getPolicy(tenantId?: string): Promise<ManagedQueryCachePolicy>;
  upsertPolicy(input: ManagedQueryCachePolicyRepositoryInput): Promise<ManagedQueryCachePolicy>;
}

export class PostgresManagedQueryCacheRepository implements ManagedQueryCacheRepository {
  constructor(private readonly pool: Pool) {}

  async getFresh(input: ManagedQueryCacheLookupInput): Promise<ManagedQueryCacheEntry | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const now = input.now ?? new Date();
    const result = await this.pool.query<ManagedQueryCacheRow>(
      `
        UPDATE managed_query_cache
        SET
          last_hit_at = $3::timestamptz,
          hit_count = hit_count + 1,
          updated_at = now()
        WHERE tenant_id = $1
          AND cache_key = $2
          AND expires_at > $3::timestamptz
        RETURNING *
      `,
      [tenantId, input.cacheKey, now.toISOString()]
    );

    return result.rows[0] ? mapManagedQueryCacheRow(result.rows[0]) : null;
  }

  async upsert(input: ManagedQueryCacheUpsertInput): Promise<ManagedQueryCacheEntry> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const generation = managedQueryGenerationSchema.parse(input.generation);
    const result = await this.pool.query<ManagedQueryCacheRow>(
      `
        INSERT INTO managed_query_cache (
          tenant_id,
          cache_key,
          provider,
          model,
          mode,
          query_hash,
          surface,
          principal_hash,
          context_hash,
          answer,
          generation,
          metadata,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::timestamptz)
        ON CONFLICT (tenant_id, cache_key) DO UPDATE
        SET
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          mode = EXCLUDED.mode,
          query_hash = EXCLUDED.query_hash,
          surface = EXCLUDED.surface,
          principal_hash = EXCLUDED.principal_hash,
          context_hash = EXCLUDED.context_hash,
          answer = EXCLUDED.answer,
          generation = EXCLUDED.generation,
          metadata = EXCLUDED.metadata,
          expires_at = EXCLUDED.expires_at,
          updated_at = now()
        RETURNING *
      `,
      [
        tenantId,
        input.cacheKey,
        input.provider,
        input.model,
        input.mode,
        input.queryHash,
        input.surface,
        input.principalHash,
        input.contextHash,
        input.answer,
        JSON.stringify(generation),
        JSON.stringify(input.metadata ?? {}),
        input.expiresAt
      ]
    );

    return mapManagedQueryCacheRow(requireRow(result.rows));
  }

  async listEntries(options: ManagedQueryCacheListOptions = {}): Promise<ManagedQueryCacheEntry[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<ManagedQueryCacheRow>(
      `
        SELECT *
        FROM managed_query_cache
        WHERE tenant_id = $1
        ORDER BY expires_at ASC, updated_at DESC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapManagedQueryCacheRow);
  }

  async deleteEntry(input: ManagedQueryCacheDeleteInput): Promise<ManagedQueryCacheEntry | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const result = await this.pool.query<ManagedQueryCacheRow>(
      "DELETE FROM managed_query_cache WHERE tenant_id = $1 AND cache_key = $2 RETURNING *",
      [tenantId, input.cacheKey]
    );

    return result.rows[0] ? mapManagedQueryCacheRow(result.rows[0]) : null;
  }

  async invalidateTenant(input: ManagedQueryCacheInvalidateTenantInput = {}): Promise<number> {
    const tenantId = input.tenantId ?? "tenant_demo";

    if (input.dryRun ?? false) {
      const result = await this.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM managed_query_cache WHERE tenant_id = $1",
        [tenantId]
      );

      return Number.parseInt(result.rows[0]?.count ?? "0", 10);
    }

    const result = await this.pool.query<{ id: string }>(
      "DELETE FROM managed_query_cache WHERE tenant_id = $1 RETURNING id",
      [tenantId]
    );

    return result.rowCount ?? 0;
  }

  async purgeExpired(options: ManagedQueryCachePurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";

    if (options.dryRun ?? true) {
      const result = await this.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM managed_query_cache WHERE tenant_id = $1 AND expires_at <= $2::timestamptz",
        [tenantId, options.expiredBefore]
      );

      return Number.parseInt(result.rows[0]?.count ?? "0", 10);
    }

    const result = await this.pool.query<{ id: string }>(
      "DELETE FROM managed_query_cache WHERE tenant_id = $1 AND expires_at <= $2::timestamptz RETURNING id",
      [tenantId, options.expiredBefore]
    );

    return result.rowCount ?? 0;
  }

  async purgeExpiredForAllTenants(
    options: ManagedQueryCachePurgeAllTenantsOptions
  ): Promise<ManagedQueryCacheTenantPurgeResult[]> {
    if (options.dryRun ?? true) {
      const result = await this.pool.query<{ tenant_id: string; deleted_count: string }>(
        `
          SELECT tenant_id, count(*)::text AS deleted_count
          FROM managed_query_cache
          WHERE expires_at <= $1::timestamptz
          GROUP BY tenant_id
          ORDER BY tenant_id ASC
        `,
        [options.expiredBefore]
      );

      return result.rows.map((row) => ({
        tenantId: row.tenant_id,
        deletedCount: Number.parseInt(row.deleted_count, 10)
      }));
    }

    const result = await this.pool.query<{ tenant_id: string }>(
      `
        DELETE FROM managed_query_cache
        WHERE expires_at <= $1::timestamptz
        RETURNING tenant_id
      `,
      [options.expiredBefore]
    );

    return summarizeTenantPurgeRows(result.rows.map((row) => row.tenant_id));
  }
}

export class PostgresManagedQueryCachePolicyRepository implements ManagedQueryCachePolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryCachePolicy> {
    const result = await this.pool.query<ManagedQueryCachePolicyRow>(
      "SELECT * FROM managed_query_cache_policies WHERE tenant_id = $1",
      [tenantId]
    );
    const row = result.rows[0];

    return row ? mapManagedQueryCachePolicyRow(row) : defaultManagedQueryCachePolicy(tenantId);
  }

  async upsertPolicy(input: ManagedQueryCachePolicyRepositoryInput): Promise<ManagedQueryCachePolicy> {
    const parsed = managedQueryCachePolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const next = {
      cacheEnabled: parsed.cacheEnabled === undefined ? current.cacheEnabled : parsed.cacheEnabled,
      maxCacheTtlSeconds: parsed.maxCacheTtlSeconds === undefined
        ? current.maxCacheTtlSeconds
        : parsed.maxCacheTtlSeconds
    };

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<ManagedQueryCachePolicyRow>(
      `
        INSERT INTO managed_query_cache_policies (
          tenant_id,
          cache_enabled,
          max_cache_ttl_seconds,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          cache_enabled = EXCLUDED.cache_enabled,
          max_cache_ttl_seconds = EXCLUDED.max_cache_ttl_seconds,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.cacheEnabled,
        next.maxCacheTtlSeconds,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapManagedQueryCachePolicyRow(requireRow(result.rows));
  }
}

export class InMemoryManagedQueryCacheRepository implements ManagedQueryCacheRepository {
  private readonly entries = new Map<string, ManagedQueryCacheEntry>();
  private sequence = 0;

  async getFresh(input: ManagedQueryCacheLookupInput): Promise<ManagedQueryCacheEntry | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const key = buildMemoryKey(tenantId, input.cacheKey);
    const entry = this.entries.get(key);
    const now = input.now ?? new Date();

    if (!entry || Date.parse(entry.expiresAt) <= now.getTime()) {
      if (entry) {
        this.entries.delete(key);
      }

      return null;
    }

    const updated = {
      ...entry,
      updatedAt: now.toISOString(),
      lastHitAt: now.toISOString(),
      hitCount: entry.hitCount + 1
    };
    this.entries.set(key, updated);
    return updated;
  }

  async upsert(input: ManagedQueryCacheUpsertInput): Promise<ManagedQueryCacheEntry> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const key = buildMemoryKey(tenantId, input.cacheKey);
    const existing = this.entries.get(key);
    const now = new Date().toISOString();

    if (!existing) {
      this.sequence += 1;
    }

    const entry: ManagedQueryCacheEntry = {
      id: existing?.id ?? `managed_query_cache_${this.sequence}`,
      tenantId,
      cacheKey: input.cacheKey,
      provider: input.provider,
      model: input.model,
      mode: input.mode,
      queryHash: input.queryHash,
      surface: input.surface,
      principalHash: input.principalHash,
      contextHash: input.contextHash,
      answer: input.answer,
      generation: managedQueryGenerationSchema.parse(input.generation),
      metadata: input.metadata ?? {},
      expiresAt: input.expiresAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastHitAt: existing?.lastHitAt ?? null,
      hitCount: existing?.hitCount ?? 0
    };

    this.entries.set(key, entry);
    return entry;
  }

  async listEntries(options: ManagedQueryCacheListOptions = {}): Promise<ManagedQueryCacheEntry[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    return Array.from(this.entries.values())
      .filter((entry) => entry.tenantId === tenantId)
      .sort((left, right) =>
        Date.parse(left.expiresAt) - Date.parse(right.expiresAt) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )
      .slice(0, limit);
  }

  async deleteEntry(input: ManagedQueryCacheDeleteInput): Promise<ManagedQueryCacheEntry | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const key = buildMemoryKey(tenantId, input.cacheKey);
    const entry = this.entries.get(key) ?? null;

    if (entry) {
      this.entries.delete(key);
    }

    return entry;
  }

  async invalidateTenant(input: ManagedQueryCacheInvalidateTenantInput = {}): Promise<number> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const tenantEntries = Array.from(this.entries.entries()).filter(([, entry]) => entry.tenantId === tenantId);

    if (!(input.dryRun ?? false)) {
      for (const [key] of tenantEntries) {
        this.entries.delete(key);
      }
    }

    return tenantEntries.length;
  }

  async purgeExpired(options: ManagedQueryCachePurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const cutoff = Date.parse(options.expiredBefore);
    const expired = Array.from(this.entries.entries()).filter(([, entry]) =>
      entry.tenantId === tenantId && Date.parse(entry.expiresAt) <= cutoff
    );

    if (!(options.dryRun ?? true)) {
      for (const [key] of expired) {
        this.entries.delete(key);
      }
    }

    return expired.length;
  }

  async purgeExpiredForAllTenants(
    options: ManagedQueryCachePurgeAllTenantsOptions
  ): Promise<ManagedQueryCacheTenantPurgeResult[]> {
    const cutoff = Date.parse(options.expiredBefore);
    const expired = Array.from(this.entries.entries()).filter(([, entry]) =>
      Date.parse(entry.expiresAt) <= cutoff
    );

    if (!(options.dryRun ?? true)) {
      for (const [key] of expired) {
        this.entries.delete(key);
      }
    }

    return summarizeTenantPurgeRows(expired.map(([, entry]) => entry.tenantId));
  }
}

export class InMemoryManagedQueryCachePolicyRepository implements ManagedQueryCachePolicyRepository {
  private readonly policies = new Map<string, ManagedQueryCachePolicy>();

  async getPolicy(tenantId = "tenant_demo"): Promise<ManagedQueryCachePolicy> {
    return this.policies.get(tenantId) ?? defaultManagedQueryCachePolicy(tenantId);
  }

  async upsertPolicy(input: ManagedQueryCachePolicyRepositoryInput): Promise<ManagedQueryCachePolicy> {
    const parsed = managedQueryCachePolicyInputSchema.parse(input);
    const current = await this.getPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = managedQueryCachePolicySchema.parse({
      tenantId: parsed.tenantId,
      cacheEnabled: parsed.cacheEnabled === undefined ? current.cacheEnabled : parsed.cacheEnabled,
      maxCacheTtlSeconds: parsed.maxCacheTtlSeconds === undefined
        ? current.maxCacheTtlSeconds
        : parsed.maxCacheTtlSeconds,
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

function summarizeTenantPurgeRows(tenantIds: string[]): ManagedQueryCacheTenantPurgeResult[] {
  const counts = new Map<string, number>();

  for (const tenantId of tenantIds) {
    counts.set(tenantId, (counts.get(tenantId) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tenantId, deletedCount]) => ({
      tenantId,
      deletedCount
    }));
}

function mapManagedQueryCacheRow(row: ManagedQueryCacheRow): ManagedQueryCacheEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    cacheKey: row.cache_key,
    provider: row.provider,
    model: row.model,
    mode: row.mode,
    queryHash: row.query_hash,
    surface: row.surface,
    principalHash: row.principal_hash,
    contextHash: row.context_hash,
    answer: row.answer,
    generation: managedQueryGenerationSchema.parse(row.generation),
    metadata: row.metadata,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastHitAt: row.last_hit_at?.toISOString() ?? null,
    hitCount: row.hit_count
  };
}

function mapManagedQueryCachePolicyRow(row: ManagedQueryCachePolicyRow): ManagedQueryCachePolicy {
  return managedQueryCachePolicySchema.parse({
    tenantId: row.tenant_id,
    cacheEnabled: row.cache_enabled,
    maxCacheTtlSeconds: row.max_cache_ttl_seconds,
    source: "stored",
    updatedByUserId: row.updated_by_user_id,
    updatedByServiceAccountId: row.updated_by_service_account_id,
    updatedByApiKeyId: row.updated_by_api_key_id,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString()
  });
}

export function defaultManagedQueryCachePolicy(tenantId: string): ManagedQueryCachePolicy {
  return managedQueryCachePolicySchema.parse({
    tenantId,
    ...DEFAULT_MANAGED_QUERY_CACHE_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
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

function buildMemoryKey(tenantId: string, cacheKey: string): string {
  return `${tenantId}:${cacheKey}`;
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error("Expected query to return a row");
  }

  return row;
}

interface ManagedQueryCacheRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  cache_key: string;
  provider: ModelProvider;
  model: string;
  mode: Extract<ManagedQueryMode, "provider-routed">;
  query_hash: string;
  surface: Surface;
  principal_hash: string;
  context_hash: string;
  answer: string;
  generation: unknown;
  metadata: Record<string, unknown>;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
  last_hit_at: Date | null;
  hit_count: number;
}

interface ManagedQueryCachePolicyRow extends QueryResultRow {
  tenant_id: string;
  cache_enabled: boolean;
  max_cache_ttl_seconds: number | null;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date;
  updated_at: Date;
}
