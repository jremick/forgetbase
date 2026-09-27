import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import {
  apiKeyCreateInputSchema,
  apiKeyCreatedSchema,
  apiKeyRecordSchema,
  apiKeyRotationReportInputSchema,
  apiKeyRotationReportSchema,
  apiKeyRotateInputSchema,
  apiKeyRotateResponseSchema,
  auditEventCreateInputSchema,
  auditEventSchema,
  authPrincipalSchema,
  groupCreateInputSchema,
  groupMembershipInputSchema,
  groupMembershipSchema,
  groupRecordSchema,
  loginSessionRecordSchema,
  loginSessionRevokeResponseSchema,
  localUserCreateInputSchema,
  localUserSchema,
  localUserUpdateInputSchema,
  permissionGrantCreateInputSchema,
  permissionGrantListInputSchema,
  permissionGrantSchema,
  serviceAccountCreateInputSchema,
  serviceAccountPolicyInputSchema,
  serviceAccountPolicySchema,
  serviceAccountSchema,
  serviceAccountUpdateInputSchema,
  type ApiKeyCreated,
  type ApiKeyCreateInput,
  type ApiKeyRecord,
  type ApiKeyRotationReport,
  type ApiKeyRotationReportInput,
  type ApiKeyRotationReminder,
  type ApiKeyRotateInput,
  type ApiKeyRotateResponse,
  type ApiKeyScope,
  type AuditEvent,
  type AuditEventCreateInput,
  type AuthPrincipal,
  type ExternalAuthProvider,
  type GroupCreateInput,
  type GroupMembership,
  type GroupMembershipInput,
  type GroupRecord,
  type LoginSessionRecord,
  type LoginSessionRevokeResponse,
  type LoginSessionSource,
  type LocalUser,
  type LocalUserCreateInput,
  type LocalUserUpdateInput,
  type PermissionAction,
  type PermissionGrant,
  type PermissionGrantCreateInput,
  type PermissionGrantListInput,
  type PermissionGrantListResponse,
  type ServiceAccount,
  type ServiceAccountCreateInput,
  type ServiceAccountPolicy,
  type ServiceAccountPolicyInput,
  type ServiceAccountUpdateInput,
  type Surface,
  type UserAuthProvider,
  type UserRole,
  type AssetRecord
} from "@forgetbase/schema";

export interface AccessCheckInput {
  principal: AuthPrincipal | null;
  asset: AssetRecord;
  action: PermissionAction;
  surface: Surface;
}

export interface AssetAccessFilterInput extends Omit<AccessCheckInput, "asset"> {
  assets: AssetRecord[];
}

export interface PermissionGrantListOptions extends PermissionGrantListInput {
  tenantId?: string;
  stableId: string;
}

export interface PermissionGrantRevokeInput {
  tenantId?: string;
  stableId: string;
  grantId: string;
}

export interface BootstrapAdminInput {
  tenantId: string;
  email: string;
  displayName: string;
  password?: string;
  keyName: string;
}

export interface BootstrapAdminResult extends ApiKeyCreated {
  user: LocalUser;
}

export interface AuditEventListOptions {
  tenantId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface AuditEventPurgeOptions {
  tenantId?: string;
  before: string;
  dryRun?: boolean;
}

export interface ApiKeyListOptions {
  tenantId?: string;
  limit?: number;
}

export interface ApiKeyRotationReportRepositoryInput extends ApiKeyRotationReportInput {
  tenantId?: string;
}

export interface ApiKeyRotationReportsRepositoryInput extends Omit<ApiKeyRotationReportInput, "tenantId"> {
  tenantIds?: string[];
}

export const DEFAULT_SERVICE_ACCOUNT_POLICY = {
  maxServiceAccounts: 50,
  maxActiveApiKeysPerServiceAccount: 5,
  defaultApiKeyExpiresInDays: 90
} as const;

export interface ServiceAccountPolicyRepositoryInput extends ServiceAccountPolicyInput {
  updatedByUserId?: string;
  updatedByServiceAccountId?: string;
  updatedByApiKeyId?: string;
}

export type ServiceAccountPolicyViolationCode =
  | "max_service_accounts_exceeded"
  | "max_active_api_keys_per_service_account_exceeded";

export class ServiceAccountPolicyViolationError extends Error {
  constructor(
    public readonly code: ServiceAccountPolicyViolationCode,
    public readonly limit: number,
    public readonly tenantId: string,
    public readonly serviceAccountId?: string
  ) {
    super(`Service account policy violation: ${code}`);
    this.name = "ServiceAccountPolicyViolationError";
  }
}

export interface ApiKeyRevokeInput {
  tenantId?: string;
  apiKeyId: string;
}

export interface ApiKeyRotateRepositoryInput extends ApiKeyRotateInput {
  tenantId?: string;
  apiKeyId: string;
}

export interface LoginSessionCreateInput {
  tenantId?: string;
  userId: string;
  apiKeyId: string;
  source: LoginSessionSource;
  deviceLabel?: string | null;
  clientUserAgent?: string | null;
  expiresAt: string;
  absoluteExpiresAt?: string | null;
}

export interface LoginSessionRefreshTokenCreateInput {
  tenantId?: string;
  loginSessionId: string;
  expiresAt: string;
}

export interface LoginSessionRefreshTokenCreated {
  id: string;
  token: string;
  expiresAt: string;
}

export interface LoginCredentialIssueInput {
  tenantId?: string;
  userId: string;
  keyName: string;
  scopes: ApiKeyScope[];
  allowedSurfaces: Surface[];
  expiresAt: string;
  source: LoginSessionSource;
  deviceLabel?: string | null;
  clientUserAgent?: string | null;
  absoluteExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  auditAction: string;
  auditMetadata?: Record<string, unknown>;
}

export interface LoginCredentialIssueResult extends ApiKeyCreated {
  session: LoginSessionRecord;
  refreshToken: LoginSessionRefreshTokenCreated | null;
  auditEvent: AuditEvent;
}

type LoginCredentialIssueStage = "api-key" | "session" | "refresh-token" | "audit";

interface AuthRepositoryTestHooks {
  afterLoginCredentialIssueStage?: (stage: LoginCredentialIssueStage) => void | Promise<void>;
}

class KeyedSerialExecutor {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.tails.set(key, tail);
    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}

export interface LoginSessionRefreshInput {
  tenantId?: string;
  refreshToken: string;
  expiresAt: string;
  refreshTokenExpiresAt: string;
  idleTimeoutSeconds?: number | null;
  apiKeyName?: string;
}

export interface LoginSessionRefreshResult {
  session: LoginSessionRecord;
  apiKey: ApiKeyRecord;
  secret: string;
  rotatedFromApiKey: ApiKeyRecord;
  refreshToken: string;
  refreshTokenId: string;
  refreshTokenExpiresAt: string;
  rotatedFromRefreshTokenId: string;
}

export interface LoginSessionLookupInput {
  tenantId?: string;
  apiKeyId: string;
  idleTimeoutSeconds?: number | null;
}

export interface LoginSessionTouchInput {
  tenantId?: string;
  sessionId: string;
  idleTimeoutSeconds?: number | null;
}

export interface LoginSessionListOptions {
  tenantId?: string;
  userId?: string;
  includeRevoked?: boolean;
  limit?: number;
}

export interface LoginSessionRevokeInput {
  tenantId?: string;
  sessionId: string;
  userId?: string;
}

export interface UserListOptions {
  tenantId?: string;
  limit?: number;
}

export interface ExternalUserCreateInput {
  tenantId?: string;
  email: string;
  displayName: string;
  role: UserRole;
  authProvider: ExternalAuthProvider;
  externalIssuer: string;
  externalSubject: string;
}

export interface ExternalIdentityInput {
  tenantId?: string;
  provider: ExternalAuthProvider;
  issuer: string;
  subject: string;
}

export interface ExternalUserLinkInput extends ExternalIdentityInput {
  userId: string;
}

export interface ExternalGroupSyncInput {
  tenantId?: string;
  provider: ExternalAuthProvider;
  userId: string;
  externalGroupIds: string[];
}

export interface ExternalGroupSyncResult {
  groups: GroupRecord[];
  addedMembershipCount: number;
  removedMembershipCount: number;
}

export interface ServiceAccountListOptions {
  tenantId?: string;
  limit?: number;
}

export interface GroupListOptions {
  tenantId?: string;
  limit?: number;
}

export interface GroupMemberListOptions {
  tenantId?: string;
  groupId: string;
  limit?: number;
}

export interface GroupMemberRemoveInput {
  tenantId?: string;
  groupId: string;
  userId: string;
}

export interface GroupDeleteInput {
  tenantId?: string;
  groupId: string;
}

export interface AuthRepository {
  bootstrapAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminResult | null>;
  countUsers(tenantId?: string): Promise<number>;
  createUser(input: LocalUserCreateInput): Promise<LocalUser>;
  listUsers(options?: UserListOptions): Promise<LocalUser[]>;
  findUserByEmail(tenantId: string, email: string): Promise<LocalUser | null>;
  findUserByExternalIdentity(input: ExternalIdentityInput): Promise<LocalUser | null>;
  createExternalUser(input: ExternalUserCreateInput): Promise<LocalUser>;
  linkExternalUserIdentity(input: ExternalUserLinkInput): Promise<LocalUser | null>;
  updateUser(input: LocalUserUpdateInput): Promise<LocalUser | null>;
  createServiceAccount(input: ServiceAccountCreateInput): Promise<ServiceAccount>;
  listServiceAccounts(options?: ServiceAccountListOptions): Promise<ServiceAccount[]>;
  updateServiceAccount(input: ServiceAccountUpdateInput): Promise<ServiceAccount | null>;
  getServiceAccountPolicy(tenantId?: string): Promise<ServiceAccountPolicy>;
  upsertServiceAccountPolicy(input: ServiceAccountPolicyRepositoryInput): Promise<ServiceAccountPolicy>;
  createGroup(input: GroupCreateInput): Promise<GroupRecord>;
  listGroups(options?: GroupListOptions): Promise<GroupRecord[]>;
  deleteGroup(input: GroupDeleteInput): Promise<GroupRecord | null>;
  addGroupMember(input: GroupMembershipInput): Promise<GroupMembership | null>;
  syncExternalGroupMemberships(input: ExternalGroupSyncInput): Promise<ExternalGroupSyncResult>;
  listGroupMembers(options: GroupMemberListOptions): Promise<GroupMembership[]>;
  removeGroupMember(input: GroupMemberRemoveInput): Promise<GroupMembership | null>;
  createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreated | null>;
  listApiKeys(options?: ApiKeyListOptions): Promise<ApiKeyRecord[]>;
  getApiKeyRotationReport(input?: ApiKeyRotationReportRepositoryInput): Promise<ApiKeyRotationReport>;
  listApiKeyRotationReports(input?: ApiKeyRotationReportsRepositoryInput): Promise<ApiKeyRotationReport[]>;
  revokeApiKey(input: ApiKeyRevokeInput): Promise<ApiKeyRecord | null>;
  rotateApiKey(input: ApiKeyRotateRepositoryInput): Promise<ApiKeyRotateResponse | null>;
  createLoginSession(input: LoginSessionCreateInput): Promise<LoginSessionRecord | null>;
  createLoginSessionRefreshToken(input: LoginSessionRefreshTokenCreateInput): Promise<LoginSessionRefreshTokenCreated | null>;
  issueLoginCredentials(input: LoginCredentialIssueInput): Promise<LoginCredentialIssueResult | null>;
  refreshLoginSession(input: LoginSessionRefreshInput): Promise<LoginSessionRefreshResult | null>;
  findActiveLoginSessionByApiKeyId(input: LoginSessionLookupInput): Promise<LoginSessionRecord | null>;
  touchLoginSession(input: LoginSessionTouchInput): Promise<LoginSessionRecord | null>;
  listLoginSessions(options?: LoginSessionListOptions): Promise<LoginSessionRecord[]>;
  revokeLoginSession(input: LoginSessionRevokeInput): Promise<LoginSessionRevokeResponse | null>;
  authenticateApiKey(secret: string): Promise<AuthPrincipal | null>;
  authenticateLocalUser(tenantId: string, email: string, password: string): Promise<LocalUser | null>;
  createPermissionGrant(input: PermissionGrantCreateInput): Promise<PermissionGrant>;
  createPermissionGrants(inputs: PermissionGrantCreateInput[]): Promise<PermissionGrant[]>;
  listPermissionGrants(input: PermissionGrantListOptions): Promise<PermissionGrantListResponse>;
  revokePermissionGrant(input: PermissionGrantRevokeInput): Promise<PermissionGrant | null>;
  canAccessAsset(input: AccessCheckInput): Promise<boolean>;
  filterAccessibleAssets(input: AssetAccessFilterInput): Promise<AssetRecord[]>;
  recordAuditEvent(input: AuditEventCreateInput): Promise<AuditEvent>;
  listAuditEvents(options?: AuditEventListOptions): Promise<AuditEvent[]>;
  purgeAuditEvents(options: AuditEventPurgeOptions): Promise<number>;
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(
    private readonly pool: Pool,
    private readonly testHooks: AuthRepositoryTestHooks = {}
  ) {}

  async bootstrapAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminResult | null> {
    const client = await this.pool.connect();
    const passwordHash = input.password ? await hashPassword(input.password) : null;
    const secret = generateApiKeySecret();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`forgetbase-bootstrap:${input.tenantId}`]);
      await ensureTenant(client, input.tenantId);

      const existing = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE tenant_id = $1",
        [input.tenantId]
      );

      if (Number.parseInt(existing.rows[0]?.count ?? "0", 10) > 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const userResult = await client.query<UserRow>(
        `
          INSERT INTO users (tenant_id, email, display_name, role, status, password_hash)
          VALUES ($1, $2, $3, 'admin', 'active', $4)
          RETURNING *
        `,
        [input.tenantId, input.email, input.displayName, passwordHash]
      );
      const user = mapUserRow(requireRow(userResult));
      const keyResult = await client.query<ApiKeyRow>(
        `
          INSERT INTO api_keys (
            tenant_id,
            user_id,
            service_account_id,
            name,
            secret_hash,
            secret_preview,
            scopes,
            allowed_surfaces
          )
          VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [
          input.tenantId,
          user.id,
          input.keyName,
          hashApiKeySecret(secret),
          previewSecret(secret),
          ["admin", "asset:read", "asset:write", "permission:write"],
          ["api", "cli", "mcp", "web", "export"]
        ]
      );
      const apiKey = mapApiKeyRow(requireRow(keyResult));

      await client.query(
        `
          INSERT INTO audit_events (
            tenant_id,
            actor_user_id,
            actor_api_key_id,
            action,
            target_type,
            target_id,
            outcome
          )
          VALUES ($1, $2::uuid, $3, 'auth.bootstrap', 'user', $2::text, 'success')
        `,
        [input.tenantId, user.id, apiKey.id]
      );
      await client.query("COMMIT");

      return {
        user,
        apiKey,
        secret
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async countUsers(tenantId = "tenant_demo"): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE tenant_id = $1",
      [tenantId]
    );

    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async createUser(input: LocalUserCreateInput): Promise<LocalUser> {
    const parsed = localUserCreateInputSchema.parse(input);
    await ensureTenant(this.pool, parsed.tenantId);
    const passwordHash = parsed.password ? await hashPassword(parsed.password) : null;
    const result = await this.pool.query<UserRow>(
      `
        INSERT INTO users (tenant_id, email, display_name, role, status, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.email,
        parsed.displayName,
        parsed.role,
        parsed.status,
        passwordHash
      ]
    );

    return mapUserRow(requireRow(result));
  }

  async listUsers(options: UserListOptions = {}): Promise<LocalUser[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<UserRow>(
      `
        SELECT *
        FROM users
        WHERE tenant_id = $1
        ORDER BY created_at DESC, email ASC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapUserRow);
  }

  async findUserByEmail(tenantId: string, email: string): Promise<LocalUser | null> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT *
        FROM users
        WHERE tenant_id = $1
          AND lower(email) = lower($2)
        LIMIT 1
      `,
      [tenantId, email]
    );
    const row = result.rows[0];

    return row ? mapUserRow(row) : null;
  }

  async findUserByExternalIdentity(input: ExternalIdentityInput): Promise<LocalUser | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const result = await this.pool.query<UserRow>(
      `
        SELECT *
        FROM users
        WHERE tenant_id = $1
          AND external_provider = $2
          AND external_issuer = $3
          AND external_subject = $4
        LIMIT 1
      `,
      [tenantId, input.provider, input.issuer, input.subject]
    );
    const row = result.rows[0];

    return row ? mapUserRow(row) : null;
  }

  async createExternalUser(input: ExternalUserCreateInput): Promise<LocalUser> {
    const tenantId = input.tenantId ?? "tenant_demo";
    await ensureTenant(this.pool, tenantId);
    const result = await this.pool.query<UserRow>(
      `
        INSERT INTO users (
          tenant_id,
          email,
          display_name,
          role,
          status,
          auth_provider,
          external_provider,
          external_issuer,
          external_subject
        )
        VALUES ($1, $2, $3, $4, 'active', $5, $5, $6, $7)
        RETURNING *
      `,
      [
        tenantId,
        input.email,
        input.displayName,
        input.role,
        input.authProvider,
        input.externalIssuer,
        input.externalSubject
      ]
    );

    return mapUserRow(requireRow(result));
  }

  async linkExternalUserIdentity(input: ExternalUserLinkInput): Promise<LocalUser | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
	    const result = await this.pool.query<UserRow>(
	      `
	        UPDATE users
	        SET
	          external_provider = $3,
	          external_issuer = $4,
	          external_subject = $5,
          updated_at = now()
        WHERE tenant_id = $1
          AND id = $2
          AND (
            external_subject IS NULL
            OR (
              external_provider = $3
              AND external_issuer = $4
              AND external_subject = $5
            )
          )
        RETURNING *
      `,
      [tenantId, input.userId, input.provider, input.issuer, input.subject]
    );
    const row = result.rows[0];

    return row ? mapUserRow(row) : null;
  }

  async updateUser(input: LocalUserUpdateInput): Promise<LocalUser | null> {
    const parsed = localUserUpdateInputSchema.parse(input);
    const passwordHash = parsed.password ? await hashPassword(parsed.password) : null;
    const result = await this.pool.query<UserRow>(
      `
        UPDATE users
        SET
          display_name = COALESCE($3, display_name),
          role = COALESCE($4, role),
          status = COALESCE($5, status),
          password_hash = COALESCE($6, password_hash),
          updated_at = now()
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.userId,
        parsed.displayName ?? null,
        parsed.role ?? null,
        parsed.status ?? null,
        passwordHash
      ]
    );
    const row = result.rows[0];

    return row ? mapUserRow(row) : null;
  }

  async createServiceAccount(input: ServiceAccountCreateInput): Promise<ServiceAccount> {
    const parsed = serviceAccountCreateInputSchema.parse(input);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await ensureTenant(client, parsed.tenantId);
      await client.query("SELECT id FROM tenants WHERE id = $1 FOR UPDATE", [parsed.tenantId]);
      const policy = await readServiceAccountPolicy(client, parsed.tenantId);

      if (policy.maxServiceAccounts !== null) {
        const countResult = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM service_accounts WHERE tenant_id = $1",
          [parsed.tenantId]
        );
        const count = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);

        if (count >= policy.maxServiceAccounts) {
          throw new ServiceAccountPolicyViolationError(
            "max_service_accounts_exceeded",
            policy.maxServiceAccounts,
            parsed.tenantId
          );
        }
      }

      const result = await client.query<ServiceAccountRow>(
        `
          INSERT INTO service_accounts (tenant_id, slug, name, description, role, status)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          parsed.tenantId,
          parsed.slug,
          parsed.name,
          parsed.description ?? null,
          parsed.role,
          parsed.status
        ]
      );
      const serviceAccount = mapServiceAccountRow(requireRow(result));
      await client.query("COMMIT");

      return serviceAccount;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listServiceAccounts(options: ServiceAccountListOptions = {}): Promise<ServiceAccount[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<ServiceAccountRow>(
      `
        SELECT *
        FROM service_accounts
        WHERE tenant_id = $1
        ORDER BY created_at DESC, slug ASC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapServiceAccountRow);
  }

  async updateServiceAccount(input: ServiceAccountUpdateInput): Promise<ServiceAccount | null> {
    const parsed = serviceAccountUpdateInputSchema.parse(input);
    const result = await this.pool.query<ServiceAccountRow>(
      `
        UPDATE service_accounts
        SET
          name = COALESCE($3, name),
          description = CASE WHEN $4::boolean THEN $5 ELSE description END,
          role = COALESCE($6, role),
          status = COALESCE($7, status),
          updated_at = now()
        WHERE tenant_id = $1
          AND id = $2
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.serviceAccountId,
        parsed.name ?? null,
        parsed.description !== undefined,
        parsed.description ?? null,
        parsed.role ?? null,
        parsed.status ?? null
      ]
    );
    const row = result.rows[0];

    return row ? mapServiceAccountRow(row) : null;
  }

  async getServiceAccountPolicy(tenantId = "tenant_demo"): Promise<ServiceAccountPolicy> {
    return readServiceAccountPolicy(this.pool, tenantId);
  }

  async upsertServiceAccountPolicy(input: ServiceAccountPolicyRepositoryInput): Promise<ServiceAccountPolicy> {
    const parsed = serviceAccountPolicyInputSchema.parse(input);
    const current = await this.getServiceAccountPolicy(parsed.tenantId);
    const next = {
      maxServiceAccounts: parsed.maxServiceAccounts === undefined
        ? current.maxServiceAccounts
        : parsed.maxServiceAccounts,
      maxActiveApiKeysPerServiceAccount: parsed.maxActiveApiKeysPerServiceAccount === undefined
        ? current.maxActiveApiKeysPerServiceAccount
        : parsed.maxActiveApiKeysPerServiceAccount,
      defaultApiKeyExpiresInDays: parsed.defaultApiKeyExpiresInDays === undefined
        ? current.defaultApiKeyExpiresInDays
        : parsed.defaultApiKeyExpiresInDays
    };

    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<ServiceAccountPolicyRow>(
      `
        INSERT INTO service_account_policies (
          tenant_id,
          max_service_accounts,
          max_active_api_keys_per_service_account,
          default_api_key_expires_in_days,
          updated_by_user_id,
          updated_by_service_account_id,
          updated_by_api_key_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id) DO UPDATE
        SET
          max_service_accounts = EXCLUDED.max_service_accounts,
          max_active_api_keys_per_service_account = EXCLUDED.max_active_api_keys_per_service_account,
          default_api_key_expires_in_days = EXCLUDED.default_api_key_expires_in_days,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_by_service_account_id = EXCLUDED.updated_by_service_account_id,
          updated_by_api_key_id = EXCLUDED.updated_by_api_key_id,
          updated_at = now()
        RETURNING *
      `,
      [
        parsed.tenantId,
        next.maxServiceAccounts,
        next.maxActiveApiKeysPerServiceAccount,
        next.defaultApiKeyExpiresInDays,
        input.updatedByUserId ?? null,
        input.updatedByServiceAccountId ?? null,
        input.updatedByApiKeyId ?? null
      ]
    );

    return mapServiceAccountPolicyRow(requireRow(result));
  }

  async createGroup(input: GroupCreateInput): Promise<GroupRecord> {
    const parsed = groupCreateInputSchema.parse(input);
    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<GroupRow>(
      `
        INSERT INTO groups (tenant_id, slug, name, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.slug,
        parsed.name,
        parsed.description ?? null
      ]
    );

    return mapGroupRow(requireRow(result));
  }

  async listGroups(options: GroupListOptions = {}): Promise<GroupRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<GroupRow>(
      `
        SELECT *
        FROM groups
        WHERE tenant_id = $1
        ORDER BY name ASC, slug ASC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapGroupRow);
  }

  async deleteGroup(input: GroupDeleteInput): Promise<GroupRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query<GroupRow>(
        `
          SELECT *
          FROM groups
          WHERE tenant_id = $1
            AND id = $2
          FOR UPDATE
        `,
        [tenantId, input.groupId]
      );
      const row = existing.rows[0];

      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `
          DELETE FROM permission_grants
          WHERE tenant_id = $1
            AND principal_type = 'group'
            AND principal_id = $2
        `,
        [tenantId, input.groupId]
      );
      await client.query(
        `
          DELETE FROM groups
          WHERE tenant_id = $1
            AND id = $2
        `,
        [tenantId, input.groupId]
      );
      await client.query("COMMIT");

      return mapGroupRow(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addGroupMember(input: GroupMembershipInput): Promise<GroupMembership | null> {
    const parsed = groupMembershipInputSchema.parse(input);

    await this.pool.query(
      `
	        INSERT INTO group_memberships (group_id, user_id, source, external_provider)
	        SELECT groups.id, users.id, 'local', NULL
	        FROM groups
        JOIN users ON users.tenant_id = groups.tenant_id
        WHERE groups.tenant_id = $1
          AND groups.id = $2
          AND users.id = $3
        ON CONFLICT (group_id, user_id)
        DO UPDATE SET source = 'local', external_provider = NULL
      `,
      [parsed.tenantId, parsed.groupId, parsed.userId]
    );

    const member = await this.pool.query<GroupMembershipRow>(
      `
        SELECT
          group_memberships.group_id::text,
          group_memberships.user_id::text,
          group_memberships.source,
          group_memberships.external_provider,
          group_memberships.created_at,
          users.email AS user_email,
          users.display_name AS user_display_name,
          users.role AS user_role
        FROM group_memberships
        JOIN groups ON groups.id = group_memberships.group_id
        JOIN users ON users.id = group_memberships.user_id
        WHERE groups.tenant_id = $1
          AND group_memberships.group_id = $2
          AND group_memberships.user_id = $3
        LIMIT 1
      `,
      [parsed.tenantId, parsed.groupId, parsed.userId]
    );
    const row = member.rows[0];

    return row ? mapGroupMembershipRow(row) : null;
  }

  async syncExternalGroupMemberships(input: ExternalGroupSyncInput): Promise<ExternalGroupSyncResult> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const externalGroupIds = normalizeExternalGroupIds(input.externalGroupIds);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const user = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE tenant_id = $1 AND id = $2 LIMIT 1",
        [tenantId, input.userId]
      );

      if (!user.rows[0]) {
        await client.query("ROLLBACK");
        return {
          groups: [],
          addedMembershipCount: 0,
          removedMembershipCount: 0
        };
      }

      const syncedGroups: GroupRecord[] = [];
      const syncedGroupIds: string[] = [];
      let addedMembershipCount = 0;

      for (const externalGroupId of externalGroupIds) {
        const group = await client.query<GroupRow>(
          `
            INSERT INTO groups (
              tenant_id,
              slug,
              name,
              description,
              external_provider,
              external_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (tenant_id, external_provider, external_id)
              WHERE external_provider IS NOT NULL AND external_id IS NOT NULL
            DO UPDATE SET
              name = EXCLUDED.name,
              updated_at = now()
            RETURNING *
          `,
          [
            tenantId,
            externalGroupSlug(input.provider, externalGroupId),
            externalGroupName(externalGroupId),
            `Synced from ${input.provider} group ${externalGroupId}`,
            input.provider,
            externalGroupId
          ]
        );
        const groupRecord = mapGroupRow(requireRow(group));
        syncedGroups.push(groupRecord);
        syncedGroupIds.push(groupRecord.id);

        const insertedMembership = await client.query<{ group_id: string }>(
          `
            INSERT INTO group_memberships (group_id, user_id, source, external_provider)
            VALUES ($1, $2, 'external', $3)
            ON CONFLICT (group_id, user_id) DO NOTHING
            RETURNING group_id::text
          `,
          [groupRecord.id, input.userId, input.provider]
        );

        addedMembershipCount += insertedMembership.rowCount ?? 0;
      }

      const removedMemberships = await client.query<{ group_id: string }>(
        `
          DELETE FROM group_memberships
          USING groups
          WHERE group_memberships.group_id = groups.id
            AND groups.tenant_id = $1
            AND group_memberships.user_id = $2
            AND group_memberships.source = 'external'
            AND group_memberships.external_provider = $3
            AND NOT (group_memberships.group_id = ANY($4::uuid[]))
          RETURNING group_memberships.group_id::text
        `,
        [tenantId, input.userId, input.provider, syncedGroupIds]
      );

      await client.query("COMMIT");

      return {
        groups: syncedGroups,
        addedMembershipCount,
        removedMembershipCount: removedMemberships.rowCount ?? 0
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listGroupMembers(options: GroupMemberListOptions): Promise<GroupMembership[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<GroupMembershipRow>(
      `
        SELECT
          group_memberships.group_id::text,
          group_memberships.user_id::text,
          group_memberships.source,
          group_memberships.external_provider,
          group_memberships.created_at,
          users.email AS user_email,
          users.display_name AS user_display_name,
          users.role AS user_role
        FROM group_memberships
        JOIN groups ON groups.id = group_memberships.group_id
        JOIN users ON users.id = group_memberships.user_id
        WHERE groups.tenant_id = $1
          AND group_memberships.group_id = $2
        ORDER BY users.email ASC
        LIMIT $3
      `,
      [tenantId, options.groupId, limit]
    );

    return result.rows.map(mapGroupMembershipRow);
  }

  async removeGroupMember(input: GroupMemberRemoveInput): Promise<GroupMembership | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const result = await this.pool.query<GroupMembershipRow>(
      `
        WITH removed AS (
          DELETE FROM group_memberships
          USING groups, users
          WHERE group_memberships.group_id = groups.id
            AND group_memberships.user_id = users.id
            AND groups.tenant_id = $1
            AND group_memberships.group_id = $2
            AND group_memberships.user_id = $3
          RETURNING
            group_memberships.group_id::text,
            group_memberships.user_id::text,
            group_memberships.source,
            group_memberships.external_provider,
            group_memberships.created_at,
            users.email AS user_email,
            users.display_name AS user_display_name,
            users.role AS user_role
        )
        SELECT * FROM removed
      `,
      [tenantId, input.groupId, input.userId]
    );
    const row = result.rows[0];

    return row ? mapGroupMembershipRow(row) : null;
  }

  async createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreated | null> {
    const parsed = apiKeyCreateInputSchema.parse(input);
    const secret = generateApiKeySecret();

    if (parsed.serviceAccountId) {
      const client = await this.pool.connect();

      try {
        await client.query("BEGIN");
        const owner = await client.query<{ id: string }>(
          `
            SELECT id
            FROM service_accounts
            WHERE tenant_id = $1 AND id = $2
            FOR UPDATE
          `,
          [parsed.tenantId, parsed.serviceAccountId]
        );

        if (!owner.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }

        const policy = await readServiceAccountPolicy(client, parsed.tenantId);
        const expiresAt = policy.defaultApiKeyExpiresInDays !== null && parsed.expiresAt === undefined
          ? apiKeyExpiryFromDays(policy.defaultApiKeyExpiresInDays)
          : parsed.expiresAt ?? null;

        if (policy.maxActiveApiKeysPerServiceAccount !== null) {
          const activeKeys = await client.query<{ count: string }>(
            `
              SELECT count(*)::text AS count
              FROM api_keys
              WHERE tenant_id = $1
                AND service_account_id = $2
                AND revoked_at IS NULL
                AND (expires_at IS NULL OR expires_at > now())
            `,
            [parsed.tenantId, parsed.serviceAccountId]
          );
          const activeKeyCount = Number.parseInt(activeKeys.rows[0]?.count ?? "0", 10);

          if (activeKeyCount >= policy.maxActiveApiKeysPerServiceAccount) {
            throw new ServiceAccountPolicyViolationError(
              "max_active_api_keys_per_service_account_exceeded",
              policy.maxActiveApiKeysPerServiceAccount,
              parsed.tenantId,
              parsed.serviceAccountId
            );
          }
        }

        const result = await client.query<ApiKeyRow>(
          `
            INSERT INTO api_keys (
              tenant_id,
              user_id,
              service_account_id,
              name,
              secret_hash,
              secret_preview,
              scopes,
              allowed_surfaces,
              expires_at
            )
            VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::timestamptz)
            RETURNING *
          `,
          [
            parsed.tenantId,
            parsed.serviceAccountId,
            parsed.name,
            hashApiKeySecret(secret),
            previewSecret(secret),
            parsed.scopes,
            parsed.allowedSurfaces,
            expiresAt
          ]
        );
        const apiKey = apiKeyCreatedSchema.parse({
          apiKey: mapApiKeyRow(requireRow(result)),
          secret
        });
        await client.query("COMMIT");

        return apiKey;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    const result = await this.pool.query<ApiKeyRow>(
        `
          INSERT INTO api_keys (
            tenant_id,
            user_id,
            service_account_id,
            name,
            secret_hash,
            secret_preview,
            scopes,
            allowed_surfaces,
            expires_at
          )
          SELECT $1, users.id, NULL, $2, $3, $4, $5, $6, $7::timestamptz
          FROM users
          WHERE users.tenant_id = $1
            AND users.id = $8
          RETURNING *
        `,
        [
          parsed.tenantId,
          parsed.name,
          hashApiKeySecret(secret),
          previewSecret(secret),
          parsed.scopes,
          parsed.allowedSurfaces,
          parsed.expiresAt ?? null,
          parsed.userId
        ]
      );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return apiKeyCreatedSchema.parse({
      apiKey: mapApiKeyRow(row),
      secret
    });
  }

  async listApiKeys(options: ApiKeyListOptions = {}): Promise<ApiKeyRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<ApiKeyRow>(
      `
        SELECT *
        FROM api_keys
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [tenantId, limit]
    );

    return result.rows.map(mapApiKeyRow);
  }

  async getApiKeyRotationReport(input: ApiKeyRotationReportRepositoryInput = {}): Promise<ApiKeyRotationReport> {
    const parsed = normalizeApiKeyRotationReportInput(input);
    const result = await this.pool.query<ApiKeyRow>(
      `
        SELECT *
        FROM api_keys
        WHERE tenant_id = $1
          AND ($4::boolean = true OR service_account_id IS NOT NULL)
          AND ($5::boolean = true OR revoked_at IS NULL)
          AND (
            expires_at IS NULL
            OR expires_at <= $2::timestamptz
          )
        ORDER BY
          revoked_at ASC NULLS FIRST,
          expires_at ASC NULLS FIRST,
          created_at DESC
        LIMIT $3
      `,
      [parsed.tenantId, parsed.dueBefore, parsed.limit, parsed.includeUserKeys, parsed.includeRevoked]
    );
    const reminders = result.rows
      .map(mapApiKeyRow)
      .map((apiKey) => buildApiKeyRotationReminder(apiKey, parsed.asOf))
      .filter((reminder): reminder is ApiKeyRotationReminder => reminder !== null);

    return apiKeyRotationReportSchema.parse({
      tenantId: parsed.tenantId,
      asOf: parsed.asOf,
      dueBefore: parsed.dueBefore,
      dueWithinDays: parsed.dueWithinDays,
      includeUserKeys: parsed.includeUserKeys,
      includeRevoked: parsed.includeRevoked,
      reminders
    });
  }

  async listApiKeyRotationReports(input: ApiKeyRotationReportsRepositoryInput = {}): Promise<ApiKeyRotationReport[]> {
    const parsed = normalizeApiKeyRotationReportOptions(input);
    const result = await this.pool.query<{ tenant_id: string }>(
      `
        SELECT DISTINCT tenant_id
        FROM api_keys
        WHERE ($2::boolean = true OR service_account_id IS NOT NULL)
          AND ($3::boolean = true OR revoked_at IS NULL)
          AND (
            expires_at IS NULL
            OR expires_at <= $1::timestamptz
          )
          AND ($4::text[] IS NULL OR tenant_id = ANY($4::text[]))
        ORDER BY tenant_id ASC
      `,
      [
        parsed.dueBefore,
        parsed.includeUserKeys,
        parsed.includeRevoked,
        parsed.tenantIds && parsed.tenantIds.length ? parsed.tenantIds : null
      ]
    );
    const reports = await Promise.all(result.rows.map((row) =>
      this.getApiKeyRotationReport({
        tenantId: row.tenant_id,
        asOf: parsed.asOf,
        dueWithinDays: parsed.dueWithinDays,
        includeUserKeys: parsed.includeUserKeys,
        includeRevoked: parsed.includeRevoked,
        limit: parsed.limit
      })
    ));

    return reports.filter((report) => report.reminders.length > 0);
  }

  async revokeApiKey(input: ApiKeyRevokeInput): Promise<ApiKeyRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<ApiKeyRow>(
        `
          UPDATE api_keys
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND id = $2
          RETURNING *
        `,
        [tenantId, input.apiKeyId]
      );
      const row = result.rows[0];

      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      const revokedSessions = await client.query<{ id: string }>(
        `
          UPDATE login_sessions
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND api_key_id = $2
          RETURNING id
        `,
        [tenantId, input.apiKeyId]
      );
      const revokedSessionIds = revokedSessions.rows.map((session) => session.id);

      if (revokedSessionIds.length > 0) {
        await client.query(
          `
            UPDATE login_session_refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now())
            WHERE tenant_id = $1
              AND login_session_id = ANY($2::uuid[])
              AND revoked_at IS NULL
          `,
          [tenantId, revokedSessionIds]
        );
      }
      await client.query("COMMIT");

      return mapApiKeyRow(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async rotateApiKey(input: ApiKeyRotateRepositoryInput): Promise<ApiKeyRotateResponse | null> {
    const parsed = apiKeyRotateInputSchema.parse(input);
    const tenantId = input.tenantId ?? "tenant_demo";
    const secret = generateApiKeySecret();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query<ApiKeyRow>(
        `
          SELECT *
          FROM api_keys
          WHERE tenant_id = $1
            AND id = $2
            AND revoked_at IS NULL
          FOR UPDATE
        `,
        [tenantId, input.apiKeyId]
      );
      const existingRow = existing.rows[0];

      if (!existingRow) {
        await client.query("ROLLBACK");
        return null;
      }

      if (existingRow.service_account_id) {
        await client.query(
          "SELECT id FROM service_accounts WHERE tenant_id = $1 AND id = $2 FOR UPDATE",
          [tenantId, existingRow.service_account_id]
        );
        const policy = await readServiceAccountPolicy(client, tenantId);

        if (!parsed.revokeOld && policy.maxActiveApiKeysPerServiceAccount !== null) {
          const activeKeys = await client.query<{ count: string }>(
            `
              SELECT count(*)::text AS count
              FROM api_keys
              WHERE tenant_id = $1
                AND service_account_id = $2
                AND revoked_at IS NULL
                AND (expires_at IS NULL OR expires_at > now())
            `,
            [tenantId, existingRow.service_account_id]
          );
          const activeKeyCount = Number.parseInt(activeKeys.rows[0]?.count ?? "0", 10);

          if (activeKeyCount >= policy.maxActiveApiKeysPerServiceAccount) {
            throw new ServiceAccountPolicyViolationError(
              "max_active_api_keys_per_service_account_exceeded",
              policy.maxActiveApiKeysPerServiceAccount,
              tenantId,
              existingRow.service_account_id
            );
          }
        }
      }

      const replacement = await client.query<ApiKeyRow>(
        `
          INSERT INTO api_keys (
            tenant_id,
            user_id,
            service_account_id,
            name,
            secret_hash,
            secret_preview,
            scopes,
            allowed_surfaces,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
          RETURNING *
        `,
        [
          tenantId,
          existingRow.user_id,
          existingRow.service_account_id,
          parsed.name ?? `${existingRow.name} rotation`,
          hashApiKeySecret(secret),
          previewSecret(secret),
          existingRow.scopes,
          existingRow.allowed_surfaces,
          existingRow.expires_at
        ]
      );

      let revokedApiKey: ApiKeyRecord | null = null;

      if (parsed.revokeOld) {
        const revoked = await client.query<ApiKeyRow>(
          `
            UPDATE api_keys
            SET revoked_at = COALESCE(revoked_at, now())
            WHERE tenant_id = $1
              AND id = $2
            RETURNING *
          `,
          [tenantId, input.apiKeyId]
        );
        revokedApiKey = mapApiKeyRow(requireRow(revoked));
      }

      await client.query("COMMIT");

      return apiKeyRotateResponseSchema.parse({
        apiKey: mapApiKeyRow(requireRow(replacement)),
        secret,
        rotatedFrom: mapApiKeyRow(existingRow),
        revokedApiKey
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async issueLoginCredentials(input: LoginCredentialIssueInput): Promise<LoginCredentialIssueResult | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const apiKeyInput = apiKeyCreateInputSchema.parse({
      tenantId,
      userId: input.userId,
      name: input.keyName,
      scopes: input.scopes,
      allowedSurfaces: input.allowedSurfaces,
      expiresAt: input.expiresAt
    });
    const sessionInput = normalizeLoginSessionCreateInput({
      tenantId,
      userId: input.userId,
      apiKeyId: "pending-login-api-key",
      source: input.source,
      deviceLabel: input.deviceLabel,
      clientUserAgent: input.clientUserAgent,
      expiresAt: input.expiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt
    });
    const refreshInput = input.refreshTokenExpiresAt
      ? normalizeLoginSessionRefreshTokenCreateInput({
        tenantId,
        loginSessionId: "pending-login-session",
        expiresAt: input.refreshTokenExpiresAt
      })
      : null;
    const client = await this.pool.connect();
    const secret = generateApiKeySecret();
    const refreshTokenSecret = refreshInput ? generateRefreshTokenSecret() : null;

    try {
      await client.query("BEGIN");
      const apiKeyResult = await client.query<ApiKeyRow>(
        `
          INSERT INTO api_keys (
            tenant_id,
            user_id,
            service_account_id,
            name,
            secret_hash,
            secret_preview,
            scopes,
            allowed_surfaces,
            expires_at
          )
          SELECT $1, users.id, NULL, $2, $3, $4, $5, $6, $7::timestamptz
          FROM users
          WHERE users.tenant_id = $1
            AND users.id = $8
            AND users.status = 'active'
          RETURNING *
        `,
        [
          apiKeyInput.tenantId,
          apiKeyInput.name,
          hashApiKeySecret(secret),
          previewSecret(secret),
          apiKeyInput.scopes,
          apiKeyInput.allowedSurfaces,
          apiKeyInput.expiresAt,
          apiKeyInput.userId
        ]
      );
      const apiKeyRow = apiKeyResult.rows[0];

      if (!apiKeyRow) {
        await client.query("ROLLBACK");
        return null;
      }

      await this.testHooks.afterLoginCredentialIssueStage?.("api-key");
      const sessionResult = await client.query<LoginSessionRow>(
        `
          INSERT INTO login_sessions (
            tenant_id,
            user_id,
            api_key_id,
            source,
            device_label,
            client_user_agent,
            expires_at,
            absolute_expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)
          RETURNING *
        `,
        [
          tenantId,
          sessionInput.userId,
          apiKeyRow.id,
          sessionInput.source,
          sessionInput.deviceLabel,
          sessionInput.clientUserAgent,
          sessionInput.expiresAt,
          sessionInput.absoluteExpiresAt
        ]
      );
      const sessionRow = requireRow(sessionResult);
      await this.testHooks.afterLoginCredentialIssueStage?.("session");

      let refreshToken: LoginSessionRefreshTokenCreated | null = null;

      if (refreshTokenSecret && refreshInput) {
        const refreshResult = await client.query<LoginSessionRefreshTokenRow>(
          `
            INSERT INTO login_session_refresh_tokens (tenant_id, login_session_id, token_hash, expires_at)
            VALUES (
              $1,
              $2,
              $3,
              LEAST($4::timestamptz, COALESCE($5::timestamptz, $4::timestamptz))
            )
            RETURNING *
          `,
          [
            tenantId,
            sessionRow.id,
            hashRefreshTokenSecret(refreshTokenSecret),
            refreshInput.expiresAt,
            sessionInput.absoluteExpiresAt
          ]
        );
        const refreshRow = requireRow(refreshResult);
        refreshToken = {
          id: refreshRow.id,
          token: refreshTokenSecret,
          expiresAt: toIso(refreshRow.expires_at)
        };
        await this.testHooks.afterLoginCredentialIssueStage?.("refresh-token");
      }

      const auditInput = auditEventCreateInputSchema.parse({
        tenantId,
        actorUserId: input.userId,
        actorApiKeyId: apiKeyRow.id,
        action: input.auditAction,
        targetType: "user",
        targetId: input.userId,
        outcome: "success",
        metadata: {
          ...input.auditMetadata,
          apiKeyId: apiKeyRow.id,
          sessionId: sessionRow.id
        }
      });
      const auditResult = await client.query<AuditEventRow>(
        `
          INSERT INTO audit_events (
            tenant_id,
            actor_user_id,
            actor_service_account_id,
            actor_api_key_id,
            action,
            target_type,
            target_id,
            outcome,
            reason,
            metadata
          )
          VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, NULL, $8::jsonb)
          RETURNING *
        `,
        [
          auditInput.tenantId,
          auditInput.actorUserId,
          auditInput.actorApiKeyId,
          auditInput.action,
          auditInput.targetType,
          auditInput.targetId,
          auditInput.outcome,
          JSON.stringify(auditInput.metadata)
        ]
      );
      const auditRow = requireRow(auditResult);
      await this.testHooks.afterLoginCredentialIssueStage?.("audit");
      await client.query("COMMIT");

      return {
        apiKey: mapApiKeyRow(apiKeyRow),
        secret,
        session: mapLoginSessionRow(sessionRow),
        refreshToken,
        auditEvent: mapAuditEventRow(auditRow)
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createLoginSession(input: LoginSessionCreateInput): Promise<LoginSessionRecord | null> {
    const parsed = normalizeLoginSessionCreateInput(input);
    const result = await this.pool.query<LoginSessionRow>(
      `
        INSERT INTO login_sessions (
          tenant_id,
          user_id,
          api_key_id,
          source,
          device_label,
          client_user_agent,
          expires_at,
          absolute_expires_at
        )
        SELECT $1, users.id, api_keys.id, $4, $5, $6, $7::timestamptz, $8::timestamptz
        FROM users
        JOIN api_keys ON api_keys.tenant_id = users.tenant_id
          AND api_keys.user_id = users.id
        WHERE users.tenant_id = $1
          AND users.id = $2
          AND api_keys.id = $3
          AND api_keys.revoked_at IS NULL
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.userId,
        parsed.apiKeyId,
        parsed.source,
        parsed.deviceLabel,
        parsed.clientUserAgent,
        parsed.expiresAt,
        parsed.absoluteExpiresAt
      ]
    );
    const row = result.rows[0];

    return row ? mapLoginSessionRow(row) : null;
  }

  async createLoginSessionRefreshToken(
    input: LoginSessionRefreshTokenCreateInput
  ): Promise<LoginSessionRefreshTokenCreated | null> {
    const parsed = normalizeLoginSessionRefreshTokenCreateInput(input);
    const token = generateRefreshTokenSecret();
    const result = await this.pool.query<LoginSessionRefreshTokenRow>(
      `
        INSERT INTO login_session_refresh_tokens (tenant_id, login_session_id, token_hash, expires_at)
        SELECT
          $1,
          login_sessions.id,
          $3,
          LEAST($4::timestamptz, COALESCE(login_sessions.absolute_expires_at, $4::timestamptz))
        FROM login_sessions
        WHERE login_sessions.tenant_id = $1
          AND login_sessions.id = $2
          AND login_sessions.revoked_at IS NULL
          AND (login_sessions.absolute_expires_at IS NULL OR login_sessions.absolute_expires_at > now())
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.loginSessionId,
        hashRefreshTokenSecret(token),
        parsed.expiresAt
      ]
    );
    const row = result.rows[0];

    return row ? {
      id: row.id,
      token,
      expiresAt: toIso(row.expires_at)
    } : null;
  }

  async refreshLoginSession(input: LoginSessionRefreshInput): Promise<LoginSessionRefreshResult | null> {
    const tokenHash = hashRefreshTokenSecret(input.refreshToken);
    const accessSecret = generateApiKeySecret();
    const nextRefreshToken = generateRefreshTokenSecret();
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const refreshable = await client.query<LoginSessionRefreshJoinRow>(
        `
          SELECT
            tokens.id AS refresh_token_id,
            sessions.id AS session_id,
            sessions.tenant_id,
            sessions.user_id,
            sessions.api_key_id AS old_api_key_id,
            sessions.source,
            sessions.absolute_expires_at AS session_absolute_expires_at,
            keys.name AS old_api_key_name,
            keys.scopes AS old_api_key_scopes,
            keys.allowed_surfaces AS old_api_key_allowed_surfaces,
            sessions.created_at AS session_created_at,
            sessions.expires_at AS session_expires_at,
            sessions.last_seen_at AS session_last_seen_at,
            sessions.revoked_at AS session_revoked_at
          FROM login_session_refresh_tokens tokens
          JOIN login_sessions sessions ON sessions.id = tokens.login_session_id
          JOIN api_keys keys ON keys.id = sessions.api_key_id
          JOIN users ON users.id = sessions.user_id
          WHERE tokens.token_hash = $1
            AND ($2::text IS NULL OR tokens.tenant_id = $2)
            AND tokens.used_at IS NULL
            AND tokens.revoked_at IS NULL
            AND tokens.expires_at > now()
            AND sessions.revoked_at IS NULL
            AND (sessions.absolute_expires_at IS NULL OR sessions.absolute_expires_at > now())
            AND keys.revoked_at IS NULL
            AND users.status = 'active'
            AND (
              $3::integer IS NULL
              OR COALESCE(sessions.last_seen_at, sessions.created_at) > now() - ($3::integer * interval '1 second')
            )
          FOR UPDATE OF tokens, sessions, keys
        `,
        [tokenHash, input.tenantId ?? null, input.idleTimeoutSeconds ?? null]
      );
      const refreshableRow = refreshable.rows[0];

      if (!refreshableRow) {
        await client.query("ROLLBACK");
        return null;
      }

      const replacement = await client.query<ApiKeyRow>(
        `
          INSERT INTO api_keys (
            tenant_id,
            user_id,
            service_account_id,
            name,
            secret_hash,
            secret_preview,
            scopes,
            allowed_surfaces,
            expires_at
          )
          VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8::timestamptz)
          RETURNING *
        `,
        [
          refreshableRow.tenant_id,
          refreshableRow.user_id,
          input.apiKeyName ?? `${refreshableRow.old_api_key_name} refresh`,
          hashApiKeySecret(accessSecret),
          previewSecret(accessSecret),
          refreshableRow.old_api_key_scopes,
          refreshableRow.old_api_key_allowed_surfaces,
          refreshableRow.session_absolute_expires_at
            ? minIso(input.expiresAt, toIso(refreshableRow.session_absolute_expires_at))
            : input.expiresAt
        ]
      );
      const replacementRow = requireRow(replacement);

      const nextTokenInsert = await client.query<LoginSessionRefreshTokenRow>(
        `
          INSERT INTO login_session_refresh_tokens (tenant_id, login_session_id, token_hash, expires_at)
          VALUES ($1, $2, $3, $4::timestamptz)
          RETURNING *
        `,
        [
          refreshableRow.tenant_id,
          refreshableRow.session_id,
          hashRefreshTokenSecret(nextRefreshToken),
          refreshableRow.session_absolute_expires_at
            ? minIso(input.refreshTokenExpiresAt, toIso(refreshableRow.session_absolute_expires_at))
            : input.refreshTokenExpiresAt
        ]
      );
      const nextTokenRow = requireRow(nextTokenInsert);

      await client.query(
        `
          UPDATE login_session_refresh_tokens
          SET used_at = COALESCE(used_at, now()),
            rotated_to_id = $2
          WHERE id = $1
        `,
        [refreshableRow.refresh_token_id, nextTokenRow.id]
      );

      const sessionUpdate = await client.query<LoginSessionRow>(
        `
          UPDATE login_sessions
          SET api_key_id = $2,
            expires_at = LEAST($3::timestamptz, COALESCE(absolute_expires_at, $3::timestamptz)),
            last_seen_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [refreshableRow.session_id, replacementRow.id, input.expiresAt]
      );
      const sessionRow = requireRow(sessionUpdate);

      const oldApiKeyUpdate = await client.query<ApiKeyRow>(
        `
          UPDATE api_keys
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE id = $1
          RETURNING *
        `,
        [refreshableRow.old_api_key_id]
      );
      const oldApiKeyRow = requireRow(oldApiKeyUpdate);

      await client.query("COMMIT");

      return {
        session: mapLoginSessionRow(sessionRow),
        apiKey: mapApiKeyRow(replacementRow),
        secret: accessSecret,
        rotatedFromApiKey: mapApiKeyRow(oldApiKeyRow),
        refreshToken: nextRefreshToken,
        refreshTokenId: nextTokenRow.id,
        refreshTokenExpiresAt: toIso(nextTokenRow.expires_at),
        rotatedFromRefreshTokenId: refreshableRow.refresh_token_id
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findActiveLoginSessionByApiKeyId(input: LoginSessionLookupInput): Promise<LoginSessionRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const result = await this.pool.query<LoginSessionRow>(
      `
        SELECT *
        FROM login_sessions
        WHERE tenant_id = $1
          AND api_key_id = $2
          AND revoked_at IS NULL
          AND expires_at > now()
          AND (absolute_expires_at IS NULL OR absolute_expires_at > now())
          AND (
            $3::integer IS NULL
            OR COALESCE(last_seen_at, created_at) > now() - ($3::integer * interval '1 second')
          )
      `,
      [tenantId, input.apiKeyId, input.idleTimeoutSeconds ?? null]
    );
    const row = result.rows[0];

    return row ? mapLoginSessionRow(row) : null;
  }

  async touchLoginSession(input: LoginSessionTouchInput): Promise<LoginSessionRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const result = await this.pool.query<LoginSessionRow>(
      `
        UPDATE login_sessions
        SET last_seen_at = now()
        WHERE tenant_id = $1
          AND id = $2
          AND revoked_at IS NULL
          AND expires_at > now()
          AND (absolute_expires_at IS NULL OR absolute_expires_at > now())
          AND (
            $3::integer IS NULL
            OR COALESCE(last_seen_at, created_at) > now() - ($3::integer * interval '1 second')
          )
        RETURNING *
      `,
      [tenantId, input.sessionId, input.idleTimeoutSeconds ?? null]
    );
    const row = result.rows[0];

    return row ? mapLoginSessionRow(row) : null;
  }

  async listLoginSessions(options: LoginSessionListOptions = {}): Promise<LoginSessionRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<LoginSessionRow>(
      `
        SELECT *
        FROM login_sessions
        WHERE tenant_id = $1
          AND ($2::uuid IS NULL OR user_id = $2)
          AND ($3::boolean = true OR revoked_at IS NULL)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [tenantId, options.userId ?? null, options.includeRevoked ?? false, limit]
    );

    return result.rows.map(mapLoginSessionRow);
  }

  async revokeLoginSession(input: LoginSessionRevokeInput): Promise<LoginSessionRevokeResponse | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const sessionResult = await client.query<LoginSessionRow>(
        `
          UPDATE login_sessions
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND id = $2
            AND ($3::uuid IS NULL OR user_id = $3)
          RETURNING *
        `,
        [tenantId, input.sessionId, input.userId ?? null]
      );
      const sessionRow = sessionResult.rows[0];

      if (!sessionRow) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `
          UPDATE login_session_refresh_tokens
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND login_session_id = $2
            AND revoked_at IS NULL
        `,
        [tenantId, sessionRow.id]
      );

      const apiKeyResult = await client.query<ApiKeyRow>(
        `
          UPDATE api_keys
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE tenant_id = $1
            AND id = $2
          RETURNING *
        `,
        [tenantId, sessionRow.api_key_id]
      );
      const apiKeyRow = apiKeyResult.rows[0];

      if (!apiKeyRow) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query("COMMIT");

      return loginSessionRevokeResponseSchema.parse({
        session: mapLoginSessionRow(sessionRow),
        apiKey: mapApiKeyRow(apiKeyRow)
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticateApiKey(secret: string): Promise<AuthPrincipal | null> {
    const result = await this.pool.query<AuthKeyRow>(
      `
        SELECT
          api_keys.*,
          users.email AS user_email,
          users.display_name AS user_display_name,
          users.role AS user_role,
          users.status AS user_status,
          service_accounts.name AS service_account_name,
          service_accounts.role AS service_account_role,
          service_accounts.status AS service_account_status
        FROM api_keys
        LEFT JOIN users ON users.id = api_keys.user_id
        LEFT JOIN service_accounts ON service_accounts.id = api_keys.service_account_id
        WHERE api_keys.secret_hash = $1
          AND api_keys.revoked_at IS NULL
          AND (api_keys.expires_at IS NULL OR api_keys.expires_at > now())
          AND (
            (api_keys.user_id IS NOT NULL AND users.status = 'active') OR
            (api_keys.service_account_id IS NOT NULL AND service_accounts.status = 'active')
          )
      `,
      [hashApiKeySecret(secret)]
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    await this.pool.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [row.id]);

    if (row.service_account_id) {
      if (!row.service_account_name || !row.service_account_role) {
        return null;
      }

      return authPrincipalSchema.parse({
        tenantId: row.tenant_id,
        principalType: "service-account",
        principalId: row.service_account_id,
        userId: null,
        serviceAccountId: row.service_account_id,
        apiKeyId: row.id,
        email: null,
        displayName: row.service_account_name,
        role: row.service_account_role,
        scopes: row.scopes,
        allowedSurfaces: row.allowed_surfaces,
        groupIds: []
      });
    }

    if (!row.user_id || !row.user_email || !row.user_display_name || !row.user_role) {
      return null;
    }

    return authPrincipalSchema.parse({
      tenantId: row.tenant_id,
      principalType: "user",
      principalId: row.user_id,
      userId: row.user_id,
      serviceAccountId: null,
      apiKeyId: row.id,
      email: row.user_email,
      displayName: row.user_display_name,
      role: row.user_role,
      scopes: row.scopes,
      allowedSurfaces: row.allowed_surfaces,
      groupIds: await this.getGroupIds(row.user_id)
    });
  }

  async authenticateLocalUser(tenantId: string, email: string, password: string): Promise<LocalUser | null> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT *
        FROM users
        WHERE tenant_id = $1
          AND email = $2
          AND status = 'active'
          AND auth_provider = 'local'
        LIMIT 1
      `,
      [tenantId, email]
    );
    const row = result.rows[0];

    if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
      return null;
    }

    return mapUserRow(row);
  }

  async createPermissionGrant(input: PermissionGrantCreateInput): Promise<PermissionGrant> {
    return createPermissionGrantInTransaction(this.pool, input);
  }

  async createPermissionGrants(inputs: PermissionGrantCreateInput[]): Promise<PermissionGrant[]> {
    const parsed = inputs.map((input) => permissionGrantCreateInputSchema.parse(input));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const grants: PermissionGrant[] = [];
      for (const input of parsed) grants.push(await createPermissionGrantInTransaction(client, input));
      await client.query("COMMIT");
      return grants;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listPermissionGrants(input: PermissionGrantListOptions): Promise<PermissionGrantListResponse> {
    const parsed = permissionGrantListInputSchema.parse(input);
    const result = await this.pool.query<PermissionGrantRow & { stable_id: string }>(
      `
        SELECT grants.*, assets.stable_id
        FROM permission_grants AS grants
        JOIN assets ON assets.id = grants.asset_id AND assets.tenant_id = grants.tenant_id
        WHERE grants.tenant_id = $1
          AND assets.stable_id = $2
          AND ($3::text IS NULL OR grants.id::text > $3)
        ORDER BY grants.id::text
        LIMIT $4
      `,
      [input.tenantId ?? "tenant_demo", input.stableId, parsed.cursor ?? null, parsed.limit + 1]
    );
    const grants = result.rows.slice(0, parsed.limit).map((row) => mapPermissionGrantRow(row, row.stable_id));
    return {
      grants,
      nextCursor: result.rows.length > parsed.limit ? grants.at(-1)?.id ?? null : null
    };
  }

  async revokePermissionGrant(input: PermissionGrantRevokeInput): Promise<PermissionGrant | null> {
    const result = await this.pool.query<PermissionGrantRow & { stable_id: string }>(
      `
        DELETE FROM permission_grants AS grants
        USING assets
        WHERE grants.asset_id = assets.id
          AND grants.tenant_id = assets.tenant_id
          AND grants.tenant_id = $1
          AND assets.stable_id = $2
          AND grants.id::text = $3
        RETURNING grants.*, assets.stable_id
      `,
      [input.tenantId ?? "tenant_demo", input.stableId, input.grantId]
    );
    const row = result.rows[0];
    return row ? mapPermissionGrantRow(row, row.stable_id) : null;
  }

  async canAccessAsset(input: AccessCheckInput): Promise<boolean> {
    return (await this.filterAccessibleAssets({ ...input, assets: [input.asset] })).length === 1;
  }

  async filterAccessibleAssets(input: AssetAccessFilterInput): Promise<AssetRecord[]> {
    const decisions = input.assets.map((asset) => accessBeforeGrant({ ...input, asset }));
    const candidates = input.assets.filter((_, index) => decisions[index] === null);
    const grantedIds = new Set<string>();

    if (candidates.length > 0 && input.principal) {
      const result = await this.pool.query<{ asset_id: string }>(
        `
          SELECT DISTINCT asset_id
          FROM permission_grants
          WHERE tenant_id = $1
            AND asset_id = ANY($2::uuid[])
            AND action = $3
            AND $4 = ANY(surfaces)
            AND (
              (principal_type = 'user' AND principal_id = $5)
              OR (principal_type = 'group' AND principal_id = ANY($6::text[]))
              OR (principal_type = 'service-account' AND principal_id = $7)
            )
        `,
        [
          input.principal.tenantId,
          candidates.map((asset) => asset.id),
          input.action,
          input.surface,
          input.principal.userId,
          input.principal.groupIds,
          input.principal.serviceAccountId
        ]
      );
      for (const row of result.rows) {
        grantedIds.add(row.asset_id);
      }
    }

    return input.assets.filter((asset, index) =>
      decisions[index] === true || (decisions[index] === null && grantedIds.has(asset.id))
    );
  }

  async recordAuditEvent(input: AuditEventCreateInput): Promise<AuditEvent> {
    const parsed = auditEventCreateInputSchema.parse(input);
    await ensureTenant(this.pool, parsed.tenantId);
    const result = await this.pool.query<AuditEventRow>(
      `
        INSERT INTO audit_events (
          tenant_id,
          actor_user_id,
          actor_service_account_id,
          actor_api_key_id,
          action,
          target_type,
          target_id,
          outcome,
          reason,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        RETURNING *
      `,
      [
        parsed.tenantId,
        parsed.actorUserId ?? null,
        parsed.actorServiceAccountId ?? null,
        parsed.actorApiKeyId ?? null,
        parsed.action,
        parsed.targetType,
        parsed.targetId ?? null,
        parsed.outcome,
        parsed.reason ?? null,
        JSON.stringify(parsed.metadata)
      ]
    );

    return mapAuditEventRow(requireRow(result));
  }

  async listAuditEvents(options: AuditEventListOptions = {}): Promise<AuditEvent[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const result = await this.pool.query<AuditEventRow>(
      `
        SELECT *
        FROM audit_events
        WHERE tenant_id = $1
          AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
        ORDER BY created_at DESC
        LIMIT $4
      `,
      [tenantId, options.since ?? null, options.until ?? null, limit]
    );

    return result.rows.map(mapAuditEventRow);
  }

  async purgeAuditEvents(options: AuditEventPurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";

    if (options.dryRun ?? true) {
      const result = await this.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE tenant_id = $1 AND created_at < $2::timestamptz",
        [tenantId, options.before]
      );

      return Number.parseInt(result.rows[0]?.count ?? "0", 10);
    }

    const result = await this.pool.query<{ id: string }>(
      "DELETE FROM audit_events WHERE tenant_id = $1 AND created_at < $2::timestamptz RETURNING id",
      [tenantId, options.before]
    );

    return result.rowCount ?? 0;
  }

  private async getGroupIds(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ group_id: string }>(
      "SELECT group_id::text FROM group_memberships WHERE user_id = $1",
      [userId]
    );

    return result.rows.map((row) => row.group_id);
  }
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, LocalUser>();
  private readonly passwordHashes = new Map<string, string>();
  private readonly serviceAccounts = new Map<string, ServiceAccount>();
  private readonly serviceAccountPolicies = new Map<string, ServiceAccountPolicy>();
  private readonly groups = new Map<string, GroupRecord>();
  private readonly groupMemberships = new Map<string, GroupMembership>();
  private readonly apiKeys = new Map<string, ApiKeyMemoryRecord>();
  private readonly loginSessions = new Map<string, LoginSessionRecord>();
  private readonly loginSessionRefreshTokens = new Map<string, LoginSessionRefreshTokenMemoryRecord>();
  private readonly grants: PermissionGrant[] = [];
  private readonly auditEvents: AuditEvent[] = [];
  private readonly policyMutationExecutor = new KeyedSerialExecutor();
  private sequence = 0;

  constructor(private readonly testHooks: AuthRepositoryTestHooks = {}) {}

  async bootstrapAdmin(input: BootstrapAdminInput): Promise<BootstrapAdminResult | null> {
    const passwordHash = input.password ? await hashPassword(input.password) : null;

    if (Array.from(this.users.values()).some((user) => user.tenantId === input.tenantId)) {
      return null;
    }

    const now = new Date().toISOString();
    const userSequence = this.sequence + 1;
    const keySequence = this.sequence + 2;
    const auditSequence = this.sequence + 3;
    const user = localUserSchema.parse({
      id: `user_${userSequence}`,
      tenantId: input.tenantId,
      email: input.email,
      displayName: input.displayName,
      role: "admin",
      status: "active",
      authProvider: "local",
      externalProvider: null,
      externalSubject: null,
      externalIssuer: null,
      createdAt: now,
      updatedAt: now
    });
    const secret = generateApiKeySecret();
    const apiKey = apiKeyRecordSchema.parse({
      id: `api_key_${keySequence}`,
      tenantId: input.tenantId,
      userId: user.id,
      serviceAccountId: null,
      name: input.keyName,
      secretPreview: previewSecret(secret),
      scopes: ["admin", "asset:read", "asset:write", "permission:write"],
      allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now
    });
    const auditEvent = auditEventSchema.parse({
      id: `audit_${auditSequence}`,
      tenantId: input.tenantId,
      actorUserId: user.id,
      actorServiceAccountId: null,
      actorApiKeyId: apiKey.id,
      action: "auth.bootstrap",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      reason: null,
      metadata: {},
      createdAt: now
    });

    this.sequence = auditSequence;
    this.users.set(user.id, user);
    if (passwordHash) {
      this.passwordHashes.set(user.id, passwordHash);
    }
    this.apiKeys.set(hashApiKeySecret(secret), {
      apiKey,
      secretHash: hashApiKeySecret(secret)
    });
    this.auditEvents.unshift(auditEvent);

    return { user, apiKey, secret };
  }

  async countUsers(tenantId = "tenant_demo"): Promise<number> {
    return Array.from(this.users.values()).filter((user) => user.tenantId === tenantId).length;
  }

  async createUser(input: LocalUserCreateInput): Promise<LocalUser> {
    const parsed = localUserCreateInputSchema.parse(input);
    this.sequence += 1;
    const now = new Date().toISOString();
    const user = localUserSchema.parse({
      id: `user_${this.sequence}`,
      tenantId: parsed.tenantId,
      email: parsed.email,
      displayName: parsed.displayName,
	      role: parsed.role,
	      status: parsed.status,
	      authProvider: "local",
	      externalProvider: null,
	      externalSubject: null,
	      externalIssuer: null,
	      createdAt: now,
	      updatedAt: now
	    });

    this.users.set(user.id, user);

    if (parsed.password) {
      this.passwordHashes.set(user.id, await hashPassword(parsed.password));
    }

    return user;
  }

  async listUsers(options: UserListOptions = {}): Promise<LocalUser[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return Array.from(this.users.values())
      .filter((user) => user.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.email.localeCompare(right.email))
      .slice(0, limit);
  }

	  async findUserByEmail(tenantId: string, email: string): Promise<LocalUser | null> {
	    const normalizedEmail = email.toLowerCase();
	    return Array.from(this.users.values()).find((candidate) =>
	      candidate.tenantId === tenantId &&
	      candidate.email.toLowerCase() === normalizedEmail
	    ) ?? null;
	  }

	  async findUserByExternalIdentity(input: ExternalIdentityInput): Promise<LocalUser | null> {
	    const tenantId = input.tenantId ?? "tenant_demo";
	    return Array.from(this.users.values()).find((candidate) =>
	      candidate.tenantId === tenantId &&
	      candidate.externalProvider === input.provider &&
	      candidate.externalIssuer === input.issuer &&
	      candidate.externalSubject === input.subject
	    ) ?? null;
	  }

	  async createExternalUser(input: ExternalUserCreateInput): Promise<LocalUser> {
	    this.sequence += 1;
    const now = new Date().toISOString();
    const user = localUserSchema.parse({
      id: `user_${this.sequence}`,
      tenantId: input.tenantId ?? "tenant_demo",
      email: input.email,
      displayName: input.displayName,
	      role: input.role,
	      status: "active",
	      authProvider: input.authProvider,
	      externalProvider: input.authProvider,
	      externalIssuer: input.externalIssuer,
	      externalSubject: input.externalSubject,
	      createdAt: now,
	      updatedAt: now
	    });

	    this.users.set(user.id, user);
	    return user;
	  }

	  async linkExternalUserIdentity(input: ExternalUserLinkInput): Promise<LocalUser | null> {
	    const tenantId = input.tenantId ?? "tenant_demo";
	    const existing = this.users.get(input.userId);

	    if (!existing || existing.tenantId !== tenantId) {
	      return null;
	    }

	    if (
	      existing.externalSubject &&
	      (
	        existing.externalProvider !== input.provider ||
	        existing.externalIssuer !== input.issuer ||
	        existing.externalSubject !== input.subject
	      )
	    ) {
	      return null;
	    }

	    const updated = localUserSchema.parse({
	      ...existing,
	      externalProvider: input.provider,
	      externalIssuer: input.issuer,
	      externalSubject: input.subject,
	      updatedAt: new Date().toISOString()
	    });

	    this.users.set(updated.id, updated);
	    return updated;
	  }

	  async updateUser(input: LocalUserUpdateInput): Promise<LocalUser | null> {
    const parsed = localUserUpdateInputSchema.parse(input);
    const existing = this.users.get(parsed.userId);

    if (!existing || existing.tenantId !== parsed.tenantId) {
      return null;
    }

    const updated = localUserSchema.parse({
      ...existing,
      displayName: parsed.displayName ?? existing.displayName,
      role: parsed.role ?? existing.role,
      status: parsed.status ?? existing.status,
      updatedAt: new Date().toISOString()
    });
    this.users.set(updated.id, updated);

    if (parsed.password) {
      this.passwordHashes.set(updated.id, await hashPassword(parsed.password));
    }

    for (const [key, membership] of this.groupMemberships.entries()) {
      if (membership.userId === updated.id) {
        this.groupMemberships.set(key, groupMembershipSchema.parse({
          ...membership,
          userDisplayName: updated.displayName,
          userRole: updated.role
        }));
      }
    }

    return updated;
  }

  async createServiceAccount(input: ServiceAccountCreateInput): Promise<ServiceAccount> {
    const parsed = serviceAccountCreateInputSchema.parse(input);
    return this.policyMutationExecutor.run(`service-accounts:${parsed.tenantId}`, async () => {
      const policy = await this.getServiceAccountPolicy(parsed.tenantId);

      if (policy.maxServiceAccounts !== null) {
        const count = Array.from(this.serviceAccounts.values()).filter((serviceAccount) =>
          serviceAccount.tenantId === parsed.tenantId
        ).length;

        if (count >= policy.maxServiceAccounts) {
          throw new ServiceAccountPolicyViolationError(
            "max_service_accounts_exceeded",
            policy.maxServiceAccounts,
            parsed.tenantId
          );
        }
      }

      this.sequence += 1;
      const now = new Date().toISOString();
      const serviceAccount = serviceAccountSchema.parse({
        id: `service_account_${this.sequence}`,
        tenantId: parsed.tenantId,
        slug: parsed.slug,
        name: parsed.name,
        description: parsed.description ?? null,
        role: parsed.role,
        status: parsed.status,
        createdAt: now,
        updatedAt: now
      });

      this.serviceAccounts.set(serviceAccount.id, serviceAccount);
      return serviceAccount;
    });
  }

  async listServiceAccounts(options: ServiceAccountListOptions = {}): Promise<ServiceAccount[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return Array.from(this.serviceAccounts.values())
      .filter((serviceAccount) => serviceAccount.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.slug.localeCompare(right.slug))
      .slice(0, limit);
  }

  async updateServiceAccount(input: ServiceAccountUpdateInput): Promise<ServiceAccount | null> {
    const parsed = serviceAccountUpdateInputSchema.parse(input);
    const existing = this.serviceAccounts.get(parsed.serviceAccountId);

    if (!existing || existing.tenantId !== parsed.tenantId) {
      return null;
    }

    const updated = serviceAccountSchema.parse({
      ...existing,
      name: parsed.name ?? existing.name,
      description: parsed.description !== undefined ? parsed.description : existing.description,
      role: parsed.role ?? existing.role,
      status: parsed.status ?? existing.status,
      updatedAt: new Date().toISOString()
    });
    this.serviceAccounts.set(updated.id, updated);

    return updated;
  }

  async getServiceAccountPolicy(tenantId = "tenant_demo"): Promise<ServiceAccountPolicy> {
    return this.serviceAccountPolicies.get(tenantId) ?? defaultServiceAccountPolicy(tenantId);
  }

  async upsertServiceAccountPolicy(input: ServiceAccountPolicyRepositoryInput): Promise<ServiceAccountPolicy> {
    const parsed = serviceAccountPolicyInputSchema.parse(input);
    const current = await this.getServiceAccountPolicy(parsed.tenantId);
    const now = new Date().toISOString();
    const policy = serviceAccountPolicySchema.parse({
      tenantId: parsed.tenantId,
      maxServiceAccounts: parsed.maxServiceAccounts === undefined
        ? current.maxServiceAccounts
        : parsed.maxServiceAccounts,
      maxActiveApiKeysPerServiceAccount: parsed.maxActiveApiKeysPerServiceAccount === undefined
        ? current.maxActiveApiKeysPerServiceAccount
        : parsed.maxActiveApiKeysPerServiceAccount,
      defaultApiKeyExpiresInDays: parsed.defaultApiKeyExpiresInDays === undefined
        ? current.defaultApiKeyExpiresInDays
        : parsed.defaultApiKeyExpiresInDays,
      source: "stored",
      updatedByUserId: input.updatedByUserId ?? null,
      updatedByServiceAccountId: input.updatedByServiceAccountId ?? null,
      updatedByApiKeyId: input.updatedByApiKeyId ?? null,
      createdAt: current.createdAt ?? now,
      updatedAt: now
    });

    this.serviceAccountPolicies.set(parsed.tenantId, policy);
    return policy;
  }

  async createGroup(input: GroupCreateInput): Promise<GroupRecord> {
    const parsed = groupCreateInputSchema.parse(input);
    this.sequence += 1;
    const now = new Date().toISOString();
    const group = groupRecordSchema.parse({
      id: `group_${this.sequence}`,
      tenantId: parsed.tenantId,
	      slug: parsed.slug,
	      name: parsed.name,
	      description: parsed.description ?? null,
	      externalProvider: null,
	      externalId: null,
	      createdAt: now,
	      updatedAt: now
	    });

    this.groups.set(group.id, group);
    return group;
  }

  async listGroups(options: GroupListOptions = {}): Promise<GroupRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return Array.from(this.groups.values())
      .filter((group) => group.tenantId === tenantId)
      .sort((left, right) => left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug))
      .slice(0, limit);
  }

  async deleteGroup(input: GroupDeleteInput): Promise<GroupRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const group = this.groups.get(input.groupId);

    if (!group || group.tenantId !== tenantId) {
      return null;
    }

    this.groups.delete(group.id);

    for (const key of Array.from(this.groupMemberships.keys())) {
      if (key.startsWith(`${group.id}:`)) {
        this.groupMemberships.delete(key);
      }
    }

    for (let index = this.grants.length - 1; index >= 0; index -= 1) {
      const grant = this.grants[index];

      if (grant && grant.tenantId === tenantId && grant.principalType === "group" && grant.principalId === group.id) {
        this.grants.splice(index, 1);
      }
    }

    return group;
  }

  async addGroupMember(input: GroupMembershipInput): Promise<GroupMembership | null> {
    const parsed = groupMembershipInputSchema.parse(input);
    const group = this.groups.get(parsed.groupId);
    const user = this.users.get(parsed.userId);

    if (!group || !user || group.tenantId !== parsed.tenantId || user.tenantId !== parsed.tenantId) {
      return null;
    }

    const key = `${group.id}:${user.id}`;
	    const existing = this.groupMemberships.get(key);

	    if (existing) {
	      const updated = groupMembershipSchema.parse({
	        ...existing,
	        source: "local",
	        externalProvider: null
	      });
	      this.groupMemberships.set(key, updated);
	      return updated;
	    }

	    const member = groupMembershipSchema.parse({
      groupId: group.id,
      userId: user.id,
	      userEmail: user.email,
	      userDisplayName: user.displayName,
	      userRole: user.role,
	      source: "local",
	      externalProvider: null,
	      createdAt: new Date().toISOString()
	    });

	    this.groupMemberships.set(key, member);
	    return member;
	  }

	  async syncExternalGroupMemberships(input: ExternalGroupSyncInput): Promise<ExternalGroupSyncResult> {
	    const tenantId = input.tenantId ?? "tenant_demo";
	    const user = this.users.get(input.userId);

	    if (!user || user.tenantId !== tenantId) {
	      return {
	        groups: [],
	        addedMembershipCount: 0,
	        removedMembershipCount: 0
	      };
	    }

	    const externalGroupIds = normalizeExternalGroupIds(input.externalGroupIds);
	    const syncedGroups: GroupRecord[] = [];
	    const syncedGroupIds = new Set<string>();
	    let addedMembershipCount = 0;
	    const now = new Date().toISOString();

	    for (const externalGroupId of externalGroupIds) {
	      let group = Array.from(this.groups.values()).find((candidate) =>
	        candidate.tenantId === tenantId &&
	        candidate.externalProvider === input.provider &&
	        candidate.externalId === externalGroupId
	      );

	      if (!group) {
	        this.sequence += 1;
	        group = groupRecordSchema.parse({
	          id: `group_${this.sequence}`,
	          tenantId,
	          slug: externalGroupSlug(input.provider, externalGroupId),
	          name: externalGroupName(externalGroupId),
	          description: `Synced from ${input.provider} group ${externalGroupId}`,
	          externalProvider: input.provider,
	          externalId: externalGroupId,
	          createdAt: now,
	          updatedAt: now
	        });
	      } else {
	        group = groupRecordSchema.parse({
	          ...group,
	          name: externalGroupName(externalGroupId),
	          updatedAt: now
	        });
	      }

	      this.groups.set(group.id, group);
	      syncedGroups.push(group);
	      syncedGroupIds.add(group.id);

	      const key = `${group.id}:${user.id}`;
	      const existing = this.groupMemberships.get(key);

	      if (!existing) {
	        const member = groupMembershipSchema.parse({
	          groupId: group.id,
	          userId: user.id,
	          userEmail: user.email,
	          userDisplayName: user.displayName,
	          userRole: user.role,
	          source: "external",
	          externalProvider: input.provider,
	          createdAt: now
	        });
	        this.groupMemberships.set(key, member);
	        addedMembershipCount += 1;
	      }
	    }

	    let removedMembershipCount = 0;

	    for (const [key, member] of Array.from(this.groupMemberships.entries())) {
	      if (
	        member.userId === user.id &&
	        member.source === "external" &&
	        member.externalProvider === input.provider &&
	        !syncedGroupIds.has(member.groupId)
	      ) {
	        this.groupMemberships.delete(key);
	        removedMembershipCount += 1;
	      }
	    }

	    return {
	      groups: syncedGroups,
	      addedMembershipCount,
	      removedMembershipCount
	    };
	  }

  async listGroupMembers(options: GroupMemberListOptions): Promise<GroupMembership[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const group = this.groups.get(options.groupId);

    if (!group || group.tenantId !== tenantId) {
      return [];
    }

    return Array.from(this.groupMemberships.values())
      .filter((member) => member.groupId === options.groupId)
      .sort((left, right) => left.userEmail.localeCompare(right.userEmail))
      .slice(0, limit);
  }

  async removeGroupMember(input: GroupMemberRemoveInput): Promise<GroupMembership | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const group = this.groups.get(input.groupId);

    if (!group || group.tenantId !== tenantId) {
      return null;
    }

    const key = `${input.groupId}:${input.userId}`;
    const member = this.groupMemberships.get(key);

    if (!member) {
      return null;
    }

    this.groupMemberships.delete(key);
    return member;
  }

  async createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreated | null> {
    const parsed = apiKeyCreateInputSchema.parse(input);
    const insertApiKey = (expiresAt: string | null): ApiKeyCreated => {
      const secret = generateApiKeySecret();
      this.sequence += 1;
      const now = new Date().toISOString();
      const apiKey = apiKeyRecordSchema.parse({
        id: `api_key_${this.sequence}`,
        tenantId: parsed.tenantId,
        userId: parsed.userId ?? null,
        serviceAccountId: parsed.serviceAccountId ?? null,
        name: parsed.name,
        secretPreview: previewSecret(secret),
        scopes: parsed.scopes,
        allowedSurfaces: parsed.allowedSurfaces,
        expiresAt,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now
      });

      this.apiKeys.set(hashApiKeySecret(secret), {
        apiKey,
        secretHash: hashApiKeySecret(secret)
      });

      return apiKeyCreatedSchema.parse({ apiKey, secret });
    };

    if (parsed.userId) {
      const user = this.users.get(parsed.userId);

      if (!user || user.tenantId !== parsed.tenantId) {
        return null;
      }

      return insertApiKey(parsed.expiresAt ?? null);
    }

    if (parsed.serviceAccountId) {
      return this.policyMutationExecutor.run(`service-account-keys:${parsed.serviceAccountId}`, async () => {
        const serviceAccount = this.serviceAccounts.get(parsed.serviceAccountId ?? "");

        if (!serviceAccount || serviceAccount.tenantId !== parsed.tenantId) {
          return null;
        }

        const policy = await this.getServiceAccountPolicy(parsed.tenantId);
        const expiresAt = policy.defaultApiKeyExpiresInDays !== null && parsed.expiresAt === undefined
          ? apiKeyExpiryFromDays(policy.defaultApiKeyExpiresInDays)
          : parsed.expiresAt ?? null;

        if (policy.maxActiveApiKeysPerServiceAccount !== null) {
          const activeKeyCount = Array.from(this.apiKeys.values()).filter((record) =>
            record.apiKey.tenantId === parsed.tenantId &&
            record.apiKey.serviceAccountId === parsed.serviceAccountId &&
            record.apiKey.revokedAt === null &&
            (!record.apiKey.expiresAt || Date.parse(record.apiKey.expiresAt) > Date.now())
          ).length;

          if (activeKeyCount >= policy.maxActiveApiKeysPerServiceAccount) {
            throw new ServiceAccountPolicyViolationError(
              "max_active_api_keys_per_service_account_exceeded",
              policy.maxActiveApiKeysPerServiceAccount,
              parsed.tenantId,
              parsed.serviceAccountId
            );
          }
        }

        return insertApiKey(expiresAt);
      });
    }

    return null;
  }

  async listApiKeys(options: ApiKeyListOptions = {}): Promise<ApiKeyRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return Array.from(this.apiKeys.values())
      .map((record) => record.apiKey)
      .filter((apiKey) => apiKey.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async getApiKeyRotationReport(input: ApiKeyRotationReportRepositoryInput = {}): Promise<ApiKeyRotationReport> {
    const parsed = normalizeApiKeyRotationReportInput(input);
    const reminders = Array.from(this.apiKeys.values())
      .map((record) => record.apiKey)
      .filter((apiKey) => apiKey.tenantId === parsed.tenantId)
      .filter((apiKey) => parsed.includeUserKeys || apiKey.serviceAccountId !== null)
      .filter((apiKey) => parsed.includeRevoked || apiKey.revokedAt === null)
      .filter((apiKey) => apiKey.expiresAt === null || apiKey.expiresAt <= parsed.dueBefore)
      .sort((left, right) =>
        Number(Boolean(left.revokedAt)) - Number(Boolean(right.revokedAt)) ||
        (left.expiresAt ?? "").localeCompare(right.expiresAt ?? "") ||
        right.createdAt.localeCompare(left.createdAt)
      )
      .slice(0, parsed.limit)
      .map((apiKey) => buildApiKeyRotationReminder(apiKey, parsed.asOf))
      .filter((reminder): reminder is ApiKeyRotationReminder => reminder !== null);

    return apiKeyRotationReportSchema.parse({
      tenantId: parsed.tenantId,
      asOf: parsed.asOf,
      dueBefore: parsed.dueBefore,
      dueWithinDays: parsed.dueWithinDays,
      includeUserKeys: parsed.includeUserKeys,
      includeRevoked: parsed.includeRevoked,
      reminders
    });
  }

  async listApiKeyRotationReports(input: ApiKeyRotationReportsRepositoryInput = {}): Promise<ApiKeyRotationReport[]> {
    const parsed = normalizeApiKeyRotationReportOptions(input);
    const tenantIds = parsed.tenantIds?.length
      ? parsed.tenantIds
      : Array.from(new Set(Array.from(this.apiKeys.values()).map((record) => record.apiKey.tenantId))).sort();
    const reports = await Promise.all(tenantIds.map((tenantId) =>
      this.getApiKeyRotationReport({
        tenantId,
        asOf: parsed.asOf,
        dueWithinDays: parsed.dueWithinDays,
        includeUserKeys: parsed.includeUserKeys,
        includeRevoked: parsed.includeRevoked,
        limit: parsed.limit
      })
    ));

    return reports.filter((report) => report.reminders.length > 0);
  }

  async revokeApiKey(input: ApiKeyRevokeInput): Promise<ApiKeyRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const record = Array.from(this.apiKeys.values()).find((apiKeyRecord) =>
      apiKeyRecord.apiKey.tenantId === tenantId &&
      apiKeyRecord.apiKey.id === input.apiKeyId
    );

    if (!record) {
      return null;
    }

    record.apiKey = apiKeyRecordSchema.parse({
      ...record.apiKey,
      revokedAt: record.apiKey.revokedAt ?? new Date().toISOString()
    });

    for (const [id, session] of this.loginSessions.entries()) {
      if (session.tenantId === tenantId && session.apiKeyId === input.apiKeyId) {
        this.loginSessions.set(id, loginSessionRecordSchema.parse({
          ...session,
          revokedAt: session.revokedAt ?? record.apiKey.revokedAt
        }));
        this.revokeInMemoryRefreshTokensForSession(tenantId, session.id, record.apiKey.revokedAt ?? new Date().toISOString());
      }
    }

    return record.apiKey;
  }

  async rotateApiKey(input: ApiKeyRotateRepositoryInput): Promise<ApiKeyRotateResponse | null> {
    const parsed = apiKeyRotateInputSchema.parse(input);
    const tenantId = input.tenantId ?? "tenant_demo";
    const findActiveRecord = () => Array.from(this.apiKeys.values()).find((apiKeyRecord) =>
        apiKeyRecord.apiKey.tenantId === tenantId &&
        apiKeyRecord.apiKey.id === input.apiKeyId &&
        !apiKeyRecord.apiKey.revokedAt
      );
    const rotateRecord = (record: ApiKeyMemoryRecord): ApiKeyRotateResponse => {
      const secret = generateApiKeySecret();
      this.sequence += 1;
      const now = new Date().toISOString();
      const replacement = apiKeyRecordSchema.parse({
        id: `api_key_${this.sequence}`,
        tenantId,
        userId: record.apiKey.userId,
        serviceAccountId: record.apiKey.serviceAccountId,
        name: parsed.name ?? `${record.apiKey.name} rotation`,
        secretPreview: previewSecret(secret),
        scopes: record.apiKey.scopes,
        allowedSurfaces: record.apiKey.allowedSurfaces,
        expiresAt: record.apiKey.expiresAt,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: now
      });

      this.apiKeys.set(hashApiKeySecret(secret), {
        apiKey: replacement,
        secretHash: hashApiKeySecret(secret)
      });

      let revokedApiKey: ApiKeyRecord | null = null;

      if (parsed.revokeOld) {
        record.apiKey = apiKeyRecordSchema.parse({
          ...record.apiKey,
          revokedAt: record.apiKey.revokedAt ?? now
        });
        revokedApiKey = record.apiKey;
      }

      return apiKeyRotateResponseSchema.parse({
        apiKey: replacement,
        secret,
        rotatedFrom: record.apiKey,
        revokedApiKey
      });
    };
    const record = findActiveRecord();

    if (!record) {
      return null;
    }

    if (!record.apiKey.serviceAccountId) {
      return rotateRecord(record);
    }

    return this.policyMutationExecutor.run(`service-account-keys:${record.apiKey.serviceAccountId}`, async () => {
      const lockedRecord = findActiveRecord();

      if (!lockedRecord) {
        return null;
      }

      const policy = await this.getServiceAccountPolicy(tenantId);

      if (!parsed.revokeOld && policy.maxActiveApiKeysPerServiceAccount !== null) {
        const activeKeyCount = Array.from(this.apiKeys.values()).filter((candidate) =>
          candidate.apiKey.tenantId === tenantId &&
          candidate.apiKey.serviceAccountId === lockedRecord.apiKey.serviceAccountId &&
          candidate.apiKey.revokedAt === null &&
          (!candidate.apiKey.expiresAt || Date.parse(candidate.apiKey.expiresAt) > Date.now())
        ).length;

        if (activeKeyCount >= policy.maxActiveApiKeysPerServiceAccount) {
          throw new ServiceAccountPolicyViolationError(
            "max_active_api_keys_per_service_account_exceeded",
            policy.maxActiveApiKeysPerServiceAccount,
            tenantId,
            lockedRecord.apiKey.serviceAccountId ?? undefined
          );
        }
      }

      return rotateRecord(lockedRecord);
    });
  }

  async issueLoginCredentials(input: LoginCredentialIssueInput): Promise<LoginCredentialIssueResult | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    let apiKey: ApiKeyCreated | null = null;
    let session: LoginSessionRecord | null = null;
    let refreshToken: LoginSessionRefreshTokenCreated | null = null;
    let auditEvent: AuditEvent | null = null;

    const rollback = () => {
      if (apiKey) {
        this.apiKeys.delete(hashApiKeySecret(apiKey.secret));
      }
      if (session) {
        this.loginSessions.delete(session.id);
      }
      if (refreshToken) {
        this.loginSessionRefreshTokens.delete(refreshToken.id);
      }
      if (auditEvent) {
        const auditIndex = this.auditEvents.findIndex((event) => event.id === auditEvent?.id);
        if (auditIndex !== -1) {
          this.auditEvents.splice(auditIndex, 1);
        }
      }
    };

    try {
      apiKey = await this.createApiKey({
        tenantId,
        userId: input.userId,
        name: input.keyName,
        scopes: input.scopes,
        allowedSurfaces: input.allowedSurfaces,
        expiresAt: input.expiresAt
      });

      if (!apiKey) {
        return null;
      }

      await this.testHooks.afterLoginCredentialIssueStage?.("api-key");
      session = await this.createLoginSession({
        tenantId,
        userId: input.userId,
        apiKeyId: apiKey.apiKey.id,
        source: input.source,
        deviceLabel: input.deviceLabel,
        clientUserAgent: input.clientUserAgent,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt
      });

      if (!session) {
        rollback();
        return null;
      }

      await this.testHooks.afterLoginCredentialIssueStage?.("session");

      if (input.refreshTokenExpiresAt) {
        refreshToken = await this.createLoginSessionRefreshToken({
          tenantId,
          loginSessionId: session.id,
          expiresAt: input.refreshTokenExpiresAt
        });

        if (!refreshToken) {
          rollback();
          return null;
        }

        await this.testHooks.afterLoginCredentialIssueStage?.("refresh-token");
      }

      auditEvent = await this.recordAuditEvent({
        tenantId,
        actorUserId: input.userId,
        actorApiKeyId: apiKey.apiKey.id,
        action: input.auditAction,
        targetType: "user",
        targetId: input.userId,
        outcome: "success",
        metadata: {
          ...input.auditMetadata,
          apiKeyId: apiKey.apiKey.id,
          sessionId: session.id
        }
      });
      await this.testHooks.afterLoginCredentialIssueStage?.("audit");

      return {
        ...apiKey,
        session,
        refreshToken,
        auditEvent
      };
    } catch (error) {
      rollback();
      throw error;
    }
  }

  async createLoginSession(input: LoginSessionCreateInput): Promise<LoginSessionRecord | null> {
    const parsed = normalizeLoginSessionCreateInput(input);
    const user = this.users.get(parsed.userId);
    const apiKeyRecord = Array.from(this.apiKeys.values()).find((record) =>
      record.apiKey.tenantId === parsed.tenantId &&
      record.apiKey.id === parsed.apiKeyId &&
      record.apiKey.userId === parsed.userId &&
      record.apiKey.revokedAt === null
    );

    if (!user || user.tenantId !== parsed.tenantId || !apiKeyRecord) {
      return null;
    }

    this.sequence += 1;
    const now = new Date().toISOString();
    const session = loginSessionRecordSchema.parse({
      id: `login_session_${this.sequence}`,
      tenantId: parsed.tenantId,
      userId: parsed.userId,
      apiKeyId: parsed.apiKeyId,
      source: parsed.source,
      deviceLabel: parsed.deviceLabel,
      clientUserAgent: parsed.clientUserAgent,
      createdAt: now,
      expiresAt: parsed.expiresAt,
      absoluteExpiresAt: parsed.absoluteExpiresAt,
      lastSeenAt: null,
      revokedAt: null
    });

    this.loginSessions.set(session.id, session);
    return session;
  }

  async createLoginSessionRefreshToken(
    input: LoginSessionRefreshTokenCreateInput
  ): Promise<LoginSessionRefreshTokenCreated | null> {
    const parsed = normalizeLoginSessionRefreshTokenCreateInput(input);
    const session = this.loginSessions.get(parsed.loginSessionId);

    if (
      !session ||
      session.tenantId !== parsed.tenantId ||
      session.revokedAt !== null ||
      (session.absoluteExpiresAt !== null && Date.parse(session.absoluteExpiresAt) <= Date.now())
    ) {
      return null;
    }

    this.sequence += 1;
    const token = generateRefreshTokenSecret();
    const record: LoginSessionRefreshTokenMemoryRecord = {
      id: `login_refresh_${this.sequence}`,
      tenantId: parsed.tenantId,
      loginSessionId: session.id,
      tokenHash: hashRefreshTokenSecret(token),
      expiresAt: session.absoluteExpiresAt ? minIso(parsed.expiresAt, session.absoluteExpiresAt) : parsed.expiresAt,
      createdAt: new Date().toISOString(),
      usedAt: null,
      revokedAt: null,
      rotatedToId: null
    };

    this.loginSessionRefreshTokens.set(record.id, record);

    return {
      id: record.id,
      token,
      expiresAt: record.expiresAt
    };
  }

  async refreshLoginSession(input: LoginSessionRefreshInput): Promise<LoginSessionRefreshResult | null> {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const refreshRecord = Array.from(this.loginSessionRefreshTokens.values()).find((candidate) =>
      candidate.tokenHash === hashRefreshTokenSecret(input.refreshToken) &&
      (!input.tenantId || candidate.tenantId === input.tenantId) &&
      candidate.usedAt === null &&
      candidate.revokedAt === null &&
      Date.parse(candidate.expiresAt) > nowMs
    );

    if (!refreshRecord) {
      return null;
    }

    const session = this.loginSessions.get(refreshRecord.loginSessionId);

    if (
      !session ||
      session.revokedAt !== null ||
      (session.absoluteExpiresAt !== null && Date.parse(session.absoluteExpiresAt) <= nowMs)
    ) {
      return null;
    }

    if (input.idleTimeoutSeconds !== undefined && input.idleTimeoutSeconds !== null) {
      const lastActivityAt = session.lastSeenAt ?? session.createdAt;

      if (Date.parse(lastActivityAt) + input.idleTimeoutSeconds * 1000 <= nowMs) {
        return null;
      }
    }

    const oldApiKeyRecord = Array.from(this.apiKeys.values()).find((record) =>
      record.apiKey.tenantId === session.tenantId &&
      record.apiKey.id === session.apiKeyId &&
      record.apiKey.userId === session.userId &&
      record.apiKey.revokedAt === null
    );
    const user = this.users.get(session.userId);

    if (!oldApiKeyRecord || !user || user.status !== "active") {
      return null;
    }

    const accessSecret = generateApiKeySecret();
    const replacementExpiresAt = session.absoluteExpiresAt
      ? minIso(input.expiresAt, session.absoluteExpiresAt)
      : input.expiresAt;
    const nextRefreshExpiresAt = session.absoluteExpiresAt
      ? minIso(input.refreshTokenExpiresAt, session.absoluteExpiresAt)
      : input.refreshTokenExpiresAt;
    this.sequence += 1;
    const replacementApiKey = apiKeyRecordSchema.parse({
      id: `api_key_${this.sequence}`,
      tenantId: session.tenantId,
      userId: session.userId,
      serviceAccountId: null,
      name: input.apiKeyName ?? `${oldApiKeyRecord.apiKey.name} refresh`,
      secretPreview: previewSecret(accessSecret),
      scopes: oldApiKeyRecord.apiKey.scopes,
      allowedSurfaces: oldApiKeyRecord.apiKey.allowedSurfaces,
      expiresAt: replacementExpiresAt,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now
    });

    this.apiKeys.set(hashApiKeySecret(accessSecret), {
      apiKey: replacementApiKey,
      secretHash: hashApiKeySecret(accessSecret)
    });

    oldApiKeyRecord.apiKey = apiKeyRecordSchema.parse({
      ...oldApiKeyRecord.apiKey,
      revokedAt: oldApiKeyRecord.apiKey.revokedAt ?? now
    });

    const nextRefreshToken = generateRefreshTokenSecret();
    this.sequence += 1;
    const nextRefreshRecord: LoginSessionRefreshTokenMemoryRecord = {
      id: `login_refresh_${this.sequence}`,
      tenantId: session.tenantId,
      loginSessionId: session.id,
      tokenHash: hashRefreshTokenSecret(nextRefreshToken),
      expiresAt: nextRefreshExpiresAt,
      createdAt: now,
      usedAt: null,
      revokedAt: null,
      rotatedToId: null
    };
    this.loginSessionRefreshTokens.set(nextRefreshRecord.id, nextRefreshRecord);

    refreshRecord.usedAt = refreshRecord.usedAt ?? now;
    refreshRecord.rotatedToId = nextRefreshRecord.id;
    this.loginSessionRefreshTokens.set(refreshRecord.id, refreshRecord);

    const updatedSession = loginSessionRecordSchema.parse({
      ...session,
      apiKeyId: replacementApiKey.id,
      expiresAt: replacementExpiresAt,
      lastSeenAt: now
    });
    this.loginSessions.set(updatedSession.id, updatedSession);

    return {
      session: updatedSession,
      apiKey: replacementApiKey,
      secret: accessSecret,
      rotatedFromApiKey: oldApiKeyRecord.apiKey,
      refreshToken: nextRefreshToken,
      refreshTokenId: nextRefreshRecord.id,
      refreshTokenExpiresAt: nextRefreshRecord.expiresAt,
      rotatedFromRefreshTokenId: refreshRecord.id
    };
  }

  async findActiveLoginSessionByApiKeyId(input: LoginSessionLookupInput): Promise<LoginSessionRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const nowMs = Date.now();
    const session = Array.from(this.loginSessions.values()).find((candidate) =>
      candidate.tenantId === tenantId &&
      candidate.apiKeyId === input.apiKeyId &&
      candidate.revokedAt === null &&
      Date.parse(candidate.expiresAt) > nowMs &&
      (candidate.absoluteExpiresAt === null || Date.parse(candidate.absoluteExpiresAt) > nowMs)
    );

    if (!session) {
      return null;
    }

    if (input.idleTimeoutSeconds !== undefined && input.idleTimeoutSeconds !== null) {
      const lastActivityAt = session.lastSeenAt ?? session.createdAt;

      if (Date.parse(lastActivityAt) + input.idleTimeoutSeconds * 1000 <= nowMs) {
        return null;
      }
    }

    return session;
  }

  async touchLoginSession(input: LoginSessionTouchInput): Promise<LoginSessionRecord | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const nowMs = Date.now();
    const session = this.loginSessions.get(input.sessionId);

    if (
      !session ||
      session.tenantId !== tenantId ||
      session.revokedAt !== null ||
      Date.parse(session.expiresAt) <= nowMs ||
      (session.absoluteExpiresAt !== null && Date.parse(session.absoluteExpiresAt) <= nowMs)
    ) {
      return null;
    }

    if (input.idleTimeoutSeconds !== undefined && input.idleTimeoutSeconds !== null) {
      const lastActivityAt = session.lastSeenAt ?? session.createdAt;

      if (Date.parse(lastActivityAt) + input.idleTimeoutSeconds * 1000 <= nowMs) {
        return null;
      }
    }

    const updated = loginSessionRecordSchema.parse({
      ...session,
      lastSeenAt: new Date(nowMs).toISOString()
    });
    this.loginSessions.set(updated.id, updated);

    return updated;
  }

  async listLoginSessions(options: LoginSessionListOptions = {}): Promise<LoginSessionRecord[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);

    return Array.from(this.loginSessions.values())
      .filter((session) => session.tenantId === tenantId)
      .filter((session) => !options.userId || session.userId === options.userId)
      .filter((session) => options.includeRevoked || session.revokedAt === null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async revokeLoginSession(input: LoginSessionRevokeInput): Promise<LoginSessionRevokeResponse | null> {
    const tenantId = input.tenantId ?? "tenant_demo";
    const session = this.loginSessions.get(input.sessionId);

    if (!session || session.tenantId !== tenantId || (input.userId && session.userId !== input.userId)) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedSession = loginSessionRecordSchema.parse({
      ...session,
      revokedAt: session.revokedAt ?? now
    });
    this.loginSessions.set(updatedSession.id, updatedSession);
    this.revokeInMemoryRefreshTokensForSession(tenantId, updatedSession.id, now);

    const apiKey = await this.revokeApiKey({
      tenantId,
      apiKeyId: session.apiKeyId
    });

    if (!apiKey) {
      return null;
    }

    return loginSessionRevokeResponseSchema.parse({
      session: updatedSession,
      apiKey
    });
  }

  async authenticateApiKey(secret: string): Promise<AuthPrincipal | null> {
    const record = this.apiKeys.get(hashApiKeySecret(secret));

    if (!record || record.apiKey.revokedAt) {
      return null;
    }

    if (record.apiKey.serviceAccountId) {
      const serviceAccount = this.serviceAccounts.get(record.apiKey.serviceAccountId);

      if (!serviceAccount || serviceAccount.status !== "active") {
        return null;
      }

      return authPrincipalSchema.parse({
        tenantId: serviceAccount.tenantId,
        principalType: "service-account",
        principalId: serviceAccount.id,
        userId: null,
        serviceAccountId: serviceAccount.id,
        apiKeyId: record.apiKey.id,
        email: null,
        displayName: serviceAccount.name,
        role: serviceAccount.role,
        scopes: record.apiKey.scopes,
        allowedSurfaces: record.apiKey.allowedSurfaces,
        groupIds: []
      });
    }

    const user = record.apiKey.userId ? this.users.get(record.apiKey.userId) : null;

    if (!user || user.status !== "active") {
      return null;
    }

    return authPrincipalSchema.parse({
      tenantId: user.tenantId,
      principalType: "user",
      principalId: user.id,
      userId: user.id,
      serviceAccountId: null,
      apiKeyId: record.apiKey.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      scopes: record.apiKey.scopes,
      allowedSurfaces: record.apiKey.allowedSurfaces,
      groupIds: this.groupIdsForUser(user.id)
    });
  }

  async authenticateLocalUser(tenantId: string, email: string, password: string): Promise<LocalUser | null> {
    const user = Array.from(this.users.values()).find((candidate) =>
      candidate.tenantId === tenantId &&
      candidate.email === email &&
      candidate.status === "active" &&
      candidate.authProvider === "local"
    );

    if (!user) {
      return null;
    }

    const passwordHash = this.passwordHashes.get(user.id);

    if (!passwordHash || !(await verifyPassword(password, passwordHash))) {
      return null;
    }

    return user;
  }

  async createPermissionGrant(input: PermissionGrantCreateInput): Promise<PermissionGrant> {
    return (await this.createPermissionGrants([input]))[0]!;
  }

  async createPermissionGrants(inputs: PermissionGrantCreateInput[]): Promise<PermissionGrant[]> {
    const parsed = inputs.map((input) => permissionGrantCreateInputSchema.parse(input));
    const staged = [...this.grants];
    let sequence = this.sequence;
    const grants = parsed.map((input) => {
      sequence += 1;
      const index = staged.findIndex((existing) =>
        existing.tenantId === input.tenantId && existing.stableId === input.stableId &&
        existing.principalType === input.principalType && existing.principalId === input.principalId &&
        existing.action === input.action
      );
      const existing = staged[index];
      const grant = permissionGrantSchema.parse({
        id: existing?.id ?? `grant_${sequence}`,
        tenantId: input.tenantId,
        assetId: input.stableId,
        stableId: input.stableId,
        principalType: input.principalType,
        principalId: input.principalId,
        action: input.action,
        surfaces: input.surfaces,
        createdBy: input.createdBy ?? null,
        createdAt: existing?.createdAt ?? new Date().toISOString()
      });
      if (existing) staged[index] = grant;
      else staged.push(grant);
      return grant;
    });
    // Validate and stage the whole batch before changing the shared store.
    this.grants.splice(0, this.grants.length, ...staged);
    this.sequence = sequence;
    return grants;
  }

  async listPermissionGrants(input: PermissionGrantListOptions): Promise<PermissionGrantListResponse> {
    const parsed = permissionGrantListInputSchema.parse(input);
    const matches = this.grants
      .filter((grant) => grant.tenantId === (input.tenantId ?? "tenant_demo") && grant.stableId === input.stableId)
      .filter((grant) => !parsed.cursor || grant.id > parsed.cursor)
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const grants = matches.slice(0, parsed.limit);
    return {
      grants,
      nextCursor: matches.length > parsed.limit ? grants.at(-1)?.id ?? null : null
    };
  }

  async revokePermissionGrant(input: PermissionGrantRevokeInput): Promise<PermissionGrant | null> {
    const index = this.grants.findIndex((grant) =>
      grant.tenantId === (input.tenantId ?? "tenant_demo") &&
      grant.stableId === input.stableId &&
      grant.id === input.grantId
    );
    return index < 0 ? null : this.grants.splice(index, 1)[0] ?? null;
  }

  async canAccessAsset(input: AccessCheckInput): Promise<boolean> {
    return (await this.filterAccessibleAssets({ ...input, assets: [input.asset] })).length === 1;
  }

  async filterAccessibleAssets(input: AssetAccessFilterInput): Promise<AssetRecord[]> {
    const grantedStableIds = new Set(this.grants.filter((grant) =>
      grant.tenantId === input.principal?.tenantId &&
      grant.action === input.action &&
      grant.surfaces.includes(input.surface) &&
      (
        (grant.principalType === "user" && grant.principalId === input.principal?.userId) ||
        (grant.principalType === "group" && input.principal?.groupIds.includes(grant.principalId)) ||
        (grant.principalType === "service-account" && grant.principalId === input.principal?.serviceAccountId)
      )
    ).map((grant) => grant.stableId));
    return input.assets.filter((asset) => {
      const decision = accessBeforeGrant({ ...input, asset });
      return decision ?? grantedStableIds.has(asset.stableId);
    });
  }

  async recordAuditEvent(input: AuditEventCreateInput): Promise<AuditEvent> {
    const parsed = auditEventCreateInputSchema.parse(input);
    this.sequence += 1;
    const event = auditEventSchema.parse({
      id: `audit_${this.sequence}`,
      tenantId: parsed.tenantId,
      actorUserId: parsed.actorUserId ?? null,
      actorServiceAccountId: parsed.actorServiceAccountId ?? null,
      actorApiKeyId: parsed.actorApiKeyId ?? null,
      action: parsed.action,
      targetType: parsed.targetType,
      targetId: parsed.targetId ?? null,
      outcome: parsed.outcome,
      reason: parsed.reason ?? null,
      metadata: parsed.metadata,
      createdAt: new Date().toISOString()
    });

    this.auditEvents.unshift(event);
    return event;
  }

  async listAuditEvents(options: AuditEventListOptions = {}): Promise<AuditEvent[]> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const since = options.since ? Date.parse(options.since) : undefined;
    const until = options.until ? Date.parse(options.until) : undefined;

    return this.auditEvents
      .filter((event) => event.tenantId === tenantId)
      .filter((event) => isCreatedAtInWindow(event.createdAt, since, until))
      .slice(0, limit);
  }

  async purgeAuditEvents(options: AuditEventPurgeOptions): Promise<number> {
    const tenantId = options.tenantId ?? "tenant_demo";
    const cutoff = Date.parse(options.before);
    const matches = this.auditEvents.filter((event) =>
      event.tenantId === tenantId &&
      !Number.isNaN(Date.parse(event.createdAt)) &&
      Date.parse(event.createdAt) < cutoff
    );

    if (!(options.dryRun ?? true)) {
      const matchIds = new Set(matches.map((event) => event.id));
      this.auditEvents.splice(0, this.auditEvents.length, ...this.auditEvents.filter((event) => !matchIds.has(event.id)));
    }

    return matches.length;
  }

  private groupIdsForUser(userId: string): string[] {
    return Array.from(this.groupMemberships.values())
      .filter((member) => member.userId === userId)
      .map((member) => member.groupId);
  }

  private revokeInMemoryRefreshTokensForSession(tenantId: string, loginSessionId: string, revokedAt: string): void {
    for (const [id, token] of this.loginSessionRefreshTokens.entries()) {
      if (token.tenantId === tenantId && token.loginSessionId === loginSessionId && token.revokedAt === null) {
        this.loginSessionRefreshTokens.set(id, {
          ...token,
          revokedAt
        });
      }
    }
  }
}

function isCreatedAtInWindow(createdAt: string, since?: number, until?: number): boolean {
  const value = Date.parse(createdAt);

  return !Number.isNaN(value) &&
    (since === undefined || value >= since) &&
    (until === undefined || value <= until);
}

/** Internal helper for permission writes in an existing asset transaction. */
export async function createPermissionGrantInTransaction(client: Queryable, input: PermissionGrantCreateInput): Promise<PermissionGrant> {
  const parsed = permissionGrantCreateInputSchema.parse(input);
  const asset = await client.query<{ id: string; stable_id: string }>(
    "SELECT id, stable_id FROM assets WHERE tenant_id = $1 AND stable_id = $2",
    [parsed.tenantId, parsed.stableId]
  );
  const assetRow = asset.rows[0];

  if (!assetRow) {
    throw new Error(`Asset not found: ${parsed.stableId}`);
  }

  const result = await client.query<PermissionGrantRow>(
    `
      INSERT INTO permission_grants (
        tenant_id,
        asset_id,
        principal_type,
        principal_id,
        action,
        surfaces,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, asset_id, principal_type, principal_id, action)
      DO UPDATE SET surfaces = EXCLUDED.surfaces, created_by = EXCLUDED.created_by
      RETURNING *
    `,
    [
      parsed.tenantId,
      assetRow.id,
      parsed.principalType,
      parsed.principalId,
      parsed.action,
      parsed.surfaces,
      parsed.createdBy ?? null
    ]
  );

  return mapPermissionGrantRow(requireRow(result), assetRow.stable_id);
}


// A null decision means that the caller must evaluate a current explicit grant.
// Single-asset and batched checks share these surface, tenant, role, and scope rules.
function accessBeforeGrant(input: AccessCheckInput): boolean | null {
  if (!input.asset.allowedSurfaces.includes(input.surface)) {
    return false;
  }
  if (input.principal && !input.principal.allowedSurfaces.includes(input.surface)) {
    return false;
  }
  if (hasPublicAssetAccess(input)) {
    return true;
  }
  if (!input.principal || input.principal.tenantId !== input.asset.tenantId) {
    return false;
  }
  if (!principalHasScope(input.principal, scopeForAction(input.action))) {
    return false;
  }
  return input.principal.role === "admin" ? true : null;
}

export function principalHasScope(principal: AuthPrincipal, scope: ApiKeyScope): boolean {
  return principal.scopes.includes("admin") || principal.scopes.includes(scope);
}

export function roleCanWriteAssets(principal: AuthPrincipal): boolean {
  return principal.role === "admin" || principal.role === "maintainer";
}

export function roleCanManagePermissions(principal: AuthPrincipal): boolean {
  return principal.role === "admin";
}

export function hashApiKeySecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

export function hashRefreshTokenSecret(secret: string): string {
  return `sha256:${createHash("sha256").update(secret).digest("hex")}`;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await derivePasswordKey(password, salt, 64)).toString("base64url");
  return `scrypt:${salt}:${derived}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [algorithm, salt, expected] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !expected) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "base64url");
  const actualBuffer = await derivePasswordKey(password, salt, expectedBuffer.length);

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function derivePasswordKey(password: string, salt: string, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function generateApiKeySecret(): string {
  return `fbase_${randomBytes(32).toString("base64url")}`;
}

function generateRefreshTokenSecret(): string {
  return `fbase_refresh_${randomBytes(32).toString("base64url")}`;
}

function previewSecret(secret: string): string {
  return `${secret.slice(0, 9)}...${secret.slice(-4)}`;
}

function normalizeExternalGroupIds(externalGroupIds: string[]): string[] {
  return Array.from(new Set(externalGroupIds.map((groupId) => groupId.trim()).filter(Boolean))).sort();
}

function externalGroupSlug(provider: ExternalAuthProvider, externalGroupId: string): string {
  const digest = createHash("sha256").update(`${provider}:${externalGroupId}`).digest("hex").slice(0, 16);
  return `external-${provider}-${digest}`;
}

function externalGroupName(externalGroupId: string): string {
  return `External group ${externalGroupId}`;
}

function scopeForAction(action: PermissionAction): ApiKeyScope {
  switch (action) {
    case "read":
      return "asset:read";
    case "write":
      return "asset:write";
    case "admin":
    case "export":
    case "execute":
      return "admin";
  }
}

function hasPublicAssetAccess(input: AccessCheckInput): boolean {
  return (input.action === "read" || (input.action === "export" && input.asset.allowedExports.length > 0)) &&
    input.asset.sensitivity === "public-demo" &&
    input.asset.lifecycleState === "active" &&
    input.asset.status === "approved" &&
    input.asset.allowedSurfaces.includes(input.surface);
}

async function ensureTenant(client: Queryable, tenantId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO tenants (id, slug, name)
      VALUES ($1, $1, $1)
      ON CONFLICT (id) DO NOTHING
    `,
    [tenantId]
  );
}

async function readServiceAccountPolicy(client: Queryable, tenantId: string): Promise<ServiceAccountPolicy> {
  const result = await client.query<ServiceAccountPolicyRow>(
    "SELECT * FROM service_account_policies WHERE tenant_id = $1",
    [tenantId]
  );
  const row = result.rows[0];

  return row ? mapServiceAccountPolicyRow(row) : defaultServiceAccountPolicy(tenantId);
}

function normalizeLoginSessionCreateInput(input: LoginSessionCreateInput): Required<LoginSessionCreateInput> {
  const tenantId = input.tenantId ?? "tenant_demo";
  const parsed = loginSessionRecordSchema.parse({
    id: "pending-login-session",
    tenantId,
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    source: input.source,
    deviceLabel: input.deviceLabel ?? null,
    clientUserAgent: input.clientUserAgent ?? null,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
    absoluteExpiresAt: input.absoluteExpiresAt ?? null,
    lastSeenAt: null,
    revokedAt: null
  });

  return {
    tenantId: parsed.tenantId,
    userId: parsed.userId,
    apiKeyId: parsed.apiKeyId,
    source: parsed.source,
    deviceLabel: parsed.deviceLabel,
    clientUserAgent: parsed.clientUserAgent,
    expiresAt: parsed.expiresAt,
    absoluteExpiresAt: parsed.absoluteExpiresAt
  };
}

function normalizeLoginSessionRefreshTokenCreateInput(
  input: LoginSessionRefreshTokenCreateInput
): Required<LoginSessionRefreshTokenCreateInput> {
  const normalizedExpiry = normalizeLoginSessionCreateInput({
    tenantId: input.tenantId,
    userId: "pending-refresh-user",
    apiKeyId: "pending-refresh-api-key",
    source: "password",
    expiresAt: input.expiresAt
  });

  return {
    tenantId: normalizedExpiry.tenantId,
    loginSessionId: input.loginSessionId,
    expiresAt: normalizedExpiry.expiresAt
  };
}

function requireRow<T extends QueryResultRow>(result: QueryResult<T>): T {
  const row = result.rows[0];

  if (!row) {
    throw new Error("Expected database row");
  }

  return row;
}

function mapUserRow(row: UserRow): LocalUser {
	  return localUserSchema.parse({
	    id: row.id,
	    tenantId: row.tenant_id,
	    email: row.email,
	    displayName: row.display_name,
	    role: row.role,
	    status: row.status,
	    authProvider: row.auth_provider,
	    externalProvider: row.external_provider,
	    externalSubject: row.external_subject,
	    externalIssuer: row.external_issuer,
	    createdAt: toIso(row.created_at),
	    updatedAt: toIso(row.updated_at)
	  });
}

function mapApiKeyRow(row: ApiKeyRow) {
  return apiKeyRecordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    serviceAccountId: row.service_account_id,
    name: row.name,
    secretPreview: row.secret_preview,
    scopes: row.scopes,
    allowedSurfaces: row.allowed_surfaces,
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null,
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    createdAt: toIso(row.created_at)
  });
}

function mapLoginSessionRow(row: LoginSessionRow): LoginSessionRecord {
  return loginSessionRecordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    apiKeyId: row.api_key_id,
    source: row.source,
    deviceLabel: row.device_label,
    clientUserAgent: row.client_user_agent,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    absoluteExpiresAt: row.absolute_expires_at ? toIso(row.absolute_expires_at) : null,
    lastSeenAt: row.last_seen_at ? toIso(row.last_seen_at) : null,
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null
  });
}

function mapServiceAccountRow(row: ServiceAccountRow): ServiceAccount {
  return serviceAccountSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    role: row.role,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  });
}

function mapServiceAccountPolicyRow(row: ServiceAccountPolicyRow): ServiceAccountPolicy {
  return serviceAccountPolicySchema.parse({
    tenantId: row.tenant_id,
    maxServiceAccounts: row.max_service_accounts,
    maxActiveApiKeysPerServiceAccount: row.max_active_api_keys_per_service_account,
    defaultApiKeyExpiresInDays: row.default_api_key_expires_in_days,
    source: "stored",
    updatedByUserId: row.updated_by_user_id,
    updatedByServiceAccountId: row.updated_by_service_account_id,
    updatedByApiKeyId: row.updated_by_api_key_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  });
}

function defaultServiceAccountPolicy(tenantId: string): ServiceAccountPolicy {
  return serviceAccountPolicySchema.parse({
    tenantId,
    ...DEFAULT_SERVICE_ACCOUNT_POLICY,
    source: "default",
    updatedByUserId: null,
    updatedByServiceAccountId: null,
    updatedByApiKeyId: null,
    createdAt: null,
    updatedAt: null
  });
}

function apiKeyExpiryFromDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeApiKeyRotationReportInput(input: ApiKeyRotationReportRepositoryInput = {}) {
  const parsed = apiKeyRotationReportInputSchema.parse(input);
  const options = normalizeApiKeyRotationReportOptions(parsed);

  return {
    tenantId: parsed.tenantId,
    asOf: options.asOf,
    dueBefore: options.dueBefore,
    dueWithinDays: options.dueWithinDays,
    includeUserKeys: options.includeUserKeys,
    includeRevoked: options.includeRevoked,
    limit: options.limit
  };
}

function normalizeApiKeyRotationReportOptions(input: ApiKeyRotationReportsRepositoryInput = {}) {
  const { tenantIds, ...rest } = input;
  const parsed = apiKeyRotationReportInputSchema.parse({
    tenantId: "tenant_demo",
    ...rest
  });
  const dueWithinDays = parsed.dueWithinDays;
  const asOf = new Date(parsed.asOf ?? new Date().toISOString()).toISOString();
  const dueBefore = new Date(Date.parse(asOf) + dueWithinDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    asOf,
    dueBefore,
    dueWithinDays,
    includeUserKeys: parsed.includeUserKeys,
    includeRevoked: parsed.includeRevoked,
    limit: parsed.limit,
    tenantIds: tenantIds?.filter((tenantId) => tenantId.length > 0)
  };
}

function buildApiKeyRotationReminder(apiKey: ApiKeyRecord, asOf: string): ApiKeyRotationReminder | null {
  const ownerType = apiKey.serviceAccountId ? "service-account" : "user";

  if (!apiKey.expiresAt) {
    return {
      apiKey,
      ownerType,
      rotationState: "missing-expiry",
      daysUntilExpiry: null,
      reason: ownerType === "service-account"
        ? "service_account_key_missing_expiry"
        : "api_key_missing_expiry"
    };
  }

  const daysUntilExpiry = Math.ceil((Date.parse(apiKey.expiresAt) - Date.parse(asOf)) / (24 * 60 * 60 * 1000));

  return {
    apiKey,
    ownerType,
    rotationState: daysUntilExpiry <= 0 ? "expired" : "due-soon",
    daysUntilExpiry,
    reason: daysUntilExpiry <= 0 ? "api_key_expired" : "api_key_expires_within_window"
  };
}

function mapGroupRow(row: GroupRow): GroupRecord {
  return groupRecordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
	    slug: row.slug,
	    name: row.name,
	    description: row.description,
	    externalProvider: row.external_provider,
	    externalId: row.external_id,
	    createdAt: toIso(row.created_at),
	    updatedAt: toIso(row.updated_at)
	  });
}

function mapGroupMembershipRow(row: GroupMembershipRow): GroupMembership {
  return groupMembershipSchema.parse({
    groupId: row.group_id,
    userId: row.user_id,
	    userEmail: row.user_email,
	    userDisplayName: row.user_display_name,
	    userRole: row.user_role,
	    source: row.source,
	    externalProvider: row.external_provider,
	    createdAt: toIso(row.created_at)
	  });
	}

function mapPermissionGrantRow(row: PermissionGrantRow, stableId: string): PermissionGrant {
  return permissionGrantSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    assetId: row.asset_id,
    stableId,
    principalType: row.principal_type,
    principalId: row.principal_id,
    action: row.action,
    surfaces: row.surfaces,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at)
  });
}

function mapAuditEventRow(row: AuditEventRow): AuditEvent {
  return auditEventSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorServiceAccountId: row.actor_service_account_id,
    actorApiKeyId: row.actor_api_key_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    outcome: row.outcome,
    reason: row.reason,
    metadata: row.metadata,
    createdAt: toIso(row.created_at)
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function minIso(left: string, right: string): string {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

interface ApiKeyMemoryRecord {
  apiKey: ApiKeyRecord;
  secretHash: string;
}

interface LoginSessionRefreshTokenMemoryRecord {
  id: string;
  tenantId: string;
  loginSessionId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  rotatedToId: string | null;
}

interface UserRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
	  role: string;
	  status: string;
	  auth_provider: UserAuthProvider;
	  external_provider: ExternalAuthProvider | null;
	  external_subject: string | null;
	  external_issuer: string | null;
	  password_hash: string | null;
	  created_at: Date | string;
	  updated_at: Date | string;
}

interface ApiKeyRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  service_account_id: string | null;
  name: string;
  secret_hash: string;
  secret_preview: string;
  scopes: string[];
  allowed_surfaces: Surface[];
  expires_at: Date | string | null;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
}

interface LoginSessionRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  user_id: string;
  api_key_id: string;
  source: LoginSessionSource;
  device_label: string | null;
  client_user_agent: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  absolute_expires_at: Date | string | null;
  last_seen_at: Date | string | null;
  revoked_at: Date | string | null;
}

interface LoginSessionRefreshTokenRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  login_session_id: string;
  token_hash: string;
  created_at: Date | string;
  expires_at: Date | string;
  used_at: Date | string | null;
  revoked_at: Date | string | null;
  rotated_to_id: string | null;
}

interface LoginSessionRefreshJoinRow extends QueryResultRow {
  refresh_token_id: string;
  session_id: string;
  tenant_id: string;
  user_id: string;
  old_api_key_id: string;
  source: LoginSessionSource;
  session_absolute_expires_at: Date | string | null;
  old_api_key_name: string;
  old_api_key_scopes: string[];
  old_api_key_allowed_surfaces: Surface[];
  session_created_at: Date | string;
  session_expires_at: Date | string;
  session_last_seen_at: Date | string | null;
  session_revoked_at: Date | string | null;
}

interface ServiceAccountRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  role: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ServiceAccountPolicyRow extends QueryResultRow {
  tenant_id: string;
  max_service_accounts: number | null;
  max_active_api_keys_per_service_account: number | null;
  default_api_key_expires_in_days: number | null;
  updated_by_user_id: string | null;
  updated_by_service_account_id: string | null;
  updated_by_api_key_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface GroupRow extends QueryResultRow {
  id: string;
  tenant_id: string;
	  slug: string;
	  name: string;
	  description: string | null;
	  external_provider: ExternalAuthProvider | null;
	  external_id: string | null;
	  created_at: Date | string;
	  updated_at: Date | string;
	}

interface GroupMembershipRow extends QueryResultRow {
  group_id: string;
  user_id: string;
	  user_email: string;
	  user_display_name: string;
	  user_role: string;
	  source: "local" | "external";
	  external_provider: ExternalAuthProvider | null;
	  created_at: Date | string;
	}

interface AuthKeyRow extends ApiKeyRow {
  user_email: string | null;
  user_display_name: string | null;
  user_role: string | null;
  user_status: string | null;
  service_account_name: string | null;
  service_account_role: string | null;
  service_account_status: string | null;
}

interface PermissionGrantRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  asset_id: string;
  principal_type: string;
  principal_id: string;
  action: string;
  surfaces: string[];
  created_by: string | null;
  created_at: Date | string;
}

interface AuditEventRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_service_account_id: string | null;
  actor_api_key_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  outcome: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
}
