import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export const assetChangeErrorCodes = [
  "asset_lookup_failed", "asset_index_failed", "asset_cache_invalidation_failed", "asset_reconciliation_failed"
] as const;
export type AssetChangeErrorCode = typeof assetChangeErrorCodes[number];

export interface AssetChangeWork {
  tenantId: string;
  assetId: string;
  stableId: string;
  generation: string;
  leaseToken: string;
  attempts: number;
}

export interface AssetChangeClaimOptions {
  tenantId?: string;
  assetId?: string;
  limit?: number;
  leaseDurationMs?: number;
}

export interface AssetChangeOutboxHealth {
  pending: number;
  processing: number;
  failed: number;
  /** Oldest unfinished change, including leased or failed work. */
  oldestPendingAt: string | null;
  oldestPendingAgeMs: number | null;
}

export interface AssetChangeOutboxRepository {
  claim(options?: AssetChangeClaimOptions): Promise<AssetChangeWork[]>;
  complete(work: AssetChangeWork): Promise<boolean>;
  fail(work: AssetChangeWork, errorCode: AssetChangeErrorCode): Promise<boolean>;
  getHealth(tenantId?: string): Promise<AssetChangeOutboxHealth>;
}

export class PostgresAssetChangeOutboxRepository implements AssetChangeOutboxRepository {
  constructor(private readonly pool: Pool) {}

  async claim(options: AssetChangeClaimOptions = {}): Promise<AssetChangeWork[]> {
    const { limit, leaseDurationMs } = claimBounds(options);
    const result = await this.pool.query<{
      tenant_id: string; asset_id: string; stable_id: string; generation: string; lease_token: string; attempts: number;
    }>(`
      WITH candidates AS (
        SELECT tenant_id, asset_id FROM asset_change_outbox
        WHERE ($1::text IS NULL OR tenant_id = $1)
          AND ($4::uuid IS NULL OR asset_id = $4::uuid)
          AND available_at <= clock_timestamp()
          AND (state IN ('pending', 'failed') OR lease_expires_at <= clock_timestamp())
        ORDER BY available_at, queued_at, tenant_id, asset_id
        LIMIT $2 FOR UPDATE SKIP LOCKED
      )
      UPDATE asset_change_outbox work SET
        state = 'processing', attempts = LEAST(work.attempts + 1, 8),
        lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + $3::integer * interval '1 millisecond'
      FROM candidates
      WHERE work.tenant_id = candidates.tenant_id AND work.asset_id = candidates.asset_id
      RETURNING work.tenant_id, work.asset_id, work.stable_id, work.generation::text, work.lease_token, work.attempts
    `, [options.tenantId ?? null, limit, leaseDurationMs, options.assetId ?? null]);
    return result.rows.map((row) => ({
      tenantId: row.tenant_id, assetId: row.asset_id, stableId: row.stable_id,
      generation: row.generation, leaseToken: row.lease_token, attempts: row.attempts
    }));
  }

  async complete(work: AssetChangeWork): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM asset_change_outbox
      WHERE tenant_id = $1 AND asset_id = $2 AND generation = $3::bigint AND lease_token = $4::uuid
        AND state = 'processing' AND lease_expires_at > clock_timestamp()
    `, [work.tenantId, work.assetId, work.generation, work.leaseToken]);
    return result.rowCount === 1;
  }

  async fail(work: AssetChangeWork, errorCode: AssetChangeErrorCode): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE asset_change_outbox SET
        state = CASE WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END,
        available_at = clock_timestamp() + $5::integer * interval '1 millisecond',
        lease_token = NULL, lease_expires_at = NULL, last_error_code = $6
      WHERE tenant_id = $1 AND asset_id = $2 AND generation = $3::bigint AND lease_token = $4::uuid
        AND state = 'processing' AND lease_expires_at > clock_timestamp()
    `, [work.tenantId, work.assetId, work.generation, work.leaseToken, retryDelayMs(work.attempts), safeErrorCode(errorCode)]);
    return result.rowCount === 1;
  }

  async getHealth(tenantId?: string): Promise<AssetChangeOutboxHealth> {
    const result = await this.pool.query<{
      pending: string; processing: string; failed: string; oldest: Date | null; age_ms: string | null;
    }>(`
      SELECT count(*) FILTER (WHERE state = 'pending')::text AS pending,
        count(*) FILTER (WHERE state = 'processing')::text AS processing,
        count(*) FILTER (WHERE state = 'failed')::text AS failed,
        min(queued_at) AS oldest,
        greatest(0, floor(extract(epoch FROM (clock_timestamp() - min(queued_at))) * 1000))::text AS age_ms
      FROM asset_change_outbox WHERE ($1::text IS NULL OR tenant_id = $1)
    `, [tenantId ?? null]);
    const row = result.rows[0];
    return {
      pending: Number(row?.pending ?? 0), processing: Number(row?.processing ?? 0), failed: Number(row?.failed ?? 0),
      oldestPendingAt: row?.oldest?.toISOString() ?? null,
      oldestPendingAgeMs: row?.oldest ? Number(row.age_ms) : null
    };
  }
}

interface MemoryWork {
  tenantId: string;
  assetId: string;
  stableId: string;
  generation: bigint;
  state: "pending" | "processing" | "failed";
  attempts: number;
  availableAt: number;
  queuedAt: number;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  lastErrorCode: AssetChangeErrorCode | null;
}

/** Synthetic repositories call recordChange after their canonical in-memory mutation. */
export class InMemoryAssetChangeOutboxRepository implements AssetChangeOutboxRepository {
  private readonly work = new Map<string, MemoryWork>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async recordChange(change: { tenantId: string; assetId: string; stableId: string }): Promise<void> {
    const key = workKey(change);
    const previous = this.work.get(key);
    const now = this.now().getTime();
    this.work.set(key, {
      ...change, generation: (previous?.generation ?? 0n) + 1n, state: "pending", attempts: 0,
      availableAt: now, queuedAt: previous?.queuedAt ?? now, leaseToken: null, leaseExpiresAt: null, lastErrorCode: null
    });
  }

  async claim(options: AssetChangeClaimOptions = {}): Promise<AssetChangeWork[]> {
    const { limit, leaseDurationMs } = claimBounds(options);
    const now = this.now().getTime();
    return [...this.work.values()]
      .filter((work) => (options.tenantId === undefined || work.tenantId === options.tenantId) &&
        (options.assetId === undefined || work.assetId === options.assetId) &&
        work.availableAt <= now && (work.state !== "processing" || (work.leaseExpiresAt ?? 0) <= now))
      .sort((left, right) => left.availableAt - right.availableAt || left.queuedAt - right.queuedAt ||
        workKey(left).localeCompare(workKey(right)))
      .slice(0, limit)
      .map((work) => {
        work.state = "processing";
        work.attempts = Math.min(work.attempts + 1, 8);
        work.leaseToken = randomUUID();
        work.leaseExpiresAt = now + leaseDurationMs;
        return {
          tenantId: work.tenantId, assetId: work.assetId, stableId: work.stableId,
          generation: String(work.generation), leaseToken: work.leaseToken, attempts: work.attempts
        };
      });
  }

  async complete(claim: AssetChangeWork): Promise<boolean> {
    if (!this.leasedWork(claim)) return false;
    return this.work.delete(workKey(claim));
  }

  async fail(claim: AssetChangeWork, errorCode: AssetChangeErrorCode): Promise<boolean> {
    const work = this.leasedWork(claim);
    if (!work) return false;
    work.state = work.attempts >= 8 ? "failed" : "pending";
    work.availableAt = this.now().getTime() + retryDelayMs(work.attempts);
    work.leaseToken = null;
    work.leaseExpiresAt = null;
    work.lastErrorCode = safeErrorCode(errorCode);
    return true;
  }

  async getHealth(tenantId?: string): Promise<AssetChangeOutboxHealth> {
    const items = [...this.work.values()].filter((work) => tenantId === undefined || work.tenantId === tenantId);
    const oldest = items.length > 0 ? Math.min(...items.map((work) => work.queuedAt)) : null;
    return {
      pending: items.filter((work) => work.state === "pending").length,
      processing: items.filter((work) => work.state === "processing").length,
      failed: items.filter((work) => work.state === "failed").length,
      oldestPendingAt: oldest === null ? null : new Date(oldest).toISOString(),
      oldestPendingAgeMs: oldest === null ? null : Math.max(0, this.now().getTime() - oldest)
    };
  }

  private leasedWork(claim: AssetChangeWork): MemoryWork | undefined {
    const work = this.work.get(workKey(claim));
    return work?.state === "processing" && String(work.generation) === claim.generation &&
      work.leaseToken === claim.leaseToken && (work.leaseExpiresAt ?? 0) > this.now().getTime() ? work : undefined;
  }
}

function workKey(work: { tenantId: string; assetId: string }): string {
  return JSON.stringify([work.tenantId, work.assetId]);
}

function claimBounds(options: AssetChangeClaimOptions): { limit: number; leaseDurationMs: number } {
  return {
    limit: boundedInteger(options.limit, 25, 1, 100),
    leaseDurationMs: boundedInteger(options.leaseDurationMs, 60_000, 1, 300_000)
  };
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value !== undefined && Number.isSafeInteger(value) ? Math.min(Math.max(value, minimum), maximum) : fallback;
}

function retryDelayMs(attempts: number): number {
  return attempts >= 8 ? 300_000 : 1_000 * 2 ** Math.max(0, attempts - 1);
}

function safeErrorCode(code: AssetChangeErrorCode): AssetChangeErrorCode {
  return assetChangeErrorCodes.includes(code) ? code : "asset_reconciliation_failed";
}
