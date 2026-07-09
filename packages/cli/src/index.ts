#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
	import {
	  agentActionExecutionPolicyInputSchema,
	  agentActionTypeSchema,
  aiExportFormatSchema,
	  assetCreateInputSchema,
  assetPublishInputSchema,
  assetReviewInputSchema,
  assetUpdateInputSchema,
	  assetTypeSchema,
	  externalAuthProviderSchema,
	  managedQueryEvalInputSchema,
  managedQueryEvalScheduleInputSchema,
	  managedQueryFeedbackOutcomeSchema,
  managedQueryModeSchema,
  managedQueryRetentionCaptureModeSchema,
  modelProviderSchema,
  okfVersionSchema,
  piiRedactionRuleKindSchema,
	  type AssetCreateInput,
	  type AgentActionType,
  type OkfExportPackage,
  type AssetPublishInput,
  type AssetReviewInput,
  type AssetUpdateInput,
  type AuthProviderConfigInput,
  type ExternalAuthProvider,
  type ManagedQueryFeedbackInput,
  type ManagedQueryMode,
  type ManagedQueryRetentionCaptureMode,
  type ModelProvider,
  type ModelProviderConfigInput,
  type PiiRedactionRuleKind,
  type Surface
} from "@forgetbase/schema";
import { ForgetBaseClient } from "@forgetbase/sdk";
import { validateAssetCollection } from "@forgetbase/validation";

const DEFAULT_API_URL = "http://127.0.0.1:3000";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [command, ...args] = normalizedArgv;

  switch (command) {
    case "health": {
      const apiUrl = readOption(args, "--api-url") ?? process.env.FORGETBASE_API_URL ?? DEFAULT_API_URL;
      const client = new ForgetBaseClient({ baseUrl: apiUrl });
      const health = await client.health();
      console.log(JSON.stringify(health, null, 2));
      return 0;
    }

    case "capabilities": {
      console.log(JSON.stringify({ assetTypes: assetTypeSchema.options }, null, 2));
      return 0;
    }

    case "auth":
      return handleAuth(args);

    case "assets":
      return handleAssets(args);

    case "search":
      return handleSearch(args);

    case "agent":
      return handleAgent(args);

    case "telemetry":
      return handleTelemetry(args);

    case "audit":
      return handleAudit(args);

    case "admin":
      return handleAdmin(args);

    case "exports":
      return handleExports(args);

    case "validate":
      return handleValidate(args);

    case "corpus":
      return handleCorpus(args);

    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return 0;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      return 1;
  }
}

async function handleAudit(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "events": {
      const limitOption = readOption(rest, "--limit");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify({
        events: await client.listAuditEvents(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    default:
      throw new Error(`Unknown audit command: ${subcommand ?? "(missing)"}`);
  }
}

async function handleTelemetry(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "summary": {
      const limitOption = readOption(rest, "--limit");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.telemetrySummary({
        since: readOption(rest, "--since"),
        until: readOption(rest, "--until"),
        limit: limitOption ? Number.parseInt(limitOption, 10) : undefined
      }), null, 2));
      return 0;
    }

    case "retention": {
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.getTelemetryRetentionPolicy(), null, 2));
      return 0;
    }

    case "retention-set": {
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.updateTelemetryRetentionPolicy({
        retrievalEventRetentionDays: readRetentionDaysOption(rest, "--retrieval-event-days"),
        auditEventRetentionDays: readRetentionDaysOption(rest, "--audit-event-days"),
        feedbackRetentionDays: readRetentionDaysOption(rest, "--feedback-days")
      }), null, 2));
      return 0;
    }

    case "purge": {
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.purgeTelemetryRetention({
        dryRun: !hasFlag(rest, "--execute")
      }), null, 2));
      return 0;
    }

    default:
      throw new Error(`Unknown telemetry command: ${subcommand ?? "(missing)"}`);
  }
}

async function handleAdmin(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  const client = createClient(rest, "cli");

  switch (subcommand) {
    case "model-providers": {
      console.log(JSON.stringify({
        providers: await client.listModelProviderConfigs()
      }, null, 2));
      return 0;
    }

    case "model-provider-health": {
      console.log(JSON.stringify({
        providers: await client.listModelProviderHealth()
      }, null, 2));
      return 0;
    }

    case "managed-query-cache": {
      const limit = readOption(rest, "--limit");
      console.log(JSON.stringify({
        entries: await client.listManagedQueryCacheEntries(limit ? Number.parseInt(limit, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "managed-query-policy": {
      console.log(JSON.stringify(await client.getManagedQueryPolicy(), null, 2));
      return 0;
    }

	    case "managed-query-policy-set": {
	      console.log(JSON.stringify(await client.updateManagedQueryPolicy({
	        defaultMode: readManagedQueryModeOption(rest, "--default-mode"),
	        allowedModes: readManagedQueryModeListOption(rest, "--allowed-modes"),
	        minimumCitationCount: readNumberOption(rest, "--minimum-citation-count"),
	        requireGrounded: readBooleanOption(rest, "--require-grounded")
	      }), null, 2));
	      return 0;
	    }

    case "retrieval-ranking-policy": {
      console.log(JSON.stringify(await client.getRetrievalRankingPolicy(), null, 2));
      return 0;
    }

    case "retrieval-ranking-policy-set": {
      console.log(JSON.stringify(await client.updateRetrievalRankingPolicy({
        agentInstructionWeight: readNumberOption(rest, "--agent-instruction-weight"),
        assetSummaryWeight: readNumberOption(rest, "--asset-summary-weight"),
        humanDocumentWeight: readNumberOption(rest, "--human-document-weight"),
        exactPhraseBoost: readNumberOption(rest, "--exact-phrase-boost")
      }), null, 2));
      return 0;
    }

    case "managed-query-eval-schedule-policy": {
      console.log(JSON.stringify(await client.getManagedQueryEvalSchedulePolicy(), null, 2));
      return 0;
    }

    case "managed-query-eval-schedule-policy-set": {
      const file = readOption(rest, "--file");
      const evalInput = file
        ? managedQueryEvalScheduleInputSchema.parse(await readJsonFile(file))
        : hasFlag(rest, "--clear-eval-input")
          ? null
          : undefined;

      console.log(JSON.stringify(await client.updateManagedQueryEvalSchedulePolicy({
        enabled: readBooleanOption(rest, "--enabled"),
        intervalMinutes: readNumberOption(rest, "--interval-minutes"),
        evalInput
      }), null, 2));
      return 0;
    }

	    case "action-execution-policy": {
      console.log(JSON.stringify(await client.getActionExecutionPolicy(), null, 2));
      return 0;
    }

    case "action-execution-policy-set": {
      console.log(JSON.stringify(await client.updateActionExecutionPolicy(
        agentActionExecutionPolicyInputSchema.parse({
          enabled: readBooleanOption(rest, "--enabled"),
          allowedActionTypes: readAgentActionTypeListOption(rest, "--allowed-action-types"),
          requireApproval: readBooleanOption(rest, "--require-approval"),
          dryRunDefault: readBooleanOption(rest, "--dry-run-default"),
          killSwitch: readBooleanOption(rest, "--kill-switch"),
          maxRequestsPerHour: readNumberOption(rest, "--max-requests-per-hour"),
          approvalExpiresInMinutes: readNumberOption(rest, "--approval-expires-in-minutes")
        })
      ), null, 2));
      return 0;
    }

    case "managed-query-cache-policy": {
      console.log(JSON.stringify(await client.getManagedQueryCachePolicy(), null, 2));
      return 0;
    }

    case "managed-query-cache-policy-set": {
      console.log(JSON.stringify(await client.updateManagedQueryCachePolicy({
        cacheEnabled: readBooleanOption(rest, "--cache-enabled"),
        maxCacheTtlSeconds: readNullablePositiveIntegerOption(rest, "--max-cache-ttl-seconds")
      }), null, 2));
      return 0;
    }

    case "managed-query-cache-delete": {
      console.log(JSON.stringify(await client.deleteManagedQueryCacheEntry(requireOption(rest, "--cache-key")), null, 2));
      return 0;
    }

    case "managed-query-cache-purge": {
      console.log(JSON.stringify(await client.purgeManagedQueryCache({
        expiredBefore: readOption(rest, "--expired-before"),
        dryRun: !hasFlag(rest, "--execute")
      }), null, 2));
      return 0;
    }

    case "managed-query-retention-policy": {
      console.log(JSON.stringify(await client.getManagedQueryRetentionPolicy(), null, 2));
      return 0;
    }

    case "managed-query-retention-policy-set": {
      console.log(JSON.stringify(await client.updateManagedQueryRetentionPolicy({
        promptCaptureMode: readManagedQueryRetentionCaptureModeOption(rest, "--prompt-capture-mode"),
        responseCaptureMode: readManagedQueryRetentionCaptureModeOption(rest, "--response-capture-mode"),
        metadataRetentionDays: readRetentionDaysOption(rest, "--metadata-retention-days")
      }), null, 2));
      return 0;
    }

    case "secret-reference-policy": {
      console.log(JSON.stringify(await client.getSecretReferencePolicy(), null, 2));
      return 0;
    }

    case "secret-reference-policy-set": {
      console.log(JSON.stringify(await client.updateSecretReferencePolicy({
        allowedEnvVarPrefixes: readCsvOption(rest, "--allowed-prefixes"),
        allowedEnvVars: readCsvOption(rest, "--allowed-env-vars"),
        allowUnlistedEnvVars: readBooleanOption(rest, "--allow-unlisted")
      }), null, 2));
      return 0;
    }

    case "pii-redaction-policy": {
      console.log(JSON.stringify(await client.getPiiRedactionPolicy(), null, 2));
      return 0;
    }

    case "pii-redaction-policy-set": {
      console.log(JSON.stringify(await client.updatePiiRedactionPolicy({
        redactionEnabled: readBooleanOption(rest, "--redaction-enabled"),
        enabledRuleKinds: readPiiRedactionRuleKindsOption(rest, "--enabled-rule-kinds")
      }), null, 2));
      return 0;
    }

    case "service-account-policy": {
      console.log(JSON.stringify(await client.getServiceAccountPolicy(), null, 2));
      return 0;
    }

    case "service-account-policy-set": {
      console.log(JSON.stringify(await client.updateServiceAccountPolicy({
        maxServiceAccounts: readNullablePositiveIntegerOption(rest, "--max-service-accounts"),
        maxActiveApiKeysPerServiceAccount: readNullablePositiveIntegerOption(rest, "--max-active-api-keys"),
        defaultApiKeyExpiresInDays: readNullablePositiveIntegerOption(rest, "--default-key-expires-in-days")
      }), null, 2));
      return 0;
    }

    case "model-provider-set": {
      const provider = modelProviderSchema.parse(requireOption(rest, "--provider")) satisfies ModelProvider;
      const availableModels = (readOption(rest, "--models") ?? "")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean);
      const priority = readOption(rest, "--priority");
      const cacheEnabled = readBooleanOption(rest, "--cache-enabled");
      const metadata = {
        ...compactMetadata({
        maxOutputTokens: readNumberOption(rest, "--max-output-tokens"),
        temperature: readNumberOption(rest, "--temperature"),
        timeoutMs: readNumberOption(rest, "--timeout-ms"),
        maxRetries: readNumberOption(rest, "--max-retries"),
        retryBackoffMs: readNumberOption(rest, "--retry-backoff-ms"),
        inputCostPerMillionTokens: readNumberOption(rest, "--input-cost-per-million-tokens"),
        outputCostPerMillionTokens: readNumberOption(rest, "--output-cost-per-million-tokens"),
        maxEstimatedInputTokensPerQuery: readNumberOption(rest, "--max-estimated-input-tokens-per-query"),
        maxEstimatedTotalTokensPerQuery: readNumberOption(rest, "--max-estimated-total-tokens-per-query"),
        maxEstimatedCostUsdPerQuery: readNumberOption(rest, "--max-estimated-cost-usd-per-query"),
        cacheTtlSeconds: readNumberOption(rest, "--cache-ttl-seconds")
        }),
        ...(cacheEnabled === undefined ? {} : { cacheEnabled })
      };
      const input = {
        enabled: readBooleanOption(rest, "--enabled") ?? false,
        displayName: readOption(rest, "--display-name"),
        baseUrl: readOption(rest, "--base-url"),
        apiKeyEnvVar: readOption(rest, "--api-key-env-var"),
        defaultModel: readOption(rest, "--default-model"),
        availableModels,
        priority: priority ? Number.parseInt(priority, 10) : undefined,
        metadata
      } satisfies Omit<ModelProviderConfigInput, "provider">;

      console.log(JSON.stringify(await client.upsertModelProviderConfig(provider, input), null, 2));
      return 0;
    }

    case "auth-providers": {
      console.log(JSON.stringify({
        authProviders: await client.listAuthProviderConfigs()
      }, null, 2));
      return 0;
    }

    case "auth-provider-set": {
      const provider = externalAuthProviderSchema.parse(requireOption(rest, "--provider")) satisfies ExternalAuthProvider;
      const scopes = (readOption(rest, "--scopes") ?? "")
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean);
      const allowedDomains = (readOption(rest, "--allowed-domains") ?? "")
        .split(",")
        .map((domain) => domain.trim())
        .filter(Boolean);
      const priority = readOption(rest, "--priority");
      const input = {
        enabled: readBooleanOption(rest, "--enabled") ?? false,
        displayName: readOption(rest, "--display-name"),
        issuerUrl: requireOption(rest, "--issuer-url"),
        clientId: requireOption(rest, "--client-id"),
        clientSecretEnvVar: readOption(rest, "--client-secret-env-var"),
        redirectUri: readOption(rest, "--redirect-uri"),
        scopes: scopes.length ? scopes : undefined,
        emailClaim: readOption(rest, "--email-claim"),
        displayNameClaim: readOption(rest, "--display-name-claim"),
        groupClaim: readOption(rest, "--group-claim"),
	        roleClaim: readOption(rest, "--role-claim"),
	        defaultRole: readOption(rest, "--default-role") as AuthProviderConfigInput["defaultRole"] | undefined,
	        autoProvisionUsers: readBooleanOption(rest, "--auto-provision-users") ?? false,
	        accountLinkingMode: readOption(rest, "--account-linking-mode") as AuthProviderConfigInput["accountLinkingMode"] | undefined,
	        groupSyncEnabled: readBooleanOption(rest, "--group-sync-enabled") ?? false,
	        allowedDomains,
        pkceRequired: readBooleanOption(rest, "--pkce-required") ?? true,
        priority: priority ? Number.parseInt(priority, 10) : undefined
      } satisfies Omit<AuthProviderConfigInput, "provider">;

      console.log(JSON.stringify(await client.upsertAuthProviderConfig(provider, input), null, 2));
      return 0;
    }

    default:
      throw new Error(`Unknown admin command: ${subcommand ?? "(missing)"}`);
  }
}

async function handleExports(args: string[]): Promise<number> {
  const [subcommand] = args;

  if (subcommand !== "ai-package") {
    throw new Error(`Unknown exports command: ${subcommand ?? "(missing)"}`);
  }

  const client = createClient(args, "cli");
  const packageName = readOption(args, "--package") ?? "demo-agent-pack";
  const format = aiExportFormatSchema.parse(readOption(args, "--format") ?? "json");
  const okfVersion = okfVersionSchema.parse(readOption(args, "--okf-version") ?? "0.1");
  const output = readOption(args, "--output");
  const outputDir = readOption(args, "--output-dir");
  const result = format === "okf"
    ? await client.exportAiPackage(packageName, { format: "okf", okfVersion })
    : await client.exportAiPackage(packageName, { format: "json" });
  const json = JSON.stringify(result, null, 2);

  if (output) {
    await writeFile(resolveInputPath(output), `${json}\n`, "utf8");
    console.log(JSON.stringify({ output, assetCount: result.assetCount, deniedCount: result.deniedCount }, null, 2));
  } else if (outputDir) {
    if (format !== "okf") {
      throw new Error("--output-dir requires --format okf");
    }

    const okfResult = result as OkfExportPackage;
    await writeOkfBundle(outputDir, okfResult);
    console.log(JSON.stringify({
      outputDir,
      fileCount: okfResult.files.length,
      assetCount: okfResult.assetCount,
      deniedCount: okfResult.deniedCount,
      okfVersion: okfResult.okfVersion,
      projectionHash: okfResult.projectionHash
    }, null, 2));
  } else {
    console.log(json);
  }

  return 0;
}

async function writeOkfBundle(outputDir: string, bundle: OkfExportPackage): Promise<void> {
  const root = resolveInputPath(outputDir);

  for (const file of bundle.files) {
    const outputPath = resolve(root, file.path);

    if (outputPath !== root && !outputPath.startsWith(`${root}${sep}`)) {
      throw new Error(`Refusing to write OKF file outside output directory: ${file.path}`);
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, file.content, "utf8");
  }
}

async function handleValidate(args: string[]): Promise<number> {
  const file = readOption(args, "--file") ?? args.find((arg) => !arg.startsWith("--")) ?? "corpus/demo/assets.json";
  const input = await readJsonFile(file);
  const asOf = readOption(args, "--as-of");
  const publicExportPackages = (readOption(args, "--public-export-packages") ?? "demo-agent-pack,public-demo")
    .split(",")
    .map((packageName) => packageName.trim())
    .filter(Boolean);
  const report = validateAssetCollection(input, {
    asOf,
    publicExportPackages
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.errorCount > 0 || (args.includes("--fail-on-warnings") && report.warningCount > 0)) {
    return 1;
  }

  return 0;
}

async function handleSearch(args: string[]): Promise<number> {
  const query = readOption(args, "--query") ?? readOption(args, "-q") ?? args.find((arg) => !arg.startsWith("--"));

  if (!query) {
    throw new Error("Search query is required: forgetbase search --query \"PII redaction\"");
  }

  const limitOption = readOption(args, "--limit");
  const strategy = readOption(args, "--strategy");
  const client = createClient(args, "cli");
  console.log(JSON.stringify(await client.search({
    query,
    limit: limitOption ? Number.parseInt(limitOption, 10) : undefined,
    strategy: strategy as "lexical" | "vector" | "hybrid" | undefined
  }), null, 2));
  return 0;
}

async function handleAgent(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "query": {
      const query = readOption(rest, "--query") ?? readOption(rest, "-q") ?? rest.find((arg) => !arg.startsWith("--"));

      if (!query) {
        throw new Error("Managed query is required: forgetbase agent query --query \"PII redaction\"");
      }

      const limitOption = readOption(rest, "--limit");
      const modeOption = readOption(rest, "--mode");
      const providerOption = readOption(rest, "--provider");
      const modelOption = readOption(rest, "--model");
      const cacheOption = readBooleanOption(rest, "--cache");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.managedQuery({
        query,
        limit: limitOption ? Number.parseInt(limitOption, 10) : undefined,
        mode: modeOption ? managedQueryModeSchema.parse(modeOption) : undefined,
        provider: providerOption ? modelProviderSchema.parse(providerOption) : undefined,
        model: modelOption,
        cache: cacheOption
      }), null, 2));
      return 0;
    }

    case "feedback": {
      const outcome = managedQueryFeedbackOutcomeSchema.parse(requireOption(rest, "--outcome"));
      const input = {
        telemetryEventId: requireOption(rest, "--telemetry-event-id"),
        query: requireOption(rest, "--query"),
        outcome,
        factualCitationAccuracy: readScoreOption(rest, "--factual-citation-accuracy"),
        policyCompliance: readScoreOption(rest, "--policy-compliance"),
        taskCompletionQuality: readScoreOption(rest, "--task-completion-quality"),
        consistency: readScoreOption(rest, "--consistency"),
        responseEffectiveness: readScoreOption(rest, "--response-effectiveness"),
        notes: readOption(rest, "--notes")
      } satisfies ManagedQueryFeedbackInput;
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.submitManagedQueryFeedback(input), null, 2));
      return 0;
    }

    case "feedback-list": {
      const limitOption = readOption(rest, "--limit");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify({
        feedback: await client.listManagedQueryFeedback(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "eval": {
      const file = requireOption(rest, "--file");
      const input = managedQueryEvalInputSchema.parse(await readJsonFile(file));
      const limitOption = readOption(rest, "--limit");
      const minimumPassRate = readPassRateOption(rest, "--minimum-pass-rate");
      const tagMinimumPassRates = readTagPassRatesOption(rest, "--tag-minimum-pass-rates");
      const failOnThreshold = readBooleanOption(rest, "--fail-on-threshold") ?? false;
      const client = createClient(rest, "cli");
      const report = await client.runManagedQueryEval({
        ...input,
        limit: limitOption ? Number.parseInt(limitOption, 10) : input.limit,
        minimumPassRate: minimumPassRate ?? input.minimumPassRate,
        tagMinimumPassRates: tagMinimumPassRates ?? input.tagMinimumPassRates
      });
      console.log(JSON.stringify(report, null, 2));
      return failOnThreshold && !report.ok ? 1 : 0;
    }

    case "eval-runs": {
      const limitOption = readOption(rest, "--limit");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify({
        runs: await client.listManagedQueryEvalRuns(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "eval-summary": {
      const limitOption = readOption(rest, "--limit");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.managedQueryEvalSummary({
        since: readOption(rest, "--since"),
        until: readOption(rest, "--until"),
        limit: limitOption ? Number.parseInt(limitOption, 10) : undefined
      }), null, 2));
      return 0;
    }

    case "action-execute": {
      const payloadFile = readOption(rest, "--payload-file");
      const metadataFile = readOption(rest, "--metadata-file");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.executeAgentAction({
        actionType: agentActionTypeSchema.parse(requireOption(rest, "--action-type")),
        title: requireOption(rest, "--title"),
        description: readOption(rest, "--description"),
        target: readOption(rest, "--target"),
        idempotencyKey: readOption(rest, "--idempotency-key"),
        dryRun: readBooleanOption(rest, "--dry-run"),
        payload: payloadFile ? (await readJsonFile(payloadFile) as Record<string, unknown>) : {},
        metadata: metadataFile ? (await readJsonFile(metadataFile) as Record<string, unknown>) : {}
      }), null, 2));
      return 0;
    }

    case "action-list": {
      const limitOption = readOption(rest, "--limit");
      const client = createClient(rest, "cli");
      console.log(JSON.stringify({
        actions: await client.listAgentActions(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "action-decision": {
      const client = createClient(rest, "cli");
      console.log(JSON.stringify(await client.decideAgentAction({
        actionRequestId: requireOption(rest, "--action-request-id"),
        decision: readActionDecisionOption(rest, "--decision"),
        reason: readOption(rest, "--reason")
      }), null, 2));
      return 0;
    }

    default:
      throw new Error(`Unknown agent subcommand: ${subcommand ?? "(missing)"}`);
  }
}

async function handleAssets(args: string[]): Promise<number> {
  const [subcommand, stableId] = args;
  const client = createClient(args, "cli");

  switch (subcommand) {
    case "list": {
      console.log(JSON.stringify({ assets: await client.listAssets() }, null, 2));
      return 0;
    }

    case "review-queue": {
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify(await client.listAssetsNeedingReview({
        asOf: readOption(args, "--as-of"),
        includeApproved: readBooleanOption(args, "--include-approved") ?? false,
        limit: limitOption ? Number.parseInt(limitOption, 10) : undefined
      }), null, 2));
      return 0;
    }

    case "get": {
      if (!stableId || stableId.startsWith("--")) {
        throw new Error("Stable ID is required: forgetbase assets get <stable-id>");
      }

      const asset = await client.getAsset(stableId);

      if (!asset) {
        console.error(`Asset not found: ${stableId}`);
        return 1;
      }

      console.log(JSON.stringify(asset, null, 2));
      return 0;
    }

    case "create": {
      const file = requireOption(args, "--file");
      const asset = await readAssetFile(file);
      console.log(JSON.stringify(await client.createAsset(asset), null, 2));
      return 0;
    }

    case "update": {
      if (!stableId || stableId.startsWith("--")) {
        throw new Error("Stable ID is required: forgetbase assets update <stable-id> --file update.json");
      }

      const file = requireOption(args, "--file");
      const update = await readAssetUpdateFile(file);
      console.log(JSON.stringify(await client.updateAsset(stableId, update), null, 2));
      return 0;
    }

    case "restore": {
      if (!stableId || stableId.startsWith("--")) {
        throw new Error("Stable ID is required: forgetbase assets restore <stable-id> --version-number 1");
      }

      const versionNumberOption = readOption(args, "--version-number");
      const versionId = readOption(args, "--version-id");
      console.log(JSON.stringify(await client.restoreAssetVersion(stableId, {
        versionId,
        versionNumber: versionNumberOption ? Number.parseInt(versionNumberOption, 10) : undefined,
        changeNote: readOption(args, "--change-note")
      }), null, 2));
      return 0;
    }

    case "version": {
      if (!stableId || stableId.startsWith("--")) {
        throw new Error("Stable ID is required: forgetbase assets version <stable-id> --version-number 1");
      }

      const versionNumberOption = readOption(args, "--version-number");
      const versionId = readOption(args, "--version-id");
      console.log(JSON.stringify(await client.getAssetVersionSnapshot(stableId, {
        versionId,
        versionNumber: versionNumberOption ? Number.parseInt(versionNumberOption, 10) : undefined
      }), null, 2));
      return 0;
    }

    case "publish": {
      if (!stableId || stableId.startsWith("--")) {
        throw new Error("Stable ID is required: forgetbase assets publish <stable-id>");
      }

      const publish = assetPublishInputSchema.parse({
        reviewDueAt: readOption(args, "--review-due-at"),
        changeNote: readOption(args, "--change-note")
      }) satisfies AssetPublishInput;
      console.log(JSON.stringify(await client.publishAsset(stableId, publish), null, 2));
      return 0;
    }

    case "review": {
      if (!stableId || stableId.startsWith("--")) {
        throw new Error("Stable ID is required: forgetbase assets review <stable-id> --review-due-at 2027-01-31");
      }

      const review = assetReviewInputSchema.parse({
        status: readOption(args, "--status"),
        reviewDueAt: requireOption(args, "--review-due-at"),
        sourceRef: readOption(args, "--source-ref"),
        changeNote: readOption(args, "--change-note")
      }) satisfies AssetReviewInput;
      console.log(JSON.stringify(await client.reviewAsset(stableId, review), null, 2));
      return 0;
    }

    default:
      throw new Error(`Unknown assets command: ${subcommand ?? "(missing)"}`);
  }
}

async function handleCorpus(args: string[]): Promise<number> {
  const [subcommand] = args;

  if (subcommand !== "import") {
    throw new Error(`Unknown corpus command: ${subcommand ?? "(missing)"}`);
  }

  const file = readOption(args, "--file") ?? "corpus/demo/assets.json";
  const client = createClient(args, "cli");
  const assets = await readAssetCollectionFile(file);
  let created = 0;
  let skipped = 0;

  for (const asset of assets) {
    const existing = await client.getAsset(asset.stableId);

    if (existing) {
      skipped += 1;
      continue;
    }

    await client.createAsset(asset);
    created += 1;
  }

  console.log(JSON.stringify({ total: assets.length, created, skipped }, null, 2));
  return 0;
}

async function handleAuth(args: string[]): Promise<number> {
  const [subcommand] = args;
  const client = createClient(args, "cli");

  switch (subcommand) {
    case "bootstrap": {
      const result = await client.bootstrapAuth({
        tenantId: readOption(args, "--tenant-id") ?? "tenant_demo",
        email: requireOption(args, "--email"),
        displayName: requireOption(args, "--display-name"),
        keyName: readOption(args, "--key-name") ?? "bootstrap-admin",
        password: readOption(args, "--password") ?? process.env.FORGETBASE_PASSWORD
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "login": {
      const expiresInSeconds = readOption(args, "--expires-in-seconds");
      const result = await client.login({
        tenantId: readOption(args, "--tenant-id") ?? "tenant_demo",
        email: requireOption(args, "--email"),
        password: readOption(args, "--password") ?? process.env.FORGETBASE_PASSWORD ?? "",
        keyName: readOption(args, "--key-name") ?? "local-login",
        deviceLabel: readOption(args, "--device-label") ?? "CLI login",
        expiresInSeconds: expiresInSeconds ? Number.parseInt(expiresInSeconds, 10) : undefined
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "oidc-start": {
      const result = await client.startOidcLogin({
        tenantId: readOption(args, "--tenant-id") ?? "tenant_demo",
        provider: externalAuthProviderSchema.parse(readOption(args, "--provider") ?? "oidc"),
        redirectUri: readOption(args, "--redirect-uri")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "oidc-callback": {
      const expiresInSeconds = readOption(args, "--expires-in-seconds");
      const result = await client.completeOidcLogin({
        tenantId: readOption(args, "--tenant-id") ?? "tenant_demo",
        provider: externalAuthProviderSchema.parse(readOption(args, "--provider") ?? "oidc"),
        code: requireOption(args, "--code"),
        state: requireOption(args, "--state"),
        nonce: requireOption(args, "--nonce"),
        codeVerifier: requireOption(args, "--code-verifier"),
        redirectUri: readOption(args, "--redirect-uri"),
        keyName: readOption(args, "--key-name") ?? "oidc-login",
        deviceLabel: readOption(args, "--device-label") ?? "CLI OIDC login",
        expiresInSeconds: expiresInSeconds ? Number.parseInt(expiresInSeconds, 10) : undefined
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "me": {
      console.log(JSON.stringify(await client.me(), null, 2));
      return 0;
    }

    case "logout": {
      console.log(JSON.stringify(await client.logout(), null, 2));
      return 0;
    }

    case "sessions": {
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify({
        sessions: await client.listLoginSessions({
          userId: readOption(args, "--user-id"),
          includeRevoked: readBooleanOption(args, "--include-revoked"),
          limit: limitOption ? Number.parseInt(limitOption, 10) : undefined
        })
      }, null, 2));
      return 0;
    }

    case "session-revoke": {
      console.log(JSON.stringify(await client.revokeLoginSession(requireOption(args, "--session-id")), null, 2));
      return 0;
    }

    case "user-create": {
      const result = await client.createUser({
        email: requireOption(args, "--email"),
        displayName: requireOption(args, "--display-name"),
        role: readOption(args, "--role") as "admin" | "maintainer" | "reader" | undefined,
        password: readOption(args, "--password") ?? process.env.FORGETBASE_PASSWORD
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "user-list": {
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify({
        users: await client.listUsers(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "user-update": {
      const result = await client.updateUser({
        userId: requireOption(args, "--user-id"),
        displayName: readOption(args, "--display-name"),
        role: readOption(args, "--role") as "admin" | "maintainer" | "reader" | undefined,
        status: readOption(args, "--status") as "active" | "disabled" | undefined,
        password: readOption(args, "--password") ?? process.env.FORGETBASE_PASSWORD
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "service-account-create": {
      const result = await client.createServiceAccount({
        slug: requireOption(args, "--slug"),
        name: requireOption(args, "--name"),
        description: readOption(args, "--description"),
        role: readOption(args, "--role") as "admin" | "maintainer" | "reader" | undefined,
        status: readOption(args, "--status") as "active" | "disabled" | undefined
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "service-account-list": {
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify({
        serviceAccounts: await client.listServiceAccounts(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "service-account-update": {
      const result = await client.updateServiceAccount({
        serviceAccountId: requireOption(args, "--service-account-id"),
        name: readOption(args, "--name"),
        description: readOption(args, "--description"),
        role: readOption(args, "--role") as "admin" | "maintainer" | "reader" | undefined,
        status: readOption(args, "--status") as "active" | "disabled" | undefined
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "group-create": {
      const result = await client.createGroup({
        slug: requireOption(args, "--slug"),
        name: requireOption(args, "--name"),
        description: readOption(args, "--description")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "group-list": {
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify({
        groups: await client.listGroups(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "group-delete": {
      console.log(JSON.stringify(await client.deleteGroup(requireOption(args, "--group-id")), null, 2));
      return 0;
    }

    case "group-member-add": {
      const result = await client.addGroupMember({
        groupId: requireOption(args, "--group-id"),
        userId: requireOption(args, "--user-id")
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "group-members": {
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify({
        members: await client.listGroupMembers(
          requireOption(args, "--group-id"),
          limitOption ? Number.parseInt(limitOption, 10) : undefined
        )
      }, null, 2));
      return 0;
    }

    case "group-member-remove": {
      console.log(JSON.stringify(await client.removeGroupMember(
        requireOption(args, "--group-id"),
        requireOption(args, "--user-id")
      ), null, 2));
      return 0;
    }

    case "api-key-create": {
      const scopes = (readOption(args, "--scopes") ?? "asset:read").split(",").map((scope) => scope.trim());
      const allowedSurfaces = (readOption(args, "--allowed-surfaces") ?? "api,cli,mcp,web,export")
        .split(",")
        .map((surface) => surface.trim());
      const userId = readOption(args, "--user-id");
      const serviceAccountId = readOption(args, "--service-account-id");

      if (Boolean(userId) === Boolean(serviceAccountId)) {
        throw new Error("Provide exactly one API-key owner: --user-id or --service-account-id");
      }

      const result = await client.createApiKey({
        userId,
        serviceAccountId,
        name: requireOption(args, "--name"),
        scopes: scopes as Array<"admin" | "asset:read" | "asset:write" | "permission:write" | "agent:execute">,
        allowedSurfaces: allowedSurfaces as Array<"api" | "cli" | "mcp" | "web" | "export">
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    case "api-key-list": {
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify({
        apiKeys: await client.listApiKeys(limitOption ? Number.parseInt(limitOption, 10) : undefined)
      }, null, 2));
      return 0;
    }

    case "api-key-rotation-due": {
      const dueWithinDays = readOption(args, "--due-within-days");
      const limitOption = readOption(args, "--limit");
      console.log(JSON.stringify(await client.getApiKeyRotationReport({
        asOf: readOption(args, "--as-of"),
        dueWithinDays: dueWithinDays ? Number.parseInt(dueWithinDays, 10) : undefined,
        includeUserKeys: readBooleanOption(args, "--include-user-keys") ?? false,
        includeRevoked: readBooleanOption(args, "--include-revoked") ?? false,
        limit: limitOption ? Number.parseInt(limitOption, 10) : undefined
      }), null, 2));
      return 0;
    }

    case "api-key-rotate": {
      console.log(JSON.stringify(await client.rotateApiKey(requireOption(args, "--api-key-id"), {
        name: readOption(args, "--name"),
        revokeOld: hasFlag(args, "--revoke-old")
      }), null, 2));
      return 0;
    }

    case "api-key-revoke": {
      console.log(JSON.stringify(await client.revokeApiKey(requireOption(args, "--api-key-id")), null, 2));
      return 0;
    }

    case "grant": {
      const surfaces = (readOption(args, "--surfaces") ?? "api,cli,mcp,web").split(",").map((surface) => surface.trim());
      const result = await client.grantAssetPermission({
        stableId: requireOption(args, "--stable-id"),
        principalType: (readOption(args, "--principal-type") ?? "user") as "user" | "group" | "service-account",
        principalId: requireOption(args, "--principal-id"),
        action: (readOption(args, "--action") ?? "read") as "read" | "write" | "admin" | "export" | "execute",
        surfaces: surfaces as Surface[]
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    default:
      throw new Error(`Unknown auth command: ${subcommand ?? "(missing)"}`);
  }
}

async function readAssetFile(path: string): Promise<AssetCreateInput> {
  return assetCreateInputSchema.parse(await readJsonFile(path));
}

async function readAssetUpdateFile(path: string): Promise<AssetUpdateInput> {
  return assetUpdateInputSchema.parse(await readJsonFile(path));
}

async function readAssetCollectionFile(path: string): Promise<AssetCreateInput[]> {
  const input = await readJsonFile(path);
  const records = Array.isArray(input)
    ? input
    : typeof input === "object" && input && "assets" in input && Array.isArray(input.assets)
      ? input.assets
      : [input];

  return records.map((record) => assetCreateInputSchema.parse(record));
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolveInputPath(path), "utf8")) as unknown;
}

function resolveInputPath(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

function createClient(args: string[], defaultSurface: Surface): ForgetBaseClient {
  return new ForgetBaseClient({
    baseUrl: readOption(args, "--api-url") ?? process.env.FORGETBASE_API_URL ?? DEFAULT_API_URL,
    apiKey: readOption(args, "--api-key") ?? process.env.FORGETBASE_API_KEY,
    surface: (readOption(args, "--surface") as Surface | undefined) ?? defaultSurface
  });
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function readScoreOption(args: string[], name: string): number | undefined {
  const value = readOption(args, name);
  return value ? Number.parseInt(value, 10) : undefined;
}

function readNumberOption(args: string[], name: string): number | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactMetadata(values: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, number] => entry[1] !== undefined)
  );
}

function readPassRateOption(args: string[], name: string): number | undefined {
  const value = readOption(args, name);

  return value === undefined ? undefined : parsePassRate(value, name);
}

function readTagPassRatesOption(args: string[], name: string): Record<string, number> | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const thresholds: Record<string, number> = {};

  for (const entry of entries) {
    const [tag, rawRate, ...rest] = entry.split("=");

    if (!tag || rawRate === undefined || rest.length) {
      throw new Error(`Invalid tag pass-rate entry for ${name}: ${entry}`);
    }

    thresholds[tag.trim()] = parsePassRate(rawRate.trim(), name);
  }

  return thresholds;
}

function parsePassRate(value: string, name: string): number {
  const trimmed = value.trim();
  const parsed = trimmed.endsWith("%")
    ? Number.parseFloat(trimmed.slice(0, -1)) / 100
    : Number.parseFloat(trimmed);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid pass-rate value for ${name}: ${value}`);
  }

  return parsed;
}

function readBooleanOption(args: string[], name: string): boolean | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  if (["true", "1", "yes"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`Invalid boolean value for ${name}: ${value}`);
}

function readCsvOption(args: string[], name: string): string[] | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function readRetentionDaysOption(args: string[], name: string): number | null | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  if (["forever", "none", "null"].includes(value.toLowerCase())) {
    return null;
  }

  return Number.parseInt(value, 10);
}

function readManagedQueryRetentionCaptureModeOption(
  args: string[],
  name: string
): ManagedQueryRetentionCaptureMode | undefined {
  const value = readOption(args, name);
  return value === undefined ? undefined : managedQueryRetentionCaptureModeSchema.parse(value);
}

function readManagedQueryModeOption(args: string[], name: string): ManagedQueryMode | undefined {
  const value = readOption(args, name);
  return value === undefined ? undefined : managedQueryModeSchema.parse(value);
}

function readManagedQueryModeListOption(args: string[], name: string): ManagedQueryMode[] | undefined {
  const values = readCsvOption(args, name);

  if (values === undefined) {
    return undefined;
  }

  return values.map((value) => managedQueryModeSchema.parse(value));
}

function readAgentActionTypeListOption(args: string[], name: string): AgentActionType[] | undefined {
  const values = readCsvOption(args, name);

  if (values === undefined) {
    return undefined;
  }

  return values.map((value) => agentActionTypeSchema.parse(value));
}

function readActionDecisionOption(args: string[], name: string): "approve" | "deny" {
  const value = requireOption(args, name);

  if (value === "approve" || value === "deny") {
    return value;
  }

  throw new Error(`Invalid action decision for ${name}: ${value}`);
}

function readPiiRedactionRuleKindsOption(args: string[], name: string): PiiRedactionRuleKind[] | undefined {
  const values = readCsvOption(args, name);

  if (values === undefined) {
    return undefined;
  }

  return values.map((value) => piiRedactionRuleKindSchema.parse(value));
}

function readNullablePositiveIntegerOption(args: string[], name: string): number | null | undefined {
  const value = readOption(args, name);

  if (value === undefined) {
    return undefined;
  }

  if (["forever", "none", "null", "unlimited"].includes(value.toLowerCase())) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value for ${name}: ${value}`);
  }

  return parsed;
}

function requireOption(args: string[], name: string): string {
  const value = readOption(args, name);

  if (!value) {
    throw new Error(`Missing required option: ${name}`);
  }

  return value;
}

function printHelp(): void {
  console.log(`ForgetBase CLI

Usage:
  forgetbase health [--api-url http://127.0.0.1:3000]
  forgetbase capabilities
  forgetbase auth bootstrap --email admin@example.test --display-name "Admin" [--tenant-id tenant_demo] [--password ...]
  forgetbase auth login --email user@example.test [--tenant-id tenant_demo] [--password ...] [--device-label "Work laptop"]
  forgetbase auth oidc-start --provider oidc|microsoft-entra [--tenant-id tenant_demo] [--redirect-uri ...]
  forgetbase auth oidc-callback --provider oidc|microsoft-entra --code ... --state ... --nonce ... --code-verifier ... [--tenant-id tenant_demo] [--device-label "Work laptop"]
  forgetbase auth me [--api-key ...]
  forgetbase auth logout [--api-key ...]
  forgetbase auth sessions [--user-id user_123] [--include-revoked true|false] [--limit 50] [--api-key ...]
  forgetbase auth session-revoke --session-id login_session_123 [--api-key ...]
  forgetbase auth user-create --email user@example.test --display-name "User" --role reader [--password ...] [--api-key ...]
  forgetbase auth user-list [--limit 50] [--api-key ...]
  forgetbase auth user-update --user-id user_123 [--display-name "User"] [--role reader] [--status active|disabled] [--password ...] [--api-key ...]
  forgetbase auth service-account-create --slug automation --name "Automation" [--role reader] [--status active|disabled] [--api-key ...]
  forgetbase auth service-account-list [--limit 50] [--api-key ...]
  forgetbase auth service-account-update --service-account-id service_account_123 [--name "Automation"] [--role reader] [--status active|disabled] [--api-key ...]
  forgetbase auth group-create --slug ai-team --name "AI Team" [--description "..."] [--api-key ...]
  forgetbase auth group-list [--limit 50] [--api-key ...]
  forgetbase auth group-delete --group-id group_123 [--api-key ...]
  forgetbase auth group-member-add --group-id group_123 --user-id user_123 [--api-key ...]
  forgetbase auth group-member-remove --group-id group_123 --user-id user_123 [--api-key ...]
  forgetbase auth group-members --group-id group_123 [--limit 50] [--api-key ...]
  forgetbase auth api-key-create (--user-id user_123 | --service-account-id service_account_123) --name cli --scopes asset:read,agent:execute [--allowed-surfaces api,cli,mcp,web,export] [--api-key ...]
  forgetbase auth api-key-list [--limit 50] [--api-key ...]
  forgetbase auth api-key-rotation-due [--as-of 2026-06-16T00:00:00Z] [--due-within-days 14] [--include-user-keys true|false] [--include-revoked true|false] [--limit 50] [--api-key ...]
  forgetbase auth api-key-rotate --api-key-id api_key_123 [--name replacement] [--revoke-old] [--api-key ...]
  forgetbase auth api-key-revoke --api-key-id api_key_123 [--api-key ...]
  forgetbase auth grant --stable-id policy.example --principal-type user|group|service-account --principal-id user_123 [--api-key ...]
  forgetbase admin model-providers [--api-key ...]
  forgetbase admin model-provider-health [--api-key ...]
	  forgetbase admin managed-query-cache [--limit 50] [--api-key ...]
	  forgetbase admin managed-query-policy [--api-key ...]
	  forgetbase admin managed-query-policy-set [--default-mode deterministic-retrieval|provider-routed] [--allowed-modes deterministic-retrieval,provider-routed] [--minimum-citation-count 1] [--require-grounded true|false] [--api-key ...]
  forgetbase admin retrieval-ranking-policy [--api-key ...]
  forgetbase admin retrieval-ranking-policy-set [--agent-instruction-weight 1.2] [--asset-summary-weight 1.1] [--human-document-weight 1] [--exact-phrase-boost 0.25] [--api-key ...]
	  forgetbase admin managed-query-eval-schedule-policy [--api-key ...]
	  forgetbase admin managed-query-eval-schedule-policy-set [--enabled true|false] [--interval-minutes 1440] [--file corpus/demo/evals.json | --clear-eval-input] [--api-key ...]
	  forgetbase admin action-execution-policy [--api-key ...]
	  forgetbase admin action-execution-policy-set [--enabled true|false] [--allowed-action-types create-task-record] [--require-approval true|false] [--dry-run-default true|false] [--kill-switch true|false] [--max-requests-per-hour 60] [--approval-expires-in-minutes 1440] [--api-key ...]
	  forgetbase admin managed-query-cache-policy [--api-key ...]
  forgetbase admin managed-query-cache-policy-set [--cache-enabled true|false] [--max-cache-ttl-seconds 3600|unlimited] [--api-key ...]
  forgetbase admin managed-query-cache-delete --cache-key CACHE_KEY [--api-key ...]
  forgetbase admin managed-query-cache-purge [--expired-before 2026-06-16T00:00:00Z] [--execute] [--api-key ...]
  forgetbase admin managed-query-retention-policy [--api-key ...]
  forgetbase admin managed-query-retention-policy-set [--prompt-capture-mode disabled|metadata-only] [--response-capture-mode disabled|metadata-only] [--metadata-retention-days 30|none] [--api-key ...]
  forgetbase admin secret-reference-policy [--api-key ...]
  forgetbase admin secret-reference-policy-set [--allowed-prefixes OPENAI_,ENTRA_] [--allowed-env-vars CUSTOM_PROVIDER_KEY] [--allow-unlisted true|false] [--api-key ...]
  forgetbase admin pii-redaction-policy [--api-key ...]
  forgetbase admin pii-redaction-policy-set [--redaction-enabled true|false] [--enabled-rule-kinds email,ip-address,url-secret] [--api-key ...]
  forgetbase admin service-account-policy [--api-key ...]
  forgetbase admin service-account-policy-set [--max-service-accounts 50|unlimited] [--max-active-api-keys 5|unlimited] [--default-key-expires-in-days 90|none] [--api-key ...]
  forgetbase admin model-provider-set --provider openai --enabled true --api-key-env-var OPENAI_API_KEY [--default-model gpt-5.1] [--max-output-tokens 700] [--temperature 0.2] [--timeout-ms 20000] [--max-retries 1] [--retry-backoff-ms 250] [--input-cost-per-million-tokens 2] [--output-cost-per-million-tokens 8] [--max-estimated-total-tokens-per-query 3000] [--max-estimated-cost-usd-per-query 0.05] [--cache-enabled true] [--cache-ttl-seconds 3600] [--api-key ...]
  forgetbase admin auth-providers [--api-key ...]
  forgetbase admin auth-provider-set --provider oidc --issuer-url https://idp.example.com --client-id forgetbase --client-secret-env-var OIDC_CLIENT_SECRET [--api-key ...]
  forgetbase validate --file corpus/demo/assets.json [--as-of 2026-06-16] [--fail-on-warnings]
  forgetbase search --query "PII redaction" [--limit 10] [--strategy lexical|vector|hybrid] [--api-key ...]
  forgetbase agent query --query "PII redaction" [--limit 5] [--mode deterministic-retrieval|provider-routed] [--provider openai|anthropic|openrouter] [--model MODEL] [--cache true|false] [--api-key ...]
	  forgetbase agent feedback --telemetry-event-id retrieval_1 --query "PII redaction" --outcome accepted [--factual-citation-accuracy 5] [--api-key ...]
	  forgetbase agent feedback-list [--limit 50] [--api-key ...]
	  forgetbase agent eval --file corpus/demo/evals.json [--limit 5] [--minimum-pass-rate 1] [--tag-minimum-pass-rates policy-compliance=1,citation-accuracy=1] [--fail-on-threshold true] [--api-key ...]
	  forgetbase agent eval-runs [--limit 50] [--api-key ...]
	  forgetbase agent eval-summary [--since 2026-06-16T00:00:00Z] [--until 2026-06-17T00:00:00Z] [--limit 50] [--api-key ...]
	  forgetbase agent action-execute --action-type create-task-record --title "Review policy" [--description "..."] [--target stable-id] [--idempotency-key stable-retry-key] [--dry-run true|false] [--payload-file payload.json] [--metadata-file metadata.json] [--api-key ...] # requires admin or agent:execute
	  forgetbase agent action-list [--limit 50] [--api-key ...]
	  forgetbase agent action-decision --action-request-id agent_action_1 --decision approve|deny [--reason "..."] [--api-key ...]
	  forgetbase audit events [--limit 100] [--api-key ...]
  forgetbase telemetry summary [--since 2026-06-16T00:00:00Z] [--until 2026-06-17T00:00:00Z] [--limit 200] [--api-key ...]
  forgetbase telemetry retention [--api-key ...]
  forgetbase telemetry retention-set [--retrieval-event-days 30|forever] [--audit-event-days 365|forever] [--feedback-days 90|forever] [--api-key ...]
  forgetbase telemetry purge [--execute] [--api-key ...]
  forgetbase exports ai-package [--package demo-agent-pack] [--format json|okf] [--okf-version 0.1] [--output export.json] [--output-dir okf-bundle] [--api-key ...]
  forgetbase assets list [--api-key ...] [--api-url http://127.0.0.1:3000]
  forgetbase assets review-queue [--as-of 2026-06-16] [--include-approved true|false] [--limit 50] [--api-key ...]
  forgetbase assets get <stable-id> [--api-key ...] [--api-url http://127.0.0.1:3000]
  forgetbase assets create --file asset.json [--api-key ...] [--api-url http://127.0.0.1:3000]
  forgetbase assets update <stable-id> --file update.json [--api-key ...] [--api-url http://127.0.0.1:3000]
  forgetbase assets version <stable-id> --version-number 1 [--api-key ...] [--api-url http://127.0.0.1:3000]
  forgetbase assets review <stable-id> --review-due-at 2027-01-31 [--status approved] [--source-ref ...] [--change-note "..."] [--api-key ...]
  forgetbase assets publish <stable-id> [--review-due-at 2027-01-31] [--change-note "..."] [--api-key ...] [--api-url http://127.0.0.1:3000]
  forgetbase assets restore <stable-id> --version-number 1 [--api-key ...] [--api-url http://127.0.0.1:3000]
  forgetbase corpus import [--file corpus/demo/assets.json] [--api-key ...] [--api-url http://127.0.0.1:3000]
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
