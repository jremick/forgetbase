import {
  agentActionDecisionInputSchema,
  agentActionExecuteInputSchema,
  agentActionExecutionPolicyInputSchema,
  agentActionExecutionPolicySchema,
  agentActionRequestListResponseSchema,
  agentActionRequestSchema,
  apiKeyCreateInputSchema,
  apiKeyCreatedSchema,
  apiKeyListResponseSchema,
  apiKeyRotationReportInputSchema,
  apiKeyRotationReportSchema,
  apiKeyRotateInputSchema,
  apiKeyRotateResponseSchema,
  apiKeyRevokeResponseSchema,
  auditEventListResponseSchema,
  aiExportPackageSchema,
  aiExportFormatSchema,
  assetCreateInputSchema,
  assetDetailSchema,
  assetListResponseSchema,
  assetPublishInputSchema,
  assetReviewInputSchema,
  assetReviewQueueInputSchema,
  assetReviewQueueResponseSchema,
  assetRestoreInputSchema,
  assetUpdateInputSchema,
  assetValidationInputSchema,
  assetValidationReportSchema,
  assetVersionSnapshotInputSchema,
  assetVersionSnapshotSchema,
  authProviderConfigInputSchema,
  authProviderConfigListResponseSchema,
  authProviderConfigSchema,
  authBootstrapInputSchema,
  authLoginInputSchema,
  authLoginResponseSchema,
  authOidcAuthorizeInputSchema,
  authOidcAuthorizeResponseSchema,
  authOidcCallbackInputSchema,
  authOidcLoginResponseSchema,
  authPrincipalSchema,
  groupCreateInputSchema,
  groupListResponseSchema,
  groupMembershipInputSchema,
  groupMembershipListResponseSchema,
  groupMembershipSchema,
  groupRecordSchema,
  loginSessionListResponseSchema,
  loginSessionRevokeResponseSchema,
  localUserCreateInputSchema,
  localUserListResponseSchema,
  localUserSchema,
  localUserUpdateInputSchema,
  managedQueryCacheEntrySchema,
  managedQueryCacheListResponseSchema,
  managedQueryCachePolicyInputSchema,
  managedQueryCachePolicySchema,
  managedQueryCachePurgeInputSchema,
  managedQueryCachePurgeResultSchema,
  managedQueryRetentionPolicyInputSchema,
  managedQueryRetentionPolicySchema,
  managedQueryFeedbackInputSchema,
  managedQueryFeedbackListResponseSchema,
  managedQueryFeedbackSchema,
  managedQueryEvalAnalyticsInputSchema,
  managedQueryEvalAnalyticsSummarySchema,
  managedQueryEvalInputSchema,
  managedQueryEvalReportSchema,
  managedQueryEvalRunListResponseSchema,
  managedQueryEvalSchedulePolicyInputSchema,
  managedQueryEvalSchedulePolicySchema,
  managedQueryInputSchema,
  managedQueryPolicyInputSchema,
  managedQueryPolicySchema,
  managedQueryResponseSchema,
  modelProviderConfigInputSchema,
  modelProviderConfigListResponseSchema,
  modelProviderConfigSchema,
  modelProviderHealthListResponseSchema,
  permissionGrantCreateInputSchema,
  permissionGrantSchema,
  piiRedactionPolicyInputSchema,
  piiRedactionPolicySchema,
  retrievalRankingPolicyInputSchema,
  retrievalRankingPolicySchema,
  searchInputSchema,
  searchResponseSchema,
  secretReferencePolicyInputSchema,
  secretReferencePolicySchema,
  serviceAccountCreateInputSchema,
  serviceAccountListResponseSchema,
  serviceAccountPolicyInputSchema,
  serviceAccountPolicySchema,
  serviceAccountSchema,
  serviceAccountUpdateInputSchema,
  telemetryAnalyticsInputSchema,
  telemetryAnalyticsSummarySchema,
  telemetryRetentionPolicyInputSchema,
  telemetryRetentionPolicySchema,
  telemetryRetentionPurgeInputSchema,
  telemetryRetentionPurgeResultSchema,
  healthResponseSchema,
  okfExportPackageSchema,
  okfVersionSchema,
  type AgentActionDecisionInput,
  type AgentActionExecuteInput,
  type AgentActionExecutionPolicy,
  type AgentActionExecutionPolicyInput,
  type AgentActionRequest,
  type ApiKeyCreated,
  type ApiKeyCreateInput,
  type ApiKeyRecord,
  type ApiKeyRotationReport,
  type ApiKeyRotationReportInput,
  type ApiKeyRotateInput,
  type ApiKeyRotateResponse,
  type AuditEvent,
  type AiExportFormat,
  type AiExportPackage,
  type AssetCreateInput,
  type AssetDetail,
  type AssetPublishInput,
  type AssetReviewInput,
  type AssetReviewQueueInput,
  type AssetReviewQueueResponse,
  type AssetRecord,
  type AssetRestoreInput,
  type AssetUpdateInput,
  type AssetValidationInput,
  type AssetValidationReport,
  type AssetVersionSnapshot,
  type AssetVersionSnapshotInput,
  type AuthBootstrapInput,
  type AuthLoginInput,
  type AuthLoginResponse,
  type AuthOidcAuthorizeInput,
  type AuthOidcAuthorizeResponse,
  type AuthOidcCallbackInput,
  type AuthOidcLoginResponse,
  type AuthPrincipal,
  type AuthProviderConfig,
  type AuthProviderConfigInput,
  type ExternalAuthProvider,
  type GroupCreateInput,
  type GroupMembership,
  type GroupMembershipInput,
  type GroupRecord,
  type HealthResponse,
  type LoginSessionRecord,
  type LoginSessionRevokeResponse,
  type LocalUser,
  type LocalUserCreateInput,
  type LocalUserUpdateInput,
  type ManagedQueryCacheEntry,
  type ManagedQueryCachePolicy,
  type ManagedQueryCachePolicyInput,
  type ManagedQueryCachePurgeInput,
  type ManagedQueryCachePurgeResult,
  type ManagedQueryPolicy,
  type ManagedQueryPolicyInput,
  type ManagedQueryRetentionPolicy,
  type ManagedQueryRetentionPolicyInput,
  type ManagedQueryFeedback,
  type ManagedQueryFeedbackInput,
  type ManagedQueryEvalAnalyticsInput,
  type ManagedQueryEvalAnalyticsSummary,
  type ManagedQueryEvalInput,
  type ManagedQueryEvalReport,
  type ManagedQueryEvalRun,
  type ManagedQueryEvalSchedulePolicy,
  type ManagedQueryEvalSchedulePolicyInput,
  type ManagedQueryInput,
  type ManagedQueryResponse,
  type ModelProvider,
  type ModelProviderConfig,
  type ModelProviderConfigInput,
  type ModelProviderHealth,
  type OkfExportPackage,
  type OkfVersion,
  type PermissionGrant,
  type PermissionGrantCreateInput,
  type PiiRedactionPolicy,
  type PiiRedactionPolicyInput,
  type RetrievalRankingPolicy,
  type RetrievalRankingPolicyInput,
  type SearchInput,
  type SearchResponse,
  type SecretReferencePolicy,
  type SecretReferencePolicyInput,
  type ServiceAccount,
  type ServiceAccountCreateInput,
  type ServiceAccountPolicy,
  type ServiceAccountPolicyInput,
  type ServiceAccountUpdateInput,
  type Surface,
  type TelemetryAnalyticsSummary,
  type TelemetryRetentionPolicy,
  type TelemetryRetentionPolicyInput,
  type TelemetryRetentionPurgeInput,
  type TelemetryRetentionPurgeResult
} from "@forgetbase/schema";

export interface ForgetBaseClientOptions {
  baseUrl: string;
  apiKey?: string;
  surface?: Surface;
  fetchImpl?: typeof fetch;
}

const MAX_ERROR_BODY_BYTES = 4_096;
const MAX_ERROR_METADATA_LENGTH = 256;
const SAFE_ERROR_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

interface ForgetBaseHttpErrorOptions {
  statusText: string | null;
  code: string | null;
  responseBody: string | null;
  responseBodyTruncated: boolean;
  responseContentType: string | null;
  responseRequestId: string | null;
}

/** A bounded, structured representation of a non-successful ForgetBase HTTP response. */
export class ForgetBaseHttpError extends Error {
  readonly status: number;
  readonly statusText: string | null;
  readonly code: string | null;
  readonly responseBody: string | null;
  readonly responseBodyTruncated: boolean;
  readonly responseContentType: string | null;
  readonly responseRequestId: string | null;

  constructor(status: number, options: ForgetBaseHttpErrorOptions) {
    super(`ForgetBase request failed with HTTP ${status}${options.code ? ` (${options.code})` : ""}`);
    this.name = "ForgetBaseHttpError";
    this.status = status;
    this.statusText = options.statusText;
    this.code = options.code;
    this.responseBody = options.responseBody;
    this.responseBodyTruncated = options.responseBodyTruncated;
    this.responseContentType = options.responseContentType;
    this.responseRequestId = options.responseRequestId;
  }
}

export interface ExportAiPackageOptions {
  format?: AiExportFormat;
  okfVersion?: OkfVersion;
}

export class ForgetBaseClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly surface: Surface;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ForgetBaseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.surface = options.surface ?? "api";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health(): Promise<HealthResponse> {
    return this.request("/health", healthResponseSchema);
  }

  async listAssets(): Promise<AssetRecord[]> {
    const response = await this.request("/assets", assetListResponseSchema);
    return response.assets;
  }

  async listAssetsNeedingReview(input: AssetReviewQueueInput = {}): Promise<AssetReviewQueueResponse> {
    const parsed = assetReviewQueueInputSchema.parse(input);
    const params = new URLSearchParams();

    if (parsed.asOf) {
      params.set("asOf", parsed.asOf);
    }

    params.set("includeApproved", String(parsed.includeApproved));
    params.set("limit", String(parsed.limit));

    return this.request(`/assets/review-queue?${params.toString()}`, assetReviewQueueResponseSchema);
  }

  async getAsset(stableId: string): Promise<AssetDetail | null> {
    try {
      return await this.request(`/assets/${encodeURIComponent(stableId)}`, assetDetailSchema);
    } catch (error) {
      if (error instanceof ForgetBaseHttpError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async createAsset(input: AssetCreateInput): Promise<AssetDetail> {
    return this.request("/assets", assetDetailSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(assetCreateInputSchema.parse(input))
    });
  }

  async updateAsset(stableId: string, input: AssetUpdateInput): Promise<AssetDetail> {
    return this.request(`/assets/${encodeURIComponent(stableId)}/versions`, assetDetailSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(assetUpdateInputSchema.parse(input))
    });
  }

  async restoreAssetVersion(stableId: string, input: AssetRestoreInput): Promise<AssetDetail> {
    return this.request(`/assets/${encodeURIComponent(stableId)}/restore`, assetDetailSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(assetRestoreInputSchema.parse(input))
    });
  }

  async publishAsset(stableId: string, input: AssetPublishInput = {}): Promise<AssetDetail> {
    return this.request(`/assets/${encodeURIComponent(stableId)}/publish`, assetDetailSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(assetPublishInputSchema.parse(input))
    });
  }

  async reviewAsset(stableId: string, input: AssetReviewInput): Promise<AssetDetail> {
    return this.request(`/assets/${encodeURIComponent(stableId)}/review`, assetDetailSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(assetReviewInputSchema.parse(input))
    });
  }

  async getAssetVersionSnapshot(stableId: string, input: AssetVersionSnapshotInput): Promise<AssetVersionSnapshot> {
    const parsed = assetVersionSnapshotInputSchema.parse(input);
    const path = parsed.versionNumber
      ? `/assets/${encodeURIComponent(stableId)}/versions/${parsed.versionNumber}`
      : `/assets/${encodeURIComponent(stableId)}/versions/by-id/${encodeURIComponent(parsed.versionId ?? "")}`;
    return this.request(path, assetVersionSnapshotSchema);
  }

  async validateAssets(input: AssetValidationInput): Promise<AssetValidationReport> {
    return this.request("/validation/assets", assetValidationReportSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(assetValidationInputSchema.parse(input))
    });
  }

  async bootstrapAuth(input: AuthBootstrapInput): Promise<{ user: LocalUser } & ApiKeyCreated> {
    return this.request("/auth/bootstrap", apiKeyCreatedSchema.extend({ user: localUserSchema }), {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(authBootstrapInputSchema.parse(input))
    });
  }

  async login(input: AuthLoginInput): Promise<AuthLoginResponse> {
    return this.request("/auth/login", authLoginResponseSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(authLoginInputSchema.parse(input))
    });
  }

  async startOidcLogin(input: AuthOidcAuthorizeInput): Promise<AuthOidcAuthorizeResponse> {
    return this.request("/auth/oidc/authorize", authOidcAuthorizeResponseSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(authOidcAuthorizeInputSchema.parse(input))
    });
  }

  async completeOidcLogin(input: AuthOidcCallbackInput): Promise<AuthOidcLoginResponse> {
    return this.request("/auth/oidc/callback", authOidcLoginResponseSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(authOidcCallbackInputSchema.parse(input))
    });
  }

  async me(): Promise<AuthPrincipal> {
    return this.request("/auth/me", authPrincipalSchema);
  }

  async logout(): Promise<ApiKeyRecord> {
    const response = await this.request("/auth/logout", apiKeyRevokeResponseSchema, {
      method: "POST"
    });
    return response.apiKey;
  }

  async listLoginSessions(input: {
    userId?: string;
    includeRevoked?: boolean;
    limit?: number;
  } = {}): Promise<LoginSessionRecord[]> {
    const params = new URLSearchParams();

    if (input.userId) {
      params.set("userId", input.userId);
    }

    if (input.includeRevoked !== undefined) {
      params.set("includeRevoked", String(input.includeRevoked));
    }

    if (input.limit !== undefined) {
      params.set("limit", String(input.limit));
    }

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await this.request(`/auth/sessions${suffix}`, loginSessionListResponseSchema);
    return response.sessions;
  }

  async revokeLoginSession(sessionId: string): Promise<LoginSessionRevokeResponse> {
    return this.request(`/auth/sessions/${encodeURIComponent(sessionId)}`, loginSessionRevokeResponseSchema, {
      method: "DELETE"
    });
  }

  async createUser(input: LocalUserCreateInput): Promise<LocalUser> {
    return this.request("/auth/users", localUserSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(localUserCreateInputSchema.parse(input))
    });
  }

  async listUsers(limit?: number): Promise<LocalUser[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(`/auth/users${params}`, localUserListResponseSchema);
    return response.users;
  }

  async updateUser(input: LocalUserUpdateInput): Promise<LocalUser> {
    const parsed = localUserUpdateInputSchema.parse(input);
    const body = {
      displayName: parsed.displayName,
      role: parsed.role,
      status: parsed.status,
      password: parsed.password
    };
    return this.request(`/auth/users/${encodeURIComponent(parsed.userId)}`, localUserSchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body)
    });
  }

  async createServiceAccount(input: ServiceAccountCreateInput): Promise<ServiceAccount> {
    return this.request("/auth/service-accounts", serviceAccountSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(serviceAccountCreateInputSchema.parse(input))
    });
  }

  async listServiceAccounts(limit?: number): Promise<ServiceAccount[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(`/auth/service-accounts${params}`, serviceAccountListResponseSchema);
    return response.serviceAccounts;
  }

  async updateServiceAccount(input: ServiceAccountUpdateInput): Promise<ServiceAccount> {
    const parsed = serviceAccountUpdateInputSchema.parse(input);
    const body = {
      name: parsed.name,
      description: parsed.description,
      role: parsed.role,
      status: parsed.status
    };
    return this.request(`/auth/service-accounts/${encodeURIComponent(parsed.serviceAccountId)}`, serviceAccountSchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body)
    });
  }

  async getServiceAccountPolicy(): Promise<ServiceAccountPolicy> {
    return this.request("/admin/service-account-policy", serviceAccountPolicySchema);
  }

  async updateServiceAccountPolicy(input: ServiceAccountPolicyInput): Promise<ServiceAccountPolicy> {
    const parsed = serviceAccountPolicyInputSchema.parse(input);
    return this.request("/admin/service-account-policy", serviceAccountPolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(parsed)
    });
  }

  async createGroup(input: GroupCreateInput): Promise<GroupRecord> {
    return this.request("/auth/groups", groupRecordSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(groupCreateInputSchema.parse(input))
    });
  }

  async listGroups(limit?: number): Promise<GroupRecord[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(`/auth/groups${params}`, groupListResponseSchema);
    return response.groups;
  }

  async deleteGroup(groupId: string): Promise<GroupRecord> {
    return this.request(`/auth/groups/${encodeURIComponent(groupId)}`, groupRecordSchema, {
      method: "DELETE"
    });
  }

  async addGroupMember(input: GroupMembershipInput): Promise<GroupMembership> {
    const parsed = groupMembershipInputSchema.parse(input);
    return this.request(`/auth/groups/${encodeURIComponent(parsed.groupId)}/members`, groupMembershipSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(parsed)
    });
  }

  async listGroupMembers(groupId: string, limit?: number): Promise<GroupMembership[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(
      `/auth/groups/${encodeURIComponent(groupId)}/members${params}`,
      groupMembershipListResponseSchema
    );
    return response.members;
  }

  async removeGroupMember(groupId: string, userId: string): Promise<GroupMembership> {
    return this.request(
      `/auth/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      groupMembershipSchema,
      {
        method: "DELETE"
      }
    );
  }

  async createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreated> {
    return this.request("/auth/api-keys", apiKeyCreatedSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(apiKeyCreateInputSchema.parse(input))
    });
  }

  async listApiKeys(limit?: number): Promise<ApiKeyRecord[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(`/auth/api-keys${params}`, apiKeyListResponseSchema);
    return response.apiKeys;
  }

  async getApiKeyRotationReport(input: ApiKeyRotationReportInput = {}): Promise<ApiKeyRotationReport> {
    const parsed = apiKeyRotationReportInputSchema.parse(input);
    const params = new URLSearchParams({
      dueWithinDays: String(parsed.dueWithinDays),
      includeUserKeys: String(parsed.includeUserKeys),
      includeRevoked: String(parsed.includeRevoked),
      limit: String(parsed.limit)
    });

    if (parsed.asOf) {
      params.set("asOf", parsed.asOf);
    }

    return this.request(`/auth/api-keys/rotation-due?${params.toString()}`, apiKeyRotationReportSchema);
  }

  async revokeApiKey(apiKeyId: string): Promise<ApiKeyRecord> {
    const response = await this.request(
      `/auth/api-keys/${encodeURIComponent(apiKeyId)}/revoke`,
      apiKeyRevokeResponseSchema,
      {
        method: "POST"
      }
    );
    return response.apiKey;
  }

  async rotateApiKey(apiKeyId: string, input: ApiKeyRotateInput = {}): Promise<ApiKeyRotateResponse> {
    const parsed = apiKeyRotateInputSchema.parse(input);
    return this.request(`/auth/api-keys/${encodeURIComponent(apiKeyId)}/rotate`, apiKeyRotateResponseSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(parsed)
    });
  }

  async listAuditEvents(limit?: number): Promise<AuditEvent[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(`/audit/events${params}`, auditEventListResponseSchema);
    return response.events;
  }

  async grantAssetPermission(input: PermissionGrantCreateInput): Promise<PermissionGrant> {
    const parsed = permissionGrantCreateInputSchema.parse(input);
    return this.request(`/assets/${encodeURIComponent(parsed.stableId)}/grants`, permissionGrantSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(parsed)
    });
  }

  async search(input: SearchInput): Promise<SearchResponse> {
    const parsed = searchInputSchema.parse(input);
    const params = new URLSearchParams({
      query: parsed.query,
      limit: String(parsed.limit),
      strategy: parsed.strategy
    });

    return this.request(`/search?${params.toString()}`, searchResponseSchema);
  }

  async managedQuery(input: ManagedQueryInput): Promise<ManagedQueryResponse> {
    return this.request("/agent/query", managedQueryResponseSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryInputSchema.parse(input))
    });
  }

  async submitManagedQueryFeedback(input: ManagedQueryFeedbackInput): Promise<ManagedQueryFeedback> {
    return this.request("/agent/query/feedback", managedQueryFeedbackSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryFeedbackInputSchema.parse(input))
    });
  }

  async listManagedQueryFeedback(limit?: number): Promise<ManagedQueryFeedback[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(`/agent/query/feedback${params}`, managedQueryFeedbackListResponseSchema);
    return response.feedback;
  }

  async listManagedQueryCacheEntries(limit?: number): Promise<ManagedQueryCacheEntry[]> {
    const params = limit ? `?${new URLSearchParams({ limit: String(limit) }).toString()}` : "";
    const response = await this.request(`/admin/managed-query-cache${params}`, managedQueryCacheListResponseSchema);
    return response.entries;
  }

  async getManagedQueryPolicy(): Promise<ManagedQueryPolicy> {
    return this.request("/admin/managed-query-policy", managedQueryPolicySchema);
  }

  async updateManagedQueryPolicy(
    input: Omit<ManagedQueryPolicyInput, "tenantId">
  ): Promise<ManagedQueryPolicy> {
    return this.request("/admin/managed-query-policy", managedQueryPolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryPolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async getManagedQueryCachePolicy(): Promise<ManagedQueryCachePolicy> {
    return this.request("/admin/managed-query-cache/policy", managedQueryCachePolicySchema);
  }

  async updateManagedQueryCachePolicy(
    input: Omit<ManagedQueryCachePolicyInput, "tenantId">
  ): Promise<ManagedQueryCachePolicy> {
    return this.request("/admin/managed-query-cache/policy", managedQueryCachePolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryCachePolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async deleteManagedQueryCacheEntry(cacheKey: string): Promise<ManagedQueryCacheEntry> {
    return this.request(`/admin/managed-query-cache/${encodeURIComponent(cacheKey)}`, managedQueryCacheEntrySchema, {
      method: "DELETE"
    });
  }

  async purgeManagedQueryCache(
    input: Omit<ManagedQueryCachePurgeInput, "tenantId"> = {}
  ): Promise<ManagedQueryCachePurgeResult> {
    return this.request("/admin/managed-query-cache/purge", managedQueryCachePurgeResultSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryCachePurgeInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async getManagedQueryRetentionPolicy(): Promise<ManagedQueryRetentionPolicy> {
    return this.request("/admin/managed-query-retention/policy", managedQueryRetentionPolicySchema);
  }

  async updateManagedQueryRetentionPolicy(
    input: Omit<ManagedQueryRetentionPolicyInput, "tenantId">
  ): Promise<ManagedQueryRetentionPolicy> {
    return this.request("/admin/managed-query-retention/policy", managedQueryRetentionPolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryRetentionPolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async getSecretReferencePolicy(): Promise<SecretReferencePolicy> {
    return this.request("/admin/secret-reference-policy", secretReferencePolicySchema);
  }

  async updateSecretReferencePolicy(
    input: Omit<SecretReferencePolicyInput, "tenantId">
  ): Promise<SecretReferencePolicy> {
    return this.request("/admin/secret-reference-policy", secretReferencePolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(secretReferencePolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async getPiiRedactionPolicy(): Promise<PiiRedactionPolicy> {
    return this.request("/admin/pii-redaction-policy", piiRedactionPolicySchema);
  }

  async updatePiiRedactionPolicy(
    input: Omit<PiiRedactionPolicyInput, "tenantId">
  ): Promise<PiiRedactionPolicy> {
    return this.request("/admin/pii-redaction-policy", piiRedactionPolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(piiRedactionPolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async getRetrievalRankingPolicy(): Promise<RetrievalRankingPolicy> {
    return this.request("/admin/retrieval-ranking-policy", retrievalRankingPolicySchema);
  }

  async updateRetrievalRankingPolicy(
    input: Omit<RetrievalRankingPolicyInput, "tenantId">
  ): Promise<RetrievalRankingPolicy> {
    return this.request("/admin/retrieval-ranking-policy", retrievalRankingPolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(retrievalRankingPolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async telemetrySummary(input: { since?: string; until?: string; limit?: number } = {}): Promise<TelemetryAnalyticsSummary> {
    const parsed = telemetryAnalyticsInputSchema.parse({ ...input, tenantId: "tenant_demo" });
    const params = new URLSearchParams({
      limit: String(parsed.limit)
    });

    if (parsed.since) {
      params.set("since", parsed.since);
    }

    if (parsed.until) {
      params.set("until", parsed.until);
    }

    return this.request(`/telemetry/summary?${params.toString()}`, telemetryAnalyticsSummarySchema);
  }

  async getTelemetryRetentionPolicy(): Promise<TelemetryRetentionPolicy> {
    return this.request("/admin/telemetry-retention", telemetryRetentionPolicySchema);
  }

  async updateTelemetryRetentionPolicy(
    input: Omit<TelemetryRetentionPolicyInput, "tenantId">
  ): Promise<TelemetryRetentionPolicy> {
    return this.request("/admin/telemetry-retention", telemetryRetentionPolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(telemetryRetentionPolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async purgeTelemetryRetention(
    input: Omit<TelemetryRetentionPurgeInput, "tenantId"> = {}
  ): Promise<TelemetryRetentionPurgeResult> {
    return this.request("/admin/telemetry-retention/purge", telemetryRetentionPurgeResultSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(telemetryRetentionPurgeInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async runManagedQueryEval(input: ManagedQueryEvalInput): Promise<ManagedQueryEvalReport> {
    return this.request("/agent/evals/run", managedQueryEvalReportSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryEvalInputSchema.parse(input))
    });
  }

  async listManagedQueryEvalRuns(limit?: number): Promise<ManagedQueryEvalRun[]> {
    const searchParams = new URLSearchParams();

    if (limit !== undefined) {
      searchParams.set("limit", String(limit));
    }

    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const response = await this.request(`/agent/evals/runs${suffix}`, managedQueryEvalRunListResponseSchema);
    return response.runs;
  }

	  async managedQueryEvalSummary(input: ManagedQueryEvalAnalyticsInput = {}): Promise<ManagedQueryEvalAnalyticsSummary> {
    const parsed = managedQueryEvalAnalyticsInputSchema.parse(input);
    const searchParams = new URLSearchParams();

    if (parsed.since) {
      searchParams.set("since", parsed.since);
    }

    if (parsed.until) {
      searchParams.set("until", parsed.until);
    }

    searchParams.set("limit", String(parsed.limit));

    return this.request(
      `/agent/evals/summary?${searchParams.toString()}`,
      managedQueryEvalAnalyticsSummarySchema
    );
	  }

  async getManagedQueryEvalSchedulePolicy(): Promise<ManagedQueryEvalSchedulePolicy> {
    return this.request("/admin/managed-query-eval-schedule-policy", managedQueryEvalSchedulePolicySchema);
  }

  async updateManagedQueryEvalSchedulePolicy(
    input: Omit<ManagedQueryEvalSchedulePolicyInput, "tenantId">
  ): Promise<ManagedQueryEvalSchedulePolicy> {
    return this.request("/admin/managed-query-eval-schedule-policy", managedQueryEvalSchedulePolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(managedQueryEvalSchedulePolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async getActionExecutionPolicy(): Promise<AgentActionExecutionPolicy> {
    return this.request("/admin/action-execution-policy", agentActionExecutionPolicySchema);
  }

  async updateActionExecutionPolicy(
    input: Omit<AgentActionExecutionPolicyInput, "tenantId">
  ): Promise<AgentActionExecutionPolicy> {
    return this.request("/admin/action-execution-policy", agentActionExecutionPolicySchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(agentActionExecutionPolicyInputSchema.parse({ ...input, tenantId: "tenant_demo" }))
    });
  }

  async listAgentActions(limit?: number): Promise<AgentActionRequest[]> {
    const params = new URLSearchParams();

    if (limit !== undefined) {
      params.set("limit", String(limit));
    }

    const response = await this.request(
      `/agent/actions${params.size ? `?${params.toString()}` : ""}`,
      agentActionRequestListResponseSchema
    );

    return response.actions;
  }

  async executeAgentAction(input: AgentActionExecuteInput): Promise<AgentActionRequest> {
    return this.request("/agent/actions/execute", agentActionRequestSchema, {
      method: "POST",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(agentActionExecuteInputSchema.parse(input))
    });
  }

  async decideAgentAction(input: AgentActionDecisionInput): Promise<AgentActionRequest> {
    const parsed = agentActionDecisionInputSchema.parse(input);

    return this.request(
      `/agent/actions/${encodeURIComponent(parsed.actionRequestId)}/decision`,
      agentActionRequestSchema,
      {
        method: "POST",
        headers: this.authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(parsed)
      }
    );
  }

  async listModelProviderConfigs(): Promise<ModelProviderConfig[]> {
    const response = await this.request("/admin/model-providers", modelProviderConfigListResponseSchema);
    return response.providers;
  }

  async listModelProviderHealth(): Promise<ModelProviderHealth[]> {
    const response = await this.request("/admin/model-providers/health", modelProviderHealthListResponseSchema);
    return response.providers;
  }

  async upsertModelProviderConfig(
    provider: ModelProvider,
    input: Omit<ModelProviderConfigInput, "provider">
  ): Promise<ModelProviderConfig> {
    return this.request(`/admin/model-providers/${encodeURIComponent(provider)}`, modelProviderConfigSchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(modelProviderConfigInputSchema.parse({ ...input, provider }))
    });
  }

  async listAuthProviderConfigs(): Promise<AuthProviderConfig[]> {
    const response = await this.request("/admin/auth-providers", authProviderConfigListResponseSchema);
    return response.authProviders;
  }

  async upsertAuthProviderConfig(
    provider: ExternalAuthProvider,
    input: Omit<AuthProviderConfigInput, "provider">
  ): Promise<AuthProviderConfig> {
    return this.request(`/admin/auth-providers/${encodeURIComponent(provider)}`, authProviderConfigSchema, {
      method: "PUT",
      headers: this.authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(authProviderConfigInputSchema.parse({ ...input, provider }))
    });
  }

  async exportAiPackage(packageName?: string, options?: ExportAiPackageOptions & { format?: "json" }): Promise<AiExportPackage>;
  async exportAiPackage(packageName: string, options: ExportAiPackageOptions & { format: "okf" }): Promise<OkfExportPackage>;
  async exportAiPackage(
    packageName = "demo-agent-pack",
    options: ExportAiPackageOptions = {}
  ): Promise<AiExportPackage | OkfExportPackage> {
    const format = aiExportFormatSchema.parse(options.format ?? "json");
    const params = new URLSearchParams({
      package: packageName,
      format
    });

    if (format === "okf") {
      params.set("okfVersion", okfVersionSchema.parse(options.okfVersion ?? "0.1"));
      return this.request(`/exports/ai-package?${params.toString()}`, okfExportPackageSchema);
    }

    return this.request(`/exports/ai-package?${params.toString()}`, aiExportPackageSchema);
  }

  async exportOkfPackage(packageName = "demo-agent-pack", okfVersion: OkfVersion = "0.1"): Promise<OkfExportPackage> {
    return this.exportAiPackage(packageName, { format: "okf", okfVersion });
  }

  private async request<T>(path: string, schema: { parse(input: unknown): T }, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.authHeaders(init?.headers)
    });

    if (!response.ok) {
      throw await createHttpError(response);
    }

    return schema.parse(await response.json());
  }

  private authHeaders(extra?: HeadersInit): HeadersInit {
    const headers = new Headers(extra);
    headers.set("x-forgetbase-surface", this.surface);

    if (this.apiKey) {
      headers.set("authorization", `Bearer ${this.apiKey}`);
    }

    return headers;
  }
}

async function createHttpError(response: Response): Promise<ForgetBaseHttpError> {
  const { body, truncated } = await readBoundedResponseBody(response);

  return new ForgetBaseHttpError(response.status, {
    statusText: boundMetadata(response.statusText),
    code: parseSafeErrorCode(body),
    responseBody: body,
    responseBodyTruncated: truncated,
    responseContentType: boundMetadata(response.headers.get("content-type")),
    responseRequestId: boundMetadata(response.headers.get("x-request-id"))
  });
}

async function readBoundedResponseBody(response: Response): Promise<{ body: string | null; truncated: boolean }> {
  if (!response.body) {
    return { body: null, truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;
  let truncated = false;

  try {
    while (bytesRead < MAX_ERROR_BODY_BYTES) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      const remaining = MAX_ERROR_BODY_BYTES - bytesRead;
      const chunk = result.value.subarray(0, remaining);
      body += decoder.decode(chunk, { stream: true });
      bytesRead += chunk.byteLength;

      if (result.value.byteLength > remaining) {
        truncated = true;
        break;
      }
    }

    if (!truncated && bytesRead === MAX_ERROR_BODY_BYTES) {
      const result = await reader.read();
      truncated = !result.done;
    }
  } catch {
    truncated = true;
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined);
    }
  }

  body += decoder.decode();
  return { body: body.length > 0 ? body : null, truncated };
}

function parseSafeErrorCode(body: string | null): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const value = "error" in parsed
      ? parsed.error
      : "code" in parsed
        ? parsed.code
        : null;

    return typeof value === "string" && SAFE_ERROR_CODE_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function boundMetadata(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.slice(0, MAX_ERROR_METADATA_LENGTH);
}
