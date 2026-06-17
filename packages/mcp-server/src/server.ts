import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
	import {
	  agentActionTypeSchema,
	  assetTypeSchema,
  managedQueryEvalScheduleInputSchema,
  managedQueryModeSchema,
  modelProviderSchema,
  piiRedactionRuleKindSchema
} from "@agentic-cms/schema";
import { AgenticCmsClient } from "@agentic-cms/sdk";
import { z } from "zod";

const DEFAULT_API_URL = "http://127.0.0.1:3000";

export interface CreateMcpServerOptions {
  apiUrl?: string;
  apiKey?: string;
}

export function createMcpServer(options: CreateMcpServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "agentic-cms",
    version: "0.1.0"
  });
  const client = new AgenticCmsClient({
    baseUrl: options.apiUrl ?? DEFAULT_API_URL,
    apiKey: options.apiKey,
    surface: "mcp"
  });

  server.registerTool(
    "list_asset_types",
    {
      title: "List asset types",
      description: "List the governed asset types currently known by the Agentic CMS schema.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ assetTypes: assetTypeSchema.options }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_assets",
    {
      title: "List assets",
      description: "List governed registry assets visible through the Agentic CMS API.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ assets: await client.listAssets() }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_assets_needing_review",
    {
      title: "List assets needing review",
      description: "List governed assets that are stale, not approved, or not active. Requires a write-capable API key.",
      inputSchema: z.object({
        asOf: z.string().min(1).optional(),
        includeApproved: z.boolean().default(false),
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ asOf, includeApproved, limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.listAssetsNeedingReview({ asOf, includeApproved, limit }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_asset",
    {
      title: "Get asset",
      description: "Fetch a governed registry asset by stable ID through the Agentic CMS API.",
      inputSchema: z.object({
        stableId: z.string().min(1)
      })
    },
    async ({ stableId }) => {
      const asset = await client.getAsset(stableId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(asset ?? { error: "asset_not_found", stableId }, null, 2)
          }
        ]
      };
    }
  );

  server.registerTool(
    "get_asset_version",
    {
      title: "Get asset version",
      description: "Fetch the instruction and human document content for a specific governed asset version.",
      inputSchema: z.object({
        stableId: z.string().min(1),
        versionNumber: z.number().int().positive()
      })
    },
    async ({ stableId, versionNumber }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getAssetVersionSnapshot(stableId, { versionNumber }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "search_assets",
    {
      title: "Search assets",
      description: "Search governed Agentic CMS chunks with permission filtering and citations.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).default(10)
      })
    },
    async ({ query, limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.search({ query, limit }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "managed_query",
    {
      title: "Managed query",
      description: "Run the managed query layer over permission-filtered Agentic CMS context.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(10).default(5),
        mode: managedQueryModeSchema.default("deterministic-retrieval"),
        provider: modelProviderSchema.optional(),
        model: z.string().min(1).optional(),
        cache: z.boolean().default(true)
      })
    },
    async ({ query, limit, mode, provider, model, cache }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.managedQuery({ query, limit, mode, provider, model, cache }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "submit_managed_query_feedback",
    {
      title: "Submit managed query feedback",
      description: "Record outcome acceptance and quality scores for a managed query response.",
      inputSchema: z.object({
        telemetryEventId: z.string().min(1),
        query: z.string().min(1),
        outcome: z.enum(["accepted", "rejected", "needs-review"]),
        factualCitationAccuracy: z.number().int().min(1).max(5).optional(),
        policyCompliance: z.number().int().min(1).max(5).optional(),
        taskCompletionQuality: z.number().int().min(1).max(5).optional(),
        consistency: z.number().int().min(1).max(5).optional(),
        responseEffectiveness: z.number().int().min(1).max(5).optional(),
        notes: z.string().min(1).max(4000).optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.submitManagedQueryFeedback(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_managed_query_feedback",
    {
      title: "List managed query feedback",
      description: "List managed query feedback records visible to the configured admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ feedback: await client.listManagedQueryFeedback(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_managed_query_cache",
    {
      title: "List managed query cache",
      description: "List safe managed-query cache metadata visible to the configured admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ entries: await client.listManagedQueryCacheEntries(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_managed_query_policy",
    {
      title: "Get managed query policy",
      description: "Get tenant managed-query guardrails for mode selection and citation grounding. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getManagedQueryPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_managed_query_policy",
    {
      title: "Update managed query policy",
      description: "Update tenant managed-query mode and citation-grounding guardrails. Requires an admin API key.",
      inputSchema: z.object({
        defaultMode: managedQueryModeSchema.optional(),
        allowedModes: z.array(managedQueryModeSchema).min(1).optional(),
        minimumCitationCount: z.number().int().nonnegative().max(10).optional(),
        requireGrounded: z.boolean().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateManagedQueryPolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_retrieval_ranking_policy",
    {
      title: "Get retrieval ranking policy",
      description: "Get tenant retrieval ranking weights for lexical search. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getRetrievalRankingPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_retrieval_ranking_policy",
    {
      title: "Update retrieval ranking policy",
      description: "Update tenant retrieval ranking weights for lexical search. Requires an admin API key.",
      inputSchema: z.object({
        agentInstructionWeight: z.number().positive().max(10).optional(),
        assetSummaryWeight: z.number().positive().max(10).optional(),
        humanDocumentWeight: z.number().positive().max(10).optional(),
        exactPhraseBoost: z.number().nonnegative().max(10).optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateRetrievalRankingPolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_managed_query_cache_policy",
    {
      title: "Get managed query cache policy",
      description: "Get tenant managed-query cache policy controls. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getManagedQueryCachePolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_managed_query_cache_policy",
    {
      title: "Update managed query cache policy",
      description: "Enable or disable generated-answer caching and set the tenant max TTL. Use null for no tenant TTL cap. Requires an admin API key.",
      inputSchema: z.object({
        cacheEnabled: z.boolean().optional(),
        maxCacheTtlSeconds: z.number().int().positive().max(86_400).nullable().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateManagedQueryCachePolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "delete_managed_query_cache_entry",
    {
      title: "Delete managed query cache entry",
      description: "Delete one managed-query cache entry by cache key without exposing cached answer text. Requires an admin API key.",
      inputSchema: z.object({
        cacheKey: z.string().min(1)
      })
    },
    async ({ cacheKey }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.deleteManagedQueryCacheEntry(cacheKey), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "purge_managed_query_cache",
    {
      title: "Purge managed query cache",
      description: "Dry-run or execute deletion of expired managed-query cache rows. Defaults to dry run and requires an admin API key.",
      inputSchema: z.object({
        expiredBefore: z.string().min(1).optional(),
        dryRun: z.boolean().default(true)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.purgeManagedQueryCache(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_managed_query_retention_policy",
    {
      title: "Get managed query retention policy",
      description: "Get tenant prompt/response capture policy for provider-routed managed queries. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getManagedQueryRetentionPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_managed_query_retention_policy",
    {
      title: "Update managed query retention policy",
      description: "Set prompt/response capture modes and metadata retention days. Current modes do not store raw prompts or responses. Requires an admin API key.",
      inputSchema: z.object({
        promptCaptureMode: z.enum(["disabled", "metadata-only"]).optional(),
        responseCaptureMode: z.enum(["disabled", "metadata-only"]).optional(),
        metadataRetentionDays: z.number().int().positive().max(3650).nullable().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateManagedQueryRetentionPolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_secret_reference_policy",
    {
      title: "Get secret reference policy",
      description: "Get tenant policy for env-var names that provider and OIDC configs may reference. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getSecretReferencePolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_secret_reference_policy",
    {
      title: "Update secret reference policy",
      description: "Set exact env-var names, allowed prefixes, and the allow-unlisted escape hatch for provider and OIDC secret references. Requires an admin API key.",
      inputSchema: z.object({
        allowedEnvVarPrefixes: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(100).optional(),
        allowedEnvVars: z.array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/)).max(200).optional(),
        allowUnlistedEnvVars: z.boolean().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateSecretReferencePolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_pii_redaction_policy",
    {
      title: "Get PII redaction policy",
      description: "Get tenant policy for deterministic PII redaction across telemetry, feedback, eval-run query storage, and cache bypass. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getPiiRedactionPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_pii_redaction_policy",
    {
      title: "Update PII redaction policy",
      description: "Enable or disable deterministic PII redaction and choose active rule kinds. Requires an admin API key.",
      inputSchema: z.object({
        redactionEnabled: z.boolean().optional(),
        enabledRuleKinds: z.array(piiRedactionRuleKindSchema).max(100).optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updatePiiRedactionPolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_telemetry_summary",
    {
      title: "Get telemetry summary",
      description: "Get the recent-window telemetry, audit, feedback, and governed asset summary for admins.",
      inputSchema: z.object({
        since: z.string().min(1).optional(),
        until: z.string().min(1).optional(),
        limit: z.number().int().positive().max(200).default(200)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.telemetrySummary(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_audit_events",
    {
      title: "List audit events",
      description: "List recent audit events visible to the configured admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ events: await client.listAuditEvents(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_telemetry_retention_policy",
    {
      title: "Get telemetry retention policy",
      description: "Get the tenant telemetry retention policy. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getTelemetryRetentionPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_telemetry_retention_policy",
    {
      title: "Update telemetry retention policy",
      description: "Update telemetry retention days. Use null to retain a stream forever. Requires an admin API key.",
      inputSchema: z.object({
        retrievalEventRetentionDays: z.number().int().positive().max(3650).nullable().optional(),
        auditEventRetentionDays: z.number().int().positive().max(3650).nullable().optional(),
        feedbackRetentionDays: z.number().int().positive().max(3650).nullable().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateTelemetryRetentionPolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "purge_telemetry_retention",
    {
      title: "Purge telemetry by retention policy",
      description: "Dry-run or execute telemetry retention purge. Defaults to dry run and requires an admin API key.",
      inputSchema: z.object({
        dryRun: z.boolean().default(true)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.purgeTelemetryRetention(input), null, 2)
        }
      ]
    })
  );

	  server.registerTool(
	    "run_managed_query_eval",
    {
      title: "Run managed query eval",
      description: "Run deterministic managed query eval cases against permission-filtered Agentic CMS context.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(10).default(5),
        minimumPassRate: z.number().min(0).max(1).default(1),
        tagMinimumPassRates: z.record(z.string().min(1), z.number().min(0).max(1)).default({}),
        cases: z.array(z.object({
          id: z.string().min(1),
          query: z.string().min(1),
          expectedStableIds: z.array(z.string().min(1)).default([]),
          expectedGrounded: z.boolean().default(true),
          requiredCitationCount: z.number().int().nonnegative().default(1),
          tags: z.array(z.string().min(1)).default([]),
          metadata: z.record(z.string(), z.unknown()).default({})
        })).min(1)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.runManagedQueryEval(input), null, 2)
        }
      ]
	    })
	  );

  server.registerTool(
    "list_managed_query_eval_runs",
    {
      title: "List managed query eval runs",
      description: "List recent deterministic managed query eval runs. Requires an admin API key when auth is enabled.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ runs: await client.listManagedQueryEvalRuns(input.limit) }, null, 2)
        }
      ]
    })
  );

	  server.registerTool(
	    "summarize_managed_query_eval_runs",
    {
      title: "Summarize managed query eval runs",
      description: "Summarize recent deterministic managed query eval run trends. Requires an admin API key when auth is enabled.",
      inputSchema: z.object({
        since: z.string().optional(),
        until: z.string().optional(),
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.managedQueryEvalSummary(input), null, 2)
        }
      ]
    })
	  );

  server.registerTool(
    "get_managed_query_eval_schedule_policy",
    {
      title: "Get managed query eval schedule policy",
      description: "Get the tenant deterministic managed-query eval schedule policy. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getManagedQueryEvalSchedulePolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_managed_query_eval_schedule_policy",
    {
      title: "Update managed query eval schedule policy",
      description: "Enable or configure scheduled deterministic evals. Inline eval queries are stored in policy for worker replay. Requires an admin API key.",
      inputSchema: z.object({
        enabled: z.boolean().optional(),
        intervalMinutes: z.number().int().positive().max(43200).optional(),
        evalInput: managedQueryEvalScheduleInputSchema.nullable().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateManagedQueryEvalSchedulePolicy(input), null, 2)
        }
      ]
    })
  );

	  server.registerTool(
	    "get_action_execution_policy",
    {
      title: "Get action execution policy",
      description: "Get the tenant action execution policy. Requires an admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getActionExecutionPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_action_execution_policy",
    {
      title: "Update action execution policy",
      description: "Enable or constrain action execution. Requires an admin API key.",
      inputSchema: z.object({
        enabled: z.boolean().optional(),
        allowedActionTypes: z.array(agentActionTypeSchema).default([]).optional(),
        requireApproval: z.boolean().optional(),
        dryRunDefault: z.boolean().optional(),
        killSwitch: z.boolean().optional(),
        maxRequestsPerHour: z.number().int().positive().max(10000).optional(),
        approvalExpiresInMinutes: z.number().int().positive().max(10080).optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateActionExecutionPolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "execute_agent_action",
    {
      title: "Execute agent action",
      description: "Submit an agent action request through tenant policy. Requires admin or agent:execute scope. Disabled by default and may dry-run or require approval.",
      inputSchema: z.object({
        actionType: agentActionTypeSchema,
        title: z.string().min(1),
        description: z.string().min(1).optional(),
        target: z.string().min(1).optional(),
        idempotencyKey: z.string().min(1).max(200).optional(),
        dryRun: z.boolean().optional(),
        payload: z.record(z.string(), z.unknown()).default({}),
        metadata: z.record(z.string(), z.unknown()).default({})
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.executeAgentAction(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_agent_actions",
    {
      title: "List agent actions",
      description: "List tenant action requests. Requires an admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ actions: await client.listAgentActions(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "decide_agent_action",
    {
      title: "Approve or deny agent action",
      description: "Approve or deny an action request awaiting approval. Requires an admin API key.",
      inputSchema: z.object({
        actionRequestId: z.string().min(1),
        decision: z.enum(["approve", "deny"]),
        reason: z.string().min(1).optional(),
        metadata: z.record(z.string(), z.unknown()).default({})
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.decideAgentAction(input), null, 2)
        }
      ]
    })
  );

	  server.registerTool(
	    "list_model_provider_configs",
    {
      title: "List model provider configs",
      description: "List admin-managed model provider configuration. Secret values are not stored.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ providers: await client.listModelProviderConfigs() }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_model_provider_health",
    {
      title: "List model provider health",
      description: "List provider readiness for admin-managed model routing without exposing secret values.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ providers: await client.listModelProviderHealth() }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_auth_provider_configs",
    {
      title: "List auth provider configs",
      description: "List admin-managed external auth provider configuration. Client secrets are not stored.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ authProviders: await client.listAuthProviderConfigs() }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "start_oidc_login",
    {
      title: "Start OIDC login",
      description: "Create an OIDC authorization URL plus signed state, nonce, and PKCE verifier.",
      inputSchema: z.object({
        tenantId: z.string().min(1).default("tenant_demo"),
        provider: z.enum(["oidc", "microsoft-entra"]),
        redirectUri: z.string().url().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.startOidcLogin(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "complete_oidc_login",
    {
      title: "Complete OIDC login",
      description: "Exchange an OIDC authorization code, validate the ID token, and issue a short-lived Agentic CMS API key.",
      inputSchema: z.object({
        tenantId: z.string().min(1).default("tenant_demo"),
        provider: z.enum(["oidc", "microsoft-entra"]),
        code: z.string().min(1),
        state: z.string().min(1),
        nonce: z.string().min(1),
        codeVerifier: z.string().min(43),
        redirectUri: z.string().url().optional(),
        keyName: z.string().min(1).default("oidc-login"),
        expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 30).default(60 * 60 * 12)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.completeOidcLogin(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "create_user",
    {
      title: "Create user",
      description: "Create a local user through the Agentic CMS API. Requires an admin API key.",
      inputSchema: z.object({
        email: z.string().email(),
        displayName: z.string().min(1),
        role: z.enum(["admin", "maintainer", "reader"]).default("reader"),
        status: z.enum(["active", "disabled"]).default("active")
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.createUser(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_users",
    {
      title: "List users",
      description: "List local users visible to the configured admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ users: await client.listUsers(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_user",
    {
      title: "Update user",
      description: "Update a local user's display name, role, status, or password. Requires an admin API key.",
      inputSchema: z.object({
        userId: z.string().min(1),
        displayName: z.string().min(1).optional(),
        role: z.enum(["admin", "maintainer", "reader"]).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        password: z.string().min(12).optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateUser(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "create_service_account",
    {
      title: "Create service account",
      description: "Create a non-human service account through the Agentic CMS API. Requires an admin API key.",
      inputSchema: z.object({
        slug: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1).optional(),
        role: z.enum(["admin", "maintainer", "reader"]).default("reader"),
        status: z.enum(["active", "disabled"]).default("active")
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.createServiceAccount(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_service_accounts",
    {
      title: "List service accounts",
      description: "List service accounts visible to the configured admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ serviceAccounts: await client.listServiceAccounts(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_service_account",
    {
      title: "Update service account",
      description: "Update a service account's name, description, role, or status. Requires an admin API key.",
      inputSchema: z.object({
        serviceAccountId: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().min(1).nullable().optional(),
        role: z.enum(["admin", "maintainer", "reader"]).optional(),
        status: z.enum(["active", "disabled"]).optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateServiceAccount(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_service_account_policy",
    {
      title: "Get service account policy",
      description: "Get tenant service-account policy limits for the configured admin API key.",
      inputSchema: z.object({})
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getServiceAccountPolicy(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "update_service_account_policy",
    {
      title: "Update service account policy",
      description: "Update service-account count, service-owned key count, and default key expiry policy. Requires an admin API key.",
      inputSchema: z.object({
        maxServiceAccounts: z.number().int().positive().nullable().optional(),
        maxActiveApiKeysPerServiceAccount: z.number().int().positive().nullable().optional(),
        defaultApiKeyExpiresInDays: z.number().int().positive().nullable().optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.updateServiceAccountPolicy(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "create_api_key",
    {
      title: "Create API key",
      description: "Create a scoped API key for a local user or service account, including least-privilege agent:execute automation keys. Returns the raw secret once and requires an admin API key.",
      inputSchema: z.object({
        userId: z.string().min(1).optional(),
        serviceAccountId: z.string().min(1).optional(),
        name: z.string().min(1),
        scopes: z.array(z.enum(["admin", "asset:read", "asset:write", "permission:write", "agent:execute"])).min(1).default(["asset:read"]),
        expiresAt: z.string().min(1).optional()
      })
    },
    async (input) => {
      if (Boolean(input.userId) === Boolean(input.serviceAccountId)) {
        throw new Error("Provide exactly one API-key owner: userId or serviceAccountId");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await client.createApiKey(input), null, 2)
          }
        ]
      };
    }
  );

  server.registerTool(
    "list_api_keys",
    {
      title: "List API keys",
      description: "List API key records without raw secrets. Requires an admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ apiKeys: await client.listApiKeys(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_login_sessions",
    {
      title: "List login sessions",
      description: "List password/OIDC login sessions without raw secrets. Requires an authenticated user or admin API key.",
      inputSchema: z.object({
        userId: z.string().min(1).optional(),
        includeRevoked: z.boolean().default(false),
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ sessions: await client.listLoginSessions(input) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "revoke_login_session",
    {
      title: "Revoke login session",
      description: "Revoke a password/OIDC login session and its underlying login API key.",
      inputSchema: z.object({
        sessionId: z.string().min(1)
      })
    },
    async ({ sessionId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.revokeLoginSession(sessionId), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_api_key_rotation_due",
    {
      title: "List API key rotation due",
      description: "List service-account API keys that are expired, near expiry, or missing an expiry. Requires an admin API key.",
      inputSchema: z.object({
        asOf: z.string().min(1).optional(),
        dueWithinDays: z.number().int().nonnegative().max(3650).default(14),
        includeUserKeys: z.boolean().default(false),
        includeRevoked: z.boolean().default(false),
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.getApiKeyRotationReport(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "rotate_api_key",
    {
      title: "Rotate API key",
      description: "Create a replacement API key from an existing key. Returns the replacement raw secret once.",
      inputSchema: z.object({
        apiKeyId: z.string().min(1),
        name: z.string().min(1).optional(),
        revokeOld: z.boolean().default(false)
      })
    },
    async ({ apiKeyId, name, revokeOld }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.rotateApiKey(apiKeyId, { name, revokeOld }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "revoke_api_key",
    {
      title: "Revoke API key",
      description: "Revoke an API key by ID. Requires an admin API key.",
      inputSchema: z.object({
        apiKeyId: z.string().min(1)
      })
    },
    async ({ apiKeyId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.revokeApiKey(apiKeyId), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "create_group",
    {
      title: "Create group",
      description: "Create a local auth group through the Agentic CMS API. Requires an admin API key.",
      inputSchema: z.object({
        slug: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1).optional()
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.createGroup(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_groups",
    {
      title: "List groups",
      description: "List local auth groups visible to the configured admin API key.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ groups: await client.listGroups(limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "delete_group",
    {
      title: "Delete group",
      description: "Delete a local auth group and its group grants. Requires an admin API key.",
      inputSchema: z.object({
        groupId: z.string().min(1)
      })
    },
    async ({ groupId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.deleteGroup(groupId), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "add_group_member",
    {
      title: "Add group member",
      description: "Add a local user to a local auth group. Requires an admin API key.",
      inputSchema: z.object({
        groupId: z.string().min(1),
        userId: z.string().min(1)
      })
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.addGroupMember(input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "remove_group_member",
    {
      title: "Remove group member",
      description: "Remove a local user from a local auth group. Requires an admin API key.",
      inputSchema: z.object({
        groupId: z.string().min(1),
        userId: z.string().min(1)
      })
    },
    async ({ groupId, userId }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.removeGroupMember(groupId, userId), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "list_group_members",
    {
      title: "List group members",
      description: "List local users assigned to a local auth group.",
      inputSchema: z.object({
        groupId: z.string().min(1),
        limit: z.number().int().positive().max(200).default(50)
      })
    },
    async ({ groupId, limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ members: await client.listGroupMembers(groupId, limit) }, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "upsert_model_provider_config",
    {
      title: "Upsert model provider config",
      description: "Create or update a model provider configuration stub without storing provider secrets.",
      inputSchema: z.object({
        provider: z.enum(["openai", "anthropic", "openrouter"]),
        enabled: z.boolean().default(false),
        displayName: z.string().min(1).optional(),
        baseUrl: z.string().url().optional(),
        apiKeyEnvVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
        defaultModel: z.string().min(1).optional(),
        availableModels: z.array(z.string().min(1)).default([]),
        priority: z.number().int().min(1).max(1000).default(100),
        metadata: z.record(z.string(), z.unknown()).default({})
      })
    },
    async ({ provider, ...input }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.upsertModelProviderConfig(provider, input), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "publish_asset",
    {
      title: "Publish asset",
      description: "Publish a governed asset by setting it active and approved through the Agentic CMS API.",
      inputSchema: z.object({
        stableId: z.string().min(1),
        reviewDueAt: z.string().min(1).optional(),
        changeNote: z.string().min(1).optional()
      })
    },
    async ({ stableId, reviewDueAt, changeNote }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.publishAsset(stableId, { reviewDueAt, changeNote }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "review_asset",
    {
      title: "Review asset",
      description: "Mark a governed asset reviewed by updating status, next review date, and optional source reference. Requires a write-capable API key.",
      inputSchema: z.object({
        stableId: z.string().min(1),
        status: z.string().min(1).default("approved"),
        reviewDueAt: z.string().min(1),
        sourceRef: z.string().min(1).optional(),
        changeNote: z.string().min(1).optional()
      })
    },
    async ({ stableId, status, reviewDueAt, sourceRef, changeNote }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.reviewAsset(stableId, { status, reviewDueAt, sourceRef, changeNote }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "validate_assets",
    {
      title: "Validate assets",
      description: "Validate governed asset payloads for schema, stale reviews, references, surfaces, and public export leakage.",
      inputSchema: z.object({
        assets: z.array(z.unknown()).min(1),
        asOf: z.string().min(1).optional(),
        publicExportPackages: z.array(z.string().min(1)).default(["demo-agent-pack", "public-demo"])
      })
    },
    async ({ assets, asOf, publicExportPackages }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.validateAssets({ assets, asOf, publicExportPackages }), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "generate_ai_export",
    {
      title: "Generate AI export",
      description: "Generate a permission-filtered AI export package for agent connectors.",
      inputSchema: z.object({
        packageName: z.string().min(1).default("demo-agent-pack")
      })
    },
    async ({ packageName }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.exportAiPackage(packageName), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "validate_context_access",
    {
      title: "Validate context access",
      description: "Placeholder access check for future permission-aware retrieval.",
      inputSchema: z.object({
        stableId: z.string().min(1),
        surface: z.enum(["api", "cli", "mcp", "web", "export"])
      })
    },
    async ({ stableId, surface }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              stableId,
              surface,
              allowed: false,
              reason: "Permission checks are enforced by API asset fetch and retrieval routes."
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerTool(
    "upsert_auth_provider_config",
    {
      title: "Upsert auth provider config",
      description: "Create or update an external auth provider configuration stub without storing client secrets.",
      inputSchema: z.object({
        provider: z.enum(["oidc", "microsoft-entra"]),
        enabled: z.boolean().default(false),
        displayName: z.string().min(1).optional(),
        issuerUrl: z.string().url(),
        clientId: z.string().min(1),
        clientSecretEnvVar: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
        redirectUri: z.string().url().optional(),
        scopes: z.array(z.string().min(1)).default(["openid", "profile", "email"]),
        emailClaim: z.string().min(1).default("email"),
        displayNameClaim: z.string().min(1).default("name"),
        groupClaim: z.string().min(1).optional(),
	        roleClaim: z.string().min(1).optional(),
	        defaultRole: z.enum(["admin", "maintainer", "reader"]).default("reader"),
	        autoProvisionUsers: z.boolean().default(false),
	        accountLinkingMode: z.enum(["disabled", "verified-email", "email"]).default("verified-email"),
	        groupSyncEnabled: z.boolean().default(false),
	        allowedDomains: z.array(z.string().min(1)).default([]),
        pkceRequired: z.boolean().default(true),
        priority: z.number().int().min(1).max(1000).default(100),
        metadata: z.record(z.string(), z.unknown()).default({})
      })
    },
    async ({ provider, ...input }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await client.upsertAuthProviderConfig(provider, input), null, 2)
        }
      ]
    })
  );

  return server;
}
