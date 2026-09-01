import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions
} from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
	  aiExportPackageSchema,
  aiExportFormatSchema,
  attachmentAllowedMediaTypes,
	  agentActionDecisionInputSchema,
	  agentActionExecuteInputSchema,
	  agentActionExecutionPolicyInputSchema,
	  agentActionExecutionPolicySchema,
	  agentActionRequestListResponseSchema,
	  agentActionRequestSchema,
	  apiKeyCreateInputSchema,
  apiKeyListResponseSchema,
  apiKeyRotationReportInputSchema,
  apiKeyRotationReportSchema,
  apiKeyRotateInputSchema,
  apiKeyRotateResponseSchema,
  apiKeyRevokeResponseSchema,
  assetCreateInputSchema,
  assetDetailSchema,
  assetListResponseSchema,
  assetPublishInputSchema,
  assetReviewInputSchema,
  assetReviewQueueInputSchema,
  assetReviewQueueResponseSchema,
  assetRestoreInputSchema,
  assetUpdateInputSchema,
  assetVersionSnapshotInputSchema,
  assetVersionSnapshotSchema,
  assetValidationInputSchema,
  assetValidationReportSchema,
  attachmentListResponseSchema,
  attachmentSchema,
  attachmentUploadMetadataSchema,
  auditEventSchema,
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
  groupCreateInputSchema,
  groupListResponseSchema,
  groupMembershipInputSchema,
  groupMembershipListResponseSchema,
  groupMembershipSchema,
  groupRecordSchema,
  loginSessionListResponseSchema,
  loginSessionRefreshResponseSchema,
  loginSessionRevokeResponseSchema,
  localUserCreateInputSchema,
  localUserListResponseSchema,
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
  modelProviderSchema,
  permissionGrantCreateInputSchema,
  piiRedactionPolicyInputSchema,
  piiRedactionPolicySchema,
  retrievalEventSchema,
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
  serviceAccountUpdateInputSchema,
  telemetryAnalyticsInputSchema,
  telemetryAnalyticsSummarySchema,
  telemetryRetentionPolicyInputSchema,
  telemetryRetentionPolicySchema,
  telemetryRetentionPurgeInputSchema,
  telemetryRetentionPurgeResultSchema,
  createHealthResponse,
  buildOkfExportPackage,
  healthResponseSchema,
  okfExportPackageSchema,
  okfVersionSchema,
	  type ApiKeyScope,
	  type AgentActionExecutionPolicy,
	  type AgentActionRequest,
	  type AgentActionStatus,
	  type AuditEvent,
  type AuthProviderConfig,
  type AuthPrincipal,
  type LocalUser,
  type AssetDetail,
  type ExternalAuthProvider,
  type LoginSessionRecord,
  type LoginSessionSource,
  type ManagedQueryCache,
  type ManagedQueryCachePolicy,
  type ManagedQueryPolicy,
  type ManagedQueryRetentionPolicy,
  type ManagedQueryEvalAnalyticsInput,
  type ManagedQueryEvalAnalyticsSummary,
  type ManagedQueryEvalCase,
  type ManagedQueryEvalReport,
  type ManagedQueryEvalSchedulePolicy,
  type ManagedQueryGeneration,
  type ManagedQueryGenerationAttempt,
  type ManagedQueryGenerationUsage,
  type ModelProvider,
  type ModelProviderConfig,
  type ModelProviderHealth,
  type PiiRedactionPolicy,
  type RetrievalEvent,
  type SearchInput,
  type SearchResult,
  type SecretReferencePolicy,
  type Surface,
  type TelemetryAnalyticsInput,
  type TelemetryAnalyticsSummary,
} from "@forgetbase/schema";
	import {
  PostgresAgentActionExecutionRepository,
  PostgresAttachmentRepository,
  PostgresManagedQueryEvalRunRepository,
	  PostgresManagedQueryFeedbackRepository,
  PostgresAuthRepository,
  PostgresAuthProviderConfigRepository,
	  PostgresManagedQueryCacheRepository,
	  PostgresManagedQueryCachePolicyRepository,
  PostgresManagedQueryEvalSchedulePolicyRepository,
	  PostgresManagedQueryPolicyRepository,
  PostgresManagedQueryRetentionPolicyRepository,
  PostgresModelProviderConfigRepository,
  PostgresPiiRedactionPolicyRepository,
  PostgresRetrievalRankingPolicyRepository,
  PostgresSecretReferencePolicyRepository,
  PostgresTelemetryRetentionPolicyRepository,
  PostgresRetrievalRepository,
  createPool,
  createEmbeddingProviderFromEnv,
  DuplicateAssetError,
  PostgresRegistryRepository,
  defaultManagedQueryCachePolicy,
	  defaultManagedQueryPolicy,
	  defaultManagedQueryRetentionPolicy,
	  defaultAgentActionExecutionPolicy,
  defaultPiiRedactionPolicy,
  defaultSecretReferencePolicy,
  isSecretEnvVarAllowed,
  principalHasScope,
  purgeTelemetryForRetentionPolicy,
  roleCanManagePermissions,
  roleCanWriteAssets,
  runMigrations,
	  ServiceAccountPolicyViolationError,
  ManagedQueryEvalSchedulePolicyError,
  type AuthProviderConfigRepository,
  type AttachmentRepository,
	  type AuthRepository,
	  type LoginCredentialIssueResult,
	  type AgentActionExecutionRepository,
  type ManagedQueryCachePolicyRepository,
  type ManagedQueryCacheRepository,
  type ManagedQueryPolicyRepository,
  type ManagedQueryRetentionPolicyRepository,
  type ManagedQueryEvalSchedulePolicyRepository,
  type ManagedQueryEvalRunRepository,
  type ManagedQueryFeedbackRepository,
  type ModelProviderConfigRepository,
  type PiiRedactionPolicyRepository,
  type RetrievalRankingPolicyRepository,
  type RetrievalRepository,
  type RegistryRepository,
  type SecretReferencePolicyRepository,
  type TelemetryRetentionPolicyRepository
} from "@forgetbase/db";
import { redactText, validateAssetCollection, type RedactionFinding } from "@forgetbase/validation";
import {
  LocalFilesystemAttachmentStorage,
  generateAttachmentStorageKey,
  type AttachmentStorageAdapter
} from "./attachment-storage.js";
import { buildOpenApiDocument } from "./openapi.js";

const OIDC_STATE_TTL_MS = 10 * 60 * 1000;
const OIDC_JWT_ALGORITHMS = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"];
const SESSION_COOKIE_NAME = "forgetbase_session";
const CSRF_COOKIE_NAME = "forgetbase_csrf";
const REFRESH_COOKIE_NAME = "forgetbase_refresh";
const CSRF_HEADER_NAME = "x-forgetbase-csrf";
const DEFAULT_LOGIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const MIN_LOGIN_SESSION_MAX_AGE_SECONDS = 60;
const MAX_LOGIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS = 60 * 60 * 4;
const MIN_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS = 60;
const MAX_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MIN_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS = 60;
const MAX_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const DEFAULT_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MIN_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS = 60;
const MAX_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_LOGIN_SESSION_CLIENT_USER_AGENT_LENGTH = 500;
const DEFAULT_LOGIN_THROTTLE_MAX_ATTEMPTS = 5;
const DEFAULT_LOGIN_THROTTLE_WINDOW_MS = 60_000;
const DEFAULT_LOGIN_THROTTLE_BLOCK_MS = 60_000;
const DEFAULT_LOGIN_THROTTLE_MAX_ENTRIES = 10_000;
const DEFAULT_CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:5175", "http://localhost:5175"];
const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MEDIA_TYPES = new Set<string>(attachmentAllowedMediaTypes);

export interface BuildServerOptions extends FastifyServerOptions {
  registryRepository?: RegistryRepository;
  attachmentRepository?: AttachmentRepository;
  attachmentStorage?: AttachmentStorageAdapter;
  attachmentStorageRoot?: string;
  attachmentMaxBytes?: number;
  authRepository?: AuthRepository;
  retrievalRepository?: RetrievalRepository;
  retrievalRankingPolicyRepository?: RetrievalRankingPolicyRepository;
  evalRunRepository?: ManagedQueryEvalRunRepository;
  feedbackRepository?: ManagedQueryFeedbackRepository;
  cacheRepository?: ManagedQueryCacheRepository;
  cachePolicyRepository?: ManagedQueryCachePolicyRepository;
  actionExecutionRepository?: AgentActionExecutionRepository;
  managedQueryPolicyRepository?: ManagedQueryPolicyRepository;
  managedQueryEvalSchedulePolicyRepository?: ManagedQueryEvalSchedulePolicyRepository;
  managedQueryRetentionPolicyRepository?: ManagedQueryRetentionPolicyRepository;
  piiRedactionPolicyRepository?: PiiRedactionPolicyRepository;
  providerConfigRepository?: ModelProviderConfigRepository;
  authProviderConfigRepository?: AuthProviderConfigRepository;
  secretReferencePolicyRepository?: SecretReferencePolicyRepository;
  telemetryRetentionPolicyRepository?: TelemetryRetentionPolicyRepository;
  databaseUrl?: string;
  autoMigrate?: boolean;
  oidcRuntime?: OidcRuntime;
  oidcStateSecret?: string;
  modelRuntime?: ModelRuntime;
  allowedOrigins?: string[];
  loginSessionMaxAgeSeconds?: number;
  loginSessionIdleTimeoutSeconds?: number | null;
  loginSessionAbsoluteMaxAgeSeconds?: number | null;
  loginRefreshTokenMaxAgeSeconds?: number | null;
  loginThrottleMaxAttempts?: number;
  loginThrottleWindowMs?: number;
  loginThrottleBlockMs?: number;
  loginThrottleMaxEntries?: number;
  requireAuthentication?: boolean;
  readinessCheck?: () => Promise<void>;
}

export interface OidcDiscoveryDocument {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface OidcTokenResponse {
  idToken: string;
}

export interface OidcRuntime {
  discover(config: AuthProviderConfig): Promise<OidcDiscoveryDocument>;
  exchangeCode(input: {
    config: AuthProviderConfig;
    discovery: OidcDiscoveryDocument;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<OidcTokenResponse>;
  verifyIdToken(input: {
    config: AuthProviderConfig;
    discovery: OidcDiscoveryDocument;
    idToken: string;
  }): Promise<JWTPayload>;
}

export interface ModelRuntimeRequest {
  provider: ModelProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  instructions: string;
  prompt: string;
  metadata: Record<string, unknown>;
}

export interface ModelRuntimeResponse {
  text: string;
  usage?: Partial<ModelRuntimeUsage>;
}

export interface ModelRuntime {
  generate(input: ModelRuntimeRequest): Promise<ModelRuntimeResponse>;
}

export interface ModelRuntimeUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const server = fastify({
    logger: options.logger ?? true
  });
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const pool = (
    options.registryRepository &&
    options.authRepository &&
    options.retrievalRepository &&
    options.retrievalRankingPolicyRepository &&
    options.evalRunRepository &&
    options.feedbackRepository &&
    options.cacheRepository &&
	    options.cachePolicyRepository &&
	    options.actionExecutionRepository &&
	    options.managedQueryPolicyRepository &&
    options.managedQueryEvalSchedulePolicyRepository &&
    options.managedQueryRetentionPolicyRepository &&
    options.piiRedactionPolicyRepository &&
    options.authProviderConfigRepository &&
    options.providerConfigRepository &&
    options.secretReferencePolicyRepository &&
    options.telemetryRetentionPolicyRepository &&
    options.attachmentRepository
  ) || !databaseUrl
    ? undefined
    : createPool(databaseUrl);
  const registryRepository = options.registryRepository ?? (pool ? new PostgresRegistryRepository(pool) : undefined);
  const attachmentRepository = options.attachmentRepository ?? (pool ? new PostgresAttachmentRepository(pool) : undefined);
  const authRepository = options.authRepository ?? (pool ? new PostgresAuthRepository(pool) : undefined);
  const retrievalRankingPolicyRepository = options.retrievalRankingPolicyRepository ??
    (pool ? new PostgresRetrievalRankingPolicyRepository(pool) : undefined);
  const retrievalRepository = options.retrievalRepository ??
    (pool ? new PostgresRetrievalRepository(pool, retrievalRankingPolicyRepository, createEmbeddingProviderFromEnv()) : undefined);
  const evalRunRepository = options.evalRunRepository ??
    (pool ? new PostgresManagedQueryEvalRunRepository(pool) : undefined);
  const feedbackRepository = options.feedbackRepository ??
    (pool ? new PostgresManagedQueryFeedbackRepository(pool) : undefined);
  const cacheRepository = options.cacheRepository ?? (pool ? new PostgresManagedQueryCacheRepository(pool) : undefined);
	  const cachePolicyRepository = options.cachePolicyRepository ??
	    (pool ? new PostgresManagedQueryCachePolicyRepository(pool) : undefined);
	  const actionExecutionRepository = options.actionExecutionRepository ??
	    (pool ? new PostgresAgentActionExecutionRepository(pool) : undefined);
	  const managedQueryPolicyRepository = options.managedQueryPolicyRepository ??
    (pool ? new PostgresManagedQueryPolicyRepository(pool) : undefined);
  const managedQueryEvalSchedulePolicyRepository = options.managedQueryEvalSchedulePolicyRepository ??
    (pool ? new PostgresManagedQueryEvalSchedulePolicyRepository(pool) : undefined);
  const managedQueryRetentionPolicyRepository = options.managedQueryRetentionPolicyRepository ??
    (pool ? new PostgresManagedQueryRetentionPolicyRepository(pool) : undefined);
  const piiRedactionPolicyRepository = options.piiRedactionPolicyRepository ??
    (pool ? new PostgresPiiRedactionPolicyRepository(pool) : undefined);
  const authProviderConfigRepository = options.authProviderConfigRepository ??
    (pool ? new PostgresAuthProviderConfigRepository(pool) : undefined);
  const providerConfigRepository = options.providerConfigRepository ??
    (pool ? new PostgresModelProviderConfigRepository(pool) : undefined);
  const secretReferencePolicyRepository = options.secretReferencePolicyRepository ??
    (pool ? new PostgresSecretReferencePolicyRepository(pool) : undefined);
  const telemetryRetentionPolicyRepository = options.telemetryRetentionPolicyRepository ??
    (pool ? new PostgresTelemetryRetentionPolicyRepository(pool) : undefined);
  const attachmentMaxBytes = readPositiveIntegerOption(
    options.attachmentMaxBytes,
    process.env.FORGETBASE_ATTACHMENT_MAX_BYTES,
    DEFAULT_ATTACHMENT_MAX_BYTES,
    "FORGETBASE_ATTACHMENT_MAX_BYTES"
  );
  if (attachmentMaxBytes > MAX_ATTACHMENT_MAX_BYTES) {
    throw new Error(`FORGETBASE_ATTACHMENT_MAX_BYTES must not exceed ${MAX_ATTACHMENT_MAX_BYTES}.`);
  }
  const attachmentStorage = options.attachmentStorage ?? (attachmentRepository
    ? new LocalFilesystemAttachmentStorage(
        options.attachmentStorageRoot ?? process.env.FORGETBASE_ATTACHMENT_STORAGE_ROOT ?? "work/attachments",
        attachmentMaxBytes
      )
    : undefined);
  const oidcRuntime = options.oidcRuntime ?? defaultOidcRuntime;
  const oidcStateSecret = options.oidcStateSecret ?? process.env.FORGETBASE_OIDC_STATE_SECRET;
  const modelRuntime = options.modelRuntime ?? defaultModelRuntime;
  const allowedOrigins = readAllowedOrigins(options.allowedOrigins ?? readCorsAllowedOriginsEnv());
  const loginSessionMaxAgeSeconds = readLoginSessionMaxAgeSeconds(options.loginSessionMaxAgeSeconds);
  const loginSessionIdleTimeoutSeconds = readLoginSessionIdleTimeoutSeconds(options.loginSessionIdleTimeoutSeconds);
  const loginSessionAbsoluteMaxAgeSeconds = readLoginSessionAbsoluteMaxAgeSeconds(options.loginSessionAbsoluteMaxAgeSeconds);
  const loginRefreshTokenMaxAgeSeconds = readLoginRefreshTokenMaxAgeSeconds(options.loginRefreshTokenMaxAgeSeconds);
  const loginThrottle = new LoginThrottle({
    maxAttempts: readPositiveIntegerOption(
      options.loginThrottleMaxAttempts,
      process.env.FORGETBASE_LOGIN_THROTTLE_MAX_ATTEMPTS,
      DEFAULT_LOGIN_THROTTLE_MAX_ATTEMPTS,
      "FORGETBASE_LOGIN_THROTTLE_MAX_ATTEMPTS"
    ),
    windowMs: readPositiveIntegerOption(
      options.loginThrottleWindowMs,
      process.env.FORGETBASE_LOGIN_THROTTLE_WINDOW_MS,
      DEFAULT_LOGIN_THROTTLE_WINDOW_MS,
      "FORGETBASE_LOGIN_THROTTLE_WINDOW_MS"
    ),
    blockMs: readPositiveIntegerOption(
      options.loginThrottleBlockMs,
      process.env.FORGETBASE_LOGIN_THROTTLE_BLOCK_MS,
      DEFAULT_LOGIN_THROTTLE_BLOCK_MS,
      "FORGETBASE_LOGIN_THROTTLE_BLOCK_MS"
    ),
    maxEntries: readPositiveIntegerOption(
      options.loginThrottleMaxEntries,
      process.env.FORGETBASE_LOGIN_THROTTLE_MAX_ENTRIES,
      DEFAULT_LOGIN_THROTTLE_MAX_ENTRIES,
      "FORGETBASE_LOGIN_THROTTLE_MAX_ENTRIES"
    )
  });
  const requireAuthentication = options.requireAuthentication ??
    readOptionalEnvBoolean(process.env.FORGETBASE_REQUIRE_AUTHENTICATION) ??
    false;

  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: attachmentMaxBytes },
    (_request, body, done) => done(null, body)
  );

  server.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;

    if (typeof origin === "string" && origin) {
      reply.header("vary", "Origin");

      if (!allowedOrigins.has(origin)) {
        if (request.method === "OPTIONS") {
          return reply.code(403).send({ error: "origin_not_allowed" });
        }
      } else {
        reply.header("access-control-allow-origin", origin);
        reply.header("access-control-allow-credentials", "true");
      }
    } else {
      reply.header("access-control-allow-origin", "*");
    }

    reply.header("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    reply.header("access-control-allow-headers", `authorization,content-type,x-forgetbase-surface,${CSRF_HEADER_NAME}`);

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  server.addHook("preHandler", async (request, reply) => {
    if (!requireAuthentication || request.method === "OPTIONS" || isPublicAuthenticationPath(request.url)) {
      return;
    }

    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }
  });

  if (pool) {
    server.addHook("onReady", async () => {
      if (options.autoMigrate ?? true) {
        await runMigrations(pool);
      } else {
        const readiness = await pool.query<{ ready: boolean }>(
          `
            SELECT
              to_regclass('public.schema_migrations') IS NOT NULL
              AND to_regclass('public.assets') IS NOT NULL
              AND to_regclass('public.users') IS NOT NULL
              AND to_regclass('public.api_keys') IS NOT NULL AS ready
          `
        );

        if (!readiness.rows[0]?.ready) {
          throw new Error("Database migrations are not ready");
        }
      }
    });

    server.addHook("onClose", async () => {
      await pool.end();
    });
  }

  server.get("/health", async () => {
    return healthResponseSchema.parse(createHealthResponse("forgetbase-api"));
  });

  server.get("/ready", async (_request, reply) => {
    try {
      if (options.readinessCheck) {
        await options.readinessCheck();
      } else if (pool) {
        const readiness = await pool.query<{ ready: boolean }>(
          `
            SELECT
              to_regclass('public.schema_migrations') IS NOT NULL
              AND to_regclass('public.assets') IS NOT NULL
              AND to_regclass('public.users') IS NOT NULL
              AND to_regclass('public.api_keys') IS NOT NULL
              AND EXISTS (SELECT 1 FROM schema_migrations) AS ready
          `
        );

        if (!readiness.rows[0]?.ready) {
          throw new Error("Database migrations are not ready");
        }
      }

      return {
        status: "ready",
        service: "forgetbase-api",
        checks: {
          database: pool || options.readinessCheck ? "ok" : "not-configured",
          migrations: pool ? "ok" : "not-configured"
        }
      };
    } catch (error) {
      server.log.error(error, "ForgetBase API readiness check failed");
      return reply.code(503).send({
        status: "not-ready",
        service: "forgetbase-api",
        checks: {
          database: "unavailable",
          migrations: "unknown"
        }
      });
    }
  });

  server.get("/", async () => {
    return {
      name: "ForgetBase API",
      status: "ready",
      docs: "/health",
      assets: "/assets",
      auth: "/auth/bootstrap",
      search: "/search"
    };
  });

  server.get("/openapi.json", async () => buildOpenApiDocument());

  server.post("/validation/assets", async (request, reply) => {
    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    if (
      authRepository &&
      principal &&
      (!roleCanWriteAssets(principal) || !principalHasScope(principal, "asset:write"))
    ) {
      await recordDenied(authRepository, principal, principal.tenantId, "validation.assets", "validation", undefined, {});
      return reply.code(403).send({ error: "access_denied" });
    }

    const parsed = assetValidationInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const report = validateAssetCollection(parsed.data, {
      asOf: parsed.data.asOf,
      publicExportPackages: parsed.data.publicExportPackages
    });

    if (authRepository && principal) {
      await authRepository.recordAuditEvent({
        tenantId: principal.tenantId,
        ...auditActor(principal),
        action: "validation.assets",
        targetType: "validation",
        outcome: report.ok ? "success" : "error",
        metadata: {
          assetCount: report.assetCount,
          errorCount: report.errorCount,
          warningCount: report.warningCount,
          staleCount: report.staleCount
        }
      });
    }

    return assetValidationReportSchema.parse(report);
  });

  server.post("/auth/bootstrap", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const parsed = authBootstrapInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const bootstrap = await authRepository.bootstrapAdmin({
      tenantId: parsed.data.tenantId,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
      keyName: parsed.data.keyName
    });

    if (!bootstrap) {
      return reply.code(409).send({ error: "bootstrap_already_completed" });
    }

    return reply.code(201).send(bootstrap);
  });

  server.post("/auth/login", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const parsed = authLoginInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const throttleKey = buildLoginThrottleKey(request, parsed.data.tenantId, parsed.data.email);
    const throttleState = loginThrottle.check(throttleKey);

    if (throttleState.blocked) {
      await recordFailedLoginEvidence(authRepository, request, parsed.data.tenantId, parsed.data.email, "login_rate_limited", {
        retryAfterSeconds: throttleState.retryAfterSeconds
      });
      reply.header("retry-after", String(throttleState.retryAfterSeconds));
      return reply.code(429).send({ error: "login_rate_limited" });
    }

    const user = await authRepository.authenticateLocalUser(
      parsed.data.tenantId,
      parsed.data.email,
      parsed.data.password
    );

    if (!user) {
      const failedState = loginThrottle.recordFailure(throttleKey);
      await recordFailedLoginEvidence(authRepository, request, parsed.data.tenantId, parsed.data.email, "invalid_credentials", {
        attemptCount: failedState.attemptCount,
        limited: failedState.blocked
      });

      if (failedState.blocked) {
        reply.header("retry-after", String(failedState.retryAfterSeconds));
        return reply.code(429).send({ error: "login_rate_limited" });
      }

      return reply.code(401).send({ error: "invalid_credentials" });
    }

    loginThrottle.clear(throttleKey);
    const issued = await issueLoginSession({
      request,
      reply,
      authRepository,
      user,
      keyName: parsed.data.keyName,
      requestedExpiresInSeconds: parsed.data.expiresInSeconds,
      source: "password",
      deviceLabel: parsed.data.deviceLabel,
      auditAction: "auth.login",
      safeAuditMetadata: {},
      loginSessionMaxAgeSeconds,
      loginSessionIdleTimeoutSeconds,
      loginSessionAbsoluteMaxAgeSeconds,
      loginRefreshTokenMaxAgeSeconds,
      errorLabel: "Login"
    });

    return reply.code(201).send(authLoginResponseSchema.parse({
      user,
      apiKey: issued.apiKey,
      secret: issued.secret
    }));
  });

  server.post("/auth/oidc/authorize", async (request, reply) => {
    if (!authProviderConfigRepository) {
      return reply.code(503).send({ error: "auth_provider_config_unavailable" });
    }

    if (!oidcStateSecret) {
      return reply.code(503).send({ error: "oidc_state_secret_missing" });
    }

    const parsed = authOidcAuthorizeInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const config = await findEnabledAuthProviderConfig(
      authProviderConfigRepository,
      parsed.data.tenantId,
      parsed.data.provider
    );

    if (!config) {
      return reply.code(404).send({ error: "auth_provider_not_enabled" });
    }

    const redirectUri = parsed.data.redirectUri ?? config.redirectUri;

    if (!redirectUri) {
      return reply.code(400).send({ error: "oidc_redirect_uri_required" });
    }

    try {
      const discovery = await oidcRuntime.discover(config);
      const nonce = randomUrlToken(32);
      const codeVerifier = randomUrlToken(64);
      const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
      const expiresAt = new Date(Date.now() + OIDC_STATE_TTL_MS).toISOString();
      const state = signOidcState({
        tenantId: config.tenantId,
        provider: config.provider,
        redirectUri,
        nonceHash: hashOidcBoundValue(nonce),
        codeVerifierHash: hashOidcBoundValue(codeVerifier),
        expiresAt
      }, oidcStateSecret);
      const authorizationUrl = new URL(discovery.authorizationEndpoint);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("client_id", config.clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("scope", config.scopes.join(" "));
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("nonce", nonce);

      if (config.pkceRequired) {
        authorizationUrl.searchParams.set("code_challenge", codeChallenge);
        authorizationUrl.searchParams.set("code_challenge_method", "S256");
      }

      return authOidcAuthorizeResponseSchema.parse({
        tenantId: config.tenantId,
        provider: config.provider,
        authorizationUrl: authorizationUrl.toString(),
        state,
        nonce,
        codeVerifier,
        codeChallenge,
        redirectUri,
        expiresAt
      });
    } catch (error) {
      return sendOidcError(reply, error);
    }
  });

  server.post("/auth/oidc/callback", async (request, reply) => {
    if (!authRepository || !authProviderConfigRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    if (!oidcStateSecret) {
      return reply.code(503).send({ error: "oidc_state_secret_missing" });
    }

    const parsed = authOidcCallbackInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const config = await findEnabledAuthProviderConfig(
      authProviderConfigRepository,
      parsed.data.tenantId,
      parsed.data.provider
    );

    if (!config) {
      return reply.code(404).send({ error: "auth_provider_not_enabled" });
    }

    const redirectUri = parsed.data.redirectUri ?? config.redirectUri;

    if (!redirectUri) {
      return reply.code(400).send({ error: "oidc_redirect_uri_required" });
    }

    try {
      const state = verifyOidcState(parsed.data.state, oidcStateSecret);
      assertOidcStateMatches(state, {
        tenantId: config.tenantId,
        provider: config.provider,
        redirectUri,
        nonce: parsed.data.nonce,
        codeVerifier: parsed.data.codeVerifier
      });

      const discovery = await oidcRuntime.discover(config);
      const tokenResponse = await oidcRuntime.exchangeCode({
        config,
        discovery,
        code: parsed.data.code,
        redirectUri,
        codeVerifier: parsed.data.codeVerifier
      });
      const claims = await oidcRuntime.verifyIdToken({
        config,
        discovery,
        idToken: tokenResponse.idToken
      });

      if (claims.nonce !== parsed.data.nonce) {
        throw new OidcLoginError("oidc_nonce_mismatch", 401, "OIDC nonce did not match the signed login state.");
      }

      const subject = readRequiredClaim(claims, "sub");
      const email = readRequiredClaim(claims, config.emailClaim);
      const displayName = readOptionalClaim(claims, config.displayNameClaim) ?? email;
      const role = readRoleClaim(claims, config.roleClaim, config.defaultRole);
      const emailVerified = readBooleanClaim(claims, "email_verified");
      const emailDomain = email.split("@")[1]?.toLowerCase();

      if (
        config.allowedDomains.length > 0 &&
        (!emailDomain || !config.allowedDomains.map((domain) => domain.toLowerCase()).includes(emailDomain))
      ) {
        await authRepository.recordAuditEvent({
          tenantId: config.tenantId,
          action: "auth.login.oidc",
          targetType: "user",
          outcome: "denied",
          reason: "domain_not_allowed",
          metadata: {
            provider: config.provider,
            issuer: discovery.issuer,
            subject
          }
        });
        return reply.code(403).send({ error: "domain_not_allowed" });
      }

      let user = await authRepository.findUserByExternalIdentity({
        tenantId: config.tenantId,
        provider: config.provider,
        issuer: discovery.issuer,
        subject
      });
      let accountLinkingOutcome = user ? "matched_external_identity" : "none";

      if (!user) {
        const emailUser = await authRepository.findUserByEmail(config.tenantId, email);

        if (emailUser) {
          if (
            emailUser.externalSubject &&
            (
              emailUser.externalProvider !== config.provider ||
              emailUser.externalIssuer !== discovery.issuer ||
              emailUser.externalSubject !== subject
            )
          ) {
            await authRepository.recordAuditEvent({
              tenantId: config.tenantId,
              actorUserId: emailUser.id,
              action: "auth.login.oidc",
              targetType: "user",
              targetId: emailUser.id,
              outcome: "denied",
              reason: "external_identity_conflict",
              metadata: {
                provider: config.provider,
                issuer: discovery.issuer,
                subject
              }
            });
            return reply.code(403).send({ error: "external_identity_conflict" });
          }

          if (config.accountLinkingMode === "disabled") {
            await authRepository.recordAuditEvent({
              tenantId: config.tenantId,
              actorUserId: emailUser.id,
              action: "auth.login.oidc",
              targetType: "user",
              targetId: emailUser.id,
              outcome: "denied",
              reason: "external_account_linking_disabled",
              metadata: {
                provider: config.provider,
                issuer: discovery.issuer,
                subject,
                accountLinkingMode: config.accountLinkingMode
              }
            });
            return reply.code(403).send({ error: "external_account_linking_disabled" });
          }

          if (config.accountLinkingMode === "verified-email" && !emailVerified) {
            await authRepository.recordAuditEvent({
              tenantId: config.tenantId,
              actorUserId: emailUser.id,
              action: "auth.login.oidc",
              targetType: "user",
              targetId: emailUser.id,
              outcome: "denied",
              reason: "external_email_unverified",
              metadata: {
                provider: config.provider,
                issuer: discovery.issuer,
                subject,
                accountLinkingMode: config.accountLinkingMode
              }
            });
            return reply.code(403).send({ error: "external_email_unverified" });
          }

          const linkedUser = await authRepository.linkExternalUserIdentity({
            tenantId: config.tenantId,
            userId: emailUser.id,
            provider: config.provider,
            issuer: discovery.issuer,
            subject
          });

          if (!linkedUser) {
            await authRepository.recordAuditEvent({
              tenantId: config.tenantId,
              actorUserId: emailUser.id,
              action: "auth.login.oidc",
              targetType: "user",
              targetId: emailUser.id,
              outcome: "denied",
              reason: "external_identity_conflict",
              metadata: {
                provider: config.provider,
                issuer: discovery.issuer,
                subject
              }
            });
            return reply.code(403).send({ error: "external_identity_conflict" });
          }

          user = linkedUser;
          accountLinkingOutcome = "linked_existing_user";
        } else if (!config.autoProvisionUsers) {
          await authRepository.recordAuditEvent({
            tenantId: config.tenantId,
            action: "auth.login.oidc",
            targetType: "user",
            outcome: "denied",
            reason: "external_user_not_provisioned",
            metadata: {
              provider: config.provider,
              issuer: discovery.issuer,
              subject
            }
          });
          return reply.code(403).send({ error: "external_user_not_provisioned" });
        } else {
          user = await authRepository.createExternalUser({
            tenantId: config.tenantId,
            email,
            displayName,
            role,
            authProvider: config.provider,
            externalIssuer: discovery.issuer,
            externalSubject: subject
          });
          accountLinkingOutcome = "provisioned_external_user";

        }
      }

      if (user.status !== "active") {
        await authRepository.recordAuditEvent({
          tenantId: config.tenantId,
          actorUserId: user.id,
          action: "auth.login.oidc",
          targetType: "user",
          targetId: user.id,
          outcome: "denied",
          reason: "user_disabled",
          metadata: {
            provider: config.provider,
            issuer: discovery.issuer,
            subject
          }
        });
        return reply.code(403).send({ error: "user_disabled" });
      }

      const externalGroupIds = config.groupSyncEnabled && config.groupClaim
        ? readGroupClaimValues(claims, config.groupClaim)
        : [];
      const groupSyncResult = config.groupSyncEnabled && config.groupClaim
        ? await authRepository.syncExternalGroupMemberships({
          tenantId: config.tenantId,
          provider: config.provider,
          userId: user.id,
          externalGroupIds
        })
        : null;
      const issued = await issueLoginSession({
        request,
        reply,
        authRepository,
        user,
        keyName: parsed.data.keyName,
        requestedExpiresInSeconds: parsed.data.expiresInSeconds,
        source: "oidc",
        deviceLabel: parsed.data.deviceLabel,
        auditAction: "auth.login.oidc",
        safeAuditMetadata: {
          provider: config.provider,
          issuer: discovery.issuer,
          subject,
          accountLinkingMode: config.accountLinkingMode,
          accountLinkingOutcome,
          emailVerified,
          syncedGroupCount: groupSyncResult?.groups.length ?? 0,
          addedGroupMembershipCount: groupSyncResult?.addedMembershipCount ?? 0,
          removedGroupMembershipCount: groupSyncResult?.removedMembershipCount ?? 0
        },
        loginSessionMaxAgeSeconds,
        loginSessionIdleTimeoutSeconds,
        loginSessionAbsoluteMaxAgeSeconds,
        loginRefreshTokenMaxAgeSeconds,
        errorLabel: "OIDC login"
      });

      return reply.code(201).send(authOidcLoginResponseSchema.parse({
        user,
        provider: config.provider,
        subject,
        issuer: discovery.issuer,
        apiKey: issued.apiKey,
        secret: issued.secret
      }));
    } catch (error) {
      return sendOidcError(reply, error);
    }
  });

  server.get("/auth/me", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return principal;
  });

  server.post("/auth/session/refresh", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    if (loginRefreshTokenMaxAgeSeconds === null) {
      setSessionClearCookies(reply);
      return reply.code(404).send({ error: "refresh_disabled" });
    }

    const refreshToken = readRefreshCookieToken(request);

    if (!refreshToken) {
      setSessionClearCookies(reply);
      return reply.code(401).send({ error: "refresh_required" });
    }

    const sessionExpiry = buildLoginSessionExpiry(loginSessionMaxAgeSeconds, loginSessionMaxAgeSeconds);
    const refreshTokenExpiresAt = buildExpiresAt(loginRefreshTokenMaxAgeSeconds);
    const refreshed = await authRepository.refreshLoginSession({
      refreshToken,
      expiresAt: sessionExpiry.expiresAt,
      refreshTokenExpiresAt,
      idleTimeoutSeconds: loginSessionIdleTimeoutSeconds,
      apiKeyName: "browser-session refresh"
    });

    if (!refreshed) {
      setSessionClearCookies(reply);
      return reply.code(401).send({ error: "refresh_invalid" });
    }

    setSessionCookies(reply, refreshed.secret, refreshed.apiKey.expiresAt, {
      token: refreshed.refreshToken,
      expiresAt: refreshed.refreshTokenExpiresAt
    });

    await authRepository.recordAuditEvent({
      tenantId: refreshed.session.tenantId,
      actorUserId: refreshed.session.userId,
      actorApiKeyId: refreshed.apiKey.id,
      action: "auth.session.refresh",
      targetType: "login_session",
      targetId: refreshed.session.id,
      outcome: "success",
      metadata: {
        rotatedFromApiKeyId: refreshed.rotatedFromApiKey.id,
        rotatedToApiKeyId: refreshed.apiKey.id,
        rotatedFromRefreshTokenId: refreshed.rotatedFromRefreshTokenId,
        rotatedToRefreshTokenId: refreshed.refreshTokenId,
        expiresAt: refreshed.apiKey.expiresAt,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
        sessionAbsoluteExpiresAt: refreshed.session.absoluteExpiresAt,
        sessionAbsoluteMaxAgeSeconds: loginSessionAbsoluteMaxAgeSeconds,
        sessionMaxAgeSeconds: sessionExpiry.maxAgeSeconds,
        sessionIdleTimeoutSeconds: loginSessionIdleTimeoutSeconds,
        refreshTokenMaxAgeSeconds: loginRefreshTokenMaxAgeSeconds
      }
    });

    return loginSessionRefreshResponseSchema.parse({
      session: refreshed.session,
      apiKey: refreshed.apiKey
    });
  });

  server.get("/auth/sessions", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as Record<string, string | undefined>;
    const includeRevoked = readOptionalBooleanQuery(query.includeRevoked);

    if (typeof includeRevoked === "string") {
      return reply.code(400).send({ error: "invalid_include_revoked" });
    }

    const limit = query.limit ? Number.parseInt(query.limit, 10) : 50;

    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return reply.code(400).send({ error: "invalid_limit" });
    }

    const requestedUserId = query.userId;
    const canListTenantSessions = principal.role === "admin" && principalHasScope(principal, "admin");
    const userId = canListTenantSessions ? requestedUserId : principal.userId;

    if (!userId && !canListTenantSessions) {
      return reply.code(403).send({ error: "access_denied" });
    }

    const sessions = await authRepository.listLoginSessions({
      tenantId: principal.tenantId,
      userId: userId ?? undefined,
      includeRevoked: includeRevoked ?? false,
      limit
    });

    return loginSessionListResponseSchema.parse({ sessions });
  });

  server.delete("/auth/sessions/:sessionId", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const { sessionId } = request.params as { sessionId: string };
    const canRevokeTenantSession = principal.role === "admin" && principalHasScope(principal, "admin");

    if (!canRevokeTenantSession && !principal.userId) {
      return reply.code(403).send({ error: "access_denied" });
    }

    const revoked = await authRepository.revokeLoginSession({
      tenantId: principal.tenantId,
      sessionId,
      userId: canRevokeTenantSession ? undefined : principal.userId ?? undefined
    });

    if (!revoked) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    if (revoked.apiKey.id === principal.apiKeyId) {
      setSessionClearCookies(reply);
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "auth.session.revoke",
      targetType: "login_session",
      targetId: revoked.session.id,
      outcome: "success",
      metadata: {
        targetUserId: revoked.session.userId,
        targetApiKeyId: revoked.session.apiKeyId,
        source: revoked.session.source,
        revokedCurrentSession: revoked.apiKey.id === principal.apiKeyId
      }
    });

    return loginSessionRevokeResponseSchema.parse(revoked);
  });

  server.post("/auth/logout", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

      const authenticatedRequest = await requireAuthenticatedRequest(
        request,
        reply,
        authRepository,
        loginSessionIdleTimeoutSeconds
      );

    if (!authenticatedRequest) {
      return;
    }

    const principal = authenticatedRequest.principal;
    setSessionClearCookies(reply);

    const apiKey = await authRepository.revokeApiKey({
      tenantId: principal.tenantId,
      apiKeyId: principal.apiKeyId
    });

    if (!apiKey) {
      return reply.code(404).send({ error: "api_key_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "auth.logout",
      targetType: "api_key",
      targetId: apiKey.id,
      outcome: "success",
      metadata: {
        targetUserId: apiKey.userId,
        targetServiceAccountId: apiKey.serviceAccountId,
        sessionId: authenticatedRequest.loginSession?.id ?? null,
        secretPreview: apiKey.secretPreview
      }
    });

    return apiKeyRevokeResponseSchema.parse({ apiKey });
  });

  server.get("/admin/service-account-policy", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return serviceAccountPolicySchema.parse(await authRepository.getServiceAccountPolicy(principal.tenantId));
  });

  server.put("/admin/service-account-policy", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = serviceAccountPolicyInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await authRepository.upsertServiceAccountPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId
    });

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "auth.service_account_policy.update",
      targetType: "service_account_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        maxServiceAccounts: policy.maxServiceAccounts,
        maxActiveApiKeysPerServiceAccount: policy.maxActiveApiKeysPerServiceAccount,
        defaultApiKeyExpiresInDays: policy.defaultApiKeyExpiresInDays
      }
    });

    return serviceAccountPolicySchema.parse(policy);
  });

  server.post("/auth/users", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = localUserCreateInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const user = await authRepository.createUser(parsed.data);
    await authRepository.recordAuditEvent({
      tenantId: user.tenantId,
      ...auditActor(principal),
      action: "auth.user.create",
      targetType: "user",
      targetId: user.id,
      outcome: "success"
    });

    return reply.code(201).send(user);
  });

  server.get("/auth/users", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const users = await authRepository.listUsers({ tenantId: principal.tenantId, limit });

    return localUserListResponseSchema.parse({ users });
  });

  server.put("/auth/users/:userId", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { userId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const parsed = localUserUpdateInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId,
      userId: params.userId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const user = await authRepository.updateUser(parsed.data);

    if (!user) {
      return reply.code(404).send({ error: "user_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: user.tenantId,
      ...auditActor(principal),
      action: "auth.user.update",
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      metadata: {
        updatedFields: [
          parsed.data.displayName !== undefined ? "displayName" : null,
          parsed.data.role !== undefined ? "role" : null,
          parsed.data.status !== undefined ? "status" : null,
          parsed.data.password !== undefined ? "passwordReset" : null
        ].filter(Boolean)
      }
    });

    return user;
  });

  server.post("/auth/service-accounts", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = serviceAccountCreateInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    let serviceAccount;

    try {
      serviceAccount = await authRepository.createServiceAccount(parsed.data);
    } catch (error) {
      if (error instanceof ServiceAccountPolicyViolationError) {
        return reply.code(409).send({
          error: error.code,
          limit: error.limit
        });
      }

      throw error;
    }

    await authRepository.recordAuditEvent({
      tenantId: serviceAccount.tenantId,
      ...auditActor(principal),
      action: "auth.service_account.create",
      targetType: "service_account",
      targetId: serviceAccount.id,
      outcome: "success",
      metadata: {
        slug: serviceAccount.slug,
        role: serviceAccount.role,
        status: serviceAccount.status
      }
    });

    return reply.code(201).send(serviceAccount);
  });

  server.get("/auth/service-accounts", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const serviceAccounts = await authRepository.listServiceAccounts({
      tenantId: principal.tenantId,
      limit
    });

    return serviceAccountListResponseSchema.parse({ serviceAccounts });
  });

  server.put("/auth/service-accounts/:serviceAccountId", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { serviceAccountId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const parsed = serviceAccountUpdateInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId,
      serviceAccountId: params.serviceAccountId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const serviceAccount = await authRepository.updateServiceAccount(parsed.data);

    if (!serviceAccount) {
      return reply.code(404).send({ error: "service_account_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: serviceAccount.tenantId,
      ...auditActor(principal),
      action: "auth.service_account.update",
      targetType: "service_account",
      targetId: serviceAccount.id,
      outcome: "success",
      metadata: {
        updatedFields: [
          parsed.data.name !== undefined ? "name" : null,
          parsed.data.description !== undefined ? "description" : null,
          parsed.data.role !== undefined ? "role" : null,
          parsed.data.status !== undefined ? "status" : null
        ].filter(Boolean)
      }
    });

    return serviceAccount;
  });

  server.post("/auth/groups", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = groupCreateInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const group = await authRepository.createGroup(parsed.data);
    await authRepository.recordAuditEvent({
      tenantId: group.tenantId,
      ...auditActor(principal),
      action: "auth.group.create",
      targetType: "group",
      targetId: group.id,
      outcome: "success",
      metadata: {
        slug: group.slug
      }
    });

    return reply.code(201).send(group);
  });

  server.get("/auth/groups", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const groups = await authRepository.listGroups({ tenantId: principal.tenantId, limit });

    return groupListResponseSchema.parse({ groups });
  });

  server.delete("/auth/groups/:groupId", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { groupId: string };
    const group = await authRepository.deleteGroup({
      tenantId: principal.tenantId,
      groupId: params.groupId
    });

    if (!group) {
      return reply.code(404).send({ error: "group_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: group.tenantId,
      ...auditActor(principal),
      action: "auth.group.delete",
      targetType: "group",
      targetId: group.id,
      outcome: "success",
      metadata: {
        slug: group.slug
      }
    });

    return groupRecordSchema.parse(group);
  });

  server.post("/auth/groups/:groupId/members", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { groupId: string };
    const parsed = groupMembershipInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId,
      groupId: params.groupId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const member = await authRepository.addGroupMember(parsed.data);

    if (!member) {
      return reply.code(404).send({ error: "group_or_user_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "auth.group.member.add",
      targetType: "group",
      targetId: member.groupId,
      outcome: "success",
      metadata: {
        userId: member.userId
      }
    });

    return reply.code(201).send(groupMembershipSchema.parse(member));
  });

  server.get("/auth/groups/:groupId/members", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { groupId: string };
    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const members = await authRepository.listGroupMembers({
      tenantId: principal.tenantId,
      groupId: params.groupId,
      limit
    });

    return groupMembershipListResponseSchema.parse({ members });
  });

  server.delete("/auth/groups/:groupId/members/:userId", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { groupId: string; userId: string };
    const member = await authRepository.removeGroupMember({
      tenantId: principal.tenantId,
      groupId: params.groupId,
      userId: params.userId
    });

    if (!member) {
      return reply.code(404).send({ error: "group_member_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "auth.group.member.remove",
      targetType: "group",
      targetId: member.groupId,
      outcome: "success",
      metadata: {
        userId: member.userId
      }
    });

    return groupMembershipSchema.parse(member);
  });

  server.post("/auth/api-keys", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = apiKeyCreateInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    let apiKey;

    try {
      apiKey = await authRepository.createApiKey(parsed.data);
    } catch (error) {
      if (error instanceof ServiceAccountPolicyViolationError) {
        return reply.code(409).send({
          error: error.code,
          limit: error.limit
        });
      }

      throw error;
    }

    if (!apiKey) {
      return reply.code(404).send({ error: "api_key_principal_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: apiKey.apiKey.tenantId,
      ...auditActor(principal),
      action: "auth.api_key.create",
      targetType: "api_key",
      targetId: apiKey.apiKey.id,
      outcome: "success",
      metadata: {
        targetUserId: apiKey.apiKey.userId,
        targetServiceAccountId: apiKey.apiKey.serviceAccountId,
        secretPreview: apiKey.apiKey.secretPreview,
        allowedSurfaces: apiKey.apiKey.allowedSurfaces
      }
    });

    return reply.code(201).send(apiKey);
  });

  server.get("/auth/api-keys", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const apiKeys = await authRepository.listApiKeys({ tenantId: principal.tenantId, limit });

    return apiKeyListResponseSchema.parse({ apiKeys });
  });

  server.get("/auth/api-keys/rotation-due", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as {
      asOf?: string;
      dueWithinDays?: string;
      includeUserKeys?: string;
      includeRevoked?: string;
      limit?: string;
    };
    const parsed = apiKeyRotationReportInputSchema.safeParse({
      tenantId: principal.tenantId,
      asOf: query.asOf,
      dueWithinDays: query.dueWithinDays ? Number.parseInt(query.dueWithinDays, 10) : undefined,
      includeUserKeys: readOptionalBooleanQuery(query.includeUserKeys),
      includeRevoked: readOptionalBooleanQuery(query.includeRevoked),
      limit: query.limit ? Number.parseInt(query.limit, 10) : undefined
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const report = await authRepository.getApiKeyRotationReport(parsed.data);

    return apiKeyRotationReportSchema.parse(report);
  });

  server.post("/auth/api-keys/:apiKeyId/rotate", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { apiKeyId: string };
    const parsed = apiKeyRotateInputSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    let rotation;

    try {
      rotation = await authRepository.rotateApiKey({
        tenantId: principal.tenantId,
        apiKeyId: params.apiKeyId,
        ...parsed.data
      });
    } catch (error) {
      if (error instanceof ServiceAccountPolicyViolationError) {
        return reply.code(409).send({
          error: error.code,
          limit: error.limit
        });
      }

      throw error;
    }

    if (!rotation) {
      return reply.code(404).send({ error: "api_key_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "auth.api_key.rotate",
      targetType: "api_key",
      targetId: rotation.apiKey.id,
      outcome: "success",
      metadata: {
        rotatedFromApiKeyId: rotation.rotatedFrom.id,
        targetUserId: rotation.apiKey.userId,
        targetServiceAccountId: rotation.apiKey.serviceAccountId,
        newSecretPreview: rotation.apiKey.secretPreview,
        oldSecretPreview: rotation.rotatedFrom.secretPreview,
        revokedOld: Boolean(rotation.revokedApiKey)
      }
    });

    return reply.code(201).send(apiKeyRotateResponseSchema.parse(rotation));
  });

  server.post("/auth/api-keys/:apiKeyId/revoke", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { apiKeyId: string };
    const apiKey = await authRepository.revokeApiKey({
      tenantId: principal.tenantId,
      apiKeyId: params.apiKeyId
    });

    if (!apiKey) {
      return reply.code(404).send({ error: "api_key_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "auth.api_key.revoke",
      targetType: "api_key",
      targetId: apiKey.id,
      outcome: "success",
      metadata: {
        targetUserId: apiKey.userId,
        targetServiceAccountId: apiKey.serviceAccountId,
        secretPreview: apiKey.secretPreview
      }
    });

    return apiKeyRevokeResponseSchema.parse({ apiKey });
  });

  server.get("/assets", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const principal = await authenticateOptionalPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (principal === undefined) {
      return;
    }

    const surface = readSurface(request, principal);

    const assets = await registryRepository.listAssets({
      tenantId: principal?.tenantId,
      limit
    });
    const visibleAssets = authRepository
      ? await filterReadableAssets(authRepository, principal, assets, surface)
      : assets;

    return assetListResponseSchema.parse({ assets: visibleAssets });
  });

  server.get("/assets/review-queue", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    if (
      authRepository &&
      principal &&
      (!roleCanWriteAssets(principal) || !principalHasScope(principal, "asset:write"))
    ) {
      await recordDenied(authRepository, principal, principal.tenantId, "asset.review_queue", "asset", undefined, {});
      return reply.code(403).send({ error: "access_denied" });
    }

    const query = request.query as { asOf?: string; includeApproved?: string; limit?: string };
    const parsed = assetReviewQueueInputSchema.safeParse({
      tenantId: principal?.tenantId,
      asOf: query.asOf,
      includeApproved: query.includeApproved === "true",
      limit: query.limit ? Number.parseInt(query.limit, 10) : undefined
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const queue = await registryRepository.listAssetsNeedingReview(parsed.data);
    return assetReviewQueueResponseSchema.parse(queue);
  });

  server.get("/assets/:stableId", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const params = request.params as { stableId: string };
    const principal = await authenticateOptionalPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (principal === undefined) {
      return;
    }

    const surface = readSurface(request, principal);

    const detail = await registryRepository.getAssetByStableId(params.stableId, {
      tenantId: principal?.tenantId
    });

    if (!detail) {
      return reply.code(404).send({ error: "asset_not_found" });
    }

    if (authRepository) {
      const allowed = await authRepository.canAccessAsset({
        principal,
        asset: detail.asset,
        action: "read",
        surface
      });

      if (!allowed) {
        await recordDenied(authRepository, principal, detail.asset.tenantId, "asset.read", "asset", detail.asset.id, {
          stableId: detail.asset.stableId,
          surface
        });
        return reply.code(principal ? 403 : 401).send({ error: "access_denied" });
      }
    }

    if (retrievalRepository) {
      await retrievalRepository.recordRetrievalEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        surface,
        query: detail.asset.stableId,
        resultCount: 1,
        deniedCount: 0,
        latencyMs: 0,
        metadata: {
          queryKind: "asset-view",
          resultStableIds: [detail.asset.stableId],
          resultAssetIds: [detail.asset.id],
          resultChunkIds: []
        }
      });
    }

    return assetDetailSchema.parse(detail);
  });

  server.get("/assets/:stableId/attachments", async (request, reply) => {
    if (!registryRepository || !authRepository || !attachmentRepository) {
      return reply.code(503).send({ error: "attachments_unavailable" });
    }

    const params = request.params as { stableId: string };
    const principal = await authenticateOptionalPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);
    if (principal === undefined) return;

    const detail = await registryRepository.getAssetByStableId(params.stableId, {
      tenantId: principal?.tenantId
    });
    if (!detail) return reply.code(404).send({ error: "asset_not_found" });

    const surface = readSurface(request, principal);
    const allowed = await authRepository.canAccessAsset({ principal, asset: detail.asset, action: "read", surface });
    if (!allowed) {
      await recordDenied(authRepository, principal, detail.asset.tenantId, "attachment.list", "asset", detail.asset.id, {
        stableId: detail.asset.stableId,
        surface
      });
      return reply.code(principal ? 403 : 401).send({ error: "access_denied" });
    }

    const attachments = await attachmentRepository.listAttachments({
      tenantId: detail.asset.tenantId,
      assetId: detail.asset.id,
      limit: 100
    });
    return attachmentListResponseSchema.parse({
      attachments: attachments.map((attachment) => attachmentSchema.parse(attachment))
    });
  });

  server.post("/assets/:stableId/attachments", async (request, reply) => {
    if (!registryRepository || !authRepository || !attachmentRepository || !attachmentStorage) {
      return reply.code(503).send({ error: "attachments_unavailable" });
    }

    const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);
    if (!principal) return;

    const params = request.params as { stableId: string };
    const detail = await registryRepository.getAssetByStableId(params.stableId, { tenantId: principal.tenantId });
    if (!detail) return reply.code(404).send({ error: "asset_not_found" });

    const surface = readSurface(request, principal);
    const allowed = roleCanWriteAssets(principal) &&
      principalHasScope(principal, "asset:write") &&
      await authRepository.canAccessAsset({ principal, asset: detail.asset, action: "write", surface });
    if (!allowed) {
      await recordDenied(authRepository, principal, detail.asset.tenantId, "attachment.upload", "asset", detail.asset.id, {
        stableId: detail.asset.stableId,
        surface
      });
      return reply.code(403).send({ error: "access_denied" });
    }

    const metadata = attachmentUploadMetadataSchema.safeParse({
      filename: decodeAttachmentFilenameHeader(request.headers["x-forgetbase-attachment-filename-encoded"]),
      mediaType: request.headers["x-forgetbase-attachment-media-type"]
    });
    if (!metadata.success) return sendValidationError(reply, metadata.error.issues);
    if (!ALLOWED_ATTACHMENT_MEDIA_TYPES.has(metadata.data.mediaType)) {
      return reply.code(415).send({ error: "attachment_media_type_not_allowed" });
    }

    const content = Buffer.isBuffer(request.body) ? request.body : null;
    if (!content?.byteLength) {
      return reply.code(400).send({ error: "attachment_content_required" });
    }
    if (content.byteLength > attachmentMaxBytes) {
      return reply.code(413).send({ error: "attachment_too_large", maxBytes: attachmentMaxBytes });
    }

    const storageKey = generateAttachmentStorageKey();
    const contentSha256 = createHash("sha256").update(content).digest("hex");
    try {
      await attachmentStorage.put(storageKey, content);
    } catch {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "attachment.upload",
        targetType: "asset",
        targetId: detail.asset.id,
        outcome: "error",
        reason: "storage_write_failed",
        metadata: {
          stableId: detail.asset.stableId,
          mediaType: metadata.data.mediaType,
          sizeBytes: content.byteLength,
          contentSha256
        }
      });
      return reply.code(503).send({ error: "attachment_storage_unavailable" });
    }

    try {
      const attachment = await attachmentRepository.createAttachment({
        tenantId: detail.asset.tenantId,
        assetId: detail.asset.id,
        filename: metadata.data.filename,
        mediaType: metadata.data.mediaType,
        sizeBytes: content.byteLength,
        contentSha256,
        storageKey,
        uploadedByUserId: principal.userId ?? undefined,
        uploadedByServiceAccountId: principal.serviceAccountId ?? undefined,
        uploadedByApiKeyId: principal.apiKeyId
      });

      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "attachment.upload",
        targetType: "attachment",
        targetId: attachment.id,
        outcome: "success",
        metadata: {
          stableId: detail.asset.stableId,
          mediaType: attachment.mediaType,
          sizeBytes: attachment.sizeBytes,
          contentSha256: attachment.contentSha256
        }
      });
      return reply.code(201).send(attachmentSchema.parse(attachment));
    } catch {
      let orphanCleanupSucceeded = false;

      try {
        orphanCleanupSucceeded = await attachmentStorage.delete(storageKey);
      } catch {
        orphanCleanupSucceeded = false;
      }

      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "attachment.upload",
        targetType: "asset",
        targetId: detail.asset.id,
        outcome: "error",
        reason: "metadata_write_failed",
        metadata: {
          stableId: detail.asset.stableId,
          mediaType: metadata.data.mediaType,
          sizeBytes: content.byteLength,
          contentSha256,
          orphanCleanupSucceeded
        }
      }).catch(() => undefined);
      return reply.code(503).send({ error: "attachment_metadata_unavailable" });
    }
  });

  server.get("/assets/:stableId/attachments/:attachmentId/download", async (request, reply) => {
    if (!registryRepository || !authRepository || !attachmentRepository || !attachmentStorage) {
      return reply.code(503).send({ error: "attachments_unavailable" });
    }

    const params = request.params as { stableId: string; attachmentId: string };
    const principal = await authenticateOptionalPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);
    if (principal === undefined) return;
    const detail = await registryRepository.getAssetByStableId(params.stableId, { tenantId: principal?.tenantId });
    if (!detail) return reply.code(404).send({ error: "asset_not_found" });

    const surface = readSurface(request, principal);
    const allowed = await authRepository.canAccessAsset({ principal, asset: detail.asset, action: "read", surface });
    if (!allowed) {
      await recordDenied(authRepository, principal, detail.asset.tenantId, "attachment.download", "asset", detail.asset.id, {
        stableId: detail.asset.stableId,
        surface
      });
      return reply.code(principal ? 403 : 401).send({ error: "access_denied" });
    }

    const attachment = await attachmentRepository.getAttachment(params.attachmentId, {
      tenantId: detail.asset.tenantId
    });
    if (!attachment || attachment.assetId !== detail.asset.id) {
      return reply.code(404).send({ error: "attachment_not_found" });
    }

    let content: Buffer;
    try {
      content = await attachmentStorage.get(attachment.storageKey);
    } catch {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "attachment.download",
        targetType: "attachment",
        targetId: attachment.id,
        outcome: "error",
        reason: "storage_unavailable",
        metadata: { stableId: detail.asset.stableId }
      });
      return reply.code(503).send({ error: "attachment_storage_unavailable" });
    }

    const actualSha256 = createHash("sha256").update(content).digest("hex");
    if (content.byteLength !== attachment.sizeBytes || actualSha256 !== attachment.contentSha256) {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "attachment.download",
        targetType: "attachment",
        targetId: attachment.id,
        outcome: "error",
        reason: "integrity_check_failed",
        metadata: { stableId: detail.asset.stableId }
      });
      return reply.code(503).send({ error: "attachment_integrity_check_failed" });
    }

    await authRepository.recordAuditEvent({
      tenantId: detail.asset.tenantId,
      ...auditActor(principal),
      action: "attachment.download",
      targetType: "attachment",
      targetId: attachment.id,
      outcome: "success",
      metadata: { stableId: detail.asset.stableId, sizeBytes: attachment.sizeBytes }
    });
    reply.header("content-type", attachment.mediaType);
    reply.header("content-length", String(content.byteLength));
    reply.header("content-disposition", attachmentContentDisposition(attachment.filename));
    reply.header("x-content-type-options", "nosniff");
    reply.header("cache-control", "private, no-store");
    return reply.send(content);
  });

  server.delete("/assets/:stableId/attachments/:attachmentId", async (request, reply) => {
    if (!registryRepository || !authRepository || !attachmentRepository || !attachmentStorage) {
      return reply.code(503).send({ error: "attachments_unavailable" });
    }

    const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);
    if (!principal) return;
    const params = request.params as { stableId: string; attachmentId: string };
    const detail = await registryRepository.getAssetByStableId(params.stableId, { tenantId: principal.tenantId });
    if (!detail) return reply.code(404).send({ error: "asset_not_found" });

    const surface = readSurface(request, principal);
    const allowed = roleCanWriteAssets(principal) &&
      principalHasScope(principal, "asset:write") &&
      await authRepository.canAccessAsset({ principal, asset: detail.asset, action: "write", surface });
    if (!allowed) {
      await recordDenied(authRepository, principal, detail.asset.tenantId, "attachment.delete", "asset", detail.asset.id, {
        stableId: detail.asset.stableId,
        surface
      });
      return reply.code(403).send({ error: "access_denied" });
    }

    const existing = await attachmentRepository.getAttachment(params.attachmentId, {
      tenantId: detail.asset.tenantId,
      includeUnavailable: true
    });
    if (!existing || existing.assetId !== detail.asset.id || existing.lifecycleState === "deleted") {
      return reply.code(404).send({ error: "attachment_not_found" });
    }

    const deleting = await attachmentRepository.markAttachmentDeleting({
      tenantId: detail.asset.tenantId,
      attachmentId: existing.id,
      requestedByUserId: principal.userId ?? undefined,
      requestedByServiceAccountId: principal.serviceAccountId ?? undefined,
      requestedByApiKeyId: principal.apiKeyId
    });
    if (!deleting) return reply.code(409).send({ error: "attachment_delete_conflict" });

    try {
      await attachmentStorage.delete(deleting.storageKey);
    } catch {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "attachment.delete",
        targetType: "attachment",
        targetId: deleting.id,
        outcome: "error",
        reason: "storage_delete_failed",
        metadata: { stableId: detail.asset.stableId }
      });
      return reply.code(503).send({ error: "attachment_storage_unavailable" });
    }

    const deleted = await attachmentRepository.markAttachmentDeleted({
      tenantId: detail.asset.tenantId,
      attachmentId: deleting.id
    });
    if (!deleted) return reply.code(409).send({ error: "attachment_delete_conflict" });

    await authRepository.recordAuditEvent({
      tenantId: detail.asset.tenantId,
      ...auditActor(principal),
      action: "attachment.delete",
      targetType: "attachment",
      targetId: deleted.id,
      outcome: "success",
      metadata: { stableId: detail.asset.stableId, sizeBytes: deleted.sizeBytes }
    });
    return attachmentSchema.parse(deleted);
  });

  server.get("/assets/:stableId/versions/:versionNumber", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const params = request.params as { stableId: string; versionNumber: string };
    const versionNumber = Number.parseInt(params.versionNumber, 10);

    if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
      return reply.code(400).send({ error: "validation_error", issues: [{ path: "versionNumber", message: "Positive integer required" }] });
    }

    return sendAssetVersionSnapshot(
      request,
      reply,
      registryRepository,
      authRepository,
      loginSessionIdleTimeoutSeconds,
      params.stableId,
      { versionNumber }
    );
  });

  server.get("/assets/:stableId/versions/by-id/:versionId", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const params = request.params as { stableId: string; versionId: string };
    return sendAssetVersionSnapshot(
      request,
      reply,
      registryRepository,
      authRepository,
      loginSessionIdleTimeoutSeconds,
      params.stableId,
      { versionId: params.versionId }
    );
  });

  server.post("/assets", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    if (
      authRepository &&
      principal &&
      (!roleCanWriteAssets(principal) || !principalHasScope(principal, "asset:write"))
    ) {
      await recordDenied(authRepository, principal, principal.tenantId, "asset.create", "asset", undefined, {});
      return reply.code(403).send({ error: "access_denied" });
    }

    const parsed = assetCreateInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal?.tenantId ?? (request.body as { tenantId?: string } | undefined)?.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    try {
      const detail = await registryRepository.createAsset(parsed.data);
      if (retrievalRepository) {
        await retrievalRepository.indexAsset(detail);
      }
      const managedQueryCacheInvalidatedCount = await invalidateManagedQueryCacheForAssetChange(
        cacheRepository,
        detail.asset.tenantId
      );
      if (authRepository && principal) {
        await authRepository.recordAuditEvent({
          tenantId: detail.asset.tenantId,
          ...auditActor(principal),
          action: "asset.create",
          targetType: "asset",
          targetId: detail.asset.id,
          outcome: "success",
          metadata: {
            stableId: detail.asset.stableId,
            managedQueryCacheInvalidatedCount
          }
        });
      }
      return reply.code(201).send(assetDetailSchema.parse(detail));
    } catch (error) {
      if (error instanceof DuplicateAssetError) {
        return reply.code(409).send({ error: "asset_already_exists", message: error.message });
      }

      throw error;
    }
  });

  server.post("/assets/:stableId/versions", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    if (
      authRepository &&
      principal &&
      (!roleCanWriteAssets(principal) || !principalHasScope(principal, "asset:write"))
    ) {
      await recordDenied(authRepository, principal, principal.tenantId, "asset.update", "asset", undefined, {});
      return reply.code(403).send({ error: "access_denied" });
    }

    const params = request.params as { stableId: string };
    const parsed = assetUpdateInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal?.tenantId ?? (request.body as { tenantId?: string } | undefined)?.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const detail = await registryRepository.updateAsset(params.stableId, parsed.data);

    if (!detail) {
      return reply.code(404).send({ error: "asset_not_found" });
    }

    if (retrievalRepository) {
      await retrievalRepository.indexAsset(detail);
    }
    const managedQueryCacheInvalidatedCount = await invalidateManagedQueryCacheForAssetChange(
      cacheRepository,
      detail.asset.tenantId
    );
    if (authRepository && principal) {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "asset.update",
        targetType: "asset",
        targetId: detail.asset.id,
        outcome: "success",
        metadata: {
          stableId: detail.asset.stableId,
          currentVersionId: detail.asset.currentVersionId,
          managedQueryCacheInvalidatedCount
        }
      });
    }

    return assetDetailSchema.parse(detail);
  });

  server.post("/assets/:stableId/review", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    if (
      authRepository &&
      principal &&
      (!roleCanWriteAssets(principal) || !principalHasScope(principal, "asset:write"))
    ) {
      await recordDenied(authRepository, principal, principal.tenantId, "asset.review", "asset", undefined, {});
      return reply.code(403).send({ error: "access_denied" });
    }

    const params = request.params as { stableId: string };
    const parsed = assetReviewInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal?.tenantId ?? (request.body as { tenantId?: string } | undefined)?.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const detail = await registryRepository.reviewAsset(params.stableId, parsed.data);

    if (!detail) {
      return reply.code(404).send({ error: "asset_not_found" });
    }

    if (retrievalRepository) {
      await retrievalRepository.indexAsset(detail);
    }
    const managedQueryCacheInvalidatedCount = await invalidateManagedQueryCacheForAssetChange(
      cacheRepository,
      detail.asset.tenantId
    );
    if (authRepository && principal) {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "asset.review",
        targetType: "asset",
        targetId: detail.asset.id,
        outcome: "success",
        metadata: {
          stableId: detail.asset.stableId,
          currentVersionId: detail.asset.currentVersionId,
          status: detail.asset.status,
          reviewDueAt: detail.asset.reviewDueAt,
          sourceRef: detail.asset.sourceRef,
          changeNote: parsed.data.changeNote ?? null,
          managedQueryCacheInvalidatedCount
        }
      });
    }

    return assetDetailSchema.parse(detail);
  });

  server.post("/assets/:stableId/publish", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    if (
      authRepository &&
      principal &&
      (!roleCanWriteAssets(principal) || !principalHasScope(principal, "asset:write"))
    ) {
      await recordDenied(authRepository, principal, principal.tenantId, "asset.publish", "asset", undefined, {});
      return reply.code(403).send({ error: "access_denied" });
    }

    const params = request.params as { stableId: string };
    const parsed = assetPublishInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal?.tenantId ?? (request.body as { tenantId?: string } | undefined)?.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const detail = await registryRepository.publishAsset(params.stableId, parsed.data);

    if (!detail) {
      return reply.code(404).send({ error: "asset_not_found" });
    }

    if (retrievalRepository) {
      await retrievalRepository.indexAsset(detail);
    }
    const managedQueryCacheInvalidatedCount = await invalidateManagedQueryCacheForAssetChange(
      cacheRepository,
      detail.asset.tenantId
    );
    if (authRepository && principal) {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "asset.publish",
        targetType: "asset",
        targetId: detail.asset.id,
        outcome: "success",
        metadata: {
          stableId: detail.asset.stableId,
          currentVersionId: detail.asset.currentVersionId,
          lifecycleState: detail.asset.lifecycleState,
          status: detail.asset.status,
          reviewDueAt: detail.asset.reviewDueAt,
          changeNote: parsed.data.changeNote ?? null,
          managedQueryCacheInvalidatedCount
        }
      });
    }

    return assetDetailSchema.parse(detail);
  });

  server.post("/assets/:stableId/restore", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    if (
      authRepository &&
      principal &&
      (!roleCanWriteAssets(principal) || !principalHasScope(principal, "asset:write"))
    ) {
      await recordDenied(authRepository, principal, principal.tenantId, "asset.restore", "asset", undefined, {});
      return reply.code(403).send({ error: "access_denied" });
    }

    const params = request.params as { stableId: string };
    const parsed = assetRestoreInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal?.tenantId ?? (request.body as { tenantId?: string } | undefined)?.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const detail = await registryRepository.restoreAssetVersion(params.stableId, parsed.data);

    if (!detail) {
      return reply.code(404).send({ error: "asset_or_version_not_found" });
    }

    if (retrievalRepository) {
      await retrievalRepository.indexAsset(detail);
    }
    const managedQueryCacheInvalidatedCount = await invalidateManagedQueryCacheForAssetChange(
      cacheRepository,
      detail.asset.tenantId
    );
    if (authRepository && principal) {
      await authRepository.recordAuditEvent({
        tenantId: detail.asset.tenantId,
        ...auditActor(principal),
        action: "asset.restore",
        targetType: "asset",
        targetId: detail.asset.id,
        outcome: "success",
        metadata: {
          stableId: detail.asset.stableId,
          currentVersionId: detail.asset.currentVersionId,
          requestedVersionId: parsed.data.versionId ?? null,
          requestedVersionNumber: parsed.data.versionNumber ?? null,
          managedQueryCacheInvalidatedCount
        }
      });
    }

    return assetDetailSchema.parse(detail);
  });

  server.post("/assets/:stableId/grants", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requirePermissionAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { stableId: string };
    const parsed = permissionGrantCreateInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      stableId: params.stableId,
      tenantId: principal.tenantId,
      createdBy: principal.principalId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const grant = await authRepository.createPermissionGrant(parsed.data);
    await authRepository.recordAuditEvent({
      tenantId: grant.tenantId,
      ...auditActor(principal),
      action: "permission.grant",
      targetType: "asset",
      targetId: grant.assetId,
      outcome: "success",
      metadata: {
        stableId: grant.stableId,
        principalType: grant.principalType,
        principalId: grant.principalId,
        permissionAction: grant.action,
        surfaces: grant.surfaces
      }
    });

    return reply.code(201).send(grant);
  });

  server.get("/audit/events", async (request, reply) => {
    if (!authRepository) {
      return reply.code(503).send({ error: "auth_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const events = await authRepository.listAuditEvents({ tenantId: principal.tenantId, limit });

    return {
      events: events.map((event) => auditEventSchema.parse(event))
    };
  });

  server.get("/search", async (request, reply) => {
    if (!retrievalRepository) {
      return reply.code(503).send({ error: "retrieval_unavailable" });
    }

    const query = request.query as {
      query?: string;
      q?: string;
      limit?: string;
      tenantId?: string;
      strategy?: string;
    };
    const principal = await authenticateOptionalPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (principal === undefined) {
      return;
    }

    const surface = readSurface(request, principal);

    const parsed = searchInputSchema.safeParse({
      tenantId: principal?.tenantId ?? query.tenantId,
      query: query.query ?? query.q,
      limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
      strategy: query.strategy
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const { allowedResults, telemetryEventId } = await runPermissionedSearch({
      retrievalRepository,
      authRepository,
      piiRedactionPolicyRepository,
      principal,
      input: parsed.data,
      surface,
      queryKind: "search"
    });

    return searchResponseSchema.parse({
      query: parsed.data.query,
      results: allowedResults,
      telemetryEventId
    });
  });

  server.post("/agent/query", async (request, reply) => {
    if (!retrievalRepository) {
      return reply.code(503).send({ error: "retrieval_unavailable" });
    }

    const principal = await authenticateOptionalPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (principal === undefined) {
      return;
    }

    const surface = readSurface(request, principal);

    const parsed = managedQueryInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal?.tenantId ?? (request.body as { tenantId?: string } | undefined)?.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const managedQueryPolicy = await readManagedQueryPolicy(
      managedQueryPolicyRepository,
      principal?.tenantId ?? parsed.data.tenantId
    );
    const policyApplication = applyManagedQueryPolicy({
      requestedMode: parsed.data.mode,
      policy: managedQueryPolicy
    });
    const queryInput = {
      ...parsed.data,
      mode: policyApplication.mode
    };

    if (queryInput.mode === "provider-routed" && authRepository && !principal) {
      return reply.code(401).send({ error: "authentication_required" });
    }

    const { allowedResults, deniedCount, telemetryEventId } = await runPermissionedSearch({
      retrievalRepository,
      authRepository,
      piiRedactionPolicyRepository,
      principal,
      input: queryInput,
      surface,
      queryKind: "managed-query"
    });
    const citations = dedupeCitations(allowedResults);
    const deterministicAnswer = buildDeterministicAnswer(queryInput.query, allowedResults);
    const policyGate = evaluateManagedQueryPolicyGate({
      policy: managedQueryPolicy,
      citationCount: citations.length,
      resultCount: allowedResults.length
    });
    const providerResult = queryInput.mode === "provider-routed" && !policyGate.providerSkipReason
      ? await runProviderManagedQuery({
        providerConfigRepository,
        cacheRepository,
        cachePolicyRepository,
        piiRedactionPolicyRepository,
        modelRuntime,
        tenantId: queryInput.tenantId,
        principal,
        surface,
        limit: queryInput.limit,
        requestedProvider: queryInput.provider,
        requestedModel: queryInput.model,
        cacheRequested: queryInput.cache,
        query: queryInput.query,
        allowedResults
      })
      : queryInput.mode === "provider-routed"
        ? skippedProviderManagedQuery(
          queryInput.provider ?? null,
          queryInput.model ?? null,
          policyGate.providerSkipReason ?? "tenant_policy_skipped_provider_generation"
        )
        : {
          answer: null,
          generation: {
            provider: null,
            model: null,
            status: "not-requested" as const,
            reason: null,
            latencyMs: null,
            usage: emptyGenerationUsage(),
            attempts: []
          },
          cache: emptyManagedQueryCache("disabled", "not_provider_routed"),
          preflightEstimate: null,
          attempts: [],
          warnings: []
        };
    const warnings = [
      ...policyApplication.warnings,
      ...policyGate.warnings,
      ...(allowedResults.length ? [] : ["No permitted retrieval context matched the query."]),
      ...(deniedCount ? [`${deniedCount} candidate result(s) were filtered by permissions.`] : []),
      ...providerResult.warnings
    ];

    if (queryInput.mode === "provider-routed" && authRepository) {
      const managedQueryRetentionPolicy = await readManagedQueryRetentionPolicy(
        managedQueryRetentionPolicyRepository,
        principal?.tenantId ?? queryInput.tenantId
      );
      const retention = buildManagedQueryRetentionMetadata({
        policy: managedQueryRetentionPolicy,
        prompt: buildManagedQueryPrompt(queryInput.query, allowedResults),
        response: providerResult.answer
      });

      await authRepository.recordAuditEvent({
        tenantId: principal?.tenantId ?? queryInput.tenantId,
        ...auditActor(principal),
        action: "agent.query.generate",
        targetType: "model_provider",
        targetId: providerResult.generation.provider ?? queryInput.provider,
        outcome: providerResult.generation.status === "completed" ? "success" : "error",
        reason: providerResult.generation.reason ?? undefined,
        metadata: {
          mode: queryInput.mode,
          requestedMode: parsed.data.mode,
          requestedProvider: queryInput.provider ?? null,
          provider: providerResult.generation.provider,
          requestedModel: queryInput.model ?? null,
          model: providerResult.generation.model,
          generationStatus: providerResult.generation.status,
          telemetryEventId,
          resultCount: allowedResults.length,
          citationCount: citations.length,
          deniedCount,
          latencyMs: providerResult.generation.latencyMs,
          usage: providerResult.generation.usage,
          attempts: providerResult.attempts,
          cache: providerResult.cache,
          preflightEstimate: providerResult.preflightEstimate,
          policy: {
            defaultMode: managedQueryPolicy.defaultMode,
            allowedModes: managedQueryPolicy.allowedModes,
            minimumCitationCount: managedQueryPolicy.minimumCitationCount,
            requireGrounded: managedQueryPolicy.requireGrounded,
            providerSkipReason: policyGate.providerSkipReason
          },
          retention
        }
      });
    }

    return managedQueryResponseSchema.parse({
      query: queryInput.query,
      mode: queryInput.mode,
      answer: providerResult.answer ?? deterministicAnswer,
      results: allowedResults,
      citations,
      telemetryEventId,
      checks: {
        grounded: allowedResults.length > 0,
        resultCount: allowedResults.length,
        citationCount: citations.length,
        deniedCount
      },
      generation: providerResult.generation,
      cache: providerResult.cache,
      warnings
    });
  });

  server.post("/agent/query/feedback", async (request, reply) => {
    if (!feedbackRepository) {
      return reply.code(503).send({ error: "feedback_unavailable" });
    }

    const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = managedQueryFeedbackInputSchema.safeParse({
      ...body,
      tenantId: principal?.tenantId ?? body.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const piiRedactionPolicy = await readPiiRedactionPolicy(piiRedactionPolicyRepository, parsed.data.tenantId);
    const redactedQuery = redactText(parsed.data.query, piiRedactionPolicy);
    const redactedNotes = parsed.data.notes ? redactText(parsed.data.notes, piiRedactionPolicy) : null;
    const feedback = await feedbackRepository.recordFeedback({
      ...parsed.data,
      ...auditActor(principal),
      query: redactedQuery.text,
      notes: redactedNotes?.text,
      metadata: {
        ...parsed.data.metadata,
        feedbackRedaction: {
          query: {
            applied: redactedQuery.redacted,
            findings: redactedQuery.findings
          },
          notes: redactedNotes
            ? {
              applied: redactedNotes.redacted,
              findings: redactedNotes.findings
            }
            : null
        }
      }
    });

    if (authRepository) {
      await authRepository.recordAuditEvent({
        tenantId: feedback.tenantId,
        ...auditActor(principal),
        action: "agent.query.feedback",
        targetType: "retrieval_event",
        targetId: feedback.telemetryEventId,
        outcome: "success",
        metadata: {
          feedbackId: feedback.id,
          feedbackOutcome: feedback.outcome,
          scores: feedbackScores(feedback)
        }
      });
    }

    return reply.code(201).send(managedQueryFeedbackSchema.parse(feedback));
  });

  server.get("/agent/query/feedback", async (request, reply) => {
    if (!authRepository || !feedbackRepository) {
      return reply.code(503).send({ error: "feedback_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const feedback = await feedbackRepository.listFeedback({
      tenantId: principal.tenantId,
      limit
    });

    return managedQueryFeedbackListResponseSchema.parse({
      feedback
    });
  });

  server.get("/agent/evals/summary", async (request, reply) => {
    if (!evalRunRepository) {
      return reply.code(503).send({ error: "managed_query_eval_runs_unavailable" });
    }

    const principal = authRepository ? await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    const parsed = managedQueryEvalAnalyticsInputSchema.safeParse({
      ...(request.query as Record<string, unknown>),
      tenantId: principal?.tenantId ?? "tenant_demo"
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    return managedQueryEvalAnalyticsSummarySchema.parse(await buildManagedQueryEvalAnalyticsSummary({
      input: parsed.data,
      evalRunRepository
    }));
  });

  server.get("/agent/evals/runs", async (request, reply) => {
    if (!evalRunRepository) {
      return reply.code(503).send({ error: "managed_query_eval_runs_unavailable" });
    }

    const principal = authRepository ? await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const runs = await evalRunRepository.listRuns({
      tenantId: principal?.tenantId ?? "tenant_demo",
      limit
    });

    return managedQueryEvalRunListResponseSchema.parse({
      runs
    });
  });

	  server.post("/agent/evals/run", async (request, reply) => {
    if (!retrievalRepository) {
      return reply.code(503).send({ error: "retrieval_unavailable" });
    }

    const principal = authRepository ? await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

    if (authRepository && !principal) {
      return;
    }

    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = managedQueryEvalInputSchema.safeParse({
      ...body,
      tenantId: principal?.tenantId ?? body.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const results = [];

    for (const evalCase of parsed.data.cases) {
      const { allowedResults, deniedCount, telemetryEventId } = await runPermissionedSearch({
        retrievalRepository,
        authRepository,
        piiRedactionPolicyRepository,
        principal,
        input: {
          tenantId: parsed.data.tenantId,
          query: evalCase.query,
          limit: parsed.data.limit
        },
        surface: "api",
        queryKind: "managed-query-eval"
      });
      const citations = dedupeCitations(allowedResults);
      const warnings = [
        ...(allowedResults.length ? [] : ["No permitted retrieval context matched the eval query."]),
        ...(deniedCount ? [`${deniedCount} candidate result(s) were filtered by permissions.`] : [])
      ];

      results.push(evaluateManagedQueryCase(evalCase, {
        resultStableIds: uniqueStableIds(allowedResults),
        citationCount: citations.length,
        grounded: allowedResults.length > 0,
        telemetryEventId,
        warnings
      }));
    }

    const passedCount = results.filter((result) => result.passed).length;
    const passRate = calculatePassRate(passedCount, results.length);
    const tagResults = buildManagedQueryEvalTagResults(results);
    const overallThreshold = buildManagedQueryEvalThresholdResult({
      scope: "overall",
      tag: null,
      minimumPassRate: parsed.data.minimumPassRate,
      caseCount: results.length,
      passedCount,
      failedCount: results.length - passedCount
    });
    const tagThresholdResults = Object.entries(parsed.data.tagMinimumPassRates)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tag, minimumPassRate]) => {
        const tagResult = tagResults.find((result) => result.tag === tag);

        return buildManagedQueryEvalThresholdResult({
          scope: "tag",
          tag,
          minimumPassRate,
          caseCount: tagResult?.caseCount ?? 0,
          passedCount: tagResult?.passedCount ?? 0,
          failedCount: tagResult?.failedCount ?? 0
        });
      });
    const thresholdPassed = overallThreshold.passed &&
      tagThresholdResults.every((result) => result.passed);
    const report = managedQueryEvalReportSchema.parse({
      ok: thresholdPassed,
      mode: "deterministic-retrieval",
      checkedAt: new Date().toISOString(),
      tenantId: parsed.data.tenantId,
      caseCount: results.length,
      passedCount,
      failedCount: results.length - passedCount,
      passRate,
      minimumPassRate: parsed.data.minimumPassRate,
      thresholdPassed,
      tagResults,
      tagThresholdResults,
      results
    });
    const evalRun = evalRunRepository
      ? await recordManagedQueryEvalRun({
        evalRunRepository,
        piiRedactionPolicyRepository,
        principal,
        report
      })
      : null;

    if (authRepository) {
      await authRepository.recordAuditEvent({
        tenantId: report.tenantId,
        ...auditActor(principal),
        action: "agent.eval.run",
        targetType: "managed_query_eval",
        targetId: evalRun?.id,
        outcome: report.ok ? "success" : "error",
        metadata: {
          evalRunId: evalRun?.id ?? null,
          caseCount: report.caseCount,
          passedCount: report.passedCount,
          failedCount: report.failedCount,
          passRate: report.passRate,
          minimumPassRate: report.minimumPassRate,
          thresholdPassed: report.thresholdPassed,
          tagThresholdResults: report.tagThresholdResults
        }
	      });
	    }

	    return report;
	  });

  server.get("/admin/managed-query-eval-schedule-policy", async (request, reply) => {
    if (!authRepository || !managedQueryEvalSchedulePolicyRepository) {
      return reply.code(503).send({ error: "managed_query_eval_schedule_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return managedQueryEvalSchedulePolicySchema.parse(
      await managedQueryEvalSchedulePolicyRepository.getPolicy(principal.tenantId)
    );
  });

  server.put("/admin/managed-query-eval-schedule-policy", async (request, reply) => {
    if (!authRepository || !managedQueryEvalSchedulePolicyRepository) {
      return reply.code(503).send({ error: "managed_query_eval_schedule_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = managedQueryEvalSchedulePolicyInputSchema.safeParse({
      ...((request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    let policy: ManagedQueryEvalSchedulePolicy;

    try {
      policy = await managedQueryEvalSchedulePolicyRepository.upsertPolicy({
        ...parsed.data,
        updatedByUserId: principal.userId ?? undefined,
        updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
        updatedByApiKeyId: principal.apiKeyId
      });
    } catch (error) {
      if (error instanceof ManagedQueryEvalSchedulePolicyError) {
        return reply.code(400).send({
          error: error.code,
          message: "Scheduled eval policy requires eval input before it can be enabled."
        });
      }

      throw error;
    }

    await authRepository.recordAuditEvent({
      tenantId: policy.tenantId,
      ...auditActor(principal),
      action: "admin.managed_query_eval_schedule_policy.update",
      targetType: "managed_query_eval_schedule_policy",
      targetId: policy.tenantId,
      outcome: "success",
      metadata: {
        enabled: policy.enabled,
        intervalMinutes: policy.intervalMinutes,
        caseCount: policy.evalInput?.cases.length ?? 0,
        minimumPassRate: policy.evalInput?.minimumPassRate ?? null,
        tagThresholdCount: policy.evalInput ? Object.keys(policy.evalInput.tagMinimumPassRates).length : 0
      }
    });

    return managedQueryEvalSchedulePolicySchema.parse(policy);
  });

  server.get("/admin/action-execution-policy", async (request, reply) => {
    if (!authRepository || !actionExecutionRepository) {
      return reply.code(503).send({ error: "action_execution_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return agentActionExecutionPolicySchema.parse(
      await actionExecutionRepository.getPolicy(principal.tenantId)
    );
  });

  server.put("/admin/action-execution-policy", async (request, reply) => {
    if (!authRepository || !actionExecutionRepository) {
      return reply.code(503).send({ error: "action_execution_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = agentActionExecutionPolicyInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await actionExecutionRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId ?? undefined
    });

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "admin.action_execution_policy.update",
      targetType: "action_execution_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: buildActionPolicySnapshot(policy)
    });

    return agentActionExecutionPolicySchema.parse(policy);
  });

  server.get("/agent/actions", async (request, reply) => {
    if (!authRepository || !actionExecutionRepository) {
      return reply.code(503).send({ error: "action_execution_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const actions = await actionExecutionRepository.listRequests({
      tenantId: principal.tenantId,
      limit
    });

    return agentActionRequestListResponseSchema.parse({ actions });
  });

  server.post("/agent/actions/execute", async (request, reply) => {
    if (!actionExecutionRepository) {
      return reply.code(503).send({ error: "action_execution_unavailable" });
    }

    const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    if (!principalHasScope(principal, "agent:execute")) {
      if (authRepository) {
        await recordDenied(authRepository, principal, principal.tenantId, "agent.action.execute_request", "agent_action", undefined, {});
      }
      return reply.code(403).send({ error: "access_denied" });
    }

    const parsed = agentActionExecuteInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    if (parsed.data.idempotencyKey) {
      const existing = await actionExecutionRepository.getRequestByIdempotencyKey({
        tenantId: principal.tenantId,
        idempotencyKey: parsed.data.idempotencyKey,
        requestedByUserId: principal.userId,
        requestedByServiceAccountId: principal.serviceAccountId
      });

      if (existing) {
        if (authRepository) {
          await authRepository.recordAuditEvent({
            tenantId: principal.tenantId,
            ...auditActor(principal),
            action: "agent.action.execute_request",
            targetType: "agent_action",
            targetId: existing.id,
            outcome: "success",
            reason: "action_request_idempotent_replay",
            metadata: {
              actionType: existing.actionType,
              status: existing.status,
              dryRun: existing.dryRun,
              idempotencyKeyHash: hashActionIdempotencyKey(parsed.data.idempotencyKey),
              approvalExpiresAt: existing.approvalExpiresAt,
              externalSideEffects: existing.result.externalSideEffects ?? false
            }
          });
        }

        return reply.code(200).send(agentActionRequestSchema.parse(existing));
      }
    }

    const policy = await readAgentActionExecutionPolicy(actionExecutionRepository, principal.tenantId);
    const rateWindowStartedAt = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequestCount = await actionExecutionRepository.countRequestsSince(
      principal.tenantId,
      rateWindowStartedAt
    );

    if (recentRequestCount >= policy.maxRequestsPerHour) {
      if (authRepository) {
        await authRepository.recordAuditEvent({
          tenantId: principal.tenantId,
          ...auditActor(principal),
          action: "agent.action.execute_request",
          targetType: "agent_action",
          outcome: "denied",
          reason: "action_rate_limit_exceeded",
          metadata: {
            actionType: parsed.data.actionType,
            maxRequestsPerHour: policy.maxRequestsPerHour,
            recentRequestCount,
            rateWindowStartedAt: rateWindowStartedAt.toISOString()
          }
        });
      }

      return reply.code(429).send({
        error: "action_rate_limit_exceeded",
        maxRequestsPerHour: policy.maxRequestsPerHour,
        recentRequestCount
      });
    }

    const evaluation = evaluateAgentActionExecution({
      policy,
      actionType: parsed.data.actionType,
      requestedDryRun: parsed.data.dryRun
    });
    const piiRedactionPolicy = await readPiiRedactionPolicy(piiRedactionPolicyRepository, principal.tenantId);
    const redactedActionContent = redactActionRequestContent({
      payload: parsed.data.payload,
      metadata: parsed.data.metadata,
      piiRedactionPolicy
    });
    const action = await actionExecutionRepository.createRequest({
      ...parsed.data,
      payload: redactedActionContent.payload,
      metadata: redactedActionContent.metadata,
      status: evaluation.status,
      dryRun: evaluation.dryRun,
      result: evaluation.result,
      reason: evaluation.reason,
      policySnapshot: buildActionPolicySnapshot(policy),
      approvalExpiresAt: evaluation.status === "approval-required"
        ? buildActionApprovalExpiresAt(policy)
        : null,
      requestedByUserId: principal.userId ?? undefined,
      requestedByServiceAccountId: principal.serviceAccountId ?? undefined,
      requestedByApiKeyId: principal.apiKeyId ?? undefined
    });

    if (authRepository) {
      await authRepository.recordAuditEvent({
        tenantId: principal.tenantId,
        ...auditActor(principal),
        action: "agent.action.execute_request",
        targetType: "agent_action",
        targetId: action.id,
        outcome: action.status === "blocked" ? "denied" : "success",
        reason: action.reason ?? undefined,
        metadata: {
          actionType: action.actionType,
          status: action.status,
          dryRun: action.dryRun,
          idempotencyKeyHash: action.idempotencyKey ? hashActionIdempotencyKey(action.idempotencyKey) : undefined,
          approvalExpiresAt: action.approvalExpiresAt,
          externalSideEffects: action.result.externalSideEffects ?? false,
          actionRequestRedaction: redactedActionContent.redaction ?? undefined
        }
      });
    }

    return reply.code(201).send(agentActionRequestSchema.parse(action));
  });

  server.post("/agent/actions/:actionRequestId/decision", async (request, reply) => {
    if (!authRepository || !actionExecutionRepository) {
      return reply.code(503).send({ error: "action_execution_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { actionRequestId?: string };
    const parsed = agentActionDecisionInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      actionRequestId: params.actionRequestId,
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const current = await actionExecutionRepository.getRequest(principal.tenantId, parsed.data.actionRequestId);

    if (!current) {
      return reply.code(404).send({ error: "action_request_not_found" });
    }

    if (current.status !== "approval-required") {
      return reply.code(409).send({
        error: "action_request_not_awaiting_approval",
        status: current.status
      });
    }

    const approved = parsed.data.decision === "approve";

    if (approved && isActionApprovalExpired(current)) {
      const expired = await actionExecutionRepository.decideRequest({
        ...parsed.data,
        reason: "approval_expired",
        status: "expired",
        result: {
          approved: false,
          expired: true,
          externalSideEffects: false
        },
        metadata: {
          ...parsed.data.metadata,
          attemptedDecision: parsed.data.decision,
          approvalExpiresAt: current.approvalExpiresAt
        },
        decidedByUserId: principal.userId ?? undefined,
        decidedByServiceAccountId: principal.serviceAccountId ?? undefined,
        decidedByApiKeyId: principal.apiKeyId ?? undefined
      });

      if (!expired) {
        return reply.code(404).send({ error: "action_request_not_found" });
      }

      await authRepository.recordAuditEvent({
        tenantId: principal.tenantId,
        ...auditActor(principal),
        action: "agent.action.decision",
        targetType: "agent_action",
        targetId: expired.id,
        outcome: "denied",
        reason: "approval_expired",
        metadata: {
          decision: parsed.data.decision,
          status: expired.status,
          actionType: expired.actionType,
          approvalExpiresAt: expired.approvalExpiresAt,
          externalSideEffects: expired.result.externalSideEffects ?? false
        }
      });

      return reply.code(409).send({
        error: "action_request_approval_expired",
        status: expired.status,
        approvalExpiresAt: expired.approvalExpiresAt,
        action: agentActionRequestSchema.parse(expired)
      });
    }

    const approval = approved
      ? buildActionApprovalResult(current)
      : {
        status: "denied" as const,
        result: {
          approved: false,
          externalSideEffects: false
        }
      };
    const action = await actionExecutionRepository.decideRequest({
      ...parsed.data,
      status: approval.status,
      result: approval.result,
      decidedByUserId: principal.userId ?? undefined,
      decidedByServiceAccountId: principal.serviceAccountId ?? undefined,
      decidedByApiKeyId: principal.apiKeyId ?? undefined
    });

    if (!action) {
      return reply.code(404).send({ error: "action_request_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "agent.action.decision",
      targetType: "agent_action",
      targetId: action.id,
      outcome: approved ? "success" : "denied",
      reason: action.reason ?? undefined,
      metadata: {
        decision: parsed.data.decision,
        status: action.status,
        actionType: action.actionType,
        approvalExpiresAt: action.approvalExpiresAt,
        externalSideEffects: action.result.externalSideEffects ?? false
      }
    });

    return agentActionRequestSchema.parse(action);
  });

	  server.get("/admin/secret-reference-policy", async (request, reply) => {
    if (!authRepository || !secretReferencePolicyRepository) {
      return reply.code(503).send({ error: "secret_reference_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return secretReferencePolicySchema.parse(await secretReferencePolicyRepository.getPolicy(principal.tenantId));
  });

  server.put("/admin/secret-reference-policy", async (request, reply) => {
    if (!authRepository || !secretReferencePolicyRepository) {
      return reply.code(503).send({ error: "secret_reference_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = secretReferencePolicyInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await secretReferencePolicyRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId
    });

    await authRepository.recordAuditEvent({
      tenantId: policy.tenantId,
      ...auditActor(principal),
      action: "admin.secret_reference_policy.update",
      targetType: "secret_reference_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        allowedEnvVarPrefixes: policy.allowedEnvVarPrefixes,
        allowedEnvVars: policy.allowedEnvVars,
        allowUnlistedEnvVars: policy.allowUnlistedEnvVars
      }
    });

    return secretReferencePolicySchema.parse(policy);
  });

  server.get("/admin/pii-redaction-policy", async (request, reply) => {
    if (!authRepository || !piiRedactionPolicyRepository) {
      return reply.code(503).send({ error: "pii_redaction_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return piiRedactionPolicySchema.parse(await piiRedactionPolicyRepository.getPolicy(principal.tenantId));
  });

  server.put("/admin/pii-redaction-policy", async (request, reply) => {
    if (!authRepository || !piiRedactionPolicyRepository) {
      return reply.code(503).send({ error: "pii_redaction_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = piiRedactionPolicyInputSchema.safeParse({
      ...(request.body as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await piiRedactionPolicyRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId
    });

    await authRepository.recordAuditEvent({
      tenantId: policy.tenantId,
      ...auditActor(principal),
      action: "admin.pii_redaction_policy.update",
      targetType: "pii_redaction_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        redactionEnabled: policy.redactionEnabled,
        enabledRuleKinds: policy.enabledRuleKinds
      }
    });

    return piiRedactionPolicySchema.parse(policy);
  });

  server.get("/admin/model-providers", async (request, reply) => {
    if (!authRepository || !providerConfigRepository) {
      return reply.code(503).send({ error: "provider_config_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const providers = await providerConfigRepository.listProviderConfigs({
      tenantId: principal.tenantId
    });

    return modelProviderConfigListResponseSchema.parse({
      providers
    });
  });

  server.get("/admin/model-providers/health", async (request, reply) => {
    if (!authRepository || !providerConfigRepository) {
      return reply.code(503).send({ error: "provider_config_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const providers = await providerConfigRepository.listProviderConfigs({
      tenantId: principal.tenantId
    });

    return modelProviderHealthListResponseSchema.parse({
      providers: await buildModelProviderHealth({
        tenantId: principal.tenantId,
        providers,
        checkedAt: new Date().toISOString()
      })
    });
  });

  server.put("/admin/model-providers/:provider", async (request, reply) => {
    if (!authRepository || !providerConfigRepository) {
      return reply.code(503).send({ error: "provider_config_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { provider?: string };
    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = modelProviderConfigInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId,
      provider: params.provider
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    if (hasSecretLikeMetadataKey(parsed.data.metadata)) {
      return reply.code(400).send({
        error: "secret_metadata_rejected",
        message: "Provider config metadata must not store secret, token, password, or API key values."
      });
    }

    const secretReferencePolicy = await readSecretReferencePolicy(
      secretReferencePolicyRepository,
      principal.tenantId
    );

    if (!isSecretEnvVarAllowed(secretReferencePolicy, parsed.data.apiKeyEnvVar)) {
      return reply.code(400).send({
        error: "secret_reference_rejected",
        message: "Provider config env-var reference is not allowed by tenant secret-reference policy.",
        field: "apiKeyEnvVar"
      });
    }

    const config = await providerConfigRepository.upsertProviderConfig(parsed.data);

    await authRepository.recordAuditEvent({
      tenantId: config.tenantId,
      ...auditActor(principal),
      action: "admin.model_provider_config.upsert",
      targetType: "model_provider",
      targetId: config.provider,
      outcome: "success",
      metadata: {
        enabled: config.enabled,
        defaultModel: config.defaultModel,
        apiKeyEnvVar: config.apiKeyEnvVar,
        priority: config.priority
      }
    });

    return modelProviderConfigSchema.parse(config);
  });

  server.get("/admin/auth-providers", async (request, reply) => {
    if (!authRepository || !authProviderConfigRepository) {
      return reply.code(503).send({ error: "auth_provider_config_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const authProviders = await authProviderConfigRepository.listAuthProviderConfigs({
      tenantId: principal.tenantId
    });

    return authProviderConfigListResponseSchema.parse({
      authProviders
    });
  });

  server.put("/admin/auth-providers/:provider", async (request, reply) => {
    if (!authRepository || !authProviderConfigRepository) {
      return reply.code(503).send({ error: "auth_provider_config_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { provider?: string };
    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = authProviderConfigInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId,
      provider: params.provider
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    if (hasSecretLikeMetadataKey(parsed.data.metadata)) {
      return reply.code(400).send({
        error: "secret_metadata_rejected",
        message: "Auth provider config metadata must not store secret, token, password, or API key values."
      });
    }

    const secretReferencePolicy = await readSecretReferencePolicy(
      secretReferencePolicyRepository,
      principal.tenantId
    );

    if (!isSecretEnvVarAllowed(secretReferencePolicy, parsed.data.clientSecretEnvVar)) {
      return reply.code(400).send({
        error: "secret_reference_rejected",
        message: "Auth provider config env-var reference is not allowed by tenant secret-reference policy.",
        field: "clientSecretEnvVar"
      });
    }

    const config = await authProviderConfigRepository.upsertAuthProviderConfig(parsed.data);

    await authRepository.recordAuditEvent({
      tenantId: config.tenantId,
      ...auditActor(principal),
      action: "admin.auth_provider_config.upsert",
      targetType: "auth_provider",
      targetId: config.provider,
      outcome: "success",
      metadata: {
        enabled: config.enabled,
        issuerUrl: config.issuerUrl,
        clientSecretEnvVar: config.clientSecretEnvVar,
	        defaultRole: config.defaultRole,
	        autoProvisionUsers: config.autoProvisionUsers,
	        accountLinkingMode: config.accountLinkingMode,
	        groupSyncEnabled: config.groupSyncEnabled,
	        priority: config.priority
      }
    });

    return authProviderConfigSchema.parse(config);
  });

  server.get("/exports/ai-package", async (request, reply) => {
    if (!registryRepository) {
      return reply.code(503).send({ error: "registry_unavailable" });
    }

    const query = request.query as { package?: string; limit?: string; format?: string; okfVersion?: string };
    const packageName = query.package || "demo-agent-pack";
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 200;
    const formatResult = aiExportFormatSchema.safeParse(query.format ?? "json");

    if (!formatResult.success) {
      return reply.code(400).send({ error: "invalid_export_format" });
    }

    const okfVersionResult = okfVersionSchema.safeParse(query.okfVersion ?? "0.1");

    if (!okfVersionResult.success) {
      return reply.code(400).send({ error: "unsupported_okf_version" });
    }

    const format = formatResult.data;
    const okfVersion = okfVersionResult.data;
    const surface: Surface = "export";
    const principal = await authenticateOptionalPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (principal === undefined) {
      return;
    }

    const assets = await registryRepository.listAssets({
      tenantId: principal?.tenantId,
      limit
    });
    const exportAssets = [];
    let deniedCount = 0;

    for (const asset of assets) {
      if (!asset.allowedExports.includes(packageName)) {
        continue;
      }

      const detail = await registryRepository.getAssetByStableId(asset.stableId, {
        tenantId: asset.tenantId
      });

      if (!detail) {
        continue;
      }

      const allowed = authRepository
        ? await canExportAsset(authRepository, principal, detail, packageName, surface)
        : true;

      if (!allowed) {
        deniedCount += 1;
        continue;
      }

      exportAssets.push(toExportPackageAsset(detail));
    }

    const exportPackage = aiExportPackageSchema.parse({
      packageName,
      generatedAt: new Date().toISOString(),
      tenantId: principal?.tenantId ?? "tenant_demo",
      assetCount: exportAssets.length,
      deniedCount,
      assets: exportAssets
    });
    const okfPackage = format === "okf"
      ? okfExportPackageSchema.parse(buildOkfExportPackage(exportPackage, { okfVersion }))
      : null;
    const responsePackage = okfPackage ?? exportPackage;

    if (authRepository) {
      await authRepository.recordAuditEvent({
        tenantId: exportPackage.tenantId,
        ...auditActor(principal),
        action: "export.generate",
        targetType: "export_package",
        targetId: packageName,
        outcome: "success",
        metadata: {
          format,
          okfVersion: format === "okf" ? okfVersion : undefined,
          assetCount: exportPackage.assetCount,
          deniedCount: exportPackage.deniedCount,
          projectionHash: okfPackage?.projectionHash
        }
      });
    }

    return responsePackage;
  });

  server.get("/telemetry/retrieval-events", async (request, reply) => {
    if (!authRepository || !retrievalRepository) {
      return reply.code(503).send({ error: "telemetry_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const events = await retrievalRepository.listRetrievalEvents({
      tenantId: principal.tenantId,
      limit
    });

    return {
      events: events.map((event) => retrievalEventSchema.parse(event))
    };
  });

  server.get("/telemetry/summary", async (request, reply) => {
    if (!authRepository || !retrievalRepository || !feedbackRepository || !registryRepository) {
      return reply.code(503).send({ error: "telemetry_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = telemetryAnalyticsInputSchema.safeParse({
      ...(request.query as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    return telemetryAnalyticsSummarySchema.parse(await buildTelemetryAnalyticsSummary({
      input: parsed.data,
      registryRepository,
      authRepository,
      retrievalRepository,
      feedbackRepository
    }));
  });

  server.get("/admin/managed-query-policy", async (request, reply) => {
    if (!authRepository || !managedQueryPolicyRepository) {
      return reply.code(503).send({ error: "managed_query_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return managedQueryPolicySchema.parse(await managedQueryPolicyRepository.getPolicy(principal.tenantId));
  });

  server.put("/admin/managed-query-policy", async (request, reply) => {
    if (!authRepository || !managedQueryPolicyRepository) {
      return reply.code(503).send({ error: "managed_query_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = managedQueryPolicyInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await managedQueryPolicyRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId ?? undefined
    });

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "admin.managed_query_policy.update",
      targetType: "managed_query_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        defaultMode: policy.defaultMode,
        allowedModes: policy.allowedModes,
        minimumCitationCount: policy.minimumCitationCount,
        requireGrounded: policy.requireGrounded
      }
    });

    return managedQueryPolicySchema.parse(policy);
  });

  server.get("/admin/retrieval-ranking-policy", async (request, reply) => {
    if (!authRepository || !retrievalRankingPolicyRepository) {
      return reply.code(503).send({ error: "retrieval_ranking_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return retrievalRankingPolicySchema.parse(await retrievalRankingPolicyRepository.getPolicy(principal.tenantId));
  });

  server.put("/admin/retrieval-ranking-policy", async (request, reply) => {
    if (!authRepository || !retrievalRankingPolicyRepository) {
      return reply.code(503).send({ error: "retrieval_ranking_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = retrievalRankingPolicyInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await retrievalRankingPolicyRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId ?? undefined
    });

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "admin.retrieval_ranking_policy.update",
      targetType: "retrieval_ranking_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        agentInstructionWeight: policy.agentInstructionWeight,
        assetSummaryWeight: policy.assetSummaryWeight,
        humanDocumentWeight: policy.humanDocumentWeight,
        exactPhraseBoost: policy.exactPhraseBoost
      }
    });

    return retrievalRankingPolicySchema.parse(policy);
  });

  server.get("/admin/managed-query-cache", async (request, reply) => {
    if (!authRepository || !cacheRepository) {
      return reply.code(503).send({ error: "managed_query_cache_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const query = request.query as { limit?: string };
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const entries = await cacheRepository.listEntries({
      tenantId: principal.tenantId,
      limit
    });

    return managedQueryCacheListResponseSchema.parse({
      entries: entries.map(toSafeManagedQueryCacheEntry)
    });
  });

  server.get("/admin/managed-query-cache/policy", async (request, reply) => {
    if (!authRepository || !cachePolicyRepository) {
      return reply.code(503).send({ error: "managed_query_cache_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return managedQueryCachePolicySchema.parse(await cachePolicyRepository.getPolicy(principal.tenantId));
  });

  server.put("/admin/managed-query-cache/policy", async (request, reply) => {
    if (!authRepository || !cachePolicyRepository) {
      return reply.code(503).send({ error: "managed_query_cache_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = managedQueryCachePolicyInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await cachePolicyRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId ?? undefined
    });

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "admin.managed_query_cache_policy.update",
      targetType: "managed_query_cache_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        cacheEnabled: policy.cacheEnabled,
        maxCacheTtlSeconds: policy.maxCacheTtlSeconds
      }
    });

    return managedQueryCachePolicySchema.parse(policy);
  });

  server.delete("/admin/managed-query-cache/:cacheKey", async (request, reply) => {
    if (!authRepository || !cacheRepository) {
      return reply.code(503).send({ error: "managed_query_cache_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const params = request.params as { cacheKey?: string };
    const cacheKey = params.cacheKey;

    if (!cacheKey) {
      return sendValidationError(reply, [{ path: ["cacheKey"], message: "Expected a cache key" }]);
    }

    const deleted = await cacheRepository.deleteEntry({
      tenantId: principal.tenantId,
      cacheKey
    });

    if (!deleted) {
      return reply.code(404).send({ error: "managed_query_cache_entry_not_found" });
    }

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "admin.managed_query_cache.delete",
      targetType: "managed_query_cache",
      targetId: deleted.cacheKey,
      outcome: "success",
      metadata: {
        provider: deleted.provider,
        model: deleted.model,
        expiresAt: deleted.expiresAt,
        hitCount: deleted.hitCount
      }
    });

    return toSafeManagedQueryCacheEntry(deleted);
  });

  server.post("/admin/managed-query-cache/purge", async (request, reply) => {
    if (!authRepository || !cacheRepository) {
      return reply.code(503).send({ error: "managed_query_cache_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = managedQueryCachePurgeInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const expiredBefore = parsed.data.expiredBefore ?? new Date().toISOString();

    if (Number.isNaN(Date.parse(expiredBefore))) {
      return sendValidationError(reply, [{ path: ["expiredBefore"], message: "Expected a parseable date/time" }]);
    }

    const deletedCount = await cacheRepository.purgeExpired({
      tenantId: principal.tenantId,
      expiredBefore,
      dryRun: parsed.data.dryRun
    });
    const result = managedQueryCachePurgeResultSchema.parse({
      tenantId: principal.tenantId,
      dryRun: parsed.data.dryRun,
      purgedAt: new Date().toISOString(),
      expiredBefore,
      deletedCount
    });

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "admin.managed_query_cache.purge",
      targetType: "managed_query_cache",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        dryRun: result.dryRun,
        expiredBefore: result.expiredBefore,
        deletedCount: result.deletedCount
      }
    });

    return result;
  });

  server.get("/admin/managed-query-retention/policy", async (request, reply) => {
    if (!authRepository || !managedQueryRetentionPolicyRepository) {
      return reply.code(503).send({ error: "managed_query_retention_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return managedQueryRetentionPolicySchema.parse(
      await managedQueryRetentionPolicyRepository.getPolicy(principal.tenantId)
    );
  });

  server.put("/admin/managed-query-retention/policy", async (request, reply) => {
    if (!authRepository || !managedQueryRetentionPolicyRepository) {
      return reply.code(503).send({ error: "managed_query_retention_policy_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
    const parsed = managedQueryRetentionPolicyInputSchema.safeParse({
      ...body,
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await managedQueryRetentionPolicyRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId ?? undefined
    });

    await authRepository.recordAuditEvent({
      tenantId: principal.tenantId,
      ...auditActor(principal),
      action: "admin.managed_query_retention_policy.update",
      targetType: "managed_query_retention_policy",
      targetId: principal.tenantId,
      outcome: "success",
      metadata: {
        promptCaptureMode: policy.promptCaptureMode,
        responseCaptureMode: policy.responseCaptureMode,
        metadataRetentionDays: policy.metadataRetentionDays
      }
    });

    return managedQueryRetentionPolicySchema.parse(policy);
  });

  server.get("/admin/telemetry-retention", async (request, reply) => {
    if (!authRepository || !telemetryRetentionPolicyRepository) {
      return reply.code(503).send({ error: "telemetry_retention_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    return telemetryRetentionPolicySchema.parse(
      await telemetryRetentionPolicyRepository.getPolicy(principal.tenantId)
    );
  });

  server.put("/admin/telemetry-retention", async (request, reply) => {
    if (!authRepository || !telemetryRetentionPolicyRepository) {
      return reply.code(503).send({ error: "telemetry_retention_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = telemetryRetentionPolicyInputSchema.safeParse({
      ...((request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await telemetryRetentionPolicyRepository.upsertPolicy({
      ...parsed.data,
      updatedByUserId: principal.userId ?? undefined,
      updatedByServiceAccountId: principal.serviceAccountId ?? undefined,
      updatedByApiKeyId: principal.apiKeyId
    });

    await authRepository.recordAuditEvent({
      tenantId: policy.tenantId,
      ...auditActor(principal),
      action: "admin.telemetry_retention.update",
      targetType: "telemetry_retention_policy",
      targetId: policy.tenantId,
      outcome: "success",
      metadata: {
        retrievalEventRetentionDays: policy.retrievalEventRetentionDays,
        auditEventRetentionDays: policy.auditEventRetentionDays,
        feedbackRetentionDays: policy.feedbackRetentionDays
      }
    });

    return telemetryRetentionPolicySchema.parse(policy);
  });

  server.post("/admin/telemetry-retention/purge", async (request, reply) => {
    if (!authRepository || !retrievalRepository || !feedbackRepository || !telemetryRetentionPolicyRepository) {
      return reply.code(503).send({ error: "telemetry_retention_unavailable" });
    }

    const principal = await requireAdminPrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

    if (!principal) {
      return;
    }

    const parsed = telemetryRetentionPurgeInputSchema.safeParse({
      ...((request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>),
      tenantId: principal.tenantId
    });

    if (!parsed.success) {
      return sendValidationError(reply, parsed.error.issues);
    }

    const policy = await telemetryRetentionPolicyRepository.getPolicy(principal.tenantId);
    const result = await purgeTelemetryForRetentionPolicy({
      tenantId: principal.tenantId,
      dryRun: parsed.data.dryRun,
      policy,
      authRepository,
      retrievalRepository,
      feedbackRepository
    });

    await authRepository.recordAuditEvent({
      tenantId: result.tenantId,
      ...auditActor(principal),
      action: "admin.telemetry_retention.purge",
      targetType: "telemetry_retention_policy",
      targetId: result.tenantId,
      outcome: "success",
      metadata: {
        dryRun: result.dryRun,
        retrievalEventsDeleted: result.retrievalEvents.deletedCount,
        auditEventsDeleted: result.auditEvents.deletedCount,
        managedQueryFeedbackDeleted: result.managedQueryFeedback.deletedCount,
        retrievalEventsCutoff: result.retrievalEvents.cutoff,
        auditEventsCutoff: result.auditEvents.cutoff,
        managedQueryFeedbackCutoff: result.managedQueryFeedback.cutoff
      }
    });

    return telemetryRetentionPurgeResultSchema.parse(result);
  });

  return server;
}

async function sendAssetVersionSnapshot(
  request: FastifyRequest,
  reply: FastifyReply,
  registryRepository: RegistryRepository,
  authRepository: AuthRepository | undefined,
  loginSessionIdleTimeoutSeconds: number | null,
  stableId: string,
  versionSelector: { versionId?: string; versionNumber?: number }
) {
  const principal = authRepository ? await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds) : null;

  if (authRepository && !principal) {
    return;
  }

  const parsed = assetVersionSnapshotInputSchema.safeParse({
    tenantId: principal?.tenantId,
    ...versionSelector
  });

  if (!parsed.success) {
    return sendValidationError(reply, parsed.error.issues);
  }

  const snapshot = await registryRepository.getAssetVersionSnapshot(stableId, parsed.data);

  if (!snapshot) {
    return reply.code(404).send({ error: "asset_or_version_not_found" });
  }

  if (authRepository) {
    const surface = readSurface(request, principal);
    const allowed = await authRepository.canAccessAsset({
      principal,
      asset: snapshot.asset,
      action: "read",
      surface
    });

    if (!allowed) {
      await recordDenied(authRepository, principal, snapshot.asset.tenantId, "asset.version.read", "asset", snapshot.asset.id, {
        stableId: snapshot.asset.stableId,
        versionId: snapshot.version.id,
        versionNumber: snapshot.version.versionNumber,
        surface
      });
      return reply.code(403).send({ error: "access_denied" });
    }
  }

  return assetVersionSnapshotSchema.parse(snapshot);
}

async function canExportAsset(
  authRepository: AuthRepository,
  principal: AuthPrincipal | null,
  detail: AssetDetail,
  packageName: string,
  surface: Surface
): Promise<boolean> {
  if (
    isPublishedAsset(detail) &&
    detail.asset.sensitivity === "public-demo" &&
    detail.asset.allowedSurfaces.includes(surface) &&
    detail.asset.allowedExports.includes(packageName)
  ) {
    return true;
  }

  return authRepository.canAccessAsset({
    principal,
    asset: detail.asset,
    action: "export",
    surface
  });
}

function isPublishedAsset(detail: AssetDetail): boolean {
  return detail.asset.lifecycleState === "active" && detail.asset.status === "approved";
}

function toExportPackageAsset(detail: AssetDetail) {
  const sourceVersion = detail.versions.find((version) => version.id === detail.asset.currentVersionId) ?? null;

  return {
    stableId: detail.asset.stableId,
    assetId: detail.asset.id,
    type: detail.asset.type,
    title: detail.asset.title,
    summary: detail.asset.summary ?? null,
    audience: detail.asset.audience,
    status: detail.asset.status,
    sensitivity: detail.asset.sensitivity,
    lifecycleState: detail.asset.lifecycleState,
    sourceRef: detail.asset.sourceRef,
    currentVersionId: detail.asset.currentVersionId,
    sourceVersion,
    allowedSurfaces: detail.asset.allowedSurfaces,
    allowedExports: detail.asset.allowedExports,
    instructions: detail.instructionObjects.map((instruction) => ({
      id: instruction.id,
      instructionKind: instruction.instructionKind,
      targetAgents: instruction.targetAgents,
      body: instruction.body,
      constraints: instruction.constraints,
      failureModes: instruction.failureModes,
      escalation: instruction.escalation
    })),
    humanDocuments: detail.humanDocuments.map((document) => ({
      id: document.id,
      format: document.format,
      body: document.body
    })),
    citations: [
      ...detail.instructionObjects.map((instruction, index) => ({
        stableId: detail.asset.stableId,
        assetId: detail.asset.id,
        chunkId: `export:${instruction.id}`,
        sourceKind: "agent-instruction",
        sourceId: instruction.id,
        sourceRef: detail.asset.sourceRef,
        versionId: instruction.versionId,
        title: `${detail.asset.title} instruction`,
        chunkIndex: index,
        snippet: instruction.body.replace(/\s+/g, " ").slice(0, 240)
      })),
      ...detail.humanDocuments.map((document, index) => ({
        stableId: detail.asset.stableId,
        assetId: detail.asset.id,
        chunkId: `export:${document.id}`,
        sourceKind: "human-document",
        sourceId: document.id,
        sourceRef: detail.asset.sourceRef,
        versionId: document.versionId,
        title: `${detail.asset.title} document`,
        chunkIndex: index,
        snippet: document.body.replace(/\s+/g, " ").slice(0, 240)
      }))
    ]
  };
}

async function filterReadableAssets(
  authRepository: AuthRepository,
  principal: AuthPrincipal | null,
  assets: Awaited<ReturnType<RegistryRepository["listAssets"]>>,
  surface: Surface
) {
  const visible = [];

  for (const asset of assets) {
    if (await authRepository.canAccessAsset({ principal, asset, action: "read", surface })) {
      visible.push(asset);
    }
  }

  return visible;
}

async function filterSearchResults(
  authRepository: AuthRepository,
  principal: AuthPrincipal | null,
  results: Awaited<ReturnType<RetrievalRepository["search"]>>,
  surface: Surface
) {
  const allowedResults = [];
  let deniedCount = 0;

  for (const result of results) {
    if (await authRepository.canAccessAsset({ principal, asset: result.asset, action: "read", surface })) {
      allowedResults.push(result);
    } else {
      deniedCount += 1;
    }
  }

  return { allowedResults, deniedCount };
}

async function runPermissionedSearch(input: {
  retrievalRepository: RetrievalRepository;
  authRepository: AuthRepository | undefined;
  piiRedactionPolicyRepository: PiiRedactionPolicyRepository | undefined;
  principal: AuthPrincipal | null;
  input: SearchInput;
  surface: Surface;
  queryKind: "search" | "managed-query" | "managed-query-eval";
}) {
  const startedAt = Date.now();
  const candidates = await input.retrievalRepository.search(input.input);
  const { allowedResults, deniedCount } = input.authRepository
    ? await filterSearchResults(input.authRepository, input.principal, candidates, input.surface)
    : { allowedResults: candidates, deniedCount: 0 };
  const tenantId = input.principal?.tenantId ?? input.input.tenantId ?? "tenant_demo";
  const piiRedactionPolicy = await readPiiRedactionPolicy(input.piiRedactionPolicyRepository, tenantId);
  const redactedQuery = redactText(input.input.query, piiRedactionPolicy);
  const event = await input.retrievalRepository.recordRetrievalEvent({
    tenantId,
    ...auditActor(input.principal),
    surface: input.surface,
    query: redactedQuery.text,
    resultCount: allowedResults.length,
    deniedCount,
    latencyMs: Date.now() - startedAt,
    metadata: {
      queryKind: input.queryKind,
      candidateCount: candidates.length,
      resultStableIds: uniqueStrings(allowedResults.map((result) => result.asset.stableId)),
      resultAssetIds: uniqueStrings(allowedResults.map((result) => result.asset.id)),
      resultChunkIds: uniqueStrings(allowedResults.map((result) => result.chunkId)),
      ranking: summarizeSearchRanking(candidates, allowedResults),
      telemetryRedaction: {
        applied: redactedQuery.redacted,
        findings: redactedQuery.findings
      }
    }
  });

  return { allowedResults, deniedCount, telemetryEventId: event.id };
}

async function recordManagedQueryEvalRun(input: {
  evalRunRepository: ManagedQueryEvalRunRepository;
  piiRedactionPolicyRepository: PiiRedactionPolicyRepository | undefined;
  principal: AuthPrincipal | null;
  report: ManagedQueryEvalReport;
}) {
  const storedReport = await redactManagedQueryEvalReportForStorage({
    piiRedactionPolicyRepository: input.piiRedactionPolicyRepository,
    report: input.report
  });

  return input.evalRunRepository.recordRun({
    tenantId: input.report.tenantId,
    ...auditActor(input.principal),
    report: storedReport.report,
    metadata: {
      caseIds: input.report.results.map((result) => result.id),
      tagThresholdCount: input.report.tagThresholdResults.length,
      evalReportRedaction: storedReport.redaction
    }
  });
}

async function redactManagedQueryEvalReportForStorage(input: {
  piiRedactionPolicyRepository: PiiRedactionPolicyRepository | undefined;
  report: ManagedQueryEvalReport;
}): Promise<{
  report: ManagedQueryEvalReport;
  redaction: {
    applied: boolean;
    findings: Array<{ kind: string; count: number }>;
    queryCount: number;
  };
}> {
  const piiRedactionPolicy = await readPiiRedactionPolicy(
    input.piiRedactionPolicyRepository,
    input.report.tenantId
  );
  const findingsByKind = new Map<string, number>();
  let applied = false;
  const results = input.report.results.map((result) => {
    const redactedQuery = redactText(result.query, piiRedactionPolicy);

    applied = applied || redactedQuery.redacted;

    for (const finding of redactedQuery.findings) {
      findingsByKind.set(finding.kind, (findingsByKind.get(finding.kind) ?? 0) + finding.count);
    }

    return {
      ...result,
      query: redactedQuery.text
    };
  });

  return {
    report: managedQueryEvalReportSchema.parse({
      ...input.report,
      results
    }),
    redaction: {
      applied,
      findings: Array.from(findingsByKind, ([kind, count]) => ({ kind, count })),
      queryCount: input.report.results.length
    }
  };
}

function summarizeSearchRanking(candidates: SearchResult[], allowedResults: SearchResult[]) {
  const topCandidate = candidates[0] ?? null;
  const topAllowed = allowedResults[0] ?? null;

  return {
    strategy: topAllowed?.ranking.strategy ?? topCandidate?.ranking.strategy ?? "lexical-weighted-v1",
    topCandidateScore: topCandidate?.ranking.finalScore ?? null,
    topAllowedScore: topAllowed?.ranking.finalScore ?? null
  };
}

interface ProviderManagedQueryResult {
  answer: string | null;
  generation: ManagedQueryGeneration;
  cache: ManagedQueryCache;
  preflightEstimate: ProviderPreflightEstimate | null;
  attempts: ManagedQueryGenerationAttempt[];
  warnings: string[];
}

interface ProviderPreflightEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number | null;
}

async function buildModelProviderHealth(input: {
  tenantId: string;
  providers: ModelProviderConfig[];
  checkedAt: string;
}): Promise<ModelProviderHealth[]> {
  const byProvider = new Map(input.providers.map((provider) => [provider.provider, provider]));
  const health: ModelProviderHealth[] = [];

  for (const provider of modelProviderSchema.options) {
    const config = byProvider.get(provider);

    if (!config) {
      health.push({
        tenantId: input.tenantId,
        provider,
        enabled: false,
        defaultModel: null,
        apiKeyEnvVar: null,
        apiKeyConfigured: false,
        priority: null,
        status: "not-configured",
        reasons: ["provider_config_missing"],
        checkedAt: input.checkedAt
      });
      continue;
    }

    const reasons: string[] = [];
    let apiKeyConfigured = false;

    if (!config.enabled) {
      reasons.push("provider_disabled");
    }

    if (!config.defaultModel) {
      reasons.push("model_not_configured");
    }

    if (!config.apiKeyEnvVar) {
      reasons.push("api_key_env_var_not_configured");
    } else {
      const apiKeyResolution = await resolveDeploymentSecret(config.apiKeyEnvVar);
      apiKeyConfigured = apiKeyResolution.ok;

      if (!apiKeyResolution.ok) {
        reasons.push(providerApiKeyResolutionReason(apiKeyResolution));
      }
    }

    health.push({
      tenantId: config.tenantId,
      provider: config.provider,
      enabled: config.enabled,
      defaultModel: config.defaultModel,
      apiKeyEnvVar: config.apiKeyEnvVar,
      apiKeyConfigured,
      priority: config.priority,
      status: !config.enabled ? "disabled" : reasons.length ? "not-ready" : "ready",
      reasons,
      checkedAt: input.checkedAt
    });
  }

  return health;
}

async function runProviderManagedQuery(input: {
  providerConfigRepository: ModelProviderConfigRepository | undefined;
  cacheRepository: ManagedQueryCacheRepository | undefined;
  cachePolicyRepository: ManagedQueryCachePolicyRepository | undefined;
  piiRedactionPolicyRepository: PiiRedactionPolicyRepository | undefined;
  modelRuntime: ModelRuntime;
  tenantId: string;
  principal: AuthPrincipal | null;
  surface: Surface;
  limit: number;
  requestedProvider?: ModelProvider;
  requestedModel?: string;
  cacheRequested: boolean;
  query: string;
  allowedResults: SearchResult[];
}): Promise<ProviderManagedQueryResult> {
  if (!input.allowedResults.length) {
    return skippedProviderManagedQuery(input.requestedProvider ?? null, input.requestedModel ?? null, "no_permitted_context");
  }

  if (!input.providerConfigRepository) {
    return skippedProviderManagedQuery(input.requestedProvider ?? null, input.requestedModel ?? null, "provider_config_unavailable");
  }

  let configs: ModelProviderConfig[];

  try {
    configs = await input.providerConfigRepository.listProviderConfigs({ tenantId: input.tenantId });
  } catch {
    return failedProviderManagedQuery(input.requestedProvider ?? null, input.requestedModel ?? null, "provider_config_error", null);
  }

  const candidates = selectProviderCandidates(configs, input.requestedProvider);

  if (!candidates.length) {
    return skippedProviderManagedQuery(
      input.requestedProvider ?? null,
      input.requestedModel ?? null,
      input.requestedProvider ? "requested_provider_not_enabled" : "no_enabled_provider"
    );
  }

  const prompt = buildManagedQueryPrompt(input.query, input.allowedResults);
  const piiRedactionPolicy = await readPiiRedactionPolicy(input.piiRedactionPolicyRepository, input.tenantId);
  const failedResults: ProviderManagedQueryResult[] = [];

  for (const selected of candidates) {
    const result = await runProviderManagedQueryCandidate({
      modelRuntime: input.modelRuntime,
      cacheRepository: input.cacheRepository,
      cachePolicyRepository: input.cachePolicyRepository,
      selected,
      piiRedactionPolicy,
      tenantId: input.tenantId,
      principal: input.principal,
      surface: input.surface,
      limit: input.limit,
      requestedModel: input.requestedModel,
      cacheRequested: input.cacheRequested,
      query: input.query,
      allowedResults: input.allowedResults,
      prompt
    });

    if (result.generation.status === "completed") {
      return combineCompletedProviderResult(result, failedResults);
    }

    failedResults.push(result);
  }

  return combineFailedProviderResults(failedResults, Boolean(input.requestedProvider));
}

function selectProviderCandidates(
  configs: ModelProviderConfig[],
  requestedProvider?: ModelProvider
): ModelProviderConfig[] {
  if (requestedProvider) {
    const requested = configs.find((config) => config.provider === requestedProvider && config.enabled);
    return requested ? [requested] : [];
  }

  return configs
    .filter((config) => config.enabled)
    .sort((left, right) => left.priority - right.priority || left.provider.localeCompare(right.provider));
}

async function runProviderManagedQueryCandidate(input: {
  modelRuntime: ModelRuntime;
  cacheRepository: ManagedQueryCacheRepository | undefined;
  cachePolicyRepository: ManagedQueryCachePolicyRepository | undefined;
  selected: ModelProviderConfig;
  piiRedactionPolicy: PiiRedactionPolicy;
  tenantId: string;
  principal: AuthPrincipal | null;
  surface: Surface;
  limit: number;
  requestedModel?: string;
  cacheRequested: boolean;
  query: string;
  allowedResults: SearchResult[];
  prompt: string;
}): Promise<ProviderManagedQueryResult> {
  const model = input.requestedModel ?? input.selected.defaultModel;

  if (!model) {
    return skippedProviderManagedQuery(input.selected.provider, null, "model_not_configured");
  }

  if (!input.selected.apiKeyEnvVar) {
    return skippedProviderManagedQuery(input.selected.provider, model, "api_key_env_var_not_configured");
  }

  const apiKeyResolution = await resolveDeploymentSecret(input.selected.apiKeyEnvVar);

  if (!apiKeyResolution.ok) {
    return skippedProviderManagedQuery(
      input.selected.provider,
      model,
      providerApiKeyResolutionReason(apiKeyResolution)
    );
  }

  const apiKey = apiKeyResolution.value;
  const runtimeMetadata = buildModelRuntimeMetadata(input.selected);
  const preflight = evaluateProviderPreflightQuota(input.prompt, runtimeMetadata);

  if (preflight.reason) {
    return skippedProviderManagedQuery(input.selected.provider, model, preflight.reason, preflight.estimate);
  }

  const cacheDescriptor = buildManagedQueryCacheDescriptor({
    cacheRepository: input.cacheRepository,
    cachePolicy: await readManagedQueryCachePolicy(input.cachePolicyRepository, input.tenantId),
    piiRedactionPolicy: input.piiRedactionPolicy,
    cacheRequested: input.cacheRequested,
    selected: input.selected,
    tenantId: input.tenantId,
    principal: input.principal,
    surface: input.surface,
    limit: input.limit,
    provider: input.selected.provider,
    model,
    query: input.query,
    allowedResults: input.allowedResults
  });

  if (cacheDescriptor.enabled && input.cacheRepository) {
    try {
      const cached = await input.cacheRepository.getFresh({
        tenantId: input.tenantId,
        cacheKey: cacheDescriptor.cache.cacheKey ?? ""
      });

      if (cached) {
        const attempt = buildProviderGenerationAttempt({
          provider: input.selected.provider,
          model,
          status: "completed",
          reason: "cache_hit",
          latencyMs: 0
        });

        return {
          answer: cached.answer,
          generation: {
            provider: input.selected.provider,
            model,
            status: "completed",
            reason: "cache_hit",
            latencyMs: 0,
            usage: cached.generation.usage,
            attempts: [attempt]
          },
          cache: {
            status: "hit",
            hit: true,
            cacheKey: cacheDescriptor.cache.cacheKey,
            expiresAt: cached.expiresAt,
            reason: null
          },
          preflightEstimate: preflight.estimate,
          attempts: [attempt],
          warnings: []
        };
      }
    } catch {
      cacheDescriptor.cache = {
        ...cacheDescriptor.cache,
        status: "miss",
        reason: "cache_read_failed"
      };
    }
  }

  const startedAt = Date.now();
  const retryPolicy = readProviderRetryPolicy(runtimeMetadata);
  const attempts: ManagedQueryGenerationAttempt[] = [];
  let lastFailureReason = "provider_generation_failed";

  for (let attemptIndex = 0; attemptIndex <= retryPolicy.maxRetries; attemptIndex += 1) {
    const attemptStartedAt = Date.now();

    try {
      const response = await input.modelRuntime.generate({
        provider: input.selected.provider,
        model,
        apiKey,
        baseUrl: input.selected.baseUrl ?? defaultModelBaseUrl(input.selected.provider),
        instructions: buildManagedQueryInstructions(),
        prompt: input.prompt,
        metadata: runtimeMetadata
      });
      const text = response.text.trim();
      const usage = withEstimatedCost(normalizeRuntimeUsage(response.usage), runtimeMetadata);

      if (!text) {
        lastFailureReason = "provider_empty_response";
        attempts.push(buildProviderGenerationAttempt({
          provider: input.selected.provider,
          model,
          status: "failed",
          reason: lastFailureReason,
          latencyMs: Date.now() - attemptStartedAt
        }));
      } else {
        const attempt = buildProviderGenerationAttempt({
          provider: input.selected.provider,
          model,
          status: "completed",
          reason: null,
          latencyMs: Date.now() - attemptStartedAt
        });
        attempts.push(attempt);
        const generation = {
          provider: input.selected.provider,
          model,
          status: "completed" as const,
          reason: null,
          latencyMs: Date.now() - startedAt,
          usage,
          attempts
        };
        let cache = cacheDescriptor.cache;

        if (cacheDescriptor.enabled && input.cacheRepository && cacheDescriptor.cachePolicy) {
          const ttlSeconds = readManagedQueryCacheTtlSeconds(input.selected, cacheDescriptor.cachePolicy);
          const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

          try {
            await input.cacheRepository.upsert({
              tenantId: input.tenantId,
              cacheKey: cacheDescriptor.cache.cacheKey ?? "",
              provider: input.selected.provider,
              model,
              mode: "provider-routed",
              queryHash: cacheDescriptor.queryHash,
              surface: input.surface,
              principalHash: cacheDescriptor.principalHash,
              contextHash: cacheDescriptor.contextHash,
              answer: text,
              generation,
              metadata: {
                ttlSeconds,
                resultCount: input.allowedResults.length
              },
              expiresAt
            });
            cache = {
              status: "stored",
              hit: false,
              cacheKey: cacheDescriptor.cache.cacheKey,
              expiresAt,
              reason: null
            };
          } catch {
            cache = {
              ...cacheDescriptor.cache,
              status: "miss",
              reason: "cache_write_failed"
            };
          }
        }

        return {
          answer: text,
          generation,
          cache,
          preflightEstimate: preflight.estimate,
          attempts,
          warnings: []
        };
      }
    } catch {
      lastFailureReason = "provider_generation_failed";
      attempts.push(buildProviderGenerationAttempt({
        provider: input.selected.provider,
        model,
        status: "failed",
        reason: lastFailureReason,
        latencyMs: Date.now() - attemptStartedAt
      }));
    }

    if (attemptIndex < retryPolicy.maxRetries) {
      await wait(retryPolicy.retryBackoffMs);
    }
  }

  return failedProviderManagedQueryWithAttempts(
    input.selected.provider,
    model,
    lastFailureReason,
    Date.now() - startedAt,
    attempts
  );
}

function combineCompletedProviderResult(
  result: ProviderManagedQueryResult,
  priorResults: ProviderManagedQueryResult[]
): ProviderManagedQueryResult {
  if (!priorResults.length) {
    return result;
  }

  const attempts = [
    ...priorResults.flatMap((failedResult) => failedResult.attempts),
    ...result.attempts
  ];

  return {
    ...result,
    generation: {
      ...result.generation,
      attempts
    },
    attempts,
    warnings: priorResults.map(formatProviderFallbackWarning)
  };
}

function combineFailedProviderResults(
  results: ProviderManagedQueryResult[],
  explicitProviderRequested: boolean
): ProviderManagedQueryResult {
  const [single] = results;

  if (explicitProviderRequested && single) {
    return single;
  }

  const last = results.at(-1);

  if (!last) {
    return skippedProviderManagedQuery(null, null, "no_enabled_provider");
  }

  const attempts = results.flatMap((result) => result.attempts);

  return {
    answer: null,
    generation: {
      ...last.generation,
      attempts
    },
    cache: last.cache,
    preflightEstimate: last.preflightEstimate,
    attempts,
    warnings: [
      ...results.map(formatProviderFallbackWarning),
      `Provider generation exhausted ${results.length} attempt(s); deterministic fallback returned.`
    ]
  };
}

function formatProviderFallbackWarning(result: ProviderManagedQueryResult): string {
  const [attempt] = result.attempts.slice(-1);
  const provider = attempt?.provider ?? result.generation.provider ?? "unknown";
  const status = attempt?.status ?? result.generation.status;
  const reason = attempt?.reason ?? result.generation.reason ?? "unknown";

  return `Provider attempt ${provider} ${status} (${reason}); trying next provider.`;
}

function skippedProviderManagedQuery(
  provider: ModelProvider | null,
  model: string | null,
  reason: string,
  preflightEstimate: ProviderPreflightEstimate | null = null
): ProviderManagedQueryResult {
  const attempts = provider
    ? [buildProviderGenerationAttempt({
      provider,
      model,
      status: "skipped",
      reason,
      latencyMs: null
    })]
    : [];

  return {
    answer: null,
    generation: {
      provider,
      model,
      status: "skipped",
      reason,
      latencyMs: null,
      usage: emptyGenerationUsage(),
      attempts
    },
    cache: emptyManagedQueryCache("disabled", reason),
    preflightEstimate,
    attempts,
    warnings: [`Provider generation skipped (${reason}); deterministic fallback returned.`]
  };
}

function failedProviderManagedQuery(
  provider: ModelProvider | null,
  model: string | null,
  reason: string,
  latencyMs: number | null
): ProviderManagedQueryResult {
  const attempts = provider
    ? [buildProviderGenerationAttempt({
      provider,
      model,
      status: "failed",
      reason,
      latencyMs
    })]
    : [];

  return {
    answer: null,
    generation: {
      provider,
      model,
      status: "failed",
      reason,
      latencyMs,
      usage: emptyGenerationUsage(),
      attempts
    },
    cache: emptyManagedQueryCache("disabled", reason),
    preflightEstimate: null,
    attempts,
    warnings: [`Provider generation failed (${reason}); deterministic fallback returned.`]
  };
}

function failedProviderManagedQueryWithAttempts(
  provider: ModelProvider,
  model: string,
  reason: string,
  latencyMs: number,
  attempts: ManagedQueryGenerationAttempt[]
): ProviderManagedQueryResult {
  return {
    answer: null,
    generation: {
      provider,
      model,
      status: "failed",
      reason,
      latencyMs,
      usage: emptyGenerationUsage(),
      attempts
    },
    cache: emptyManagedQueryCache("disabled", reason),
    preflightEstimate: null,
    attempts,
    warnings: [`Provider generation failed (${reason}); deterministic fallback returned.`]
  };
}

function buildProviderGenerationAttempt(input: ManagedQueryGenerationAttempt): ManagedQueryGenerationAttempt {
  return {
    provider: input.provider,
    model: input.model,
    status: input.status,
    reason: input.reason,
    latencyMs: input.latencyMs
  };
}

interface ManagedQueryCacheDescriptor {
  enabled: boolean;
  queryHash: string;
  principalHash: string;
  contextHash: string;
  cachePolicy: ManagedQueryCachePolicy | null;
  cache: ManagedQueryCache;
}

async function readAgentActionExecutionPolicy(
  repository: AgentActionExecutionRepository | undefined,
  tenantId: string
): Promise<AgentActionExecutionPolicy> {
  if (!repository) {
    return defaultAgentActionExecutionPolicy(tenantId);
  }

  try {
    return await repository.getPolicy(tenantId);
  } catch {
    return defaultAgentActionExecutionPolicy(tenantId);
  }
}

function evaluateAgentActionExecution(input: {
  policy: AgentActionExecutionPolicy;
  actionType: AgentActionRequest["actionType"];
  requestedDryRun: boolean | undefined;
}): {
  status: AgentActionStatus;
  dryRun: boolean;
  reason: string | null;
  result: Record<string, unknown>;
} {
  const dryRun = input.requestedDryRun ?? input.policy.dryRunDefault;

  if (input.policy.killSwitch) {
    return {
      status: "blocked",
      dryRun,
      reason: "action_execution_kill_switch_enabled",
      result: { externalSideEffects: false }
    };
  }

  if (!input.policy.enabled) {
    return {
      status: "blocked",
      dryRun,
      reason: "action_execution_disabled",
      result: { externalSideEffects: false }
    };
  }

  if (!input.policy.allowedActionTypes.includes(input.actionType)) {
    return {
      status: "blocked",
      dryRun,
      reason: "action_type_not_allowed",
      result: { externalSideEffects: false }
    };
  }

  if (dryRun) {
    return {
      status: "dry-run",
      dryRun: true,
      reason: "dry_run_requested_or_defaulted",
      result: { externalSideEffects: false }
    };
  }

  if (input.policy.requireApproval) {
    return {
      status: "approval-required",
      dryRun: false,
      reason: "approval_required",
      result: { externalSideEffects: false }
    };
  }

  if (input.actionType === "create-task-record") {
    return {
      status: "executed",
      dryRun: false,
      reason: null,
      result: {
        taskRecordCreated: true,
        externalSideEffects: false
      }
    };
  }

  return {
    status: "blocked",
    dryRun: false,
    reason: "action_adapter_unavailable",
    result: { externalSideEffects: false }
  };
}

function buildActionPolicySnapshot(policy: AgentActionExecutionPolicy): Record<string, unknown> {
  return {
    enabled: policy.enabled,
    allowedActionTypes: policy.allowedActionTypes,
    requireApproval: policy.requireApproval,
    dryRunDefault: policy.dryRunDefault,
    killSwitch: policy.killSwitch,
    maxRequestsPerHour: policy.maxRequestsPerHour,
    approvalExpiresInMinutes: policy.approvalExpiresInMinutes,
    source: policy.source
  };
}

function buildActionApprovalExpiresAt(policy: AgentActionExecutionPolicy): string {
  return new Date(Date.now() + policy.approvalExpiresInMinutes * 60 * 1000).toISOString();
}

interface ActionRequestRedactionSummary {
  applied: boolean;
  findings: RedactionFinding[];
  redactedStringCount: number;
  sources: {
    payload: number;
    metadata: number;
  };
}

function redactActionRequestContent(input: {
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  piiRedactionPolicy: PiiRedactionPolicy;
}): {
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  redaction: ActionRequestRedactionSummary | null;
} {
  const accumulator = createJsonRedactionAccumulator();
  const payload = redactJsonValue(input.payload, input.piiRedactionPolicy, accumulator, "payload") as Record<string, unknown>;
  const metadata = redactJsonValue(input.metadata, input.piiRedactionPolicy, accumulator, "metadata") as Record<string, unknown>;
  const redaction = summarizeJsonRedaction(accumulator);

  return {
    payload,
    metadata: redaction
      ? {
          ...metadata,
          actionRequestRedaction: redaction
        }
      : metadata,
    redaction
  };
}

interface JsonRedactionAccumulator {
  findings: Map<RedactionFinding["kind"], number>;
  redactedStringCount: number;
  sources: {
    payload: number;
    metadata: number;
  };
}

function createJsonRedactionAccumulator(): JsonRedactionAccumulator {
  return {
    findings: new Map(),
    redactedStringCount: 0,
    sources: {
      payload: 0,
      metadata: 0
    }
  };
}

function redactJsonValue(
  value: unknown,
  piiRedactionPolicy: PiiRedactionPolicy,
  accumulator: JsonRedactionAccumulator,
  source: keyof JsonRedactionAccumulator["sources"]
): unknown {
  if (typeof value === "string") {
    const redacted = redactText(value, piiRedactionPolicy);

    if (redacted.redacted) {
      accumulator.redactedStringCount += 1;
      accumulator.sources[source] += 1;

      for (const finding of redacted.findings) {
        accumulator.findings.set(
          finding.kind,
          (accumulator.findings.get(finding.kind) ?? 0) + finding.count
        );
      }
    }

    return redacted.text;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, piiRedactionPolicy, accumulator, source));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactJsonValue(entry, piiRedactionPolicy, accumulator, source)
      ])
    );
  }

  return value;
}

function summarizeJsonRedaction(accumulator: JsonRedactionAccumulator): ActionRequestRedactionSummary | null {
  if (accumulator.redactedStringCount === 0) {
    return null;
  }

  return {
    applied: true,
    findings: Array.from(accumulator.findings.entries()).map(([kind, count]) => ({ kind, count })),
    redactedStringCount: accumulator.redactedStringCount,
    sources: accumulator.sources
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActionApprovalExpired(action: AgentActionRequest): boolean {
  if (!action.approvalExpiresAt) {
    return false;
  }

  return Date.parse(action.approvalExpiresAt) <= Date.now();
}

function hashActionIdempotencyKey(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

function buildActionApprovalResult(action: AgentActionRequest): {
  status: Extract<AgentActionStatus, "approved" | "executed">;
  result: Record<string, unknown>;
} {
  if (action.actionType === "create-task-record") {
    return {
      status: "executed",
      result: {
        taskRecordCreated: true,
        externalSideEffects: false,
        approvedFromRequestId: action.id
      }
    };
  }

  return {
    status: "approved",
    result: {
      approved: true,
      externalSideEffects: false,
      executionDeferred: true
    }
  };
}

async function readManagedQueryPolicy(
  repository: ManagedQueryPolicyRepository | undefined,
  tenantId: string
): Promise<ManagedQueryPolicy> {
  if (!repository) {
    return defaultManagedQueryPolicy(tenantId);
  }

  try {
    return await repository.getPolicy(tenantId);
  } catch {
    return defaultManagedQueryPolicy(tenantId);
  }
}

function applyManagedQueryPolicy(input: {
  requestedMode: ManagedQueryPolicy["defaultMode"];
  policy: ManagedQueryPolicy;
}): { mode: ManagedQueryPolicy["defaultMode"]; warnings: string[] } {
  if (input.policy.allowedModes.includes(input.requestedMode)) {
    return {
      mode: input.requestedMode,
      warnings: []
    };
  }

  return {
    mode: input.policy.defaultMode,
    warnings: [
      `Managed query mode ${input.requestedMode} is disabled by tenant policy; using ${input.policy.defaultMode}.`
    ]
  };
}

function evaluateManagedQueryPolicyGate(input: {
  policy: ManagedQueryPolicy;
  citationCount: number;
  resultCount: number;
}): { providerSkipReason: string | null; warnings: string[] } {
  const warnings: string[] = [];
  let providerSkipReason: string | null = null;

  if (input.citationCount < input.policy.minimumCitationCount) {
    providerSkipReason = "tenant_policy_minimum_citations_unmet";
    warnings.push(
      `Tenant managed-query policy expected at least ${input.policy.minimumCitationCount} citation(s); ` +
      `retrieval returned ${input.citationCount}.`
    );
  }

  if (input.policy.requireGrounded && input.resultCount <= 0) {
    providerSkipReason = providerSkipReason ?? "tenant_policy_requires_grounded_context";
    warnings.push("Tenant managed-query policy requires grounded retrieval context before provider generation.");
  }

  return {
    providerSkipReason,
    warnings
  };
}

async function readManagedQueryCachePolicy(
  repository: ManagedQueryCachePolicyRepository | undefined,
  tenantId: string
): Promise<ManagedQueryCachePolicy | null> {
  if (!repository) {
    return defaultManagedQueryCachePolicy(tenantId);
  }

  try {
    return await repository.getPolicy(tenantId);
  } catch {
    return null;
  }
}

async function invalidateManagedQueryCacheForAssetChange(
  repository: ManagedQueryCacheRepository | undefined,
  tenantId: string
): Promise<number> {
  if (!repository) {
    return 0;
  }

  return repository.invalidateTenant({
    tenantId,
    dryRun: false
  });
}

async function readManagedQueryRetentionPolicy(
  repository: ManagedQueryRetentionPolicyRepository | undefined,
  tenantId: string
): Promise<ManagedQueryRetentionPolicy> {
  if (!repository) {
    return defaultManagedQueryRetentionPolicy(tenantId);
  }

  try {
    return await repository.getPolicy(tenantId);
  } catch {
    return defaultManagedQueryRetentionPolicy(tenantId);
  }
}

async function readPiiRedactionPolicy(
  repository: PiiRedactionPolicyRepository | undefined,
  tenantId: string
): Promise<PiiRedactionPolicy> {
  if (!repository) {
    return defaultPiiRedactionPolicy(tenantId);
  }

  try {
    return await repository.getPolicy(tenantId);
  } catch {
    return defaultPiiRedactionPolicy(tenantId);
  }
}

async function readSecretReferencePolicy(
  repository: SecretReferencePolicyRepository | undefined,
  tenantId: string
): Promise<SecretReferencePolicy> {
  if (!repository) {
    return defaultSecretReferencePolicy(tenantId);
  }

  return repository.getPolicy(tenantId);
}

type DeploymentSecretResolution =
  | {
    ok: true;
    value: string;
    source: "env" | "file";
    fileEnvVar: string | null;
  }
  | {
    ok: false;
    reason: "secret_env_var_unset" | "secret_file_path_invalid" | "secret_file_unreadable" | "secret_file_empty";
    fileEnvVar: string;
  };

async function resolveDeploymentSecret(envVarName: string): Promise<DeploymentSecretResolution> {
  const directValue = process.env[envVarName];

  if (directValue) {
    return {
      ok: true,
      value: directValue,
      source: "env",
      fileEnvVar: null
    };
  }

  const fileEnvVar = `${envVarName}_FILE`;
  const secretFilePath = process.env[fileEnvVar]?.trim();

  if (!secretFilePath) {
    return {
      ok: false,
      reason: "secret_env_var_unset",
      fileEnvVar
    };
  }

  if (!isAbsolute(secretFilePath)) {
    return {
      ok: false,
      reason: "secret_file_path_invalid",
      fileEnvVar
    };
  }

  try {
    const value = (await readFile(secretFilePath, "utf8")).replace(/[\r\n]+$/g, "");

    if (!value) {
      return {
        ok: false,
        reason: "secret_file_empty",
        fileEnvVar
      };
    }

    return {
      ok: true,
      value,
      source: "file",
      fileEnvVar
    };
  } catch {
    return {
      ok: false,
      reason: "secret_file_unreadable",
      fileEnvVar
    };
  }
}

function providerApiKeyResolutionReason(resolution: DeploymentSecretResolution): string {
  if (resolution.ok) {
    return "";
  }

  switch (resolution.reason) {
    case "secret_file_path_invalid":
      return "api_key_secret_file_path_invalid";
    case "secret_file_unreadable":
      return "api_key_secret_file_unreadable";
    case "secret_file_empty":
      return "api_key_secret_file_empty";
    case "secret_env_var_unset":
      return "api_key_env_var_unset";
  }
}

function oidcClientSecretResolutionError(resolution: DeploymentSecretResolution): OidcLoginError {
  if (resolution.ok) {
    return new OidcLoginError("oidc_client_secret_unexpected_state", 500, "OIDC client secret resolution reached an unexpected state.");
  }

  switch (resolution.reason) {
    case "secret_file_path_invalid":
      return new OidcLoginError("oidc_client_secret_file_path_invalid", 503, "Configured OIDC client secret file path is invalid.");
    case "secret_file_unreadable":
      return new OidcLoginError("oidc_client_secret_file_unreadable", 503, "Configured OIDC client secret file could not be read.");
    case "secret_file_empty":
      return new OidcLoginError("oidc_client_secret_file_empty", 503, "Configured OIDC client secret file is empty.");
    case "secret_env_var_unset":
      return new OidcLoginError("oidc_client_secret_missing", 503, "Configured OIDC client secret env var is not set.");
  }
}

function buildManagedQueryRetentionMetadata(input: {
  policy: ManagedQueryRetentionPolicy;
  prompt: string;
  response: string | null;
}): Record<string, unknown> {
  const promptMetadataEnabled = input.policy.promptCaptureMode === "metadata-only";
  const responseMetadataEnabled = input.policy.responseCaptureMode === "metadata-only";

  return {
    promptCaptureMode: input.policy.promptCaptureMode,
    responseCaptureMode: input.policy.responseCaptureMode,
    metadataRetentionDays: input.policy.metadataRetentionDays,
    promptHash: promptMetadataEnabled ? sha256(input.prompt) : null,
    responseHash: responseMetadataEnabled && input.response ? sha256(input.response) : null,
    rawPromptStored: false,
    rawResponseStored: false,
    source: input.policy.source
  };
}

function buildManagedQueryCacheDescriptor(input: {
  cacheRepository: ManagedQueryCacheRepository | undefined;
  cachePolicy: ManagedQueryCachePolicy | null;
  piiRedactionPolicy: PiiRedactionPolicy;
  cacheRequested: boolean;
  selected: ModelProviderConfig;
  tenantId: string;
  principal: AuthPrincipal | null;
  surface: Surface;
  limit: number;
  provider: ModelProvider;
  model: string;
  query: string;
  allowedResults: SearchResult[];
}): ManagedQueryCacheDescriptor {
  const normalizedQuery = normalizeCacheQuery(input.query);
  const queryHash = sha256(normalizedQuery);
  const principalHash = sha256(stableJsonStringify({
    principalType: input.principal?.principalType ?? "anonymous",
    principalId: input.principal?.principalId ?? null,
    apiKeyId: input.principal?.apiKeyId ?? null,
    role: input.principal?.role ?? null,
    scopes: [...(input.principal?.scopes ?? [])].sort(),
    groupIds: [...(input.principal?.groupIds ?? [])].sort()
  }));
  const contextHash = sha256(stableJsonStringify(input.allowedResults.map((result) => ({
    stableId: result.asset.stableId,
    assetId: result.asset.id,
    currentVersionId: result.asset.currentVersionId,
    updatedAt: result.asset.updatedAt,
    chunkId: result.chunkId,
    sourceKind: result.sourceKind,
    citationChunkId: result.citation.chunkId,
    citationVersionId: result.citation.versionId,
    contentHash: sha256(normalizeCacheQuery(result.content))
  })).sort((left, right) =>
    `${left.stableId}:${left.chunkId}`.localeCompare(`${right.stableId}:${right.chunkId}`)
  )));
  const cacheKey = sha256(stableJsonStringify({
    version: 1,
    tenantId: input.tenantId,
    mode: "provider-routed",
    provider: input.provider,
    model: input.model,
    surface: input.surface,
    limit: input.limit,
    queryHash,
    principalHash,
    contextHash
  }));

  if (!input.cacheRepository) {
    return {
      enabled: false,
      queryHash,
      principalHash,
      contextHash,
      cachePolicy: input.cachePolicy,
      cache: emptyManagedQueryCache("disabled", "cache_repository_unavailable")
    };
  }

  if (!input.cachePolicy) {
    return {
      enabled: false,
      queryHash,
      principalHash,
      contextHash,
      cachePolicy: null,
      cache: {
        status: "disabled",
        hit: false,
        cacheKey,
        expiresAt: null,
        reason: "cache_policy_unavailable"
      }
    };
  }

  if (!input.cacheRequested) {
    return {
      enabled: false,
      queryHash,
      principalHash,
      contextHash,
      cachePolicy: input.cachePolicy,
      cache: {
        status: "bypass",
        hit: false,
        cacheKey,
        expiresAt: null,
        reason: "request_cache_disabled"
      }
    };
  }

  if (!input.cachePolicy.cacheEnabled) {
    return {
      enabled: false,
      queryHash,
      principalHash,
      contextHash,
      cachePolicy: input.cachePolicy,
      cache: {
        status: "disabled",
        hit: false,
        cacheKey,
        expiresAt: null,
        reason: "tenant_cache_disabled"
      }
    };
  }

  if (input.selected.metadata.cacheEnabled === false) {
    return {
      enabled: false,
      queryHash,
      principalHash,
      contextHash,
      cachePolicy: input.cachePolicy,
      cache: {
        status: "disabled",
        hit: false,
        cacheKey,
        expiresAt: null,
        reason: "provider_cache_disabled"
      }
    };
  }

  const redactedQuery = redactText(input.query, input.piiRedactionPolicy);

  if (redactedQuery.redacted) {
    return {
      enabled: false,
      queryHash,
      principalHash,
      contextHash,
      cachePolicy: input.cachePolicy,
      cache: {
        status: "bypass",
        hit: false,
        cacheKey,
        expiresAt: null,
        reason: "query_redacted"
      }
    };
  }

  return {
    enabled: true,
    queryHash,
    principalHash,
    contextHash,
    cachePolicy: input.cachePolicy,
    cache: {
      status: "miss",
      hit: false,
      cacheKey,
      expiresAt: null,
      reason: null
    }
  };
}

function emptyManagedQueryCache(status: ManagedQueryCache["status"], reason: string | null): ManagedQueryCache {
  return {
    status,
    hit: false,
    cacheKey: null,
    expiresAt: null,
    reason
  };
}

function normalizeCacheQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)])
    );
  }

  return value;
}

function buildManagedQueryInstructions(): string {
  return [
    "You are the ForgetBase managed query layer.",
    "Answer only from the supplied governed context.",
    "Cite the stable IDs you rely on in square brackets.",
    "If the context is insufficient, say that directly and do not invent missing facts."
  ].join(" ");
}

function buildManagedQueryPrompt(query: string, results: SearchResult[]): string {
  const context = results.slice(0, 10).map((result, index) => [
    `Context ${index + 1}`,
    `Stable ID: ${result.asset.stableId}`,
    `Title: ${result.title}`,
    `Source kind: ${result.sourceKind}`,
    `Citation chunk: ${result.citation.chunkId}`,
    `Snippet: ${normalizeSnippet(result.citation.snippet)}`,
    `Content: ${truncateModelContext(result.content)}`
  ].join("\n"));

  return [
    `User query: ${query}`,
    "",
    "Governed context:",
    context.join("\n\n"),
    "",
    "Return a concise answer for the user. Include stable-ID citations for claims."
  ].join("\n");
}

function truncateModelContext(content: string): string {
  const normalized = normalizeSnippet(content);
  return normalized.length > 1200 ? `${normalized.slice(0, 1200)}...` : normalized;
}

function buildModelRuntimeMetadata(config: ModelProviderConfig): Record<string, unknown> {
  return {
    maxOutputTokens: Math.round(readProviderConfigNumber(config, "maxOutputTokens", 700, 128, 4000)),
    temperature: readProviderConfigNumber(config, "temperature", 0.2, 0, 2),
    timeoutMs: Math.round(readProviderConfigNumber(config, "timeoutMs", 20_000, 1_000, 60_000)),
    maxRetries: Math.round(readProviderConfigNumber(config, "maxRetries", 0, 0, 3)),
    retryBackoffMs: Math.round(readProviderConfigNumber(config, "retryBackoffMs", 250, 0, 10_000)),
    inputCostPerMillionTokens: readOptionalProviderConfigNumber(config, "inputCostPerMillionTokens", 0, 1000),
    outputCostPerMillionTokens: readOptionalProviderConfigNumber(config, "outputCostPerMillionTokens", 0, 1000),
    maxEstimatedInputTokensPerQuery: readOptionalProviderConfigInteger(
      config,
      "maxEstimatedInputTokensPerQuery",
      1,
      1_000_000
    ),
    maxEstimatedTotalTokensPerQuery: readOptionalProviderConfigInteger(
      config,
      "maxEstimatedTotalTokensPerQuery",
      1,
      1_000_000
    ),
    maxEstimatedCostUsdPerQuery: readOptionalProviderConfigNumber(config, "maxEstimatedCostUsdPerQuery", 0, 10_000)
  };
}

function readProviderRetryPolicy(metadata: Record<string, unknown>): { maxRetries: number; retryBackoffMs: number } {
  return {
    maxRetries: Math.round(readRuntimeNumber(metadata, "maxRetries", 0)),
    retryBackoffMs: Math.round(readRuntimeNumber(metadata, "retryBackoffMs", 250))
  };
}

function readProviderConfigNumber(
  config: ModelProviderConfig,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = config.metadata[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function readOptionalProviderConfigNumber(
  config: ModelProviderConfig,
  key: string,
  min: number,
  max: number
): number | null {
  const value = config.metadata[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(max, Math.max(min, value));
}

function readOptionalProviderConfigInteger(
  config: ModelProviderConfig,
  key: string,
  min: number,
  max: number
): number | null {
  const value = readOptionalProviderConfigNumber(config, key, min, max);
  return value === null ? null : Math.round(value);
}

function readManagedQueryCacheTtlSeconds(
  config: ModelProviderConfig,
  policy: ManagedQueryCachePolicy
): number {
  const providerTtl = readOptionalProviderConfigInteger(config, "cacheTtlSeconds", 1, 86_400) ?? 3600;
  return policy.maxCacheTtlSeconds === null ? providerTtl : Math.min(providerTtl, policy.maxCacheTtlSeconds);
}

function evaluateProviderPreflightQuota(
  prompt: string,
  metadata: Record<string, unknown>
): { estimate: ProviderPreflightEstimate; reason: string | null } {
  const estimatedInputTokens = estimateTokenCount(prompt);
  const estimatedOutputTokens = Math.round(readRuntimeNumber(metadata, "maxOutputTokens", 700));
  const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
  const estimatedCostUsd = withEstimatedCost({
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    totalTokens: estimatedTotalTokens,
    estimatedCostUsd: null
  }, metadata).estimatedCostUsd;
  const estimate = {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedCostUsd
  };
  const maxInputTokens = normalizeTokenCount(metadata.maxEstimatedInputTokensPerQuery);
  const maxTotalTokens = normalizeTokenCount(metadata.maxEstimatedTotalTokensPerQuery);
  const maxCost = normalizeCost(metadata.maxEstimatedCostUsdPerQuery);

  if (maxInputTokens !== null && estimatedInputTokens > maxInputTokens) {
    return { estimate, reason: "preflight_input_token_limit_exceeded" };
  }

  if (maxTotalTokens !== null && estimatedTotalTokens > maxTotalTokens) {
    return { estimate, reason: "preflight_total_token_limit_exceeded" };
  }

  if (maxCost !== null && estimatedCostUsd !== null && estimatedCostUsd > maxCost) {
    return { estimate, reason: "preflight_cost_limit_exceeded" };
  }

  return { estimate, reason: null };
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function emptyGenerationUsage(): ManagedQueryGenerationUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    estimatedCostUsd: null
  };
}

function normalizeRuntimeUsage(usage: Partial<ModelRuntimeUsage> | undefined): ManagedQueryGenerationUsage {
  if (!usage) {
    return emptyGenerationUsage();
  }

  const inputTokens = normalizeTokenCount(usage.inputTokens);
  const outputTokens = normalizeTokenCount(usage.outputTokens);
  const totalTokens = normalizeTokenCount(usage.totalTokens) ??
    (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: normalizeCost(usage.estimatedCostUsd)
  };
}

function withEstimatedCost(
  usage: ManagedQueryGenerationUsage,
  metadata: Record<string, unknown>
): ManagedQueryGenerationUsage {
  const explicitEstimate = normalizeCost(usage.estimatedCostUsd);

  if (explicitEstimate !== null) {
    return { ...usage, estimatedCostUsd: explicitEstimate };
  }

  const inputRate = normalizeCost(metadata.inputCostPerMillionTokens);
  const outputRate = normalizeCost(metadata.outputCostPerMillionTokens);

  if (inputRate === null && outputRate === null) {
    return usage;
  }

  const inputCost = usage.inputTokens !== null && inputRate !== null
    ? (usage.inputTokens / 1_000_000) * inputRate
    : 0;
  const outputCost = usage.outputTokens !== null && outputRate !== null
    ? (usage.outputTokens / 1_000_000) * outputRate
    : 0;

  return {
    ...usage,
    estimatedCostUsd: Number((inputCost + outputCost).toFixed(8))
  };
}

function normalizeTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function normalizeCost(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

async function buildManagedQueryEvalAnalyticsSummary(input: {
  input: ManagedQueryEvalAnalyticsInput;
  evalRunRepository: ManagedQueryEvalRunRepository;
}): Promise<ManagedQueryEvalAnalyticsSummary> {
  const parsed = managedQueryEvalAnalyticsInputSchema.parse(input.input);
  const runs = filterByCreatedAt(
    await input.evalRunRepository.listRuns({ tenantId: parsed.tenantId, limit: parsed.limit }),
    parsed
  );
  const latestRun = runs[0] ?? null;
  const totalCaseCount = sumBy(runs, (run) => run.caseCount);
  const totalPassedCount = sumBy(runs, (run) => run.passedCount);
  const totalFailedCount = sumBy(runs, (run) => run.failedCount);

  return managedQueryEvalAnalyticsSummarySchema.parse({
    tenantId: parsed.tenantId,
    generatedAt: new Date().toISOString(),
    window: {
      since: parsed.since ?? null,
      until: parsed.until ?? null,
      sampleLimit: parsed.limit
    },
    runCount: runs.length,
    latestRunId: latestRun?.id ?? null,
    latestPassRate: latestRun?.passRate ?? null,
    latestThresholdPassed: latestRun?.thresholdPassed ?? null,
    averagePassRate: average(runs.map((run) => run.passRate)),
    passedRunCount: runs.filter((run) => run.ok).length,
    failedRunCount: runs.filter((run) => !run.ok).length,
    thresholdPassedCount: runs.filter((run) => run.thresholdPassed).length,
    thresholdFailedCount: runs.filter((run) => !run.thresholdPassed).length,
    totalCaseCount,
    totalPassedCount,
    totalFailedCount,
    casePassRate: calculatePassRate(totalPassedCount, totalCaseCount),
    byMode: countBy(runs, (run) => run.mode),
    byTag: buildManagedQueryEvalTagAnalytics(runs),
    recentRuns: runs.map((run) => ({
      id: run.id,
      checkedAt: run.checkedAt,
      createdAt: run.createdAt,
      ok: run.ok,
      thresholdPassed: run.thresholdPassed,
      passRate: run.passRate,
      caseCount: run.caseCount,
      passedCount: run.passedCount,
      failedCount: run.failedCount
    }))
  });
}

function buildManagedQueryEvalTagAnalytics(runs: Array<{ id: string; report: ManagedQueryEvalReport }>) {
  const byTag = new Map<string, {
    runIds: Set<string>;
    caseCount: number;
    passedCount: number;
    failedCount: number;
    thresholdCount: number;
    thresholdPassedCount: number;
    thresholdFailedCount: number;
  }>();

  for (const run of runs) {
    for (const tagResult of run.report.tagResults) {
      const current = byTag.get(tagResult.tag) ?? {
        runIds: new Set<string>(),
        caseCount: 0,
        passedCount: 0,
        failedCount: 0,
        thresholdCount: 0,
        thresholdPassedCount: 0,
        thresholdFailedCount: 0
      };

      current.runIds.add(run.id);
      current.caseCount += tagResult.caseCount;
      current.passedCount += tagResult.passedCount;
      current.failedCount += tagResult.failedCount;
      byTag.set(tagResult.tag, current);
    }

    for (const threshold of run.report.tagThresholdResults) {
      if (!threshold.tag) {
        continue;
      }

      const current = byTag.get(threshold.tag) ?? {
        runIds: new Set<string>(),
        caseCount: 0,
        passedCount: 0,
        failedCount: 0,
        thresholdCount: 0,
        thresholdPassedCount: 0,
        thresholdFailedCount: 0
      };

      current.runIds.add(run.id);
      current.thresholdCount += 1;
      current.thresholdPassedCount += threshold.passed ? 1 : 0;
      current.thresholdFailedCount += threshold.passed ? 0 : 1;
      byTag.set(threshold.tag, current);
    }
  }

  return Array.from(byTag.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, counts]) => ({
      tag,
      runCount: counts.runIds.size,
      caseCount: counts.caseCount,
      passedCount: counts.passedCount,
      failedCount: counts.failedCount,
      passRate: calculatePassRate(counts.passedCount, counts.caseCount),
      thresholdCount: counts.thresholdCount,
      thresholdPassedCount: counts.thresholdPassedCount,
      thresholdFailedCount: counts.thresholdFailedCount,
      thresholdPassRate: calculatePassRate(counts.thresholdPassedCount, counts.thresholdCount)
    }));
}

function evaluateManagedQueryCase(
  evalCase: ManagedQueryEvalCase,
  result: {
    resultStableIds: string[];
    citationCount: number;
    grounded: boolean;
    telemetryEventId: string | null;
    warnings: string[];
  }
) {
  const missingStableIds = evalCase.expectedStableIds.filter((stableId) =>
    !result.resultStableIds.includes(stableId)
  );
  const passed = result.grounded === evalCase.expectedGrounded &&
    result.citationCount >= evalCase.requiredCitationCount &&
    missingStableIds.length === 0;

  return {
    id: evalCase.id,
    query: evalCase.query,
    passed,
    resultStableIds: result.resultStableIds,
    missingStableIds,
    expectedStableIds: evalCase.expectedStableIds,
    requiredCitationCount: evalCase.requiredCitationCount,
    citationCount: result.citationCount,
    grounded: result.grounded,
    tags: evalCase.tags,
    telemetryEventId: result.telemetryEventId,
    warnings: result.warnings
  };
}

function buildManagedQueryEvalTagResults(results: Array<ReturnType<typeof evaluateManagedQueryCase>>) {
  const tagCounts = new Map<string, { caseCount: number; passedCount: number }>();

  for (const result of results) {
    for (const tag of result.tags) {
      const current = tagCounts.get(tag) ?? { caseCount: 0, passedCount: 0 };
      current.caseCount += 1;
      current.passedCount += result.passed ? 1 : 0;
      tagCounts.set(tag, current);
    }
  }

  return Array.from(tagCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, counts]) => {
      const failedCount = counts.caseCount - counts.passedCount;

      return {
        tag,
        caseCount: counts.caseCount,
        passedCount: counts.passedCount,
        failedCount,
        passRate: calculatePassRate(counts.passedCount, counts.caseCount)
      };
    });
}

function buildManagedQueryEvalThresholdResult(input: {
  scope: "overall" | "tag";
  tag: string | null;
  minimumPassRate: number;
  caseCount: number;
  passedCount: number;
  failedCount: number;
}) {
  const passRate = calculatePassRate(input.passedCount, input.caseCount);
  const hasCases = input.caseCount > 0;
  const passed = hasCases && passRate >= input.minimumPassRate;

  return {
    scope: input.scope,
    tag: input.tag,
    minimumPassRate: input.minimumPassRate,
    passRate,
    caseCount: input.caseCount,
    passedCount: input.passedCount,
    failedCount: input.failedCount,
    passed,
    reason: passed
      ? null
      : hasCases
        ? `Pass rate ${formatRate(passRate)} is below required ${formatRate(input.minimumPassRate)}.`
        : "No eval cases matched this threshold."
  };
}

function calculatePassRate(passedCount: number, caseCount: number): number {
  return caseCount > 0 ? passedCount / caseCount : 0;
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function uniqueStableIds(results: SearchResult[]): string[] {
  return Array.from(new Set(results.map((result) => result.asset.stableId))).sort();
}

function buildDeterministicAnswer(query: string, results: SearchResult[]): string {
  if (!results.length) {
    return `No readable page content was found for: ${query}`;
  }

  const lines = results.slice(0, 5).map((result, index) =>
    `${index + 1}. ${result.asset.title}: ${normalizeSnippet(result.citation.snippet)}`
  );

  return [
    `Answer from the pages I can access for: ${query}`,
    "",
    "What I found:",
    ...lines
  ].join("\n");
}

function dedupeCitations(results: SearchResult[]) {
  const citations = [];
  const seen = new Set<string>();

  for (const result of results) {
    const key = `${result.citation.assetId}:${result.citation.chunkId}`;

    if (!seen.has(key)) {
      seen.add(key);
      citations.push(result.citation);
    }
  }

  return citations;
}

function feedbackScores(feedback: {
  factualCitationAccuracy: number | null;
  policyCompliance: number | null;
  taskCompletionQuality: number | null;
  consistency: number | null;
  responseEffectiveness: number | null;
}) {
  return {
    factualCitationAccuracy: feedback.factualCitationAccuracy,
    policyCompliance: feedback.policyCompliance,
    taskCompletionQuality: feedback.taskCompletionQuality,
    consistency: feedback.consistency,
    responseEffectiveness: feedback.responseEffectiveness
  };
}

async function buildTelemetryAnalyticsSummary(input: {
  input: TelemetryAnalyticsInput;
  registryRepository: RegistryRepository;
  authRepository: AuthRepository;
  retrievalRepository: RetrievalRepository;
  feedbackRepository: ManagedQueryFeedbackRepository;
}): Promise<TelemetryAnalyticsSummary> {
  const parsed = telemetryAnalyticsInputSchema.parse(input.input);
  const [retrievalEvents, auditEvents, feedbackRecords, assets] = await Promise.all([
    input.retrievalRepository.listRetrievalEvents({
      tenantId: parsed.tenantId,
      since: parsed.since,
      until: parsed.until,
      limit: parsed.limit
    }),
    input.authRepository.listAuditEvents({
      tenantId: parsed.tenantId,
      since: parsed.since,
      until: parsed.until,
      limit: parsed.limit
    }),
    input.feedbackRepository.listFeedback({
      tenantId: parsed.tenantId,
      since: parsed.since,
      until: parsed.until,
      limit: parsed.limit
    }),
    input.registryRepository.listAssets({ tenantId: parsed.tenantId, limit: parsed.limit })
  ]);
  const windowedRetrievalEvents = filterByCreatedAt(retrievalEvents, parsed);
  const windowedAuditEvents = filterByCreatedAt(auditEvents, parsed);
  const windowedFeedbackRecords = filterByCreatedAt(feedbackRecords, parsed);
  const providerGenerationEvents = windowedAuditEvents.filter((event) => event.action === "agent.query.generate");
  const estimatedCostValues = providerGenerationEvents
    .map((event) => readGenerationUsageNumber(event, "estimatedCostUsd"))
    .filter((value): value is number => value !== null);
  const humanSearchEvents = windowedRetrievalEvents.filter(isHumanSearchEvent);
  const pageViewEvents = windowedRetrievalEvents.filter((event) => readRetrievalQueryKind(event) === "asset-view");
  const assetIdsByStableId = new Map(assets.map((asset) => [asset.stableId, asset.id]));
  const asOf = toUtcDateOnly(parsed.until ?? new Date().toISOString());
  const contentHealth = summarizeContentHealth(assets, asOf);

  return telemetryAnalyticsSummarySchema.parse({
    tenantId: parsed.tenantId,
    generatedAt: new Date().toISOString(),
    window: {
      since: parsed.since ?? null,
      until: parsed.until ?? null,
      sampleLimit: parsed.limit
    },
    retrieval: {
      eventCount: windowedRetrievalEvents.length,
      resultCount: sumBy(windowedRetrievalEvents, (event) => event.resultCount),
      deniedCount: sumBy(windowedRetrievalEvents, (event) => event.deniedCount),
      averageLatencyMs: average(windowedRetrievalEvents.map((event) => event.latencyMs)),
      redactedQueryCount: windowedRetrievalEvents.filter(hasTelemetryRedaction).length,
      bySurface: countBy(windowedRetrievalEvents, (event) => event.surface),
      byQueryKind: countBy(windowedRetrievalEvents, readRetrievalQueryKind)
    },
    audit: {
      eventCount: windowedAuditEvents.length,
      successCount: windowedAuditEvents.filter((event) => event.outcome === "success").length,
      deniedCount: windowedAuditEvents.filter((event) => event.outcome === "denied").length,
      errorCount: windowedAuditEvents.filter((event) => event.outcome === "error").length,
      byAction: countBy(windowedAuditEvents, (event) => event.action),
      byOutcome: countBy(windowedAuditEvents, (event) => event.outcome)
    },
    feedback: {
      recordCount: windowedFeedbackRecords.length,
      byOutcome: countBy(windowedFeedbackRecords, (record) => record.outcome),
      averageScores: {
        factualCitationAccuracy: average(windowedFeedbackRecords.map((record) => record.factualCitationAccuracy)),
        policyCompliance: average(windowedFeedbackRecords.map((record) => record.policyCompliance)),
        taskCompletionQuality: average(windowedFeedbackRecords.map((record) => record.taskCompletionQuality)),
        consistency: average(windowedFeedbackRecords.map((record) => record.consistency)),
        responseEffectiveness: average(windowedFeedbackRecords.map((record) => record.responseEffectiveness))
      }
    },
    providerGeneration: {
      eventCount: providerGenerationEvents.length,
      completedCount: providerGenerationEvents.filter((event) => readGenerationStatus(event) === "completed").length,
      skippedCount: providerGenerationEvents.filter((event) => readGenerationStatus(event) === "skipped").length,
      failedCount: providerGenerationEvents.filter((event) => readGenerationStatus(event) === "failed").length,
      cacheHitCount: providerGenerationEvents.filter((event) => readGenerationCacheStatus(event) === "hit").length,
      totalInputTokens: sumBy(providerGenerationEvents, (event) => readGenerationUsageNumber(event, "inputTokens") ?? 0),
      totalOutputTokens: sumBy(providerGenerationEvents, (event) => readGenerationUsageNumber(event, "outputTokens") ?? 0),
      totalTokens: sumBy(providerGenerationEvents, (event) => readGenerationUsageNumber(event, "totalTokens") ?? 0),
      estimatedCostUsd: estimatedCostValues.length
        ? Number(estimatedCostValues.reduce((total, value) => total + value, 0).toFixed(8))
        : null,
      averageLatencyMs: average(providerGenerationEvents.map(readGenerationLatencyMs)),
      byProvider: countBy(providerGenerationEvents, readGenerationProvider),
      byModel: countBy(providerGenerationEvents, readGenerationModel),
      byStatus: countBy(providerGenerationEvents, readGenerationStatus),
      byCacheStatus: countBy(providerGenerationEvents, readGenerationCacheStatus),
      byReason: countBy(
        providerGenerationEvents.filter((event) => readGenerationReason(event) !== "none"),
        readGenerationReason
      )
    },
    searchQuality: {
      lowResultThreshold: 2,
      searchEventCount: humanSearchEvents.length,
      unansweredSearchCount: humanSearchEvents.filter((event) => event.resultCount === 0).length,
      lowResultSearchCount: humanSearchEvents.filter((event) => uniquePageCount(event) <= 2).length,
      topQueries: summarizeTopQueries(humanSearchEvents),
      mostReturnedPages: summarizePages(humanSearchEvents, assetIdsByStableId)
    },
    pageViews: {
      eventCount: pageViewEvents.length,
      popularPages: summarizePages(pageViewEvents, assetIdsByStableId)
    },
    contentHealth: {
      ...contentHealth,
      sampleLimit: parsed.limit,
      sampleLimitReached: assets.length === parsed.limit
    },
    dailyTrends: summarizeDailyTrends(humanSearchEvents, pageViewEvents),
    assets: {
      sampleCount: assets.length,
      byType: countBy(assets, (asset) => asset.type),
      byLifecycleState: countBy(assets, (asset) => asset.lifecycleState),
      byStatus: countBy(assets, (asset) => asset.status),
      bySensitivity: countBy(assets, (asset) => asset.sensitivity)
    }
  });
}

function isHumanSearchEvent(event: RetrievalEvent): boolean {
  const queryKind = readRetrievalQueryKind(event);

  return queryKind === "search" || queryKind === "managed-query";
}

function readMetadataStringArray(event: RetrievalEvent, key: string): string[] {
  const value = event.metadata[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value.filter((item): item is string => typeof item === "string" && item.length > 0));
}

function readResultStableIds(event: RetrievalEvent): string[] {
  const values = readMetadataStringArray(event, "resultStableIds");

  if (values.length) {
    return values;
  }

  const stableId = readMetadataString(event.metadata.stableId);
  return stableId ? [stableId] : [];
}

function uniquePageCount(event: RetrievalEvent): number {
  const stableIds = readResultStableIds(event);

  return stableIds.length || event.resultCount;
}

function summarizeTopQueries(events: RetrievalEvent[]) {
  const summaries = new Map<string, { count: number; resultCount: number; stableIds: Set<string>; legacyPageCount: number }>();

  for (const event of events) {
    const existing = summaries.get(event.query) ?? {
      count: 0,
      resultCount: 0,
      stableIds: new Set<string>(),
      legacyPageCount: 0
    };
    existing.count += 1;
    existing.resultCount += event.resultCount;
    const stableIds = readResultStableIds(event);

    if (stableIds.length) {
      stableIds.forEach((stableId) => existing.stableIds.add(stableId));
    } else {
      existing.legacyPageCount = Math.max(existing.legacyPageCount, event.resultCount);
    }

    summaries.set(event.query, existing);
  }

  return Array.from(summaries, ([query, summary]) => ({
    query,
    count: summary.count,
    resultCount: summary.resultCount,
    uniquePageCount: Math.max(summary.stableIds.size, summary.legacyPageCount)
  }))
    .sort((left, right) => right.count - left.count || right.resultCount - left.resultCount || left.query.localeCompare(right.query))
    .slice(0, 10);
}

function summarizePages(events: RetrievalEvent[], assetIdsByStableId: Map<string, string>) {
  const counts = new Map<string, number>();

  for (const event of events) {
    for (const stableId of readResultStableIds(event)) {
      counts.set(stableId, (counts.get(stableId) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([stableId, count]) => ({
    stableId,
    assetId: assetIdsByStableId.get(stableId) ?? null,
    count
  }))
    .sort((left, right) => right.count - left.count || left.stableId.localeCompare(right.stableId))
    .slice(0, 10);
}

function summarizeContentHealth(
  assets: Awaited<ReturnType<RegistryRepository["listAssets"]>>,
  asOf: string
) {
  const dueSoonAt = addUtcDays(asOf, 30);
  const states = assets.map((asset) => {
    if (asset.lifecycleState !== "active" || asset.status !== "approved") {
      return "needs-review";
    }

    if (asset.reviewDueAt <= asOf) {
      return "overdue";
    }

    return asset.reviewDueAt <= dueSoonAt ? "due-soon" : "fresh";
  });

  return {
    asOf,
    dueSoonDays: 30,
    totalCount: assets.length,
    freshCount: states.filter((state) => state === "fresh").length,
    dueSoonCount: states.filter((state) => state === "due-soon").length,
    overdueCount: states.filter((state) => state === "overdue").length,
    needsReviewCount: states.filter((state) => state === "needs-review").length,
    byReviewState: countBy(states, (state) => state)
  } as const;
}

function summarizeDailyTrends(humanSearchEvents: RetrievalEvent[], pageViewEvents: RetrievalEvent[]) {
  const buckets = new Map<string, {
    searchCount: number;
    unansweredSearchCount: number;
    lowResultSearchCount: number;
    pageViewCount: number;
    stableIds: Set<string>;
  }>();
  const bucketFor = (date: string) => {
    const existing = buckets.get(date);

    if (existing) {
      return existing;
    }

    const created = {
      searchCount: 0,
      unansweredSearchCount: 0,
      lowResultSearchCount: 0,
      pageViewCount: 0,
      stableIds: new Set<string>()
    };
    buckets.set(date, created);
    return created;
  };

  for (const event of humanSearchEvents) {
    const bucket = bucketFor(toUtcDateOnly(event.createdAt));
    bucket.searchCount += 1;
    bucket.unansweredSearchCount += event.resultCount === 0 ? 1 : 0;
    bucket.lowResultSearchCount += uniquePageCount(event) <= 2 ? 1 : 0;
    readResultStableIds(event).forEach((stableId) => bucket.stableIds.add(stableId));
  }

  for (const event of pageViewEvents) {
    const bucket = bucketFor(toUtcDateOnly(event.createdAt));
    bucket.pageViewCount += 1;
    readResultStableIds(event).forEach((stableId) => bucket.stableIds.add(stableId));
  }

  return Array.from(buckets, ([date, bucket]) => ({
    date,
    searchCount: bucket.searchCount,
    unansweredSearchCount: bucket.unansweredSearchCount,
    lowResultSearchCount: bucket.lowResultSearchCount,
    pageViewCount: bucket.pageViewCount,
    uniquePageCount: bucket.stableIds.size
  })).sort((left, right) => left.date.localeCompare(right.date));
}

function toUtcDateOnly(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function filterByCreatedAt<T extends { createdAt: string }>(
  records: T[],
  window: { since?: string; until?: string }
): T[] {
  const since = window.since ? Date.parse(window.since) : undefined;
  const until = window.until ? Date.parse(window.until) : undefined;

  return records.filter((record) => {
    const createdAt = Date.parse(record.createdAt);

    if (Number.isNaN(createdAt)) {
      return false;
    }

    return (since === undefined || createdAt >= since) && (until === undefined || createdAt <= until);
  });
}

function countBy<T>(records: T[], readKey: (record: T) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();

  for (const record of records) {
    const key = readKey(record) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function sumBy<T>(records: T[], readValue: (record: T) => number): number {
  return records.reduce((total, record) => total + readValue(record), 0);
}

function average(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!numbers.length) {
    return null;
  }

  return Number((numbers.reduce((total, value) => total + value, 0) / numbers.length).toFixed(2));
}

function readRetrievalQueryKind(event: RetrievalEvent): string {
  const value = event.metadata.queryKind;
  return typeof value === "string" && value ? value : "search";
}

function hasTelemetryRedaction(event: RetrievalEvent): boolean {
  const redaction = event.metadata.telemetryRedaction;

  return Boolean(
    redaction &&
    typeof redaction === "object" &&
    !Array.isArray(redaction) &&
    "applied" in redaction &&
    (redaction as { applied?: unknown }).applied === true
  );
}

function readGenerationProvider(event: AuditEvent): string {
  return readMetadataString(event.metadata.provider) ?? "none";
}

function readGenerationModel(event: AuditEvent): string {
  return readMetadataString(event.metadata.model) ?? "none";
}

function readGenerationStatus(event: AuditEvent): string {
  return readMetadataString(event.metadata.generationStatus) ?? "unknown";
}

function readGenerationCacheStatus(event: AuditEvent): string {
  const cache = event.metadata.cache;

  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    return "none";
  }

  return readMetadataString((cache as Record<string, unknown>).status) ?? "none";
}

function readGenerationReason(event: AuditEvent): string {
  return readMetadataString(event.reason) ?? readMetadataString(event.metadata.generationReason) ?? "none";
}

function readGenerationLatencyMs(event: AuditEvent): number | null {
  return readMetadataNumber(event.metadata.latencyMs);
}

function readGenerationUsageNumber(
  event: AuditEvent,
  key: keyof ManagedQueryGenerationUsage
): number | null {
  const usage = event.metadata.usage;

  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return null;
  }

  return readMetadataNumber((usage as Record<string, unknown>)[key]);
}

function toSafeManagedQueryCacheEntry(entry: Awaited<ReturnType<ManagedQueryCacheRepository["listEntries"]>>[number]) {
  return managedQueryCacheEntrySchema.parse({
    id: entry.id,
    tenantId: entry.tenantId,
    cacheKey: entry.cacheKey,
    provider: entry.provider,
    model: entry.model,
    mode: entry.mode,
    queryHash: entry.queryHash,
    surface: entry.surface,
    principalHash: entry.principalHash,
    contextHash: entry.contextHash,
    generation: entry.generation,
    metadata: entry.metadata,
    expiresAt: entry.expiresAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    lastHitAt: entry.lastHitAt,
    hitCount: entry.hitCount
  });
}

function readMetadataString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function readMetadataNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function auditActor(principal: AuthPrincipal | null | undefined) {
  return {
    actorUserId: principal?.userId ?? undefined,
    actorServiceAccountId: principal?.serviceAccountId ?? undefined,
    actorApiKeyId: principal?.apiKeyId ?? undefined
  };
}

function attachmentContentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\\r\n]/g, "_")
    .trim() || "attachment";
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function decodeAttachmentFilenameHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function hasSecretLikeMetadataKey(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (isAllowedOperationalMetadataKey(key)) {
      if (hasSecretLikeMetadataKey(nestedValue)) {
        return true;
      }

      continue;
    }

    if (/secret|token|password|api[_-]?key/i.test(key)) {
      return true;
    }

    if (hasSecretLikeMetadataKey(nestedValue)) {
      return true;
    }
  }

  return false;
}

function isAllowedOperationalMetadataKey(key: string): boolean {
  return [
    "maxOutputTokens",
    "inputCostPerMillionTokens",
    "outputCostPerMillionTokens",
    "maxEstimatedInputTokensPerQuery",
    "maxEstimatedTotalTokensPerQuery",
    "maxEstimatedCostUsdPerQuery",
    "cacheEnabled",
    "cacheTtlSeconds",
    "maxRetries",
    "retryBackoffMs"
  ].includes(key);
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

const defaultModelRuntime: ModelRuntime = {
  async generate(input) {
    const maxOutputTokens = readRuntimeNumber(input.metadata, "maxOutputTokens", 700);
    const temperature = readRuntimeNumber(input.metadata, "temperature", 0.2);
    const timeoutMs = readRuntimeNumber(input.metadata, "timeoutMs", 20_000);

    switch (input.provider) {
      case "openai": {
        const response = await postModelJson(
          joinProviderUrl(input.baseUrl, "/responses"),
          {
            authorization: `Bearer ${input.apiKey}`,
            "content-type": "application/json"
          },
          {
            model: input.model,
            instructions: input.instructions,
            input: input.prompt,
            max_output_tokens: maxOutputTokens,
            temperature,
            store: false
          },
          timeoutMs
        );

        return {
          text: extractOpenAiResponseText(response),
          usage: extractOpenAiUsage(response)
        };
      }

      case "anthropic": {
        const response = await postModelJson(
          joinProviderUrl(input.baseUrl, "/v1/messages"),
          {
            "x-api-key": input.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          {
            model: input.model,
            max_tokens: maxOutputTokens,
            temperature,
            system: input.instructions,
            messages: [
              {
                role: "user",
                content: input.prompt
              }
            ]
          },
          timeoutMs
        );

        return {
          text: extractAnthropicResponseText(response),
          usage: extractAnthropicUsage(response)
        };
      }

      case "openrouter": {
        const response = await postModelJson(
          joinProviderUrl(input.baseUrl, "/chat/completions"),
          {
            authorization: `Bearer ${input.apiKey}`,
            "content-type": "application/json"
          },
          {
            model: input.model,
            temperature,
            max_tokens: maxOutputTokens,
            messages: [
              {
                role: "system",
                content: input.instructions
              },
              {
                role: "user",
                content: input.prompt
              }
            ]
          },
          timeoutMs
        );

        return {
          text: extractOpenRouterResponseText(response),
          usage: extractOpenRouterUsage(response)
        };
      }
    }
  }
};

function defaultModelBaseUrl(provider: ModelProvider): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
  }
}

async function postModelJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`model_provider_http_${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

function joinProviderUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function readRuntimeNumber(metadata: Record<string, unknown>, key: string, fallback: number): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function extractOpenAiResponseText(response: unknown): string {
  if (!isObjectRecord(response)) {
    return "";
  }

  const outputText = response.output_text;

  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  return collectTextFields(response.output).join("\n").trim();
}

function extractOpenAiUsage(response: unknown): ModelRuntimeUsage {
  if (!isObjectRecord(response) || !isObjectRecord(response.usage)) {
    return emptyGenerationUsage();
  }

  return normalizeRuntimeUsage({
    inputTokens: normalizeTokenCount(response.usage.input_tokens),
    outputTokens: normalizeTokenCount(response.usage.output_tokens),
    totalTokens: normalizeTokenCount(response.usage.total_tokens)
  });
}

function extractAnthropicResponseText(response: unknown): string {
  if (!isObjectRecord(response)) {
    return "";
  }

  return collectTextFields(response.content).join("\n").trim();
}

function extractAnthropicUsage(response: unknown): ModelRuntimeUsage {
  if (!isObjectRecord(response) || !isObjectRecord(response.usage)) {
    return emptyGenerationUsage();
  }

  return normalizeRuntimeUsage({
    inputTokens: normalizeTokenCount(response.usage.input_tokens),
    outputTokens: normalizeTokenCount(response.usage.output_tokens)
  });
}

function extractOpenRouterResponseText(response: unknown): string {
  if (!isObjectRecord(response) || !Array.isArray(response.choices)) {
    return "";
  }

  const [choice] = response.choices;

  if (!isObjectRecord(choice) || !isObjectRecord(choice.message)) {
    return "";
  }

  const content = choice.message.content;

  if (typeof content === "string") {
    return content.trim();
  }

  return collectTextFields(content).join("\n").trim();
}

function extractOpenRouterUsage(response: unknown): ModelRuntimeUsage {
  if (!isObjectRecord(response) || !isObjectRecord(response.usage)) {
    return emptyGenerationUsage();
  }

  return normalizeRuntimeUsage({
    inputTokens: normalizeTokenCount(response.usage.prompt_tokens),
    outputTokens: normalizeTokenCount(response.usage.completion_tokens),
    totalTokens: normalizeTokenCount(response.usage.total_tokens)
  });
}

function collectTextFields(value: unknown): string[] {
  const texts: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      texts.push(...collectTextFields(item));
    }
  } else if (isObjectRecord(value)) {
    if (typeof value.text === "string" && value.text.trim()) {
      texts.push(value.text.trim());
    }

    if ("content" in value) {
      texts.push(...collectTextFields(value.content));
    }

    if ("output" in value) {
      texts.push(...collectTextFields(value.output));
    }
  }

  return texts;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const defaultOidcRuntime: OidcRuntime = {
  async discover(config) {
    const discoveryUrl = `${config.issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const response = await fetch(discoveryUrl, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new OidcLoginError("oidc_discovery_failed", 502, `OIDC discovery failed with HTTP ${response.status}.`);
    }

    const document = await response.json() as Record<string, unknown>;
    return {
      issuer: readRequiredDiscoveryField(document, "issuer"),
      authorizationEndpoint: readRequiredDiscoveryField(document, "authorization_endpoint"),
      tokenEndpoint: readRequiredDiscoveryField(document, "token_endpoint"),
      jwksUri: readRequiredDiscoveryField(document, "jwks_uri")
    };
  },

  async exchangeCode({ config, discovery, code, redirectUri, codeVerifier }) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId
    });

    if (config.pkceRequired) {
      body.set("code_verifier", codeVerifier);
    }

    if (config.clientSecretEnvVar) {
      const clientSecretResolution = await resolveDeploymentSecret(config.clientSecretEnvVar);

      if (!clientSecretResolution.ok) {
        throw oidcClientSecretResolutionError(clientSecretResolution);
      }

      body.set("client_secret", clientSecretResolution.value);
    }

    const response = await fetch(discovery.tokenEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });
    const tokenBody = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      throw new OidcLoginError("oidc_token_exchange_failed", 401, "OIDC token exchange failed.");
    }

    const idToken = tokenBody.id_token;

    if (typeof idToken !== "string" || !idToken) {
      throw new OidcLoginError("oidc_id_token_missing", 401, "OIDC token response did not include an ID token.");
    }

    return { idToken };
  },

  async verifyIdToken({ config, discovery, idToken }) {
    const jwks = createRemoteJWKSet(new URL(discovery.jwksUri));
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: discovery.issuer,
      audience: config.clientId,
      algorithms: OIDC_JWT_ALGORITHMS
    });

    return payload;
  }
};

async function findEnabledAuthProviderConfig(
  repository: AuthProviderConfigRepository,
  tenantId: string,
  provider: ExternalAuthProvider
): Promise<AuthProviderConfig | null> {
  const configs = await repository.listAuthProviderConfigs({ tenantId });
  return configs.find((config) => config.provider === provider && config.enabled) ?? null;
}

function signOidcState(payload: OidcStatePayload, secret: string): string {
  const encodedPayload = base64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest();

  return `${encodedPayload}.${base64Url(signature)}`;
}

function verifyOidcState(state: string, secret: string): OidcStatePayload {
  const [encodedPayload, encodedSignature] = state.split(".");

  if (!encodedPayload || !encodedSignature) {
    throw new OidcLoginError("oidc_state_invalid", 401, "OIDC state is malformed.");
  }

  const expected = base64Url(createHmac("sha256", secret).update(encodedPayload).digest());

  if (!timingSafeStringEqual(encodedSignature, expected)) {
    throw new OidcLoginError("oidc_state_invalid", 401, "OIDC state signature is invalid.");
  }

  let parsed: OidcStatePayload;

  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as OidcStatePayload;
  } catch {
    throw new OidcLoginError("oidc_state_invalid", 401, "OIDC state payload is invalid.");
  }

  if (
    typeof parsed.tenantId !== "string" ||
    typeof parsed.provider !== "string" ||
    typeof parsed.redirectUri !== "string" ||
    typeof parsed.nonceHash !== "string" ||
    typeof parsed.codeVerifierHash !== "string" ||
    typeof parsed.expiresAt !== "string"
  ) {
    throw new OidcLoginError("oidc_state_invalid", 401, "OIDC state payload is invalid.");
  }

  if (Date.parse(parsed.expiresAt) < Date.now()) {
    throw new OidcLoginError("oidc_state_expired", 401, "OIDC state has expired.");
  }

  return parsed;
}

function assertOidcStateMatches(
  state: OidcStatePayload,
  input: {
    tenantId: string;
    provider: ExternalAuthProvider;
    redirectUri: string;
    nonce: string;
    codeVerifier: string;
  }
): void {
  if (
    state.tenantId !== input.tenantId ||
    state.provider !== input.provider ||
    state.redirectUri !== input.redirectUri ||
    state.nonceHash !== hashOidcBoundValue(input.nonce) ||
    state.codeVerifierHash !== hashOidcBoundValue(input.codeVerifier)
  ) {
    throw new OidcLoginError("oidc_state_mismatch", 401, "OIDC state did not match callback inputs.");
  }
}

function readRequiredDiscoveryField(document: Record<string, unknown>, key: string): string {
  const value = document[key];

  if (typeof value !== "string" || !value) {
    throw new OidcLoginError("oidc_discovery_invalid", 502, `OIDC discovery document is missing ${key}.`);
  }

  return value;
}

function readRequiredClaim(claims: JWTPayload, key: string): string {
  const value = claims[key];

  if (typeof value === "string" && value) {
    return value;
  }

  throw new OidcLoginError("oidc_claim_missing", 401, `OIDC ID token is missing required claim ${key}.`);
}

function readOptionalClaim(claims: JWTPayload, key: string): string | undefined {
  const value = claims[key];
  return typeof value === "string" && value ? value : undefined;
}

function readBooleanClaim(claims: JWTPayload, key: string): boolean {
  const value = claims[key];
  return value === true || value === "true";
}

function readGroupClaimValues(claims: JWTPayload, key: string): string[] {
  const value = claims[key];

  if (Array.isArray(value)) {
    return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)))
      .map((item) => item.trim())
      .sort();
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function readRoleClaim(claims: JWTPayload, key: string | null, fallback: AuthPrincipal["role"]): AuthPrincipal["role"] {
  if (!key) {
    return fallback;
  }

  const value = claims[key];
  return value === "admin" || value === "maintainer" || value === "reader" ? value : fallback;
}

function hashOidcBoundValue(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function randomUrlToken(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sendOidcError(reply: FastifyReply, error: unknown) {
  if (error instanceof OidcLoginError) {
    return reply.code(error.statusCode).send({ error: error.code, message: error.message });
  }

  throw error;
}

class OidcLoginError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

interface OidcStatePayload {
  tenantId: string;
  provider: ExternalAuthProvider;
  redirectUri: string;
  nonceHash: string;
  codeVerifierHash: string;
  expiresAt: string;
}

interface AuthenticatedRequest {
  principal: AuthPrincipal;
  source: "bearer" | "session-cookie";
  loginSession: LoginSessionRecord | null;
}

// WeakMaps keep authentication state request-scoped without mutating Fastify's
// request shape or requiring a process-wide cache with explicit eviction.
const authenticationByRequest = new WeakMap<FastifyRequest, Promise<AuthenticatedRequest | null>>();
const sessionTouchByRequest = new WeakMap<FastifyRequest, Promise<AuthenticatedRequest | null>>();

interface RefreshCookie {
  token: string;
  expiresAt: string;
}

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim();
}

async function issueLoginSession(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  authRepository: AuthRepository;
  user: LocalUser;
  keyName: string;
  requestedExpiresInSeconds: number;
  source: LoginSessionSource;
  deviceLabel?: string;
  auditAction: string;
  safeAuditMetadata: Record<string, unknown>;
  loginSessionMaxAgeSeconds: number;
  loginSessionIdleTimeoutSeconds: number | null;
  loginSessionAbsoluteMaxAgeSeconds: number | null;
  loginRefreshTokenMaxAgeSeconds: number | null;
  errorLabel: string;
}): Promise<LoginCredentialIssueResult> {
  const sessionAbsoluteExpiresAt = buildLoginSessionAbsoluteExpiresAt(
    input.loginSessionAbsoluteMaxAgeSeconds
  );
  const sessionClientMetadata = readLoginSessionClientMetadata(input.request, input.deviceLabel);
  const sessionExpiry = buildLoginSessionExpiry(
    input.requestedExpiresInSeconds,
    input.loginSessionMaxAgeSeconds,
    sessionAbsoluteExpiresAt
  );
  const refreshTokenExpiresAt = input.loginRefreshTokenMaxAgeSeconds === null
    ? null
    : capExpiresAt(buildExpiresAt(input.loginRefreshTokenMaxAgeSeconds), sessionAbsoluteExpiresAt);
  const issued = await input.authRepository.issueLoginCredentials({
    tenantId: input.user.tenantId,
    userId: input.user.id,
    keyName: input.keyName,
    scopes: scopesForRole(input.user.role),
    allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
    expiresAt: sessionExpiry.expiresAt,
    source: input.source,
    ...sessionClientMetadata,
    absoluteExpiresAt: sessionAbsoluteExpiresAt,
    refreshTokenExpiresAt,
    auditAction: input.auditAction,
    auditMetadata: {
      ...input.safeAuditMetadata,
      expiresAt: sessionExpiry.expiresAt,
      requestedExpiresInSeconds: sessionExpiry.requestedExpiresInSeconds,
      effectiveExpiresInSeconds: sessionExpiry.effectiveExpiresInSeconds,
      sessionMaxAgeSeconds: sessionExpiry.maxAgeSeconds,
      sessionIdleTimeoutSeconds: input.loginSessionIdleTimeoutSeconds,
      sessionAbsoluteExpiresAt,
      sessionAbsoluteMaxAgeSeconds: input.loginSessionAbsoluteMaxAgeSeconds,
      deviceLabel: sessionClientMetadata.deviceLabel,
      clientUserAgentPresent: Boolean(sessionClientMetadata.clientUserAgent),
      refreshTokenMaxAgeSeconds: input.loginRefreshTokenMaxAgeSeconds
    }
  });

  if (!issued) {
    throw new Error(`${input.errorLabel} credentials could not be issued`);
  }

  const refreshCookie: RefreshCookie | undefined = issued.refreshToken
    ? { token: issued.refreshToken.token, expiresAt: issued.refreshToken.expiresAt }
    : undefined;
  setSessionCookies(input.reply, issued.secret, issued.apiKey.expiresAt, refreshCookie);

  return issued;
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  authRepository?: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthPrincipal | null> {
  const authenticatedRequest = await authenticateOptionalRequest(
    request,
    reply,
    authRepository,
    loginSessionIdleTimeoutSeconds
  );

  if (authenticatedRequest === undefined) {
    return null;
  }

  if (!authenticatedRequest) {
    reply.code(401).send({ error: "authentication_required" });
    return null;
  }

  return authenticatedRequest.principal;
}

async function authenticateOptionalPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  authRepository?: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthPrincipal | null | undefined> {
  const authenticatedRequest = await authenticateOptionalRequest(
    request,
    reply,
    authRepository,
    loginSessionIdleTimeoutSeconds
  );

  if (authenticatedRequest === undefined || authenticatedRequest === null) {
    return authenticatedRequest;
  }

  return authenticatedRequest.principal;
}

async function requireAuthenticatedRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  authRepository?: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthenticatedRequest | null> {
  const authenticatedRequest = await authenticateOptionalRequest(
    request,
    reply,
    authRepository,
    loginSessionIdleTimeoutSeconds
  );

  if (authenticatedRequest === undefined) {
    return null;
  }

  if (!authenticatedRequest) {
    reply.code(401).send({ error: "authentication_required" });
    return null;
  }

  return authenticatedRequest;
}

async function authenticateOptionalRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  authRepository?: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthenticatedRequest | null | undefined> {
  const authenticatedRequest = await authenticate(request, authRepository, loginSessionIdleTimeoutSeconds);

  if (!authenticatedRequest) {
    return null;
  }

  if (authenticatedRequest.source === "session-cookie" && requiresCsrfProtection(request)) {
    const sessionToken = readSessionCookieToken(request);

    if (!sessionToken || !hasValidCsrfToken(request, sessionToken)) {
      reply.code(403).send({ error: "csrf_required" });
      return undefined;
    }
  }

  if (authenticatedRequest.source !== "session-cookie" || !authenticatedRequest.loginSession || !authRepository) {
    return authenticatedRequest;
  }

  return touchAuthenticatedLoginSession(
    request,
    authRepository,
    authenticatedRequest,
    loginSessionIdleTimeoutSeconds
  );
}

async function requireAdminPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  authRepository: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthPrincipal | null> {
  const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

  if (!principal) {
    return null;
  }

  if (principal.role !== "admin" || !principalHasScope(principal, "admin")) {
    await recordDenied(authRepository, principal, principal.tenantId, "auth.admin", "auth", undefined, {});
    reply.code(403).send({ error: "access_denied" });
    return null;
  }

  return principal;
}

async function requirePermissionAdminPrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  authRepository: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthPrincipal | null> {
  const principal = await requirePrincipal(request, reply, authRepository, loginSessionIdleTimeoutSeconds);

  if (!principal) {
    return null;
  }

  if (!roleCanManagePermissions(principal) || !principalHasScope(principal, "permission:write")) {
    await recordDenied(authRepository, principal, principal.tenantId, "permission.grant", "permission", undefined, {});
    reply.code(403).send({ error: "access_denied" });
    return null;
  }

  return principal;
}

async function authenticate(
  request: FastifyRequest,
  authRepository?: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthenticatedRequest | null> {
  const cached = authenticationByRequest.get(request);

  if (cached) {
    return cached;
  }

  const pending = authenticateUncached(request, authRepository, loginSessionIdleTimeoutSeconds);
  authenticationByRequest.set(request, pending);

  try {
    return await pending;
  } catch (error) {
    authenticationByRequest.delete(request);
    throw error;
  }
}

async function authenticateUncached(
  request: FastifyRequest,
  authRepository?: AuthRepository,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthenticatedRequest | null> {
  if (!authRepository) {
    return null;
  }

  const bearer = readBearerToken(request);

  if (bearer) {
    const principal = await authRepository.authenticateApiKey(bearer);
    return principal ? { principal, source: "bearer", loginSession: null } : null;
  }

  const sessionToken = readSessionCookieToken(request);

  if (!sessionToken) {
    return null;
  }

  const principal = await authRepository.authenticateApiKey(sessionToken);

  if (!principal) {
    return null;
  }

  const loginSession = await authRepository.findActiveLoginSessionByApiKeyId({
    tenantId: principal.tenantId,
    apiKeyId: principal.apiKeyId,
    idleTimeoutSeconds: loginSessionIdleTimeoutSeconds
  });

  return loginSession ? { principal, source: "session-cookie", loginSession } : null;
}

async function touchAuthenticatedLoginSession(
  request: FastifyRequest,
  authRepository: AuthRepository,
  authenticatedRequest: AuthenticatedRequest,
  loginSessionIdleTimeoutSeconds?: number | null
): Promise<AuthenticatedRequest | null> {
  const cached = sessionTouchByRequest.get(request);

  if (cached) {
    return cached;
  }

  const pending = authRepository.touchLoginSession({
    tenantId: authenticatedRequest.principal.tenantId,
    sessionId: authenticatedRequest.loginSession?.id ?? "",
    idleTimeoutSeconds: loginSessionIdleTimeoutSeconds
  }).then((loginSession) => loginSession
    ? { ...authenticatedRequest, loginSession }
    : null);
  sessionTouchByRequest.set(request, pending);

  try {
    return await pending;
  } catch (error) {
    sessionTouchByRequest.delete(request);
    throw error;
  }
}

function readBearerToken(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;

  if (!value || Array.isArray(value)) {
    return undefined;
  }

  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

function readSessionCookieToken(request: FastifyRequest): string | undefined {
  return readCookieValue(request, SESSION_COOKIE_NAME);
}

function readCsrfCookieToken(request: FastifyRequest): string | undefined {
  return readCookieValue(request, CSRF_COOKIE_NAME);
}

function readRefreshCookieToken(request: FastifyRequest): string | undefined {
  return readCookieValue(request, REFRESH_COOKIE_NAME);
}

function readCookieValue(request: FastifyRequest, expectedName: string): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader || Array.isArray(cookieHeader)) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (name !== expectedName) {
      continue;
    }

    const value = cookie.slice(separatorIndex + 1).trim();

    if (!value) {
      return undefined;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function setSessionCookies(
  reply: FastifyReply,
  secret: string,
  expiresAt?: string | null,
  refreshCookie?: RefreshCookie
): void {
  const cookies = [
    buildSessionCookie(secret, expiresAt),
    buildCsrfCookie(buildCsrfToken(secret), expiresAt)
  ];

  if (refreshCookie) {
    cookies.push(buildRefreshCookie(refreshCookie.token, refreshCookie.expiresAt));
  }

  reply.header("set-cookie", cookies);
}

function setSessionClearCookies(reply: FastifyReply): void {
  reply.header("set-cookie", [
    buildSessionClearCookie(),
    buildCsrfClearCookie(),
    buildRefreshClearCookie()
  ]);
}

function buildSessionCookie(secret: string, expiresAt?: string | null): string {
  return formatCookie(SESSION_COOKIE_NAME, encodeURIComponent(secret), readSessionCookieMaxAgeSeconds(expiresAt), {
    httpOnly: true
  });
}

function buildSessionClearCookie(): string {
  return formatCookie(SESSION_COOKIE_NAME, "", 0, { httpOnly: true });
}

function buildCsrfCookie(token: string, expiresAt?: string | null): string {
  return formatCookie(CSRF_COOKIE_NAME, encodeURIComponent(token), readSessionCookieMaxAgeSeconds(expiresAt), {
    httpOnly: false
  });
}

function buildCsrfClearCookie(): string {
  return formatCookie(CSRF_COOKIE_NAME, "", 0, { httpOnly: false });
}

function buildRefreshCookie(token: string, expiresAt: string): string {
  return formatCookie(REFRESH_COOKIE_NAME, encodeURIComponent(token), readSessionCookieMaxAgeSeconds(expiresAt), {
    httpOnly: true
  });
}

function buildRefreshClearCookie(): string {
  return formatCookie(REFRESH_COOKIE_NAME, "", 0, { httpOnly: true });
}

function formatCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  options: { httpOnly: boolean }
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];

  if (options.httpOnly) {
    parts.splice(1, 0, "HttpOnly");
  }

  if (readOptionalEnvBoolean(process.env.FORGETBASE_SESSION_COOKIE_SECURE) === true) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function buildCsrfToken(sessionToken: string): string {
  const nonce = randomUrlToken(32);
  return `${nonce}.${signCsrfToken(sessionToken, nonce)}`;
}

function signCsrfToken(sessionToken: string, nonce: string): string {
  return base64Url(createHmac("sha256", sessionToken).update(nonce).digest());
}

function requiresCsrfProtection(request: FastifyRequest): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase());
}

function isPublicAuthenticationPath(requestUrl: string): boolean {
  const pathname = new URL(requestUrl, "http://forgetbase.local").pathname;

  return pathname === "/health" ||
    pathname === "/ready" ||
    pathname === "/auth/login" ||
    pathname === "/auth/oidc/authorize" ||
    pathname === "/auth/oidc/callback" ||
    pathname === "/auth/session/refresh";
}

function hasValidCsrfToken(request: FastifyRequest, sessionToken: string): boolean {
  const cookieToken = readCsrfCookieToken(request);
  const headerToken = readHeaderValue(request, CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || !timingSafeStringEqual(cookieToken, headerToken)) {
    return false;
  }

  const separatorIndex = headerToken.lastIndexOf(".");

  if (separatorIndex <= 0 || separatorIndex === headerToken.length - 1) {
    return false;
  }

  const nonce = headerToken.slice(0, separatorIndex);
  const signature = headerToken.slice(separatorIndex + 1);

  return timingSafeStringEqual(signature, signCsrfToken(sessionToken, nonce));
}

function readHeaderValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];

  if (!value || Array.isArray(value)) {
    return undefined;
  }

  return value;
}

function readSessionCookieMaxAgeSeconds(expiresAt?: string | null): number {
  if (!expiresAt) {
    return DEFAULT_LOGIN_SESSION_MAX_AGE_SECONDS;
  }

  const expiresAtMs = Date.parse(expiresAt);

  if (Number.isNaN(expiresAtMs)) {
    return DEFAULT_LOGIN_SESSION_MAX_AGE_SECONDS;
  }

  return Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
}

function readLoginSessionMaxAgeSeconds(configuredValue?: number): number {
  const rawValue = configuredValue ?? readIntegerEnv("FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS");

  if (rawValue === undefined) {
    return DEFAULT_LOGIN_SESSION_MAX_AGE_SECONDS;
  }

  if (
    !Number.isInteger(rawValue) ||
    rawValue < MIN_LOGIN_SESSION_MAX_AGE_SECONDS ||
    rawValue > MAX_LOGIN_SESSION_MAX_AGE_SECONDS
  ) {
    throw new Error(
      `FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS must be an integer between ${MIN_LOGIN_SESSION_MAX_AGE_SECONDS} and ${MAX_LOGIN_SESSION_MAX_AGE_SECONDS}.`
    );
  }

  return rawValue;
}

function readLoginSessionIdleTimeoutSeconds(configuredValue?: number | null): number | null {
  const rawValue = configuredValue !== undefined
    ? configuredValue
    : readIntegerEnv("FORGETBASE_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS");

  if (rawValue === null) {
    return null;
  }

  if (rawValue === undefined) {
    return DEFAULT_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS;
  }

  if (rawValue === 0) {
    return null;
  }

  if (
    !Number.isInteger(rawValue) ||
    rawValue < MIN_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS ||
    rawValue > MAX_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS
  ) {
    throw new Error(
      `FORGETBASE_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS must be 0 or an integer between ${MIN_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS} and ${MAX_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS}.`
    );
  }

  return rawValue;
}

function readLoginSessionAbsoluteMaxAgeSeconds(configuredValue?: number | null): number | null {
  const rawValue = configuredValue !== undefined
    ? configuredValue
    : readIntegerEnv("FORGETBASE_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS");

  if (rawValue === null) {
    return null;
  }

  if (rawValue === undefined) {
    return DEFAULT_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS;
  }

  if (rawValue === 0) {
    return null;
  }

  if (
    !Number.isInteger(rawValue) ||
    rawValue < MIN_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS ||
    rawValue > MAX_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS
  ) {
    throw new Error(
      `FORGETBASE_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS must be 0 or an integer between ${MIN_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS} and ${MAX_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS}.`
    );
  }

  return rawValue;
}

function readLoginRefreshTokenMaxAgeSeconds(configuredValue?: number | null): number | null {
  const rawValue = configuredValue !== undefined
    ? configuredValue
    : readIntegerEnv("FORGETBASE_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS");

  if (rawValue === null) {
    return null;
  }

  if (rawValue === undefined) {
    return DEFAULT_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS;
  }

  if (rawValue === 0) {
    return null;
  }

  if (
    !Number.isInteger(rawValue) ||
    rawValue < MIN_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS ||
    rawValue > MAX_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS
  ) {
    throw new Error(
      `FORGETBASE_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS must be 0 or an integer between ${MIN_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS} and ${MAX_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS}.`
    );
  }

  return rawValue;
}

function readIntegerEnv(name: string): number | undefined {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return Number.parseInt(value.trim(), 10);
}

function readPositiveIntegerOption(
  configuredValue: number | undefined,
  environmentValue: string | undefined,
  defaultValue: number,
  name: string
): number {
  if (configuredValue !== undefined) {
    if (!Number.isInteger(configuredValue) || configuredValue <= 0) {
      throw new Error(`${name} must be a positive integer.`);
    }

    return configuredValue;
  }

  if (environmentValue === undefined || environmentValue.trim() === "") {
    return defaultValue;
  }

  if (!/^\d+$/.test(environmentValue.trim())) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number.parseInt(environmentValue.trim(), 10);

  if (parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

interface LoginThrottleOptions {
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
  maxEntries: number;
}

interface LoginThrottleEntry {
  attemptCount: number;
  windowStartedAt: number;
  blockedUntil: number | null;
  lastTouchedAt: number;
}

interface LoginThrottleState {
  blocked: boolean;
  attemptCount: number;
  retryAfterSeconds: number;
}

class LoginThrottle {
  private readonly entries = new Map<string, LoginThrottleEntry>();

  constructor(private readonly options: LoginThrottleOptions) {}

  check(key: string, now = Date.now()): LoginThrottleState {
    const entry = this.entries.get(key);

    if (!entry) {
      return { blocked: false, attemptCount: 0, retryAfterSeconds: 0 };
    }

    if (entry.blockedUntil && entry.blockedUntil > now) {
      entry.lastTouchedAt = now;
      return {
        blocked: true,
        attemptCount: entry.attemptCount,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
      };
    }

    if (now - entry.windowStartedAt >= this.options.windowMs) {
      this.entries.delete(key);
      return { blocked: false, attemptCount: 0, retryAfterSeconds: 0 };
    }

    entry.blockedUntil = null;
    entry.lastTouchedAt = now;
    return { blocked: false, attemptCount: entry.attemptCount, retryAfterSeconds: 0 };
  }

  recordFailure(key: string, now = Date.now()): LoginThrottleState {
    const current = this.entries.get(key);
    const entry = !current || now - current.windowStartedAt >= this.options.windowMs
      ? {
          attemptCount: 0,
          windowStartedAt: now,
          blockedUntil: null,
          lastTouchedAt: now
        }
      : current;

    entry.attemptCount += 1;
    entry.lastTouchedAt = now;

    if (entry.attemptCount >= this.options.maxAttempts) {
      entry.blockedUntil = now + this.options.blockMs;
    }

    this.ensureCapacity(key, now);
    this.entries.set(key, entry);

    return {
      blocked: entry.blockedUntil !== null && entry.blockedUntil > now,
      attemptCount: entry.attemptCount,
      retryAfterSeconds: entry.blockedUntil
        ? Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000))
        : 0
    };
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private ensureCapacity(incomingKey: string, now: number): void {
    for (const [key, entry] of this.entries) {
      const blockExpired = entry.blockedUntil === null || entry.blockedUntil <= now;

      if (blockExpired && now - entry.windowStartedAt >= this.options.windowMs) {
        this.entries.delete(key);
      }
    }

    if (this.entries.has(incomingKey) || this.entries.size < this.options.maxEntries) {
      return;
    }

    let oldestKey: string | undefined;
    let oldestTouchedAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      if (entry.lastTouchedAt < oldestTouchedAt) {
        oldestKey = key;
        oldestTouchedAt = entry.lastTouchedAt;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }
}

function buildLoginThrottleKey(request: FastifyRequest, tenantId: string, email: string): string {
  return createHash("sha256")
    .update(`${tenantId}\0${email.trim().toLowerCase()}\0${request.ip}`)
    .digest("hex");
}

async function recordFailedLoginEvidence(
  authRepository: AuthRepository,
  request: FastifyRequest,
  tenantId: string,
  email: string,
  reason: "invalid_credentials" | "login_rate_limited",
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await authRepository.recordAuditEvent({
      tenantId,
      action: "auth.login",
      targetType: "user",
      outcome: "denied",
      reason,
      metadata: {
        ...metadata,
        emailHash: createHash("sha256").update(email.trim().toLowerCase()).digest("hex"),
        remoteAddressHash: createHash("sha256").update(request.ip).digest("hex")
      }
    });
  } catch (error) {
    request.log.warn({ err: error, tenantId, reason }, "Could not persist failed-login audit evidence");
  }
}

function buildLoginSessionExpiry(
  requestedExpiresInSeconds: number,
  maxAgeSeconds: number,
  absoluteExpiresAt?: string | null
) {
  const effectiveExpiresInSeconds = Math.min(
    requestedExpiresInSeconds,
    maxAgeSeconds,
    absoluteExpiresAt ? readSecondsUntil(absoluteExpiresAt) : Number.POSITIVE_INFINITY
  );

  return {
    requestedExpiresInSeconds,
    effectiveExpiresInSeconds,
    maxAgeSeconds,
    expiresAt: new Date(Date.now() + effectiveExpiresInSeconds * 1000).toISOString()
  };
}

function buildLoginSessionAbsoluteExpiresAt(maxAgeSeconds: number | null): string | null {
  return maxAgeSeconds === null ? null : buildExpiresAt(maxAgeSeconds);
}

function readLoginSessionClientMetadata(
  request: FastifyRequest,
  deviceLabel: string | undefined
): { deviceLabel: string | null; clientUserAgent: string | null } {
  return {
    deviceLabel: deviceLabel ?? null,
    clientUserAgent: readClientUserAgent(request)
  };
}

function readClientUserAgent(request: FastifyRequest): string | null {
  const header = request.headers["user-agent"];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, MAX_LOGIN_SESSION_CLIENT_USER_AGENT_LENGTH);
}

function buildExpiresAt(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function capExpiresAt(expiresAt: string, absoluteExpiresAt: string | null): string {
  if (!absoluteExpiresAt) {
    return expiresAt;
  }

  return Date.parse(expiresAt) <= Date.parse(absoluteExpiresAt) ? expiresAt : absoluteExpiresAt;
}

function readSecondsUntil(expiresAt: string): number {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
}

function readOptionalEnvBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment value: ${value}`);
}

function readCorsAllowedOriginsEnv(): string[] {
  const value = process.env.FORGETBASE_CORS_ALLOWED_ORIGINS;

  if (!value) {
    return DEFAULT_CORS_ALLOWED_ORIGINS;
  }

  return value.split(",").map((origin) => origin.trim()).filter(Boolean);
}

function readAllowedOrigins(origins: string[]): Set<string> {
  return new Set(origins.map(normalizeOrigin).filter((origin): origin is string => Boolean(origin)));
}

function normalizeOrigin(origin: string): string | undefined {
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function readOptionalBooleanQuery(value: string | undefined): boolean | string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (["true", "1", "yes"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no"].includes(value.toLowerCase())) {
    return false;
  }

  return value;
}

function readSurface(request: FastifyRequest, principal: AuthPrincipal | null): Surface {
  if (!readBearerToken(request) && readSessionCookieToken(request)) {
    return "web";
  }

  const value = request.headers["x-forgetbase-surface"];

  if (
    principal &&
    readBearerToken(request) &&
    typeof value === "string" &&
    ["api", "cli", "mcp", "web"].includes(value)
  ) {
    // The repository intersects this assertion with the authenticated API key's
    // allowedSurfaces binding before it evaluates asset/grant permissions.
    return value as Surface;
  }

  return "api";
}

function scopesForRole(role: AuthPrincipal["role"]): ApiKeyScope[] {
  switch (role) {
    case "admin":
      return ["admin", "asset:read", "asset:write", "permission:write"];
    case "maintainer":
      return ["asset:read", "asset:write"];
    case "reader":
      return ["asset:read"];
  }
}

async function recordDenied(
  authRepository: AuthRepository,
  principal: AuthPrincipal | null,
  tenantId: string,
  action: string,
  targetType: string,
  targetId: string | undefined,
  metadata: Record<string, unknown>
): Promise<void> {
  await authRepository.recordAuditEvent({
    tenantId,
    ...auditActor(principal),
    action,
    targetType,
    targetId,
    outcome: "denied",
    reason: "access_denied",
    metadata
  });
}

function sendValidationError(
  reply: FastifyReply,
  issues: Array<{ path: PropertyKey[]; message: string }>
) {
  return reply.code(400).send({
    error: "validation_error",
    issues: issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  });
}
