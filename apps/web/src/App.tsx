import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  AccountLinkingMode,
  AgentActionExecutionPolicy,
  AgentActionRequest,
  AgentActionType,
  AiExportPackage,
  ApiKeyCreated,
  ApiKeyRecord,
  ApiKeyRotationReport,
  ApiKeyRotateResponse,
  AssetDetail,
  AssetRecord,
  AssetReviewQueueResponse,
  AssetVersionSnapshot,
  AuditEvent,
  AuthLoginResponse,
  AuthOidcAuthorizeResponse,
  AuthOidcLoginResponse,
  AuthPrincipal,
  AuthProviderConfig,
  ExternalAuthProvider,
  GroupMembership,
  GroupRecord,
  LoginSessionRecord,
  LocalUser,
  ManagedQueryCacheEntry,
  ManagedQueryCachePolicy,
  ManagedQueryCachePurgeResult,
  ManagedQueryEvalAnalyticsSummary,
  ManagedQueryEvalReport,
  ManagedQueryEvalRun,
  ManagedQueryEvalSchedulePolicy,
  ManagedQueryFeedback,
  ManagedQueryMode,
  ManagedQueryPolicy,
  ManagedQueryRetentionPolicy,
  ManagedQueryResponse,
  ModelProvider,
  ModelProviderConfig,
  ModelProviderHealth,
  PiiRedactionPolicy,
  RetrievalEvent,
  RetrievalRankingPolicy,
  SearchResponse,
  ServiceAccount,
  ServiceAccountPolicy,
  SecretReferencePolicy,
  TelemetryAnalyticsSummary,
  TelemetryRetentionPolicy,
  TelemetryRetentionPurgeResult
} from "@agentic-cms/schema";
import "./styles.css";

const localSplitOriginDefaultApiUrl = "http://127.0.0.1:3000";
const sessionCookieActiveStorageKey = "agentic-cms-session-cookie-active";
const csrfCookieName = "agentic_cms_csrf";
const apiUrlStorageKey = "agentic-cms-api-url";
const demoEvalCases = [
  {
    id: "eval.pii-redaction-citation",
    query: "direct personal identifiers support records model context",
    expectedStableIds: ["guardrail.pii-redaction"],
    requiredCitationCount: 1,
    tags: ["privacy", "citation-accuracy"]
  },
  {
    id: "eval.acceptable-use-policy",
    query: "What should an agent do if the user requests credential exposure or external posting?",
    expectedStableIds: ["policy.ai-acceptable-use"],
    requiredCitationCount: 1,
    tags: ["policy-compliance", "guardrails"]
  },
  {
    id: "eval.agent-task-brief-template",
    query: "agent task brief goal context constraints source of truth acceptance checks",
    expectedStableIds: ["template.agent-task-brief"],
    requiredCitationCount: 1,
    tags: ["task-completion-quality", "agent-operations"]
  }
];
const demoEvalTagMinimumPassRates = {
  "citation-accuracy": 1,
  "policy-compliance": 1,
  "task-completion-quality": 1
};
const actionTypes: AgentActionType[] = [
  "create-task-record",
  "http-openapi",
  "mcp-tool",
  "git-repo",
  "document-connector",
  "local-command"
];

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const navWidthStorageKey = "agentic-cms-web-nav-width";
const densityStorageKey = "agentic-cms-web-density";
type AuthState = "checking" | "authenticated" | "unauthenticated";
type NavBadgeTone = "warn" | "bad" | "ok";
type NavLeafConfig = {
  route: string;
  label: string;
  icon?: string;
  showIcon?: boolean;
  count?: number | string;
  badge?: {
    label: number | string;
    tone?: NavBadgeTone;
  };
};
type NavSectionConfig = {
  label: string;
  folderLabel: string;
  folderIcon: string;
  folderRoute: string;
  activeRoutes: string[];
  count?: number | string;
  leaves: NavLeafConfig[];
};
type AssetContentView = "human" | "instruction" | "version" | "raw";
type ManagedQueryView = "answer" | "evidence" | "diagnostics";
const pageRouteValues = [
  "library",
  "search",
  "asset-read",
  "review",
  "versions",
  "operations",
  "access",
  "providers",
  "policies",
  "telemetry",
  "approvals",
  "exports"
] as const;
const operationsRouteValues = [
  "review",
  "operations",
  "access",
  "providers",
  "policies",
  "telemetry",
  "approvals",
  "exports"
] as const;
const pageRoutes = new Set<string>(pageRouteValues);
const operationsRoutes = new Set<string>(operationsRouteValues);
const defaultOperationsPageCopy = {
  eyebrow: "Admin control plane",
  title: "Operations Dashboard",
  lede: "Route into reviews, access, providers, policies, telemetry, approvals, and exports from a single control surface."
};
const operationsPageCopy: Record<string, { eyebrow: string; title: string; lede: string }> = {
  review: {
    eyebrow: "Governance work",
    title: "Review Queue",
    lede: "Triage assets that need approval, lifecycle review, or release attention."
  },
  operations: defaultOperationsPageCopy,
  access: {
    eyebrow: "Identity and access",
    title: "Access Workspace",
    lede: "Manage local users, service accounts, groups, keys, sessions, and service-account guardrails."
  },
  providers: {
    eyebrow: "Provider operations",
    title: "Provider Workspace",
    lede: "Configure model providers, readiness checks, and external authentication providers."
  },
  policies: {
    eyebrow: "Policy controls",
    title: "Policy Workspace",
    lede: "Tune managed query, ranking, retention, eval, action, secret, and PII controls."
  },
  telemetry: {
    eyebrow: "Observability",
    title: "Telemetry Workspace",
    lede: "Inspect retrieval, audit, feedback, model generation, retention, cache, and eval signals."
  },
  approvals: {
    eyebrow: "Action governance",
    title: "Approvals Workspace",
    lede: "Review dry-run defaults, approval requirements, action requests, and kill-switch posture."
  },
  exports: {
    eyebrow: "Agent export",
    title: "Exports Workspace",
    lede: "Generate and inspect permission-aware AI export packages and denied-result counts."
  }
};

function routePanelClass(currentPage: string, routes: string[], baseClass = "event-list"): string {
  return `${baseClass} ${routes.includes(currentPage) ? "" : "is-hidden"}`;
}

function normalizePageRoute(route: string): string {
  return pageRoutes.has(route) ? route : "library";
}

function readStoredNavWidth(): number {
  if (typeof window === "undefined") {
    return 292;
  }

  const stored = Number.parseInt(localStorage.getItem(navWidthStorageKey) ?? "", 10);
  return Number.isFinite(stored) ? Math.min(420, Math.max(240, stored)) : 292;
}

function resolveDefaultApiUrl(): string {
  const configuredApiUrl = import.meta.env.VITE_AGENTIC_CMS_API_URL?.trim();

  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
    (window.location.port === "5173" || window.location.port === "5175")
  ) {
    return localSplitOriginDefaultApiUrl;
  }

  return "/api";
}

function readInitialApiUrl(): string {
  const defaultApiUrl = resolveDefaultApiUrl();
  const storedApiUrl = localStorage.getItem(apiUrlStorageKey);

  if (!storedApiUrl) {
    return defaultApiUrl;
  }

  if (storedApiUrl === localSplitOriginDefaultApiUrl && defaultApiUrl !== localSplitOriginDefaultApiUrl) {
    return defaultApiUrl;
  }

  return storedApiUrl;
}

function readCookie(name: string): string {
  const prefix = `${name}=`;
  const cookie = document.cookie.split("; ").find((candidate) => candidate.startsWith(prefix));

  if (!cookie) {
    return "";
  }

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return "";
  }
}

export function App() {
  const [apiUrl, setApiUrl] = useState(readInitialApiUrl);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("agentic-cms-api-key") ?? "");
  const [sessionCookieActive, setSessionCookieActive] = useState(
    () => localStorage.getItem(sessionCookieActiveStorageKey) === "true"
  );
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [currentPrincipal, setCurrentPrincipal] = useState<AuthPrincipal | null>(null);
  const [loginTenantId, setLoginTenantId] = useState(() => localStorage.getItem("agentic-cms-login-tenant") ?? "tenant_demo");
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem("agentic-cms-login-email") ?? "");
  const [loginPassword, setLoginPassword] = useState("");
  const [oidcProvider, setOidcProvider] = useState<ExternalAuthProvider>("microsoft-entra");
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [selectedStableId, setSelectedStableId] = useState<string>("");
  const [assetDetail, setAssetDetail] = useState<AssetDetail | null>(null);
  const [assetContentView, setAssetContentView] = useState<AssetContentView>("human");
  const [selectedVersionNumber, setSelectedVersionNumber] = useState("");
  const [versionSnapshot, setVersionSnapshot] = useState<AssetVersionSnapshot | null>(null);
  const [reviewQueue, setReviewQueue] = useState<AssetReviewQueueResponse | null>(null);
  const [publishReviewDueAt, setPublishReviewDueAt] = useState("");
  const [workflowNote, setWorkflowNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("PII redaction");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [managedQueryText, setManagedQueryText] = useState("PII redaction");
  const [managedQueryMode, setManagedQueryMode] =
    useState<"deterministic-retrieval" | "provider-routed">("deterministic-retrieval");
  const [managedQueryProvider, setManagedQueryProvider] = useState<ModelProvider>("openai");
  const [managedQueryModel, setManagedQueryModel] = useState("");
  const [managedQueryCacheEnabled, setManagedQueryCacheEnabled] = useState(true);
  const [managedQueryResponse, setManagedQueryResponse] = useState<ManagedQueryResponse | null>(null);
  const [managedQueryView, setManagedQueryView] = useState<ManagedQueryView>("answer");
  const [exportPackage, setExportPackage] = useState<AiExportPackage | null>(null);
  const [telemetryEvents, setTelemetryEvents] = useState<RetrievalEvent[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetryAnalyticsSummary | null>(null);
  const [telemetryRetentionPolicy, setTelemetryRetentionPolicy] = useState<TelemetryRetentionPolicy | null>(null);
  const [telemetryRetentionPurgeResult, setTelemetryRetentionPurgeResult] =
    useState<TelemetryRetentionPurgeResult | null>(null);
  const [managedQueryCacheEntries, setManagedQueryCacheEntries] = useState<ManagedQueryCacheEntry[]>([]);
	  const [managedQueryPolicy, setManagedQueryPolicy] = useState<ManagedQueryPolicy | null>(null);
	  const [queryPolicyDefaultMode, setQueryPolicyDefaultMode] =
	    useState<ManagedQueryMode>("deterministic-retrieval");
	  const [queryPolicyAllowedModes, setQueryPolicyAllowedModes] =
	    useState("deterministic-retrieval,provider-routed");
	  const [queryPolicyMinimumCitationCount, setQueryPolicyMinimumCitationCount] = useState("1");
	  const [queryPolicyRequireGrounded, setQueryPolicyRequireGrounded] = useState<"true" | "false">("false");
  const [retrievalRankingPolicy, setRetrievalRankingPolicy] = useState<RetrievalRankingPolicy | null>(null);
  const [rankingPolicyAgentInstructionWeight, setRankingPolicyAgentInstructionWeight] = useState("1.2");
  const [rankingPolicyAssetSummaryWeight, setRankingPolicyAssetSummaryWeight] = useState("1.1");
  const [rankingPolicyHumanDocumentWeight, setRankingPolicyHumanDocumentWeight] = useState("1");
  const [rankingPolicyExactPhraseBoost, setRankingPolicyExactPhraseBoost] = useState("0.25");
  const [actionExecutionPolicy, setActionExecutionPolicy] = useState<AgentActionExecutionPolicy | null>(null);
  const [actionPolicyEnabled, setActionPolicyEnabled] = useState<"true" | "false">("false");
  const [actionPolicyAllowedTypes, setActionPolicyAllowedTypes] = useState("create-task-record");
  const [actionPolicyRequireApproval, setActionPolicyRequireApproval] = useState<"true" | "false">("true");
  const [actionPolicyDryRunDefault, setActionPolicyDryRunDefault] = useState<"true" | "false">("true");
  const [actionPolicyKillSwitch, setActionPolicyKillSwitch] = useState<"true" | "false">("false");
  const [actionPolicyMaxRequestsPerHour, setActionPolicyMaxRequestsPerHour] = useState("60");
  const [actionPolicyApprovalExpiresInMinutes, setActionPolicyApprovalExpiresInMinutes] = useState("1440");
  const [agentActions, setAgentActions] = useState<AgentActionRequest[]>([]);
  const [actionDecisionReasons, setActionDecisionReasons] = useState<Record<string, string>>({});
  const [pendingActionDecision, setPendingActionDecision] =
    useState<{ actionId: string; decision: "approve" | "deny" } | null>(null);
  const [actionType, setActionType] = useState<AgentActionType>("create-task-record");
  const [actionTitle, setActionTitle] = useState("Review policy");
  const [actionDescription, setActionDescription] = useState("Create an internal action request for review.");
  const [actionTarget, setActionTarget] = useState("");
  const [actionIdempotencyKey, setActionIdempotencyKey] = useState("");
  const [actionDryRun, setActionDryRun] = useState<"true" | "false">("true");
	  const [managedQueryCachePolicy, setManagedQueryCachePolicy] = useState<ManagedQueryCachePolicy | null>(null);
  const [cachePolicyEnabled, setCachePolicyEnabled] = useState<"true" | "false">("true");
  const [cachePolicyMaxTtl, setCachePolicyMaxTtl] = useState("3600");
  const [managedQueryCachePurgeResult, setManagedQueryCachePurgeResult] =
    useState<ManagedQueryCachePurgeResult | null>(null);
  const [managedQueryRetentionPolicy, setManagedQueryRetentionPolicy] =
    useState<ManagedQueryRetentionPolicy | null>(null);
  const [queryRetentionPromptMode, setQueryRetentionPromptMode] =
    useState<"disabled" | "metadata-only">("disabled");
  const [queryRetentionResponseMode, setQueryRetentionResponseMode] =
    useState<"disabled" | "metadata-only">("disabled");
  const [queryRetentionMetadataDays, setQueryRetentionMetadataDays] = useState("30");
  const [secretReferencePolicy, setSecretReferencePolicy] = useState<SecretReferencePolicy | null>(null);
  const [secretReferencePrefixes, setSecretReferencePrefixes] =
    useState("AGENTIC_CMS_,OPENAI_,ANTHROPIC_,OPENROUTER_,ENTRA_,OIDC_");
  const [secretReferenceEnvVars, setSecretReferenceEnvVars] = useState("");
  const [secretReferenceAllowUnlisted, setSecretReferenceAllowUnlisted] = useState<"true" | "false">("false");
  const [piiRedactionPolicy, setPiiRedactionPolicy] = useState<PiiRedactionPolicy | null>(null);
  const [piiRedactionEnabled, setPiiRedactionEnabled] = useState<"true" | "false">("true");
  const [piiRedactionRuleKinds, setPiiRedactionRuleKinds] =
    useState("api-key,bearer-token,credit-card,email,government-id,ip-address,jwt,phone,url-secret");
  const [retentionRetrievalDays, setRetentionRetrievalDays] = useState("30");
  const [retentionAuditDays, setRetentionAuditDays] = useState("365");
  const [retentionFeedbackDays, setRetentionFeedbackDays] = useState("90");
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [userDisplayName, setUserDisplayName] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "maintainer" | "reader">("reader");
  const [userPassword, setUserPassword] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userUpdateDisplayName, setUserUpdateDisplayName] = useState("");
  const [userUpdateRole, setUserUpdateRole] = useState<"admin" | "maintainer" | "reader">("reader");
  const [userUpdateStatus, setUserUpdateStatus] = useState<"active" | "disabled">("active");
  const [userUpdatePassword, setUserUpdatePassword] = useState("");
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([]);
  const [serviceAccountPolicy, setServiceAccountPolicy] = useState<ServiceAccountPolicy | null>(null);
  const [serviceAccountSlug, setServiceAccountSlug] = useState("automation");
  const [serviceAccountName, setServiceAccountName] = useState("Automation");
  const [serviceAccountDescription, setServiceAccountDescription] = useState("");
  const [serviceAccountRole, setServiceAccountRole] = useState<"admin" | "maintainer" | "reader">("reader");
  const [serviceAccountStatus, setServiceAccountStatus] = useState<"active" | "disabled">("active");
  const [selectedServiceAccountId, setSelectedServiceAccountId] = useState("");
  const [serviceAccountUpdateName, setServiceAccountUpdateName] = useState("");
  const [serviceAccountUpdateDescription, setServiceAccountUpdateDescription] = useState("");
  const [serviceAccountUpdateRole, setServiceAccountUpdateRole] = useState<"admin" | "maintainer" | "reader">("reader");
  const [serviceAccountUpdateStatus, setServiceAccountUpdateStatus] = useState<"active" | "disabled">("active");
  const [servicePolicyMaxAccounts, setServicePolicyMaxAccounts] = useState("50");
  const [servicePolicyMaxKeys, setServicePolicyMaxKeys] = useState("5");
  const [servicePolicyDefaultExpiry, setServicePolicyDefaultExpiry] = useState("90");
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMembership[]>([]);
  const [groupSlug, setGroupSlug] = useState("ai-team");
  const [groupName, setGroupName] = useState("AI Team");
  const [groupDescription, setGroupDescription] = useState("");
  const [memberGroupId, setMemberGroupId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [apiKeyRecords, setApiKeyRecords] = useState<ApiKeyRecord[]>([]);
  const [loginSessions, setLoginSessions] = useState<LoginSessionRecord[]>([]);
  const [selectedLoginSessionId, setSelectedLoginSessionId] = useState("");
  const [keyUserId, setKeyUserId] = useState("");
  const [keyServiceAccountId, setKeyServiceAccountId] = useState("");
  const [keyName, setKeyName] = useState("reader-key");
  const [keyScopes, setKeyScopes] = useState("asset:read");
  const [keyExpiresAt, setKeyExpiresAt] = useState("");
  const [selectedApiKeyId, setSelectedApiKeyId] = useState("");
  const [rotateKeyName, setRotateKeyName] = useState("");
  const [revokeOldKey, setRevokeOldKey] = useState(false);
  const [apiKeyRotationDueDays, setApiKeyRotationDueDays] = useState("14");
  const [apiKeyRotationReport, setApiKeyRotationReport] = useState<ApiKeyRotationReport | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState("");
  const [feedbackRecords, setFeedbackRecords] = useState<ManagedQueryFeedback[]>([]);
  const [feedbackTelemetryEventId, setFeedbackTelemetryEventId] = useState("");
  const [feedbackQuery, setFeedbackQuery] = useState("PII redaction");
  const [feedbackOutcome, setFeedbackOutcome] = useState<"accepted" | "rejected" | "needs-review">("accepted");
  const [feedbackCitationAccuracy, setFeedbackCitationAccuracy] = useState("5");
  const [evalReport, setEvalReport] = useState<ManagedQueryEvalReport | null>(null);
  const [evalRuns, setEvalRuns] = useState<ManagedQueryEvalRun[]>([]);
  const [evalSummary, setEvalSummary] = useState<ManagedQueryEvalAnalyticsSummary | null>(null);
  const [evalSchedulePolicy, setEvalSchedulePolicy] = useState<ManagedQueryEvalSchedulePolicy | null>(null);
  const [evalScheduleEnabled, setEvalScheduleEnabled] = useState<"true" | "false">("false");
  const [evalScheduleIntervalMinutes, setEvalScheduleIntervalMinutes] = useState("1440");
  const [providerConfigs, setProviderConfigs] = useState<ModelProviderConfig[]>([]);
  const [providerHealth, setProviderHealth] = useState<ModelProviderHealth[]>([]);
  const [authProviderConfigs, setAuthProviderConfigs] = useState<AuthProviderConfig[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderFormState>({
    provider: "openai",
    enabled: true,
    displayName: "OpenAI",
    baseUrl: "",
    apiKeyEnvVar: "OPENAI_API_KEY",
    defaultModel: "gpt-5.1",
    models: "gpt-5.1",
    priority: "10",
    maxOutputTokens: "700",
    temperature: "0.2",
    timeoutMs: "20000",
    maxRetries: "0",
    retryBackoffMs: "250",
    inputCostPerMillionTokens: "",
    outputCostPerMillionTokens: "",
    maxEstimatedInputTokensPerQuery: "",
    maxEstimatedTotalTokensPerQuery: "",
    maxEstimatedCostUsdPerQuery: ""
  });
  const [authProviderForm, setAuthProviderForm] = useState<AuthProviderFormState>({
    provider: "microsoft-entra",
    enabled: false,
    displayName: "Microsoft Entra ID",
    issuerUrl: "https://login.microsoftonline.com/common/v2.0",
    clientId: "agentic-cms",
    clientSecretEnvVar: "ENTRA_CLIENT_SECRET",
    redirectUri: "http://localhost:5175/",
    scopes: "openid,profile,email",
    emailClaim: "email",
    displayNameClaim: "name",
    groupClaim: "groups",
    roleClaim: "",
	    defaultRole: "reader",
	    autoProvisionUsers: false,
	    accountLinkingMode: "verified-email",
	    groupSyncEnabled: false,
    allowedDomains: "",
    pkceRequired: true,
    priority: "10"
  });
  const [health, setHealth] = useState<string>("checking");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(() =>
    normalizePageRoute(typeof window === "undefined" ? "" : window.location.hash.replace("#", ""))
  );
  const [density, setDensity] = useState(() =>
    typeof window === "undefined" ? "comfortable" : localStorage.getItem(densityStorageKey) || "comfortable"
  );
  const [navWidth, setNavWidth] = useState(readStoredNavWidth);
  const [isResizingNav, setIsResizingNav] = useState(false);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.stableId === selectedStableId) ?? assets[0],
    [assets, selectedStableId]
  );
  const currentVersion = useMemo(
    () => assetDetail?.versions.find((version) => version.id === assetDetail.asset.currentVersionId) ?? assetDetail?.versions[0],
    [assetDetail]
  );
  const selectedVersionIsCurrent = versionSnapshot?.version.id === assetDetail?.asset.currentVersionId;
  const currentInstructionBody = assetDetail?.instructionObjects[0]?.body ?? "";
  const selectedInstructionBody = versionSnapshot?.instructionObjects[0]?.body ?? "";
  const currentHumanBody = assetDetail?.humanDocuments[0]?.body ?? "";
  const selectedHumanBody = versionSnapshot?.humanDocuments[0]?.body ?? "";
  const approvedAssets = assets.filter((asset) => asset.status === "approved").length;
  const reviewDueAssets = assets.filter((asset) => asset.status !== "approved" || asset.lifecycleState !== "active").length;
  const publicDemoAssets = assets.filter((asset) => asset.sensitivity === "public-demo").length;
  const visibleOperationsPage = operationsRoutes.has(currentPage);
  const isAuthenticated = authState === "authenticated";
  const displayIdentity = currentPrincipal?.displayName || currentPrincipal?.email || "Guest";
  const displayInitials = isAuthenticated ? initialsFor(displayIdentity) : "GU";

  useEffect(() => {
    localStorage.setItem(apiUrlStorageKey, apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("agentic-cms-api-key", apiKey);
    } else {
      localStorage.removeItem("agentic-cms-api-key");
    }
  }, [apiKey]);

  useEffect(() => {
    if (sessionCookieActive) {
      localStorage.setItem(sessionCookieActiveStorageKey, "true");
    } else {
      localStorage.removeItem(sessionCookieActiveStorageKey);
    }
  }, [sessionCookieActive]);

  useEffect(() => {
    localStorage.setItem("agentic-cms-login-tenant", loginTenantId);
  }, [loginTenantId]);

  useEffect(() => {
    if (loginEmail) {
      localStorage.setItem("agentic-cms-login-email", loginEmail);
    } else {
      localStorage.removeItem("agentic-cms-login-email");
    }
  }, [loginEmail]);

  useEffect(() => {
    void initializeSession();
  }, []);

  useEffect(() => {
    const syncPageFromHash = () => {
      setCurrentPage(normalizePageRoute(window.location.hash.replace("#", "")));
    };

    syncPageFromHash();
    window.addEventListener("hashchange", syncPageFromHash);
    return () => window.removeEventListener("hashchange", syncPageFromHash);
  }, []);

  useEffect(() => {
    localStorage.setItem(navWidthStorageKey, String(navWidth));
  }, [navWidth]);

  useEffect(() => {
    localStorage.setItem(densityStorageKey, density);
  }, [density]);

  useEffect(() => {
    if (!isResizingNav) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nav = document.querySelector(".side-nav");
      const navLeft = nav?.getBoundingClientRect().left ?? 0;
      setNavWidth(Math.min(420, Math.max(240, Math.round(event.clientX - navLeft))));
    };
    const stopResize = () => setIsResizingNav(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
  }, [isResizingNav]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const providerError = params.get("error");

    if (providerError) {
      setError(providerError);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!code || !state) {
      return;
    }

    const rawTransaction = localStorage.getItem("agentic-cms-oidc-transaction");

    if (!rawTransaction) {
      setError("Missing OIDC login state");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    localStorage.removeItem("agentic-cms-oidc-transaction");
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      const transaction = JSON.parse(rawTransaction) as OidcWebTransaction;
      void completeOidcLogin(code, state, transaction);
    } catch {
      setError("Invalid OIDC login state");
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && selectedAsset) {
      void loadAsset(selectedAsset.stableId);
    }
  }, [isAuthenticated, selectedAsset?.stableId]);

  useEffect(() => {
    if (!assetDetail) {
      setSelectedVersionNumber("");
      setVersionSnapshot(null);
      setPublishReviewDueAt("");
      setWorkflowNote("");
      return;
    }

    const version = assetDetail.versions.find((candidate) => candidate.id === assetDetail.asset.currentVersionId) ??
      assetDetail.versions[0];
    setSelectedVersionNumber(version ? String(version.versionNumber) : "");
    setVersionSnapshot(null);
    setPublishReviewDueAt(assetDetail.asset.reviewDueAt);
    setWorkflowNote("");
  }, [assetDetail?.asset.stableId, assetDetail?.asset.currentVersionId]);

  async function request<T>(path: string, init: RequestInit = {}, authKey = apiKey): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("x-agentic-cms-surface", "web");

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (authKey) {
      headers.set("authorization", `Bearer ${authKey}`);
    } else if (unsafeMethods.has((init.method ?? "GET").toUpperCase())) {
      const csrfToken = readCookie(csrfCookieName);

      if (csrfToken) {
        headers.set("x-agentic-cms-csrf", csrfToken);
      }
    }

    let response: Response;

    try {
      response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers,
        credentials: init.credentials ?? "include"
      });
    } catch (fetchError) {
      throw new Error(`API request failed for ${apiUrl}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new Error(`Expected JSON from API at ${apiUrl}; received ${contentType || "unknown content type"}`);
    }

    return response.json() as Promise<T>;
  }

  async function refreshHealth(authKey = apiKey) {
    try {
      const healthResponse = await request<{ status: string }>("/health", {}, authKey);
      setHealth(healthResponse.status);
    } catch {
      setHealth("offline");
    }
  }

  async function checkAuthenticatedSession(authKey = apiKey): Promise<AuthPrincipal | null> {
    try {
      const principal = await request<AuthPrincipal>("/auth/me", {}, authKey);
      setCurrentPrincipal(principal);
      setAuthState("authenticated");
      setSessionCookieActive(!authKey);
      return principal;
    } catch (sessionError) {
      const sessionErrorMessage = sessionError instanceof Error ? sessionError.message : String(sessionError);

      setCurrentPrincipal(null);
      setAuthState("unauthenticated");

      if (!authKey || sessionErrorMessage.startsWith("401 ")) {
        setSessionCookieActive(false);
      }

      if (authKey && sessionErrorMessage.startsWith("401 ")) {
        setApiKey("");
      } else if (!sessionErrorMessage.startsWith("401 ")) {
        setError(sessionErrorMessage);
      }

      return null;
    }
  }

  async function initializeSession() {
    setAuthState("checking");
    setError("");
    await refreshHealth();

    const principal = await checkAuthenticatedSession();

    if (principal) {
      await refresh();
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const response = await request<AuthLoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          tenantId: loginTenantId,
          email: loginEmail,
          password: loginPassword,
          keyName: "web-login",
          deviceLabel: "Web browser"
        })
      }, "");
      setSessionCookieActive(true);
      setAuthState("authenticated");
      setCurrentPrincipal({
        tenantId: response.user.tenantId,
        principalType: "user",
        principalId: response.user.id,
        userId: response.user.id,
        serviceAccountId: null,
        apiKeyId: response.apiKey.id,
        email: response.user.email,
        displayName: response.user.displayName,
        role: response.user.role,
        scopes: response.apiKey.scopes,
        groupIds: []
      });
      setApiKey("");
      setLoginPassword("");
      setMessage(`Signed in as ${response.user.email}`);
      await refresh("");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    }
  }

  function clearAuthenticatedState() {
    setApiKey("");
    setSessionCookieActive(false);
    setAuthState("unauthenticated");
    setCurrentPrincipal(null);
    setAssets([]);
    setSelectedStableId("");
    setAssetDetail(null);
    setSelectedVersionNumber("");
    setVersionSnapshot(null);
    setReviewQueue(null);
    setExportPackage(null);
    setTelemetryEvents([]);
    setTelemetrySummary(null);
    setTelemetryRetentionPolicy(null);
    setManagedQueryCacheEntries([]);
    setManagedQueryCachePolicy(null);
    setPiiRedactionPolicy(null);
    setAuditEvents([]);
    setUsers([]);
    setSelectedUserId("");
    setServiceAccounts([]);
    setServiceAccountPolicy(null);
    setSelectedServiceAccountId("");
    setGroups([]);
    setGroupMembers([]);
    setMemberGroupId("");
    setMemberUserId("");
    setApiKeyRecords([]);
    setLoginSessions([]);
    setSelectedLoginSessionId("");
    setSelectedApiKeyId("");
    setOneTimeSecret("");
    setFeedbackRecords([]);
    setEvalReport(null);
    setProviderConfigs([]);
    setProviderHealth([]);
    setAuthProviderConfigs([]);
  }

  async function logout() {
    setError("");
    let nextMessage = "Signed out locally";
    let logoutErrorMessage = "";

    if (apiKey || sessionCookieActive) {
      try {
        const response = await request<{ apiKey: ApiKeyRecord }>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({})
        });
        nextMessage = `Signed out and revoked ${response.apiKey.secretPreview}`;
      } catch (logoutError) {
        logoutErrorMessage = `Logout request failed; local key cleared. ${logoutError instanceof Error ? logoutError.message : String(logoutError)}`;
      }
    }

    clearAuthenticatedState();
    await refreshHealth("");
    setError(logoutErrorMessage);
    setMessage(nextMessage);
  }

  async function startOidcLogin(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const response = await request<AuthOidcAuthorizeResponse>("/auth/oidc/authorize", {
        method: "POST",
        body: JSON.stringify({
          tenantId: loginTenantId,
          provider: oidcProvider,
          redirectUri
        })
      }, "");

      localStorage.setItem("agentic-cms-oidc-transaction", JSON.stringify({
        tenantId: response.tenantId,
        provider: response.provider,
        nonce: response.nonce,
        codeVerifier: response.codeVerifier,
        redirectUri: response.redirectUri
      }));
      window.location.assign(response.authorizationUrl);
    } catch (oidcError) {
      setError(oidcError instanceof Error ? oidcError.message : String(oidcError));
    }
  }

  async function completeOidcLogin(code: string, state: string, transaction: OidcWebTransaction) {
    setError("");

    try {
      const response = await request<AuthOidcLoginResponse>("/auth/oidc/callback", {
        method: "POST",
        body: JSON.stringify({
          tenantId: transaction.tenantId,
          provider: transaction.provider,
          code,
          state,
          nonce: transaction.nonce,
          codeVerifier: transaction.codeVerifier,
          redirectUri: transaction.redirectUri,
          keyName: "web-oidc-login",
          deviceLabel: "Web OIDC browser"
        })
      }, "");
      setSessionCookieActive(true);
      setAuthState("authenticated");
      setCurrentPrincipal({
        tenantId: response.user.tenantId,
        principalType: "user",
        principalId: response.user.id,
        userId: response.user.id,
        serviceAccountId: null,
        apiKeyId: response.apiKey.id,
        email: response.user.email,
        displayName: response.user.displayName,
        role: response.user.role,
        scopes: response.apiKey.scopes,
        groupIds: []
      });
      setApiKey("");
      setMessage(`Signed in as ${response.user.email}`);
      await refresh("");
    } catch (oidcError) {
      setError(oidcError instanceof Error ? oidcError.message : String(oidcError));
    }
  }

  async function refresh(authKey = apiKey) {
    setError("");

    try {
      const principal = await request<AuthPrincipal>("/auth/me", {}, authKey);
      setCurrentPrincipal(principal);
      setAuthState("authenticated");
      setSessionCookieActive(!authKey);
      const healthResponse = await request<{ status: string }>("/health", {}, authKey);
      setHealth(healthResponse.status);
      const assetResponse = await request<{ assets: AssetRecord[] }>("/assets", {}, authKey);
      const nextSelectedStableId = assetResponse.assets.some((asset) => asset.stableId === selectedStableId)
        ? selectedStableId
        : assetResponse.assets[0]?.stableId ?? "";
      setAssets(assetResponse.assets);
      setSelectedStableId(nextSelectedStableId);

      if (!nextSelectedStableId) {
        setAssetDetail(null);
      }

      setMessage(`Loaded ${assetResponse.assets.length} assets`);
    } catch (loadError) {
      const loadErrorMessage = loadError instanceof Error ? loadError.message : String(loadError);

      if (loadErrorMessage.startsWith("401 ")) {
        clearAuthenticatedState();
        setHealth("ok");
        setMessage("");
      } else {
        setHealth("offline");
        setError(loadErrorMessage);
      }
    }
  }

  async function loadAsset(stableId: string) {
    if (!stableId) {
      return;
    }

    try {
      setAssetDetail(await request<AssetDetail>(`/assets/${encodeURIComponent(stableId)}`));
    } catch (loadError) {
      setAssetDetail(null);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  async function loadVersionSnapshot() {
    if (!assetDetail || !selectedVersionNumber) {
      return;
    }

    setError("");

    try {
      const snapshot = await request<AssetVersionSnapshot>(
        `/assets/${encodeURIComponent(assetDetail.asset.stableId)}/versions/${encodeURIComponent(selectedVersionNumber)}`
      );
      setVersionSnapshot(snapshot);
      setMessage(`Loaded ${assetDetail.asset.stableId} v${snapshot.version.versionNumber}`);
    } catch (snapshotError) {
      setVersionSnapshot(null);
      setError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
    }
  }

  async function publishAsset() {
    if (!assetDetail) {
      return;
    }

    setError("");

    try {
      const detail = await request<AssetDetail>(`/assets/${encodeURIComponent(assetDetail.asset.stableId)}/publish`, {
        method: "POST",
        body: JSON.stringify({
          reviewDueAt: publishReviewDueAt || undefined,
          changeNote: workflowNote || undefined
        })
      });
      setAssetDetail(detail);
      replaceAsset(detail.asset);
      setVersionSnapshot(null);
      setMessage(`Published ${detail.asset.stableId}`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : String(publishError));
    }
  }

  async function loadReviewQueue() {
    setError("");

    try {
      const params = new URLSearchParams({
        asOf: new Date().toISOString().slice(0, 10),
        includeApproved: "false",
        limit: "25"
      });
      const queue = await request<AssetReviewQueueResponse>(`/assets/review-queue?${params.toString()}`);
      setReviewQueue(queue);
      setMessage(`Loaded ${queue.assets.length} review items`);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    }
  }

  async function completeAssetReview() {
    if (!assetDetail) {
      return;
    }

    setError("");

    try {
      const detail = await request<AssetDetail>(`/assets/${encodeURIComponent(assetDetail.asset.stableId)}/review`, {
        method: "POST",
        body: JSON.stringify({
          status: "approved",
          reviewDueAt: publishReviewDueAt || assetDetail.asset.reviewDueAt,
          changeNote: workflowNote || undefined
        })
      });
      setAssetDetail(detail);
      replaceAsset(detail.asset);
      setReviewQueue((current) => current ? {
        ...current,
        assets: current.assets.filter((asset) => asset.id !== detail.asset.id)
      } : current);
      setMessage(`Reviewed ${detail.asset.stableId}`);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    }
  }

  async function restoreVersion() {
    if (!assetDetail || !selectedVersionNumber) {
      return;
    }

    setError("");

    try {
      const detail = await request<AssetDetail>(`/assets/${encodeURIComponent(assetDetail.asset.stableId)}/restore`, {
        method: "POST",
        body: JSON.stringify({
          versionNumber: Number.parseInt(selectedVersionNumber, 10),
          changeNote: workflowNote || undefined
        })
      });
      setAssetDetail(detail);
      replaceAsset(detail.asset);
      setVersionSnapshot(null);
      setMessage(`Restored ${detail.asset.stableId} to v${selectedVersionNumber}`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : String(restoreError));
    }
  }

  function replaceAsset(asset: AssetRecord) {
    setAssets((current) => current.map((candidate) => candidate.id === asset.id ? asset : candidate));
  }

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setError("");

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        limit: "8"
      });
      const response = await request<SearchResponse>(`/search?${params.toString()}`);
      setSearchResponse(response);
      setMessage(`Search returned ${response.results.length} chunks`);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    }
  }

  async function runManagedQuery(event?: FormEvent) {
    event?.preventDefault();
    setError("");

    try {
      const response = await request<ManagedQueryResponse>("/agent/query", {
        method: "POST",
        body: JSON.stringify({
          query: managedQueryText,
          limit: 5,
          mode: managedQueryMode,
          provider: managedQueryMode === "provider-routed" ? managedQueryProvider : undefined,
          model: managedQueryModel || undefined,
          cache: managedQueryCacheEnabled
        })
      });
      setManagedQueryResponse(response);

      if (response.telemetryEventId) {
        setFeedbackTelemetryEventId(response.telemetryEventId);
        setFeedbackQuery(response.query);
      }

      setMessage(`Managed query ${response.generation.status}`);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : String(queryError));
    }
  }

  async function generateExport() {
    setError("");

    try {
      const response = await request<AiExportPackage>("/exports/ai-package?package=demo-agent-pack");
      setExportPackage(response);
      setMessage(`Export package contains ${response.assetCount} assets`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    }
  }

  async function loadTelemetry() {
    setError("");

    try {
      const response = await request<{ events: RetrievalEvent[] }>("/telemetry/retrieval-events?limit=8");
      setTelemetryEvents(response.events);
      const latestManagedQueryEvent = response.events.find((event) =>
        event.metadata.queryKind === "managed-query" || event.metadata.queryKind === "managed-query-eval"
      ) ?? response.events[0];

      if (latestManagedQueryEvent) {
        setFeedbackTelemetryEventId(latestManagedQueryEvent.id);
        setFeedbackQuery(latestManagedQueryEvent.query);
      }

      setMessage(`Loaded ${response.events.length} retrieval events`);
    } catch (telemetryError) {
      setError(telemetryError instanceof Error ? telemetryError.message : String(telemetryError));
    }
  }

  async function loadTelemetrySummary() {
    setError("");

    try {
      const summary = await request<TelemetryAnalyticsSummary>("/telemetry/summary?limit=200");
      setTelemetrySummary(summary);
      setMessage(`Summary loaded for ${summary.retrieval.eventCount} retrieval events`);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : String(summaryError));
    }
  }

  async function loadTelemetryRetentionPolicy() {
    setError("");

    try {
      const policy = await request<TelemetryRetentionPolicy>("/admin/telemetry-retention");
      setTelemetryRetentionPolicy(policy);
      setRetentionRetrievalDays(formatRetentionInput(policy.retrievalEventRetentionDays));
      setRetentionAuditDays(formatRetentionInput(policy.auditEventRetentionDays));
      setRetentionFeedbackDays(formatRetentionInput(policy.feedbackRetentionDays));
      setMessage("Loaded telemetry retention policy");
    } catch (retentionError) {
      setError(retentionError instanceof Error ? retentionError.message : String(retentionError));
    }
  }

  async function saveTelemetryRetentionPolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<TelemetryRetentionPolicy>("/admin/telemetry-retention", {
        method: "PUT",
        body: JSON.stringify({
          retrievalEventRetentionDays: parseRetentionInput(retentionRetrievalDays),
          auditEventRetentionDays: parseRetentionInput(retentionAuditDays),
          feedbackRetentionDays: parseRetentionInput(retentionFeedbackDays)
        })
      });
      setTelemetryRetentionPolicy(policy);
      setMessage("Saved telemetry retention policy");
    } catch (retentionError) {
      setError(retentionError instanceof Error ? retentionError.message : String(retentionError));
    }
  }

  async function purgeTelemetryRetention(dryRun: boolean) {
    setError("");

    try {
      const result = await request<TelemetryRetentionPurgeResult>("/admin/telemetry-retention/purge", {
        method: "POST",
        body: JSON.stringify({ dryRun })
      });
      setTelemetryRetentionPurgeResult(result);
      setMessage(`${dryRun ? "Previewed" : "Purged"} telemetry retention`);
    } catch (retentionError) {
      setError(retentionError instanceof Error ? retentionError.message : String(retentionError));
    }
  }

  async function loadManagedQueryCache() {
    setError("");

    try {
      const response = await request<{ entries: ManagedQueryCacheEntry[] }>("/admin/managed-query-cache?limit=8");
      setManagedQueryCacheEntries(response.entries);
      setMessage(`Loaded ${response.entries.length} cache entries`);
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : String(cacheError));
    }
  }

  async function loadManagedQueryPolicy() {
    setError("");

    try {
      const policy = await request<ManagedQueryPolicy>("/admin/managed-query-policy");
      setManagedQueryPolicy(policy);
      setQueryPolicyDefaultMode(policy.defaultMode);
      setQueryPolicyAllowedModes(policy.allowedModes.join(","));
      setQueryPolicyMinimumCitationCount(String(policy.minimumCitationCount));
      setQueryPolicyRequireGrounded(policy.requireGrounded ? "true" : "false");
      setMessage("Loaded managed query policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function saveManagedQueryPolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<ManagedQueryPolicy>("/admin/managed-query-policy", {
        method: "PUT",
        body: JSON.stringify({
          defaultMode: queryPolicyDefaultMode,
          allowedModes: queryPolicyAllowedModes.split(",").map((mode) => mode.trim()).filter(Boolean),
          minimumCitationCount: Number.parseInt(queryPolicyMinimumCitationCount, 10),
          requireGrounded: queryPolicyRequireGrounded === "true"
        })
      });
      setManagedQueryPolicy(policy);
      setQueryPolicyDefaultMode(policy.defaultMode);
      setQueryPolicyAllowedModes(policy.allowedModes.join(","));
      setQueryPolicyMinimumCitationCount(String(policy.minimumCitationCount));
      setQueryPolicyRequireGrounded(policy.requireGrounded ? "true" : "false");
      setMessage("Saved managed query policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function loadRetrievalRankingPolicy() {
    setError("");

    try {
      const policy = await request<RetrievalRankingPolicy>("/admin/retrieval-ranking-policy");
      setRetrievalRankingPolicy(policy);
      setRankingPolicyAgentInstructionWeight(String(policy.agentInstructionWeight));
      setRankingPolicyAssetSummaryWeight(String(policy.assetSummaryWeight));
      setRankingPolicyHumanDocumentWeight(String(policy.humanDocumentWeight));
      setRankingPolicyExactPhraseBoost(String(policy.exactPhraseBoost));
      setMessage("Loaded retrieval ranking policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function saveRetrievalRankingPolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<RetrievalRankingPolicy>("/admin/retrieval-ranking-policy", {
        method: "PUT",
        body: JSON.stringify({
          agentInstructionWeight: parseOptionalNumber(rankingPolicyAgentInstructionWeight),
          assetSummaryWeight: parseOptionalNumber(rankingPolicyAssetSummaryWeight),
          humanDocumentWeight: parseOptionalNumber(rankingPolicyHumanDocumentWeight),
          exactPhraseBoost: parseOptionalNumber(rankingPolicyExactPhraseBoost)
        })
      });
      setRetrievalRankingPolicy(policy);
      setRankingPolicyAgentInstructionWeight(String(policy.agentInstructionWeight));
      setRankingPolicyAssetSummaryWeight(String(policy.assetSummaryWeight));
      setRankingPolicyHumanDocumentWeight(String(policy.humanDocumentWeight));
      setRankingPolicyExactPhraseBoost(String(policy.exactPhraseBoost));
      setMessage("Saved retrieval ranking policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function loadActionExecutionPolicy() {
    setError("");

    try {
      const policy = await request<AgentActionExecutionPolicy>("/admin/action-execution-policy");
      setActionExecutionPolicy(policy);
      setActionPolicyEnabled(policy.enabled ? "true" : "false");
      setActionPolicyAllowedTypes(policy.allowedActionTypes.join(","));
      setActionPolicyRequireApproval(policy.requireApproval ? "true" : "false");
      setActionPolicyDryRunDefault(policy.dryRunDefault ? "true" : "false");
      setActionPolicyKillSwitch(policy.killSwitch ? "true" : "false");
      setActionPolicyMaxRequestsPerHour(String(policy.maxRequestsPerHour));
      setActionPolicyApprovalExpiresInMinutes(String(policy.approvalExpiresInMinutes));
      setMessage("Loaded action execution policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function saveActionExecutionPolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<AgentActionExecutionPolicy>("/admin/action-execution-policy", {
        method: "PUT",
        body: JSON.stringify({
          enabled: actionPolicyEnabled === "true",
          allowedActionTypes: parseCsvInput(actionPolicyAllowedTypes),
          requireApproval: actionPolicyRequireApproval === "true",
          dryRunDefault: actionPolicyDryRunDefault === "true",
          killSwitch: actionPolicyKillSwitch === "true",
          maxRequestsPerHour: parseOptionalNumber(actionPolicyMaxRequestsPerHour),
          approvalExpiresInMinutes: parseOptionalNumber(actionPolicyApprovalExpiresInMinutes)
        })
      });
      setActionExecutionPolicy(policy);
      setActionPolicyEnabled(policy.enabled ? "true" : "false");
      setActionPolicyAllowedTypes(policy.allowedActionTypes.join(","));
      setActionPolicyRequireApproval(policy.requireApproval ? "true" : "false");
      setActionPolicyDryRunDefault(policy.dryRunDefault ? "true" : "false");
      setActionPolicyKillSwitch(policy.killSwitch ? "true" : "false");
      setActionPolicyMaxRequestsPerHour(String(policy.maxRequestsPerHour));
      setActionPolicyApprovalExpiresInMinutes(String(policy.approvalExpiresInMinutes));
      setMessage("Saved action execution policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function loadAgentActions() {
    setError("");

    try {
      const response = await request<{ actions: AgentActionRequest[] }>("/agent/actions?limit=8");
      setAgentActions(response.actions);
      setMessage(`Loaded ${response.actions.length} action requests`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }

  async function executeAgentAction(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const action = await request<AgentActionRequest>("/agent/actions/execute", {
        method: "POST",
        body: JSON.stringify({
          actionType,
          title: actionTitle,
          description: actionDescription || undefined,
          target: actionTarget || undefined,
          idempotencyKey: actionIdempotencyKey || undefined,
          dryRun: actionDryRun === "true",
          payload: {},
          metadata: {
            surface: "web"
          }
        })
      });
      setAgentActions((current) => [action, ...current.filter((item) => item.id !== action.id)].slice(0, 8));
      setMessage(`Action ${action.status}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }

  async function decideAgentAction(actionRequestId: string, decision: "approve" | "deny", reason: string) {
    setError("");

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setError("Add an operator note before deciding an action.");
      return;
    }

    try {
      const action = await request<AgentActionRequest>(`/agent/actions/${encodeURIComponent(actionRequestId)}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason: trimmedReason
        })
      });
      setAgentActions((current) => current.map((item) => item.id === action.id ? action : item));
      setActionDecisionReasons((current) => {
        const next = { ...current };
        delete next[actionRequestId];
        return next;
      });
      setPendingActionDecision(null);
      setMessage(`Action ${decision} ${action.status}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  }

	  async function loadManagedQueryCachePolicy() {
    setError("");

    try {
      const policy = await request<ManagedQueryCachePolicy>("/admin/managed-query-cache/policy");
      setManagedQueryCachePolicy(policy);
      setCachePolicyEnabled(policy.cacheEnabled ? "true" : "false");
      setCachePolicyMaxTtl(policyValue(policy.maxCacheTtlSeconds));
      setMessage("Loaded managed query cache policy");
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : String(cacheError));
    }
  }

  async function saveManagedQueryCachePolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<ManagedQueryCachePolicy>("/admin/managed-query-cache/policy", {
        method: "PUT",
        body: JSON.stringify({
          cacheEnabled: cachePolicyEnabled === "true",
          maxCacheTtlSeconds: parseNullablePolicyNumber(cachePolicyMaxTtl)
        })
      });
      setManagedQueryCachePolicy(policy);
      setCachePolicyEnabled(policy.cacheEnabled ? "true" : "false");
      setCachePolicyMaxTtl(policyValue(policy.maxCacheTtlSeconds));
      setMessage("Saved managed query cache policy");
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : String(cacheError));
    }
  }

  async function purgeManagedQueryCache(dryRun: boolean) {
    setError("");

    try {
      const result = await request<ManagedQueryCachePurgeResult>("/admin/managed-query-cache/purge", {
        method: "POST",
        body: JSON.stringify({ dryRun })
      });
      setManagedQueryCachePurgeResult(result);

      if (!dryRun) {
        await loadManagedQueryCache();
      }

      setMessage(`${dryRun ? "Previewed" : "Purged"} managed query cache`);
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : String(cacheError));
    }
  }

  async function deleteManagedQueryCacheEntry(cacheKey: string) {
    setError("");

    try {
      const deleted = await request<ManagedQueryCacheEntry>(
        `/admin/managed-query-cache/${encodeURIComponent(cacheKey)}`,
        {
          method: "DELETE"
        }
      );
      setManagedQueryCacheEntries((current) => current.filter((entry) => entry.cacheKey !== deleted.cacheKey));
      setMessage(`Deleted cache entry ${deleted.provider}/${deleted.model}`);
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : String(cacheError));
    }
  }

  async function loadManagedQueryRetentionPolicy() {
    setError("");

    try {
      const policy = await request<ManagedQueryRetentionPolicy>("/admin/managed-query-retention/policy");
      setManagedQueryRetentionPolicy(policy);
      setQueryRetentionPromptMode(policy.promptCaptureMode);
      setQueryRetentionResponseMode(policy.responseCaptureMode);
      setQueryRetentionMetadataDays(formatRetentionInput(policy.metadataRetentionDays));
      setMessage("Loaded managed query retention policy");
    } catch (retentionError) {
      setError(retentionError instanceof Error ? retentionError.message : String(retentionError));
    }
  }

  async function saveManagedQueryRetentionPolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<ManagedQueryRetentionPolicy>("/admin/managed-query-retention/policy", {
        method: "PUT",
        body: JSON.stringify({
          promptCaptureMode: queryRetentionPromptMode,
          responseCaptureMode: queryRetentionResponseMode,
          metadataRetentionDays: parseRetentionInput(queryRetentionMetadataDays)
        })
      });
      setManagedQueryRetentionPolicy(policy);
      setQueryRetentionPromptMode(policy.promptCaptureMode);
      setQueryRetentionResponseMode(policy.responseCaptureMode);
      setQueryRetentionMetadataDays(formatRetentionInput(policy.metadataRetentionDays));
      setMessage("Saved managed query retention policy");
    } catch (retentionError) {
      setError(retentionError instanceof Error ? retentionError.message : String(retentionError));
    }
  }

  async function loadSecretReferencePolicy() {
    setError("");

    try {
      const policy = await request<SecretReferencePolicy>("/admin/secret-reference-policy");
      setSecretReferencePolicy(policy);
      setSecretReferencePrefixes(policy.allowedEnvVarPrefixes.join(","));
      setSecretReferenceEnvVars(policy.allowedEnvVars.join(","));
      setSecretReferenceAllowUnlisted(String(policy.allowUnlistedEnvVars) as "true" | "false");
      setMessage("Loaded secret reference policy");
    } catch (secretError) {
      setError(secretError instanceof Error ? secretError.message : String(secretError));
    }
  }

  async function saveSecretReferencePolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<SecretReferencePolicy>("/admin/secret-reference-policy", {
        method: "PUT",
        body: JSON.stringify({
          allowedEnvVarPrefixes: parseCsvInput(secretReferencePrefixes),
          allowedEnvVars: parseCsvInput(secretReferenceEnvVars),
          allowUnlistedEnvVars: secretReferenceAllowUnlisted === "true"
        })
      });
      setSecretReferencePolicy(policy);
      setSecretReferencePrefixes(policy.allowedEnvVarPrefixes.join(","));
      setSecretReferenceEnvVars(policy.allowedEnvVars.join(","));
      setSecretReferenceAllowUnlisted(String(policy.allowUnlistedEnvVars) as "true" | "false");
      setMessage("Saved secret reference policy");
    } catch (secretError) {
      setError(secretError instanceof Error ? secretError.message : String(secretError));
    }
  }

  async function loadPiiRedactionPolicy() {
    setError("");

    try {
      const policy = await request<PiiRedactionPolicy>("/admin/pii-redaction-policy");
      setPiiRedactionPolicy(policy);
      setPiiRedactionEnabled(policy.redactionEnabled ? "true" : "false");
      setPiiRedactionRuleKinds(policy.enabledRuleKinds.join(","));
      setMessage("Loaded PII redaction policy");
    } catch (piiError) {
      setError(piiError instanceof Error ? piiError.message : String(piiError));
    }
  }

  async function savePiiRedactionPolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<PiiRedactionPolicy>("/admin/pii-redaction-policy", {
        method: "PUT",
        body: JSON.stringify({
          redactionEnabled: piiRedactionEnabled === "true",
          enabledRuleKinds: parseCsvInput(piiRedactionRuleKinds)
        })
      });
      setPiiRedactionPolicy(policy);
      setPiiRedactionEnabled(policy.redactionEnabled ? "true" : "false");
      setPiiRedactionRuleKinds(policy.enabledRuleKinds.join(","));
      setMessage("Saved PII redaction policy");
    } catch (piiError) {
      setError(piiError instanceof Error ? piiError.message : String(piiError));
    }
  }

  async function loadAuditEvents() {
    setError("");

    try {
      const response = await request<{ events: AuditEvent[] }>("/audit/events?limit=8");
      setAuditEvents(response.events);
      setMessage(`Loaded ${response.events.length} audit events`);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : String(auditError));
    }
  }

  async function loadUsers() {
    setError("");

    try {
      const response = await request<{ users: LocalUser[] }>("/auth/users?limit=12");
      setUsers(response.users);
      const firstUserId = response.users[0]?.id ?? "";
      const selectedUser = response.users.find((user) => user.id === selectedUserId) ?? response.users[0];
      setSelectedUserId(selectedUser?.id ?? "");
      setUserUpdateDisplayName(selectedUser?.displayName ?? "");
      setUserUpdateRole(selectedUser?.role ?? "reader");
      setUserUpdateStatus(selectedUser?.status ?? "active");
      setKeyUserId((current) => current || (keyServiceAccountId ? "" : firstUserId));
      setMemberUserId((current) => current || firstUserId);
      setMessage(`Loaded ${response.users.length} users`);
    } catch (userError) {
      setError(userError instanceof Error ? userError.message : String(userError));
    }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const user = await request<LocalUser>("/auth/users", {
        method: "POST",
        body: JSON.stringify({
          email: userEmail,
          displayName: userDisplayName,
          role: userRole,
          password: userPassword || undefined
        })
      });
      setUsers((current) => [
        user,
        ...current.filter((candidate) => candidate.id !== user.id)
      ]);
      setKeyUserId(user.id);
      setKeyServiceAccountId("");
      setMemberUserId(user.id);
      setSelectedUserId(user.id);
      setUserUpdateDisplayName(user.displayName);
      setUserUpdateRole(user.role);
      setUserUpdateStatus(user.status);
      setUserPassword("");
      setMessage(`Created user ${user.email}`);
    } catch (userError) {
      setError(userError instanceof Error ? userError.message : String(userError));
    }
  }

  async function updateUser(event: FormEvent) {
    event.preventDefault();

    if (!selectedUserId) {
      return;
    }

    setError("");

    try {
      const user = await request<LocalUser>(`/auth/users/${encodeURIComponent(selectedUserId)}`, {
        method: "PUT",
        body: JSON.stringify({
          displayName: userUpdateDisplayName,
          role: userUpdateRole,
          status: userUpdateStatus,
          password: userUpdatePassword || undefined
        })
      });
      setUsers((current) => [
        user,
        ...current.filter((candidate) => candidate.id !== user.id)
      ]);
      setUserUpdatePassword("");
      setMessage(`Updated user ${user.email}`);
    } catch (userError) {
      setError(userError instanceof Error ? userError.message : String(userError));
    }
  }

  async function loadServiceAccounts() {
    setError("");

    try {
      const response = await request<{ serviceAccounts: ServiceAccount[] }>("/auth/service-accounts?limit=12");
      setServiceAccounts(response.serviceAccounts);
      const firstServiceAccountId = response.serviceAccounts[0]?.id ?? "";
      const selectedServiceAccount = response.serviceAccounts.find((serviceAccount) =>
        serviceAccount.id === selectedServiceAccountId
      ) ?? response.serviceAccounts[0];
      setSelectedServiceAccountId(selectedServiceAccount?.id ?? "");
      setServiceAccountUpdateName(selectedServiceAccount?.name ?? "");
      setServiceAccountUpdateDescription(selectedServiceAccount?.description ?? "");
      setServiceAccountUpdateRole(selectedServiceAccount?.role ?? "reader");
      setServiceAccountUpdateStatus(selectedServiceAccount?.status ?? "active");
      setKeyServiceAccountId((current) => current || (keyUserId ? "" : firstServiceAccountId));
      setMessage(`Loaded ${response.serviceAccounts.length} service accounts`);
    } catch (serviceAccountError) {
      setError(serviceAccountError instanceof Error ? serviceAccountError.message : String(serviceAccountError));
    }
  }

  async function loadServiceAccountPolicy() {
    setError("");

    try {
      const policy = await request<ServiceAccountPolicy>("/admin/service-account-policy");
      setServiceAccountPolicy(policy);
      setServicePolicyMaxAccounts(policyValue(policy.maxServiceAccounts));
      setServicePolicyMaxKeys(policyValue(policy.maxActiveApiKeysPerServiceAccount));
      setServicePolicyDefaultExpiry(policyValue(policy.defaultApiKeyExpiresInDays));
      setMessage("Loaded service account policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function updateServiceAccountPolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const policy = await request<ServiceAccountPolicy>("/admin/service-account-policy", {
        method: "PUT",
        body: JSON.stringify({
          maxServiceAccounts: parseNullablePolicyNumber(servicePolicyMaxAccounts),
          maxActiveApiKeysPerServiceAccount: parseNullablePolicyNumber(servicePolicyMaxKeys),
          defaultApiKeyExpiresInDays: parseNullablePolicyNumber(servicePolicyDefaultExpiry)
        })
      });
      setServiceAccountPolicy(policy);
      setServicePolicyMaxAccounts(policyValue(policy.maxServiceAccounts));
      setServicePolicyMaxKeys(policyValue(policy.maxActiveApiKeysPerServiceAccount));
      setServicePolicyDefaultExpiry(policyValue(policy.defaultApiKeyExpiresInDays));
      setMessage("Updated service account policy");
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : String(policyError));
    }
  }

  async function createServiceAccount(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const serviceAccount = await request<ServiceAccount>("/auth/service-accounts", {
        method: "POST",
        body: JSON.stringify({
          slug: serviceAccountSlug,
          name: serviceAccountName,
          description: serviceAccountDescription || undefined,
          role: serviceAccountRole,
          status: serviceAccountStatus
        })
      });
      setServiceAccounts((current) => [
        serviceAccount,
        ...current.filter((candidate) => candidate.id !== serviceAccount.id)
      ]);
      setSelectedServiceAccountId(serviceAccount.id);
      setServiceAccountUpdateName(serviceAccount.name);
      setServiceAccountUpdateDescription(serviceAccount.description ?? "");
      setServiceAccountUpdateRole(serviceAccount.role);
      setServiceAccountUpdateStatus(serviceAccount.status);
      setKeyUserId("");
      setKeyServiceAccountId(serviceAccount.id);
      setMessage(`Created service account ${serviceAccount.slug}`);
    } catch (serviceAccountError) {
      setError(serviceAccountError instanceof Error ? serviceAccountError.message : String(serviceAccountError));
    }
  }

  async function updateServiceAccount(event: FormEvent) {
    event.preventDefault();

    if (!selectedServiceAccountId) {
      return;
    }

    setError("");

    try {
      const serviceAccount = await request<ServiceAccount>(
        `/auth/service-accounts/${encodeURIComponent(selectedServiceAccountId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: serviceAccountUpdateName,
            description: serviceAccountUpdateDescription || null,
            role: serviceAccountUpdateRole,
            status: serviceAccountUpdateStatus
          })
        }
      );
      setServiceAccounts((current) => [
        serviceAccount,
        ...current.filter((candidate) => candidate.id !== serviceAccount.id)
      ]);
      setMessage(`Updated service account ${serviceAccount.slug}`);
    } catch (serviceAccountError) {
      setError(serviceAccountError instanceof Error ? serviceAccountError.message : String(serviceAccountError));
    }
  }

  async function loadGroups() {
    setError("");

    try {
      const response = await request<{ groups: GroupRecord[] }>("/auth/groups?limit=12");
      setGroups(response.groups);
      setMemberGroupId((current) =>
        current && response.groups.some((group) => group.id === current)
          ? current
          : response.groups[0]?.id ?? ""
      );
      setMessage(`Loaded ${response.groups.length} groups`);
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : String(groupError));
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const group = await request<GroupRecord>("/auth/groups", {
        method: "POST",
        body: JSON.stringify({
          slug: groupSlug,
          name: groupName,
          description: groupDescription || undefined
        })
      });
      setGroups((current) => [
        group,
        ...current.filter((candidate) => candidate.id !== group.id)
      ].sort((left, right) => left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug)));
      setMemberGroupId(group.id);
      setMessage(`Created group ${group.slug}`);
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : String(groupError));
    }
  }

  async function deleteGroup() {
    if (!memberGroupId) {
      return;
    }

    setError("");

    try {
      const group = await request<GroupRecord>(`/auth/groups/${encodeURIComponent(memberGroupId)}`, {
        method: "DELETE"
      });
      setGroups((current) => current.filter((candidate) => candidate.id !== group.id));
      setGroupMembers((current) => current.filter((member) => member.groupId !== group.id));
      setMemberGroupId("");
      setMessage(`Deleted group ${group.slug}`);
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : String(groupError));
    }
  }

  async function addGroupMember(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const member = await request<GroupMembership>(
        `/auth/groups/${encodeURIComponent(memberGroupId)}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            userId: memberUserId
          })
        }
      );
      setGroupMembers((current) => [
        member,
        ...current.filter((candidate) => candidate.groupId !== member.groupId || candidate.userId !== member.userId)
      ].sort((left, right) => left.userEmail.localeCompare(right.userEmail)));
      setMessage(`Added ${member.userEmail}`);
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : String(memberError));
    }
  }

  async function removeGroupMember() {
    if (!memberGroupId || !memberUserId) {
      return;
    }

    setError("");

    try {
      const member = await request<GroupMembership>(
        `/auth/groups/${encodeURIComponent(memberGroupId)}/members/${encodeURIComponent(memberUserId)}`,
        {
          method: "DELETE"
        }
      );
      setGroupMembers((current) =>
        current.filter((candidate) => candidate.groupId !== member.groupId || candidate.userId !== member.userId)
      );
      setMessage(`Removed ${member.userEmail}`);
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : String(memberError));
    }
  }

  async function loadGroupMembers() {
    if (!memberGroupId) {
      return;
    }

    setError("");

    try {
      const response = await request<{ members: GroupMembership[] }>(
        `/auth/groups/${encodeURIComponent(memberGroupId)}/members?limit=12`
      );
      setGroupMembers(response.members);
      setMessage(`Loaded ${response.members.length} group members`);
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : String(memberError));
    }
  }

  async function loadFeedback() {
    setError("");

    try {
      const response = await request<{ feedback: ManagedQueryFeedback[] }>("/agent/query/feedback?limit=8");
      setFeedbackRecords(response.feedback);
      setMessage(`Loaded ${response.feedback.length} feedback records`);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : String(feedbackError));
    }
  }

  async function loadApiKeys() {
    setError("");
    setOneTimeSecret("");

    try {
      const response = await request<{ apiKeys: ApiKeyRecord[] }>("/auth/api-keys?limit=12");
      setApiKeyRecords(response.apiKeys);
      setSelectedApiKeyId((current) =>
        current && response.apiKeys.some((record) => record.id === current)
          ? current
          : response.apiKeys[0]?.id ?? ""
      );
      setMessage(`Loaded ${response.apiKeys.length} API keys`);
    } catch (keyError) {
      setError(keyError instanceof Error ? keyError.message : String(keyError));
    }
  }

  async function loadLoginSessions() {
    setError("");

    try {
      const response = await request<{ sessions: LoginSessionRecord[] }>("/auth/sessions?includeRevoked=true&limit=12");
      setLoginSessions(response.sessions);
      setSelectedLoginSessionId((current) =>
        current && response.sessions.some((session) => session.id === current)
          ? current
          : response.sessions[0]?.id ?? ""
      );
      setMessage(`Loaded ${response.sessions.length} login sessions`);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
    }
  }

  async function revokeLoginSession() {
    if (!selectedLoginSessionId) {
      return;
    }

    setError("");

    try {
      const response = await request<{ session: LoginSessionRecord; apiKey: ApiKeyRecord }>(
        `/auth/sessions/${encodeURIComponent(selectedLoginSessionId)}`,
        {
          method: "DELETE"
        }
      );
      setLoginSessions((current) => [
        response.session,
        ...current.filter((session) => session.id !== response.session.id)
      ]);
      setApiKeyRecords((current) => [
        response.apiKey,
        ...current.filter((record) => record.id !== response.apiKey.id)
      ]);
      setMessage(`Revoked login session ${response.session.id}`);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : String(sessionError));
    }
  }

  async function loadApiKeyRotationReport() {
    setError("");

    try {
      const params = new URLSearchParams({
        dueWithinDays: apiKeyRotationDueDays || "14",
        limit: "20"
      });
      const report = await request<ApiKeyRotationReport>(`/auth/api-keys/rotation-due?${params.toString()}`);
      setApiKeyRotationReport(report);
      setMessage(`Loaded ${report.reminders.length} API key rotation reminders`);
    } catch (keyError) {
      setError(keyError instanceof Error ? keyError.message : String(keyError));
    }
  }

  async function createApiKey(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (Number(Boolean(keyUserId)) + Number(Boolean(keyServiceAccountId)) !== 1) {
      setError("Choose exactly one API-key owner: user ID or service account ID.");
      return;
    }

    try {
      const created = await request<ApiKeyCreated>("/auth/api-keys", {
        method: "POST",
        body: JSON.stringify({
          userId: keyUserId || undefined,
          serviceAccountId: keyServiceAccountId || undefined,
          name: keyName,
          scopes: keyScopes.split(",").map((scope) => scope.trim()).filter(Boolean),
          expiresAt: keyExpiresAt || undefined
        })
      });
      setApiKeyRecords((current) => [
        created.apiKey,
        ...current.filter((candidate) => candidate.id !== created.apiKey.id)
      ]);
      setSelectedApiKeyId(created.apiKey.id);
      setOneTimeSecret(created.secret);
      setMessage(`Created API key ${created.apiKey.name}`);
    } catch (keyError) {
      setError(keyError instanceof Error ? keyError.message : String(keyError));
    }
  }

  async function rotateApiKey() {
    if (!selectedApiKeyId) {
      return;
    }

    setError("");

    try {
      const rotation = await request<ApiKeyRotateResponse>(
        `/auth/api-keys/${encodeURIComponent(selectedApiKeyId)}/rotate`,
        {
          method: "POST",
          body: JSON.stringify({
            name: rotateKeyName || undefined,
            revokeOld: revokeOldKey
          })
        }
      );
      setApiKeyRecords((current) => upsertApiKeyRecords(current, rotation));
      setSelectedApiKeyId(rotation.apiKey.id);
      setOneTimeSecret(rotation.secret);
      setMessage(`Rotated API key ${rotation.rotatedFrom.secretPreview}`);
    } catch (keyError) {
      setError(keyError instanceof Error ? keyError.message : String(keyError));
    }
  }

  async function revokeApiKey() {
    if (!selectedApiKeyId) {
      return;
    }

    setError("");

    try {
      const response = await request<{ apiKey: ApiKeyRecord }>(
        `/auth/api-keys/${encodeURIComponent(selectedApiKeyId)}/revoke`,
        {
          method: "POST",
          body: JSON.stringify({})
        }
      );
      setApiKeyRecords((current) => [
        response.apiKey,
        ...current.filter((candidate) => candidate.id !== response.apiKey.id)
      ]);
      setOneTimeSecret("");
      setMessage(`Revoked API key ${response.apiKey.secretPreview}`);
    } catch (keyError) {
      setError(keyError instanceof Error ? keyError.message : String(keyError));
    }
  }

  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const score = Number.parseInt(feedbackCitationAccuracy, 10);
      const feedback = await request<ManagedQueryFeedback>("/agent/query/feedback", {
        method: "POST",
        body: JSON.stringify({
          telemetryEventId: feedbackTelemetryEventId,
          query: feedbackQuery,
          outcome: feedbackOutcome,
          factualCitationAccuracy: Number.isNaN(score) ? undefined : score
        })
      });
      setFeedbackRecords((current) => [feedback, ...current.filter((candidate) => candidate.id !== feedback.id)].slice(0, 8));
      setMessage(`Recorded feedback ${feedback.outcome}`);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : String(feedbackError));
    }
  }

  async function runDemoEval() {
    setError("");

    try {
      const report = await request<ManagedQueryEvalReport>("/agent/evals/run", {
        method: "POST",
        body: JSON.stringify({
          minimumPassRate: 1,
          tagMinimumPassRates: demoEvalTagMinimumPassRates,
          cases: demoEvalCases
        })
      });
      setEvalReport(report);
      void loadEvalRuns();
      void loadEvalSummary();
      setMessage(`Eval ${formatPercent(report.passRate)} passed`);
    } catch (evalError) {
      setError(evalError instanceof Error ? evalError.message : String(evalError));
    }
  }

  async function loadEvalRuns() {
    setError("");

    try {
      const response = await request<{ runs: ManagedQueryEvalRun[] }>("/agent/evals/runs?limit=8");
      setEvalRuns(response.runs);
      setMessage(`Loaded ${response.runs.length} eval runs`);
    } catch (evalRunError) {
      setError(evalRunError instanceof Error ? evalRunError.message : String(evalRunError));
    }
  }

  async function loadEvalSummary() {
    setError("");

    try {
      const summary = await request<ManagedQueryEvalAnalyticsSummary>("/agent/evals/summary?limit=20");
      setEvalSummary(summary);
      setMessage(`Loaded ${summary.runCount} eval run summaries`);
    } catch (evalSummaryError) {
      setError(evalSummaryError instanceof Error ? evalSummaryError.message : String(evalSummaryError));
    }
  }

  async function loadEvalSchedulePolicy() {
    setError("");

    try {
      const policy = await request<ManagedQueryEvalSchedulePolicy>("/admin/managed-query-eval-schedule-policy");
      setEvalSchedulePolicy(policy);
      setEvalScheduleEnabled(policy.enabled ? "true" : "false");
      setEvalScheduleIntervalMinutes(String(policy.intervalMinutes));
      setMessage("Loaded eval schedule policy");
    } catch (evalScheduleError) {
      setError(evalScheduleError instanceof Error ? evalScheduleError.message : String(evalScheduleError));
    }
  }

  async function saveEvalSchedulePolicy(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const intervalMinutes = Number.parseInt(evalScheduleIntervalMinutes, 10);
      const policy = await request<ManagedQueryEvalSchedulePolicy>("/admin/managed-query-eval-schedule-policy", {
        method: "PUT",
        body: JSON.stringify({
          enabled: evalScheduleEnabled === "true",
          intervalMinutes: Number.isNaN(intervalMinutes) ? undefined : intervalMinutes,
          evalInput: {
            minimumPassRate: 1,
            tagMinimumPassRates: demoEvalTagMinimumPassRates,
            cases: demoEvalCases
          }
        })
      });
      setEvalSchedulePolicy(policy);
      setEvalScheduleEnabled(policy.enabled ? "true" : "false");
      setEvalScheduleIntervalMinutes(String(policy.intervalMinutes));
      setMessage("Saved eval schedule policy");
    } catch (evalScheduleError) {
      setError(evalScheduleError instanceof Error ? evalScheduleError.message : String(evalScheduleError));
    }
  }

  async function disableEvalSchedulePolicy() {
    setError("");

    try {
      const policy = await request<ManagedQueryEvalSchedulePolicy>("/admin/managed-query-eval-schedule-policy", {
        method: "PUT",
        body: JSON.stringify({
          enabled: false
        })
      });
      setEvalSchedulePolicy(policy);
      setEvalScheduleEnabled("false");
      setEvalScheduleIntervalMinutes(String(policy.intervalMinutes));
      setMessage("Disabled eval schedule policy");
    } catch (evalScheduleError) {
      setError(evalScheduleError instanceof Error ? evalScheduleError.message : String(evalScheduleError));
    }
  }

  async function loadProviderConfigs() {
    setError("");

    try {
      const response = await request<{ providers: ModelProviderConfig[] }>("/admin/model-providers");
      setProviderConfigs(response.providers);
      setMessage(`Loaded ${response.providers.length} provider configs`);
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : String(providerError));
    }
  }

  async function loadProviderHealth() {
    setError("");

    try {
      const response = await request<{ providers: ModelProviderHealth[] }>("/admin/model-providers/health");
      setProviderHealth(response.providers);
      setMessage(`Loaded ${response.providers.length} provider health checks`);
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : String(providerError));
    }
  }

  async function saveProviderConfig(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const priority = Number.parseInt(providerForm.priority, 10);
      const metadata = compactMetadata({
        maxOutputTokens: parseOptionalNumber(providerForm.maxOutputTokens),
        temperature: parseOptionalNumber(providerForm.temperature),
        timeoutMs: parseOptionalNumber(providerForm.timeoutMs),
        maxRetries: parseOptionalNumber(providerForm.maxRetries),
        retryBackoffMs: parseOptionalNumber(providerForm.retryBackoffMs),
        inputCostPerMillionTokens: parseOptionalNumber(providerForm.inputCostPerMillionTokens),
        outputCostPerMillionTokens: parseOptionalNumber(providerForm.outputCostPerMillionTokens),
        maxEstimatedInputTokensPerQuery: parseOptionalNumber(providerForm.maxEstimatedInputTokensPerQuery),
        maxEstimatedTotalTokensPerQuery: parseOptionalNumber(providerForm.maxEstimatedTotalTokensPerQuery),
        maxEstimatedCostUsdPerQuery: parseOptionalNumber(providerForm.maxEstimatedCostUsdPerQuery)
      });
      const config = await request<ModelProviderConfig>(
        `/admin/model-providers/${encodeURIComponent(providerForm.provider)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: providerForm.enabled,
            displayName: providerForm.displayName || undefined,
            baseUrl: providerForm.baseUrl || undefined,
            apiKeyEnvVar: providerForm.apiKeyEnvVar || undefined,
            defaultModel: providerForm.defaultModel || undefined,
            availableModels: providerForm.models.split(",").map((model) => model.trim()).filter(Boolean),
            priority: Number.isNaN(priority) ? undefined : priority,
            metadata
          })
        }
      );
      setProviderConfigs((current) => [
        config,
        ...current.filter((candidate) => candidate.provider !== config.provider)
      ].sort((left, right) => left.priority - right.priority || left.provider.localeCompare(right.provider)));
      setMessage(`Saved ${config.provider} provider config`);
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : String(providerError));
    }
  }

  async function loadAuthProviderConfigs() {
    setError("");

    try {
      const response = await request<{ authProviders: AuthProviderConfig[] }>("/admin/auth-providers");
      setAuthProviderConfigs(response.authProviders);
      setMessage(`Loaded ${response.authProviders.length} auth provider configs`);
    } catch (authProviderError) {
      setError(authProviderError instanceof Error ? authProviderError.message : String(authProviderError));
    }
  }

  async function saveAuthProviderConfig(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const priority = Number.parseInt(authProviderForm.priority, 10);
      const config = await request<AuthProviderConfig>(
        `/admin/auth-providers/${encodeURIComponent(authProviderForm.provider)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            enabled: authProviderForm.enabled,
            displayName: authProviderForm.displayName || undefined,
            issuerUrl: authProviderForm.issuerUrl,
            clientId: authProviderForm.clientId,
            clientSecretEnvVar: authProviderForm.clientSecretEnvVar || undefined,
            redirectUri: authProviderForm.redirectUri || undefined,
            scopes: authProviderForm.scopes.split(",").map((scope) => scope.trim()).filter(Boolean),
            emailClaim: authProviderForm.emailClaim || undefined,
            displayNameClaim: authProviderForm.displayNameClaim || undefined,
            groupClaim: authProviderForm.groupClaim || undefined,
            roleClaim: authProviderForm.roleClaim || undefined,
	            defaultRole: authProviderForm.defaultRole,
	            autoProvisionUsers: authProviderForm.autoProvisionUsers,
	            accountLinkingMode: authProviderForm.accountLinkingMode,
	            groupSyncEnabled: authProviderForm.groupSyncEnabled,
            allowedDomains: authProviderForm.allowedDomains.split(",").map((domain) => domain.trim()).filter(Boolean),
            pkceRequired: authProviderForm.pkceRequired,
            priority: Number.isNaN(priority) ? undefined : priority
          })
        }
      );
      setAuthProviderConfigs((current) => [
        config,
        ...current.filter((candidate) => candidate.provider !== config.provider)
      ].sort((left, right) => left.priority - right.priority || left.provider.localeCompare(right.provider)));
      setMessage(`Saved ${config.provider} auth provider config`);
    } catch (authProviderError) {
      setError(authProviderError instanceof Error ? authProviderError.message : String(authProviderError));
    }
  }

  function navigatePage(route: string) {
    const nextRoute = normalizePageRoute(route);
    setCurrentPage(nextRoute);
    window.location.hash = nextRoute;
  }

  function handleNavResizeKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 32 : 16;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setNavWidth((current) => Math.max(240, current - step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setNavWidth((current) => Math.min(420, current + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      setNavWidth(240);
    } else if (event.key === "End") {
      event.preventDefault();
      setNavWidth(420);
    }
  }

  const appShellStyle = {
    "--nav": `${navWidth}px`
  } as CSSProperties;
  const operationsPage = operationsPageCopy[currentPage] ?? defaultOperationsPageCopy;
  const isOperationsLanding = currentPage === "operations";
  const activeAssetContentView = currentPage === "versions" ? "version" : assetContentView;
  const navSections: NavSectionConfig[] = [
    {
      label: "Read",
      folderLabel: "Library",
      folderIcon: "RD",
      folderRoute: "library",
      activeRoutes: ["library", "search", "asset-read"],
      count: assets.length,
      leaves: [
        { route: "library", label: "Overview", count: approvedAssets },
        { route: "search", label: "Search / query" },
        { route: "asset-read", label: "Asset read", badge: assetDetail ? { label: "live", tone: "warn" } : undefined }
      ]
    },
    {
      label: "Work",
      folderLabel: "Governance Work",
      folderIcon: "WK",
      folderRoute: "review",
      activeRoutes: ["review", "versions"],
      count: reviewDueAssets,
      leaves: [
        { route: "review", label: "Review queue", badge: reviewQueue ? { label: reviewQueue.assets.length, tone: "warn" } : undefined },
        { route: "versions", label: "Version compare" }
      ]
    },
    {
      label: "Operate",
      folderLabel: "Control Plane",
      folderIcon: "OP",
      folderRoute: "operations",
      activeRoutes: [...operationsRouteValues],
      count: 7,
      leaves: [
        { route: "operations", label: "Operations" },
        { route: "access", label: "Access" },
        { route: "providers", label: "Providers" },
        { route: "policies", label: "Policies" },
        { route: "telemetry", label: "Telemetry" },
        { route: "approvals", label: "Approvals" },
        { route: "exports", label: "Exports" }
      ]
    }
  ];

  return (
    <div
      className={`app-shell ${isAuthenticated ? "" : "auth-shell"} ${isResizingNav ? "is-resizing-nav" : ""}`}
      data-density={density}
      style={appShellStyle}
    >
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="brand">
          <span className="mark">AC</span>
          <span>Agentic CMS</span>
        </div>
        {isAuthenticated ? (
          <div className="topbar-main">
            <button className="command" type="button" onClick={() => navigatePage("search")}>
              <span className="small-icon">/</span>
              <span>Search assets, pages, commands</span>
              <span className="kbd">Cmd K</span>
            </button>
            <div className="health"><span className={`health-dot ${health === "ok" ? "ok" : "bad"}`}></span><span>API {health}</span></div>
            <button
              className="density"
              type="button"
              onClick={() => setDensity((current) => current === "comfortable" ? "compact" : "comfortable")}
            >
              {density === "comfortable" ? "Comfortable" : "Compact"}
            </button>
            <div className="identity"><span className="avatar">{displayInitials}</span><span>{displayIdentity}</span></div>
          </div>
        ) : null}
      </header>

      {isAuthenticated ? (
        <>
      <nav className="side-nav tree-nav" aria-label="Main pages" id="page-nav">
        {navSections.map((section) => (
          <div className="nav-group" key={section.label}>
            <p className="nav-label">{section.label}</p>
            <div className="nav-tree">
              <button
                className={`nav-folder is-open ${section.activeRoutes.includes(currentPage) ? "is-active-ancestor" : ""}`}
                type="button"
                aria-expanded="true"
                onClick={() => navigatePage(section.folderRoute)}
              >
                <span className="twisty">v</span>
                <span className="folder-glyph">{section.folderIcon}</span>
                <span className="nav-text">{section.folderLabel}</span>
                {section.count === undefined ? null : <span className="nav-count">{section.count}</span>}
              </button>
              <div className="nav-branch">
                {section.leaves.map((leaf) => {
                  const hasIcon = Boolean(leaf.showIcon && leaf.icon);

                  return (
                    <button
                      key={leaf.route}
                      className={`nav-link nav-leaf ${hasIcon ? "has-icon" : "is-iconless"} ${currentPage === leaf.route ? "active" : ""}`}
                      type="button"
                      aria-current={currentPage === leaf.route ? "page" : undefined}
                      onClick={() => navigatePage(leaf.route)}
                    >
                      {hasIcon ? <span className="nav-icon">{leaf.icon}</span> : null}
                      <span className="nav-text">{leaf.label}</span>
                      {leaf.count === undefined ? null : <span className="nav-count">{leaf.count}</span>}
                      {leaf.badge ? <span className={`nav-badge ${leaf.badge.tone ?? ""}`}>{leaf.badge.label}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
        <div
          className="nav-resizer"
          role="separator"
          aria-label="Resize page navigation"
          aria-orientation="vertical"
          aria-controls="page-nav main"
          aria-valuemin={240}
          aria-valuemax={420}
          aria-valuenow={navWidth}
          tabIndex={0}
          onKeyDown={handleNavResizeKey}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsResizingNav(true);
          }}
        ></div>
      </nav>

      <main className="main" id="main">
        <section className="control-bar" aria-label="Connection">
        <form className="connection-grid" onSubmit={(event) => event.preventDefault()}>
          <label>
            API URL
            <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} autoComplete="url" />
          </label>
          <label>
            API key
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" />
          </label>
          <button type="button" onClick={() => void refresh()}>Refresh</button>
          <button type="button" onClick={() => void logout()}>Sign out</button>
        </form>
        </section>

        {message ? <p className="message">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}

      <section className={`page ${["library", "asset-read", "versions"].includes(currentPage) ? "active" : ""}`} data-page="library">
        <div className="page-header">
          <div>
            <p className="eyebrow">{currentPage === "versions" ? "Governance work" : "Reader library"}</p>
            <h1>
              {currentPage === "asset-read"
                ? assetDetail?.asset.title ?? "Asset read"
                : currentPage === "versions"
                  ? "Version Compare"
                  : "Governed Asset Library"}
            </h1>
            <p className="lede">
              {currentPage === "versions"
                ? "Inspect current and selected asset versions before restoring, publishing, or closing review work."
                : "Browse governed policies, guardrails, skills, templates, SOPs, playbooks, and human documents with trust metadata visible at a glance."}
            </p>
          </div>
          <div className="actions">
            <button type="button" onClick={() => void refresh()}>Refresh</button>
            <button type="button" onClick={() => void generateExport()}>Export</button>
          </div>
        </div>
        <div className="grid four">
          <div className="metric"><div className="metric-value">{assets.length}</div><div className="metric-label">Visible assets</div><div className="metric-note">Server-filtered for the current principal.</div></div>
          <div className="metric"><div className="metric-value">{approvedAssets}</div><div className="metric-label">Approved current</div><div className="metric-note">Approved assets loaded in the browser.</div></div>
          <div className="metric"><div className="metric-value">{reviewDueAssets}</div><div className="metric-label">Need governance</div><div className="metric-note">Draft, stale, reviewing, or non-active.</div></div>
          <div className="metric"><div className="metric-value">{publicDemoAssets}</div><div className="metric-label">Public demo</div><div className="metric-note">Anonymous-safe when active and approved.</div></div>
        </div>
        <section className="workspace">
        <section className="asset-table" aria-labelledby="assets-title">
          <div className="section-heading">
            <h2 id="assets-title">Assets</h2>
            <button type="button" onClick={() => void generateExport()}>Export</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Stable ID</th>
                  <th>Type</th>
                  <th>Lifecycle</th>
                  <th>Status</th>
                  <th>Sensitivity</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr
                    key={asset.id}
                    className={asset.stableId === selectedAsset?.stableId ? "selected" : ""}
                    onClick={() => setSelectedStableId(asset.stableId)}
                  >
                    <td>{asset.stableId}</td>
                    <td>{asset.type}</td>
                    <td>{asset.lifecycleState}</td>
                    <td>{asset.status}</td>
                    <td>{asset.sensitivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="detail-pane" aria-labelledby="detail-title">
          <h2 id="detail-title">{assetDetail?.asset.title ?? "Asset detail"}</h2>
          {assetDetail ? (
            <>
              <dl className="metadata-grid">
                <div><dt>Stable ID</dt><dd>{assetDetail.asset.stableId}</dd></div>
                <div><dt>Lifecycle</dt><dd>{assetDetail.asset.lifecycleState}</dd></div>
                <div><dt>Status</dt><dd>{assetDetail.asset.status}</dd></div>
                <div><dt>Audience</dt><dd>{assetDetail.asset.audience.join(", ")}</dd></div>
                <div><dt>Review</dt><dd>{assetDetail.asset.reviewDueAt}</dd></div>
                <div><dt>Current version</dt><dd>{currentVersion ? `v${currentVersion.versionNumber}` : "none"}</dd></div>
                <div><dt>Exports</dt><dd>{assetDetail.asset.allowedExports.join(", ") || "none"}</dd></div>
              </dl>
              <div className="workflow-panel">
                <div className="section-heading">
                  <h3>Release control</h3>
                  <div className="button-row">
                    <button type="button" onClick={() => void completeAssetReview()}>Review</button>
                    <button type="button" onClick={() => void publishAsset()}>Publish</button>
                    <button
                      type="button"
                      onClick={() => void restoreVersion()}
                      disabled={!versionSnapshot || selectedVersionIsCurrent}
                    >
                      Restore
                    </button>
                  </div>
                </div>
                <div className="workflow-grid">
                  <label>
                    Review date
                    <input value={publishReviewDueAt} onChange={(event) => setPublishReviewDueAt(event.target.value)} />
                  </label>
                  <label>
                    Version
                    <select
                      value={selectedVersionNumber}
                      onChange={(event) => {
                        setSelectedVersionNumber(event.target.value);
                        setVersionSnapshot(null);
                      }}
                    >
                      {assetDetail.versions.map((version) => (
                        <option key={version.id} value={version.versionNumber}>
                          v{version.versionNumber}{version.id === assetDetail.asset.currentVersionId ? " current" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide-field">
                    Change note
                    <input value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} />
                  </label>
                  <button type="button" onClick={() => void loadVersionSnapshot()}>Inspect</button>
                </div>
              </div>
              <div className="tab-bar" role="tablist" aria-label="Asset detail views">
                {([
                  ["human", "Human document"],
                  ["instruction", "Agent instruction"],
                  ["version", "Version compare"],
                  ["raw", "Raw metadata"]
                ] as const).map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    className={activeAssetContentView === view ? "active" : ""}
                    role="tab"
                    aria-selected={activeAssetContentView === view}
                    onClick={() => setAssetContentView(view)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {activeAssetContentView === "human" ? (
                <div className="content-block asset-content-view" role="tabpanel">
                  <div className="section-heading">
                    <h3>Human document</h3>
                    <span className="state-pill">{assetDetail.humanDocuments.length} document{assetDetail.humanDocuments.length === 1 ? "" : "s"}</span>
                  </div>
                  <pre>{currentHumanBody || "No human document"}</pre>
                </div>
              ) : null}
              {activeAssetContentView === "instruction" ? (
                <div className="content-block asset-content-view" role="tabpanel">
                  <div className="section-heading">
                    <h3>Agent instruction</h3>
                    <span className="state-pill">{assetDetail.instructionObjects.length} object{assetDetail.instructionObjects.length === 1 ? "" : "s"}</span>
                  </div>
                  <pre>{currentInstructionBody || "No instruction object"}</pre>
                </div>
              ) : null}
              {activeAssetContentView === "version" ? (
                <div className="compare-grid" role="tabpanel">
                  <div className="content-block compare-block">
                    <h3>Current instruction</h3>
                    <pre>{currentInstructionBody || "No instruction object"}</pre>
                  </div>
                  <div className="content-block compare-block">
                    <h3>{versionSnapshot ? `Selected v${versionSnapshot.version.versionNumber}` : "Selected version"}</h3>
                    <pre>{versionSnapshot ? selectedInstructionBody || "No instruction object" : "No version inspected"}</pre>
                  </div>
                  <div className="content-block compare-block">
                    <h3>Current human document</h3>
                    <pre>{currentHumanBody || "No human document"}</pre>
                  </div>
                  <div className="content-block compare-block">
                    <h3>{versionSnapshot ? `Selected v${versionSnapshot.version.versionNumber}` : "Selected version"}</h3>
                    <pre>{versionSnapshot ? selectedHumanBody || "No human document" : "No version inspected"}</pre>
                  </div>
                </div>
              ) : null}
              {activeAssetContentView === "raw" ? (
                <div className="content-block asset-content-view" role="tabpanel">
                  <h3>Raw metadata</h3>
                  <pre>{JSON.stringify({
                    asset: assetDetail.asset,
                    currentVersion,
                    selectedVersion: versionSnapshot?.version ?? null,
                    instructionObjectCount: assetDetail.instructionObjects.length,
                    humanDocumentCount: assetDetail.humanDocuments.length
                  }, null, 2)}</pre>
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty">No asset selected.</p>
          )}
        </section>
      </section>

      </section>

      <section className={`page ${currentPage === "search" ? "active" : ""}`} data-page="search">
        <div className="page-header">
          <div>
            <p className="eyebrow">Grounded retrieval</p>
            <h1>Search and Managed Query</h1>
            <p className="lede">Test deterministic retrieval and provider-routed answers with citations, cache status, cost metadata, and denied-result visibility.</p>
          </div>
          <div className="actions">
            <button type="button" onClick={() => void runManagedQuery()}>Run managed query</button>
          </div>
        </div>
        <section className="lower-grid search-layout">
        <section className="search-pane" aria-labelledby="search-title">
          <div className="section-heading">
            <h2 id="search-title">Search</h2>
            <form onSubmit={(event) => void runSearch(event)}>
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              <button type="submit">Run</button>
            </form>
          </div>
          <div className="result-list">
            {searchResponse?.results.map((result) => (
              <article key={result.chunkId}>
                <div className="result-title">
                  <strong>{result.asset.stableId}</strong>
                  <span>{result.citation.sourceKind}</span>
                </div>
                <p>{result.citation.snippet}</p>
              </article>
            )) ?? <p className="empty">No search run.</p>}
          </div>
        </section>

        <section className="ops-pane" aria-labelledby="managed-query-title">
          <div className="section-heading">
            <h2 id="managed-query-title">Managed query</h2>
            <form className="ops-form" onSubmit={(event) => void runManagedQuery(event)}>
              <label>
                Query
                <input value={managedQueryText} onChange={(event) => setManagedQueryText(event.target.value)} />
              </label>
              <label>
                Mode
                <select
                  value={managedQueryMode}
                  onChange={(event) =>
                    setManagedQueryMode(event.target.value as "deterministic-retrieval" | "provider-routed")}
                >
                  <option value="deterministic-retrieval">deterministic-retrieval</option>
                  <option value="provider-routed">provider-routed</option>
                </select>
              </label>
              <label>
                Provider
                <select
                  value={managedQueryProvider}
                  onChange={(event) => setManagedQueryProvider(event.target.value as ModelProvider)}
                  disabled={managedQueryMode !== "provider-routed"}
                >
                  <option value="openai">openai</option>
                  <option value="anthropic">anthropic</option>
                  <option value="openrouter">openrouter</option>
                </select>
              </label>
              <label>
                Model
                <input
                  value={managedQueryModel}
                  onChange={(event) => setManagedQueryModel(event.target.value)}
                  disabled={managedQueryMode !== "provider-routed"}
                />
              </label>
              <label>
                <span>Cache</span>
                <input
                  type="checkbox"
                  checked={managedQueryCacheEnabled}
                  onChange={(event) => setManagedQueryCacheEnabled(event.target.checked)}
                  disabled={managedQueryMode !== "provider-routed"}
                />
              </label>
              <button type="submit" disabled={!managedQueryText}>Run managed query</button>
            </form>
          </div>
          <div className="tab-bar" role="tablist" aria-label="Managed query result views">
            {([
              ["answer", "Answer"],
              ["evidence", "Evidence"],
              ["diagnostics", "Diagnostics"]
            ] as const).map(([view, label]) => (
              <button
                key={view}
                type="button"
                className={managedQueryView === view ? "active" : ""}
                role="tab"
                aria-selected={managedQueryView === view}
                onClick={() => setManagedQueryView(view)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="result-list">
            {managedQueryResponse ? (
              <>
                <dl className="metadata-grid compact query-summary">
                  <div><dt>Generation</dt><dd>{managedQueryResponse.generation.status}</dd></div>
                  <div><dt>Citations</dt><dd>{managedQueryResponse.citations.length}</dd></div>
                  <div><dt>Denied</dt><dd>{managedQueryResponse.checks.deniedCount}</dd></div>
                  <div><dt>Cost</dt><dd>{formatCurrency(managedQueryResponse.generation.usage.estimatedCostUsd)}</dd></div>
                </dl>
                {managedQueryView === "answer" ? (
                  <div className="content-block answer-card" role="tabpanel">
                    <div className="section-heading">
                      <h3>Grounded answer</h3>
                      <span className={`state-pill ${managedQueryResponse.checks.deniedCount ? "warn" : "ok"}`}>
                        {managedQueryResponse.checks.deniedCount ? `${managedQueryResponse.checks.deniedCount} denied` : "all visible"}
                      </span>
                    </div>
                    <p>{managedQueryResponse.answer}</p>
                  </div>
                ) : null}
                {managedQueryView === "evidence" ? (
                  <div className="evidence-list" role="tabpanel">
                    {managedQueryResponse.citations.length ? managedQueryResponse.citations.map((citation) => (
                      <article key={`${citation.assetId}:${citation.chunkId}`}>
                        <div className="result-title">
                          <strong>{citation.stableId}</strong>
                          <span>{citation.sourceKind}</span>
                        </div>
                        <p>{citation.snippet}</p>
                      </article>
                    )) : <p className="empty">No citations returned.</p>}
                  </div>
                ) : null}
                {managedQueryView === "diagnostics" ? (
                  <div className="content-block diagnostics-card" role="tabpanel">
                    <dl className="metadata-grid compact">
                      <div><dt>Mode</dt><dd>{managedQueryResponse.mode}</dd></div>
                      <div><dt>Provider</dt><dd>{managedQueryResponse.generation.provider ?? "n/a"}</dd></div>
                      <div><dt>Model</dt><dd>{managedQueryResponse.generation.model ?? "n/a"}</dd></div>
                      <div><dt>Tokens</dt><dd>{formatMetric(managedQueryResponse.generation.usage.totalTokens)}</dd></div>
                      <div><dt>Cache</dt><dd>{managedQueryResponse.cache.status}</dd></div>
                      <div><dt>Telemetry</dt><dd>{managedQueryResponse.telemetryEventId ?? "n/a"}</dd></div>
                    </dl>
                    {managedQueryResponse.generation.attempts.length ? (
                      <p>
                        <strong>Attempts</strong>{" "}
                        {managedQueryResponse.generation.attempts
                          .map((attempt) => `${attempt.provider}:${attempt.status}${attempt.reason ? `(${attempt.reason})` : ""}`)
                          .join(" -> ")}
                      </p>
                    ) : null}
                    {managedQueryResponse.cache.reason ? (
                      <p><strong>Cache</strong> {managedQueryResponse.cache.reason}</p>
                    ) : null}
                    {managedQueryResponse.warnings.length ? (
                      <p><strong>Warnings</strong> {managedQueryResponse.warnings.join("\n")}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : <p className="empty">No managed query run.</p>}
          </div>
        </section>

        </section>
      </section>

      <section className={`page ${visibleOperationsPage ? "active" : ""}`} data-page="operations">
        <div className="page-header">
          <div>
            <p className="eyebrow">{operationsPage.eyebrow}</p>
            <h1>{operationsPage.title}</h1>
            <p className="lede">{operationsPage.lede}</p>
          </div>
          <div className="actions">
            {currentPage === "exports" ? (
              <button type="button" onClick={() => void generateExport()}>Generate export</button>
            ) : null}
            {currentPage === "review" ? (
              <button type="button" onClick={() => void loadReviewQueue()}>Review queue</button>
            ) : null}
            {currentPage === "telemetry" ? (
              <button type="button" onClick={() => void loadTelemetrySummary()}>Load summary</button>
            ) : null}
          </div>
        </div>
        <section className="operations-grid">
        <section className="ops-pane operations-shell" aria-labelledby="ops-title">
          <div className={routePanelClass(currentPage, ["operations"], "operations-overview")}>
            <div className="overview-copy">
              <p className="eyebrow">Operational surface</p>
              <h2 id={isOperationsLanding ? "ops-title" : undefined}>Control plane routes</h2>
              <p>Each workspace keeps its own forms and load actions visible without carrying every admin panel into every route.</p>
            </div>
            <div className="summary-strip" aria-label="Control plane route summaries">
              <button className="summary-link" type="button" onClick={() => navigatePage("review")}>
                <span>Reviews</span>
                <strong>{reviewQueue?.assets.length ?? reviewDueAssets}</strong>
                <em>needs governance</em>
              </button>
              <button className="summary-link" type="button" onClick={() => navigatePage("access")}>
                <span>Access</span>
                <strong>{users.length + serviceAccounts.length}</strong>
                <em>principals loaded</em>
              </button>
              <button className="summary-link" type="button" onClick={() => navigatePage("providers")}>
                <span>Providers</span>
                <strong>{providerConfigs.length + authProviderConfigs.length}</strong>
                <em>configs loaded</em>
              </button>
              <button className="summary-link" type="button" onClick={() => navigatePage("policies")}>
                <span>Policies</span>
                <strong>{managedQueryPolicy || retrievalRankingPolicy ? "loaded" : "setup"}</strong>
                <em>guardrails</em>
              </button>
              <button className="summary-link" type="button" onClick={() => navigatePage("telemetry")}>
                <span>Telemetry</span>
                <strong>{telemetrySummary?.retrieval.eventCount ?? telemetryEvents.length}</strong>
                <em>retrieval events</em>
              </button>
              <button className="summary-link" type="button" onClick={() => navigatePage("approvals")}>
                <span>Approvals</span>
                <strong>{agentActions.length}</strong>
                <em>action requests</em>
              </button>
              <button className="summary-link" type="button" onClick={() => navigatePage("exports")}>
                <span>Exports</span>
                <strong>{exportPackage?.assetCount ?? assets.length}</strong>
                <em>asset package</em>
              </button>
            </div>
          </div>
          {isOperationsLanding ? null : (
          <div className="section-heading">
            <h2 id="ops-title">Workspace actions</h2>
            <div className="button-row">
              {currentPage === "review" ? (
                <button type="button" onClick={() => void loadReviewQueue()}>Review queue</button>
              ) : null}
              {currentPage === "telemetry" ? (
                <>
                  <button type="button" onClick={() => void loadTelemetrySummary()}>Summary</button>
                  <button type="button" onClick={() => void loadTelemetryRetentionPolicy()}>Retention</button>
                  <button type="button" onClick={() => void loadTelemetry()}>Telemetry</button>
                  <button type="button" onClick={() => void loadAuditEvents()}>Audit</button>
                  <button type="button" onClick={() => void loadFeedback()}>Feedback</button>
                  <button type="button" onClick={() => void runDemoEval()}>Eval</button>
                  <button type="button" onClick={() => void loadEvalRuns()}>Eval runs</button>
                  <button type="button" onClick={() => void loadEvalSummary()}>Eval summary</button>
                </>
              ) : null}
              {currentPage === "policies" ? (
                <>
                  <button type="button" onClick={() => void loadManagedQueryPolicy()}>Query policy</button>
                  <button type="button" onClick={() => void loadRetrievalRankingPolicy()}>Ranking policy</button>
                  <button type="button" onClick={() => void loadManagedQueryCache()}>Cache</button>
                  <button type="button" onClick={() => void loadManagedQueryCachePolicy()}>Cache policy</button>
                  <button type="button" onClick={() => void loadManagedQueryRetentionPolicy()}>Query retention</button>
                  <button
                    type="button"
                    onClick={() => {
                      void loadActionExecutionPolicy();
                      void loadAgentActions();
                    }}
                  >
                    Actions
                  </button>
                  <button type="button" onClick={() => void loadSecretReferencePolicy()}>Secrets</button>
                  <button type="button" onClick={() => void loadPiiRedactionPolicy()}>PII policy</button>
                </>
              ) : null}
              {currentPage === "approvals" ? (
                <button
                  type="button"
                  onClick={() => {
                    void loadActionExecutionPolicy();
                    void loadAgentActions();
                  }}
                >
                  Actions
                </button>
              ) : null}
              {currentPage === "access" ? (
                <>
                  <button type="button" onClick={() => void loadUsers()}>Users</button>
                  <button type="button" onClick={() => void loadServiceAccounts()}>Services</button>
                  <button type="button" onClick={() => void loadServiceAccountPolicy()}>Service policy</button>
                  <button type="button" onClick={() => void loadGroups()}>Groups</button>
                  <button type="button" onClick={() => void loadApiKeys()}>Keys</button>
                  <button type="button" onClick={() => void loadLoginSessions()}>Sessions</button>
                  <button type="button" onClick={() => void loadApiKeyRotationReport()}>Key rotation</button>
                </>
              ) : null}
              {currentPage === "providers" ? (
                <>
                  <button type="button" onClick={() => void loadProviderConfigs()}>Providers</button>
                  <button type="button" onClick={() => void loadProviderHealth()}>Provider health</button>
                  <button type="button" onClick={() => void loadAuthProviderConfigs()}>Auth</button>
                </>
              ) : null}
              {currentPage === "exports" ? (
                <button type="button" onClick={() => void generateExport()}>Export</button>
              ) : null}
            </div>
          </div>
          )}
          <div className={routePanelClass(currentPage, ["review"])}>
            <h3>Review queue</h3>
            {reviewQueue ? (
              <>
                <p>
                  <strong>{reviewQueue.assets.length}</strong> items as of {reviewQueue.asOf}
                </p>
                <div className="table-scroll compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Stable ID</th>
                        <th>Status</th>
                        <th>Lifecycle</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewQueue.assets.map((asset) => (
                        <tr key={asset.id} onClick={() => setSelectedStableId(asset.stableId)}>
                          <td>{asset.stableId}</td>
                          <td>{asset.status}</td>
                          <td>{asset.lifecycleState}</td>
                          <td>{asset.reviewDueAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p className="empty">No review queue loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["telemetry"])}>
            <h3>Telemetry summary</h3>
            {telemetrySummary ? (
              <>
                <dl className="metadata-grid compact analytics-grid">
                  <div><dt>Retrieval</dt><dd>{telemetrySummary.retrieval.eventCount}</dd></div>
                  <div><dt>Denied</dt><dd>{telemetrySummary.retrieval.deniedCount}</dd></div>
                  <div><dt>Latency</dt><dd>{formatMetric(telemetrySummary.retrieval.averageLatencyMs, "ms")}</dd></div>
                  <div><dt>Redacted</dt><dd>{telemetrySummary.retrieval.redactedQueryCount}</dd></div>
                  <div><dt>Audit</dt><dd>{telemetrySummary.audit.eventCount}</dd></div>
                  <div><dt>Feedback</dt><dd>{telemetrySummary.feedback.recordCount}</dd></div>
                  <div><dt>Model gen</dt><dd>{telemetrySummary.providerGeneration.eventCount}</dd></div>
                  <div><dt>Cache hits</dt><dd>{telemetrySummary.providerGeneration.cacheHitCount}</dd></div>
                  <div><dt>Tokens</dt><dd>{telemetrySummary.providerGeneration.totalTokens}</dd></div>
                  <div><dt>Assets</dt><dd>{telemetrySummary.assets.sampleCount}</dd></div>
                  <div><dt>Generated</dt><dd>{new Date(telemetrySummary.generatedAt).toLocaleTimeString()}</dd></div>
                </dl>
                <p><strong>Surfaces</strong> {formatCounts(telemetrySummary.retrieval.bySurface)}</p>
                <p><strong>Query kinds</strong> {formatCounts(telemetrySummary.retrieval.byQueryKind)}</p>
                <p><strong>Audit outcomes</strong> {formatCounts(telemetrySummary.audit.byOutcome)}</p>
                <p><strong>Feedback</strong> {formatCounts(telemetrySummary.feedback.byOutcome)}</p>
                <p><strong>Model statuses</strong> {formatCounts(telemetrySummary.providerGeneration.byStatus)}</p>
                <p><strong>Cache statuses</strong> {formatCounts(telemetrySummary.providerGeneration.byCacheStatus)}</p>
                <p><strong>Model providers</strong> {formatCounts(telemetrySummary.providerGeneration.byProvider)}</p>
                <p><strong>Estimated model cost</strong> {formatCurrency(telemetrySummary.providerGeneration.estimatedCostUsd)}</p>
                <p><strong>Sensitivity</strong> {formatCounts(telemetrySummary.assets.bySensitivity)}</p>
              </>
            ) : <p className="empty">No summary loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["telemetry"])}>
            <h3>Telemetry retention</h3>
            <form className="ops-form" onSubmit={(event) => void saveTelemetryRetentionPolicy(event)}>
              <label>
                Retrieval days
                <input
                  value={retentionRetrievalDays}
                  onChange={(event) => setRetentionRetrievalDays(event.target.value)}
                />
              </label>
              <label>
                Audit days
                <input value={retentionAuditDays} onChange={(event) => setRetentionAuditDays(event.target.value)} />
              </label>
              <label>
                Feedback days
                <input
                  value={retentionFeedbackDays}
                  onChange={(event) => setRetentionFeedbackDays(event.target.value)}
                />
              </label>
              <button type="submit">Save retention</button>
              <button type="button" onClick={() => void purgeTelemetryRetention(true)}>Dry run purge</button>
              <button type="button" onClick={() => void purgeTelemetryRetention(false)}>Execute purge</button>
            </form>
            {telemetryRetentionPolicy ? (
              <p>
                <strong>{telemetryRetentionPolicy.source}</strong>
                {" "}
                retrieval {formatRetentionDays(telemetryRetentionPolicy.retrievalEventRetentionDays)},
                audit {formatRetentionDays(telemetryRetentionPolicy.auditEventRetentionDays)},
                feedback {formatRetentionDays(telemetryRetentionPolicy.feedbackRetentionDays)}
              </p>
            ) : <p className="empty">No retention policy loaded.</p>}
            {telemetryRetentionPurgeResult ? (
              <p>
                <strong>{telemetryRetentionPurgeResult.dryRun ? "dry-run" : "executed"}</strong>
                {" "}
                retrieval {telemetryRetentionPurgeResult.retrievalEvents.deletedCount},
                audit {telemetryRetentionPurgeResult.auditEvents.deletedCount},
                feedback {telemetryRetentionPurgeResult.managedQueryFeedback.deletedCount}
              </p>
            ) : null}
          </div>
          <div className={routePanelClass(currentPage, ["policies"])}>
            <h3>Managed query policy</h3>
            <form className="ops-form" onSubmit={(event) => void saveManagedQueryPolicy(event)}>
              <label>
                Default mode
                <select
                  value={queryPolicyDefaultMode}
                  onChange={(event) => setQueryPolicyDefaultMode(event.target.value as ManagedQueryMode)}
                >
                  <option value="deterministic-retrieval">deterministic-retrieval</option>
                  <option value="provider-routed">provider-routed</option>
                </select>
              </label>
              <label>
                Allowed modes
                <input
                  value={queryPolicyAllowedModes}
                  onChange={(event) => setQueryPolicyAllowedModes(event.target.value)}
                />
              </label>
              <label>
                Minimum citations
                <input
                  value={queryPolicyMinimumCitationCount}
                  onChange={(event) => setQueryPolicyMinimumCitationCount(event.target.value)}
                />
              </label>
              <label>
                Require grounded
                <select
                  value={queryPolicyRequireGrounded}
                  onChange={(event) => setQueryPolicyRequireGrounded(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </label>
              <button type="submit">Save query policy</button>
              <button type="button" onClick={() => void loadManagedQueryPolicy()}>Load policy</button>
            </form>
            {managedQueryPolicy ? (
              <p>
                <strong>{managedQueryPolicy.source}</strong>
                {" "}
                default {managedQueryPolicy.defaultMode}, allowed {formatList(managedQueryPolicy.allowedModes)},
                min citations {managedQueryPolicy.minimumCitationCount}, grounded{" "}
                {String(managedQueryPolicy.requireGrounded)}
              </p>
            ) : <p className="empty">No managed query policy loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["policies"])}>
            <h3>Retrieval ranking policy</h3>
            <form className="ops-form" onSubmit={(event) => void saveRetrievalRankingPolicy(event)}>
              <label>
                Agent instruction weight
                <input
                  value={rankingPolicyAgentInstructionWeight}
                  onChange={(event) => setRankingPolicyAgentInstructionWeight(event.target.value)}
                />
              </label>
              <label>
                Asset summary weight
                <input
                  value={rankingPolicyAssetSummaryWeight}
                  onChange={(event) => setRankingPolicyAssetSummaryWeight(event.target.value)}
                />
              </label>
              <label>
                Human document weight
                <input
                  value={rankingPolicyHumanDocumentWeight}
                  onChange={(event) => setRankingPolicyHumanDocumentWeight(event.target.value)}
                />
              </label>
              <label>
                Exact phrase boost
                <input
                  value={rankingPolicyExactPhraseBoost}
                  onChange={(event) => setRankingPolicyExactPhraseBoost(event.target.value)}
                />
              </label>
              <button type="submit">Save ranking policy</button>
              <button type="button" onClick={() => void loadRetrievalRankingPolicy()}>Load policy</button>
            </form>
            {retrievalRankingPolicy ? (
              <p>
                <strong>{retrievalRankingPolicy.source}</strong>
                {" "}
                instruction {retrievalRankingPolicy.agentInstructionWeight}, summary{" "}
                {retrievalRankingPolicy.assetSummaryWeight}, human {retrievalRankingPolicy.humanDocumentWeight},
                exact phrase +{retrievalRankingPolicy.exactPhraseBoost}
              </p>
            ) : <p className="empty">No retrieval ranking policy loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["policies", "telemetry"])}>
            <h3>Eval schedule</h3>
            <form className="ops-form" onSubmit={(event) => void saveEvalSchedulePolicy(event)}>
              <label>
                Enabled
                <select
                  value={evalScheduleEnabled}
                  onChange={(event) => setEvalScheduleEnabled(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </label>
              <label>
                Interval minutes
                <input
                  value={evalScheduleIntervalMinutes}
                  onChange={(event) => setEvalScheduleIntervalMinutes(event.target.value)}
                />
              </label>
              <button type="submit">Save demo schedule</button>
              <button type="button" onClick={() => void loadEvalSchedulePolicy()}>Load policy</button>
              <button type="button" onClick={() => void disableEvalSchedulePolicy()}>Disable</button>
            </form>
            {evalSchedulePolicy ? (
              <p>
                <strong>{evalSchedulePolicy.source}</strong>
                {" "}
                enabled {String(evalSchedulePolicy.enabled)}, interval {evalSchedulePolicy.intervalMinutes}m,
                cases {evalSchedulePolicy.evalInput?.cases.length ?? 0}, last {evalSchedulePolicy.lastStatus}
                {evalSchedulePolicy.lastRunAt ? ` at ${new Date(evalSchedulePolicy.lastRunAt).toLocaleString()}` : ""}
              </p>
            ) : <p className="empty">No eval schedule policy loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["approvals", "policies"])}>
            <h3>Action execution</h3>
            <form className="ops-form" onSubmit={(event) => void saveActionExecutionPolicy(event)}>
              <label>
                Enabled
                <select
                  value={actionPolicyEnabled}
                  onChange={(event) => setActionPolicyEnabled(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </label>
              <label>
                Allowed types
                <input
                  value={actionPolicyAllowedTypes}
                  onChange={(event) => setActionPolicyAllowedTypes(event.target.value)}
                />
              </label>
              <label>
                Require approval
                <select
                  value={actionPolicyRequireApproval}
                  onChange={(event) => setActionPolicyRequireApproval(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <label>
                Dry-run default
                <select
                  value={actionPolicyDryRunDefault}
                  onChange={(event) => setActionPolicyDryRunDefault(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <label>
                Kill switch
                <select
                  value={actionPolicyKillSwitch}
                  onChange={(event) => setActionPolicyKillSwitch(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </label>
              <label>
                Requests / hour
                <input
                  value={actionPolicyMaxRequestsPerHour}
                  onChange={(event) => setActionPolicyMaxRequestsPerHour(event.target.value)}
                />
              </label>
              <label>
                Approval expiry minutes
                <input
                  value={actionPolicyApprovalExpiresInMinutes}
                  onChange={(event) => setActionPolicyApprovalExpiresInMinutes(event.target.value)}
                />
              </label>
              <button type="submit">Save action policy</button>
              <button type="button" onClick={() => void loadActionExecutionPolicy()}>Load policy</button>
            </form>
            {actionExecutionPolicy ? (
              <p>
                <strong>{actionExecutionPolicy.source}</strong>
                {" "}
                enabled {String(actionExecutionPolicy.enabled)}, allowed{" "}
                {formatList(actionExecutionPolicy.allowedActionTypes)}, approval{" "}
                {String(actionExecutionPolicy.requireApproval)}, dry-run{" "}
                {String(actionExecutionPolicy.dryRunDefault)}, kill switch{" "}
                {String(actionExecutionPolicy.killSwitch)}, rate {actionExecutionPolicy.maxRequestsPerHour}/h,
                approval expiry {actionExecutionPolicy.approvalExpiresInMinutes}m
              </p>
            ) : <p className="empty">No action execution policy loaded.</p>}
            <form className="ops-form" onSubmit={(event) => void executeAgentAction(event)}>
              <label>
                Type
                <select
                  value={actionType}
                  onChange={(event) => setActionType(event.target.value as AgentActionType)}
                >
                  {actionTypes.map((candidate) => (
                    <option key={candidate} value={candidate}>{candidate}</option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} />
              </label>
              <label>
                Description
                <input value={actionDescription} onChange={(event) => setActionDescription(event.target.value)} />
              </label>
              <label>
                Target
                <input value={actionTarget} onChange={(event) => setActionTarget(event.target.value)} />
              </label>
              <label>
                Idempotency key
                <input value={actionIdempotencyKey} onChange={(event) => setActionIdempotencyKey(event.target.value)} />
              </label>
              <label>
                Dry run
                <select value={actionDryRun} onChange={(event) => setActionDryRun(event.target.value as "true" | "false")}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <button type="submit" disabled={!actionTitle}>Request action</button>
              <button type="button" onClick={() => void loadAgentActions()}>Load requests</button>
            </form>
            {agentActions.length ? agentActions.map((action) => {
              const decisionReason = actionDecisionReasons[action.id] ?? "";
              const stagedDecision = pendingActionDecision?.actionId === action.id ? pendingActionDecision.decision : null;

              return (
                <article className="action-card" key={action.id}>
                  <div className="result-title">
                    <strong>{action.actionType}: {action.title}</strong>
                    <span>{action.status}</span>
                  </div>
                  <p>
                    {action.reason ? `${action.reason} ` : ""}
                    {action.idempotencyKey ? `key ${action.idempotencyKey} ` : ""}
                    {action.approvalExpiresAt ? `expires ${new Date(action.approvalExpiresAt).toLocaleString()} ` : ""}
                    created {new Date(action.createdAt).toLocaleString()}
                  </p>
                  {action.status === "approval-required" ? (
                    <div className="decision-panel">
                      <label>
                        Operator note
                        <textarea
                          value={decisionReason}
                          onChange={(event) => {
                            setActionDecisionReasons((current) => ({
                              ...current,
                              [action.id]: event.target.value
                            }));
                            setPendingActionDecision((current) =>
                              current?.actionId === action.id ? null : current
                            );
                          }}
                          placeholder="Describe why this action is safe to approve or must be denied."
                        />
                      </label>
                      <div className="button-row">
                        <button
                          type="button"
                          onClick={() => setPendingActionDecision({ actionId: action.id, decision: "approve" })}
                          disabled={!decisionReason.trim()}
                        >
                          Stage approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingActionDecision({ actionId: action.id, decision: "deny" })}
                          disabled={!decisionReason.trim()}
                        >
                          Stage deny
                        </button>
                        {stagedDecision ? (
                          <button
                            type="button"
                            className={stagedDecision === "deny" ? "danger" : "primary"}
                            onClick={() => void decideAgentAction(action.id, stagedDecision, decisionReason)}
                          >
                            Confirm {stagedDecision}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            }) : <p className="empty">No action requests loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["policies", "telemetry"])}>
            <h3>Managed query cache</h3>
            <form className="ops-form" onSubmit={(event) => void saveManagedQueryCachePolicy(event)}>
              <label>
                Enabled
                <select
                  value={cachePolicyEnabled}
                  onChange={(event) => setCachePolicyEnabled(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <label>
                Max TTL seconds
                <input value={cachePolicyMaxTtl} onChange={(event) => setCachePolicyMaxTtl(event.target.value)} />
              </label>
              <button type="submit">Save cache policy</button>
              <button type="button" onClick={() => void loadManagedQueryCachePolicy()}>Load policy</button>
            </form>
            {managedQueryCachePolicy ? (
              <p>
                <strong>{managedQueryCachePolicy.source}</strong>
                {" "}
                {managedQueryCachePolicy.cacheEnabled ? "enabled" : "disabled"}, max TTL{" "}
                {formatCachePolicyTtl(managedQueryCachePolicy.maxCacheTtlSeconds)}
              </p>
            ) : <p className="empty">No cache policy loaded.</p>}
            <div className="button-row">
              <button type="button" onClick={() => void loadManagedQueryCache()}>Load cache</button>
              <button type="button" onClick={() => void purgeManagedQueryCache(true)}>Dry run purge</button>
              <button type="button" onClick={() => void purgeManagedQueryCache(false)}>Execute purge</button>
            </div>
            {managedQueryCachePurgeResult ? (
              <p>
                <strong>{managedQueryCachePurgeResult.dryRun ? "dry-run" : "executed"}</strong>
                {" "}
                expired {managedQueryCachePurgeResult.deletedCount} before{" "}
                {new Date(managedQueryCachePurgeResult.expiredBefore).toLocaleString()}
              </p>
            ) : null}
            {managedQueryCacheEntries.length ? managedQueryCacheEntries.map((entry) => (
              <p key={entry.id}>
                <strong>{entry.provider}</strong> {entry.model} hits {entry.hitCount}, expires{" "}
                {new Date(entry.expiresAt).toLocaleString()}
                {" "}
                <button type="button" onClick={() => void deleteManagedQueryCacheEntry(entry.cacheKey)}>Delete</button>
              </p>
            )) : <p className="empty">No cache entries loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["policies"])}>
            <h3>Managed query retention</h3>
            <form className="ops-form" onSubmit={(event) => void saveManagedQueryRetentionPolicy(event)}>
              <label>
                Prompt capture
                <select
                  value={queryRetentionPromptMode}
                  onChange={(event) =>
                    setQueryRetentionPromptMode(event.target.value as "disabled" | "metadata-only")}
                >
                  <option value="disabled">disabled</option>
                  <option value="metadata-only">metadata-only</option>
                </select>
              </label>
              <label>
                Response capture
                <select
                  value={queryRetentionResponseMode}
                  onChange={(event) =>
                    setQueryRetentionResponseMode(event.target.value as "disabled" | "metadata-only")}
                >
                  <option value="disabled">disabled</option>
                  <option value="metadata-only">metadata-only</option>
                </select>
              </label>
              <label>
                Metadata days
                <input
                  value={queryRetentionMetadataDays}
                  onChange={(event) => setQueryRetentionMetadataDays(event.target.value)}
                />
              </label>
              <button type="submit">Save query retention</button>
              <button type="button" onClick={() => void loadManagedQueryRetentionPolicy()}>Load policy</button>
            </form>
            {managedQueryRetentionPolicy ? (
              <p>
                <strong>{managedQueryRetentionPolicy.source}</strong>
                {" "}
                prompt {managedQueryRetentionPolicy.promptCaptureMode}, response{" "}
                {managedQueryRetentionPolicy.responseCaptureMode}, metadata{" "}
                {formatRetentionDays(managedQueryRetentionPolicy.metadataRetentionDays)}
              </p>
            ) : <p className="empty">No managed query retention policy loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["policies"])}>
            <h3>Secret references</h3>
            <form className="ops-form" onSubmit={(event) => void saveSecretReferencePolicy(event)}>
              <label>
                Allowed prefixes
                <input
                  value={secretReferencePrefixes}
                  onChange={(event) => setSecretReferencePrefixes(event.target.value)}
                />
              </label>
              <label>
                Exact env vars
                <input
                  value={secretReferenceEnvVars}
                  onChange={(event) => setSecretReferenceEnvVars(event.target.value)}
                />
              </label>
              <label>
                Allow unlisted
                <select
                  value={secretReferenceAllowUnlisted}
                  onChange={(event) => setSecretReferenceAllowUnlisted(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </label>
              <button type="submit">Save secret policy</button>
              <button type="button" onClick={() => void loadSecretReferencePolicy()}>Load policy</button>
            </form>
            {secretReferencePolicy ? (
              <p>
                <strong>{secretReferencePolicy.source}</strong>
                {" "}
                prefixes {formatList(secretReferencePolicy.allowedEnvVarPrefixes)}, exact{" "}
                {formatList(secretReferencePolicy.allowedEnvVars)}, unlisted{" "}
                {String(secretReferencePolicy.allowUnlistedEnvVars)}
              </p>
            ) : <p className="empty">No secret reference policy loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["policies"])}>
            <h3>PII redaction</h3>
            <form className="ops-form" onSubmit={(event) => void savePiiRedactionPolicy(event)}>
              <label>
                Enabled
                <select
                  value={piiRedactionEnabled}
                  onChange={(event) => setPiiRedactionEnabled(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
              <label>
                Rule kinds
                <input
                  value={piiRedactionRuleKinds}
                  onChange={(event) => setPiiRedactionRuleKinds(event.target.value)}
                />
              </label>
              <button type="submit">Save PII policy</button>
              <button type="button" onClick={() => void loadPiiRedactionPolicy()}>Load policy</button>
            </form>
            {piiRedactionPolicy ? (
              <p>
                <strong>{piiRedactionPolicy.source}</strong>
                {" "}
                enabled {String(piiRedactionPolicy.redactionEnabled)}, rules{" "}
                {formatList(piiRedactionPolicy.enabledRuleKinds)}
              </p>
            ) : <p className="empty">No PII redaction policy loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["exports"], "export-summary")}>
            <h3>Export package</h3>
            {exportPackage ? (
              <dl className="metadata-grid compact">
                <div><dt>Name</dt><dd>{exportPackage.packageName}</dd></div>
                <div><dt>Assets</dt><dd>{exportPackage.assetCount}</dd></div>
                <div><dt>Denied</dt><dd>{exportPackage.deniedCount}</dd></div>
                <div><dt>Generated</dt><dd>{new Date(exportPackage.generatedAt).toLocaleTimeString()}</dd></div>
              </dl>
            ) : (
              <p className="empty">No export generated.</p>
            )}
          </div>
          <div className={routePanelClass(currentPage, ["telemetry"])}>
            <h3>Retrieval events</h3>
            {telemetryEvents.length ? telemetryEvents.map((event) => (
              <p key={event.id}>
                <strong>{event.query}</strong> results {event.resultCount}, denied {event.deniedCount}
              </p>
            )) : <p className="empty">No telemetry loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["telemetry"])}>
            <h3>Audit events</h3>
            {auditEvents.length ? auditEvents.map((event) => (
              <p key={event.id}>
                <strong>{event.action}</strong> {event.outcome} on {event.targetType}
              </p>
            )) : <p className="empty">No audit events loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["access"])}>
            <h3>Users</h3>
            <form className="ops-form" onSubmit={(event) => void createUser(event)}>
              <label>
                Email
                <input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} type="email" autoComplete="username" />
              </label>
              <label>
                Display
                <input value={userDisplayName} onChange={(event) => setUserDisplayName(event.target.value)} />
              </label>
              <label>
                Role
                <select value={userRole} onChange={(event) => setUserRole(event.target.value as typeof userRole)}>
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Password
                <input
                  value={userPassword}
                  onChange={(event) => setUserPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </label>
              <button type="submit">Create user</button>
            </form>
            <form className="ops-form" onSubmit={(event) => void updateUser(event)}>
              <label>
                User ID
                <input value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} />
              </label>
              <label>
                Display
                <input
                  value={userUpdateDisplayName}
                  onChange={(event) => setUserUpdateDisplayName(event.target.value)}
                />
              </label>
              <label>
                Role
                <select
                  value={userUpdateRole}
                  onChange={(event) => setUserUpdateRole(event.target.value as typeof userUpdateRole)}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={userUpdateStatus}
                  onChange={(event) => setUserUpdateStatus(event.target.value as typeof userUpdateStatus)}
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
              <label className="wide-field">
                New password
                <input
                  value={userUpdatePassword}
                  onChange={(event) => setUserUpdatePassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" disabled={!selectedUserId}>Update user</button>
            </form>
            {users.length ? users.map((user) => (
              <p key={user.id}>
                <strong>{user.email}</strong> {user.role} {user.status} {user.id}
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUserId(user.id);
                    setUserUpdateDisplayName(user.displayName);
                    setUserUpdateRole(user.role);
                    setUserUpdateStatus(user.status);
                    setUserUpdatePassword("");
                    setKeyUserId(user.id);
                    setKeyServiceAccountId("");
                  }}
                >
                  Select
                </button>
              </p>
            )) : <p className="empty">No users loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["access"])}>
            <h3>Service policy</h3>
            <form className="ops-form" onSubmit={(event) => void updateServiceAccountPolicy(event)}>
              <label>
                Max services
                <input
                  value={servicePolicyMaxAccounts}
                  onChange={(event) => setServicePolicyMaxAccounts(event.target.value)}
                />
              </label>
              <label>
                Max active keys
                <input
                  value={servicePolicyMaxKeys}
                  onChange={(event) => setServicePolicyMaxKeys(event.target.value)}
                />
              </label>
              <label>
                Default key expiry days
                <input
                  value={servicePolicyDefaultExpiry}
                  onChange={(event) => setServicePolicyDefaultExpiry(event.target.value)}
                />
              </label>
              <button type="submit">Save policy</button>
            </form>
            {serviceAccountPolicy ? (
              <p>
                <strong>{serviceAccountPolicy.source}</strong> max services {policyValue(serviceAccountPolicy.maxServiceAccounts)}, max keys {policyValue(serviceAccountPolicy.maxActiveApiKeysPerServiceAccount)}, default expiry {policyValue(serviceAccountPolicy.defaultApiKeyExpiresInDays)}d
              </p>
            ) : <p className="empty">No service policy loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["access"])}>
            <h3>Service accounts</h3>
            <form className="ops-form" onSubmit={(event) => void createServiceAccount(event)}>
              <label>
                Slug
                <input value={serviceAccountSlug} onChange={(event) => setServiceAccountSlug(event.target.value)} />
              </label>
              <label>
                Name
                <input value={serviceAccountName} onChange={(event) => setServiceAccountName(event.target.value)} />
              </label>
              <label>
                Role
                <select
                  value={serviceAccountRole}
                  onChange={(event) => setServiceAccountRole(event.target.value as typeof serviceAccountRole)}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={serviceAccountStatus}
                  onChange={(event) => setServiceAccountStatus(event.target.value as typeof serviceAccountStatus)}
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
              <label className="wide-field">
                Description
                <input
                  value={serviceAccountDescription}
                  onChange={(event) => setServiceAccountDescription(event.target.value)}
                />
              </label>
              <button type="submit">Create service</button>
            </form>
            <form className="ops-form" onSubmit={(event) => void updateServiceAccount(event)}>
              <label>
                Service ID
                <input
                  value={selectedServiceAccountId}
                  onChange={(event) => setSelectedServiceAccountId(event.target.value)}
                />
              </label>
              <label>
                Name
                <input
                  value={serviceAccountUpdateName}
                  onChange={(event) => setServiceAccountUpdateName(event.target.value)}
                />
              </label>
              <label>
                Role
                <select
                  value={serviceAccountUpdateRole}
                  onChange={(event) => setServiceAccountUpdateRole(event.target.value as typeof serviceAccountUpdateRole)}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={serviceAccountUpdateStatus}
                  onChange={(event) =>
                    setServiceAccountUpdateStatus(event.target.value as typeof serviceAccountUpdateStatus)
                  }
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
              <label className="wide-field">
                Description
                <input
                  value={serviceAccountUpdateDescription}
                  onChange={(event) => setServiceAccountUpdateDescription(event.target.value)}
                />
              </label>
              <button type="submit" disabled={!selectedServiceAccountId}>Update service</button>
            </form>
            {serviceAccounts.length ? serviceAccounts.map((serviceAccount) => (
              <p key={serviceAccount.id}>
                <strong>{serviceAccount.slug}</strong> {serviceAccount.role} {serviceAccount.status} {serviceAccount.id}
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedServiceAccountId(serviceAccount.id);
                    setServiceAccountUpdateName(serviceAccount.name);
                    setServiceAccountUpdateDescription(serviceAccount.description ?? "");
                    setServiceAccountUpdateRole(serviceAccount.role);
                    setServiceAccountUpdateStatus(serviceAccount.status);
                    setKeyUserId("");
                    setKeyServiceAccountId(serviceAccount.id);
                  }}
                >
                  Select
                </button>
              </p>
            )) : <p className="empty">No service accounts loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["access"])}>
            <h3>Groups</h3>
            <form className="ops-form" onSubmit={(event) => void createGroup(event)}>
              <label>
                Slug
                <input value={groupSlug} onChange={(event) => setGroupSlug(event.target.value)} />
              </label>
              <label>
                Name
                <input value={groupName} onChange={(event) => setGroupName(event.target.value)} />
              </label>
              <label className="wide-field">
                Description
                <input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} />
              </label>
              <button type="submit">Create</button>
            </form>
            <form className="ops-form" onSubmit={(event) => void addGroupMember(event)}>
              <label>
                Group ID
                <input value={memberGroupId} onChange={(event) => setMemberGroupId(event.target.value)} />
              </label>
              <label>
                User ID
                <input value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} />
              </label>
              <button type="submit" disabled={!memberGroupId || !memberUserId}>Add member</button>
              <button type="button" onClick={() => void removeGroupMember()} disabled={!memberGroupId || !memberUserId}>
                Remove member
              </button>
              <button type="button" onClick={() => void loadGroupMembers()} disabled={!memberGroupId}>Members</button>
              <button type="button" onClick={() => void deleteGroup()} disabled={!memberGroupId}>Delete group</button>
            </form>
            {groups.length ? groups.map((group) => (
              <p key={group.id}>
                <strong>{group.slug}</strong> {group.name} {group.description ?? ""}
                {" "}
                <button type="button" onClick={() => setMemberGroupId(group.id)}>Select</button>
              </p>
            )) : <p className="empty">No groups loaded.</p>}
            {groupMembers.length ? groupMembers.map((member) => (
              <p key={`${member.groupId}:${member.userId}`}>
                <strong>{member.userEmail}</strong> {member.userRole} in {member.groupId}
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    setMemberGroupId(member.groupId);
                    setMemberUserId(member.userId);
                  }}
                >
                  Select
                </button>
              </p>
            )) : <p className="empty">No members loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["access"])}>
            <h3>API keys</h3>
            <form className="ops-form" onSubmit={(event) => void createApiKey(event)}>
              <label>
                User ID
                <input
                  value={keyUserId}
                  onChange={(event) => {
                    setKeyUserId(event.target.value);
                    if (event.target.value) {
                      setKeyServiceAccountId("");
                    }
                  }}
                />
              </label>
              <label>
                Service ID
                <input
                  value={keyServiceAccountId}
                  onChange={(event) => {
                    setKeyServiceAccountId(event.target.value);
                    if (event.target.value) {
                      setKeyUserId("");
                    }
                  }}
                />
              </label>
              <label>
                Name
                <input value={keyName} onChange={(event) => setKeyName(event.target.value)} />
              </label>
              <label>
                Scopes
                <input value={keyScopes} onChange={(event) => setKeyScopes(event.target.value)} />
              </label>
              <label>
                Expires
                <input value={keyExpiresAt} onChange={(event) => setKeyExpiresAt(event.target.value)} />
              </label>
              <button
                type="submit"
                disabled={!keyName || Number(Boolean(keyUserId)) + Number(Boolean(keyServiceAccountId)) !== 1}
              >
                Create key
              </button>
            </form>
            <form className="ops-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Key ID
                <input value={selectedApiKeyId} onChange={(event) => setSelectedApiKeyId(event.target.value)} />
              </label>
              <label>
                New name
                <input value={rotateKeyName} onChange={(event) => setRotateKeyName(event.target.value)} />
              </label>
              <label>
                Revoke old
                <select
                  value={String(revokeOldKey)}
                  onChange={(event) => setRevokeOldKey(event.target.value === "true")}
                >
                  <option value="false">no</option>
                  <option value="true">yes</option>
                </select>
              </label>
              <button type="button" onClick={() => void rotateApiKey()} disabled={!selectedApiKeyId}>Rotate</button>
              <button type="button" onClick={() => void revokeApiKey()} disabled={!selectedApiKeyId}>Revoke</button>
            </form>
            <form className="ops-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Due days
                <input value={apiKeyRotationDueDays} onChange={(event) => setApiKeyRotationDueDays(event.target.value)} />
              </label>
              <button type="button" onClick={() => void loadApiKeyRotationReport()}>Load rotation due</button>
            </form>
            {apiKeyRotationReport ? (
              <div>
                <p>
                  <strong>Rotation window</strong> {apiKeyRotationReport.asOf} to {apiKeyRotationReport.dueBefore}
                </p>
                {apiKeyRotationReport.reminders.length ? apiKeyRotationReport.reminders.map((reminder) => (
                  <p key={reminder.apiKey.id}>
                    <strong>{reminder.apiKey.name}</strong> {reminder.rotationState} {formatDaysUntil(reminder.daysUntilExpiry)} {keyOwnerLabel(reminder.apiKey)} {reminder.apiKey.secretPreview} {reminder.reason}
                  </p>
                )) : <p className="empty">No rotation reminders in this window.</p>}
              </div>
            ) : null}
            {oneTimeSecret ? (
              <label>
                One-time secret
                <input value={oneTimeSecret} readOnly type="password" autoComplete="off" />
              </label>
            ) : null}
            {apiKeyRecords.length ? apiKeyRecords.map((record) => (
              <p key={record.id}>
                <strong>{record.name}</strong> {keyOwnerLabel(record)} {record.secretPreview} {record.scopes.join(",")} {record.revokedAt ? "revoked" : "active"} {record.id}
              </p>
            )) : <p className="empty">No API keys loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["access"])}>
            <h3>Login sessions</h3>
            <form className="ops-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Session ID
                <input
                  value={selectedLoginSessionId}
                  onChange={(event) => setSelectedLoginSessionId(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => void loadLoginSessions()}>Load sessions</button>
              <button type="button" onClick={() => void revokeLoginSession()} disabled={!selectedLoginSessionId}>
                Revoke session
              </button>
            </form>
            {loginSessions.length ? loginSessions.map((session) => (
              <p key={session.id}>
                <strong>{session.deviceLabel ?? session.source}</strong> {session.revokedAt ? "revoked" : "active"} user {session.userId} key {session.apiKeyId} expires {new Date(session.expiresAt).toLocaleString()} {session.clientUserAgent ? `client ${session.clientUserAgent}` : ""} {session.id}
                {" "}
                <button type="button" onClick={() => setSelectedLoginSessionId(session.id)}>Select</button>
              </p>
            )) : <p className="empty">No login sessions loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["telemetry"])}>
            <h3>Managed query feedback</h3>
            <form className="ops-form" onSubmit={(event) => void submitFeedback(event)}>
              <label>
                Event ID
                <input
                  value={feedbackTelemetryEventId}
                  onChange={(event) => setFeedbackTelemetryEventId(event.target.value)}
                />
              </label>
              <label>
                Query
                <input value={feedbackQuery} onChange={(event) => setFeedbackQuery(event.target.value)} />
              </label>
              <label>
                Outcome
                <select
                  value={feedbackOutcome}
                  onChange={(event) => setFeedbackOutcome(event.target.value as typeof feedbackOutcome)}
                >
                  <option value="accepted">accepted</option>
                  <option value="needs-review">needs-review</option>
                  <option value="rejected">rejected</option>
                </select>
              </label>
              <label>
                Citation score
                <input
                  value={feedbackCitationAccuracy}
                  onChange={(event) => setFeedbackCitationAccuracy(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <button type="submit">Submit</button>
            </form>
            {feedbackRecords.length ? feedbackRecords.map((record) => (
              <p key={record.id}>
                <strong>{record.outcome}</strong> {record.query} citation {record.factualCitationAccuracy ?? "n/a"}
              </p>
            )) : <p className="empty">No feedback loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, ["telemetry"])}>
            <h3>Demo eval report</h3>
            {evalReport ? (
              <>
	                <dl className="metadata-grid compact">
	                  <div><dt>Status</dt><dd>{evalReport.ok ? "passing" : "failing"}</dd></div>
	                  <div><dt>Cases</dt><dd>{evalReport.passedCount}/{evalReport.caseCount}</dd></div>
	                  <div><dt>Pass rate</dt><dd>{formatPercent(evalReport.passRate)}</dd></div>
	                  <div><dt>Threshold</dt><dd>{formatPercent(evalReport.minimumPassRate)}</dd></div>
	                </dl>
	                {evalReport.tagThresholdResults.map((threshold) => (
	                  <p key={threshold.tag ?? threshold.scope}>
	                    <strong>{threshold.passed ? "pass" : "fail"}</strong> {threshold.tag ?? threshold.scope} {formatPercent(threshold.passRate)} / {formatPercent(threshold.minimumPassRate)}
	                  </p>
	                ))}
	                {evalReport.results.map((result) => (
	                  <p key={result.id}>
	                    <strong>{result.passed ? "pass" : "fail"}</strong> {result.id} citations {result.citationCount}
	                    {result.tags.length ? ` tags ${result.tags.join(", ")}` : ""}
	                  </p>
	                ))}
              </>
            ) : (
              <p className="empty">No eval run.</p>
            )}
            {evalSummary ? (
              <>
                <h4>Summary</h4>
                <dl className="metadata-grid compact">
                  <div><dt>Runs</dt><dd>{evalSummary.runCount}</dd></div>
                  <div><dt>Latest</dt><dd>{evalSummary.latestPassRate === null ? "n/a" : formatPercent(evalSummary.latestPassRate)}</dd></div>
                  <div><dt>Average</dt><dd>{evalSummary.averagePassRate === null ? "n/a" : formatPercent(evalSummary.averagePassRate)}</dd></div>
                  <div><dt>Cases</dt><dd>{evalSummary.totalPassedCount}/{evalSummary.totalCaseCount}</dd></div>
                  <div><dt>Thresholds</dt><dd>{evalSummary.thresholdPassedCount}/{evalSummary.runCount}</dd></div>
                  <div><dt>Generated</dt><dd>{new Date(evalSummary.generatedAt).toLocaleTimeString()}</dd></div>
                </dl>
                <p><strong>Modes</strong> {formatCounts(evalSummary.byMode)}</p>
                {evalSummary.byTag.length ? (
                  <p><strong>Tags</strong> {evalSummary.byTag.map((tag) =>
                    `${tag.tag} ${formatPercent(tag.passRate)} (${tag.passedCount}/${tag.caseCount})`
                  ).join("; ")}</p>
                ) : null}
              </>
            ) : <p className="empty">No eval summary loaded.</p>}
            {evalRuns.length ? (
              <>
                <h4>Recent runs</h4>
                {evalRuns.map((run) => (
                  <p key={run.id}>
                    <strong>{run.ok ? "passing" : "failing"}</strong> {formatPercent(run.passRate)} {run.passedCount}/{run.caseCount} {new Date(run.createdAt).toLocaleString()}
                  </p>
                ))}
              </>
            ) : (
              <p className="empty">No eval history loaded.</p>
            )}
          </div>
          <div className={routePanelClass(currentPage, ["providers"])}>
            <h3>Provider config</h3>
            <form className="provider-form" onSubmit={(event) => void saveProviderConfig(event)}>
              <label>
                Provider
                <select
                  value={providerForm.provider}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    provider: event.target.value as ModelProvider
                  }))}
                >
                  <option value="openai">openai</option>
                  <option value="anthropic">anthropic</option>
                  <option value="openrouter">openrouter</option>
                </select>
              </label>
              <label>
                Enabled
                <select
                  value={String(providerForm.enabled)}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    enabled: event.target.value === "true"
                  }))}
                >
                  <option value="true">enabled</option>
                  <option value="false">disabled</option>
                </select>
              </label>
              <label>
                Env var
                <input
                  value={providerForm.apiKeyEnvVar}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    apiKeyEnvVar: event.target.value
                  }))}
                />
              </label>
              <label>
                Display
                <input
                  value={providerForm.displayName}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    displayName: event.target.value
                  }))}
                />
              </label>
              <label>
                Base URL
                <input
                  value={providerForm.baseUrl}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    baseUrl: event.target.value
                  }))}
                />
              </label>
              <label>
                Default model
                <input
                  value={providerForm.defaultModel}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    defaultModel: event.target.value
                  }))}
                />
              </label>
              <label>
                Models
                <input
                  value={providerForm.models}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    models: event.target.value
                  }))}
                />
              </label>
              <label>
                Priority
                <input
                  value={providerForm.priority}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    priority: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Max output
                <input
                  value={providerForm.maxOutputTokens}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    maxOutputTokens: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Temperature
                <input
                  value={providerForm.temperature}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    temperature: event.target.value
                  }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Timeout ms
                <input
                  value={providerForm.timeoutMs}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    timeoutMs: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Max retries
                <input
                  value={providerForm.maxRetries}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    maxRetries: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Retry backoff ms
                <input
                  value={providerForm.retryBackoffMs}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    retryBackoffMs: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Input cost / 1M
                <input
                  value={providerForm.inputCostPerMillionTokens}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    inputCostPerMillionTokens: event.target.value
                  }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Output cost / 1M
                <input
                  value={providerForm.outputCostPerMillionTokens}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    outputCostPerMillionTokens: event.target.value
                  }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Max input tokens
                <input
                  value={providerForm.maxEstimatedInputTokensPerQuery}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    maxEstimatedInputTokensPerQuery: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Max total tokens
                <input
                  value={providerForm.maxEstimatedTotalTokensPerQuery}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    maxEstimatedTotalTokensPerQuery: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Max cost
                <input
                  value={providerForm.maxEstimatedCostUsdPerQuery}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    maxEstimatedCostUsdPerQuery: event.target.value
                  }))}
                  inputMode="decimal"
                />
              </label>
              <button type="submit">Save</button>
            </form>
            {providerConfigs.length ? providerConfigs.map((provider) => (
              <p key={provider.id}>
                <strong>{provider.provider}</strong> {provider.enabled ? "enabled" : "disabled"} {provider.defaultModel ?? "no model"} via {provider.apiKeyEnvVar ?? "no env var"}
              </p>
            )) : <p className="empty">No providers loaded.</p>}
            {providerHealth.length ? (
              <>
                <h4>Readiness</h4>
                {providerHealth.map((provider) => (
                  <p key={provider.provider}>
                    <strong>{provider.provider}</strong> {provider.status} {provider.apiKeyConfigured ? "key configured" : "no key"} {provider.reasons.length ? `(${provider.reasons.join(", ")})` : ""}
                  </p>
                ))}
              </>
            ) : null}
          </div>
          <div className={routePanelClass(currentPage, ["providers"])}>
            <h3>Auth provider config</h3>
            <form className="provider-form" onSubmit={(event) => void saveAuthProviderConfig(event)}>
              <label>
                Provider
                <select
                  value={authProviderForm.provider}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    provider: event.target.value as ExternalAuthProvider
                  }))}
                >
                  <option value="microsoft-entra">microsoft-entra</option>
                  <option value="oidc">oidc</option>
                </select>
              </label>
              <label>
                Enabled
                <select
                  value={String(authProviderForm.enabled)}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    enabled: event.target.value === "true"
                  }))}
                >
                  <option value="true">enabled</option>
                  <option value="false">disabled</option>
                </select>
              </label>
              <label>
                Issuer URL
                <input
                  value={authProviderForm.issuerUrl}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    issuerUrl: event.target.value
                  }))}
                />
              </label>
              <label>
                Client ID
                <input
                  value={authProviderForm.clientId}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    clientId: event.target.value
                  }))}
                />
              </label>
              <label>
                Secret env var
                <input
                  value={authProviderForm.clientSecretEnvVar}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    clientSecretEnvVar: event.target.value
                  }))}
                />
              </label>
              <label>
                Redirect URI
                <input
                  value={authProviderForm.redirectUri}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    redirectUri: event.target.value
                  }))}
                />
              </label>
              <label>
                Display
                <input
                  value={authProviderForm.displayName}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    displayName: event.target.value
                  }))}
                />
              </label>
              <label>
                Scopes
                <input
                  value={authProviderForm.scopes}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    scopes: event.target.value
                  }))}
                />
              </label>
              <label>
                Group claim
                <input
                  value={authProviderForm.groupClaim}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    groupClaim: event.target.value
                  }))}
                />
              </label>
              <label>
                Allowed domains
                <input
                  value={authProviderForm.allowedDomains}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    allowedDomains: event.target.value
                  }))}
                />
              </label>
              <label>
                Default role
                <select
                  value={authProviderForm.defaultRole}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    defaultRole: event.target.value as AuthProviderFormState["defaultRole"]
                  }))}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Priority
                <input
                  value={authProviderForm.priority}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    priority: event.target.value
                  }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Auto provision
                <select
                  value={String(authProviderForm.autoProvisionUsers)}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    autoProvisionUsers: event.target.value === "true"
                  }))}
                >
                  <option value="false">disabled</option>
                  <option value="true">enabled</option>
                </select>
	              </label>
	              <label>
	                Account linking
	                <select
	                  value={authProviderForm.accountLinkingMode}
	                  onChange={(event) => setAuthProviderForm((current) => ({
	                    ...current,
	                    accountLinkingMode: event.target.value as AccountLinkingMode
	                  }))}
	                >
	                  <option value="verified-email">verified email</option>
	                  <option value="disabled">disabled</option>
	                  <option value="email">email match</option>
	                </select>
	              </label>
	              <label>
	                Group sync
	                <select
                  value={String(authProviderForm.groupSyncEnabled)}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    groupSyncEnabled: event.target.value === "true"
                  }))}
                >
                  <option value="false">disabled</option>
                  <option value="true">enabled</option>
                </select>
              </label>
              <button type="submit">Save auth provider</button>
            </form>
	            {authProviderConfigs.length ? authProviderConfigs.map((provider) => (
	              <p key={provider.id}>
	                <strong>{provider.provider}</strong> {provider.enabled ? "enabled" : "disabled"} {provider.issuerUrl} linking {provider.accountLinkingMode} via {provider.clientSecretEnvVar ?? "no secret env var"}
	              </p>
            )) : <p className="empty">No auth providers loaded.</p>}
          </div>
        </section>
      </section>
      </section>
      </main>
        </>
      ) : (
        <main className="auth-main" id="main">
          <section className="login-panel" aria-labelledby="login-title">
            <div className="login-header">
              <span className="mark login-mark">AC</span>
              <h1 id="login-title">Sign in to Agentic CMS</h1>
              <p className="lede">Private prototype access</p>
            </div>
            <form className="auth-settings-form" onSubmit={(event) => {
              event.preventDefault();
              void refresh();
            }}>
              <label>
                API URL
                <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} autoComplete="url" />
              </label>
              <label>
                API key
                <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" />
              </label>
              <button type="submit" disabled={!apiKey.trim() || authState === "checking"}>Use API key</button>
            </form>
            <form className="classic-login-form" onSubmit={(event) => void login(event)}>
              <label>
                Tenant ID
                <input value={loginTenantId} onChange={(event) => setLoginTenantId(event.target.value)} autoComplete="organization" />
              </label>
              <label>
                Email
                <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" autoComplete="username" />
              </label>
              <label>
                Password
                <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete="current-password" />
              </label>
              <button type="submit" disabled={authState === "checking"}>Sign in</button>
            </form>
            <form className="oidc-login-form" onSubmit={(event) => void startOidcLogin(event)}>
              <label>
                SSO provider
                <select value={oidcProvider} onChange={(event) => setOidcProvider(event.target.value as ExternalAuthProvider)}>
                  <option value="microsoft-entra">microsoft-entra</option>
                  <option value="oidc">oidc</option>
                </select>
              </label>
              <button type="submit" disabled={!loginTenantId || authState === "checking"}>Continue with SSO</button>
            </form>
            {authState === "checking" ? <p className="message">Checking session</p> : null}
            {message ? <p className="message">{message}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </section>
        </main>
      )}
    </div>
  );
}

function upsertApiKeyRecords(records: ApiKeyRecord[], rotation: ApiKeyRotateResponse): ApiKeyRecord[] {
  const next = new Map(records.map((record) => [record.id, record]));
  next.set(rotation.rotatedFrom.id, rotation.revokedApiKey ?? rotation.rotatedFrom);
  next.set(rotation.apiKey.id, rotation.apiKey);

  return Array.from(next.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name)
  );
}

function keyOwnerLabel(record: ApiKeyRecord): string {
  return record.serviceAccountId
    ? `service:${record.serviceAccountId}`
    : `user:${record.userId ?? "unknown"}`;
}

function formatDaysUntil(daysUntilExpiry: number | null): string {
  if (daysUntilExpiry === null) {
    return "no expiry";
  }

  if (daysUntilExpiry <= 0) {
    return `${Math.abs(daysUntilExpiry)}d overdue`;
  }

  return `${daysUntilExpiry}d left`;
}

function formatCounts(counts: Array<{ key: string; count: number }>): string {
  return counts.length
    ? counts.map((entry) => `${entry.key} ${entry.count}`).join(", ")
    : "none";
}

function formatList(values: string[]): string {
  return values.length ? values.join(", ") : "none";
}

function initialsFor(value: string): string {
  const initials = value
    .split(/[\s@._-]+/)
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return initials || "AC";
}

function formatMetric(value: number | null, suffix = ""): string {
  return value === null ? "n/a" : `${value}${suffix}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCurrency(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(6)}`;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCsvInput(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function compactMetadata(values: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== undefined)
  );
}

function formatRetentionDays(value: number | null): string {
  return value === null ? "forever" : `${value}d`;
}

function formatRetentionInput(value: number | null): string {
  return value === null ? "forever" : String(value);
}

function parseRetentionInput(value: string): number | null {
  const trimmed = value.trim().toLowerCase();

  if (["forever", "none", "null"].includes(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function policyValue(value: number | null): string {
  return value === null ? "unlimited" : String(value);
}

function formatCachePolicyTtl(value: number | null): string {
  return value === null ? "unlimited" : `${value}s`;
}

function parseNullablePolicyNumber(value: string): number | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed || ["forever", "none", "null", "unlimited"].includes(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }

  return parsed;
}

interface ProviderFormState {
  provider: ModelProvider;
  enabled: boolean;
  displayName: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  defaultModel: string;
  models: string;
  priority: string;
  maxOutputTokens: string;
  temperature: string;
  timeoutMs: string;
  maxRetries: string;
  retryBackoffMs: string;
  inputCostPerMillionTokens: string;
  outputCostPerMillionTokens: string;
  maxEstimatedInputTokensPerQuery: string;
  maxEstimatedTotalTokensPerQuery: string;
  maxEstimatedCostUsdPerQuery: string;
}

interface AuthProviderFormState {
  provider: ExternalAuthProvider;
  enabled: boolean;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecretEnvVar: string;
  redirectUri: string;
  scopes: string;
  emailClaim: string;
  displayNameClaim: string;
  groupClaim: string;
  roleClaim: string;
	  defaultRole: "admin" | "maintainer" | "reader";
	  autoProvisionUsers: boolean;
	  accountLinkingMode: AccountLinkingMode;
	  groupSyncEnabled: boolean;
  allowedDomains: string;
  pkceRequired: boolean;
  priority: string;
}

interface OidcWebTransaction {
  tenantId: string;
  provider: ExternalAuthProvider;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}
