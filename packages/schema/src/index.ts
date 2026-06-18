import { createHash } from "node:crypto";
import { z } from "zod";

export const agenticCmsVersion = "0.1.0";
export const okfCurrentVersion = "0.1";
export const okfSpecStatus = "draft";
export const okfSpecCheckedAt = "2026-06-18";
export const okfSpecSourceUrl = "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md";

export const assetTypeSchema = z.enum([
  "policy",
  "guideline",
  "guardrail",
  "playbook",
  "skill",
  "sop",
  "tool-instruction",
  "template",
  "reference",
  "human-document",
  "agent-instruction",
  "eval-case",
  "telemetry-policy"
]);

export const lifecycleStateSchema = z.enum([
  "draft",
  "active",
  "deprecated",
  "archived",
  "restricted"
]);

export const sensitivitySchema = z.enum([
  "public-demo",
  "internal",
  "restricted",
  "confidential",
  "secret"
]);

export const surfaceSchema = z.enum(["api", "cli", "mcp", "web", "export"]);
export const aiExportFormatSchema = z.enum(["json", "okf"]);
export const okfVersionSchema = z.enum(["0.1"]);
export const userRoleSchema = z.enum(["admin", "maintainer", "reader"]);
export const userStatusSchema = z.enum(["active", "disabled"]);
export const apiKeyScopeSchema = z.enum(["admin", "asset:read", "asset:write", "permission:write", "agent:execute"]);
export const permissionActionSchema = z.enum(["read", "write", "admin", "export", "execute"]);
export const authPrincipalTypeSchema = z.enum(["user", "service-account"]);
export const permissionPrincipalTypeSchema = z.enum(["user", "group", "service-account"]);
export const groupMembershipSourceSchema = z.enum(["local", "external"]);
export const auditOutcomeSchema = z.enum(["success", "denied", "error"]);
export const chunkSourceKindSchema = z.enum(["asset-summary", "agent-instruction", "human-document"]);
export const modelProviderSchema = z.enum(["openai", "anthropic", "openrouter"]);
export const externalAuthProviderSchema = z.enum(["oidc", "microsoft-entra"]);
export const userAuthProviderSchema = z.enum(["local", "oidc", "microsoft-entra"]);
export const accountLinkingModeSchema = z.enum(["disabled", "verified-email", "email"]);
export const loginSessionSourceSchema = z.enum(["password", "oidc"]);
export const agentActionTypeSchema = z.enum([
  "create-task-record",
  "http-openapi",
  "mcp-tool",
  "git-repo",
  "document-connector",
  "local-command"
]);
export const agentActionStatusSchema = z.enum([
  "blocked",
  "dry-run",
  "approval-required",
  "approved",
  "denied",
  "executed",
  "expired"
]);
export const piiRedactionRuleKindSchema = z.enum([
  "api-key",
  "bearer-token",
  "credit-card",
  "email",
  "government-id",
  "ip-address",
  "jwt",
  "phone",
  "url-secret"
]);

export const jsonObjectSchema = z.record(z.string(), z.unknown());
const secretEnvVarNameSchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/);
const secretEnvVarPrefixSchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/);

export const assetSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  stableId: z.string().min(1),
  type: assetTypeSchema,
  ownerId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  lifecycleState: lifecycleStateSchema,
  sensitivity: sensitivitySchema,
  audience: z.array(z.string().min(1)).min(1),
  status: z.string().min(1),
  reviewDueAt: z.string().min(1),
  allowedSurfaces: z.array(surfaceSchema).min(1),
  allowedExports: z.array(z.string().min(1)).default([]),
  allowedActions: z.array(z.string().min(1)).default([])
});

export const assetRecordSchema = assetSchema.extend({
  sourceKind: z.string().nullable(),
  sourceRef: z.string().nullable(),
  currentVersionId: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const agentInstructionInputSchema = z.object({
  instructionKind: z.string().min(1),
  targetAgents: z.array(z.string().min(1)).default([]),
  body: z.string().min(1),
  inputContract: jsonObjectSchema.default({}),
  outputContract: jsonObjectSchema.default({}),
  constraints: z.array(z.string().min(1)).default([]),
  examples: z.array(z.string().min(1)).default([]),
  failureModes: z.array(z.string().min(1)).default([]),
  escalation: z.string().optional()
});

export const humanDocumentInputSchema = z.object({
  format: z.enum(["markdown", "html", "plain-text"]),
  body: z.string().min(1),
  renderOptions: jsonObjectSchema.default({}),
  linkedInstructionIds: z.array(z.string().min(1)).default([])
});

export const assetCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  stableId: z.string().min(1),
  type: assetTypeSchema,
  ownerId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  lifecycleState: lifecycleStateSchema,
  sensitivity: sensitivitySchema,
  audience: z.array(z.string().min(1)).min(1),
  status: z.string().min(1),
  reviewDueAt: z.string().min(1),
  sourceKind: z.string().min(1).default("manual"),
  sourceRef: z.string().optional(),
  allowedSurfaces: z.array(surfaceSchema).min(1),
  allowedExports: z.array(z.string().min(1)).default([]),
  allowedActions: z.array(z.string().min(1)).default([]),
  metadata: jsonObjectSchema.default({}),
  instruction: agentInstructionInputSchema.optional(),
  humanDocument: humanDocumentInputSchema.optional(),
  changeNote: z.string().optional()
}).refine((asset) => asset.instruction || asset.humanDocument, {
  message: "At least one of instruction or humanDocument is required",
  path: ["instruction"]
});

export const assetUpdateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  lifecycleState: lifecycleStateSchema.optional(),
  sensitivity: sensitivitySchema.optional(),
  audience: z.array(z.string().min(1)).min(1).optional(),
  status: z.string().min(1).optional(),
  reviewDueAt: z.string().min(1).optional(),
  sourceRef: z.string().optional(),
  allowedSurfaces: z.array(surfaceSchema).min(1).optional(),
  allowedExports: z.array(z.string().min(1)).optional(),
  allowedActions: z.array(z.string().min(1)).optional(),
  metadata: jsonObjectSchema.default({}),
  instruction: agentInstructionInputSchema.optional(),
  humanDocument: humanDocumentInputSchema.optional(),
  changeNote: z.string().optional()
}).refine((asset) => asset.instruction || asset.humanDocument, {
  message: "At least one of instruction or humanDocument is required",
  path: ["instruction"]
});

export const assetRestoreInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  versionId: z.string().min(1).optional(),
  versionNumber: z.number().int().positive().optional(),
  changeNote: z.string().optional()
}).refine((input) => input.versionId || input.versionNumber, {
  message: "One of versionId or versionNumber is required",
  path: ["versionId"]
});

export const assetPublishInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  reviewDueAt: z.string().min(1).optional(),
  changeNote: z.string().optional()
});

export const assetReviewInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  status: z.string().min(1).default("approved"),
  reviewDueAt: z.string().min(1),
  sourceRef: z.string().optional(),
  changeNote: z.string().optional()
});

export const assetReviewQueueInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  asOf: z.string().min(1).optional(),
  includeApproved: z.boolean().default(false),
  limit: z.number().int().positive().max(200).default(50)
});

export const assetVersionSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  contentHash: z.string().min(1),
  metadata: jsonObjectSchema,
  createdBy: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  changeNote: z.string().nullable()
});

export const agentInstructionSchema = agentInstructionInputSchema.extend({
  id: z.string().min(1),
  assetId: z.string().min(1),
  versionId: z.string().min(1),
  createdAt: z.string().min(1),
  escalation: z.string().nullable()
});

export const humanDocumentSchema = humanDocumentInputSchema.extend({
  id: z.string().min(1),
  assetId: z.string().min(1),
  versionId: z.string().min(1),
  createdAt: z.string().min(1)
});

export const assetDetailSchema = z.object({
  asset: assetRecordSchema,
  versions: z.array(assetVersionSchema),
  instructionObjects: z.array(agentInstructionSchema),
  humanDocuments: z.array(humanDocumentSchema)
});

export const assetVersionSnapshotInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  versionId: z.string().min(1).optional(),
  versionNumber: z.number().int().positive().optional()
}).refine((input) => input.versionId || input.versionNumber, {
  message: "One of versionId or versionNumber is required",
  path: ["versionId"]
});

export const assetVersionSnapshotSchema = z.object({
  asset: assetRecordSchema,
  version: assetVersionSchema,
  instructionObjects: z.array(agentInstructionSchema),
  humanDocuments: z.array(humanDocumentSchema)
});

export const assetListResponseSchema = z.object({
  assets: z.array(assetRecordSchema)
});

export const assetReviewQueueResponseSchema = z.object({
  asOf: z.string().min(1),
  includeApproved: z.boolean(),
  assets: z.array(assetRecordSchema)
});

export const validationSeveritySchema = z.enum(["error", "warning"]);
export const validationIssueSchema = z.object({
  severity: validationSeveritySchema,
  code: z.string().min(1),
  path: z.string().min(1),
  message: z.string().min(1),
  stableId: z.string().min(1).optional()
});

export const assetValidationInputSchema = z.object({
  assets: z.array(z.unknown()).min(1),
  asOf: z.string().min(1).optional(),
  publicExportPackages: z.array(z.string().min(1)).default(["demo-agent-pack", "public-demo"])
});

export const assetValidationReportSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string().min(1),
  asOf: z.string().min(1),
  assetCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  staleCount: z.number().int().nonnegative(),
  issues: z.array(validationIssueSchema)
});

export const localUserCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: userRoleSchema.default("reader"),
  status: userStatusSchema.default("active"),
  password: z.string().min(12).optional()
});

export const localUserUpdateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  userId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  password: z.string().min(12).optional()
}).refine(
  (input) =>
    input.displayName !== undefined ||
    input.role !== undefined ||
    input.status !== undefined ||
    input.password !== undefined,
  { message: "At least one user update field is required" }
);

export const localUserSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: userRoleSchema,
  status: userStatusSchema,
  authProvider: userAuthProviderSchema,
  externalProvider: externalAuthProviderSchema.nullable(),
  externalSubject: z.string().nullable(),
  externalIssuer: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const localUserListResponseSchema = z.object({
  users: z.array(localUserSchema)
});

export const serviceAccountCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
  role: userRoleSchema.default("reader"),
  status: userStatusSchema.default("active")
});

export const serviceAccountUpdateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  serviceAccountId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).nullable().optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional()
}).refine(
  (input) =>
    input.name !== undefined ||
    input.description !== undefined ||
    input.role !== undefined ||
    input.status !== undefined,
  { message: "At least one service account update field is required" }
);

export const serviceAccountSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const serviceAccountListResponseSchema = z.object({
  serviceAccounts: z.array(serviceAccountSchema)
});

export const serviceAccountPolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  maxServiceAccounts: z.number().int().positive().max(10_000).nullable().optional(),
  maxActiveApiKeysPerServiceAccount: z.number().int().positive().max(1_000).nullable().optional(),
  defaultApiKeyExpiresInDays: z.number().int().positive().max(3_650).nullable().optional()
});

export const serviceAccountPolicySchema = z.object({
  tenantId: z.string().min(1),
  maxServiceAccounts: z.number().int().positive().nullable(),
  maxActiveApiKeysPerServiceAccount: z.number().int().positive().nullable(),
  defaultApiKeyExpiresInDays: z.number().int().positive().nullable(),
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
});

export const groupCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).optional()
});

export const groupRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  externalProvider: externalAuthProviderSchema.nullable(),
  externalId: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const groupListResponseSchema = z.object({
  groups: z.array(groupRecordSchema)
});

export const groupMembershipInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  groupId: z.string().min(1),
  userId: z.string().min(1)
});

export const groupMembershipSchema = z.object({
  groupId: z.string().min(1),
  userId: z.string().min(1),
  userEmail: z.string().email(),
  userDisplayName: z.string().min(1),
  userRole: userRoleSchema,
  source: groupMembershipSourceSchema,
  externalProvider: externalAuthProviderSchema.nullable(),
  createdAt: z.string().min(1)
});

export const groupMembershipListResponseSchema = z.object({
  members: z.array(groupMembershipSchema)
});

export const apiKeyCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  userId: z.string().min(1).optional(),
  serviceAccountId: z.string().min(1).optional(),
  name: z.string().min(1),
  scopes: z.array(apiKeyScopeSchema).min(1).default(["asset:read"]),
  expiresAt: z.string().optional()
}).refine(
  (input) => Boolean(input.userId) !== Boolean(input.serviceAccountId),
  { message: "Exactly one of userId or serviceAccountId is required" }
);

export const apiKeyRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1).nullable(),
  serviceAccountId: z.string().min(1).nullable(),
  name: z.string().min(1),
  secretPreview: z.string().min(1),
  scopes: z.array(apiKeyScopeSchema).min(1),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string().min(1)
});

export const apiKeyCreatedSchema = z.object({
  apiKey: apiKeyRecordSchema,
  secret: z.string().min(1)
});

export const apiKeyListResponseSchema = z.object({
  apiKeys: z.array(apiKeyRecordSchema)
});

export const apiKeyRotationStateSchema = z.enum(["expired", "due-soon", "missing-expiry"]);

export const apiKeyRotationReportInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  asOf: z.string()
    .min(1)
    .refine((value) => Number.isFinite(Date.parse(value)), "asOf must be a valid date/time")
    .optional(),
  dueWithinDays: z.number().int().nonnegative().max(3_650).default(14),
  includeUserKeys: z.boolean().default(false),
  includeRevoked: z.boolean().default(false),
  limit: z.number().int().positive().max(200).default(50)
});

export const apiKeyRotationReminderSchema = z.object({
  apiKey: apiKeyRecordSchema,
  ownerType: z.enum(["user", "service-account"]),
  rotationState: apiKeyRotationStateSchema,
  daysUntilExpiry: z.number().int().nullable(),
  reason: z.string().min(1)
});

export const apiKeyRotationReportSchema = z.object({
  tenantId: z.string().min(1),
  asOf: z.string().min(1),
  dueBefore: z.string().min(1),
  dueWithinDays: z.number().int().nonnegative(),
  includeUserKeys: z.boolean(),
  includeRevoked: z.boolean(),
  reminders: z.array(apiKeyRotationReminderSchema)
});

export const apiKeyRevokeResponseSchema = z.object({
  apiKey: apiKeyRecordSchema
});

export const apiKeyRotateInputSchema = z.object({
  name: z.string().min(1).optional(),
  revokeOld: z.boolean().default(false)
});

export const apiKeyRotateResponseSchema = z.object({
  apiKey: apiKeyRecordSchema,
  secret: z.string().min(1),
  rotatedFrom: apiKeyRecordSchema,
  revokedApiKey: apiKeyRecordSchema.nullable()
});

export const authBootstrapInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  email: z.string().email(),
  displayName: z.string().min(1),
  keyName: z.string().min(1).default("bootstrap-admin"),
  password: z.string().min(12).optional()
});

export const authLoginInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  email: z.string().email(),
  password: z.string().min(1),
  keyName: z.string().min(1).default("local-login"),
  deviceLabel: z.string().trim().min(1).max(120).optional(),
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 30).default(60 * 60 * 12)
});

export const authLoginResponseSchema = apiKeyCreatedSchema.extend({
  user: localUserSchema
});

export const authOidcAuthorizeInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  provider: externalAuthProviderSchema,
  redirectUri: z.string().url().optional()
});

export const authOidcAuthorizeResponseSchema = z.object({
  tenantId: z.string().min(1),
  provider: externalAuthProviderSchema,
  authorizationUrl: z.string().url(),
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(43),
  codeChallenge: z.string().min(1),
  redirectUri: z.string().url(),
  expiresAt: z.string().min(1)
});

export const authOidcCallbackInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  provider: externalAuthProviderSchema,
  code: z.string().min(1),
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(43),
  redirectUri: z.string().url().optional(),
  keyName: z.string().min(1).default("oidc-login"),
  deviceLabel: z.string().trim().min(1).max(120).optional(),
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 30).default(60 * 60 * 12)
});

export const authOidcLoginResponseSchema = authLoginResponseSchema.extend({
  provider: externalAuthProviderSchema,
  subject: z.string().min(1),
  issuer: z.string().min(1)
});

export const authPrincipalSchema = z.object({
  tenantId: z.string().min(1),
  principalType: authPrincipalTypeSchema,
  principalId: z.string().min(1),
  userId: z.string().min(1).nullable(),
  serviceAccountId: z.string().min(1).nullable(),
  apiKeyId: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().min(1),
  role: userRoleSchema,
  scopes: z.array(apiKeyScopeSchema),
  groupIds: z.array(z.string().min(1)).default([])
});

export const loginSessionRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  apiKeyId: z.string().min(1),
  source: loginSessionSourceSchema,
  deviceLabel: z.string().min(1).nullable(),
  clientUserAgent: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  absoluteExpiresAt: z.string().min(1).nullable(),
  lastSeenAt: z.string().min(1).nullable(),
  revokedAt: z.string().min(1).nullable()
});

export const loginSessionListResponseSchema = z.object({
  sessions: z.array(loginSessionRecordSchema)
});

export const loginSessionRevokeResponseSchema = z.object({
  session: loginSessionRecordSchema,
  apiKey: apiKeyRecordSchema
});

export const loginSessionRefreshResponseSchema = z.object({
  session: loginSessionRecordSchema,
  apiKey: apiKeyRecordSchema
});

export const permissionGrantCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  stableId: z.string().min(1),
  principalType: permissionPrincipalTypeSchema,
  principalId: z.string().min(1),
  action: permissionActionSchema.default("read"),
  surfaces: z.array(surfaceSchema).min(1).default(["api", "cli", "mcp", "web"]),
  createdBy: z.string().min(1).optional()
});

export const permissionGrantSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  assetId: z.string().min(1),
  stableId: z.string().min(1),
  principalType: permissionPrincipalTypeSchema,
  principalId: z.string().min(1),
  action: permissionActionSchema,
  surfaces: z.array(surfaceSchema).min(1),
  createdBy: z.string().nullable(),
  createdAt: z.string().min(1)
});

export const auditEventCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  actorUserId: z.string().min(1).optional(),
  actorServiceAccountId: z.string().min(1).optional(),
  actorApiKeyId: z.string().min(1).optional(),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().optional(),
  outcome: auditOutcomeSchema,
  reason: z.string().optional(),
  metadata: jsonObjectSchema.default({})
});

export const auditEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  actorUserId: z.string().nullable(),
  actorServiceAccountId: z.string().nullable(),
  actorApiKeyId: z.string().nullable(),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().nullable(),
  outcome: auditOutcomeSchema,
  reason: z.string().nullable(),
  metadata: jsonObjectSchema,
  createdAt: z.string().min(1)
});

export const auditEventListResponseSchema = z.object({
  events: z.array(auditEventSchema)
});

export const searchInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  query: z.string().min(1),
  limit: z.number().int().positive().max(50).default(10),
  strategy: z.enum(["lexical", "vector", "hybrid"]).default("lexical")
});

export const citationSchema = z.object({
  stableId: z.string().min(1),
  assetId: z.string().min(1),
  chunkId: z.string().min(1),
  sourceKind: chunkSourceKindSchema,
  sourceId: z.string().nullable(),
  sourceRef: z.string().nullable(),
  versionId: z.string().nullable(),
  title: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  snippet: z.string().min(1)
});

export const searchRankingStrategySchema = z.enum([
  "lexical-weighted-v1",
  "vector-hash-v1",
  "hybrid-hash-lexical-v1"
]);

export const searchRankingSchema = z.object({
  strategy: searchRankingStrategySchema,
  lexicalRank: z.number(),
  sourceKindWeight: z.number().positive(),
  exactPhraseBoost: z.number().nonnegative(),
  vectorSimilarity: z.number().nonnegative().nullable(),
  vectorWeight: z.number().nonnegative().nullable(),
  finalScore: z.number()
});

const rankingWeightInputSchema = z.coerce.number().positive().max(10);
const rankingBoostInputSchema = z.coerce.number().nonnegative().max(10);

export const retrievalRankingPolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  agentInstructionWeight: rankingWeightInputSchema.optional(),
  assetSummaryWeight: rankingWeightInputSchema.optional(),
  humanDocumentWeight: rankingWeightInputSchema.optional(),
  exactPhraseBoost: rankingBoostInputSchema.optional()
});

export const retrievalRankingPolicySchema = z.object({
  tenantId: z.string().min(1),
  agentInstructionWeight: rankingWeightInputSchema,
  assetSummaryWeight: rankingWeightInputSchema,
  humanDocumentWeight: rankingWeightInputSchema,
  exactPhraseBoost: rankingBoostInputSchema,
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
});

export const searchResultSchema = z.object({
  asset: assetRecordSchema,
  chunkId: z.string().min(1),
  sourceKind: chunkSourceKindSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  rank: z.number(),
  ranking: searchRankingSchema,
  citation: citationSchema
});

export const searchResponseSchema = z.object({
  query: z.string().min(1),
  results: z.array(searchResultSchema),
  telemetryEventId: z.string().nullable()
});

export const managedQueryModeSchema = z.enum(["deterministic-retrieval", "provider-routed"]);

export const managedQueryInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  query: z.string().min(1),
  limit: z.number().int().positive().max(10).default(5),
  mode: managedQueryModeSchema.default("deterministic-retrieval"),
  provider: modelProviderSchema.optional(),
  model: z.string().min(1).optional(),
  cache: z.boolean().default(true)
});

export const managedQueryCheckSchema = z.object({
  grounded: z.boolean(),
  resultCount: z.number().int().nonnegative(),
  citationCount: z.number().int().nonnegative(),
  deniedCount: z.number().int().nonnegative()
});

export const managedQueryGenerationStatusSchema = z.enum(["not-requested", "completed", "skipped", "failed"]);

export const managedQueryGenerationUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable()
});

export const managedQueryGenerationAttemptSchema = z.object({
  provider: modelProviderSchema,
  model: z.string().min(1).nullable(),
  status: managedQueryGenerationStatusSchema,
  reason: z.string().min(1).nullable(),
  latencyMs: z.number().int().nonnegative().nullable()
});

export const managedQueryGenerationSchema = z.object({
  provider: modelProviderSchema.nullable(),
  model: z.string().min(1).nullable(),
  status: managedQueryGenerationStatusSchema,
  reason: z.string().min(1).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  usage: managedQueryGenerationUsageSchema,
  attempts: z.array(managedQueryGenerationAttemptSchema)
});

export const managedQueryCacheStatusSchema = z.enum(["disabled", "bypass", "miss", "hit", "stored"]);

export const managedQueryCacheSchema = z.object({
  status: managedQueryCacheStatusSchema,
  hit: z.boolean(),
  cacheKey: z.string().min(1).nullable(),
  expiresAt: z.string().min(1).nullable(),
  reason: z.string().min(1).nullable()
});

export const managedQueryCacheEntrySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  cacheKey: z.string().min(1),
  provider: modelProviderSchema,
  model: z.string().min(1),
  mode: z.literal("provider-routed"),
  queryHash: z.string().min(1),
  surface: surfaceSchema,
  principalHash: z.string().min(1),
  contextHash: z.string().min(1),
  generation: managedQueryGenerationSchema,
  metadata: jsonObjectSchema,
  expiresAt: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastHitAt: z.string().min(1).nullable(),
  hitCount: z.number().int().nonnegative()
});

export const managedQueryCacheListResponseSchema = z.object({
  entries: z.array(managedQueryCacheEntrySchema)
});

export const managedQueryCachePurgeInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  expiredBefore: z.string().min(1).optional(),
  dryRun: z.boolean().default(true)
});

export const managedQueryCachePurgeResultSchema = z.object({
  tenantId: z.string().min(1),
  dryRun: z.boolean(),
  purgedAt: z.string().min(1),
  expiredBefore: z.string().min(1),
  deletedCount: z.number().int().nonnegative()
});

const managedQueryCacheTtlSecondsSchema = z.number().int().positive().max(86_400).nullable();
const managedQueryCacheTtlSecondsInputSchema = z.union([
  z.coerce.number().int().positive().max(86_400),
  z.null()
]);

export const managedQueryCachePolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  cacheEnabled: z.boolean().optional(),
  maxCacheTtlSeconds: managedQueryCacheTtlSecondsInputSchema.optional()
});

export const managedQueryCachePolicySchema = z.object({
  tenantId: z.string().min(1),
  cacheEnabled: z.boolean(),
  maxCacheTtlSeconds: managedQueryCacheTtlSecondsSchema,
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
});

export const managedQueryPolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  defaultMode: managedQueryModeSchema.optional(),
  allowedModes: z.array(managedQueryModeSchema).min(1).optional(),
  minimumCitationCount: z.coerce.number().int().nonnegative().max(10).optional(),
  requireGrounded: z.boolean().optional()
});

export const managedQueryPolicySchema = z.object({
  tenantId: z.string().min(1),
  defaultMode: managedQueryModeSchema,
  allowedModes: z.array(managedQueryModeSchema).min(1),
  minimumCitationCount: z.number().int().nonnegative().max(10),
  requireGrounded: z.boolean(),
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
}).refine((policy) => policy.allowedModes.includes(policy.defaultMode), {
  message: "defaultMode must be included in allowedModes",
  path: ["defaultMode"]
});

export const managedQueryResponseSchema = z.object({
  query: z.string().min(1),
  mode: managedQueryModeSchema,
  answer: z.string().min(1),
  results: z.array(searchResultSchema),
  citations: z.array(citationSchema),
  telemetryEventId: z.string().nullable(),
  checks: managedQueryCheckSchema,
  generation: managedQueryGenerationSchema,
  cache: managedQueryCacheSchema,
  warnings: z.array(z.string())
});

export const managedQueryFeedbackOutcomeSchema = z.enum(["accepted", "rejected", "needs-review"]);
const managedQueryFeedbackScoreInputSchema = z.number().int().min(1).max(5).optional();
const managedQueryFeedbackScoreSchema = z.number().int().min(1).max(5).nullable();

export const managedQueryFeedbackInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  telemetryEventId: z.string().min(1),
  query: z.string().min(1),
  outcome: managedQueryFeedbackOutcomeSchema,
  factualCitationAccuracy: managedQueryFeedbackScoreInputSchema,
  policyCompliance: managedQueryFeedbackScoreInputSchema,
  taskCompletionQuality: managedQueryFeedbackScoreInputSchema,
  consistency: managedQueryFeedbackScoreInputSchema,
  responseEffectiveness: managedQueryFeedbackScoreInputSchema,
  notes: z.string().min(1).max(4000).optional(),
  metadata: jsonObjectSchema.default({})
});

export const managedQueryFeedbackCreateInputSchema = managedQueryFeedbackInputSchema.extend({
  actorUserId: z.string().min(1).optional(),
  actorServiceAccountId: z.string().min(1).optional(),
  actorApiKeyId: z.string().min(1).optional()
});

export const managedQueryFeedbackSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  telemetryEventId: z.string().min(1),
  actorUserId: z.string().nullable(),
  actorServiceAccountId: z.string().nullable(),
  actorApiKeyId: z.string().nullable(),
  query: z.string().min(1),
  outcome: managedQueryFeedbackOutcomeSchema,
  factualCitationAccuracy: managedQueryFeedbackScoreSchema,
  policyCompliance: managedQueryFeedbackScoreSchema,
  taskCompletionQuality: managedQueryFeedbackScoreSchema,
  consistency: managedQueryFeedbackScoreSchema,
  responseEffectiveness: managedQueryFeedbackScoreSchema,
  notes: z.string().nullable(),
  metadata: jsonObjectSchema,
  createdAt: z.string().min(1)
});

export const managedQueryFeedbackListResponseSchema = z.object({
  feedback: z.array(managedQueryFeedbackSchema)
});

export const managedQueryEvalCaseSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  expectedStableIds: z.array(z.string().min(1)).default([]),
  expectedGrounded: z.boolean().default(true),
  requiredCitationCount: z.number().int().nonnegative().default(1),
  tags: z.array(z.string().min(1)).default([]),
  metadata: jsonObjectSchema.default({})
});

export const managedQueryEvalPassRateSchema = z.number().min(0).max(1);

export const managedQueryEvalInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  limit: z.number().int().positive().max(10).default(5),
  minimumPassRate: managedQueryEvalPassRateSchema.default(1),
  tagMinimumPassRates: z.record(z.string().min(1), managedQueryEvalPassRateSchema).default({}),
  cases: z.array(managedQueryEvalCaseSchema).min(1)
});

export const managedQueryEvalCaseResultSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  passed: z.boolean(),
  resultStableIds: z.array(z.string().min(1)),
  missingStableIds: z.array(z.string().min(1)),
  expectedStableIds: z.array(z.string().min(1)),
  requiredCitationCount: z.number().int().nonnegative(),
  citationCount: z.number().int().nonnegative(),
  grounded: z.boolean(),
  tags: z.array(z.string().min(1)),
  telemetryEventId: z.string().nullable(),
  warnings: z.array(z.string())
});

export const managedQueryEvalTagResultSchema = z.object({
  tag: z.string().min(1),
  caseCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1)
});

export const managedQueryEvalThresholdResultSchema = z.object({
  scope: z.enum(["overall", "tag"]),
  tag: z.string().min(1).nullable(),
  minimumPassRate: managedQueryEvalPassRateSchema,
  passRate: z.number().min(0).max(1),
  caseCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  passed: z.boolean(),
  reason: z.string().nullable()
});

export const managedQueryEvalReportSchema = z.object({
  ok: z.boolean(),
  mode: managedQueryModeSchema,
  checkedAt: z.string().min(1),
  tenantId: z.string().min(1),
  caseCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  minimumPassRate: managedQueryEvalPassRateSchema,
  thresholdPassed: z.boolean(),
  tagResults: z.array(managedQueryEvalTagResultSchema),
  tagThresholdResults: z.array(managedQueryEvalThresholdResultSchema),
  results: z.array(managedQueryEvalCaseResultSchema)
});

export const managedQueryEvalRunCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  actorUserId: z.string().min(1).optional(),
  actorServiceAccountId: z.string().min(1).optional(),
  actorApiKeyId: z.string().min(1).optional(),
  report: managedQueryEvalReportSchema,
  metadata: jsonObjectSchema.default({})
});

export const managedQueryEvalRunSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  actorUserId: z.string().min(1).nullable(),
  actorServiceAccountId: z.string().min(1).nullable(),
  actorApiKeyId: z.string().min(1).nullable(),
  ok: z.boolean(),
  mode: managedQueryModeSchema,
  checkedAt: z.string().min(1),
  caseCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  minimumPassRate: managedQueryEvalPassRateSchema,
  thresholdPassed: z.boolean(),
  report: managedQueryEvalReportSchema,
  metadata: jsonObjectSchema,
  createdAt: z.string().min(1)
});

export const managedQueryEvalRunListResponseSchema = z.object({
  runs: z.array(managedQueryEvalRunSchema)
});

export const managedQueryEvalScheduleStatusSchema = z.enum(["not-run", "passed", "failed", "error"]);

export const managedQueryEvalScheduleInputSchema = z.object({
  limit: z.number().int().positive().max(10).default(5),
  minimumPassRate: managedQueryEvalPassRateSchema.default(1),
  tagMinimumPassRates: z.record(z.string().min(1), managedQueryEvalPassRateSchema).default({}),
  cases: z.array(managedQueryEvalCaseSchema).min(1)
});

export const managedQueryEvalSchedulePolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  enabled: z.boolean().optional(),
  intervalMinutes: z.coerce.number().int().positive().max(43200).optional(),
  evalInput: managedQueryEvalScheduleInputSchema.nullable().optional()
});

export const managedQueryEvalSchedulePolicySchema = z.object({
  tenantId: z.string().min(1),
  enabled: z.boolean(),
  intervalMinutes: z.number().int().positive().max(43200),
  evalInput: managedQueryEvalScheduleInputSchema.nullable(),
  lastRunAt: z.string().nullable(),
  lastEvalRunId: z.string().min(1).nullable(),
  lastStatus: managedQueryEvalScheduleStatusSchema,
  lastError: z.string().nullable(),
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable()
});

export const agentActionExecutionPolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  enabled: z.boolean().optional(),
  allowedActionTypes: z.array(agentActionTypeSchema).max(50).optional(),
  requireApproval: z.boolean().optional(),
  dryRunDefault: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  maxRequestsPerHour: z.coerce.number().int().positive().max(10000).optional(),
  approvalExpiresInMinutes: z.coerce.number().int().positive().max(10080).optional()
});

export const agentActionExecutionPolicySchema = z.object({
  tenantId: z.string().min(1),
  enabled: z.boolean(),
  allowedActionTypes: z.array(agentActionTypeSchema),
  requireApproval: z.boolean(),
  dryRunDefault: z.boolean(),
  killSwitch: z.boolean(),
  maxRequestsPerHour: z.number().int().positive().max(10000),
  approvalExpiresInMinutes: z.number().int().positive().max(10080),
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
});

export const agentActionExecuteInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  actionType: agentActionTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  dryRun: z.boolean().optional(),
  payload: jsonObjectSchema.default({}),
  metadata: jsonObjectSchema.default({})
});

export const agentActionDecisionInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  actionRequestId: z.string().min(1),
  decision: z.enum(["approve", "deny"]),
  reason: z.string().min(1).optional(),
  metadata: jsonObjectSchema.default({})
});

export const agentActionRequestSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  actionType: agentActionTypeSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  target: z.string().nullable(),
  idempotencyKey: z.string().min(1).max(200).nullable(),
  status: agentActionStatusSchema,
  dryRun: z.boolean(),
  payload: jsonObjectSchema,
  result: jsonObjectSchema,
  reason: z.string().nullable(),
  policySnapshot: jsonObjectSchema,
  metadata: jsonObjectSchema,
  requestedByUserId: z.string().min(1).nullable(),
  requestedByServiceAccountId: z.string().min(1).nullable(),
  requestedByApiKeyId: z.string().min(1).nullable(),
  decidedByUserId: z.string().min(1).nullable(),
  decidedByServiceAccountId: z.string().min(1).nullable(),
  decidedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  decidedAt: z.string().min(1).nullable(),
  approvalExpiresAt: z.string().min(1).nullable(),
  executedAt: z.string().min(1).nullable()
});

export const agentActionRequestListResponseSchema = z.object({
  actions: z.array(agentActionRequestSchema)
});

export const modelProviderConfigInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  provider: modelProviderSchema,
  enabled: z.boolean().default(false),
  displayName: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKeyEnvVar: secretEnvVarNameSchema.optional(),
  defaultModel: z.string().min(1).optional(),
  availableModels: z.array(z.string().min(1)).default([]),
  priority: z.number().int().min(1).max(1000).default(100),
  metadata: jsonObjectSchema.default({})
});

export const modelProviderConfigSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  provider: modelProviderSchema,
  enabled: z.boolean(),
  displayName: z.string().nullable(),
  baseUrl: z.string().nullable(),
  apiKeyEnvVar: z.string().nullable(),
  defaultModel: z.string().nullable(),
  availableModels: z.array(z.string().min(1)),
  priority: z.number().int().min(1).max(1000),
  metadata: jsonObjectSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const modelProviderConfigListResponseSchema = z.object({
  providers: z.array(modelProviderConfigSchema)
});

export const modelProviderReadinessStatusSchema = z.enum(["ready", "disabled", "not-configured", "not-ready"]);

export const modelProviderHealthSchema = z.object({
  tenantId: z.string().min(1),
  provider: modelProviderSchema,
  enabled: z.boolean(),
  defaultModel: z.string().min(1).nullable(),
  apiKeyEnvVar: z.string().min(1).nullable(),
  apiKeyConfigured: z.boolean(),
  priority: z.number().int().min(1).max(1000).nullable(),
  status: modelProviderReadinessStatusSchema,
  reasons: z.array(z.string().min(1)),
  checkedAt: z.string().min(1)
});

export const modelProviderHealthListResponseSchema = z.object({
  providers: z.array(modelProviderHealthSchema)
});

export const authProviderConfigInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  provider: externalAuthProviderSchema,
  enabled: z.boolean().default(false),
  displayName: z.string().min(1).optional(),
  issuerUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecretEnvVar: secretEnvVarNameSchema.optional(),
  redirectUri: z.string().url().optional(),
  scopes: z.array(z.string().min(1)).default(["openid", "profile", "email"]),
  emailClaim: z.string().min(1).default("email"),
  displayNameClaim: z.string().min(1).default("name"),
  groupClaim: z.string().min(1).optional(),
  roleClaim: z.string().min(1).optional(),
  defaultRole: userRoleSchema.default("reader"),
  autoProvisionUsers: z.boolean().default(false),
  accountLinkingMode: accountLinkingModeSchema.default("verified-email"),
  groupSyncEnabled: z.boolean().default(false),
  allowedDomains: z.array(z.string().min(1)).default([]),
  pkceRequired: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
  metadata: jsonObjectSchema.default({})
});

export const authProviderConfigSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  provider: externalAuthProviderSchema,
  enabled: z.boolean(),
  displayName: z.string().nullable(),
  issuerUrl: z.string().min(1),
  clientId: z.string().min(1),
  clientSecretEnvVar: z.string().nullable(),
  redirectUri: z.string().nullable(),
  scopes: z.array(z.string().min(1)),
  emailClaim: z.string().min(1),
  displayNameClaim: z.string().min(1),
  groupClaim: z.string().nullable(),
  roleClaim: z.string().nullable(),
  defaultRole: userRoleSchema,
  autoProvisionUsers: z.boolean(),
  accountLinkingMode: accountLinkingModeSchema,
  groupSyncEnabled: z.boolean(),
  allowedDomains: z.array(z.string().min(1)),
  pkceRequired: z.boolean(),
  priority: z.number().int().min(1).max(1000),
  metadata: jsonObjectSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const authProviderConfigListResponseSchema = z.object({
  authProviders: z.array(authProviderConfigSchema)
});

export const secretReferencePolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  allowedEnvVarPrefixes: z.array(secretEnvVarPrefixSchema).max(100).optional(),
  allowedEnvVars: z.array(secretEnvVarNameSchema).max(200).optional(),
  allowUnlistedEnvVars: z.boolean().optional()
});

export const secretReferencePolicySchema = z.object({
  tenantId: z.string().min(1),
  allowedEnvVarPrefixes: z.array(secretEnvVarPrefixSchema),
  allowedEnvVars: z.array(secretEnvVarNameSchema),
  allowUnlistedEnvVars: z.boolean(),
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
});

export const piiRedactionPolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  redactionEnabled: z.boolean().optional(),
  enabledRuleKinds: z.array(piiRedactionRuleKindSchema).max(100).optional()
});

export const piiRedactionPolicySchema = z.object({
  tenantId: z.string().min(1),
  redactionEnabled: z.boolean(),
  enabledRuleKinds: z.array(piiRedactionRuleKindSchema),
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
});

export const exportPackageInstructionSchema = z.object({
  id: z.string().min(1),
  instructionKind: z.string().min(1),
  targetAgents: z.array(z.string().min(1)),
  body: z.string().min(1),
  constraints: z.array(z.string().min(1)),
  failureModes: z.array(z.string().min(1)),
  escalation: z.string().nullable()
});

export const exportPackageHumanDocumentSchema = z.object({
  id: z.string().min(1),
  format: z.enum(["markdown", "html", "plain-text"]),
  body: z.string().min(1)
});

export const exportPackageSourceVersionSchema = z.object({
  id: z.string().min(1),
  versionNumber: z.number().int().positive(),
  contentHash: z.string().min(1),
  createdAt: z.string().min(1),
  changeNote: z.string().nullable()
});

export const exportPackageAssetSchema = z.object({
  stableId: z.string().min(1),
  assetId: z.string().min(1),
  type: assetTypeSchema,
  title: z.string().min(1),
  summary: z.string().nullable(),
  audience: z.array(z.string().min(1)),
  status: z.string().min(1),
  sensitivity: sensitivitySchema,
  lifecycleState: lifecycleStateSchema,
  sourceRef: z.string().nullable(),
  currentVersionId: z.string().nullable(),
  sourceVersion: exportPackageSourceVersionSchema.nullable(),
  allowedSurfaces: z.array(surfaceSchema),
  allowedExports: z.array(z.string().min(1)),
  instructions: z.array(exportPackageInstructionSchema),
  humanDocuments: z.array(exportPackageHumanDocumentSchema),
  citations: z.array(citationSchema)
});

export const aiExportPackageSchema = z.object({
  packageName: z.string().min(1),
  generatedAt: z.string().min(1),
  tenantId: z.string().min(1),
  assetCount: z.number().int().nonnegative(),
  deniedCount: z.number().int().nonnegative(),
  assets: z.array(exportPackageAssetSchema)
});

export const okfExportFileSchema = z.object({
  path: z.string().min(1),
  contentHash: z.string().min(1),
  content: z.string().min(1)
});

export const okfExportPackageSchema = z.object({
  format: z.literal("okf"),
  packageName: z.string().min(1),
  generatedAt: z.string().min(1),
  tenantId: z.string().min(1),
  okfVersion: okfVersionSchema,
  spec: z.object({
    name: z.literal("Open Knowledge Format"),
    version: okfVersionSchema,
    status: z.literal("draft"),
    sourceUrl: z.string().url(),
    checkedAt: z.string().min(1)
  }),
  assetCount: z.number().int().nonnegative(),
  deniedCount: z.number().int().nonnegative(),
  sourcePackageHash: z.string().min(1),
  projectionHash: z.string().min(1),
  rootIndexPath: z.literal("index.md"),
  files: z.array(okfExportFileSchema).min(1)
});

export function buildOkfExportPackage(
  input: z.infer<typeof aiExportPackageSchema>,
  options: { okfVersion?: z.infer<typeof okfVersionSchema> } = {}
): z.infer<typeof okfExportPackageSchema> {
  const sourcePackage = aiExportPackageSchema.parse(input);
  const okfVersion = okfVersionSchema.parse(options.okfVersion ?? okfCurrentVersion);
  const conceptEntries = sourcePackage.assets
    .slice()
    .sort((left, right) => left.stableId.localeCompare(right.stableId))
    .map((asset) => ({
      asset,
      path: conceptPathForAsset(asset)
    }));
  const files = [
    buildOkfFile("index.md", buildOkfIndex(sourcePackage, okfVersion, conceptEntries)),
    buildOkfFile("manifest.md", buildOkfManifest(sourcePackage, okfVersion, conceptEntries)),
    buildOkfFile("log.md", buildOkfLog(sourcePackage)),
    ...conceptEntries.map(({ asset, path }) => buildOkfFile(path, buildOkfConcept(asset, sourcePackage, okfVersion)))
  ].sort((left, right) => left.path.localeCompare(right.path));

  return okfExportPackageSchema.parse({
    format: "okf",
    packageName: sourcePackage.packageName,
    generatedAt: sourcePackage.generatedAt,
    tenantId: sourcePackage.tenantId,
    okfVersion,
    spec: {
      name: "Open Knowledge Format",
      version: okfVersion,
      status: okfSpecStatus,
      sourceUrl: okfSpecSourceUrl,
      checkedAt: okfSpecCheckedAt
    },
    assetCount: sourcePackage.assetCount,
    deniedCount: sourcePackage.deniedCount,
    sourcePackageHash: hashText(stableJson(sourcePackage)),
    projectionHash: hashFiles(files),
    rootIndexPath: "index.md",
    files
  });
}

function buildOkfIndex(
  sourcePackage: z.infer<typeof aiExportPackageSchema>,
  okfVersion: z.infer<typeof okfVersionSchema>,
  conceptEntries: Array<{ asset: z.infer<typeof exportPackageAssetSchema>; path: string }>
): string {
  const lines = [
    frontmatter({ okf_version: okfVersion }),
    `# Agentic CMS OKF Export: ${sourcePackage.packageName}`,
    "",
    `Generated: ${sourcePackage.generatedAt}`,
    `Tenant: ${sourcePackage.tenantId}`,
    `Assets: ${sourcePackage.assetCount}`,
    `Denied assets: ${sourcePackage.deniedCount}`,
    "",
    "# Concepts"
  ];

  for (const { asset, path } of conceptEntries) {
    lines.push(`* [${escapeMarkdownText(asset.title)}](${path}) - ${asset.summary ?? asset.stableId}`);
  }

  lines.push("", "# Bundle Files", "* [Manifest](manifest.md) - generation metadata and upgrade notes", "* [Update log](log.md) - export generation history");

  return `${lines.join("\n")}\n`;
}

function buildOkfManifest(
  sourcePackage: z.infer<typeof aiExportPackageSchema>,
  okfVersion: z.infer<typeof okfVersionSchema>,
  conceptEntries: Array<{ asset: z.infer<typeof exportPackageAssetSchema>; path: string }>
): string {
  const lines = [
    frontmatter({
      type: "Export Manifest",
      title: `${sourcePackage.packageName} OKF Manifest`,
      description: "Generation metadata for an Agentic CMS Open Knowledge Format export.",
      tags: ["agentic-cms", "okf", "manifest"],
      timestamp: sourcePackage.generatedAt,
      okf_version: okfVersion
    }),
    `# ${sourcePackage.packageName} OKF Manifest`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| OKF version | ${okfVersion} |`,
    `| Spec status | ${okfSpecStatus} |`,
    `| Spec source | ${okfSpecSourceUrl} |`,
    `| Spec checked | ${okfSpecCheckedAt} |`,
    `| Generated | ${sourcePackage.generatedAt} |`,
    `| Tenant | ${sourcePackage.tenantId} |`,
    `| Assets included | ${sourcePackage.assetCount} |`,
    `| Assets denied by policy | ${sourcePackage.deniedCount} |`,
    "",
    "# Update Process",
    "",
    "1. Treat Agentic CMS asset versions as canonical.",
    "2. Check the official OKF spec before adding support for a newer version.",
    "3. Preserve existing generated bundles with their declared `okf_version`, source content hashes, and projection hash.",
    "4. Generate a new bundle from the same source asset versions when upgrading the OKF projection.",
    "5. Review the manifest and file diffs before replacing a previously distributed bundle.",
    "",
    "# Concept Files"
  ];

  for (const { asset, path } of conceptEntries) {
    lines.push(`* [${escapeMarkdownText(asset.stableId)}](${path}) - source version ${asset.sourceVersion?.versionNumber ?? "unknown"}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildOkfLog(sourcePackage: z.infer<typeof aiExportPackageSchema>): string {
  const date = sourcePackage.generatedAt.slice(0, 10);

  return [
    "# Directory Update Log",
    "",
    `## ${date}`,
    `* **Generation**: Generated OKF export for package \`${sourcePackage.packageName}\` with ${sourcePackage.assetCount} included asset(s) and ${sourcePackage.deniedCount} denied asset(s).`,
    ""
  ].join("\n");
}

function buildOkfConcept(
  asset: z.infer<typeof exportPackageAssetSchema>,
  sourcePackage: z.infer<typeof aiExportPackageSchema>,
  okfVersion: z.infer<typeof okfVersionSchema>
): string {
  const timestamp = asset.sourceVersion?.createdAt ?? sourcePackage.generatedAt;
  const frontmatterText = frontmatter({
    type: okfTypeForAssetType(asset.type),
    title: asset.title,
    description: asset.summary ?? asset.title,
    resource: `agentic-cms://assets/${asset.stableId}`,
    tags: [
      "agentic-cms",
      asset.type,
      `sensitivity-${asset.sensitivity}`,
      `status-${asset.status}`,
      `lifecycle-${asset.lifecycleState}`,
      ...asset.audience.map((audience) => `audience-${slugify(audience)}`)
    ],
    timestamp,
    okf_version: okfVersion,
    stable_id: asset.stableId,
    asset_id: asset.assetId,
    source_version_id: asset.sourceVersion?.id ?? asset.currentVersionId ?? "",
    source_version_number: asset.sourceVersion?.versionNumber ?? "",
    source_content_hash: asset.sourceVersion?.contentHash ?? "",
    allowed_surfaces: asset.allowedSurfaces,
    allowed_exports: asset.allowedExports
  });
  const lines = [
    frontmatterText,
    `# ${asset.title}`,
    "",
    asset.summary ?? asset.title,
    "",
    "# Governance",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Stable ID | \`${asset.stableId}\` |`,
    `| Asset type | ${asset.type} |`,
    `| Lifecycle | ${asset.lifecycleState} |`,
    `| Status | ${asset.status} |`,
    `| Sensitivity | ${asset.sensitivity} |`,
    `| Audience | ${asset.audience.join(", ")} |`,
    `| Source version | ${asset.sourceVersion?.versionNumber ?? "unknown"} |`,
    `| Source content hash | \`${asset.sourceVersion?.contentHash ?? "unknown"}\` |`
  ];

  if (asset.instructions.length > 0) {
    lines.push("", "# Instructions");

    for (const instruction of asset.instructions) {
      lines.push("", `## ${instruction.instructionKind}`, "", instruction.body);

      if (instruction.constraints.length > 0) {
        lines.push("", "### Constraints", ...instruction.constraints.map((constraint) => `* ${constraint}`));
      }

      if (instruction.failureModes.length > 0) {
        lines.push("", "### Failure Modes", ...instruction.failureModes.map((failureMode) => `* ${failureMode}`));
      }

      if (instruction.escalation) {
        lines.push("", "### Escalation", instruction.escalation);
      }
    }
  }

  if (asset.humanDocuments.length > 0) {
    lines.push("", "# Human Documents");

    for (const document of asset.humanDocuments) {
      lines.push("", `## ${document.format}`, "", document.body);
    }
  }

  lines.push("", "# Citations");

  if (asset.citations.length === 0) {
    lines.push("", "[1] Agentic CMS governed asset export metadata.");
  } else {
    asset.citations.forEach((citation, index) => {
      lines.push(
        `[${index + 1}] ${citation.title} (${citation.stableId}, chunk ${citation.chunkId})`
      );
    });
  }

  return `${lines.join("\n")}\n`;
}

function buildOkfFile(path: string, content: string): z.infer<typeof okfExportFileSchema> {
  return {
    path,
    contentHash: hashText(content),
    content
  };
}

function conceptPathForAsset(asset: z.infer<typeof exportPackageAssetSchema>): string {
  const directory = okfDirectoryForAssetType(asset.type);
  const suffix = hashText(asset.stableId).slice(7, 15);

  return `${directory}/${slugify(asset.stableId)}-${suffix}.md`;
}

function okfDirectoryForAssetType(assetType: z.infer<typeof assetTypeSchema>): string {
  const directories: Record<z.infer<typeof assetTypeSchema>, string> = {
    "agent-instruction": "instructions",
    "eval-case": "evals",
    guideline: "guidelines",
    guardrail: "guardrails",
    "human-document": "references",
    playbook: "playbooks",
    policy: "policies",
    reference: "references",
    skill: "skills",
    sop: "sops",
    "telemetry-policy": "telemetry-policies",
    template: "templates",
    "tool-instruction": "tool-guidance"
  };

  return directories[assetType];
}

function okfTypeForAssetType(assetType: z.infer<typeof assetTypeSchema>): string {
  const types: Record<z.infer<typeof assetTypeSchema>, string> = {
    "agent-instruction": "Instruction",
    "eval-case": "Evaluation Case",
    guideline: "Guideline",
    guardrail: "Guardrail",
    "human-document": "Reference",
    playbook: "Playbook",
    policy: "Policy",
    reference: "Reference",
    skill: "Skill",
    sop: "SOP",
    "telemetry-policy": "Telemetry Policy",
    template: "Template",
    "tool-instruction": "Tool Guidance"
  };

  return types[assetType];
}

function frontmatter(values: Record<string, unknown>): string {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${yamlValue(value)}`);

  return `---\n${lines.join("\n")}\n---\n`;
}

function yamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => yamlScalar(item)).join(", ")}]`;
  }

  return yamlScalar(value);
}

function yamlScalar(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return JSON.stringify(String(value));
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "concept";
}

function escapeMarkdownText(value: string): string {
  return value.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashFiles(files: Array<z.infer<typeof okfExportFileSchema>>): string {
  return hashText(files.map((file) => `${file.path}\n${file.contentHash}\n`).join(""));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableJson(nestedValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export const retrievalEventCreateInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  actorUserId: z.string().min(1).optional(),
  actorServiceAccountId: z.string().min(1).optional(),
  actorApiKeyId: z.string().min(1).optional(),
  surface: surfaceSchema,
  query: z.string().min(1),
  resultCount: z.number().int().nonnegative(),
  deniedCount: z.number().int().nonnegative().default(0),
  latencyMs: z.number().int().nonnegative(),
  metadata: jsonObjectSchema.default({})
});

export const retrievalEventSchema = retrievalEventCreateInputSchema.extend({
  id: z.string().min(1),
  actorUserId: z.string().nullable(),
  actorServiceAccountId: z.string().nullable(),
  actorApiKeyId: z.string().nullable(),
  createdAt: z.string().min(1)
});

const telemetryDateTimeSchema = z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected a parseable date/time"
});

export const telemetryAnalyticsInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  since: telemetryDateTimeSchema.optional(),
  until: telemetryDateTimeSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(200)
}).refine((input) => !input.since || !input.until || Date.parse(input.since) <= Date.parse(input.until), {
  path: ["until"],
  message: "until must be after since"
});

export const telemetryCountSchema = z.object({
  key: z.string().min(1),
  count: z.number().int().nonnegative()
});

export const telemetryScoreAveragesSchema = z.object({
  factualCitationAccuracy: z.number().nullable(),
  policyCompliance: z.number().nullable(),
  taskCompletionQuality: z.number().nullable(),
  consistency: z.number().nullable(),
  responseEffectiveness: z.number().nullable()
});

export const telemetryAnalyticsSummarySchema = z.object({
  tenantId: z.string().min(1),
  generatedAt: z.string().min(1),
  window: z.object({
    since: z.string().nullable(),
    until: z.string().nullable(),
    sampleLimit: z.number().int().positive().max(200)
  }),
  retrieval: z.object({
    eventCount: z.number().int().nonnegative(),
    resultCount: z.number().int().nonnegative(),
    deniedCount: z.number().int().nonnegative(),
    averageLatencyMs: z.number().nullable(),
    redactedQueryCount: z.number().int().nonnegative(),
    bySurface: z.array(telemetryCountSchema),
    byQueryKind: z.array(telemetryCountSchema)
  }),
  audit: z.object({
    eventCount: z.number().int().nonnegative(),
    successCount: z.number().int().nonnegative(),
    deniedCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    byAction: z.array(telemetryCountSchema),
    byOutcome: z.array(telemetryCountSchema)
  }),
  feedback: z.object({
    recordCount: z.number().int().nonnegative(),
    byOutcome: z.array(telemetryCountSchema),
    averageScores: telemetryScoreAveragesSchema
  }),
  providerGeneration: z.object({
    eventCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    cacheHitCount: z.number().int().nonnegative(),
    totalInputTokens: z.number().int().nonnegative(),
    totalOutputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
    averageLatencyMs: z.number().nullable(),
    byProvider: z.array(telemetryCountSchema),
    byModel: z.array(telemetryCountSchema),
    byStatus: z.array(telemetryCountSchema),
    byCacheStatus: z.array(telemetryCountSchema),
    byReason: z.array(telemetryCountSchema)
  }),
  assets: z.object({
    sampleCount: z.number().int().nonnegative(),
    byType: z.array(telemetryCountSchema),
    byLifecycleState: z.array(telemetryCountSchema),
    byStatus: z.array(telemetryCountSchema),
    bySensitivity: z.array(telemetryCountSchema)
  })
});

export const managedQueryEvalAnalyticsInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  since: telemetryDateTimeSchema.optional(),
  until: telemetryDateTimeSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(50)
}).refine((input) => !input.since || !input.until || Date.parse(input.since) <= Date.parse(input.until), {
  path: ["until"],
  message: "until must be after since"
});

export const managedQueryEvalAnalyticsRecentRunSchema = z.object({
  id: z.string().min(1),
  checkedAt: z.string().min(1),
  createdAt: z.string().min(1),
  ok: z.boolean(),
  thresholdPassed: z.boolean(),
  passRate: z.number().min(0).max(1),
  caseCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative()
});

export const managedQueryEvalTagAnalyticsSchema = z.object({
  tag: z.string().min(1),
  runCount: z.number().int().nonnegative(),
  caseCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  passRate: z.number().min(0).max(1),
  thresholdCount: z.number().int().nonnegative(),
  thresholdPassedCount: z.number().int().nonnegative(),
  thresholdFailedCount: z.number().int().nonnegative(),
  thresholdPassRate: z.number().min(0).max(1)
});

export const managedQueryEvalAnalyticsSummarySchema = z.object({
  tenantId: z.string().min(1),
  generatedAt: z.string().min(1),
  window: z.object({
    since: z.string().nullable(),
    until: z.string().nullable(),
    sampleLimit: z.number().int().positive().max(200)
  }),
  runCount: z.number().int().nonnegative(),
  latestRunId: z.string().min(1).nullable(),
  latestPassRate: z.number().min(0).max(1).nullable(),
  latestThresholdPassed: z.boolean().nullable(),
  averagePassRate: z.number().min(0).max(1).nullable(),
  passedRunCount: z.number().int().nonnegative(),
  failedRunCount: z.number().int().nonnegative(),
  thresholdPassedCount: z.number().int().nonnegative(),
  thresholdFailedCount: z.number().int().nonnegative(),
  totalCaseCount: z.number().int().nonnegative(),
  totalPassedCount: z.number().int().nonnegative(),
  totalFailedCount: z.number().int().nonnegative(),
  casePassRate: z.number().min(0).max(1),
  byMode: z.array(telemetryCountSchema),
  byTag: z.array(managedQueryEvalTagAnalyticsSchema),
  recentRuns: z.array(managedQueryEvalAnalyticsRecentRunSchema)
});

const retentionDaysSchema = z.number().int().positive().max(3650).nullable();
const retentionDaysInputSchema = z.union([
  z.coerce.number().int().positive().max(3650),
  z.null()
]);

export const telemetryRetentionPolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  retrievalEventRetentionDays: retentionDaysInputSchema.optional(),
  auditEventRetentionDays: retentionDaysInputSchema.optional(),
  feedbackRetentionDays: retentionDaysInputSchema.optional()
});

export const telemetryRetentionPolicySchema = z.object({
  tenantId: z.string().min(1),
  retrievalEventRetentionDays: retentionDaysSchema,
  auditEventRetentionDays: retentionDaysSchema,
  feedbackRetentionDays: retentionDaysSchema,
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().nullable(),
  updatedByServiceAccountId: z.string().nullable(),
  updatedByApiKeyId: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable()
});

export const telemetryRetentionPurgeInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  dryRun: z.boolean().default(true)
});

const telemetryRetentionPurgeBreakdownSchema = z.object({
  cutoff: z.string().nullable(),
  deletedCount: z.number().int().nonnegative()
});

export const telemetryRetentionPurgeResultSchema = z.object({
  tenantId: z.string().min(1),
  dryRun: z.boolean(),
  purgedAt: z.string().min(1),
  policy: telemetryRetentionPolicySchema,
  retrievalEvents: telemetryRetentionPurgeBreakdownSchema,
  auditEvents: telemetryRetentionPurgeBreakdownSchema,
  managedQueryFeedback: telemetryRetentionPurgeBreakdownSchema
});

export const managedQueryRetentionCaptureModeSchema = z.enum(["disabled", "metadata-only"]);

export const managedQueryRetentionPolicyInputSchema = z.object({
  tenantId: z.string().min(1).default("tenant_demo"),
  promptCaptureMode: managedQueryRetentionCaptureModeSchema.optional(),
  responseCaptureMode: managedQueryRetentionCaptureModeSchema.optional(),
  metadataRetentionDays: retentionDaysInputSchema.optional()
});

export const managedQueryRetentionPolicySchema = z.object({
  tenantId: z.string().min(1),
  promptCaptureMode: managedQueryRetentionCaptureModeSchema,
  responseCaptureMode: managedQueryRetentionCaptureModeSchema,
  metadataRetentionDays: retentionDaysSchema,
  source: z.enum(["default", "stored"]),
  updatedByUserId: z.string().min(1).nullable(),
  updatedByServiceAccountId: z.string().min(1).nullable(),
  updatedByApiKeyId: z.string().min(1).nullable(),
  createdAt: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable()
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string().min(1),
  version: z.literal(agenticCmsVersion)
});

export function createHealthResponse(service: string): HealthResponse {
  return {
    status: "ok",
    service,
    version: agenticCmsVersion
  };
}

export type Asset = z.infer<typeof assetSchema>;
export type AssetCreateInput = z.input<typeof assetCreateInputSchema>;
export type AssetDetail = z.infer<typeof assetDetailSchema>;
export type AssetPublishInput = z.input<typeof assetPublishInputSchema>;
export type AssetReviewInput = z.input<typeof assetReviewInputSchema>;
export type AssetReviewQueueInput = z.input<typeof assetReviewQueueInputSchema>;
export type AssetReviewQueueResponse = z.infer<typeof assetReviewQueueResponseSchema>;
export type AssetRestoreInput = z.input<typeof assetRestoreInputSchema>;
export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type AssetUpdateInput = z.input<typeof assetUpdateInputSchema>;
export type AssetVersion = z.infer<typeof assetVersionSchema>;
export type AssetVersionSnapshot = z.infer<typeof assetVersionSnapshotSchema>;
export type AssetVersionSnapshotInput = z.input<typeof assetVersionSnapshotInputSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;
export type AssetValidationInput = z.input<typeof assetValidationInputSchema>;
export type AssetValidationReport = z.infer<typeof assetValidationReportSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationSeverity = z.infer<typeof validationSeveritySchema>;
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;
export type ApiKeyCreateInput = z.input<typeof apiKeyCreateInputSchema>;
export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>;
export type ApiKeyRecord = z.infer<typeof apiKeyRecordSchema>;
export type ApiKeyRotationReport = z.infer<typeof apiKeyRotationReportSchema>;
export type ApiKeyRotationReportInput = z.input<typeof apiKeyRotationReportInputSchema>;
export type ApiKeyRotationReminder = z.infer<typeof apiKeyRotationReminderSchema>;
export type ApiKeyRotationState = z.infer<typeof apiKeyRotationStateSchema>;
export type ApiKeyRotateInput = z.input<typeof apiKeyRotateInputSchema>;
export type ApiKeyRotateResponse = z.infer<typeof apiKeyRotateResponseSchema>;
export type ApiKeyRevokeResponse = z.infer<typeof apiKeyRevokeResponseSchema>;
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventCreateInput = z.input<typeof auditEventCreateInputSchema>;
export type AccountLinkingMode = z.infer<typeof accountLinkingModeSchema>;
export type AuthBootstrapInput = z.input<typeof authBootstrapInputSchema>;
export type AuthLoginInput = z.input<typeof authLoginInputSchema>;
export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;
export type AuthOidcAuthorizeInput = z.input<typeof authOidcAuthorizeInputSchema>;
export type AuthOidcAuthorizeResponse = z.infer<typeof authOidcAuthorizeResponseSchema>;
export type AuthOidcCallbackInput = z.input<typeof authOidcCallbackInputSchema>;
export type AuthOidcLoginResponse = z.infer<typeof authOidcLoginResponseSchema>;
export type AuthPrincipal = z.infer<typeof authPrincipalSchema>;
export type AuthPrincipalType = z.infer<typeof authPrincipalTypeSchema>;
export type AuthProviderConfig = z.infer<typeof authProviderConfigSchema>;
export type AuthProviderConfigInput = z.input<typeof authProviderConfigInputSchema>;
export type AuthProviderConfigListResponse = z.infer<typeof authProviderConfigListResponseSchema>;
export type LoginSessionListResponse = z.infer<typeof loginSessionListResponseSchema>;
export type LoginSessionRecord = z.infer<typeof loginSessionRecordSchema>;
export type LoginSessionRefreshResponse = z.infer<typeof loginSessionRefreshResponseSchema>;
export type LoginSessionRevokeResponse = z.infer<typeof loginSessionRevokeResponseSchema>;
export type LoginSessionSource = z.infer<typeof loginSessionSourceSchema>;
export type PiiRedactionRuleKind = z.infer<typeof piiRedactionRuleKindSchema>;
export type PiiRedactionPolicy = z.infer<typeof piiRedactionPolicySchema>;
export type PiiRedactionPolicyInput = z.input<typeof piiRedactionPolicyInputSchema>;
export type SecretReferencePolicy = z.infer<typeof secretReferencePolicySchema>;
export type SecretReferencePolicyInput = z.input<typeof secretReferencePolicyInputSchema>;
export type ChunkSourceKind = z.infer<typeof chunkSourceKindSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type GroupCreateInput = z.input<typeof groupCreateInputSchema>;
export type GroupMembership = z.infer<typeof groupMembershipSchema>;
export type GroupMembershipInput = z.input<typeof groupMembershipInputSchema>;
export type GroupMembershipSource = z.infer<typeof groupMembershipSourceSchema>;
export type GroupMembershipListResponse = z.infer<typeof groupMembershipListResponseSchema>;
export type GroupListResponse = z.infer<typeof groupListResponseSchema>;
export type GroupRecord = z.infer<typeof groupRecordSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type AgentInstruction = z.infer<typeof agentInstructionSchema>;
export type AgentInstructionInput = z.infer<typeof agentInstructionInputSchema>;
export type HumanDocument = z.infer<typeof humanDocumentSchema>;
export type HumanDocumentInput = z.infer<typeof humanDocumentInputSchema>;
export type LifecycleState = z.infer<typeof lifecycleStateSchema>;
export type LocalUser = z.infer<typeof localUserSchema>;
export type LocalUserCreateInput = z.input<typeof localUserCreateInputSchema>;
export type LocalUserListResponse = z.infer<typeof localUserListResponseSchema>;
export type LocalUserUpdateInput = z.input<typeof localUserUpdateInputSchema>;
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;
export type ServiceAccountCreateInput = z.input<typeof serviceAccountCreateInputSchema>;
export type ServiceAccountListResponse = z.infer<typeof serviceAccountListResponseSchema>;
export type ServiceAccountPolicy = z.infer<typeof serviceAccountPolicySchema>;
export type ServiceAccountPolicyInput = z.input<typeof serviceAccountPolicyInputSchema>;
export type ServiceAccountUpdateInput = z.input<typeof serviceAccountUpdateInputSchema>;
export type ManagedQueryFeedback = z.infer<typeof managedQueryFeedbackSchema>;
export type ManagedQueryFeedbackCreateInput = z.input<typeof managedQueryFeedbackCreateInputSchema>;
export type ManagedQueryFeedbackInput = z.input<typeof managedQueryFeedbackInputSchema>;
export type ManagedQueryFeedbackListResponse = z.infer<typeof managedQueryFeedbackListResponseSchema>;
export type ManagedQueryFeedbackOutcome = z.infer<typeof managedQueryFeedbackOutcomeSchema>;
export type ManagedQueryEvalCase = z.infer<typeof managedQueryEvalCaseSchema>;
export type ManagedQueryEvalInput = z.input<typeof managedQueryEvalInputSchema>;
export type ManagedQueryEvalReport = z.infer<typeof managedQueryEvalReportSchema>;
export type ManagedQueryEvalRun = z.infer<typeof managedQueryEvalRunSchema>;
export type ManagedQueryEvalAnalyticsInput = z.input<typeof managedQueryEvalAnalyticsInputSchema>;
export type ManagedQueryEvalAnalyticsSummary = z.infer<typeof managedQueryEvalAnalyticsSummarySchema>;
export type ManagedQueryEvalRunCreateInput = z.input<typeof managedQueryEvalRunCreateInputSchema>;
export type ManagedQueryEvalRunListResponse = z.infer<typeof managedQueryEvalRunListResponseSchema>;
export type ManagedQueryEvalScheduleInput = z.infer<typeof managedQueryEvalScheduleInputSchema>;
export type ManagedQueryEvalSchedulePolicy = z.infer<typeof managedQueryEvalSchedulePolicySchema>;
export type ManagedQueryEvalSchedulePolicyInput = z.input<typeof managedQueryEvalSchedulePolicyInputSchema>;
export type ManagedQueryEvalScheduleStatus = z.infer<typeof managedQueryEvalScheduleStatusSchema>;
export type ManagedQueryCache = z.infer<typeof managedQueryCacheSchema>;
export type ManagedQueryCacheEntry = z.infer<typeof managedQueryCacheEntrySchema>;
export type ManagedQueryCacheListResponse = z.infer<typeof managedQueryCacheListResponseSchema>;
export type ManagedQueryCachePolicy = z.infer<typeof managedQueryCachePolicySchema>;
export type ManagedQueryCachePolicyInput = z.input<typeof managedQueryCachePolicyInputSchema>;
export type ManagedQueryCachePurgeInput = z.input<typeof managedQueryCachePurgeInputSchema>;
export type ManagedQueryCachePurgeResult = z.infer<typeof managedQueryCachePurgeResultSchema>;
export type ManagedQueryCacheStatus = z.infer<typeof managedQueryCacheStatusSchema>;
export type ManagedQueryPolicy = z.infer<typeof managedQueryPolicySchema>;
export type ManagedQueryPolicyInput = z.input<typeof managedQueryPolicyInputSchema>;
export type ManagedQueryRetentionCaptureMode = z.infer<typeof managedQueryRetentionCaptureModeSchema>;
export type ManagedQueryRetentionPolicy = z.infer<typeof managedQueryRetentionPolicySchema>;
export type ManagedQueryRetentionPolicyInput = z.input<typeof managedQueryRetentionPolicyInputSchema>;
export type ManagedQueryGenerationAttempt = z.infer<typeof managedQueryGenerationAttemptSchema>;
export type ManagedQueryGeneration = z.infer<typeof managedQueryGenerationSchema>;
export type ManagedQueryGenerationStatus = z.infer<typeof managedQueryGenerationStatusSchema>;
export type ManagedQueryGenerationUsage = z.infer<typeof managedQueryGenerationUsageSchema>;
export type ManagedQueryInput = z.input<typeof managedQueryInputSchema>;
export type ManagedQueryMode = z.infer<typeof managedQueryModeSchema>;
export type ManagedQueryResponse = z.infer<typeof managedQueryResponseSchema>;
export type ModelProvider = z.infer<typeof modelProviderSchema>;
export type ModelProviderConfig = z.infer<typeof modelProviderConfigSchema>;
export type ModelProviderConfigInput = z.input<typeof modelProviderConfigInputSchema>;
export type ModelProviderConfigListResponse = z.infer<typeof modelProviderConfigListResponseSchema>;
export type ModelProviderHealth = z.infer<typeof modelProviderHealthSchema>;
export type ModelProviderHealthListResponse = z.infer<typeof modelProviderHealthListResponseSchema>;
export type ModelProviderReadinessStatus = z.infer<typeof modelProviderReadinessStatusSchema>;
export type ExternalAuthProvider = z.infer<typeof externalAuthProviderSchema>;
export type PermissionAction = z.infer<typeof permissionActionSchema>;
export type PermissionGrant = z.infer<typeof permissionGrantSchema>;
export type PermissionGrantCreateInput = z.input<typeof permissionGrantCreateInputSchema>;
export type PermissionPrincipalType = z.infer<typeof permissionPrincipalTypeSchema>;
export type RetrievalEvent = z.infer<typeof retrievalEventSchema>;
export type RetrievalEventCreateInput = z.input<typeof retrievalEventCreateInputSchema>;
export type RetrievalRankingPolicy = z.infer<typeof retrievalRankingPolicySchema>;
export type RetrievalRankingPolicyInput = z.input<typeof retrievalRankingPolicyInputSchema>;
export type TelemetryAnalyticsInput = z.input<typeof telemetryAnalyticsInputSchema>;
export type TelemetryAnalyticsSummary = z.infer<typeof telemetryAnalyticsSummarySchema>;
export type TelemetryCount = z.infer<typeof telemetryCountSchema>;
export type TelemetryRetentionPolicy = z.infer<typeof telemetryRetentionPolicySchema>;
export type TelemetryRetentionPolicyInput = z.input<typeof telemetryRetentionPolicyInputSchema>;
export type TelemetryRetentionPurgeInput = z.input<typeof telemetryRetentionPurgeInputSchema>;
export type TelemetryRetentionPurgeResult = z.infer<typeof telemetryRetentionPurgeResultSchema>;
export type TelemetryScoreAverages = z.infer<typeof telemetryScoreAveragesSchema>;
export type SearchInput = z.input<typeof searchInputSchema>;
export type SearchRanking = z.infer<typeof searchRankingSchema>;
export type SearchRankingStrategy = z.infer<typeof searchRankingStrategySchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type AiExportFormat = z.infer<typeof aiExportFormatSchema>;
export type AiExportPackage = z.infer<typeof aiExportPackageSchema>;
export type OkfVersion = z.infer<typeof okfVersionSchema>;
export type OkfExportFile = z.infer<typeof okfExportFileSchema>;
export type OkfExportPackage = z.infer<typeof okfExportPackageSchema>;
export type AgentActionDecisionInput = z.input<typeof agentActionDecisionInputSchema>;
export type AgentActionExecuteInput = z.input<typeof agentActionExecuteInputSchema>;
export type AgentActionExecutionPolicy = z.infer<typeof agentActionExecutionPolicySchema>;
export type AgentActionExecutionPolicyInput = z.input<typeof agentActionExecutionPolicyInputSchema>;
export type AgentActionRequest = z.infer<typeof agentActionRequestSchema>;
export type AgentActionRequestListResponse = z.infer<typeof agentActionRequestListResponseSchema>;
export type AgentActionStatus = z.infer<typeof agentActionStatusSchema>;
export type AgentActionType = z.infer<typeof agentActionTypeSchema>;
export type ExportPackageAsset = z.infer<typeof exportPackageAssetSchema>;
export type Sensitivity = z.infer<typeof sensitivitySchema>;
export type Surface = z.infer<typeof surfaceSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type UserAuthProvider = z.infer<typeof userAuthProviderSchema>;
