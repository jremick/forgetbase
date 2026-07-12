import { createHmac, randomUUID } from "node:crypto";
import {
  assetTypeSchema,
  managedQueryEvalInputSchema,
  managedQueryEvalReportSchema,
  type ApiKeyRotationReport,
  type AuditEvent,
  type AgentActionRequest,
  type ManagedQueryEvalCase,
  type ManagedQueryEvalReport,
  type ManagedQueryEvalSchedulePolicy,
  type PiiRedactionPolicy,
  type SearchResult,
  type TelemetryRetentionPurgeResult
} from "@forgetbase/schema";
import {
  createEmbeddingProviderFromEnv,
  defaultPiiRedactionPolicy,
  PostgresAuthRepository,
  PostgresAgentActionExecutionRepository,
  PostgresManagedQueryCacheRepository,
  PostgresManagedQueryEvalRunRepository,
  PostgresManagedQueryEvalSchedulePolicyRepository,
  PostgresManagedQueryFeedbackRepository,
  PostgresPiiRedactionPolicyRepository,
  PostgresRetrievalRepository,
  PostgresTelemetryRetentionPolicyRepository,
  purgeTelemetryForRetentionPolicy,
  type ManagedQueryCacheTenantPurgeResult
} from "@forgetbase/db";
import { redactText } from "@forgetbase/validation";
import {
  createWorkerRuntime,
  startScheduledJobs,
  withWorkerRuntime,
  type ScheduledJobDefinition,
  type WorkerRuntime
} from "./runtime.js";

interface RetentionMaintenanceResult {
  dryRun: boolean;
  tenantCount: number;
  totals: {
    retrievalEvents: number;
    auditEvents: number;
    managedQueryFeedback: number;
  };
  results: TelemetryRetentionPurgeResult[];
}

interface CacheMaintenanceResult {
  dryRun: boolean;
  expiredBefore: string;
  tenantCount: number;
  deletedCount: number;
  results: ManagedQueryCacheTenantPurgeResult[];
}

interface ApiKeyRotationReminderMaintenanceResult {
  dryRun: boolean;
  asOf: string;
  dueWithinDays: number;
  dedupeWindowHours: number;
  tenantCount: number;
  reminderCount: number;
  auditEventCount: number;
  skippedDuplicateCount: number;
  notificationDelivery: ApiKeyRotationReminderNotificationDeliveryResult;
  reports: ApiKeyRotationReport[];
}

interface ManagedQueryEvalScheduleMaintenanceResult {
  dryRun: boolean;
  asOf: string;
  duePolicyCount: number;
  attemptedRunCount: number;
  evalRunCount: number;
  passedRunCount: number;
  failedRunCount: number;
  errorRunCount: number;
  results: ManagedQueryEvalScheduleTenantResult[];
}

interface ActionApprovalExpiryMaintenanceResult {
  dryRun: boolean;
  asOf: string;
  tenantCount: number;
  candidateCount: number;
  expiredCount: number;
  results: ActionApprovalExpiryTenantResult[];
}

interface ActionApprovalExpiryTenantResult {
  tenantId: string;
  actionRequestId: string;
  actionType: AgentActionRequest["actionType"];
  title: string;
  approvalExpiresAt: string;
  status: AgentActionRequest["status"];
  expired: boolean;
}

interface ManagedQueryEvalScheduleTenantResult {
  tenantId: string;
  dryRun: boolean;
  status: "due" | "passed" | "failed" | "error";
  evalRunId: string | null;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  passRate: number | null;
  thresholdPassed: boolean | null;
  error: string | null;
}

interface ApiKeyRotationReminderNotificationDeliveryResult {
  enabled: boolean;
  dryRun: boolean;
  signingEnabled: boolean;
  timeoutMs: number;
  attemptedCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedDryRunCount: number;
  skippedDuplicateCount: number;
  skippedNoWebhookCount: number;
}

interface ApiKeyRotationReminderNotificationPayload {
  event: "forgetbase.api_key_rotation_reminders";
  version: 1;
  deliveryId: string;
  generatedAt: string;
  tenantId: string;
  asOf: string;
  dueBefore: string;
  dueWithinDays: number;
  includeUserKeys: boolean;
  includeRevoked: boolean;
  dedupeWindowHours: number;
  reminderCount: number;
  states: Record<string, number>;
  reminders: Array<{
    apiKeyId: string;
    apiKeyName: string;
    ownerType: "user" | "service-account";
    userId: string | null;
    serviceAccountId: string | null;
    scopes: string[];
    expiresAt: string | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    rotationState: "expired" | "due-soon" | "missing-expiry";
    daysUntilExpiry: number | null;
    reason: string;
  }>;
}

interface ApiKeyRotationReminderNotificationSendInput {
  webhookUrl: string;
  signingSecret?: string;
  timeoutMs: number;
  payload: ApiKeyRotationReminderNotificationPayload;
}

export type ApiKeyRotationReminderNotificationSender = (
  input: ApiKeyRotationReminderNotificationSendInput
) => Promise<void>;

interface ApiKeyRotationReminderMaintenanceInput {
  dryRun?: boolean;
  asOf?: Date | string;
  dueWithinDays?: number;
  dedupeWindowHours?: number;
  tenantIds?: string[];
  notificationWebhookUrl?: string;
  notificationWebhookSigningSecret?: string;
  notificationWebhookTimeoutMs?: number;
  notificationSender?: ApiKeyRotationReminderNotificationSender;
}

export async function runOnce(runtime?: WorkerRuntime): Promise<void> {
  const supportedTypes = assetTypeSchema.options.join(", ");
  console.log(`ForgetBase worker ready. Supported asset types: ${supportedTypes}`);

  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping retrieval indexing.");
    return;
  }

  await withWorkerRuntime(runtime, async (activeRuntime, pool) => {
    const retrievalRepository = new PostgresRetrievalRepository(pool, undefined, createEmbeddingProviderFromEnv());
    const result = await retrievalRepository.indexAllAssets();
    console.log(`Indexed ${result.assetsIndexed} assets into ${result.chunksIndexed} retrieval chunks.`);

    if (readBooleanEnv("FORGETBASE_RETENTION_PURGE_RUN_ONCE", false)) {
      const retention = await runRetentionMaintenance({
        dryRun: readBooleanEnv("FORGETBASE_RETENTION_PURGE_DRY_RUN", true)
      }, activeRuntime);
      logRetentionMaintenance(retention);
    }

    if (readBooleanEnv("FORGETBASE_CACHE_PURGE_RUN_ONCE", false)) {
      const cache = await runCacheMaintenance({
        dryRun: readBooleanEnv("FORGETBASE_CACHE_PURGE_DRY_RUN", true)
      }, activeRuntime);
      logCacheMaintenance(cache);
    }

    if (readBooleanEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_RUN_ONCE", false)) {
      const reminders = await runApiKeyRotationReminderMaintenance({
        dryRun: readBooleanEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_DRY_RUN", true),
        dueWithinDays: readPositiveIntegerEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_DUE_WITHIN_DAYS", 14),
        dedupeWindowHours: readNonNegativeIntegerEnv(
          "FORGETBASE_API_KEY_ROTATION_REMINDERS_DEDUPE_WINDOW_HOURS",
          24
        ),
        notificationWebhookUrl: readOptionalEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL"),
        notificationWebhookSigningSecret: readOptionalEnv(
          "FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET"
        ),
        notificationWebhookTimeoutMs: readPositiveIntegerEnv(
          "FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_TIMEOUT_MS",
          5000
        )
      }, activeRuntime);
      logApiKeyRotationReminderMaintenance(reminders);
    }

    if (readBooleanEnv("FORGETBASE_MANAGED_QUERY_EVALS_RUN_ONCE", false)) {
      const evals = await runManagedQueryEvalScheduleMaintenance({
        dryRun: readBooleanEnv("FORGETBASE_MANAGED_QUERY_EVALS_DRY_RUN", true),
        limit: readPositiveIntegerEnv("FORGETBASE_MANAGED_QUERY_EVALS_LIMIT", 100)
      }, activeRuntime);
      logManagedQueryEvalScheduleMaintenance(evals);
    }

    if (readBooleanEnv("FORGETBASE_ACTION_APPROVAL_EXPIRY_RUN_ONCE", false)) {
      const actionExpiry = await runActionApprovalExpiryMaintenance({
        dryRun: readBooleanEnv("FORGETBASE_ACTION_APPROVAL_EXPIRY_DRY_RUN", true),
        limit: readPositiveIntegerEnv("FORGETBASE_ACTION_APPROVAL_EXPIRY_LIMIT", 500)
      }, activeRuntime);
      logActionApprovalExpiryMaintenance(actionExpiry);
    }
  });
}

export async function runRetentionMaintenance(
  input: { dryRun?: boolean } = {},
  runtime?: WorkerRuntime
): Promise<RetentionMaintenanceResult> {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping retention maintenance.");
    return {
      dryRun: input.dryRun ?? true,
      tenantCount: 0,
      totals: {
        retrievalEvents: 0,
        auditEvents: 0,
        managedQueryFeedback: 0
      },
      results: []
    };
  }

  return withWorkerRuntime(runtime, async (_activeRuntime, pool) => {
    const authRepository = new PostgresAuthRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool, undefined, createEmbeddingProviderFromEnv());
    const feedbackRepository = new PostgresManagedQueryFeedbackRepository(pool);
    const policyRepository = new PostgresTelemetryRetentionPolicyRepository(pool);
    const policies = await policyRepository.listPolicies();
    const dryRun = input.dryRun ?? true;
    const results: TelemetryRetentionPurgeResult[] = [];

    for (const policy of policies) {
      results.push(await purgeTelemetryForRetentionPolicy({
        tenantId: policy.tenantId,
        dryRun,
        policy,
        authRepository,
        retrievalRepository,
        feedbackRepository
      }));
    }

    return {
      dryRun,
      tenantCount: policies.length,
      totals: {
        retrievalEvents: results.reduce((total, result) => total + result.retrievalEvents.deletedCount, 0),
        auditEvents: results.reduce((total, result) => total + result.auditEvents.deletedCount, 0),
        managedQueryFeedback: results.reduce(
          (total, result) => total + result.managedQueryFeedback.deletedCount,
          0
        )
      },
      results
    };
  });
}

export async function runCacheMaintenance(
  input: { dryRun?: boolean; expiredBefore?: Date } = {},
  runtime?: WorkerRuntime
): Promise<CacheMaintenanceResult> {
  const expiredBefore = input.expiredBefore ?? new Date();

  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping managed-query cache maintenance.");
    return {
      dryRun: input.dryRun ?? true,
      expiredBefore: expiredBefore.toISOString(),
      tenantCount: 0,
      deletedCount: 0,
      results: []
    };
  }

  return withWorkerRuntime(runtime, async (_activeRuntime, pool) => {
    const cacheRepository = new PostgresManagedQueryCacheRepository(pool);
    const dryRun = input.dryRun ?? true;
    const results = await cacheRepository.purgeExpiredForAllTenants({
      expiredBefore: expiredBefore.toISOString(),
      dryRun
    });

    return {
      dryRun,
      expiredBefore: expiredBefore.toISOString(),
      tenantCount: results.length,
      deletedCount: results.reduce((total, result) => total + result.deletedCount, 0),
      results
    };
  });
}

export async function runApiKeyRotationReminderMaintenance(
  input: ApiKeyRotationReminderMaintenanceInput = {},
  runtime?: WorkerRuntime
): Promise<ApiKeyRotationReminderMaintenanceResult> {
  const asOf = toIsoDateTime(input.asOf ?? new Date());
  const dueWithinDays = input.dueWithinDays ?? 14;
  const dedupeWindowHours = Math.max(input.dedupeWindowHours ?? 24, 0);
  const dryRun = input.dryRun ?? true;
  const notificationWebhookUrl = normalizeWebhookUrl(input.notificationWebhookUrl);
  const notificationWebhookSigningSecret = readOptionalString(input.notificationWebhookSigningSecret);
  const notificationWebhookTimeoutMs = Math.max(input.notificationWebhookTimeoutMs ?? 5000, 1);
  const notificationDelivery = createNotificationDeliveryResult({
    dryRun,
    webhookUrl: notificationWebhookUrl,
    signingSecret: notificationWebhookSigningSecret,
    timeoutMs: notificationWebhookTimeoutMs
  });
  const notificationSender = input.notificationSender ?? sendApiKeyRotationReminderWebhook;

  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping API key rotation reminder maintenance.");
    return {
      dryRun,
      asOf,
      dueWithinDays,
      dedupeWindowHours,
      tenantCount: 0,
      reminderCount: 0,
      auditEventCount: 0,
      skippedDuplicateCount: 0,
      notificationDelivery,
      reports: []
    };
  }

  return withWorkerRuntime(runtime, async (_activeRuntime, pool) => {
    const authRepository = new PostgresAuthRepository(pool);
    const reports = await authRepository.listApiKeyRotationReports({
      asOf,
      dueWithinDays,
      includeUserKeys: false,
      includeRevoked: false,
      limit: 200,
      tenantIds: input.tenantIds
    });
    let auditEventCount = 0;
    let skippedDuplicateCount = 0;

    for (const report of reports) {
      const reminderFingerprint = buildRotationReminderFingerprint(report);
      const duplicate = await hasRecentRotationReminderAuditEvent({
        authRepository,
        report,
        reminderFingerprint,
        asOf,
        dedupeWindowHours
      });

      if (duplicate) {
        skippedDuplicateCount += 1;
        notificationDelivery.skippedDuplicateCount += 1;
        continue;
      }

      if (!dryRun) {
        await authRepository.recordAuditEvent({
          tenantId: report.tenantId,
          action: "auth.api_key.rotation_reminder",
          targetType: "tenant",
          targetId: report.tenantId,
          outcome: "success",
          metadata: {
            asOf: report.asOf,
            dueBefore: report.dueBefore,
            dueWithinDays: report.dueWithinDays,
            dedupeWindowHours,
            reminderCount: report.reminders.length,
            states: countRotationStates(report),
            reminderFingerprint,
            apiKeys: report.reminders.map((reminder) => ({
              apiKeyId: reminder.apiKey.id,
              ownerType: reminder.ownerType,
              userId: reminder.apiKey.userId,
              serviceAccountId: reminder.apiKey.serviceAccountId,
              rotationState: reminder.rotationState,
              daysUntilExpiry: reminder.daysUntilExpiry,
              reason: reminder.reason
            }))
          }
        });
        auditEventCount += 1;
      }

      if (!notificationWebhookUrl) {
        notificationDelivery.skippedNoWebhookCount += 1;
      } else if (dryRun) {
        notificationDelivery.skippedDryRunCount += 1;
      } else {
        notificationDelivery.attemptedCount += 1;

        try {
          await notificationSender({
            webhookUrl: notificationWebhookUrl,
            signingSecret: notificationWebhookSigningSecret,
            timeoutMs: notificationWebhookTimeoutMs,
            payload: buildApiKeyRotationReminderNotificationPayload({
              report,
              dedupeWindowHours,
              deliveryId: randomUUID()
            })
          });
          notificationDelivery.deliveredCount += 1;
        } catch (error) {
          notificationDelivery.failedCount += 1;
          console.error(
            `API key rotation reminder notification delivery failed for tenant ${report.tenantId}.`,
            describeError(error)
          );
        }
      }
    }

    return {
      dryRun,
      asOf,
      dueWithinDays,
      dedupeWindowHours,
      tenantCount: reports.length,
      reminderCount: reports.reduce((total, report) => total + report.reminders.length, 0),
      auditEventCount,
      skippedDuplicateCount,
      notificationDelivery,
      reports
    };
  });
}

export async function runManagedQueryEvalScheduleMaintenance(
  input: {
    dryRun?: boolean;
    now?: Date | string;
    tenantIds?: string[];
    limit?: number;
  } = {},
  runtime?: WorkerRuntime
): Promise<ManagedQueryEvalScheduleMaintenanceResult> {
  const asOf = toIsoDateTime(input.now ?? new Date());
  const dryRun = input.dryRun ?? true;

  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping managed-query eval schedule maintenance.");
    return {
      dryRun,
      asOf,
      duePolicyCount: 0,
      attemptedRunCount: 0,
      evalRunCount: 0,
      passedRunCount: 0,
      failedRunCount: 0,
      errorRunCount: 0,
      results: []
    };
  }

  return withWorkerRuntime(runtime, async (_activeRuntime, pool) => {
    const policyRepository = new PostgresManagedQueryEvalSchedulePolicyRepository(pool);
    const policies = input.tenantIds?.length
      ? (await policyRepository.listPolicies({ tenantIds: input.tenantIds }))
        .filter((policy) => isManagedQueryEvalSchedulePolicyDue(policy, asOf))
      : await policyRepository.listDuePolicies({ now: asOf, limit: input.limit });
    const results: ManagedQueryEvalScheduleTenantResult[] = [];

    if (dryRun) {
      return {
        dryRun,
        asOf,
        duePolicyCount: policies.length,
        attemptedRunCount: 0,
        evalRunCount: 0,
        passedRunCount: 0,
        failedRunCount: 0,
        errorRunCount: 0,
        results: policies.map((policy) => ({
          tenantId: policy.tenantId,
          dryRun: true,
          status: "due",
          evalRunId: null,
          caseCount: policy.evalInput?.cases.length ?? 0,
          passedCount: 0,
          failedCount: 0,
          passRate: null,
          thresholdPassed: null,
          error: null
        }))
      };
    }

    const authRepository = new PostgresAuthRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool, undefined, createEmbeddingProviderFromEnv());
    const evalRunRepository = new PostgresManagedQueryEvalRunRepository(pool);
    const piiRedactionPolicyRepository = new PostgresPiiRedactionPolicyRepository(pool);

    for (const policy of policies) {
      try {
        const { report, evalRunId } = await runScheduledManagedQueryEval({
          policy,
          authRepository,
          retrievalRepository,
          evalRunRepository,
          piiRedactionPolicyRepository
        });
        const status = report.ok ? "passed" : "failed";

        await policyRepository.recordRunResult({
          tenantId: policy.tenantId,
          evalRunId,
          status,
          ranAt: asOf
        });
        await authRepository.recordAuditEvent({
          tenantId: policy.tenantId,
          action: "agent.eval.scheduled_run",
          targetType: "managed_query_eval_schedule_policy",
          targetId: policy.tenantId,
          outcome: report.ok ? "success" : "error",
          metadata: {
            evalRunId,
            caseCount: report.caseCount,
            passedCount: report.passedCount,
            failedCount: report.failedCount,
            passRate: report.passRate,
            minimumPassRate: report.minimumPassRate,
            thresholdPassed: report.thresholdPassed,
            tagThresholdResults: report.tagThresholdResults
          }
        });
        results.push({
          tenantId: policy.tenantId,
          dryRun: false,
          status,
          evalRunId,
          caseCount: report.caseCount,
          passedCount: report.passedCount,
          failedCount: report.failedCount,
          passRate: report.passRate,
          thresholdPassed: report.thresholdPassed,
          error: null
        });
      } catch (error) {
        const message = describeError(error).slice(0, 500);

        await policyRepository.recordRunResult({
          tenantId: policy.tenantId,
          status: "error",
          error: message,
          ranAt: asOf
        });
        await authRepository.recordAuditEvent({
          tenantId: policy.tenantId,
          action: "agent.eval.scheduled_run",
          targetType: "managed_query_eval_schedule_policy",
          targetId: policy.tenantId,
          outcome: "error",
          metadata: {
            error: message
          }
        });
        results.push({
          tenantId: policy.tenantId,
          dryRun: false,
          status: "error",
          evalRunId: null,
          caseCount: policy.evalInput?.cases.length ?? 0,
          passedCount: 0,
          failedCount: 0,
          passRate: null,
          thresholdPassed: null,
          error: message
        });
      }
    }

    return {
      dryRun,
      asOf,
      duePolicyCount: policies.length,
      attemptedRunCount: results.length,
      evalRunCount: results.filter((result) => result.evalRunId).length,
      passedRunCount: results.filter((result) => result.status === "passed").length,
      failedRunCount: results.filter((result) => result.status === "failed").length,
      errorRunCount: results.filter((result) => result.status === "error").length,
      results
    };
  });
}

export async function runActionApprovalExpiryMaintenance(
  input: {
    dryRun?: boolean;
    now?: Date | string;
    tenantIds?: string[];
    limit?: number;
  } = {},
  runtime?: WorkerRuntime
): Promise<ActionApprovalExpiryMaintenanceResult> {
  const asOf = toIsoDateTime(input.now ?? new Date());
  const dryRun = input.dryRun ?? true;
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);

  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping action approval expiry maintenance.");
    return {
      dryRun,
      asOf,
      tenantCount: 0,
      candidateCount: 0,
      expiredCount: 0,
      results: []
    };
  }

  return withWorkerRuntime(runtime, async (_activeRuntime, pool) => {
    const authRepository = new PostgresAuthRepository(pool);
    const actionExecutionRepository = new PostgresAgentActionExecutionRepository(pool);
    const candidates = await actionExecutionRepository.listExpiredApprovalRequests({
      now: asOf,
      tenantIds: input.tenantIds,
      limit
    });
    const results: ActionApprovalExpiryTenantResult[] = [];
    let expiredCount = 0;

    for (const candidate of candidates) {
      if (dryRun) {
        results.push(toActionApprovalExpiryTenantResult(candidate, false));
        continue;
      }

      const expired = await actionExecutionRepository.decideRequest({
        tenantId: candidate.tenantId,
        actionRequestId: candidate.id,
        decision: "deny",
        reason: "approval_expired",
        status: "expired",
        result: {
          approved: false,
          expired: true,
          externalSideEffects: false
        },
        metadata: {
          maintenance: true,
          approvalExpiresAt: candidate.approvalExpiresAt,
          expiredAt: asOf
        }
      });

      if (!expired) {
        continue;
      }

      await authRepository.recordAuditEvent({
        tenantId: expired.tenantId,
        action: "agent.action.approval_expiry",
        targetType: "agent_action",
        targetId: expired.id,
        outcome: "denied",
        reason: "approval_expired",
        metadata: {
          actionType: expired.actionType,
          approvalExpiresAt: expired.approvalExpiresAt,
          expiredAt: asOf,
          externalSideEffects: expired.result.externalSideEffects ?? false
        }
      });
      expiredCount += 1;
      results.push(toActionApprovalExpiryTenantResult(expired, true));
    }

    return {
      dryRun,
      asOf,
      tenantCount: uniqueCount(candidates.map((candidate) => candidate.tenantId)),
      candidateCount: candidates.length,
      expiredCount,
      results
    };
  });
}

export function buildMaintenanceJobDefinitions(runtime: WorkerRuntime): ScheduledJobDefinition[] {
  const retentionEnabled = readBooleanEnv("FORGETBASE_RETENTION_PURGE_ENABLED", false);
  const retentionDryRun = readBooleanEnv("FORGETBASE_RETENTION_PURGE_DRY_RUN", true);
  const retentionIntervalMs = readPositiveIntegerEnv(
    "FORGETBASE_RETENTION_PURGE_INTERVAL_MS",
    24 * 60 * 60 * 1000
  );
  const cacheEnabled = readBooleanEnv("FORGETBASE_CACHE_PURGE_ENABLED", false);
  const cacheDryRun = readBooleanEnv("FORGETBASE_CACHE_PURGE_DRY_RUN", true);
  const cacheIntervalMs = readPositiveIntegerEnv(
    "FORGETBASE_CACHE_PURGE_INTERVAL_MS",
    60 * 60 * 1000
  );
  const apiKeyRotationRemindersEnabled = readBooleanEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_ENABLED", false);
  const apiKeyRotationRemindersDryRun = readBooleanEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_DRY_RUN", true);
  const apiKeyRotationRemindersDueWithinDays = readPositiveIntegerEnv(
    "FORGETBASE_API_KEY_ROTATION_REMINDERS_DUE_WITHIN_DAYS",
    14
  );
  const apiKeyRotationRemindersDedupeWindowHours = readNonNegativeIntegerEnv(
    "FORGETBASE_API_KEY_ROTATION_REMINDERS_DEDUPE_WINDOW_HOURS",
    24
  );
  const apiKeyRotationRemindersIntervalMs = readPositiveIntegerEnv(
    "FORGETBASE_API_KEY_ROTATION_REMINDERS_INTERVAL_MS",
    24 * 60 * 60 * 1000
  );
  const apiKeyRotationRemindersWebhookUrl = readOptionalEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL");
  const apiKeyRotationRemindersWebhookSigningSecret = readOptionalEnv(
    "FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET"
  );
  const apiKeyRotationRemindersWebhookTimeoutMs = readPositiveIntegerEnv(
    "FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_TIMEOUT_MS",
    5000
  );
  const managedQueryEvalsEnabled = readBooleanEnv("FORGETBASE_MANAGED_QUERY_EVALS_ENABLED", false);
  const managedQueryEvalsDryRun = readBooleanEnv("FORGETBASE_MANAGED_QUERY_EVALS_DRY_RUN", true);
  const managedQueryEvalsIntervalMs = readPositiveIntegerEnv(
    "FORGETBASE_MANAGED_QUERY_EVALS_INTERVAL_MS",
    60 * 60 * 1000
  );
  const managedQueryEvalsLimit = readPositiveIntegerEnv("FORGETBASE_MANAGED_QUERY_EVALS_LIMIT", 100);
  const actionApprovalExpiryEnabled = readBooleanEnv("FORGETBASE_ACTION_APPROVAL_EXPIRY_ENABLED", false);
  const actionApprovalExpiryDryRun = readBooleanEnv("FORGETBASE_ACTION_APPROVAL_EXPIRY_DRY_RUN", true);
  const actionApprovalExpiryIntervalMs = readPositiveIntegerEnv(
    "FORGETBASE_ACTION_APPROVAL_EXPIRY_INTERVAL_MS",
    60 * 60 * 1000
  );
  const actionApprovalExpiryLimit = readPositiveIntegerEnv("FORGETBASE_ACTION_APPROVAL_EXPIRY_LIMIT", 500);
  const definitions: ScheduledJobDefinition[] = [];

  if (retentionEnabled) {
    definitions.push({
      name: "telemetry-retention",
      intervalMs: retentionIntervalMs,
      runOnStart: readBooleanEnv("FORGETBASE_RETENTION_PURGE_ON_START", false),
      scheduleMessage: `Retention maintenance scheduled every ${retentionIntervalMs}ms. dryRun=${retentionDryRun}`,
      overlapMessage: "Retention maintenance already running; skipping overlapping tick.",
      failureMessage: "Retention maintenance failed.",
      async run() {
        logRetentionMaintenance(await runRetentionMaintenance({ dryRun: retentionDryRun }, runtime));
      }
    });
  }

  if (cacheEnabled) {
    definitions.push({
      name: "managed-query-cache-purge",
      intervalMs: cacheIntervalMs,
      runOnStart: readBooleanEnv("FORGETBASE_CACHE_PURGE_ON_START", false),
      scheduleMessage: `Managed-query cache maintenance scheduled every ${cacheIntervalMs}ms. dryRun=${cacheDryRun}`,
      overlapMessage: "Managed-query cache maintenance already running; skipping overlapping tick.",
      failureMessage: "Managed-query cache maintenance failed.",
      async run() {
        logCacheMaintenance(await runCacheMaintenance({ dryRun: cacheDryRun }, runtime));
      }
    });
  }

  if (apiKeyRotationRemindersEnabled) {
    definitions.push({
      name: "api-key-rotation-reminders",
      intervalMs: apiKeyRotationRemindersIntervalMs,
      runOnStart: readBooleanEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_ON_START", false),
      scheduleMessage: `API key rotation reminder maintenance scheduled every ${apiKeyRotationRemindersIntervalMs}ms. ` +
        `dryRun=${apiKeyRotationRemindersDryRun} dueWithinDays=${apiKeyRotationRemindersDueWithinDays} ` +
        `dedupeWindowHours=${apiKeyRotationRemindersDedupeWindowHours} ` +
        `notificationWebhook=${apiKeyRotationRemindersWebhookUrl ? "configured" : "disabled"}`,
      overlapMessage: "API key rotation reminder maintenance already running; skipping overlapping tick.",
      failureMessage: "API key rotation reminder maintenance failed.",
      async run() {
        logApiKeyRotationReminderMaintenance(await runApiKeyRotationReminderMaintenance({
          dryRun: apiKeyRotationRemindersDryRun,
          dueWithinDays: apiKeyRotationRemindersDueWithinDays,
          dedupeWindowHours: apiKeyRotationRemindersDedupeWindowHours,
          notificationWebhookUrl: apiKeyRotationRemindersWebhookUrl,
          notificationWebhookSigningSecret: apiKeyRotationRemindersWebhookSigningSecret,
          notificationWebhookTimeoutMs: apiKeyRotationRemindersWebhookTimeoutMs
        }, runtime));
      }
    });
  }

  if (managedQueryEvalsEnabled) {
    definitions.push({
      name: "managed-query-eval-schedule",
      intervalMs: managedQueryEvalsIntervalMs,
      runOnStart: readBooleanEnv("FORGETBASE_MANAGED_QUERY_EVALS_ON_START", false),
      scheduleMessage: `Managed-query eval schedule maintenance scheduled every ${managedQueryEvalsIntervalMs}ms. ` +
        `dryRun=${managedQueryEvalsDryRun} limit=${managedQueryEvalsLimit}`,
      overlapMessage: "Managed-query eval schedule maintenance already running; skipping overlapping tick.",
      failureMessage: "Managed-query eval schedule maintenance failed.",
      async run() {
        logManagedQueryEvalScheduleMaintenance(await runManagedQueryEvalScheduleMaintenance({
          dryRun: managedQueryEvalsDryRun,
          limit: managedQueryEvalsLimit
        }, runtime));
      }
    });
  }

  if (actionApprovalExpiryEnabled) {
    definitions.push({
      name: "action-approval-expiry",
      intervalMs: actionApprovalExpiryIntervalMs,
      runOnStart: readBooleanEnv("FORGETBASE_ACTION_APPROVAL_EXPIRY_ON_START", false),
      scheduleMessage: `Action approval expiry maintenance scheduled every ${actionApprovalExpiryIntervalMs}ms. ` +
        `dryRun=${actionApprovalExpiryDryRun} limit=${actionApprovalExpiryLimit}`,
      overlapMessage: "Action approval expiry maintenance already running; skipping overlapping tick.",
      failureMessage: "Action approval expiry maintenance failed.",
      async run() {
        logActionApprovalExpiryMaintenance(await runActionApprovalExpiryMaintenance({
          dryRun: actionApprovalExpiryDryRun,
          limit: actionApprovalExpiryLimit
        }, runtime));
      }
    });
  }

  return definitions;
}

export async function startWorker(): Promise<void> {
  const runtime = createWorkerRuntime();

  try {
    await runOnce(runtime);
  } catch (error) {
    await runtime.close();
    throw error;
  }

  console.log("ForgetBase worker idle loop started.");
  const scheduler = startScheduledJobs(buildMaintenanceJobDefinitions(runtime));

  const heartbeat = setInterval(() => {
    // Placeholder until queued ingestion, export, and richer telemetry jobs are implemented.
  }, 60_000);
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    clearInterval(heartbeat);
    console.log("ForgetBase worker shutting down.");
    process.exitCode = 0;
    void scheduler.stop()
      .then(() => runtime.close())
      .catch((error: unknown) => {
        console.error("ForgetBase worker shutdown failed.", error);
        process.exitCode = 1;
      });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--retention-once")) {
    const result = await runRetentionMaintenance({
      dryRun: !process.argv.includes("--execute")
    });
    logRetentionMaintenance(result);
  } else if (process.argv.includes("--cache-purge-once")) {
    const result = await runCacheMaintenance({
      dryRun: !process.argv.includes("--execute")
    });
    logCacheMaintenance(result);
  } else if (process.argv.includes("--api-key-rotation-reminders-once")) {
    const result = await runApiKeyRotationReminderMaintenance({
      dryRun: !process.argv.includes("--execute"),
      dueWithinDays: readPositiveIntegerArg("--due-within-days", 14),
      dedupeWindowHours: readNonNegativeIntegerArg("--dedupe-window-hours", 24),
      notificationWebhookUrl: readStringArg("--notification-webhook-url") ??
        readOptionalEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL"),
      notificationWebhookSigningSecret: readOptionalEnv(
        "FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET"
      ),
      notificationWebhookTimeoutMs: readPositiveIntegerArg(
        "--notification-webhook-timeout-ms",
        readPositiveIntegerEnv("FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_TIMEOUT_MS", 5000)
      )
    });
    logApiKeyRotationReminderMaintenance(result);
  } else if (process.argv.includes("--managed-query-evals-once")) {
    const tenantId = readStringArg("--tenant-id");
    const result = await runManagedQueryEvalScheduleMaintenance({
      dryRun: !process.argv.includes("--execute"),
      tenantIds: tenantId ? [tenantId] : undefined,
      limit: readPositiveIntegerArg("--limit", 100)
    });
    logManagedQueryEvalScheduleMaintenance(result);
  } else if (process.argv.includes("--action-approval-expiry-once")) {
    const tenantId = readStringArg("--tenant-id");
    const result = await runActionApprovalExpiryMaintenance({
      dryRun: !process.argv.includes("--execute"),
      tenantIds: tenantId ? [tenantId] : undefined,
      limit: readPositiveIntegerArg("--limit", 500)
    });
    logActionApprovalExpiryMaintenance(result);
  } else if (process.argv.includes("--once")) {
    await runOnce();
  } else {
    await startWorker();
  }
}

function logActionApprovalExpiryMaintenance(result: ActionApprovalExpiryMaintenanceResult): void {
  console.log(JSON.stringify({
    job: "action-approval-expiry",
    dryRun: result.dryRun,
    asOf: result.asOf,
    tenantCount: result.tenantCount,
    candidateCount: result.candidateCount,
    expiredCount: result.expiredCount
  }));
}

function toActionApprovalExpiryTenantResult(
  request: AgentActionRequest,
  expired: boolean
): ActionApprovalExpiryTenantResult {
  return {
    tenantId: request.tenantId,
    actionRequestId: request.id,
    actionType: request.actionType,
    title: request.title,
    approvalExpiresAt: request.approvalExpiresAt ?? "",
    status: request.status,
    expired
  };
}

function uniqueCount(values: string[]): number {
  return new Set(values).size;
}

function logRetentionMaintenance(result: RetentionMaintenanceResult): void {
  console.log(JSON.stringify({
    job: "telemetry-retention",
    dryRun: result.dryRun,
    tenantCount: result.tenantCount,
    totals: result.totals
  }));
}

function logCacheMaintenance(result: CacheMaintenanceResult): void {
  console.log(JSON.stringify({
    job: "managed-query-cache-purge",
    dryRun: result.dryRun,
    expiredBefore: result.expiredBefore,
    tenantCount: result.tenantCount,
    deletedCount: result.deletedCount
  }));
}

function logApiKeyRotationReminderMaintenance(result: ApiKeyRotationReminderMaintenanceResult): void {
  console.log(JSON.stringify({
    job: "api-key-rotation-reminders",
    dryRun: result.dryRun,
    asOf: result.asOf,
    dueWithinDays: result.dueWithinDays,
    dedupeWindowHours: result.dedupeWindowHours,
    tenantCount: result.tenantCount,
    reminderCount: result.reminderCount,
    auditEventCount: result.auditEventCount,
    skippedDuplicateCount: result.skippedDuplicateCount,
    notificationDelivery: result.notificationDelivery
  }));
}

function logManagedQueryEvalScheduleMaintenance(result: ManagedQueryEvalScheduleMaintenanceResult): void {
  console.log(JSON.stringify({
    job: "managed-query-eval-schedule",
    dryRun: result.dryRun,
    asOf: result.asOf,
    duePolicyCount: result.duePolicyCount,
    attemptedRunCount: result.attemptedRunCount,
    evalRunCount: result.evalRunCount,
    passedRunCount: result.passedRunCount,
    failedRunCount: result.failedRunCount,
    errorRunCount: result.errorRunCount
  }));
}

async function runScheduledManagedQueryEval(input: {
  policy: ManagedQueryEvalSchedulePolicy;
  authRepository: PostgresAuthRepository;
  retrievalRepository: PostgresRetrievalRepository;
  evalRunRepository: PostgresManagedQueryEvalRunRepository;
  piiRedactionPolicyRepository: PostgresPiiRedactionPolicyRepository;
}): Promise<{ report: ManagedQueryEvalReport; evalRunId: string }> {
  if (!input.policy.evalInput) {
    throw new Error("Scheduled eval policy has no eval input.");
  }

  const parsed = managedQueryEvalInputSchema.parse({
    tenantId: input.policy.tenantId,
    ...input.policy.evalInput
  });
  const piiRedactionPolicy = await readPiiRedactionPolicyForWorker(
    input.piiRedactionPolicyRepository,
    parsed.tenantId
  );
  const results = [];

  for (const evalCase of parsed.cases) {
    const startedAt = Date.now();
    const candidates = await input.retrievalRepository.search({
      tenantId: parsed.tenantId,
      query: evalCase.query,
      limit: parsed.limit
    });
    const redactedQuery = redactText(evalCase.query, piiRedactionPolicy);
    const event = await input.retrievalRepository.recordRetrievalEvent({
      tenantId: parsed.tenantId,
      surface: "api",
      query: redactedQuery.text,
      resultCount: candidates.length,
      deniedCount: 0,
      latencyMs: Date.now() - startedAt,
      metadata: {
        queryKind: "managed-query-eval",
        scheduled: true,
        candidateCount: candidates.length,
        telemetryRedaction: {
          applied: redactedQuery.redacted,
          findings: redactedQuery.findings
        }
      }
    });
    const citations = dedupeCitations(candidates);
    const warnings = candidates.length ? [] : ["No permitted retrieval context matched the eval query."];

    results.push(evaluateManagedQueryCase(evalCase, {
      resultStableIds: uniqueStableIds(candidates),
      citationCount: citations.length,
      grounded: candidates.length > 0,
      telemetryEventId: event.id,
      warnings
    }));
  }

  const passedCount = results.filter((result) => result.passed).length;
  const passRate = calculatePassRate(passedCount, results.length);
  const tagResults = buildManagedQueryEvalTagResults(results);
  const overallThreshold = buildManagedQueryEvalThresholdResult({
    scope: "overall",
    tag: null,
    minimumPassRate: parsed.minimumPassRate,
    caseCount: results.length,
    passedCount,
    failedCount: results.length - passedCount
  });
  const tagThresholdResults = Object.entries(parsed.tagMinimumPassRates)
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
  const thresholdPassed = overallThreshold.passed && tagThresholdResults.every((result) => result.passed);
  const report = managedQueryEvalReportSchema.parse({
    ok: thresholdPassed,
    mode: "deterministic-retrieval",
    checkedAt: new Date().toISOString(),
    tenantId: parsed.tenantId,
    caseCount: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    passRate,
    minimumPassRate: parsed.minimumPassRate,
    thresholdPassed,
    tagResults,
    tagThresholdResults,
    results
  });
  const storedReport = redactManagedQueryEvalReportForWorker(report, piiRedactionPolicy);
  const evalRun = await input.evalRunRepository.recordRun({
    tenantId: report.tenantId,
    report: storedReport.report,
    metadata: {
      caseIds: report.results.map((result) => result.id),
      tagThresholdCount: report.tagThresholdResults.length,
      scheduled: true,
      evalReportRedaction: storedReport.redaction
    }
  });

  return {
    report,
    evalRunId: evalRun.id
  };
}

function redactManagedQueryEvalReportForWorker(
  report: ManagedQueryEvalReport,
  piiRedactionPolicy: PiiRedactionPolicy
): {
  report: ManagedQueryEvalReport;
  redaction: {
    applied: boolean;
    findings: Array<{ kind: string; count: number }>;
    queryCount: number;
  };
} {
  const findingsByKind = new Map<string, number>();
  let applied = false;
  const results = report.results.map((result) => {
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
      ...report,
      results
    }),
    redaction: {
      applied,
      findings: Array.from(findingsByKind, ([kind, count]) => ({ kind, count })),
      queryCount: report.results.length
    }
  };
}

async function readPiiRedactionPolicyForWorker(
  repository: PostgresPiiRedactionPolicyRepository,
  tenantId: string
): Promise<PiiRedactionPolicy> {
  try {
    return await repository.getPolicy(tenantId);
  } catch {
    return defaultPiiRedactionPolicy(tenantId);
  }
}

function isManagedQueryEvalSchedulePolicyDue(policy: ManagedQueryEvalSchedulePolicy, asOf: string): boolean {
  if (!policy.enabled || !policy.evalInput) {
    return false;
  }

  if (!policy.lastRunAt) {
    return true;
  }

  return Date.parse(policy.lastRunAt) + policy.intervalMinutes * 60_000 <= Date.parse(asOf);
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
        ? "pass_rate_below_threshold"
        : "no_cases_for_threshold"
  };
}

function calculatePassRate(passedCount: number, caseCount: number): number {
  return caseCount === 0 ? 0 : passedCount / caseCount;
}

function uniqueStableIds(results: SearchResult[]): string[] {
  return Array.from(new Set(results.map((result) => result.asset.stableId)));
}

function dedupeCitations(results: SearchResult[]) {
  const seen = new Set<string>();
  const citations = [];

  for (const result of results) {
    const key = `${result.citation.stableId}:${result.citation.chunkId}`;

    if (!seen.has(key)) {
      seen.add(key);
      citations.push(result.citation);
    }
  }

  return citations;
}

function createNotificationDeliveryResult(input: {
  dryRun: boolean;
  webhookUrl?: string;
  signingSecret?: string;
  timeoutMs: number;
}): ApiKeyRotationReminderNotificationDeliveryResult {
  return {
    enabled: Boolean(input.webhookUrl),
    dryRun: input.dryRun,
    signingEnabled: Boolean(input.signingSecret),
    timeoutMs: input.timeoutMs,
    attemptedCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    skippedDryRunCount: 0,
    skippedDuplicateCount: 0,
    skippedNoWebhookCount: 0
  };
}

function buildApiKeyRotationReminderNotificationPayload(input: {
  report: ApiKeyRotationReport;
  dedupeWindowHours: number;
  deliveryId: string;
}): ApiKeyRotationReminderNotificationPayload {
  return {
    event: "forgetbase.api_key_rotation_reminders",
    version: 1,
    deliveryId: input.deliveryId,
    generatedAt: new Date().toISOString(),
    tenantId: input.report.tenantId,
    asOf: input.report.asOf,
    dueBefore: input.report.dueBefore,
    dueWithinDays: input.report.dueWithinDays,
    includeUserKeys: input.report.includeUserKeys,
    includeRevoked: input.report.includeRevoked,
    dedupeWindowHours: input.dedupeWindowHours,
    reminderCount: input.report.reminders.length,
    states: countRotationStates(input.report),
    reminders: input.report.reminders.map((reminder) => ({
      apiKeyId: reminder.apiKey.id,
      apiKeyName: reminder.apiKey.name,
      ownerType: reminder.ownerType,
      userId: reminder.apiKey.userId,
      serviceAccountId: reminder.apiKey.serviceAccountId,
      scopes: reminder.apiKey.scopes,
      expiresAt: reminder.apiKey.expiresAt,
      lastUsedAt: reminder.apiKey.lastUsedAt,
      revokedAt: reminder.apiKey.revokedAt,
      createdAt: reminder.apiKey.createdAt,
      rotationState: reminder.rotationState,
      daysUntilExpiry: reminder.daysUntilExpiry,
      reason: reminder.reason
    }))
  };
}

async function sendApiKeyRotationReminderWebhook(
  input: ApiKeyRotationReminderNotificationSendInput
): Promise<void> {
  const body = JSON.stringify(input.payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "forgetbase-worker/0.1",
    "x-forgetbase-event": input.payload.event,
    "x-forgetbase-delivery-id": input.payload.deliveryId
  };

  if (input.signingSecret) {
    headers["x-forgetbase-signature"] = `sha256=${createHmac("sha256", input.signingSecret)
      .update(body)
      .digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs);

  try {
    const response = await fetch(input.webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed with HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function countRotationStates(report: ApiKeyRotationReport): Record<string, number> {
  return report.reminders.reduce<Record<string, number>>((counts, reminder) => {
    counts[reminder.rotationState] = (counts[reminder.rotationState] ?? 0) + 1;
    return counts;
  }, {});
}

function buildRotationReminderFingerprint(report: ApiKeyRotationReport): string {
  return report.reminders
    .map((reminder) => `${reminder.apiKey.id}:${reminder.rotationState}`)
    .sort()
    .join("|");
}

async function hasRecentRotationReminderAuditEvent(input: {
  authRepository: PostgresAuthRepository;
  report: ApiKeyRotationReport;
  reminderFingerprint: string;
  asOf: string;
  dedupeWindowHours: number;
}): Promise<boolean> {
  if (input.dedupeWindowHours <= 0) {
    return false;
  }

  const cutoffMs = Date.parse(input.asOf) - input.dedupeWindowHours * 60 * 60 * 1000;
  const events = await input.authRepository.listAuditEvents({
    tenantId: input.report.tenantId,
    limit: 200
  });

  return events.some((event) =>
    event.action === "auth.api_key.rotation_reminder" &&
    event.outcome === "success" &&
    event.targetId === input.report.tenantId &&
    Date.parse(event.createdAt) >= cutoffMs &&
    readRotationReminderFingerprint(event) === input.reminderFingerprint
  );
}

function readRotationReminderFingerprint(event: AuditEvent): string | null {
  const direct = event.metadata.reminderFingerprint;

  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  const apiKeys = event.metadata.apiKeys;

  if (!Array.isArray(apiKeys)) {
    return null;
  }

  const parts = apiKeys
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const apiKeyId = "apiKeyId" in item ? item.apiKeyId : null;
      const rotationState = "rotationState" in item ? item.rotationState : null;

      return typeof apiKeyId === "string" && typeof rotationState === "string"
        ? `${apiKeyId}:${rotationState}`
        : null;
    })
    .filter((part): part is string => part !== null)
    .sort();

  return parts.length > 0 ? parts.join("|") : null;
}

function toIsoDateTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeWebhookUrl(value: string | undefined): string | undefined {
  const trimmed = readOptionalString(value);

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    return url.toString();
  } catch {
    throw new Error("API key rotation reminder webhook URL must be a valid http or https URL.");
  }
}

function readOptionalEnv(name: string): string | undefined {
  return readOptionalString(process.env[name]);
}

function readOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readStringArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;

  return readOptionalString(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readPositiveIntegerEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readNonNegativeIntegerEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function readPositiveIntegerArg(name: string, defaultValue: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readNonNegativeIntegerArg(name: string, defaultValue: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}
