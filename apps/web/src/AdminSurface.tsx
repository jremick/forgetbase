import type { MarkdownEditorHandle, MarkdownEditorProps } from "./components/editor/markdown-editor.js";
import { MarkdownDocument } from "./components/markdown/markdown-document.js";
import { ContentLibrary } from "./components/content/content-library.js";
import { loadAssetCollection } from "./lib/asset-collection.js";
import type { NavigationBlocker } from "./lib/app-navigation.js";
import { canAccessAppRoute, getAppCapabilities } from "./lib/app-routing.js";
import { forwardRef, useImperativeHandle, lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useBrowserApiKey } from "./lib/browser-auth.js";
import type {
  AccountLinkingMode,
  AgentActionExecutionPolicy,
  AgentActionRequest,
  AgentActionType,
  AiExportFormat,
  AiExportPackage,
  ApiKeyCreated,
  ApiKeyRecord,
  ApiKeyRotationReport,
  ApiKeyRotateResponse,
  AssetDetail,
  AssetRecord,
  Attachment,
  AttachmentReconciliationReport,
  AssetReviewQueueResponse,
  AssetVersionSnapshot,
  AuditEvent,
  AuthLoginResponse,
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
  OkfExportPackage,
  OkfVersion,
  PiiRedactionPolicy,
  RetrievalEvent,
  RetrievalRankingPolicy,
  SearchResponse,
  ServiceAccount,
  ServiceAccountPolicy,
  SecretReferencePolicy,
  SystemVersionResponse,
  UpdateSystemStatus,
  TelemetryAnalyticsSummary,
  TelemetryRetentionPolicy,
  TelemetryRetentionPurgeResult
} from "@forgetbase/schema";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/icons/ArrowsClockwise";
import { BookOpen } from "@phosphor-icons/react/dist/icons/BookOpen";
import { ClipboardText } from "@phosphor-icons/react/dist/icons/ClipboardText";
import { Copy } from "@phosphor-icons/react/dist/icons/Copy";
import { DownloadSimple } from "@phosphor-icons/react/dist/icons/DownloadSimple";
import { GearSix } from "@phosphor-icons/react/dist/icons/GearSix";
import { List } from "@phosphor-icons/react/dist/icons/List";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/icons/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/dist/icons/Package";
import { SignOut } from "@phosphor-icons/react/dist/icons/SignOut";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "./components/ui/alert-dialog.js";
import { Badge, type BadgeVariant } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.js";
import {
  DataTableShell,
  DefinitionGrid,
  EmptyState,
  FormField,
  MetricCard,
  RouteHeader,
  SectionCard,
  StatusAlert
} from "./components/app/index.js";
import { TrustStateSummary } from "./components/domain/trust-state-summary.js";
import type { AnalyticsWindowDays } from "./components/domain/analytics-dashboard.js";
import {
  attachmentUploadErrorMessage,
  attachmentUploadHeaders,
  AttachmentsPanel
} from "./components/domain/attachments-panel.js";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "./components/ui/command.js";
import { Checkbox } from "./components/ui/checkbox.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./components/ui/dropdown-menu.js";
import { Input } from "./components/ui/input.js";
import { Label } from "./components/ui/label.js";
import { NativeSelect } from "./components/ui/native-select.js";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "./components/ui/sheet.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./components/ui/select.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./components/ui/table.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.js";
import { Textarea } from "./components/ui/textarea.js";
import {
  formatCachePolicyTtl,
  formatCounts,
  formatCurrency,
  formatDaysUntil,
  formatList,
  formatMetric,
  formatPercent,
  formatRetentionDays,
  formatRetentionInput,
  formatReviewDue,
  isAssetGovernanceDue,
  isPublicReaderEligible,
  libraryAssetMatches,
  libraryAssetMatchesView,
  parseCsvInput,
  parseNullablePolicyNumber,
  parseOptionalNumber,
  parseRetentionInput,
  policyValue,
  sensitivityBadgeVariant,
  stateBadgeVariant,
  type LibraryViewFilter
} from "./lib/asset-ui.js";
import {
  assetAuthoringFormFromDetail,
  buildAssetCreateInput,
  buildAssetUpdateInput,
  createEmptyAssetAuthoringForm,
  suggestedPageId,
  hasUnsavedPageChanges,
  validateAssetAuthoringForm,
  type AssetAuthoringErrors,
  type AssetAuthoringField,
  type AssetAuthoringFormState,
  type AssetAuthoringMode
} from "./lib/asset-authoring.js";
import {
  apiUrlStorageKey,
  loginTenantStorageKey,
  localDevLoginDefaults,
  localSplitOriginAuthKey,
  readInitialApiUrl,
  readInitialLoginEmail,
  readInitialLoginPassword,
  readInitialLoginTenantId
} from "./local-dev-auth.js";
import "./styles.css";

const PageAccessPanel = lazy(() => import("./components/app/page-access-panel.js").then((module) => ({ default: module.PageAccessPanel })));

const AnalyticsDashboard = lazy(() => import("./components/domain/analytics-dashboard.js")
  .then((module) => ({ default: module.AnalyticsDashboard })));

const sessionCookieActiveStorageKey = "forgetbase-session-cookie-active";
const csrfCookieName = "forgetbase_csrf";
// The fallback keeps the current Markdown editable if the authoring chunk cannot load.
const PlainMarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function PlainMarkdownEditor(props, ref) {
  const value = useRef(props.value);
  value.current = props.value;
  useImperativeHandle(ref, () => ({ getSnapshot: () => ({ value: value.current, ready: true }) }));
  useEffect(() => { props.onReadyChange?.(true); }, [props.onReadyChange]);
  return <FormField label={props.label} htmlFor="authoring-body" required errorText={props.error} helpText="Rich editing could not load. Your Markdown is available below.">
    <Textarea id="authoring-body" value={props.value} readOnly={props.readOnly} rows={18} className="font-mono text-sm leading-6"
      onChange={(event) => { value.current = event.target.value; props.onChange(value.current); }} />
  </FormField>;
});
const richEditorEnabled = import.meta.env.VITE_ENABLE_RICH_EDITOR === "true";
const RichMarkdownEditor = richEditorEnabled ? lazy(() => import("./components/editor/markdown-editor.js")
  .then((module) => ({ default: module.MarkdownEditor }))
  .catch(() => ({ default: PlainMarkdownEditor }))) : PlainMarkdownEditor;

const LazyUpdateManagementPanel = lazy(() => import("./components/domain/update-management.js")
  .then((module) => ({ default: module.UpdateManagementPanel })));
const configuredApiUrl = import.meta.env.VITE_FORGETBASE_API_URL?.trim();
const attachmentMaxBytes = 10 * 1024 * 1024;
const demoEvalCases = [
  {
    id: "eval.pii-redaction-citation",
    query: "direct personal identifiers support records AI prompt",
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
const navWidthStorageKey = "forgetbase-web-nav-width";
const navCollapsedStorageKey = "forgetbase-web-nav-collapsed";
const densityStorageKey = "forgetbase-web-density";
const navExpandedStorageKey = "forgetbase-web-nav-expanded";
const navWidthDefault = 280;
const navWidthMin = 240;
const navWidthMax = 420;
const navCollapsedWidth = 64;
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
  folderIcon: ReactNode;
  folderRoute: string;
  activeRoutes: string[];
  count?: number | string;
  leaves: NavLeafConfig[];
};
type AssetContentView = "human" | "instruction" | "version" | "raw" | "access" | "activity";
type ManagedQueryView = "answer" | "evidence" | "diagnostics";
type PolicySettingsView = "retention" | "answers" | "ranking" | "evals" | "actions" | "data" | "privacy";
type AccessSettingsView = "users" | "service-policy" | "service-accounts" | "groups" | "api-keys" | "sessions";
type GeneratedPackage = AiExportPackage | OkfExportPackage;
type ReleaseAction = "review" | "publish" | "restore";
type ConfirmedReleaseAction = Exclude<ReleaseAction, "review">;
const pageRouteValues = [
  "reader",
  "account-settings",
  "library",
  "search",
  "asset-read",
  "review",
  "versions",
  "distribute",
  "activity",
  "health",
  "updates",
  "integrations",
  "settings",
  "policies",
  "access",
  "approvals"
] as const;
const operationsRouteValues = [
  "activity",
  "health",
  "updates",
  "integrations",
  "settings",
  "policies",
  "access",
  "approvals"
] as const;
const legacyPageRouteAliases: Record<string, string> = {
  exports: "distribute",
  operate: "health",
  operations: "health",
  providers: "integrations",
  telemetry: "activity"
};
const adminRouteAliases: Record<string, string> = {
  admin: "library",
  "admin/content": "library",
  "admin/content/search": "search",
  "admin/content/page": "asset-read",
  "admin/reviews": "review",
  "admin/reviews/version-compare": "versions",
  "admin/exports": "distribute",
  "admin/system": "health",
  "admin/system/activity": "activity",
  "admin/system/health": "health",
  "admin/system/updates": "updates",
  "admin/system/integrations": "integrations",
  "admin/system/settings": "settings",
  "admin/system/policies": "policies",
  "admin/system/access": "access",
  "admin/system/approvals": "approvals"
};
const canonicalRouteHashes: Record<string, string> = {
  "account-settings": "account-settings",
  "asset-read": "admin/content/page",
  "search": "admin/content/search",
  "reader": "reader",
  "library": "admin/content",
  "review": "admin/reviews",
  "versions": "admin/reviews/version-compare",
  "distribute": "admin/exports",
  "activity": "admin/system/activity",
  "health": "admin/system/health",
  "updates": "admin/system/updates",
  "integrations": "admin/system/integrations",
  "settings": "admin/system/settings",
  "policies": "admin/system/policies",
  "access": "admin/system/access",
  "approvals": "admin/system/approvals"
};
const activityPanelRoutes = ["activity", "telemetry"];
const activityAndHealthPanelRoutes = ["activity", "telemetry", "health"];
const integrationsPanelRoutes = ["integrations", "providers"];
const settingsNavigationRoutes = ["settings", "policies", "access"];
const settingsOverviewRoutes = ["settings"];
const policySettingsPanelRoutes = ["policies"];
const accessSettingsPanelRoutes = ["access"];
const pageRoutes = new Set<string>(pageRouteValues);
const operationsRoutes = new Set<string>(operationsRouteValues);
const sensitivityFilterValues = ["public-demo", "internal", "restricted", "confidential", "secret"] as const;
const defaultOperationsPageCopy = {
  title: "System Health",
  lede: "Check the API, providers, recent activity, approvals, and maintenance jobs."
};
const operationsPageCopy: Record<string, { title: string; lede: string }> = {
  review: {
    title: "Reviews",
    lede: "Review pages that need approval, updates, or publishing."
  },
  activity: {
    title: "Activity",
    lede: "Review recent search, audit, feedback, cache, and model activity."
  },
  health: {
    title: "System Health",
    lede: "Check the API, providers, recent activity, approvals, and maintenance jobs."
  },
  updates: {
    title: "Updates",
    lede: "Review signed releases, run preflight checks, update the installation, and manage recovery points."
  },
  integrations: {
    title: "Integrations",
    lede: "Manage model providers, health checks, and sign-in providers."
  },
  settings: {
    title: "Settings",
    lede: "Choose the settings area you need."
  },
  policies: {
    title: "Policies",
    lede: "Manage retention, answers, ranking, actions, cache, secrets, and redaction."
  },
  access: {
    title: "Access",
    lede: "Manage users, groups, service accounts, API keys, and sessions."
  },
  approvals: {
    title: "Approvals",
    lede: "Review approval rules, pending requests, and safety switches."
  }
};

function routePanelClass(currentPage: string, routes: string[], baseClass = "grid gap-4"): string {
  return `${baseClass} ${routes.includes(currentPage) ? "" : "is-hidden"}`;
}

function normalizePageRoute(route: string): string {
  const cleanedRoute = route.replace(/^#/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  const aliasedRoute = adminRouteAliases[cleanedRoute] ?? legacyPageRouteAliases[cleanedRoute] ?? cleanedRoute;

  return pageRoutes.has(aliasedRoute) ? aliasedRoute : "reader";
}

function canonicalRouteHash(route: string): string {
  const normalizedRoute = normalizePageRoute(route);

  return canonicalRouteHashes[normalizedRoute] ?? normalizedRoute;
}

function assetMutationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("asset_version_conflict")
    ? "This page changed since it was loaded. Reload it and review the latest draft before retrying."
    : message;
}

function navBadgeVariant(tone?: NavBadgeTone): BadgeVariant {
  if (tone === "bad") {
    return "destructive";
  }

  if (tone === "ok") {
    return "success";
  }

  if (tone === "warn") {
    return "warning";
  }

  return "neutral";
}

function clampNavWidth(width: number): number {
  const viewportMax = typeof window === "undefined"
    ? navWidthMax
    : Math.min(navWidthMax, Math.max(navWidthMin, window.innerWidth - 520));

  return Math.min(viewportMax, Math.max(navWidthMin, Math.round(width)));
}

function readInitialNavWidth(): number {
  if (typeof window === "undefined") {
    return navWidthDefault;
  }

  const storedWidth = Number.parseInt(localStorage.getItem(navWidthStorageKey) || "", 10);

  return Number.isFinite(storedWidth) ? clampNavWidth(storedWidth) : navWidthDefault;
}

function readAssetMetadataString(asset: AssetRecord, key: string): string | null {
  const value = asset.metadata[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readerParentId(asset: AssetRecord): string | null {
  return readAssetMetadataString(asset, "readerParentId");
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

function readInitialReaderPageId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("page")?.trim() ?? "";
}

function defaultAuthoringReviewDate(): string {
  const dueAt = new Date();
  dueAt.setUTCDate(dueAt.getUTCDate() + 90);
  return dueAt.toISOString().slice(0, 10);
}

type AdminSurfaceProps = {
  onSessionEnded?: () => void;
  locationKey: string;
  onNavigate: (route: string, pageId?: string, view?: string) => void;
  registerNavigationBlocker: (blocker: NavigationBlocker | null) => void;
};

export function AdminSurface({ onSessionEnded, locationKey, onNavigate, registerNavigationBlocker }: AdminSurfaceProps) {
  const [apiUrl, setApiUrl] = useState(() => readInitialApiUrl(configuredApiUrl));
  const [apiKey, setApiKey] = useBrowserApiKey();
  const [sessionCookieActive, setSessionCookieActive] = useState(
    () => localStorage.getItem(sessionCookieActiveStorageKey) === "true"
  );
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [currentPrincipal, setCurrentPrincipal] = useState<AuthPrincipal | null>(null);
  const [loginTenantId] = useState(readInitialLoginTenantId);
  const [loginEmail, setLoginEmail] = useState(readInitialLoginEmail);
  const [loginPassword, setLoginPassword] = useState(readInitialLoginPassword);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [selectedStableId, setSelectedStableId] = useState(readInitialReaderPageId);
  const [loadedAssetDetail, setAssetDetail] = useState<AssetDetail | null>(null);
  const assetDetail = loadedAssetDetail?.asset.stableId === selectedStableId ? loadedAssetDetail : null;
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState("");
  const [attachmentReconciliation, setAttachmentReconciliation] = useState<AttachmentReconciliationReport | null>(null);
  const [pendingAttachmentDelete, setPendingAttachmentDelete] = useState<Attachment | null>(null);
  const [assetContentView, setAssetContentView] = useState<AssetContentView>("human");
  const [policySettingsView, setPolicySettingsView] = useState<PolicySettingsView>("retention");
  const [accessSettingsView, setAccessSettingsView] = useState<AccessSettingsView>("users");
  const [selectedVersionNumber, setSelectedVersionNumber] = useState("");
  const [versionSnapshot, setVersionSnapshot] = useState<AssetVersionSnapshot | null>(null);
  const [reviewQueue, setReviewQueue] = useState<AssetReviewQueueResponse | null>(null);
  const [reviewQueueLoading, setReviewQueueLoading] = useState(false);
  const [reviewQueueError, setReviewQueueError] = useState("");
  const reviewQueueEpochRef = useRef(0);
  const [pageAccessId, setPageAccessId] = useState(readInitialReaderPageId);
  const [publishReviewDueAt, setPublishReviewDueAt] = useState("");
  const [workflowNote, setWorkflowNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("personal data");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [pendingReleaseAction, setPendingReleaseAction] = useState<ReleaseAction | null>(null);
  const [releaseActionToConfirm, setReleaseActionToConfirm] = useState<ConfirmedReleaseAction | null>(null);
  const [managedQueryText, setManagedQueryText] = useState("personal data");
  const [managedQueryMode, setManagedQueryMode] =
    useState<"deterministic-retrieval" | "provider-routed">("deterministic-retrieval");
  const [managedQueryProvider, setManagedQueryProvider] = useState<ModelProvider>("openai");
  const [managedQueryModel, setManagedQueryModel] = useState("");
  const [managedQueryCacheEnabled, setManagedQueryCacheEnabled] = useState(true);
  const [managedQueryResponse, setManagedQueryResponse] = useState<ManagedQueryResponse | null>(null);
  const [managedQueryView, setManagedQueryView] = useState<ManagedQueryView>("answer");
  const [packageName, setPackageName] = useState("demo-agent-pack");
  const [exportFormat, setExportFormat] = useState<AiExportFormat>("json");
  const [okfVersion, setOkfVersion] = useState<OkfVersion>("0.1");
  const [exportPackage, setExportPackage] = useState<GeneratedPackage | null>(null);
  const [isGeneratingExport, setIsGeneratingExport] = useState(false);
  const [telemetryEvents, setTelemetryEvents] = useState<RetrievalEvent[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetryAnalyticsSummary | null>(null);
  const [analyticsWindowDays, setAnalyticsWindowDays] = useState<AnalyticsWindowDays>(30);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [telemetryRetentionPolicy, setTelemetryRetentionPolicy] = useState<TelemetryRetentionPolicy | null>(null);
  const [retentionLoadState, setRetentionLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [retentionError, setRetentionError] = useState("");
  const [retentionBusy, setRetentionBusy] = useState(false);
  const retentionLoadEpochRef = useRef(0);
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
    useState("FORGETBASE_,OPENAI_,ANTHROPIC_,OPENROUTER_,ENTRA_,OIDC_");
  const [secretReferenceEnvVars, setSecretReferenceEnvVars] = useState("");
  const [secretReferenceAllowUnlisted, setSecretReferenceAllowUnlisted] = useState<"true" | "false">("false");
  const [piiRedactionPolicy, setPiiRedactionPolicy] = useState<PiiRedactionPolicy | null>(null);
  const [piiRedactionEnabled, setPiiRedactionEnabled] = useState<"true" | "false">("true");
  const [piiRedactionRuleKinds, setPiiRedactionRuleKinds] =
    useState("api-key,bearer-token,credit-card,email,government-id,ip-address,jwt,phone,url-secret");
  const [retentionRetrievalDays, setRetentionRetrievalDays] = useState("");
  const [retentionAuditDays, setRetentionAuditDays] = useState("");
  const [retentionFeedbackDays, setRetentionFeedbackDays] = useState("");
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
  const [feedbackQuery, setFeedbackQuery] = useState("personal data");
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
    clientId: "forgetbase",
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
  const [systemVersion, setSystemVersion] = useState<SystemVersionResponse | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryViewFilter, setLibraryViewFilter] = useState<LibraryViewFilter>("all");
  const [librarySensitivityFilter, setLibrarySensitivityFilter] = useState<string>("all");
  const [authoringMode, setAuthoringMode] = useState<AssetAuthoringMode | null>(null);
  const [authoringForm, setAuthoringForm] = useState<AssetAuthoringFormState>(() =>
    createEmptyAssetAuthoringForm("", defaultAuthoringReviewDate())
  );
  const [authoringErrors, setAuthoringErrors] = useState<AssetAuthoringErrors>({});
  const [authoringSubmitError, setAuthoringSubmitError] = useState("");
  const [isSavingPage, setIsSavingPage] = useState(false);
  const markdownEditorRef = useRef<MarkdownEditorHandle>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(() =>
    normalizePageRoute(typeof window === "undefined" ? "" : window.location.hash.replace("#", ""))
  );
  const [currentHashRoute, setCurrentHashRoute] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.replace("#", "")
  );
  const [density, setDensity] = useState(() =>
    typeof window === "undefined" ? "comfortable" : localStorage.getItem(densityStorageKey) || "comfortable"
  );
  const [navWidth, setNavWidth] = useState(readInitialNavWidth);
  const [isNavCollapsed, setIsNavCollapsed] = useState(() =>
    typeof window === "undefined" ? false : localStorage.getItem(navCollapsedStorageKey) === "true"
  );
  const [expandedNavSections, setExpandedNavSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    try {
      const stored = localStorage.getItem(navExpandedStorageKey);
      const parsed = stored ? JSON.parse(stored) : {};

      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Boolean(value)]))
        : {};
    } catch {
      return {};
    }
  });
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [loadingWorkspaceRoute, setLoadingWorkspaceRoute] = useState("");
  const commandTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loadedWorkspaceRoutesRef = useRef<Set<string>>(new Set());
  const authenticationEpochRef = useRef(0);
  const assetLoadEpochRef = useRef(0);
  const authoringInitialFormRef = useRef<AssetAuthoringFormState | null>(null);
  const authoringIdEditedRef = useRef(false);
  const authoringDirtyRef = useRef(false);
  const pendingLeaveRef = useRef<(() => void) | null>(null);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const authoringEditTargetRef = useRef<{
    stableId: string;
    currentVersionId: string | null;
    metadata: Record<string, unknown>;
    humanDocument?: AssetDetail["humanDocuments"][number];
  } | null>(null);

  const authoringDirty = Boolean(authoringMode && hasUnsavedPageChanges(authoringForm, authoringInitialFormRef.current));
  authoringDirtyRef.current = authoringDirty;

  useEffect(() => {
    registerNavigationBlocker(authoringMode ? (proceed) => requestLeaveAuthoring(() => {
      cancelPageAuthoring();
      proceed();
    }) : null);
    return () => registerNavigationBlocker(null);
  }, [authoringMode, registerNavigationBlocker]);

  useEffect(() => {
    if (!authoringMode) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasPendingAuthoringChanges()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [authoringMode]);

  const currentVersion = useMemo(
    () => assetDetail?.versions.find((version) => version.id === assetDetail.asset.currentVersionId) ?? assetDetail?.versions[0],
    [assetDetail]
  );
  const publishedVersion = assetDetail?.versions.find((version) => version.id === assetDetail.asset.publishedVersionId);
  const selectedVersionIsCurrent = versionSnapshot?.version.id === assetDetail?.asset.currentVersionId;
  const currentInstructionObject = assetDetail?.instructionObjects[0] ?? null;
  const currentHumanDocument = assetDetail?.humanDocuments[0] ?? null;
  const currentInstructionBody = currentInstructionObject?.body ?? "";
  const selectedInstructionBody = versionSnapshot?.instructionObjects[0]?.body ?? "";
  const currentHumanBody = currentHumanDocument?.body ?? "";
  const selectedHumanBody = versionSnapshot?.humanDocuments[0]?.body ?? "";
  const approvedAssets = assets.filter((asset) => asset.status === "approved").length;
  const reviewDueAssets = assets.filter(isAssetGovernanceDue).length;
  const packageNameInput = packageName.trim() || "demo-agent-pack";
  const exportEligibleAssets = assets.filter((asset) => asset.allowedExports.includes(packageNameInput)).length;
  const filteredLibraryAssets = useMemo(
    () => assets.filter((asset) =>
      libraryAssetMatches(asset, libraryQuery) &&
      (librarySensitivityFilter === "all" || asset.sensitivity === librarySensitivityFilter) &&
      libraryAssetMatchesView(asset, libraryViewFilter)
    ),
    [assets, libraryQuery, librarySensitivityFilter, libraryViewFilter]
  );

  const visibleOperationsPage = operationsRoutes.has(currentPage) || currentPage === "review";
  const visibleDistributePage = currentPage === "distribute";
  const isLegacyExportsAlias = currentHashRoute === "exports";
  const legacyRouteTarget = legacyPageRouteAliases[currentHashRoute] ?? "";
  const isLegacyRouteAlias = Boolean(legacyRouteTarget && legacyRouteTarget === currentPage);
  const normalizedApiUrl = apiUrl.replace(/\/$/, "");
  const exportQueryParams = new URLSearchParams({
    package: packageNameInput,
    format: exportFormat
  });

  if (exportFormat === "okf") {
    exportQueryParams.set("okfVersion", okfVersion);
  }

  const exportEndpointPath = `/exports/ai-package?${exportQueryParams.toString()}`;
  const apiCommand = [
    "curl --silent --show-error --fail \\",
    "  -H \"authorization: Bearer $FORGETBASE_API_KEY\" \\",
    "  -H \"x-forgetbase-surface: api\" \\",
    `  \"${normalizedApiUrl}${exportEndpointPath}\"`
  ].join("\n");
  const cliCommand = [
    `npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- exports ai-package --package ${packageNameInput} --format ${exportFormat}`,
    exportFormat === "okf" ? `  --okf-version ${okfVersion} --output-dir okf-bundle` : "  --output export.json",
    `  --api-url ${normalizedApiUrl}`
  ].join(" \\\n");
  const mcpCommand = JSON.stringify(
    {
      tool: "generate_ai_export",
      arguments: {
        packageName: packageNameInput,
        format: exportFormat,
        okfVersion
      }
    },
    null,
    2
  );
  const okfCommand = exportFormat === "okf"
    ? `GET ${exportEndpointPath}`
    : `GET /exports/ai-package?package=${encodeURIComponent(packageNameInput)}&format=okf&okfVersion=${okfVersion}`;
  const commandExamples: Array<[string, string]> = [
    ["API", apiCommand],
    ["CLI", cliCommand],
    ["MCP", mcpCommand],
    ["OKF", okfCommand]
  ];
  const isAuthenticated = authState === "authenticated";
  const displayIdentity = currentPrincipal?.displayName || currentPrincipal?.email || "Guest";
  const displayInitials = isAuthenticated ? initialsFor(displayIdentity) : "GU";
  const capabilities = getAppCapabilities(currentPrincipal);
  const canUseAdministration = capabilities.administration;
  const canWriteAssets = capabilities.createAssets;

  useEffect(() => {
    localStorage.setItem(apiUrlStorageKey, apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (sessionCookieActive) {
      localStorage.setItem(sessionCookieActiveStorageKey, "true");
    } else {
      localStorage.removeItem(sessionCookieActiveStorageKey);
    }
  }, [sessionCookieActive]);

  useEffect(() => {
    localStorage.removeItem(loginTenantStorageKey);
    localStorage.removeItem("forgetbase-login-email");
  }, []);

  useEffect(() => {
    void initializeSession();
  }, []);

  useEffect(() => {
    const url = new URL(locationKey, window.location.origin);
    if (!authoringDirtyRef.current) cancelPageAuthoring();
    const normalizedRoute = normalizePageRoute(url.hash);
    setCurrentHashRoute(canonicalRouteHash(normalizedRoute));
    setCurrentPage(normalizedRoute);
    const pageId = url.searchParams.get("page")?.trim();
    if (pageId) { setSelectedStableId(pageId); setPageAccessId(pageId); }
    const view = url.searchParams.get("view");
    if (view && ["human", "instruction", "version", "raw", "access", "activity"].includes(view)) setAssetContentView(view as AssetContentView);
    else setAssetContentView(normalizedRoute === "versions" ? "version" : "human");
  }, [locationKey]);

  useEffect(() => {
    localStorage.setItem(densityStorageKey, density);
  }, [density]);

  useEffect(() => {
    localStorage.setItem(navWidthStorageKey, String(navWidth));
    document.documentElement.style.setProperty("--nav", `${isNavCollapsed ? navCollapsedWidth : navWidth}px`);
  }, [isNavCollapsed, navWidth]);

  useEffect(() => {
    localStorage.setItem(navCollapsedStorageKey, String(isNavCollapsed));
  }, [isNavCollapsed]);

  useEffect(() => {
    localStorage.setItem(navExpandedStorageKey, JSON.stringify(expandedNavSections));
  }, [expandedNavSections]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const handleCommandShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();

        setIsCommandOpen(true);
      }
    };

    window.addEventListener("keydown", handleCommandShortcut);
    return () => window.removeEventListener("keydown", handleCommandShortcut);
  }, [isAuthenticated]);

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

    const rawTransaction = localStorage.getItem("forgetbase-oidc-transaction");

    if (!rawTransaction) {
      setError("Missing OIDC login state");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    localStorage.removeItem("forgetbase-oidc-transaction");
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      const transaction = JSON.parse(rawTransaction) as OidcWebTransaction;
      void completeOidcLogin(code, state, transaction);
    } catch {
      setError("Invalid OIDC login state");
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !capabilities.administration) {
      onNavigate("reader");
    }
  }, [isAuthenticated, capabilities.administration, onNavigate]);

  useEffect(() => {
    if (isAuthenticated && capabilities.previewAssets && selectedStableId) {
      void loadAsset(selectedStableId);
    }
  }, [isAuthenticated, capabilities.previewAssets, selectedStableId]);

  useEffect(() => {
    if (!isAuthenticated) {
      loadedWorkspaceRoutesRef.current.clear();
      setLoadingWorkspaceRoute("");
      return;
    }

    if (!visibleOperationsPage || !canAccessAppRoute(currentPrincipal, currentPage)) {
      return;
    }

    if (loadedWorkspaceRoutesRef.current.has(currentPage)) {
      return;
    }

    loadedWorkspaceRoutesRef.current.add(currentPage);
    void loadWorkspaceRoute(currentPage);
  }, [isAuthenticated, visibleOperationsPage, currentPage]);

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
    headers.set("x-forgetbase-surface", "web");

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (authKey) {
      headers.set("authorization", `Bearer ${authKey}`);
    } else if (unsafeMethods.has((init.method ?? "GET").toUpperCase())) {
      const csrfToken = readCookie(csrfCookieName);

      if (csrfToken) {
        headers.set("x-forgetbase-csrf", csrfToken);
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

  async function requestBinary(path: string, init: RequestInit = {}, authKey = apiKey): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("x-forgetbase-surface", "web");

    if (authKey) {
      headers.set("authorization", `Bearer ${authKey}`);
    } else if (unsafeMethods.has((init.method ?? "GET").toUpperCase())) {
      const csrfToken = readCookie(csrfCookieName);
      if (csrfToken) headers.set("x-forgetbase-csrf", csrfToken);
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

    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return response;
  }

  async function refreshHealth(authKey = apiKey) {
    try {
      const healthResponse = await request<{ status: string }>("/health", {}, authKey);
      setHealth(healthResponse.status);
    } catch {
      setHealth("offline");
    }
  }

  async function loadAttachmentReconciliation(verifyContent = false) {
    try {
      const report = await request<AttachmentReconciliationReport>("/admin/attachments/reconcile", {
        method: "POST",
        body: JSON.stringify({ dryRun: true, verifyContent })
      });
      setAttachmentReconciliation(report);
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error ? reconciliationError.message : String(reconciliationError));
    }
  }

  async function loadSystemVersion(authKey = apiKey) {
    const authenticationEpoch = authenticationEpochRef.current;
    const nextSystemVersion = await request<SystemVersionResponse>("/system/version", {}, authKey);
    if (authenticationEpoch !== authenticationEpochRef.current) return;
    setSystemVersion(nextSystemVersion);
    if (!nextSystemVersion.updateManagement.authorized || !nextSystemVersion.updateManagement.configured || nextSystemVersion.installationMode === "hosted") {
      setUpdateAvailable(false);
      return;
    }
    try {
      const updateStatus = await request<UpdateSystemStatus>("/system/updates", {}, authKey);
      if (authenticationEpoch !== authenticationEpochRef.current) return;
      setUpdateAvailable(Boolean(updateStatus.availableUpdate?.updateAvailable));
    } catch {
      setUpdateAvailable(false);
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

      const shouldSurfaceSessionError = Boolean(authKey || sessionCookieActive);

      if (authKey && sessionErrorMessage.startsWith("401 ")) {
        setApiKey("");
      } else if (shouldSurfaceSessionError && !sessionErrorMessage.startsWith("401 ")) {
        setError(sessionErrorMessage);
      }

      return null;
    }
  }

  async function initializeSession() {
    setAuthState("checking");
    setError("");
    await refreshHealth();

    if (!apiKey && !sessionCookieActive) {
      setAuthState("unauthenticated");
      return;
    }

    const principal = await checkAuthenticatedSession();

    if (principal) {
      await Promise.all([
        refresh(),
        ...(getAppCapabilities(principal).manageSystem ? [loadSystemVersion()] : [])
      ]);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const tenantId = loginTenantId.trim() || localDevLoginDefaults.tenantId;
      const response = await request<AuthLoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          email: loginEmail.trim(),
          password: loginPassword,
          keyName: "web-login",
          deviceLabel: "Web browser"
        })
      }, "");
      const localAuthKey = localSplitOriginAuthKey(response.secret);
      setSessionCookieActive(!localAuthKey);
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
        allowedSurfaces: response.apiKey.allowedSurfaces,
        groupIds: []
      });
      setApiKey(localAuthKey);
      setLoginPassword("");
      setMessage(`Signed in as ${response.user.email}`);
      await Promise.all([
        refresh(localAuthKey),
        ...(response.user.role === "admin" && response.apiKey.scopes.includes("admin") ? [loadSystemVersion(localAuthKey)] : [])
      ]);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    }
  }

  function clearAuthenticatedState() {
    authenticationEpochRef.current += 1;
    setApiKey("");
    setSessionCookieActive(false);
    setAuthState("unauthenticated");
    setCurrentPrincipal(null);
    setSystemVersion(null);
    setUpdateAvailable(false);
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
    setAuthoringMode(null);
    setAuthoringForm(createEmptyAssetAuthoringForm("", defaultAuthoringReviewDate()));
    setAuthoringErrors({});
    setAuthoringSubmitError("");
    setIsSavingPage(false);
    authoringEditTargetRef.current = null;
    onSessionEnded?.();
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
      const localAuthKey = localSplitOriginAuthKey(response.secret);
      setSessionCookieActive(!localAuthKey);
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
        allowedSurfaces: response.apiKey.allowedSurfaces,
        groupIds: []
      });
      setApiKey(localAuthKey);
      setMessage(`Signed in as ${response.user.email}`);
      await refresh(localAuthKey);
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
      const assetResponse = { assets: getAppCapabilities(principal).previewAssets ? await loadAssetCollection(request, { preview: true, authKey }) : [] };
      const nextSelectedStableId = selectedStableId || assetResponse.assets[0]?.stableId || "";
      setAssets(assetResponse.assets);
      setSelectedStableId(nextSelectedStableId);

      if (!nextSelectedStableId) {
        setAssetDetail(null);
      }

      setMessage(`Loaded ${assetResponse.assets.length} assets`);
    } catch (loadError) {
      const loadErrorMessage = loadError instanceof Error ? loadError.message : String(loadError);

      if (loadErrorMessage.startsWith("401 ")) {
        if (authoringDirtyRef.current) {
          setAuthoringSubmitError("Your session has expired. Your unsaved text is still here. Copy your changes before signing out and signing in again.");
          return;
        }
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
    const loadEpoch = ++assetLoadEpochRef.current;
    setAssetDetail(null);

    if (!stableId) {
      setAssetDetail(null);
      setAttachments([]);
      setAttachmentsLoading(false);
      return;
    }

    setAttachments([]);
    setAttachmentsLoading(true);
    setAttachmentsError("");
    try {
      const detail = await request<AssetDetail>(`/assets/${encodeURIComponent(stableId)}?preview=true`);
      if (loadEpoch !== assetLoadEpochRef.current) return;
      setAssetDetail(detail);
      void loadAttachments(stableId, loadEpoch);
    } catch (loadError) {
      if (loadEpoch !== assetLoadEpochRef.current) return;
      setAssetDetail(null);
      setAttachments([]);
      setAttachmentsLoading(false);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  async function loadAttachments(stableId: string, loadEpoch = assetLoadEpochRef.current) {
    setAttachmentsLoading(true);
    setAttachmentsError("");
    try {
      const response = await request<{ attachments: Attachment[] }>(`/assets/${encodeURIComponent(stableId)}/attachments?preview=true`);
      if (loadEpoch !== assetLoadEpochRef.current) return;
      setAttachments(response.attachments);
    } catch (loadError) {
      if (loadEpoch !== assetLoadEpochRef.current) return;
      setAttachments([]);
      setAttachmentsError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (loadEpoch === assetLoadEpochRef.current) setAttachmentsLoading(false);
    }
  }

  async function uploadAttachment(file: File) {
    if (!assetDetail) return;
    const stableId = assetDetail.asset.stableId;
    const loadEpoch = assetLoadEpochRef.current;
    setAttachmentUploading(true);
    setAttachmentsError("");
    try {
      await requestBinary(`/assets/${encodeURIComponent(stableId)}/attachments`, {
        method: "POST",
        headers: attachmentUploadHeaders(file),
        body: file
      });
      await loadAttachments(stableId, loadEpoch);
      setMessage(`Uploaded ${file.name}`);
    } catch (uploadError) {
      setAttachmentsError(attachmentUploadErrorMessage(uploadError));
    } finally {
      setAttachmentUploading(false);
    }
  }

  async function downloadAttachment(attachment: Attachment) {
    if (!assetDetail) return;
    setAttachmentsError("");
    try {
      const response = await requestBinary(`/assets/${encodeURIComponent(assetDetail.asset.stableId)}/attachments/${encodeURIComponent(attachment.id)}/download?preview=true`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setAttachmentsError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    }
  }

  async function deleteAttachment(attachment: Attachment) {
    if (!assetDetail) return;
    const stableId = assetDetail.asset.stableId;
    const loadEpoch = assetLoadEpochRef.current;
    setAttachmentsError("");
    try {
      await request<Attachment>(`/assets/${encodeURIComponent(stableId)}/attachments/${encodeURIComponent(attachment.id)}`, {
        method: "DELETE"
      });
      await loadAttachments(stableId, loadEpoch);
      setMessage(`Deleted ${attachment.filename}`);
    } catch (deleteError) {
      setAttachmentsError(attachmentUploadErrorMessage(deleteError));
    } finally {
      setPendingAttachmentDelete(null);
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
    if (!assetDetail || pendingReleaseAction || !capabilities.publishAssets) {
      return;
    }

    setError("");
    setPendingReleaseAction("publish");
    const loadEpoch = assetLoadEpochRef.current;

    try {
      const detail = await request<AssetDetail>(`/assets/${encodeURIComponent(assetDetail.asset.stableId)}/publish`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersionId: assetDetail.asset.currentVersionId ?? undefined,
          reviewDueAt: publishReviewDueAt || undefined,
          changeNote: workflowNote || undefined
        })
      });
      if (loadEpoch === assetLoadEpochRef.current) setAssetDetail(detail);
      replaceAsset(detail.asset);
      if (loadEpoch === assetLoadEpochRef.current) setVersionSnapshot(null);
      setMessage(`Published ${detail.asset.stableId}`);
      await loadReviewQueue();
    } catch (publishError) {
      setError(assetMutationErrorMessage(publishError));
    } finally {
      setPendingReleaseAction(null);
    }
  }

  async function loadReviewQueue(append = false) {
    const epoch = ++reviewQueueEpochRef.current;
    setReviewQueueError("");
    setReviewQueueLoading(true);

    try {
      const params = new URLSearchParams({
        asOf: append && reviewQueue ? reviewQueue.asOf : new Date().toISOString().slice(0, 10),
        includeApproved: "false",
        limit: "25",
        offset: String(append ? reviewQueue?.nextOffset ?? 0 : 0)
      });
      const queue = await request<AssetReviewQueueResponse>(`/assets/review-queue?${params.toString()}`);
      if (epoch !== reviewQueueEpochRef.current) return;
      setReviewQueue((current) => append && current ? { ...queue, assets: [...current.assets, ...queue.assets.filter((asset) => !current.assets.some((existing) => existing.id === asset.id))] } : queue);
    } catch (reviewError) {
      if (epoch !== reviewQueueEpochRef.current) return;
      setReviewQueueError(reviewError instanceof Error ? reviewError.message : String(reviewError));
    } finally {
      if (epoch === reviewQueueEpochRef.current) setReviewQueueLoading(false);
    }
  }

  async function completeAssetReview() {
    if (!assetDetail || pendingReleaseAction || !capabilities.reviewAssets) {
      return;
    }

    setError("");
    setPendingReleaseAction("review");
    const loadEpoch = assetLoadEpochRef.current;

    try {
      const detail = await request<AssetDetail>(`/assets/${encodeURIComponent(assetDetail.asset.stableId)}/review`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersionId: assetDetail.asset.currentVersionId ?? undefined,
          status: "approved",
          reviewDueAt: publishReviewDueAt || assetDetail.asset.reviewDueAt,
          changeNote: workflowNote || undefined
        })
      });
      if (loadEpoch === assetLoadEpochRef.current) setAssetDetail(detail);
      replaceAsset(detail.asset);
      await loadReviewQueue();
      setMessage(`Reviewed ${detail.asset.stableId}. ${detail.asset.currentVersionId !== detail.asset.publishedVersionId ? "The draft is ready to publish." : "The published version is reviewed."}`);
    } catch (reviewError) {
      setError(assetMutationErrorMessage(reviewError));
    } finally {
      setPendingReleaseAction(null);
    }
  }

  async function restoreVersion() {
    if (!assetDetail || !selectedVersionNumber || pendingReleaseAction || !capabilities.restoreAssets) {
      return;
    }

    setError("");
    setPendingReleaseAction("restore");
    const loadEpoch = assetLoadEpochRef.current;

    try {
      const detail = await request<AssetDetail>(`/assets/${encodeURIComponent(assetDetail.asset.stableId)}/restore`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersionId: assetDetail.asset.currentVersionId ?? undefined,
          versionNumber: Number.parseInt(selectedVersionNumber, 10),
          changeNote: workflowNote || undefined
        })
      });
      if (loadEpoch === assetLoadEpochRef.current) setAssetDetail(detail);
      replaceAsset(detail.asset);
      if (loadEpoch === assetLoadEpochRef.current) setVersionSnapshot(null);
      setMessage(`Created a new draft of ${detail.asset.stableId} from v${selectedVersionNumber}. The published version is unchanged.`);
    } catch (restoreError) {
      setError(assetMutationErrorMessage(restoreError));
    } finally {
      setPendingReleaseAction(null);
    }
  }

  function replaceAsset(asset: AssetRecord) {
    setAssets((current) => current.some((candidate) => candidate.id === asset.id)
      ? current.map((candidate) => candidate.id === asset.id ? asset : candidate)
      : [asset, ...current]
    );
  }

  function updateAuthoringField(field: AssetAuthoringField, value: string) {
    if (field === "stableId") authoringIdEditedRef.current = true;
    setAuthoringForm((current) => ({ ...current, [field]: value,
      ...(field === "title" && authoringMode === "create" && !authoringIdEditedRef.current ? { stableId: suggestedPageId(value) } : {})
    }) as AssetAuthoringFormState);
    setAuthoringErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
    setAuthoringSubmitError("");
  }

  function startCreatePage() {
    const ownerId = currentPrincipal?.userId ?? currentPrincipal?.principalId ?? "";
    const form = createEmptyAssetAuthoringForm(ownerId, defaultAuthoringReviewDate());
    authoringIdEditedRef.current = false;
    authoringInitialFormRef.current = form;
    setAuthoringForm(form);
    setAuthoringErrors({});
    setAuthoringSubmitError("");
    authoringEditTargetRef.current = null;
    setEditorReady(false);
    setAuthoringMode("create");
    setAssetContentView("human");
  }

  function startEditPage() {
    if (!assetDetail) {
      return;
    }

    const currentDocument = assetDetail.humanDocuments[0];
    if (currentDocument && currentDocument.format !== "markdown") {
      setError(`This lean editor supports Markdown pages. ${currentDocument.format} content must be updated through the API or CLI.`);
      return;
    }

    const form = assetAuthoringFormFromDetail(assetDetail);
    authoringInitialFormRef.current = form;
    setAuthoringForm(form);
    setAuthoringErrors({});
    setAuthoringSubmitError("");
    authoringEditTargetRef.current = {
      stableId: assetDetail.asset.stableId,
      currentVersionId: assetDetail.asset.currentVersionId,
      metadata: assetDetail.asset.metadata,
      humanDocument: currentDocument
    };
    setEditorReady(false);
    setAuthoringMode("edit");
    setAssetContentView("human");
  }

  function cancelPageAuthoring() {
    authoringDirtyRef.current = false;
    authoringInitialFormRef.current = null;
    setAuthoringMode(null);
    setAuthoringErrors({});
    setAuthoringSubmitError("");
    authoringEditTargetRef.current = null;
  }

  function hasPendingAuthoringChanges(): boolean {
    // Save/cancel ends the session before React unmounts the editor and blocker.
    if (!authoringInitialFormRef.current) return false;
    // Nested editor cells can hold an edit before the root onChange callback.
    let dirty = authoringDirtyRef.current;
    if (richEditorEnabled && markdownEditorRef.current) {
      try {
        const snapshot = markdownEditorRef.current.getSnapshot();
        dirty ||= !snapshot.ready || snapshot.value !== authoringInitialFormRef.current?.body;
      } catch {
        dirty = true;
      }
    }
    authoringDirtyRef.current = dirty;
    return dirty;
  }

  function requestLeaveAuthoring(proceed: () => void) {
    if (!hasPendingAuthoringChanges()) { proceed(); return; }
    pendingLeaveRef.current = proceed;
    setIsLeaveDialogOpen(true);
  }

  function discardAndLeave() {
    const proceed = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    setIsLeaveDialogOpen(false);
    cancelPageAuthoring();
    proceed?.();
  }

  async function saveAndLeave() {
    const proceed = pendingLeaveRef.current;
    if (await saveAuthoredPage(undefined, true)) {
      pendingLeaveRef.current = null;
      setIsLeaveDialogOpen(false);
      proceed?.();
    } else {
      // Return to the editor with its text, field errors and conflict intact.
      pendingLeaveRef.current = null;
      setIsLeaveDialogOpen(false);
    }
  }

  async function saveAuthoredPage(event?: FormEvent, leaving = false): Promise<boolean> {
    event?.preventDefault();

    if (!authoringMode || isSavingPage) {
      return false;
    }

    let formToSave = authoringForm;
    if (richEditorEnabled) {
      try {
        const snapshot = markdownEditorRef.current?.getSnapshot();
        if (!snapshot?.ready) {
          setAuthoringSubmitError(snapshot?.reason ?? "The editor is loading. Try saving when it is ready.");
          return false;
        }
        formToSave = { ...authoringForm, body: snapshot.value };
      } catch {
        setAuthoringSubmitError("The editor could not prepare this save. Your text is still here. Switch to Source and copy your changes before retrying.");
        return false;
      }
    }

    const editTargetParent = typeof authoringEditTargetRef.current?.metadata.readerParentId === "string"
      ? authoringEditTargetRef.current.metadata.readerParentId
      : "";
    const knownStableIds = assets.map((asset) => asset.stableId);
    if (editTargetParent && !knownStableIds.includes(editTargetParent)) {
      knownStableIds.push(editTargetParent);
    }
    const fieldErrors = validateAssetAuthoringForm(
      formToSave,
      authoringMode,
      knownStableIds,
      new Map(assets.flatMap((asset) => {
        const parentId = readerParentId(asset);
        return parentId ? [[asset.stableId, parentId] as const] : [];
      }))
    );

    if (Object.keys(fieldErrors).length) {
      document.getElementById("authoring-settings")?.setAttribute("open", "");
      setAuthoringErrors(fieldErrors);
      setAuthoringSubmitError("Fix the highlighted fields, then save again.");
      return false;
    }

    const editTarget = authoringEditTargetRef.current;
    if (authoringMode === "edit" && !editTarget) {
      setAuthoringSubmitError("This page is no longer loaded. Cancel editing, reopen it, and try again.");
      return false;
    }

    setError("");
    setMessage("");
    setAuthoringSubmitError("");
    setIsSavingPage(true);
    const authenticationEpoch = authenticationEpochRef.current;

    try {
      const detail = authoringMode === "create"
        ? await request<AssetDetail>("/assets", {
            method: "POST",
            body: JSON.stringify(buildAssetCreateInput(formToSave))
          })
        : await request<AssetDetail>(`/assets/${encodeURIComponent(editTarget!.stableId)}/versions`, {
            method: "POST",
            body: JSON.stringify({
              ...buildAssetUpdateInput(formToSave, editTarget!.metadata, editTarget!.humanDocument),
              expectedVersionId: editTarget!.currentVersionId ?? undefined
            })
          });
      const savedMode = authoringMode;

      if (authenticationEpoch !== authenticationEpochRef.current) {
        return false;
      }

      setAssetDetail(detail);
      replaceAsset(detail.asset);
      setSelectedStableId(detail.asset.stableId);
      setVersionSnapshot(null);
      setAuthoringMode(null);
      authoringDirtyRef.current = false;
      authoringInitialFormRef.current = null;
      setAuthoringErrors({});
      authoringEditTargetRef.current = null;
      if (!leaving) {
        const pending = pendingLeaveRef.current;
        pendingLeaveRef.current = null;
        setIsLeaveDialogOpen(false);
        if (pending) pending();
        else onNavigate("asset-read", detail.asset.stableId);
      }
      setMessage((savedMode === "create"
        ? `Created ${detail.asset.stableId} as a draft`
        : `Saved ${detail.asset.stableId} as a new draft version`) +
        (detail.processing?.reconciliation === "pending" ? ". Saved successfully; background reconciliation is pending." : "")
      );
      return true;
    } catch (saveError) {
      if (authenticationEpoch !== authenticationEpochRef.current) {
        return false;
      }

      const saveErrorMessage = saveError instanceof Error ? saveError.message : String(saveError);

      if (saveErrorMessage.includes("asset_version_conflict") || (authoringMode === "edit" && saveErrorMessage.startsWith("409 "))) {
        setAuthoringSubmitError("This page changed while you were editing. Your text is still here. Copy your changes, reload the page, and compare the latest draft before saving again.");
      } else if (authoringMode === "create" && saveErrorMessage.startsWith("409 ")) {
        setAuthoringErrors((current) => ({ ...current, stableId: "This stable ID is already in use." }));
        setAuthoringSubmitError("Choose a different stable ID, then save again.");
      } else if (saveErrorMessage.startsWith("401 ")) {
        setAuthoringSubmitError("Your session has expired. Your text is still here. Copy your changes before signing in again.");
      } else if (saveErrorMessage.startsWith("403 ")) {
        setAuthoringSubmitError("Your account cannot save this page. Your text is still here. Copy your changes and ask an administrator to check your access.");
      } else {
        setAuthoringSubmitError("Your changes remain in the editor. Try saving again. If it still fails, ask an administrator for help.");
      }
      return false;
    } finally {
      if (authenticationEpoch === authenticationEpochRef.current) {
        setIsSavingPage(false);
      }
    }
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
    setIsGeneratingExport(true);

    try {
      const response = await request<GeneratedPackage>(exportEndpointPath);

      if (exportFormat === "okf" && (!("format" in response) || response.format !== "okf")) {
        throw new Error("Expected OKF export package, but the API returned the JSON package shape.");
      }

      if (exportFormat === "json" && "format" in response) {
        throw new Error("Expected JSON export package, but the API returned an OKF package.");
      }

      setExportPackage(response);
      setMessage(`Generated ${response.packageName} ${exportFormat.toUpperCase()} package with ${response.assetCount} assets`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setIsGeneratingExport(false);
    }
  }

  async function copyText(value: string, label: string) {
    setError("");

    try {
      await navigator.clipboard.writeText(value);
      setMessage(`Copied ${label}`);
    } catch (clipboardError) {
      setError(clipboardError instanceof Error ? clipboardError.message : String(clipboardError));
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

  async function loadTelemetrySummary(windowDays: AnalyticsWindowDays = analyticsWindowDays) {
    setError("");
    setAnalyticsLoading(true);

    try {
      const until = new Date();
      const since = new Date(until.getTime() - windowDays * 24 * 60 * 60 * 1_000);
      const query = new URLSearchParams({
        limit: "200",
        since: since.toISOString(),
        until: until.toISOString()
      });
      const summary = await request<TelemetryAnalyticsSummary>(`/telemetry/summary?${query.toString()}`);
      setTelemetrySummary(summary);
      setMessage(`Summary loaded for ${summary.retrieval.eventCount} retrieval events`);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : String(summaryError));
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function loadTelemetryRetentionPolicy() {
    const epoch = ++retentionLoadEpochRef.current;
    setRetentionLoadState("loading");
    setRetentionError("");
    setTelemetryRetentionPurgeResult(null);

    try {
      const policy = await request<TelemetryRetentionPolicy>("/admin/telemetry-retention");
      if (epoch !== retentionLoadEpochRef.current) return;
      setTelemetryRetentionPolicy(policy);
      setRetentionRetrievalDays(formatRetentionInput(policy.retrievalEventRetentionDays));
      setRetentionAuditDays(formatRetentionInput(policy.auditEventRetentionDays));
      setRetentionFeedbackDays(formatRetentionInput(policy.feedbackRetentionDays));
      setRetentionLoadState("loaded");
    } catch (retentionError) {
      if (epoch !== retentionLoadEpochRef.current) return;
      setRetentionLoadState("error");
      setRetentionError(`The saved retention policy could not be loaded. ${retentionError instanceof Error ? retentionError.message : String(retentionError)}`);
    }
  }

  async function saveTelemetryRetentionPolicy(event: FormEvent) {
    event.preventDefault();
    if (retentionLoadState !== "loaded" || !telemetryRetentionPolicy || retentionBusy) return;
    setRetentionError("");
    setRetentionBusy(true);

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
      setTelemetryRetentionPurgeResult(null);
      setMessage("Saved telemetry retention policy");
    } catch (retentionError) {
      setRetentionError(retentionError instanceof Error ? retentionError.message : String(retentionError));
    } finally {
      setRetentionBusy(false);
    }
  }

  async function purgeTelemetryRetention(dryRun: boolean) {
    if (retentionLoadState !== "loaded" || !telemetryRetentionPolicy || retentionBusy) return;
    setRetentionError("");
    setRetentionBusy(true);

    try {
      const result = await request<TelemetryRetentionPurgeResult>("/admin/telemetry-retention/purge", {
        method: "POST",
        body: JSON.stringify({ dryRun })
      });
      setTelemetryRetentionPurgeResult(result);
      setMessage(`${dryRun ? "Previewed" : "Purged"} telemetry retention`);
    } catch (retentionError) {
      setRetentionError(retentionError instanceof Error ? retentionError.message : String(retentionError));
    } finally {
      setRetentionBusy(false);
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
      setMessage("Loaded personal data policy");
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
      setMessage("Saved personal data policy");
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

  function navigatePage(route: string, pageId?: string, view?: string) {
    onNavigate(normalizePageRoute(route), pageId, view);
  }

  function openAssetRead(stableId: string) {
    navigatePage("asset-read", stableId);
  }

  function routeBreadcrumbs(route: string) {
    const normalizedRoute = normalizePageRoute(route);

    if (normalizedRoute === "search") {
      return [
        { label: "Content", onClick: () => navigatePage("admin/content") },
        { label: "Search", current: true }
      ];
    }

    if (normalizedRoute === "asset-read") {
      return [
        { label: "Content", onClick: () => navigatePage("admin/content") },
        { label: "Page detail", current: true }
      ];
    }

    if (normalizedRoute === "versions") {
      return [
        { label: "Reviews", onClick: () => navigatePage("admin/reviews") },
        { label: "Version compare", current: true }
      ];
    }

    if (normalizedRoute === "review") {
      return [
        { label: "Reviews", onClick: () => navigatePage("admin/reviews") },
        { label: "Review queue", current: true }
      ];
    }

    if (normalizedRoute === "distribute") {
      return [
        { label: "Content", onClick: () => navigatePage("admin/content") },
        { label: "Exports", current: true }
      ];
    }

    if (operationsRoutes.has(normalizedRoute)) {
      return [
        { label: "System", onClick: () => navigatePage("admin/system/health") },
        { label: operationsPageCopy[normalizedRoute]?.title ?? "System", current: true }
      ];
    }

    return [
      { label: "Content", current: true }
    ];
  }

  function workspaceLoadersForRoute(route: string): Array<() => Promise<void>> {
    switch (normalizePageRoute(route)) {
      case "review":
        return [loadReviewQueue];
      case "activity":
        return [
          loadTelemetrySummary,
          loadTelemetry,
          loadAuditEvents,
          loadFeedback,
          loadEvalRuns,
          loadEvalSummary
        ];
      case "health":
        return [
          () => refreshHealth(),
          () => loadAttachmentReconciliation(false),
          loadSystemVersion,
          loadTelemetrySummary,
          loadProviderHealth,
          loadActionExecutionPolicy,
          loadAgentActions,
          loadEvalRuns,
          loadEvalSummary,
          loadManagedQueryCachePolicy
        ];
      case "updates":
        return [loadSystemVersion];
      case "integrations":
        return [loadProviderConfigs, loadProviderHealth, loadAuthProviderConfigs];
      case "policies":
        return [
          loadTelemetryRetentionPolicy,
          loadManagedQueryPolicy,
          loadRetrievalRankingPolicy,
          loadEvalSchedulePolicy,
          loadActionExecutionPolicy,
          loadManagedQueryCachePolicy,
          loadManagedQueryCache,
          loadManagedQueryRetentionPolicy,
          loadSecretReferencePolicy,
          loadPiiRedactionPolicy
        ];
      case "access":
        return [
          loadUsers,
          loadServiceAccounts,
          loadServiceAccountPolicy,
          loadGroups,
          loadApiKeys,
          loadLoginSessions,
          loadApiKeyRotationReport
        ];
      case "approvals":
        return [loadActionExecutionPolicy, loadAgentActions];
      default:
        return [];
    }
  }

  async function loadWorkspaceRoute(route: string) {
    const normalizedRoute = normalizePageRoute(route);
    const loaders = workspaceLoadersForRoute(normalizedRoute);

    if (!loaders.length) {
      return;
    }

    setLoadingWorkspaceRoute(normalizedRoute);

    try {
      await Promise.all(loaders.map((loader) => loader()));
    } finally {
      setLoadingWorkspaceRoute((current) => current === normalizedRoute ? "" : current);
    }
  }

  function handleCommandOpenChange(open: boolean) {
    setIsCommandOpen(open);
  }

  function toggleDensity() {
    setDensity((current) => current === "comfortable" ? "compact" : "comfortable");
  }

  function toggleNavCollapsed() {
    setIsNavCollapsed((current) => !current);
  }

  function commitNavWidth(width: number) {
    setIsNavCollapsed(false);
    setNavWidth(clampNavWidth(width));
  }

  function startNavResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    const nav = event.currentTarget.closest(".side-nav");

    if (!(nav instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    const handle = event.currentTarget;
    const navLeft = nav.getBoundingClientRect().left;

    handle.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("is-resizing-nav");
    commitNavWidth(event.clientX - navLeft);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      commitNavWidth(moveEvent.clientX - navLeft);
    };
    const stopResize = () => {
      document.documentElement.classList.remove("is-resizing-nav");
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResize);
      document.removeEventListener("pointercancel", stopResize);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopResize);
    document.addEventListener("pointercancel", stopResize);
  }

  function resizeNavFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 32 : 16;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitNavWidth(navWidth - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commitNavWidth(navWidth + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      commitNavWidth(navWidthMin);
    } else if (event.key === "End") {
      event.preventDefault();
      commitNavWidth(navWidthMax);
    }
  }

  function toggleNavSection(sectionKey: string) {
    setExpandedNavSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey]
    }));
  }

  const operationsPage = operationsPageCopy[currentPage] ?? defaultOperationsPageCopy;
  const activeAssetContentView = assetContentView;
  const allNavSections: NavSectionConfig[] = [
    {
      label: "Content",
      folderLabel: "Pages",
      folderIcon: <BookOpen aria-hidden="true" />,
      folderRoute: "library",
      activeRoutes: ["library", "search", "asset-read"],
      count: assets.length,
      leaves: [
        { route: "library", label: "All content", count: approvedAssets },
        { route: "search", label: "Search and ask" },
        ...(capabilities.managePageGrants && !capabilities.previewAssets ? [{ route: "asset-read", label: "Page access" }] : [])
      ]
    },
    {
      label: "Review",
      folderLabel: "Reviews",
      folderIcon: <ClipboardText aria-hidden="true" />,
      folderRoute: "review",
      activeRoutes: ["review", "versions"],
      count: reviewDueAssets,
      leaves: [
        { route: "review", label: "Review queue", badge: reviewQueue ? { label: reviewQueue.totalCount ?? reviewQueue.assets.length, tone: "warn" } : undefined }
      ]
    },
    {
      label: "Exports",
      folderLabel: "Exports",
      folderIcon: <Package aria-hidden="true" />,
      folderRoute: "distribute",
      activeRoutes: ["distribute"],
      count: exportPackage?.assetCount ?? exportEligibleAssets,
      leaves: [
        {
          route: "distribute",
          label: "Export builder",
          badge: exportPackage ? { label: "format" in exportPackage ? exportPackage.format : "json", tone: "ok" } : undefined
        }
      ]
    },
    {
      label: "System",
      folderLabel: "System",
      folderIcon: <GearSix aria-hidden="true" />,
      folderRoute: "health",
      activeRoutes: [...operationsRouteValues],
      count: systemVersion?.updateManagement.authorized ? 8 : 7,
      leaves: [
        { route: "activity", label: "Activity" },
        { route: "health", label: "Health", badge: health === "ok" ? { label: "ok", tone: "ok" } : { label: health, tone: "bad" } },
        ...(systemVersion?.updateManagement.authorized ? [{
          route: "updates",
          label: "Updates",
          badge: updateAvailable ? { label: "available", tone: "warn" as const } : undefined
        }] : []),
        { route: "integrations", label: "Integrations", count: providerConfigs.length + authProviderConfigs.length },
        { route: "settings", label: "Settings" },
        { route: "policies", label: "Policies" },
        { route: "access", label: "Access" },
        { route: "approvals", label: "Approvals", badge: agentActions.length ? { label: agentActions.length, tone: "warn" } : undefined }
      ]
    }
  ];
  const navSections = allNavSections.map((section) => ({
    ...section,
    leaves: section.leaves.filter((leaf) => canAccessAppRoute(currentPrincipal, leaf.route))
  })).filter((section) => section.leaves.length > 0).map((section) => ({
    ...section,
    folderRoute: canAccessAppRoute(currentPrincipal, section.folderRoute) ? section.folderRoute : section.leaves[0]!.route
  }));
  const commandSections = navSections.map((section) => {
    const routes = new Map<string, { route: string; label: string; badge?: string | number }>();

    routes.set(section.folderRoute, {
      route: section.folderRoute,
      label: section.folderLabel,
      badge: section.count
    });

    section.leaves.forEach((leaf) => {
      routes.set(leaf.route, {
        route: leaf.route,
        label: leaf.label,
        badge: leaf.badge?.label ?? leaf.count
      });
    });

    return {
      label: section.label,
      routes: Array.from(routes.values())
    };
  });
  const renderNavChrome = (label: string, count?: number) => (
    <div className="nav-chrome">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="nav-collapse-button"
        aria-label={isNavCollapsed ? `Expand ${label}` : `Collapse ${label}`}
        aria-pressed={isNavCollapsed}
        onClick={toggleNavCollapsed}
      >
        <List aria-hidden="true" />
      </Button>
      <span className="nav-chrome-label">
        {label}{count === undefined ? null : <span className="nav-chrome-count">({count})</span>}
      </span>
    </div>
  );
  const renderNavResizer = () => (
    <button
      type="button"
      className="nav-resizer"
      aria-label="Resize page navigation"
      aria-valuemin={navWidthMin}
      aria-valuemax={navWidthMax}
      aria-valuenow={navWidth}
      aria-orientation="vertical"
      role="separator"
      onPointerDown={startNavResize}
      onKeyDown={resizeNavFromKeyboard}
    />
  );
  const renderAdminShellHeader = () => (
    <div className="admin-side-header">
      <h2>Manage ForgetBase</h2>
      <p>Content, access, exports, and system settings.</p>
    </div>
  );
  const renderNavigationSections = (onNavigate?: () => void) => (
    <div className="side-nav-scroll">
      {navSections.map((section) => {
        const isExpanded = Boolean(expandedNavSections[section.folderRoute]);
        const isActiveAncestor = section.activeRoutes.includes(currentPage);
        const branchId = `nav-branch-${section.folderRoute}`;

        return (
          <div className="nav-group" key={section.label}>
            <div className="nav-tree">
              <Button
                className={`nav-folder ${isActiveAncestor ? "is-active-ancestor" : ""} ${isExpanded ? "is-expanded" : ""}`}
                type="button"
                variant="ghost"
                aria-expanded={isExpanded}
                aria-controls={branchId}
                onClick={() => toggleNavSection(section.folderRoute)}
              >
                <span className="folder-glyph" aria-hidden="true">{section.folderIcon}</span>
                <span className="nav-text">{section.folderLabel}</span>
                {section.count === undefined ? null : <Badge variant="neutral" className="nav-count">{section.count}</Badge>}
                <span className="nav-chevron" aria-hidden="true"></span>
              </Button>
              {isExpanded ? (
                <div className="nav-branch" id={branchId}>
                  {section.leaves.map((leaf) => {
                    const hasIcon = Boolean(leaf.showIcon && leaf.icon);

                    return (
                      <Button
                        key={leaf.route}
                        className={`nav-link nav-leaf ${hasIcon ? "has-icon" : "is-iconless"} ${currentPage === normalizePageRoute(leaf.route) ? "active" : ""}`}
                        type="button"
                        variant="ghost"
                        aria-current={currentPage === normalizePageRoute(leaf.route) ? "page" : undefined}
                        onClick={() => {
                          navigatePage(leaf.route);
                          onNavigate?.();
                        }}
                      >
                        {hasIcon ? <span className="nav-icon">{leaf.icon}</span> : null}
                        <span className="nav-text">{leaf.label}</span>
                        {leaf.count === undefined ? null : <Badge variant="neutral" className="nav-count">{leaf.count}</Badge>}
                        {leaf.badge ? <Badge variant={navBadgeVariant(leaf.badge.tone)} className="nav-badge">{leaf.badge.label}</Badge> : null}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
  const shellStyle = {
    "--nav": `${isNavCollapsed ? navCollapsedWidth : navWidth}px`
  } as CSSProperties & Record<"--nav", string>;

  return (
    <div
      className={`app-shell ${isAuthenticated ? "admin-shell" : "auth-shell"} ${isNavCollapsed ? "nav-collapsed" : ""}`}
      data-density={density}
      style={shellStyle}
    >
      <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <AlertDialog open={isLeaveDialogOpen} onOpenChange={(open) => { if (!open && !isSavingPage) { setIsLeaveDialogOpen(false); pendingLeaveRef.current = null; } }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Save your page before leaving?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved. Save a draft, discard the changes, or continue editing.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingPage}>Continue editing</AlertDialogCancel>
            <Button type="button" variant="danger" disabled={isSavingPage} onClick={discardAndLeave}>Discard changes</Button>
            <Button type="button" variant="primary" disabled={isSavingPage || (richEditorEnabled && !editorReady)} onClick={() => void saveAndLeave()}>{isSavingPage ? "Saving…" : "Save draft and leave"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <img className="mark-image" src="/favicon.svg" alt="" />
          </span>
          <span className="brand-name">ForgetBase</span>
          {isAuthenticated ? (
            <div className="health brand-health">
              <span className={`health-dot ${health === "ok" ? "ok" : "bad"}`}></span>
              <span>API {health}</span>
            </div>
          ) : null}
        </div>
        {isAuthenticated ? (
          <div className="topbar-main">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="mobile-nav-trigger"
              aria-label="Open navigation"
              onClick={() => setIsMobileNavOpen(true)}
            >
              <List aria-hidden="true" />
            </Button>
            <Button
              ref={commandTriggerRef}
              variant="command"
              className="command"
              type="button"
              onClick={() => handleCommandOpenChange(true)}
            >
              <MagnifyingGlass aria-hidden="true" />
              <span>Search admin pages</span>
              <span className="kbd">Cmd K</span>
            </Button>
            <div className="topbar-actions">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="identity-trigger"
                    aria-label={`Account menu for ${displayIdentity}`}
                  >
                    <span className="avatar">{displayInitials}</span>
                    <span className="identity-name">{displayIdentity}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="identity-menu">
                  <DropdownMenuLabel>
                    <span className="identity-menu-header">
                      <span className="identity-menu-label">Signed in</span>
                      <span className="identity-menu-title">
                        <span className="identity-menu-value">{displayIdentity}</span>
                        {currentPrincipal?.role ? <Badge variant="neutral">{currentPrincipal.role}</Badge> : null}
                      </span>
                      <span className="identity-menu-email">{currentPrincipal?.email ?? "No email available"}</span>
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onSelect={() => navigatePage("account-settings")}>
                      Settings
                    </DropdownMenuItem>
                    {canUseAdministration ? (
                      <DropdownMenuItem onSelect={() => navigatePage("reader")}>
                        Reader view
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={toggleDensity}>
                      {density === "comfortable" ? "Compact density" : "Comfortable density"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void refresh()}>
                      Refresh
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => requestLeaveAuthoring(() => void logout())}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : (
          <div className="topbar-main public-topbar-main">
            <span aria-hidden="true" />
          </div>
        )}
      </header>

      {isAuthenticated ? (
        <>
          <CommandDialog
            open={isCommandOpen}
            onOpenChange={handleCommandOpenChange}
            title="Command palette"
            description="Move between admin pages."
            className="command-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.setTimeout(() => commandTriggerRef.current?.focus(), 100);
            }}
          >
            <Command>
              <CommandInput placeholder="Go to an admin page..." />
              <CommandList>
                <CommandEmpty>No route found.</CommandEmpty>
                {commandSections.map((section) => (
                  <CommandGroup key={section.label} heading={section.label}>
                    {section.routes.map((route) => (
                      <CommandItem
                        key={route.route}
                        value={`${section.label} ${route.label} ${route.route} ${canonicalRouteHash(route.route)}`}
                        onSelect={() => {
                          navigatePage(route.route);
                          handleCommandOpenChange(false);
                        }}
                      >
                        <span>{route.label}</span>
                        {route.badge === undefined ? null : <Badge variant="neutral" className="command-route-badge">{route.badge}</Badge>}
                        <CommandShortcut>#{canonicalRouteHash(route.route)}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </CommandDialog>

          <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
            <SheetContent side="left" className="mobile-nav-sheet">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>Manage content, access, exports, and system settings.</SheetDescription>
              </SheetHeader>
              <nav className="sheet-nav tree-nav" aria-label="Mobile main pages">
                {renderAdminShellHeader()}
                {renderNavigationSections(() => setIsMobileNavOpen(false))}
              </nav>
            </SheetContent>
          </Sheet>

          <nav className="side-nav tree-nav admin-side-nav" aria-label="Admin pages" id="page-nav">
            {renderNavChrome("Pages")}
            {isNavCollapsed ? null : (
              <>
                {renderAdminShellHeader()}
                {renderNavigationSections()}
                {renderNavResizer()}
              </>
            )}
          </nav>

          <main className="main" id="main" tabIndex={-1}>
        {sessionCookieActive ? null : (
          <details className="developer-connection">
            <summary>Developer connection</summary>
            <Card className="control-bar" aria-label="Developer connection">
              <CardContent>
                <form className="connection-grid" onSubmit={(event) => event.preventDefault()}>
                  <div className="connection-field">
                    <Label htmlFor="shell-api-url">API URL</Label>
                    <Input
                      id="shell-api-url"
                      value={apiUrl}
                      onChange={(event) => setApiUrl(event.target.value)}
                      autoComplete="url"
                    />
                  </div>
                  <div className="connection-field">
                    <Label htmlFor="shell-api-key">API key</Label>
                    <Input
                      id="shell-api-key"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      type="password"
                      autoComplete="off"
                    />
                  </div>
                  <div className="connection-actions">
                    <Button type="button" onClick={() => void refresh()}><ArrowsClockwise aria-hidden="true" />Refresh</Button>
                    <Button type="button" onClick={() => requestLeaveAuthoring(() => void logout())}><SignOut aria-hidden="true" />Sign out</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </details>
        )}

        {error ? (
          <Alert variant="destructive" className="shell-alert">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {message && !(currentPage === "library" && /^Loaded \d+ assets$/.test(message)) ? (
          <Alert variant="success" className="shell-alert" role="status" aria-live="polite">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

          <section className={`page ${["library", "asset-read", "versions"].includes(currentPage) ? "active" : ""}`} data-page="library">
            {currentPage !== "library" || authoringMode ? (
            <RouteHeader
              className="page-route-header"
              breadcrumbs={routeBreadcrumbs(currentPage)}
              title={authoringMode ? authoringMode === "create" ? "Create page" : `Edit ${authoringForm.title || "page"}` : currentPage === "asset-read"
                ? assetDetail?.asset.title ?? "Reading room"
                : currentPage === "versions"
                  ? "Version Compare"
                  : "Content"}
              lede={authoringMode ? "Write the page, save a draft, then review and publish when it is ready." : currentPage === "versions"
                ? "Compare versions before restoring, publishing, or closing a review."
                : currentPage === "asset-read"
                  ? "Read the selected page with review state, access, versions, and source details."
                  : "Manage pages, policies, guides, templates, checklists, and other knowledge content."}
              actions={(
                <>
                  {currentPage === "library" && canWriteAssets && !authoringMode ? (
                    <Button type="button" variant="primary" onClick={startCreatePage} disabled={authoringMode !== null || isSavingPage}>New page</Button>
                  ) : null}
                  {currentPage === "asset-read" && assetDetail && capabilities.editAssets ? (
                    <Button type="button" onClick={startEditPage} disabled={authoringMode !== null || isSavingPage}>Edit page</Button>
                  ) : null}
                  <Button type="button" onClick={() => void refresh()} disabled={isSavingPage || authoringMode !== null}>
                    <ArrowsClockwise aria-hidden="true" />Refresh
                  </Button>
                </>
              )}
            />
            ) : null}
            <section className="workspace workspace--focused">
              {currentPage === "library" && !authoringMode ? (
                <ContentLibrary
                  assets={filteredLibraryAssets} total={assets.length}
                  query={libraryQuery} onQuery={setLibraryQuery}
                  view={libraryViewFilter} onView={setLibraryViewFilter}
                  sensitivity={librarySensitivityFilter} onSensitivity={setLibrarySensitivityFilter}
                  onClear={() => { setLibraryQuery(""); setLibraryViewFilter("all"); setLibrarySensitivityFilter("all"); }}
                  canCreate={canWriteAssets} onCreate={startCreatePage} onRefresh={() => void refresh()}
                  onSelect={setSelectedStableId} onOpen={openAssetRead} detail={assetDetail} error={error}
                />
              ) : null}
              {currentPage !== "library" || authoringMode ? (

              <SectionCard
                title={authoringMode === "create"
                  ? "Create page"
                  : authoringMode === "edit"
                    ? `Edit ${assetDetail?.asset.title ?? "page"}`
                    : assetDetail?.asset.title ?? "Asset detail"}
                description={authoringMode
                  ? "Save a Markdown page as a governed draft. Review and publish it when it is ready."
                  : "Page details"}
                variant="tool"
                className="min-w-0"
                actions={!authoringMode && assetDetail ? (
                  <Badge variant={isPublicReaderEligible(assetDetail.asset) ? "success" : "neutral"}>
                    {isPublicReaderEligible(assetDetail.asset) ? "public reader eligible" : "authenticated access"}
                  </Badge>
                ) : null}
                contentClassName="grid gap-4"
              >
                {authoringMode ? (
                  <form className="grid gap-5 page-authoring-form" onSubmit={(event) => void saveAuthoredPage(event)} noValidate>
                    <fieldset className="grid gap-5" style={{ minWidth: 0 }} disabled={isSavingPage}>
                    {authoringSubmitError ? (
                      <Alert variant="destructive" role="alert">
                        <AlertTitle>Page not saved</AlertTitle>
                        <AlertDescription>{authoringSubmitError}</AlertDescription>
                      </Alert>
                    ) : null}
                    {authoringMode === "edit" ? (
                      <Alert variant="warning">
                        <AlertTitle>Save changes as a new draft</AlertTitle>
                        <AlertDescription>
                          Readers will keep seeing the published version. Review and publish the new draft when it is ready.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                      <FormField label="Title" htmlFor="authoring-title" required errorText={authoringErrors.title}>
                        <Input
                          id="authoring-title"
                          value={authoringForm.title}
                          onChange={(event) => updateAuthoringField("title", event.target.value)}
                          aria-invalid={Boolean(authoringErrors.title)}
                        />
                      </FormField>
                      <FormField label="Summary" htmlFor="authoring-summary">
                        <Textarea
                          id="authoring-summary"
                          value={authoringForm.summary}
                          onChange={(event) => updateAuthoringField("summary", event.target.value)}
                          rows={2}
                        />
                      </FormField>
                    <div className="grid items-start gap-4 xl:grid-cols-2">
                      {richEditorEnabled ? <Suspense fallback={<p role="status">Loading Markdown editor…</p>}>
                        <RichMarkdownEditor ref={markdownEditorRef}
                          value={authoringForm.body}
                          onChange={(body) => { authoringDirtyRef.current = true; updateAuthoringField("body", body); }}
                          documentKey={`${authenticationEpochRef.current}:${authoringMode}:${authoringEditTargetRef.current?.stableId ?? "new"}:${authoringEditTargetRef.current?.currentVersionId ?? ""}`}
                          readOnly={isSavingPage} label="Page content" error={authoringErrors.body}
                          onReadyChange={setEditorReady} />
                      </Suspense> : (
                      <FormField
                        label="Markdown"
                        htmlFor="authoring-body"
                        required
                        errorText={authoringErrors.body}
                        helpText="Use headings, paragraphs, and ordered or unordered lists."
                      >
                        <Textarea
                          id="authoring-body"
                          value={authoringForm.body}
                          onChange={(event) => updateAuthoringField("body", event.target.value)}
                          rows={18}
                          className="font-mono text-sm leading-6"
                          aria-invalid={Boolean(authoringErrors.body)}
                        />
                      </FormField>
                      )}
                      <SectionCard title="Preview" description="Reader-style preview of the current draft." variant="compact">
                        {authoringForm.body.trim() ? (
                          <article className="reader-document">
                            <div className="reader-document-body">
                              <MarkdownDocument body={authoringForm.body} title={authoringForm.title || "Untitled page"} />
                            </div>
                          </article>
                        ) : (
                          <EmptyState title="Nothing to preview" description="Add Markdown content to see the page preview." />
                        )}
                      </SectionCard>
                    </div>
                    <details id="authoring-settings">
                      <summary>Page settings · ID, location, audience, and review</summary>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        label="Stable ID"
                        htmlFor="authoring-stable-id"
                        required
                        errorText={authoringErrors.stableId}
                        helpText={authoringMode === "edit"
                          ? "Stable IDs cannot change after creation."
                          : "Use a durable ID such as guide.release-checklist."}
                      >
                        <Input
                          id="authoring-stable-id"
                          value={authoringForm.stableId}
                          onChange={(event) => updateAuthoringField("stableId", event.target.value)}
                          disabled={authoringMode === "edit"}
                          aria-invalid={Boolean(authoringErrors.stableId)}
                          autoComplete="off"
                        />
                      </FormField>


                      <FormField
                        label="Parent page"
                        htmlFor="authoring-parent"
                        errorText={authoringErrors.parentStableId}
                        helpText="Optional. This controls where the page appears in reader navigation."
                      >
                        <NativeSelect
                          id="authoring-parent"
                          value={authoringForm.parentStableId}
                          onChange={(event) => updateAuthoringField("parentStableId", event.target.value)}
                          aria-invalid={Boolean(authoringErrors.parentStableId)}
                        >
                          <option value="">Top level</option>
                          {authoringForm.parentStableId && !assets.some((asset) => asset.stableId === authoringForm.parentStableId) ? (
                            <option value={authoringForm.parentStableId}>{authoringForm.parentStableId} · current parent</option>
                          ) : null}
                          {assets
                            .filter((asset) => asset.stableId !== authoringForm.stableId)
                            .sort((left, right) => left.title.localeCompare(right.title))
                            .map((asset) => (
                              <option key={asset.id} value={asset.stableId}>{asset.title} · {asset.stableId}</option>
                            ))}
                        </NativeSelect>
                      </FormField>
                      <FormField
                        label="Owner ID"
                        htmlFor="authoring-owner"
                        required
                        errorText={authoringErrors.ownerId}
                        helpText={authoringMode === "edit" ? "Ownership changes are not supported by the current version API." : undefined}
                      >
                        <Input
                          id="authoring-owner"
                          value={authoringForm.ownerId}
                          onChange={(event) => updateAuthoringField("ownerId", event.target.value)}
                          disabled={authoringMode === "edit"}
                          aria-invalid={Boolean(authoringErrors.ownerId)}
                        />
                      </FormField>
                      <FormField label="Review date" htmlFor="authoring-review-date" required errorText={authoringErrors.reviewDueAt}>
                        <Input
                          id="authoring-review-date"
                          type="date"
                          value={authoringForm.reviewDueAt}
                          onChange={(event) => updateAuthoringField("reviewDueAt", event.target.value)}
                          aria-invalid={Boolean(authoringErrors.reviewDueAt)}
                        />
                      </FormField>
                      <FormField label="Sensitivity" htmlFor="authoring-sensitivity" required>
                        <Select
                          value={authoringForm.sensitivity}
                          onValueChange={(value) => updateAuthoringField("sensitivity", value)}
                        >
                          <SelectTrigger id="authoring-sensitivity"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {sensitivityFilterValues.map((sensitivity) => (
                              <SelectItem key={sensitivity} value={sensitivity}>{sensitivity}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField
                        label="Audience labels"
                        htmlFor="authoring-audience"
                        required
                        errorText={authoringErrors.audience}
                        helpText="Comma-separated audience labels. Document grants still control restricted access."
                      >
                        <Input
                          id="authoring-audience"
                          value={authoringForm.audience}
                          onChange={(event) => updateAuthoringField("audience", event.target.value)}
                          aria-invalid={Boolean(authoringErrors.audience)}
                        />
                      </FormField>
                      {authoringMode === "edit" ? (
                        <FormField
                          label="Change note"
                          htmlFor="authoring-change-note"
                          required
                          errorText={authoringErrors.changeNote}
                          helpText="This note is stored with the new version."
                        >
                          <Input
                            id="authoring-change-note"
                            value={authoringForm.changeNote}
                            onChange={(event) => updateAuthoringField("changeNote", event.target.value)}
                            aria-invalid={Boolean(authoringErrors.changeNote)}
                          />
                        </FormField>
                      ) : null}
                    </div>
                    </details>
                    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                      <Button type="button" onClick={() => requestLeaveAuthoring(cancelPageAuthoring)} disabled={isSavingPage}>Cancel</Button>
                      <Button type="submit" variant="primary" disabled={isSavingPage || (richEditorEnabled && !editorReady)}>
                        {isSavingPage ? "Saving…" : authoringMode === "create" ? "Create draft" : "Save draft version"}
                      </Button>
                    </div>
                    </fieldset>
                  </form>
                ) : capabilities.managePageGrants && !capabilities.previewAssets ? (
                  <div className="grid gap-4">
                    <form onSubmit={(event) => { event.preventDefault(); navigatePage("asset-read", pageAccessId.trim(), "access"); }}>
                      <FormField label="Page stable ID" htmlFor="page-access-id" helpText="Enter the ID of the page whose grants you need to manage."><Input id="page-access-id" value={pageAccessId} onChange={(event) => setPageAccessId(event.target.value)} /></FormField>
                      <Button type="submit" disabled={!pageAccessId.trim()}>Open page access</Button>
                    </form>
                    {selectedStableId ? <Suspense fallback={<p role="status">Loading page access…</p>}><PageAccessPanel pageId={selectedStableId} request={request} canManage canListPrincipals={capabilities.manageSystem} /></Suspense> : null}
                  </div>
                ) : assetDetail ? (
                  <>
                    <Alert variant={publishedVersion ? "info" : "warning"}>
                      <AlertTitle>{publishedVersion ? `Published v${publishedVersion.versionNumber}` : "No published version"}{currentVersion && currentVersion.id !== assetDetail.asset.publishedVersionId ? ` · Current draft v${currentVersion.versionNumber}` : ""}</AlertTitle>
                      <AlertDescription>{publishedVersion ? "Readers see the published version. Draft changes become visible after publication." : "Review and publish this draft to make it available to readers."}{assetDetail.processing?.reconciliation === "pending" ? " Background processing is pending." : ""}</AlertDescription>
                      {publishedVersion ? <Button type="button" variant="ghost" onClick={() => navigatePage("reader", assetDetail.asset.stableId)}>View published page</Button> : null}
                      {assetContentView !== "version" ? <Button type="button" onClick={() => navigatePage("asset-read", assetDetail.asset.stableId, "version")}>Review and publish</Button> : null}
                    </Alert>
                    <TrustStateSummary
                      state={isAssetGovernanceDue(assetDetail.asset) ? "needs-review" : isPublicReaderEligible(assetDetail.asset) ? "trusted" : "restricted"}
                      title={assetDetail.asset.stableId}
                      description={isPublicReaderEligible(assetDetail.asset)
                        ? "This page is published, reviewed, and visible to readers."
                        : isAssetGovernanceDue(assetDetail.asset)
                          ? "This page needs review before readers should rely on it."
                          : "This page stays behind signed-in access."}
                      signals={[
                        { label: assetDetail.asset.lifecycleState, variant: stateBadgeVariant(assetDetail.asset.lifecycleState) },
                        { label: assetDetail.asset.status, variant: stateBadgeVariant(assetDetail.asset.status) },
                        { label: assetDetail.asset.sensitivity, variant: sensitivityBadgeVariant(assetDetail.asset.sensitivity) },
                        { label: formatReviewDue(assetDetail.asset.reviewDueAt), variant: isAssetGovernanceDue(assetDetail.asset) ? "warning" : "success" },
                        ...(currentVersion ? [{ label: `v${currentVersion.versionNumber}`, variant: "neutral" as const }] : [])
                      ]}
                    />
                    <Tabs
                      value={activeAssetContentView}
                      onValueChange={(value) => navigatePage("asset-read", selectedStableId, value)}
                      className="min-w-0"
                    >
                      <TabsList className="h-auto w-full flex-wrap justify-start">
                        <TabsTrigger value="human">Content</TabsTrigger>
                        <TabsTrigger value="access">Access</TabsTrigger>
                        <TabsTrigger value="instruction">Agent instruction</TabsTrigger>
                        <TabsTrigger value="version">Versions</TabsTrigger>
                        <TabsTrigger value="activity">Activity</TabsTrigger>
                        <TabsTrigger value="raw">Raw metadata</TabsTrigger>
                      </TabsList>
                      <TabsContent value="human">
                        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(180px,0.42fr)]">
                          <SectionCard
                            title="Human document"
                            description={assetDetail.asset.summary ?? "No summary recorded."}
                            variant="tool"
                            actions={<Badge variant="neutral">{assetDetail.humanDocuments.length} document{assetDetail.humanDocuments.length === 1 ? "" : "s"}</Badge>}
                          >
                            <div className="grid gap-3">
                              {currentHumanBody ? <article className="reader-document"><div className="reader-document-body"><MarkdownDocument body={currentHumanBody} title={assetDetail.asset.title} /></div></article> : <EmptyState title="No human document" />}
                            </div>
                          </SectionCard>
                          <SectionCard title="Context rail" variant="tool">
                            <DefinitionGrid
                              compact
                              items={[
                                { term: "Format", description: currentHumanDocument?.format ?? "none" },
                                { term: "Source", description: `${assetDetail.asset.sourceKind ?? "unknown"}${assetDetail.asset.sourceRef ? ` / ${assetDetail.asset.sourceRef}` : ""}` },
                                { term: "Surfaces", description: formatList(assetDetail.asset.allowedSurfaces) },
                                { term: "Exports", description: formatList(assetDetail.asset.allowedExports) },
                                { term: "Updated", description: new Date(assetDetail.asset.updatedAt).toLocaleString() }
                              ]}
                            />
                          </SectionCard>
                        </div>
                    <SectionCard title="Page files" description={assetDetail.asset.publishedVersionId === assetDetail.asset.currentVersionId
                      ? "Files are stored separately from page revisions and always download as attachments."
                      : "Publish this version before adding or deleting files. Existing attachments remain available to readers."} variant="tool">
                      <AttachmentsPanel
                        attachments={attachments}
                        canManage={Boolean(assetDetail.asset.publishedVersionId && assetDetail.asset.publishedVersionId === assetDetail.asset.currentVersionId)}
                        loading={attachmentsLoading}
                        uploading={attachmentUploading}
                        maxBytes={attachmentMaxBytes}
                        error={attachmentsError}
                        onUpload={(file) => void uploadAttachment(file)}
                        onDownload={(attachment) => void downloadAttachment(attachment)}
                        onDelete={setPendingAttachmentDelete}
                      />
                    </SectionCard>
                    <AlertDialog
                      open={pendingAttachmentDelete !== null}
                      onOpenChange={(open) => { if (!open) setPendingAttachmentDelete(null); }}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this attachment?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {pendingAttachmentDelete
                              ? `${pendingAttachmentDelete.filename} will stop being available to readers and its stored file will be removed.`
                              : "The attachment will be removed."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="danger"
                            onClick={() => { if (pendingAttachmentDelete) void deleteAttachment(pendingAttachmentDelete); }}
                          >
                            Delete attachment
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                      </TabsContent>
                      <TabsContent value="instruction">
                        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(180px,0.42fr)]">
                          <SectionCard
                            title="Agent instruction"
                            description={currentInstructionObject?.instructionKind ?? "No instruction kind recorded."}
                            variant="tool"
                            actions={<Badge variant="neutral">{assetDetail.instructionObjects.length} object{assetDetail.instructionObjects.length === 1 ? "" : "s"}</Badge>}
                          >
                            <div className="mb-3 rounded-md border border-border bg-muted/40 p-3">
                              {currentInstructionBody ? <pre>{currentInstructionBody}</pre> : <EmptyState title="No instruction object" />}
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <SectionCard title="Constraints" variant="compact">
                                {currentInstructionObject?.constraints.length ? (
                                  <ul>
                                    {currentInstructionObject.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}
                                  </ul>
                                ) : <EmptyState title="None recorded" />}
                              </SectionCard>
                              <SectionCard title="Failure modes" variant="compact">
                                {currentInstructionObject?.failureModes.length ? (
                                  <ul>
                                    {currentInstructionObject.failureModes.map((failureMode) => <li key={failureMode}>{failureMode}</li>)}
                                  </ul>
                                ) : <EmptyState title="None recorded" />}
                              </SectionCard>
                            </div>
                          </SectionCard>
                          <SectionCard title="Agent contract" variant="tool">
                            <DefinitionGrid
                              compact
                              items={[
                                { term: "Kind", description: currentInstructionObject?.instructionKind ?? "none" },
                                { term: "Targets", description: formatList(currentInstructionObject?.targetAgents ?? []) },
                                { term: "Escalation", description: currentInstructionObject?.escalation ?? "none" },
                                { term: "Allowed actions", description: formatList(assetDetail.asset.allowedActions) },
                                { term: "Surfaces", description: formatList(assetDetail.asset.allowedSurfaces) }
                              ]}
                            />
                          </SectionCard>
                        </div>
                      </TabsContent>
                      <TabsContent value="version">
                    <SectionCard
                      title="Release control"
                      variant="tool"
                      actions={(
                        <>
                          <Button size="sm" type="button" onClick={() => void completeAssetReview()} disabled={pendingReleaseAction !== null || !capabilities.reviewAssets}>
                            {pendingReleaseAction === "review" ? "Reviewing…" : "Mark reviewed"}
                          </Button>
                          <Button size="sm" type="button" onClick={() => setReleaseActionToConfirm("publish")} disabled={pendingReleaseAction !== null || !capabilities.publishAssets}>
                            {pendingReleaseAction === "publish" ? "Publishing…" : "Publish"}
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => setReleaseActionToConfirm("restore")}
                            disabled={!versionSnapshot || selectedVersionIsCurrent || pendingReleaseAction !== null || !capabilities.restoreAssets}
                          >
                            {pendingReleaseAction === "restore" ? "Restoring…" : "Restore as draft"}
                          </Button>
                        </>
                      )}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="Review date" htmlFor="publish-review-due-at">
                          <Input id="publish-review-due-at" value={publishReviewDueAt} onChange={(event) => setPublishReviewDueAt(event.target.value)} />
                        </FormField>
                        <FormField label="Version" htmlFor="selected-version-number">
                          <Select
                            value={selectedVersionNumber}
                            onValueChange={(value) => {
                              setSelectedVersionNumber(value);
                              setVersionSnapshot(null);
                            }}
                          >
                            <SelectTrigger id="selected-version-number">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {assetDetail.versions.map((version) => (
                                <SelectItem key={version.id} value={String(version.versionNumber)}>
                                  v{version.versionNumber}{version.id === assetDetail.asset.currentVersionId ? " current" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormField>
                        <FormField label="Change note" htmlFor="workflow-note">
                          <Input id="workflow-note" value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} />
                        </FormField>
                        <div className="flex items-end sm:col-span-2">
                          <Button type="button" onClick={() => void loadVersionSnapshot()}>Inspect</Button>
                        </div>
                      </div>
                    </SectionCard>
                    <AlertDialog
                      open={releaseActionToConfirm !== null}
                      onOpenChange={(open) => {
                        if (!open && !pendingReleaseAction) {
                          setReleaseActionToConfirm(null);
                        }
                      }}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {releaseActionToConfirm === "restore" ? "Restore this version as a draft?" : "Publish this page?"}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {releaseActionToConfirm === "restore"
                              ? `This will create a new draft from version ${selectedVersionNumber || "selected"} of ${assetDetail.asset.stableId}. Readers will keep seeing the published version until you publish the new draft.`
                              : `This will publish ${assetDetail.asset.stableId} using the current review date and change note.`}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={pendingReleaseAction !== null}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={pendingReleaseAction !== null}
                            variant={releaseActionToConfirm === "restore" ? "danger" : "primary"}
                            onClick={() => {
                              const action = releaseActionToConfirm;
                              setReleaseActionToConfirm(null);
                              if (action === "restore") {
                                void restoreVersion();
                              } else if (action === "publish") {
                                void publishAsset();
                              }
                            }}
                          >
                            {releaseActionToConfirm === "restore" ? "Restore as draft" : "Publish page"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                        <div className="grid gap-3 md:grid-cols-2">
                          <SectionCard title="Current instruction" variant="tool"><pre>{currentInstructionBody || "No instruction object"}</pre></SectionCard>
                          <SectionCard title={versionSnapshot ? `Selected v${versionSnapshot.version.versionNumber}` : "Selected version"} variant="tool">
                            <pre>{versionSnapshot ? selectedInstructionBody || "No instruction object" : "No version inspected"}</pre>
                          </SectionCard>
                          <SectionCard title="Current human document" variant="tool"><pre>{currentHumanBody || "No human document"}</pre></SectionCard>
                          <SectionCard title={versionSnapshot ? `Selected v${versionSnapshot.version.versionNumber}` : "Selected version"} variant="tool">
                            <pre>{versionSnapshot ? selectedHumanBody || "No human document" : "No version inspected"}</pre>
                          </SectionCard>
                        </div>
                      </TabsContent>
                      <TabsContent value="access">
                        <Suspense fallback={<p role="status">Loading page access…</p>}><PageAccessPanel pageId={assetDetail.asset.stableId} request={request} canManage={capabilities.managePageGrants} canListPrincipals={capabilities.manageSystem} allowedSurfaces={assetDetail.asset.allowedSurfaces} audience={assetDetail.asset.audience} /></Suspense>
                      </TabsContent>
                      <TabsContent value="activity">
                        <SectionCard title="Version activity" description="Saved revisions for this page." variant="tool">
                          <ol>{assetDetail.versions.map((version) => <li key={version.id}><strong>v{version.versionNumber}</strong> · {new Date(version.createdAt).toLocaleString()} · {version.changeNote || "No change note"}{version.id === assetDetail.asset.publishedVersionId ? " · Published" : ""}{version.id === assetDetail.asset.currentVersionId ? " · Current" : ""}</li>)}</ol>
                        </SectionCard>
                      </TabsContent>
                      <TabsContent value="raw">
                    <DefinitionGrid
                      items={[
                        { term: "Stable ID", description: assetDetail.asset.stableId },
                        { term: "Lifecycle", description: <Badge variant={stateBadgeVariant(assetDetail.asset.lifecycleState)}>{assetDetail.asset.lifecycleState}</Badge> },
                        { term: "Status", description: <Badge variant={stateBadgeVariant(assetDetail.asset.status)}>{assetDetail.asset.status}</Badge> },
                        { term: "Sensitivity", description: <Badge variant={sensitivityBadgeVariant(assetDetail.asset.sensitivity)}>{assetDetail.asset.sensitivity}</Badge> },
                        { term: "Audience", description: assetDetail.asset.audience.join(", ") },
                        { term: "Review", description: assetDetail.asset.reviewDueAt },
                        { term: currentVersion?.id === assetDetail.asset.publishedVersionId ? "Current published version" : "Current draft", description: currentVersion ? `v${currentVersion.versionNumber}` : "none" },
                        { term: "Published version", description: publishedVersion ? `v${publishedVersion.versionNumber}` : "Not published" },
                        { term: "Exports", description: assetDetail.asset.allowedExports.join(", ") || "none" }
                      ]}
                    />

                        <SectionCard title="Raw metadata" variant="tool">
                          <pre>{JSON.stringify({
                            asset: assetDetail.asset,
                            currentVersion,
                            selectedVersion: versionSnapshot?.version ?? null,
                            instructionObjectCount: assetDetail.instructionObjects.length,
                            humanDocumentCount: assetDetail.humanDocuments.length
                          }, null, 2)}</pre>
                        </SectionCard>
                      </TabsContent>
                    </Tabs>
                  </>
                ) : (
                  <EmptyState title="No asset selected" description="Select an asset from the library table." />
                )}
              </SectionCard>
              ) : null}
      </section>

          </section>

          <section className={`page ${currentPage === "search" ? "active" : ""}`} data-page="search">
            <RouteHeader
              className="page-route-header"
              breadcrumbs={routeBreadcrumbs("search")}
              eyebrow="Grounded retrieval"
              title="Search and Managed Query"
              lede="Test deterministic retrieval and provider-routed answers with citations, cache status, cost metadata, and denied-result visibility."
              actions={<Button type="button" onClick={() => void runManagedQuery()}>Run managed query</Button>}
            />
            <section className="grid gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(440px,1.25fr)]">
              <SectionCard title="Search" variant="tool" className="min-w-0 self-start" contentClassName="grid gap-4">
                <form className="flex min-w-0 flex-col gap-2 sm:flex-row" onSubmit={(event) => void runSearch(event)}>
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search permitted instruction context"
                    aria-label="Search query"
                  />
                  <Button type="submit">Run</Button>
                </form>
                <div className="grid gap-3">
                  {searchResponse?.results.length ? searchResponse.results.map((result) => (
                    <SectionCard
                      key={result.chunkId}
                      title={result.asset.stableId}
                      description={result.citation.sourceKind}
                      variant="compact"
                    >
                      <p className="m-0 text-sm leading-6 text-muted-foreground">{result.citation.snippet}</p>
                    </SectionCard>
                  )) : (
                    <EmptyState
                      title={searchResponse ? "No search results" : "No search run"}
                      description={searchResponse ? "The current query did not return permitted citations." : "Run search to inspect retrieval snippets."}
                    />
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Managed query" variant="tool" className="min-w-0" contentClassName="grid gap-4">
                <form className="grid gap-4" onSubmit={(event) => void runManagedQuery(event)}>
                  <FormField label="Query" htmlFor="managed-query-text">
                    <Input id="managed-query-text" value={managedQueryText} onChange={(event) => setManagedQueryText(event.target.value)} />
                  </FormField>
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField label="Mode" htmlFor="managed-query-mode">
                      <Select
                        value={managedQueryMode}
                        onValueChange={(value) => setManagedQueryMode(value as "deterministic-retrieval" | "provider-routed")}
                      >
                        <SelectTrigger id="managed-query-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deterministic-retrieval">deterministic-retrieval</SelectItem>
                          <SelectItem value="provider-routed">provider-routed</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Provider" htmlFor="managed-query-provider">
                      <Select
                        value={managedQueryProvider}
                        onValueChange={(value) => setManagedQueryProvider(value as ModelProvider)}
                        disabled={managedQueryMode !== "provider-routed"}
                      >
                        <SelectTrigger id="managed-query-provider">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">openai</SelectItem>
                          <SelectItem value="anthropic">anthropic</SelectItem>
                          <SelectItem value="openrouter">openrouter</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Model" htmlFor="managed-query-model">
                      <Input
                        id="managed-query-model"
                        value={managedQueryModel}
                        onChange={(event) => setManagedQueryModel(event.target.value)}
                        disabled={managedQueryMode !== "provider-routed"}
                      />
                    </FormField>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <FormField label="Cache" htmlFor="managed-query-cache-enabled" className="flex-row items-center gap-3">
                      <Checkbox
                        id="managed-query-cache-enabled"
                        checked={managedQueryCacheEnabled}
                        onCheckedChange={(checked) => setManagedQueryCacheEnabled(checked === true)}
                        disabled={managedQueryMode !== "provider-routed"}
                      />
                    </FormField>
                    <Button type="submit" disabled={!managedQueryText}>Run managed query</Button>
                  </div>
                </form>
                <Tabs
                  value={managedQueryView}
                  onValueChange={(value) => setManagedQueryView(value as ManagedQueryView)}
                  className="min-w-0"
                >
                  <TabsList className="h-auto w-full flex-wrap justify-start">
                    <TabsTrigger value="answer">Answer</TabsTrigger>
                    <TabsTrigger value="evidence">Evidence</TabsTrigger>
                    <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
                  </TabsList>
                  {managedQueryResponse ? (
                    <>
                      <DefinitionGrid
                        compact
                        className="mt-2"
                        items={[
                          { term: "Generation", description: managedQueryResponse.generation.status },
                          { term: "Citations", description: managedQueryResponse.citations.length },
                          { term: "Denied", description: managedQueryResponse.checks.deniedCount },
                          { term: "Cost", description: formatCurrency(managedQueryResponse.generation.usage.estimatedCostUsd) }
                        ]}
                      />
                      <TabsContent value="answer">
                        <SectionCard
                          title="Grounded answer"
                          variant="tool"
                          actions={(
                            <Badge variant={managedQueryResponse.checks.deniedCount ? "warning" : "success"}>
                              {managedQueryResponse.checks.deniedCount ? `${managedQueryResponse.checks.deniedCount} denied` : "all visible"}
                            </Badge>
                          )}
                        >
                          <p>{managedQueryResponse.answer}</p>
                        </SectionCard>
                      </TabsContent>
                      <TabsContent value="evidence">
                        <div className="grid gap-3">
                          {managedQueryResponse.citations.length ? managedQueryResponse.citations.map((citation) => (
                            <SectionCard
                              key={`${citation.assetId}:${citation.chunkId}`}
                              title={citation.stableId}
                              description={citation.sourceKind}
                              variant="compact"
                            >
                              <p className="m-0 text-sm leading-6 text-muted-foreground">{citation.snippet}</p>
                            </SectionCard>
                          )) : <EmptyState title="No citations returned" />}
                        </div>
                      </TabsContent>
                      <TabsContent value="diagnostics">
                        <SectionCard title="Diagnostics" variant="tool">
                          <DefinitionGrid
                            compact
                            items={[
                              { term: "Mode", description: managedQueryResponse.mode },
                              { term: "Provider", description: managedQueryResponse.generation.provider ?? "n/a" },
                              { term: "Model", description: managedQueryResponse.generation.model ?? "n/a" },
                              { term: "Tokens", description: formatMetric(managedQueryResponse.generation.usage.totalTokens) },
                              { term: "Cache", description: managedQueryResponse.cache.status },
                              { term: "Telemetry", description: managedQueryResponse.telemetryEventId ?? "n/a" }
                            ]}
                          />
                          {managedQueryResponse.generation.attempts.length ? (
                            <p>
                              <strong>Attempts</strong>{" "}
                              {managedQueryResponse.generation.attempts
                                .map((attempt) => `${attempt.provider}:${attempt.status}${attempt.reason ? `(${attempt.reason})` : ""}`)
                                .join(" -> ")}
                            </p>
                          ) : null}
                          {managedQueryResponse.cache.reason ? (
                            <StatusAlert status="info" title="Cache" description={managedQueryResponse.cache.reason} />
                          ) : null}
                          {managedQueryResponse.warnings.length ? (
                            <StatusAlert status="warning" title="Warnings" description={managedQueryResponse.warnings.join("\n")} />
                          ) : null}
                        </SectionCard>
                      </TabsContent>
                    </>
                  ) : (
                    <EmptyState title="No managed query run" description="Run a managed query to inspect answer, evidence, and diagnostics." />
                  )}
                </Tabs>
              </SectionCard>
            </section>
      </section>

      <section className={`page ${visibleDistributePage ? "active" : ""}`} data-page="distribute">
        <RouteHeader
          className="page-route-header"
          breadcrumbs={routeBreadcrumbs("distribute")}
          eyebrow="Agent distribution"
          title="Distribute"
          lede="Build a session-local package from approved, permission-filtered assets for API, CLI, MCP, JSON, and OKF consumers."
          actions={(
            <Button variant="primary" type="button" onClick={() => void generateExport()} disabled={isGeneratingExport}>
              <DownloadSimple aria-hidden="true" />{isGeneratingExport ? "Generating" : "Generate"}
            </Button>
          )}
        />

        {isLegacyExportsAlias ? (
          <StatusAlert
            status="info"
            title="Legacy alias"
            description={<>Legacy <code>#exports</code> opens the package builder. Use <code>#{canonicalRouteHash("distribute")}</code> for the admin route.</>}
            className="mb-4"
          />
        ) : null}

        <div className="grid four">
          <MetricCard
            label="Package"
            value={<span className="block break-words text-base leading-6">{packageNameInput}</span>}
            note="Generated on demand from current API state."
          />
          <MetricCard
            label="Format"
            value={exportFormat.toUpperCase()}
            note={exportFormat === "okf" ? `OKF ${okfVersion} projection` : "JSON connector package"}
          />
          <MetricCard
            label="Assets"
            value={exportPackage?.assetCount ?? exportEligibleAssets}
            note={exportPackage ? "Last generated package count." : "Loaded assets with matching export eligibility."}
          />
          <MetricCard
            label="Denied"
            value={exportPackage?.deniedCount ?? 0}
            note="Restricted omissions are counted, not previewed."
          />
        </div>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(460px,1.2fr)]">
          <SectionCard
            title="Package builder"
            description="No package history is saved by this UI; generated state stays local to this browser session."
            variant="tool"
            className="min-w-0 self-start"
            contentClassName="grid gap-4"
          >
            <form className="grid gap-4" onSubmit={(event) => {
              event.preventDefault();
              void generateExport();
            }}>
              <FormField
                label="Package name"
                htmlFor="package-name-input"
                helpText="Defaults to demo-agent-pack when left blank."
              >
                <Input
                  id="package-name-input"
                  value={packageName}
                  onChange={(event) => setPackageName(event.target.value)}
                  placeholder="demo-agent-pack"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Format" htmlFor="export-format-select">
                  <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as AiExportFormat)}>
                    <SelectTrigger id="export-format-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">json</SelectItem>
                      <SelectItem value="okf">okf</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField
                  label="OKF version"
                  htmlFor="okf-version-select"
                  helpText={exportFormat === "okf" ? "Pinned versioned projection." : "Used only when OKF is selected."}
                >
                  <Select
                    value={okfVersion}
                    onValueChange={(value) => setOkfVersion(value as OkfVersion)}
                    disabled={exportFormat !== "okf"}
                  >
                    <SelectTrigger id="okf-version-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.1">0.1</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" type="submit" disabled={isGeneratingExport}>
                  <DownloadSimple aria-hidden="true" />{isGeneratingExport ? "Generating package" : "Generate package"}
                </Button>
                <Button type="button" onClick={() => setExportPackage(null)} disabled={!exportPackage}>Clear local result</Button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title="Package result"
            description="Safe metadata only. Restricted content and package bodies are not previewed here."
            variant="tool"
            className="min-w-0 self-start"
            contentClassName="grid gap-4"
          >
            {exportPackage ? (
              <>
                <DefinitionGrid
                  compact
                  items={[
                    { term: "Name", description: exportPackage.packageName },
                    { term: "Format", description: "format" in exportPackage ? exportPackage.format : "json" },
                    { term: "Assets", description: exportPackage.assetCount },
                    { term: "Denied", description: exportPackage.deniedCount },
                    { term: "Generated", description: new Date(exportPackage.generatedAt).toLocaleString() },
                    { term: "Tenant", description: exportPackage.tenantId },
                    ...("okfVersion" in exportPackage ? [{ term: "OKF version", description: exportPackage.okfVersion }] : []),
                    ...("sourcePackageHash" in exportPackage ? [{ term: "Source hash", description: exportPackage.sourcePackageHash }] : []),
                    ...("projectionHash" in exportPackage ? [{ term: "Projection hash", description: exportPackage.projectionHash }] : []),
                    ...("rootIndexPath" in exportPackage ? [{ term: "Root index", description: exportPackage.rootIndexPath }] : [])
                  ]}
                />
                {exportPackage.deniedCount > 0 ? (
                  <StatusAlert
                    status="warning"
                    title="Restricted items omitted"
                    description={`${exportPackage.deniedCount} restricted or unauthorized item${exportPackage.deniedCount === 1 ? "" : "s"} counted by the API and not previewed.`}
                  />
                ) : null}
                {"assets" in exportPackage && exportPackage.assets.length ? (
                  <div className="grid gap-2">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <h3 className="m-0 text-sm font-semibold text-foreground">Included stable IDs</h3>
                      <Badge variant="neutral">{exportPackage.assets.length}</Badge>
                    </div>
                    <ul className="grid gap-2">
                      {exportPackage.assets.map((asset) => (
                        <li
                          key={asset.stableId}
                          className="grid min-w-0 gap-1 rounded-md border border-border bg-muted/40 p-3 text-sm"
                        >
                          <strong>{asset.stableId}</strong>
                          <span className="min-w-0 break-words text-muted-foreground">{asset.type} · {asset.status} · {asset.sensitivity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <StatusAlert
                    status="info"
                    title="No package body preview"
                    description="This browser view shows generated package metadata only. Use the API, CLI, or MCP consumer to retrieve the package payload."
                  />
                )}
              </>
            ) : (
              <EmptyState
                title="No package generated"
                description="Generate a package to inspect safe metadata for this browser session."
                actions={(
                  <Button type="button" onClick={() => void generateExport()} disabled={isGeneratingExport}>
                    <DownloadSimple aria-hidden="true" />Generate package
                  </Button>
                )}
              />
            )}
          </SectionCard>
        </section>

        <SectionCard
          title="Consumer examples"
          description="Copy these after setting a scoped API key in your shell or MCP runtime. The commands call the same export endpoint as the builder."
          variant="tool"
          className="mt-4 min-w-0"
          contentClassName="grid gap-3"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {commandExamples.map(([label, command]) => (
              <div className="grid min-w-0 gap-2 rounded-md border border-border bg-card p-3" key={label}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <h3 className="m-0 text-sm font-semibold text-foreground">{label}</h3>
                  <Button size="sm" type="button" onClick={() => void copyText(command, `${label} example`)}>
                    <Copy aria-hidden="true" />Copy
                  </Button>
                </div>
                <Textarea
                  readOnly
                  value={command}
                  aria-label={`${label} export example`}
                  className="min-h-28 resize-y font-mono text-xs leading-5"
                />
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className={`page ${visibleOperationsPage ? "active" : ""}`} data-page="operations">
        <RouteHeader
          className="page-route-header"
          breadcrumbs={routeBreadcrumbs(currentPage)}
          title={operationsPage.title}
          lede={operationsPage.lede}
          actions={(
            <Button
              type="button"
              onClick={() => void loadWorkspaceRoute(currentPage)}
              disabled={loadingWorkspaceRoute === currentPage}
            >
              <ArrowsClockwise aria-hidden="true" />
              {loadingWorkspaceRoute === currentPage ? "Loading" : "Refresh workspace"}
            </Button>
          )}
        />
        {isLegacyRouteAlias ? (
          <StatusAlert
            title={`Legacy #${currentHashRoute} route`}
            description={`This route now opens #${canonicalRouteHash(currentPage)} to match the updated information architecture.`}
          />
        ) : null}
        {settingsNavigationRoutes.includes(currentPage) ? (
          <StatusAlert
            status="info"
            title="Admin safety"
            description="Actions that remove access, keys, sessions, groups, or cache data ask for confirmation before they run."
          />
        ) : null}
        <section className="operations-grid">
        <section className="grid gap-4" aria-labelledby="ops-title">
          <h2 id="ops-title" className="sr-only">{operationsPage.title}</h2>
          <div className={routePanelClass(currentPage, ["health"], "grid gap-4")}>
            <SectionCard
              title="System health"
              description="A compact operational readout for the API, provider readiness, recent activity, and action governance."
              variant="tool"
            >
              <DefinitionGrid
                compact
                items={[
                  { term: "API", description: <Badge variant={health === "ok" ? "success" : "destructive"}>{health}</Badge> },
                  { term: "Version", description: systemVersion?.version ?? "not loaded" },
                  { term: "Install mode", description: systemVersion?.installationMode ?? "not loaded" },
                  { term: "Providers checked", description: providerHealth.length },
                  { term: "Ready providers", description: providerHealth.filter((provider) => provider.status === "ready").length },
                  { term: "Retrieval sample", description: telemetrySummary?.retrieval.eventCount ?? telemetryEvents.length },
                  { term: "Action policy", description: actionExecutionPolicy ? actionExecutionPolicy.enabled ? "enabled" : "disabled" : "not loaded" },
                  { term: "Pending actions", description: agentActions.length },
                  {
                    term: "File drift",
                    description: attachmentReconciliation
                      ? attachmentReconciliation.activeMissingOrUnreadableCount +
                        attachmentReconciliation.activeIntegrityFailureCount +
                        attachmentReconciliation.staleDeletingCount +
                        attachmentReconciliation.orphanedObjectCount +
                        attachmentReconciliation.unexpectedStorageEntryCount
                      : "pending"
                  },
                  {
                    term: "Eval latest",
                    description: evalSummary ? evalSummary.latestPassRate === null ? "n/a" : formatPercent(evalSummary.latestPassRate) : "not loaded"
                  },
                  {
                    term: "Cache policy",
                    description: managedQueryCachePolicy ? managedQueryCachePolicy.cacheEnabled ? "enabled" : "disabled" : "not loaded"
                  }
                ]}
              />
              <Button
                type="button"
                onClick={() => void loadAttachmentReconciliation(true)}
              >
                Verify files
              </Button>
              {providerHealth.length ? (
                <div className="grid gap-2">
                  {providerHealth.map((provider) => (
                    <p key={provider.provider}>
                      <strong>{provider.provider}</strong>{" "}
                      <Badge variant={provider.status === "ready" ? "success" : "warning"}>{provider.status}</Badge>{" "}
                      {provider.apiKeyConfigured ? "key configured" : "no key"}
                      {provider.reasons.length ? ` (${provider.reasons.join(", ")})` : ""}
                    </p>
                  ))}
                </div>
              ) : (
                <EmptyState title="No provider health loaded" description="Use Refresh workspace to check provider readiness." />
              )}
            </SectionCard>
          </div>
          <div className={routePanelClass(currentPage, ["updates"], "grid gap-4")}>
            {currentPage === "updates" ? (
              <Suspense fallback={<p>Loading update controls…</p>}>
                <LazyUpdateManagementPanel key={`${currentPrincipal?.principalId}:${currentPrincipal?.apiKeyId}`} request={request} onAvailabilityChange={setUpdateAvailable} />
              </Suspense>
            ) : null}
          </div>
          <div className={routePanelClass(currentPage, ["review"], "grid gap-4")}>
            {reviewQueueError ? <Alert variant="destructive" role="alert"><AlertDescription>Could not load the review queue. {reviewQueueError}</AlertDescription><Button onClick={() => void loadReviewQueue()} disabled={reviewQueueLoading}>Retry</Button></Alert> : null}
            <DataTableShell
              title="Review queue"
              description={reviewQueue ? `${reviewQueue.assets.length} of ${reviewQueue.totalCount ?? reviewQueue.assets.length} items as of ${reviewQueue.asOf}. Approved drafts remain here until published.` : "Review items load automatically when this route opens."}
              actions={<>{reviewQueueLoading ? <span role="status">Loading review queue…</span> : null}{reviewQueue?.nextOffset != null ? <Button onClick={() => void loadReviewQueue(true)} disabled={reviewQueueLoading}>Load more</Button> : null}</>}
              isEmpty={!reviewQueue || !reviewQueue.assets.length}
              emptyTitle={reviewQueueLoading ? "Loading review queue" : reviewQueueError ? "Review queue unavailable" : reviewQueue ? "No review items" : "Review queue not loaded"}
              emptyDescription={reviewQueue && !reviewQueueError ? "There are no permitted pages currently waiting for review or publication." : "Use Retry or Refresh workspace to load the queue."}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stable ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    <TableHead>Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewQueue?.assets.map((asset) => (
                    <TableRow
                      key={asset.id}
                      className="cursor-pointer"
                      onClick={() => openAssetRead(asset.stableId)}
                      onKeyDown={(event) => selectAssetFromRow(event, () => openAssetRead(asset.stableId))}
                      tabIndex={0}
                    >
                      <TableCell>{asset.stableId}</TableCell>
                      <TableCell><Badge variant={stateBadgeVariant(asset.status)}>{asset.status === "approved" && asset.currentVersionId !== asset.publishedVersionId ? "Ready to publish" : asset.status}</Badge></TableCell>
                      <TableCell><Badge variant={stateBadgeVariant(asset.lifecycleState)}>{asset.lifecycleState}</Badge></TableCell>
                      <TableCell>{asset.reviewDueAt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableShell>
          </div>
          <div className={routePanelClass(currentPage, activityPanelRoutes, "grid gap-4")}>
            {activityPanelRoutes.includes(currentPage) && <Suspense fallback={<p role="status">Loading activity…</p>}>
            <AnalyticsDashboard
              summary={telemetrySummary}
              windowDays={analyticsWindowDays}
              loading={analyticsLoading}
              onWindowDaysChange={(days) => {
                setAnalyticsWindowDays(days);
                void loadTelemetrySummary(days);
              }}
              onRefresh={() => void loadTelemetrySummary()}
            />
            </Suspense>}
          </div>
          <div className={routePanelClass(currentPage, activityAndHealthPanelRoutes, "grid gap-4")}>
            <SectionCard title="Telemetry summary" variant="tool">
              {telemetrySummary ? (
                <div className="grid gap-4">
                  <DefinitionGrid
                    compact
                    items={[
                      { term: "Retrieval", description: telemetrySummary.retrieval.eventCount },
                      { term: "Denied", description: telemetrySummary.retrieval.deniedCount },
                      { term: "Latency", description: formatMetric(telemetrySummary.retrieval.averageLatencyMs, "ms") },
                      { term: "Redacted", description: telemetrySummary.retrieval.redactedQueryCount },
                      { term: "Audit", description: telemetrySummary.audit.eventCount },
                      { term: "Feedback", description: telemetrySummary.feedback.recordCount },
                      { term: "Model gen", description: telemetrySummary.providerGeneration.eventCount },
                      { term: "Cache hits", description: telemetrySummary.providerGeneration.cacheHitCount },
                      { term: "Tokens", description: telemetrySummary.providerGeneration.totalTokens },
                      { term: "Assets", description: telemetrySummary.assets.sampleCount },
                      { term: "Generated", description: new Date(telemetrySummary.generatedAt).toLocaleTimeString() }
                    ]}
                  />
                  <DefinitionGrid
                    compact
                    items={[
                      { term: "Surfaces", description: formatCounts(telemetrySummary.retrieval.bySurface) },
                      { term: "Query kinds", description: formatCounts(telemetrySummary.retrieval.byQueryKind) },
                      { term: "Audit outcomes", description: formatCounts(telemetrySummary.audit.byOutcome) },
                      { term: "Feedback", description: formatCounts(telemetrySummary.feedback.byOutcome) },
                      { term: "Model statuses", description: formatCounts(telemetrySummary.providerGeneration.byStatus) },
                      { term: "Cache statuses", description: formatCounts(telemetrySummary.providerGeneration.byCacheStatus) },
                      { term: "Model providers", description: formatCounts(telemetrySummary.providerGeneration.byProvider) },
                      { term: "Estimated model cost", description: formatCurrency(telemetrySummary.providerGeneration.estimatedCostUsd) },
                      { term: "Sensitivity", description: formatCounts(telemetrySummary.assets.bySensitivity) }
                    ]}
                  />
                </div>
              ) : (
                <EmptyState
                  title={activityAndHealthPanelRoutes.includes(loadingWorkspaceRoute) ? "Loading telemetry summary" : "No telemetry summary"}
                  description="This route loads telemetry automatically. Use Refresh workspace to retry."
                />
              )}
            </SectionCard>
          </div>
          <div className={routePanelClass(currentPage, settingsOverviewRoutes, "grid gap-4")}>
            <SectionCard
              title="Choose a settings area"
              description="Use Policies for system rules and Access for people, service accounts, keys, and sessions."
              variant="tool"
            >
              <div className="settings-overview-actions">
                <Button type="button" variant="primary" onClick={() => navigatePage("policies")}>Policies</Button>
                <Button type="button" onClick={() => navigatePage("access")}>Access</Button>
                <Button type="button" onClick={() => navigatePage("approvals")}>Approvals</Button>
              </div>
            </SectionCard>
          </div>
          <nav className={routePanelClass(currentPage, settingsNavigationRoutes, "settings-local-nav")} aria-label="Settings sections">
            <button type="button" className={currentPage === "settings" ? "active" : ""} onClick={() => navigatePage("settings")}>Overview</button>
            <button type="button" className={currentPage === "policies" ? "active" : ""} onClick={() => navigatePage("policies")}>Policies</button>
            <button type="button" className={currentPage === "access" ? "active" : ""} onClick={() => navigatePage("access")}>Access</button>
            <button type="button" onClick={() => navigatePage("approvals")}>Approvals</button>
          </nav>
          <Tabs
            value={currentPage === "approvals" ? "actions" : policySettingsView}
            onValueChange={(value) => setPolicySettingsView(value as PolicySettingsView)}
            className={routePanelClass(currentPage, ["approvals", ...policySettingsPanelRoutes], "admin-section-tabs")}
          >
            {currentPage === "policies" ? (
              <TabsList className="h-auto w-full flex-wrap justify-start">
                <TabsTrigger value="retention">Retention</TabsTrigger>
                <TabsTrigger value="answers">Answers</TabsTrigger>
                <TabsTrigger value="ranking">Ranking</TabsTrigger>
                <TabsTrigger value="evals">Evals</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
                <TabsTrigger value="privacy">Privacy</TabsTrigger>
              </TabsList>
            ) : null}
          <TabsContent id="settings-policies" value="retention" className="grid gap-4">
            <h3>Telemetry retention</h3>
            <p>Retention applies to stored telemetry. Enter a number of days or “forever”. Purges use the saved policy.</p>
            {retentionError ? <Alert variant="destructive" role="alert"><AlertDescription>{retentionError}</AlertDescription></Alert> : null}
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveTelemetryRetentionPolicy(event)}>
              <label>
                Retrieval days
                <Input
                  disabled={retentionLoadState !== "loaded" || retentionBusy}
                  value={retentionRetrievalDays}
                  onChange={(event) => setRetentionRetrievalDays(event.target.value)}
                />
              </label>
              <label>
                Audit days
                <Input disabled={retentionLoadState !== "loaded" || retentionBusy} value={retentionAuditDays} onChange={(event) => setRetentionAuditDays(event.target.value)} />
              </label>
              <label>
                Feedback days
                <Input
                  disabled={retentionLoadState !== "loaded" || retentionBusy}
                  value={retentionFeedbackDays}
                  onChange={(event) => setRetentionFeedbackDays(event.target.value)}
                />
              </label>
              <Button type="submit" disabled={retentionLoadState !== "loaded" || retentionBusy}>Save retention</Button>
              <Button type="button" variant="ghost" disabled={retentionLoadState === "loading" || retentionBusy} onClick={() => void loadTelemetryRetentionPolicy()}>{retentionLoadState === "error" ? "Retry loading policy" : "Reload policy"}</Button>
              <Button type="button" disabled={retentionLoadState !== "loaded" || retentionBusy} onClick={() => void purgeTelemetryRetention(true)}>Dry run purge</Button>
              <Button
                type="button"
                variant="danger"
                disabled={retentionLoadState !== "loaded" || retentionBusy}
                onClick={() => {
                  if (window.confirm("Execute telemetry purge now? Run a dry run first if you are unsure.")) {
                    void purgeTelemetryRetention(false);
                  }
                }}
              >
                Execute purge
              </Button>
            </form>
            {telemetryRetentionPolicy ? (
              <p>
                <strong>{telemetryRetentionPolicy.source}</strong>
                {" "}
                retrieval {formatRetentionDays(telemetryRetentionPolicy.retrievalEventRetentionDays)},
                audit {formatRetentionDays(telemetryRetentionPolicy.auditEventRetentionDays)},
                feedback {formatRetentionDays(telemetryRetentionPolicy.feedbackRetentionDays)}
              </p>
            ) : <p role="status">{retentionLoadState === "loading" || retentionLoadState === "idle" ? "Loading saved retention policy…" : "Policy unavailable. Retry loading to enable changes."}</p>}
            {telemetryRetentionPurgeResult ? (
              <p>
                <strong>{telemetryRetentionPurgeResult.dryRun ? "dry-run" : "executed"}</strong>
                {" "}
                retrieval {telemetryRetentionPurgeResult.retrievalEvents.deletedCount},
                audit {telemetryRetentionPurgeResult.auditEvents.deletedCount},
                feedback {telemetryRetentionPurgeResult.managedQueryFeedback.deletedCount}
              </p>
            ) : null}
          </TabsContent>
          <TabsContent value="answers" className="grid gap-4">
            <h3>Managed query policy</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveManagedQueryPolicy(event)}>
              <label>
                Default mode
                <NativeSelect
                  value={queryPolicyDefaultMode}
                  onChange={(event) => setQueryPolicyDefaultMode(event.target.value as ManagedQueryMode)}
                >
                  <option value="deterministic-retrieval">deterministic-retrieval</option>
                  <option value="provider-routed">provider-routed</option>
                </NativeSelect>
              </label>
              <label>
                Allowed modes
                <Input
                  value={queryPolicyAllowedModes}
                  onChange={(event) => setQueryPolicyAllowedModes(event.target.value)}
                />
              </label>
              <label>
                Minimum citations
                <Input
                  value={queryPolicyMinimumCitationCount}
                  onChange={(event) => setQueryPolicyMinimumCitationCount(event.target.value)}
                />
              </label>
              <label>
                Require grounded
                <NativeSelect
                  value={queryPolicyRequireGrounded}
                  onChange={(event) => setQueryPolicyRequireGrounded(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </NativeSelect>
              </label>
              <Button type="submit">Save query policy</Button>
              <Button type="button" onClick={() => void loadManagedQueryPolicy()}>Load policy</Button>
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
          </TabsContent>
          <TabsContent value="ranking" className="grid gap-4">
            <h3>Retrieval ranking policy</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveRetrievalRankingPolicy(event)}>
              <label>
                Agent instruction weight
                <Input
                  value={rankingPolicyAgentInstructionWeight}
                  onChange={(event) => setRankingPolicyAgentInstructionWeight(event.target.value)}
                />
              </label>
              <label>
                Asset summary weight
                <Input
                  value={rankingPolicyAssetSummaryWeight}
                  onChange={(event) => setRankingPolicyAssetSummaryWeight(event.target.value)}
                />
              </label>
              <label>
                Human document weight
                <Input
                  value={rankingPolicyHumanDocumentWeight}
                  onChange={(event) => setRankingPolicyHumanDocumentWeight(event.target.value)}
                />
              </label>
              <label>
                Exact phrase boost
                <Input
                  value={rankingPolicyExactPhraseBoost}
                  onChange={(event) => setRankingPolicyExactPhraseBoost(event.target.value)}
                />
              </label>
              <Button type="submit">Save ranking policy</Button>
              <Button type="button" onClick={() => void loadRetrievalRankingPolicy()}>Load policy</Button>
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
          </TabsContent>
          <TabsContent value="evals" className="grid gap-4">
            <h3>Eval schedule</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveEvalSchedulePolicy(event)}>
              <label>
                Enabled
                <NativeSelect
                  value={evalScheduleEnabled}
                  onChange={(event) => setEvalScheduleEnabled(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </NativeSelect>
              </label>
              <label>
                Interval minutes
                <Input
                  value={evalScheduleIntervalMinutes}
                  onChange={(event) => setEvalScheduleIntervalMinutes(event.target.value)}
                />
              </label>
              <Button type="submit">Save demo schedule</Button>
              <Button type="button" onClick={() => void loadEvalSchedulePolicy()}>Load policy</Button>
              <Button type="button" onClick={() => void disableEvalSchedulePolicy()}>Disable</Button>
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
          </TabsContent>
          <TabsContent id="settings-actions" value="actions" className="grid gap-4">
            <h3>Action execution</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveActionExecutionPolicy(event)}>
              <label>
                Enabled
                <NativeSelect
                  value={actionPolicyEnabled}
                  onChange={(event) => setActionPolicyEnabled(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </NativeSelect>
              </label>
              <label>
                Allowed types
                <Input
                  value={actionPolicyAllowedTypes}
                  onChange={(event) => setActionPolicyAllowedTypes(event.target.value)}
                />
              </label>
              <label>
                Require approval
                <NativeSelect
                  value={actionPolicyRequireApproval}
                  onChange={(event) => setActionPolicyRequireApproval(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </NativeSelect>
              </label>
              <label>
                Dry-run default
                <NativeSelect
                  value={actionPolicyDryRunDefault}
                  onChange={(event) => setActionPolicyDryRunDefault(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </NativeSelect>
              </label>
              <label>
                Kill switch
                <NativeSelect
                  value={actionPolicyKillSwitch}
                  onChange={(event) => setActionPolicyKillSwitch(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </NativeSelect>
              </label>
              <label>
                Requests / hour
                <Input
                  value={actionPolicyMaxRequestsPerHour}
                  onChange={(event) => setActionPolicyMaxRequestsPerHour(event.target.value)}
                />
              </label>
              <label>
                Approval expiry minutes
                <Input
                  value={actionPolicyApprovalExpiresInMinutes}
                  onChange={(event) => setActionPolicyApprovalExpiresInMinutes(event.target.value)}
                />
              </label>
              <Button type="submit">Save action policy</Button>
              <Button type="button" onClick={() => void loadActionExecutionPolicy()}>Load policy</Button>
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
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void executeAgentAction(event)}>
              <label>
                Type
                <NativeSelect
                  value={actionType}
                  onChange={(event) => setActionType(event.target.value as AgentActionType)}
                >
                  {actionTypes.map((candidate) => (
                    <option key={candidate} value={candidate}>{candidate}</option>
                  ))}
                </NativeSelect>
              </label>
              <label>
                Title
                <Input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} />
              </label>
              <label>
                Description
                <Input value={actionDescription} onChange={(event) => setActionDescription(event.target.value)} />
              </label>
              <label>
                Target
                <Input value={actionTarget} onChange={(event) => setActionTarget(event.target.value)} />
              </label>
              <label>
                Idempotency key
                <Input value={actionIdempotencyKey} onChange={(event) => setActionIdempotencyKey(event.target.value)} />
              </label>
              <label>
                Dry run
                <NativeSelect value={actionDryRun} onChange={(event) => setActionDryRun(event.target.value as "true" | "false")}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </NativeSelect>
              </label>
              <Button type="submit" disabled={!actionTitle}>Request action</Button>
              <Button type="button" onClick={() => void loadAgentActions()}>Load requests</Button>
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
                        <Textarea
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
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => setPendingActionDecision({ actionId: action.id, decision: "approve" })}
                          disabled={!decisionReason.trim()}
                        >
                          Stage approve
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setPendingActionDecision({ actionId: action.id, decision: "deny" })}
                          disabled={!decisionReason.trim()}
                        >
                          Stage deny
                        </Button>
                        {stagedDecision ? (
                          <Button
                            type="button"
                            className={stagedDecision === "deny" ? "danger" : "primary"}
                            onClick={() => void decideAgentAction(action.id, stagedDecision, decisionReason)}
                          >
                            Confirm {stagedDecision}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            }) : <p className="empty">No action requests loaded.</p>}
          </TabsContent>
          <TabsContent value="data" className="grid gap-4">
            <h3>Managed query cache</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveManagedQueryCachePolicy(event)}>
              <label>
                Enabled
                <NativeSelect
                  value={cachePolicyEnabled}
                  onChange={(event) => setCachePolicyEnabled(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </NativeSelect>
              </label>
              <label>
                Max TTL seconds
                <Input value={cachePolicyMaxTtl} onChange={(event) => setCachePolicyMaxTtl(event.target.value)} />
              </label>
              <Button type="submit">Save cache policy</Button>
              <Button type="button" onClick={() => void loadManagedQueryCachePolicy()}>Load policy</Button>
            </form>
            {managedQueryCachePolicy ? (
              <p>
                <strong>{managedQueryCachePolicy.source}</strong>
                {" "}
                {managedQueryCachePolicy.cacheEnabled ? "enabled" : "disabled"}, max TTL{" "}
                {formatCachePolicyTtl(managedQueryCachePolicy.maxCacheTtlSeconds)}
              </p>
            ) : <p className="empty">No cache policy loaded.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void loadManagedQueryCache()}>Load cache</Button>
              <Button type="button" onClick={() => void purgeManagedQueryCache(true)}>Dry run purge</Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Execute managed-query cache purge now?")) {
                    void purgeManagedQueryCache(false);
                  }
                }}
              >
                Execute purge
              </Button>
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
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete cache entry ${entry.cacheKey}?`)) {
                      void deleteManagedQueryCacheEntry(entry.cacheKey);
                    }
                  }}
                >
                  Delete
                </Button>
              </p>
            )) : <p className="empty">No cache entries loaded.</p>}
          </TabsContent>
          <TabsContent value="data" className="grid gap-4">
            <h3>Managed query retention</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveManagedQueryRetentionPolicy(event)}>
              <label>
                Prompt capture
                <NativeSelect
                  value={queryRetentionPromptMode}
                  onChange={(event) =>
                    setQueryRetentionPromptMode(event.target.value as "disabled" | "metadata-only")}
                >
                  <option value="disabled">disabled</option>
                  <option value="metadata-only">metadata-only</option>
                </NativeSelect>
              </label>
              <label>
                Response capture
                <NativeSelect
                  value={queryRetentionResponseMode}
                  onChange={(event) =>
                    setQueryRetentionResponseMode(event.target.value as "disabled" | "metadata-only")}
                >
                  <option value="disabled">disabled</option>
                  <option value="metadata-only">metadata-only</option>
                </NativeSelect>
              </label>
              <label>
                Metadata days
                <Input
                  value={queryRetentionMetadataDays}
                  onChange={(event) => setQueryRetentionMetadataDays(event.target.value)}
                />
              </label>
              <Button type="submit">Save query retention</Button>
              <Button type="button" onClick={() => void loadManagedQueryRetentionPolicy()}>Load policy</Button>
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
          </TabsContent>
          <TabsContent value="privacy" className="grid gap-4">
            <h3>Secret references</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void saveSecretReferencePolicy(event)}>
              <label>
                Allowed prefixes
                <Input
                  value={secretReferencePrefixes}
                  onChange={(event) => setSecretReferencePrefixes(event.target.value)}
                />
              </label>
              <label>
                Exact env vars
                <Input
                  value={secretReferenceEnvVars}
                  onChange={(event) => setSecretReferenceEnvVars(event.target.value)}
                />
              </label>
              <label>
                Allow unlisted
                <NativeSelect
                  value={secretReferenceAllowUnlisted}
                  onChange={(event) => setSecretReferenceAllowUnlisted(event.target.value as "true" | "false")}
                >
                  <option value="false">false</option>
                  <option value="true">true</option>
                </NativeSelect>
              </label>
              <Button type="submit">Save secret policy</Button>
              <Button type="button" onClick={() => void loadSecretReferencePolicy()}>Load policy</Button>
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
          </TabsContent>
          <TabsContent value="privacy" className="grid gap-4">
            <h3>Personal data cleanup</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void savePiiRedactionPolicy(event)}>
              <label>
                Enabled
                <NativeSelect
                  value={piiRedactionEnabled}
                  onChange={(event) => setPiiRedactionEnabled(event.target.value as "true" | "false")}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </NativeSelect>
              </label>
              <label>
                Rule kinds
                <Input
                  value={piiRedactionRuleKinds}
                  onChange={(event) => setPiiRedactionRuleKinds(event.target.value)}
                />
              </label>
              <Button type="submit">Save personal data policy</Button>
              <Button type="button" onClick={() => void loadPiiRedactionPolicy()}>Load policy</Button>
            </form>
            {piiRedactionPolicy ? (
              <p>
                <strong>{piiRedactionPolicy.source}</strong>
                {" "}
                enabled {String(piiRedactionPolicy.redactionEnabled)}, rules{" "}
                {formatList(piiRedactionPolicy.enabledRuleKinds)}
              </p>
            ) : <p className="empty">No personal data policy loaded.</p>}
          </TabsContent>
          </Tabs>
          <div className={routePanelClass(currentPage, activityPanelRoutes)}>
            <h3>Retrieval events</h3>
            {telemetryEvents.length ? telemetryEvents.map((event) => (
              <p key={event.id}>
                <strong>{event.query}</strong> results {event.resultCount}, denied {event.deniedCount}
              </p>
            )) : <p className="empty">No telemetry loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, activityPanelRoutes)}>
            <h3>Audit events</h3>
            {auditEvents.length ? auditEvents.map((event) => (
              <p key={event.id}>
                <strong>{event.action}</strong> {event.outcome} on {event.targetType}
              </p>
            )) : <p className="empty">No audit events loaded.</p>}
          </div>
          <Tabs
            value={accessSettingsView}
            onValueChange={(value) => setAccessSettingsView(value as AccessSettingsView)}
            className={routePanelClass(currentPage, accessSettingsPanelRoutes, "admin-section-tabs")}
          >
            <TabsList className="h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="service-policy">Service policy</TabsTrigger>
              <TabsTrigger value="service-accounts">Service accounts</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
              <TabsTrigger value="api-keys">API keys</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
            </TabsList>
          <TabsContent id="settings-users" value="users" className="grid gap-4">
            <h3>Users</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void createUser(event)}>
              <label>
                Email
                <Input value={userEmail} onChange={(event) => setUserEmail(event.target.value)} type="email" autoComplete="username" />
              </label>
              <label>
                Display
                <Input value={userDisplayName} onChange={(event) => setUserDisplayName(event.target.value)} />
              </label>
              <label>
                Role
                <NativeSelect value={userRole} onChange={(event) => setUserRole(event.target.value as typeof userRole)}>
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </NativeSelect>
              </label>
              <label>
                Password
                <Input
                  value={userPassword}
                  onChange={(event) => setUserPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </label>
              <Button type="submit">Create user</Button>
            </form>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void updateUser(event)}>
              <label>
                User ID
                <Input value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} />
              </label>
              <label>
                Display
                <Input
                  value={userUpdateDisplayName}
                  onChange={(event) => setUserUpdateDisplayName(event.target.value)}
                />
              </label>
              <label>
                Role
                <NativeSelect
                  value={userUpdateRole}
                  onChange={(event) => setUserUpdateRole(event.target.value as typeof userUpdateRole)}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </NativeSelect>
              </label>
              <label>
                Status
                <NativeSelect
                  value={userUpdateStatus}
                  onChange={(event) => setUserUpdateStatus(event.target.value as typeof userUpdateStatus)}
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </NativeSelect>
              </label>
              <label className="md:col-span-2">
                New password
                <Input
                  value={userUpdatePassword}
                  onChange={(event) => setUserUpdatePassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                />
              </label>
              <Button type="submit" disabled={!selectedUserId}>Update user</Button>
            </form>
            {users.length ? users.map((user) => (
              <p key={user.id}>
                <strong>{user.email}</strong> {user.role} {user.status} {user.id}
                {" "}
                <Button
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
                </Button>
              </p>
            )) : <p className="empty">No users loaded.</p>}
          </TabsContent>
          <TabsContent value="service-policy" className="grid gap-4">
            <h3>Service policy</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void updateServiceAccountPolicy(event)}>
              <label>
                Max services
                <Input
                  value={servicePolicyMaxAccounts}
                  onChange={(event) => setServicePolicyMaxAccounts(event.target.value)}
                />
              </label>
              <label>
                Max active keys
                <Input
                  value={servicePolicyMaxKeys}
                  onChange={(event) => setServicePolicyMaxKeys(event.target.value)}
                />
              </label>
              <label>
                Default key expiry days
                <Input
                  value={servicePolicyDefaultExpiry}
                  onChange={(event) => setServicePolicyDefaultExpiry(event.target.value)}
                />
              </label>
              <Button type="submit">Save policy</Button>
            </form>
            {serviceAccountPolicy ? (
              <p>
                <strong>{serviceAccountPolicy.source}</strong> max services {policyValue(serviceAccountPolicy.maxServiceAccounts)}, max keys {policyValue(serviceAccountPolicy.maxActiveApiKeysPerServiceAccount)}, default expiry {policyValue(serviceAccountPolicy.defaultApiKeyExpiresInDays)}d
              </p>
            ) : <p className="empty">No service policy loaded.</p>}
          </TabsContent>
          <TabsContent id="settings-service-accounts" value="service-accounts" className="grid gap-4">
            <h3>Service accounts</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void createServiceAccount(event)}>
              <label>
                Slug
                <Input value={serviceAccountSlug} onChange={(event) => setServiceAccountSlug(event.target.value)} />
              </label>
              <label>
                Name
                <Input value={serviceAccountName} onChange={(event) => setServiceAccountName(event.target.value)} />
              </label>
              <label>
                Role
                <NativeSelect
                  value={serviceAccountRole}
                  onChange={(event) => setServiceAccountRole(event.target.value as typeof serviceAccountRole)}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </NativeSelect>
              </label>
              <label>
                Status
                <NativeSelect
                  value={serviceAccountStatus}
                  onChange={(event) => setServiceAccountStatus(event.target.value as typeof serviceAccountStatus)}
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </NativeSelect>
              </label>
              <label className="md:col-span-2">
                Description
                <Input
                  value={serviceAccountDescription}
                  onChange={(event) => setServiceAccountDescription(event.target.value)}
                />
              </label>
              <Button type="submit">Create service</Button>
            </form>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void updateServiceAccount(event)}>
              <label>
                Service ID
                <Input
                  value={selectedServiceAccountId}
                  onChange={(event) => setSelectedServiceAccountId(event.target.value)}
                />
              </label>
              <label>
                Name
                <Input
                  value={serviceAccountUpdateName}
                  onChange={(event) => setServiceAccountUpdateName(event.target.value)}
                />
              </label>
              <label>
                Role
                <NativeSelect
                  value={serviceAccountUpdateRole}
                  onChange={(event) => setServiceAccountUpdateRole(event.target.value as typeof serviceAccountUpdateRole)}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </NativeSelect>
              </label>
              <label>
                Status
                <NativeSelect
                  value={serviceAccountUpdateStatus}
                  onChange={(event) =>
                    setServiceAccountUpdateStatus(event.target.value as typeof serviceAccountUpdateStatus)
                  }
                >
                  <option value="active">active</option>
                  <option value="disabled">disabled</option>
                </NativeSelect>
              </label>
              <label className="md:col-span-2">
                Description
                <Input
                  value={serviceAccountUpdateDescription}
                  onChange={(event) => setServiceAccountUpdateDescription(event.target.value)}
                />
              </label>
              <Button type="submit" disabled={!selectedServiceAccountId}>Update service</Button>
            </form>
            {serviceAccounts.length ? serviceAccounts.map((serviceAccount) => (
              <p key={serviceAccount.id}>
                <strong>{serviceAccount.slug}</strong> {serviceAccount.role} {serviceAccount.status} {serviceAccount.id}
                {" "}
                <Button
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
                </Button>
              </p>
            )) : <p className="empty">No service accounts loaded.</p>}
          </TabsContent>
          <TabsContent value="groups" className="grid gap-4">
            <h3>Groups</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void createGroup(event)}>
              <label>
                Slug
                <Input value={groupSlug} onChange={(event) => setGroupSlug(event.target.value)} />
              </label>
              <label>
                Name
                <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} />
              </label>
              <label className="md:col-span-2">
                Description
                <Input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} />
              </label>
              <Button type="submit">Create</Button>
            </form>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void addGroupMember(event)}>
              <label>
                Group ID
                <Input value={memberGroupId} onChange={(event) => setMemberGroupId(event.target.value)} />
              </label>
              <label>
                User ID
                <Input value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} />
              </label>
              <Button type="submit" disabled={!memberGroupId || !memberUserId}>Add member</Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Remove this user from the selected group?")) {
                    void removeGroupMember();
                  }
                }}
                disabled={!memberGroupId || !memberUserId}
              >
                Remove member
              </Button>
              <Button type="button" onClick={() => void loadGroupMembers()} disabled={!memberGroupId}>Members</Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Delete the selected group? This cannot be undone.")) {
                    void deleteGroup();
                  }
                }}
                disabled={!memberGroupId}
              >
                Delete group
              </Button>
            </form>
            {groups.length ? groups.map((group) => (
              <p key={group.id}>
                <strong>{group.slug}</strong> {group.name} {group.description ?? ""}
                {" "}
                <Button type="button" onClick={() => setMemberGroupId(group.id)}>Select</Button>
              </p>
            )) : <p className="empty">No groups loaded.</p>}
            {groupMembers.length ? groupMembers.map((member) => (
              <p key={`${member.groupId}:${member.userId}`}>
                <strong>{member.userEmail}</strong> {member.userRole} in {member.groupId}
                {" "}
                <Button
                  type="button"
                  onClick={() => {
                    setMemberGroupId(member.groupId);
                    setMemberUserId(member.userId);
                  }}
                >
                  Select
                </Button>
              </p>
            )) : <p className="empty">No members loaded.</p>}
          </TabsContent>
          <TabsContent id="settings-api-keys" value="api-keys" className="grid gap-4">
            <h3>API keys</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void createApiKey(event)}>
              <label>
                User ID
                <Input
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
                <Input
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
                <Input value={keyName} onChange={(event) => setKeyName(event.target.value)} />
              </label>
              <label>
                Scopes
                <Input value={keyScopes} onChange={(event) => setKeyScopes(event.target.value)} />
              </label>
              <label>
                Expires
                <Input value={keyExpiresAt} onChange={(event) => setKeyExpiresAt(event.target.value)} />
              </label>
              <Button
                type="submit"
                disabled={!keyName || Number(Boolean(keyUserId)) + Number(Boolean(keyServiceAccountId)) !== 1}
              >
                Create key
              </Button>
            </form>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => event.preventDefault()}>
              <label>
                Key ID
                <Input value={selectedApiKeyId} onChange={(event) => setSelectedApiKeyId(event.target.value)} />
              </label>
              <label>
                New name
                <Input value={rotateKeyName} onChange={(event) => setRotateKeyName(event.target.value)} />
              </label>
              <label>
                Revoke old
                <NativeSelect
                  value={String(revokeOldKey)}
                  onChange={(event) => setRevokeOldKey(event.target.value === "true")}
                >
                  <option value="false">no</option>
                  <option value="true">yes</option>
                </NativeSelect>
              </label>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Rotate the selected API key?")) {
                    void rotateApiKey();
                  }
                }}
                disabled={!selectedApiKeyId}
              >
                Rotate
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Revoke the selected API key? Existing clients using it will stop working.")) {
                    void revokeApiKey();
                  }
                }}
                disabled={!selectedApiKeyId}
              >
                Revoke
              </Button>
            </form>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => event.preventDefault()}>
              <label>
                Due days
                <Input value={apiKeyRotationDueDays} onChange={(event) => setApiKeyRotationDueDays(event.target.value)} />
              </label>
              <Button type="button" onClick={() => void loadApiKeyRotationReport()}>Load rotation due</Button>
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
                <Input value={oneTimeSecret} readOnly type="password" autoComplete="off" />
              </label>
            ) : null}
            {apiKeyRecords.length ? apiKeyRecords.map((record) => (
              <p key={record.id}>
                <strong>{record.name}</strong> {keyOwnerLabel(record)} {record.secretPreview} {record.scopes.join(",")} {record.revokedAt ? "revoked" : "active"} {record.id}
              </p>
            )) : <p className="empty">No API keys loaded.</p>}
          </TabsContent>
          <TabsContent id="settings-sessions" value="sessions" className="grid gap-4">
            <h3>Login sessions</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => event.preventDefault()}>
              <label>
                Session ID
                <Input
                  value={selectedLoginSessionId}
                  onChange={(event) => setSelectedLoginSessionId(event.target.value)}
                />
              </label>
              <Button type="button" onClick={() => void loadLoginSessions()}>Load sessions</Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (window.confirm("Revoke the selected login session?")) {
                    void revokeLoginSession();
                  }
                }}
                disabled={!selectedLoginSessionId}
              >
                Revoke session
              </Button>
            </form>
            {loginSessions.length ? loginSessions.map((session) => (
              <p key={session.id}>
                <strong>{session.deviceLabel ?? session.source}</strong> {session.revokedAt ? "revoked" : "active"} user {session.userId} key {session.apiKeyId} expires {new Date(session.expiresAt).toLocaleString()} {session.clientUserAgent ? `client ${session.clientUserAgent}` : ""} {session.id}
                {" "}
                <Button type="button" onClick={() => setSelectedLoginSessionId(session.id)}>Select</Button>
              </p>
            )) : <p className="empty">No login sessions loaded.</p>}
          </TabsContent>
          </Tabs>
          <div className={routePanelClass(currentPage, activityPanelRoutes)}>
            <h3>Managed query feedback</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] md:items-end" onSubmit={(event) => void submitFeedback(event)}>
              <label>
                Event ID
                <Input
                  value={feedbackTelemetryEventId}
                  onChange={(event) => setFeedbackTelemetryEventId(event.target.value)}
                />
              </label>
              <label>
                Query
                <Input value={feedbackQuery} onChange={(event) => setFeedbackQuery(event.target.value)} />
              </label>
              <label>
                Outcome
                <NativeSelect
                  value={feedbackOutcome}
                  onChange={(event) => setFeedbackOutcome(event.target.value as typeof feedbackOutcome)}
                >
                  <option value="accepted">accepted</option>
                  <option value="needs-review">needs-review</option>
                  <option value="rejected">rejected</option>
                </NativeSelect>
              </label>
              <label>
                Citation score
                <Input
                  value={feedbackCitationAccuracy}
                  onChange={(event) => setFeedbackCitationAccuracy(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <Button type="submit">Submit</Button>
            </form>
            {feedbackRecords.length ? feedbackRecords.map((record) => (
              <p key={record.id}>
                <strong>{record.outcome}</strong> {record.query} citation {record.factualCitationAccuracy ?? "n/a"}
              </p>
            )) : <p className="empty">No feedback loaded.</p>}
          </div>
          <div className={routePanelClass(currentPage, activityAndHealthPanelRoutes)}>
            <h3>Demo eval report</h3>
            <Button type="button" onClick={() => void runDemoEval()}>Run demo eval</Button>
            {evalReport ? (
              <>
                <DefinitionGrid
                  compact
                  items={[
                    { term: "Status", description: evalReport.ok ? "passing" : "failing" },
                    { term: "Cases", description: `${evalReport.passedCount}/${evalReport.caseCount}` },
                    { term: "Pass rate", description: formatPercent(evalReport.passRate) },
                    { term: "Threshold", description: formatPercent(evalReport.minimumPassRate) }
                  ]}
                />
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
                <DefinitionGrid
                  compact
                  items={[
                    { term: "Runs", description: evalSummary.runCount },
                    { term: "Latest", description: evalSummary.latestPassRate === null ? "n/a" : formatPercent(evalSummary.latestPassRate) },
                    { term: "Average", description: evalSummary.averagePassRate === null ? "n/a" : formatPercent(evalSummary.averagePassRate) },
                    { term: "Cases", description: `${evalSummary.totalPassedCount}/${evalSummary.totalCaseCount}` },
                    { term: "Thresholds", description: `${evalSummary.thresholdPassedCount}/${evalSummary.runCount}` },
                    { term: "Generated", description: new Date(evalSummary.generatedAt).toLocaleTimeString() }
                  ]}
                />
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
          <div className={routePanelClass(currentPage, integrationsPanelRoutes)}>
            <h3>Provider config</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:items-end" onSubmit={(event) => void saveProviderConfig(event)}>
              <label>
                Provider
                <NativeSelect
                  value={providerForm.provider}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    provider: event.target.value as ModelProvider
                  }))}
                >
                  <option value="openai">openai</option>
                  <option value="anthropic">anthropic</option>
                  <option value="openrouter">openrouter</option>
                </NativeSelect>
              </label>
              <label>
                Enabled
                <NativeSelect
                  value={String(providerForm.enabled)}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    enabled: event.target.value === "true"
                  }))}
                >
                  <option value="true">enabled</option>
                  <option value="false">disabled</option>
                </NativeSelect>
              </label>
              <label>
                Env var
                <Input
                  value={providerForm.apiKeyEnvVar}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    apiKeyEnvVar: event.target.value
                  }))}
                />
              </label>
              <label>
                Display
                <Input
                  value={providerForm.displayName}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    displayName: event.target.value
                  }))}
                />
              </label>
              <label>
                Base URL
                <Input
                  value={providerForm.baseUrl}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    baseUrl: event.target.value
                  }))}
                />
              </label>
              <label>
                Default model
                <Input
                  value={providerForm.defaultModel}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    defaultModel: event.target.value
                  }))}
                />
              </label>
              <label>
                Models
                <Input
                  value={providerForm.models}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    models: event.target.value
                  }))}
                />
              </label>
              <label>
                Priority
                <Input
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
                <Input
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
                <Input
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
                <Input
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
                <Input
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
                <Input
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
                <Input
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
                <Input
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
                <Input
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
                <Input
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
                <Input
                  value={providerForm.maxEstimatedCostUsdPerQuery}
                  onChange={(event) => setProviderForm((current) => ({
                    ...current,
                    maxEstimatedCostUsdPerQuery: event.target.value
                  }))}
                  inputMode="decimal"
                />
              </label>
              <Button type="submit">Save</Button>
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
          <div className={routePanelClass(currentPage, integrationsPanelRoutes)}>
            <h3>Auth provider config</h3>
            <form className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:items-end" onSubmit={(event) => void saveAuthProviderConfig(event)}>
              <label>
                Provider
                <NativeSelect
                  value={authProviderForm.provider}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    provider: event.target.value as ExternalAuthProvider
                  }))}
                >
                  <option value="microsoft-entra">microsoft-entra</option>
                  <option value="oidc">oidc</option>
                </NativeSelect>
              </label>
              <label>
                Enabled
                <NativeSelect
                  value={String(authProviderForm.enabled)}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    enabled: event.target.value === "true"
                  }))}
                >
                  <option value="true">enabled</option>
                  <option value="false">disabled</option>
                </NativeSelect>
              </label>
              <label>
                Issuer URL
                <Input
                  value={authProviderForm.issuerUrl}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    issuerUrl: event.target.value
                  }))}
                />
              </label>
              <label>
                Client ID
                <Input
                  value={authProviderForm.clientId}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    clientId: event.target.value
                  }))}
                />
              </label>
              <label>
                Secret env var
                <Input
                  value={authProviderForm.clientSecretEnvVar}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    clientSecretEnvVar: event.target.value
                  }))}
                />
              </label>
              <label>
                Redirect URI
                <Input
                  value={authProviderForm.redirectUri}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    redirectUri: event.target.value
                  }))}
                />
              </label>
              <label>
                Display
                <Input
                  value={authProviderForm.displayName}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    displayName: event.target.value
                  }))}
                />
              </label>
              <label>
                Scopes
                <Input
                  value={authProviderForm.scopes}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    scopes: event.target.value
                  }))}
                />
              </label>
              <label>
                Group claim
                <Input
                  value={authProviderForm.groupClaim}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    groupClaim: event.target.value
                  }))}
                />
              </label>
              <label>
                Allowed domains
                <Input
                  value={authProviderForm.allowedDomains}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    allowedDomains: event.target.value
                  }))}
                />
              </label>
              <label>
                Default role
                <NativeSelect
                  value={authProviderForm.defaultRole}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    defaultRole: event.target.value as AuthProviderFormState["defaultRole"]
                  }))}
                >
                  <option value="reader">reader</option>
                  <option value="maintainer">maintainer</option>
                  <option value="admin">admin</option>
                </NativeSelect>
              </label>
              <label>
                Priority
                <Input
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
                <NativeSelect
                  value={String(authProviderForm.autoProvisionUsers)}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    autoProvisionUsers: event.target.value === "true"
                  }))}
                >
                  <option value="false">disabled</option>
                  <option value="true">enabled</option>
                </NativeSelect>
	              </label>
	              <label>
	                Account linking
	                <NativeSelect
	                  value={authProviderForm.accountLinkingMode}
	                  onChange={(event) => setAuthProviderForm((current) => ({
	                    ...current,
	                    accountLinkingMode: event.target.value as AccountLinkingMode
	                  }))}
	                >
	                  <option value="verified-email">verified email</option>
	                  <option value="disabled">disabled</option>
	                  <option value="email">email match</option>
	                </NativeSelect>
	              </label>
	              <label>
	                Group sync
	                <NativeSelect
                  value={String(authProviderForm.groupSyncEnabled)}
                  onChange={(event) => setAuthProviderForm((current) => ({
                    ...current,
                    groupSyncEnabled: event.target.value === "true"
                  }))}
                >
                  <option value="false">disabled</option>
                  <option value="true">enabled</option>
                </NativeSelect>
              </label>
              <Button type="submit">Save auth provider</Button>
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
        <main className="public-entry-main login-entry-main" id="main" tabIndex={-1}>
          <Card className="login-panel" aria-labelledby="login-title">
            <CardHeader className="login-dialog-header">
                <span className="mark login-mark" aria-hidden="true">
                  <img className="mark-image" src="/favicon.svg" alt="" />
                </span>
                <div>
                <CardDescription className="eyebrow">ForgetBase</CardDescription>
                <CardTitle><h1 id="login-title">Log in to ForgetBase</h1></CardTitle>
                <CardDescription id="login-description" className="lede">
                  Use your account to read pages or manage the knowledge base.
                </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="login-panel-content">
              {currentPage === "distribute" ? (
                <Alert variant="info" className="queued-route">
                  <AlertDescription>Demo path queued: <code>#{canonicalRouteHash(currentPage)}</code></AlertDescription>
                </Alert>
              ) : null}
              {authState === "checking" ? (
                <Alert variant="info" className="public-session-alert">
                  <AlertDescription>Checking session</AlertDescription>
                </Alert>
              ) : null}
              <form className="public-login-form" onSubmit={(event) => void login(event)}>
                <div className="public-login-field">
                  <Label htmlFor="login-email">Username / email</Label>
                  <Input
                    id="login-email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    type="text"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="public-login-field">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="public-login-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={authState === "checking" || !loginEmail.trim() || !loginPassword}
                  >
                    Log in
                  </Button>
                </div>
              </form>
              {message ? (
                <Alert variant="success" className="public-login-alert">
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              {error ? (
                <Alert variant="destructive" className="public-login-alert">
                  <AlertTitle>Login failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
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

function selectAssetFromRow(event: ReactKeyboardEvent<HTMLTableRowElement>, selectAsset: () => void): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  selectAsset();
}

function keyOwnerLabel(record: ApiKeyRecord): string {
  return record.serviceAccountId
    ? `service:${record.serviceAccountId}`
    : `user:${record.userId ?? "unknown"}`;
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

function compactMetadata(values: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== undefined)
  );
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
