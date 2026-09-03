import type { Pool, QueryResultRow } from "pg";
import { localSyncDigestSchema, type AuthPrincipalType } from "@forgetbase/schema";

export interface LocalSyncStateInput {
  tenantId: string;
  principalType: AuthPrincipalType;
  principalId: string;
  entitlementHash: string;
  recordSetHash: string;
  recordDescriptors: LocalSyncRecordDescriptor[];
}

export interface LocalSyncRecordDescriptor {
  stableId: string;
  payloadHash: string;
}

export interface LocalSyncState extends LocalSyncStateInput {
  authorizationEpoch: number;
  contentGeneration: number;
  createdAt: string;
  updatedAt: string;
  previousRecordSetHash: string | null;
  previousRecordDescriptors: LocalSyncRecordDescriptor[] | null;
}

export interface LocalSyncStateRepository {
  resolveState(input: LocalSyncStateInput): Promise<LocalSyncState>;
  bumpAuthorizationEpoch(input: Pick<LocalSyncStateInput, "tenantId" | "principalType" | "principalId">): Promise<number | null>;
}

export class PostgresLocalSyncStateRepository implements LocalSyncStateRepository {
  constructor(private readonly pool: Pool) {}

  async resolveState(input: LocalSyncStateInput): Promise<LocalSyncState> {
    const normalized = normalizeInput(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO local_sync_principal_state (
            tenant_id, principal_type, principal_id, entitlement_hash, record_set_hash, record_descriptors
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (tenant_id, principal_type, principal_id) DO NOTHING
        `,
        [
          normalized.tenantId,
          normalized.principalType,
          normalized.principalId,
          normalized.entitlementHash,
          normalized.recordSetHash,
          JSON.stringify(normalized.recordDescriptors)
        ]
      );
      const currentResult = await client.query<LocalSyncStateRow>(
        `
          SELECT *
          FROM local_sync_principal_state
          WHERE tenant_id = $1 AND principal_type = $2 AND principal_id = $3
          FOR UPDATE
        `,
        [normalized.tenantId, normalized.principalType, normalized.principalId]
      );
      const current = requireRow(currentResult.rows);
      const authorizationEpoch = parseSafePositiveInteger(current.authorization_epoch, "authorization_epoch")
        + (current.entitlement_hash === normalized.entitlementHash ? 0 : 1);
      const contentGeneration = parseSafePositiveInteger(current.content_generation, "content_generation")
        + (current.record_set_hash === normalized.recordSetHash ? 0 : 1);
      const updatedResult = await client.query<LocalSyncStateRow>(
        `
          UPDATE local_sync_principal_state
          SET entitlement_hash = $4,
            record_set_hash = $5,
            authorization_epoch = $6,
            content_generation = $7,
            previous_record_set_hash = CASE
              WHEN record_set_hash <> $5 THEN record_set_hash
              ELSE previous_record_set_hash
            END,
            previous_record_descriptors = CASE
              WHEN record_set_hash <> $5 THEN record_descriptors
              ELSE previous_record_descriptors
            END,
            record_descriptors = $8::jsonb,
            updated_at = CASE
              WHEN entitlement_hash <> $4 OR record_set_hash <> $5 THEN now()
              ELSE updated_at
            END
          WHERE tenant_id = $1 AND principal_type = $2 AND principal_id = $3
          RETURNING *
        `,
        [
          normalized.tenantId,
          normalized.principalType,
          normalized.principalId,
          normalized.entitlementHash,
          normalized.recordSetHash,
          authorizationEpoch,
          contentGeneration,
          JSON.stringify(normalized.recordDescriptors)
        ]
      );
      await client.query("COMMIT");
      return mapStateRow(requireRow(updatedResult.rows));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async bumpAuthorizationEpoch(
    input: Pick<LocalSyncStateInput, "tenantId" | "principalType" | "principalId">
  ): Promise<number | null> {
    assertIdentity(input);
    const result = await this.pool.query<{ authorization_epoch: string | number }>(
      `
        UPDATE local_sync_principal_state
        SET authorization_epoch = authorization_epoch + 1,
          updated_at = now()
        WHERE tenant_id = $1 AND principal_type = $2 AND principal_id = $3
        RETURNING authorization_epoch
      `,
      [input.tenantId, input.principalType, input.principalId]
    );
    const row = result.rows[0];
    return row ? parseSafePositiveInteger(row.authorization_epoch, "authorization_epoch") : null;
  }
}

export class InMemoryLocalSyncStateRepository implements LocalSyncStateRepository {
  private readonly states = new Map<string, LocalSyncState>();

  async resolveState(input: LocalSyncStateInput): Promise<LocalSyncState> {
    const normalized = normalizeInput(input);
    const key = JSON.stringify([normalized.tenantId, normalized.principalType, normalized.principalId]);
    const current = this.states.get(key);
    const now = new Date().toISOString();
    const changedEntitlements = current?.entitlementHash !== normalized.entitlementHash;
    const changedRecords = current?.recordSetHash !== normalized.recordSetHash;
    const state: LocalSyncState = {
      ...normalized,
      authorizationEpoch: current ? current.authorizationEpoch + (changedEntitlements ? 1 : 0) : 1,
      contentGeneration: current ? current.contentGeneration + (changedRecords ? 1 : 0) : 1,
      createdAt: current?.createdAt ?? now,
      updatedAt: current && !changedEntitlements && !changedRecords ? current.updatedAt : now,
      previousRecordSetHash: changedRecords && current
        ? current.recordSetHash
        : current?.previousRecordSetHash ?? null,
      previousRecordDescriptors: changedRecords && current
        ? current.recordDescriptors
        : current?.previousRecordDescriptors ?? null
    };
    this.states.set(key, state);
    return state;
  }

  async bumpAuthorizationEpoch(
    input: Pick<LocalSyncStateInput, "tenantId" | "principalType" | "principalId">
  ): Promise<number | null> {
    assertIdentity(input);
    const key = JSON.stringify([input.tenantId, input.principalType, input.principalId]);
    const current = this.states.get(key);
    if (!current) return null;
    const authorizationEpoch = current.authorizationEpoch + 1;
    if (!Number.isSafeInteger(authorizationEpoch)) {
      throw new RangeError("authorization_epoch exceeds the supported safe integer range");
    }
    this.states.set(key, { ...current, authorizationEpoch, updatedAt: new Date().toISOString() });
    return authorizationEpoch;
  }
}

function normalizeInput(input: LocalSyncStateInput): LocalSyncStateInput {
  assertIdentity(input);
  return {
    ...input,
    entitlementHash: localSyncDigestSchema.parse(input.entitlementHash),
    recordSetHash: localSyncDigestSchema.parse(input.recordSetHash),
    recordDescriptors: normalizeRecordDescriptors(input.recordDescriptors)
  };
}

function assertIdentity(input: Pick<LocalSyncStateInput, "tenantId" | "principalType" | "principalId">): void {
  if (!input.tenantId || !input.principalId) {
    throw new TypeError("Local sync state requires tenantId and principalId");
  }
  if (input.principalType !== "user" && input.principalType !== "service-account") {
    throw new TypeError("Local sync state requires a supported principal type");
  }
}

function mapStateRow(row: LocalSyncStateRow): LocalSyncState {
  return {
    tenantId: row.tenant_id,
    principalType: row.principal_type,
    principalId: row.principal_id,
    entitlementHash: localSyncDigestSchema.parse(row.entitlement_hash),
    recordSetHash: localSyncDigestSchema.parse(row.record_set_hash),
    authorizationEpoch: parseSafePositiveInteger(row.authorization_epoch, "authorization_epoch"),
    contentGeneration: parseSafePositiveInteger(row.content_generation, "content_generation"),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    recordDescriptors: normalizeRecordDescriptors(row.record_descriptors),
    previousRecordSetHash: row.previous_record_set_hash === null
      ? null
      : localSyncDigestSchema.parse(row.previous_record_set_hash),
    previousRecordDescriptors: row.previous_record_descriptors === null
      ? null
      : normalizeRecordDescriptors(row.previous_record_descriptors)
  };
}

function normalizeRecordDescriptors(input: unknown): LocalSyncRecordDescriptor[] {
  if (!Array.isArray(input) || input.length > 5_000) {
    throw new TypeError("Local sync record descriptors must be a bounded array");
  }
  const seen = new Set<string>();
  return input.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Local sync record descriptor is invalid");
    }
    const source = value as Record<string, unknown>;
    if (typeof source.stableId !== "string" || !source.stableId || source.stableId.length > 250
      || seen.has(source.stableId)) {
      throw new TypeError("Local sync record descriptor stable ID is invalid or duplicated");
    }
    seen.add(source.stableId);
    return { stableId: source.stableId, payloadHash: localSyncDigestSchema.parse(source.payloadHash) };
  }).sort((left, right) => left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0);
}

function parseSafePositiveInteger(value: string | number, label: string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError(`${label} exceeds the supported safe integer range`);
  }
  return parsed;
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) {
    throw new Error("Expected local sync state query to return a row");
  }
  return row;
}

interface LocalSyncStateRow extends QueryResultRow {
  tenant_id: string;
  principal_type: AuthPrincipalType;
  principal_id: string;
  entitlement_hash: string;
  record_set_hash: string;
  authorization_epoch: string | number;
  content_generation: string | number;
  created_at: Date;
  updated_at: Date;
  record_descriptors: unknown;
  previous_record_set_hash: string | null;
  previous_record_descriptors: unknown | null;
}
