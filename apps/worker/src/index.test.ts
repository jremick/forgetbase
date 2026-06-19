import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool,
  PostgresAgentActionExecutionRepository,
  PostgresAuthRepository,
  PostgresManagedQueryEvalRunRepository,
  PostgresManagedQueryEvalSchedulePolicyRepository,
  PostgresRegistryRepository,
  PostgresRetrievalRepository,
  runMigrations
} from "@forgetbase/db";
import {
  runActionApprovalExpiryMaintenance,
  runApiKeyRotationReminderMaintenance,
  runManagedQueryEvalScheduleMaintenance
} from "./index.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("worker API key rotation reminder maintenance", () => {
  let pool: ReturnType<typeof createPool>;
  let previousDatabaseUrl: string | undefined;

  beforeAll(async () => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    pool = createPool();
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("dry-runs rotation reminders and writes audit events only when executed", async () => {
    const authRepository = new PostgresAuthRepository(pool);
    const suffix = Date.now();
    const tenantId = `tenant_worker_rotation_${suffix}`;
    await authRepository.upsertServiceAccountPolicy({
      tenantId,
      maxServiceAccounts: 5,
      maxActiveApiKeysPerServiceAccount: 5,
      defaultApiKeyExpiresInDays: null
    });
    const serviceAccount = await authRepository.createServiceAccount({
      tenantId,
      slug: `rotation-worker-${suffix}`,
      name: "Rotation Worker",
      role: "reader"
    });
    const serviceKey = await authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "rotation-worker-key",
      scopes: ["asset:read"],
      expiresAt: "2026-06-20T00:00:00.000Z"
    });
    const deliveries: Array<{
      webhookUrl: string;
      signingSecret?: string;
      timeoutMs: number;
      payload: unknown;
    }> = [];
    const notificationSender = async (delivery: {
      webhookUrl: string;
      signingSecret?: string;
      timeoutMs: number;
      payload: unknown;
    }) => {
      deliveries.push(delivery);
    };

    expect(serviceKey).not.toBeNull();

    const dryRun = await runApiKeyRotationReminderMaintenance({
      dryRun: true,
      tenantIds: [tenantId],
      asOf: "2026-06-16T00:00:00.000Z",
      dueWithinDays: 7,
      notificationWebhookUrl: "https://notify.example.test/hooks/key-rotation",
      notificationWebhookSigningSecret: "test-signing-secret",
      notificationWebhookTimeoutMs: 1234,
      notificationSender
    });

    expect(dryRun).toMatchObject({
      dryRun: true,
      tenantCount: 1,
      reminderCount: 1,
      auditEventCount: 0,
      skippedDuplicateCount: 0,
      notificationDelivery: {
        enabled: true,
        dryRun: true,
        signingEnabled: true,
        timeoutMs: 1234,
        attemptedCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        skippedDryRunCount: 1
      }
    });
    expect(deliveries).toHaveLength(0);
    expect((await authRepository.listAuditEvents({ tenantId })).map((event) => event.action)).not.toContain(
      "auth.api_key.rotation_reminder"
    );

    const executed = await runApiKeyRotationReminderMaintenance({
      dryRun: false,
      tenantIds: [tenantId],
      asOf: "2026-06-16T00:00:00.000Z",
      dueWithinDays: 7,
      notificationWebhookUrl: "https://notify.example.test/hooks/key-rotation",
      notificationWebhookSigningSecret: "test-signing-secret",
      notificationWebhookTimeoutMs: 1234,
      notificationSender
    });

    expect(executed).toMatchObject({
      dryRun: false,
      tenantCount: 1,
      reminderCount: 1,
      auditEventCount: 1,
      skippedDuplicateCount: 0,
      notificationDelivery: {
        enabled: true,
        dryRun: false,
        signingEnabled: true,
        timeoutMs: 1234,
        attemptedCount: 1,
        deliveredCount: 1,
        failedCount: 0
      }
    });
    expect(deliveries).toHaveLength(1);

    const delivered = deliveries[0];
    const payload = delivered?.payload as {
      event?: string;
      tenantId?: string;
      reminderCount?: number;
      reminders?: Array<Record<string, unknown>>;
    };
    const deliveredJson = JSON.stringify(delivered?.payload);

    expect(delivered?.webhookUrl).toBe("https://notify.example.test/hooks/key-rotation");
    expect(delivered?.signingSecret).toBe("test-signing-secret");
    expect(delivered?.timeoutMs).toBe(1234);
    expect(payload).toMatchObject({
      event: "forgetbase.api_key_rotation_reminders",
      tenantId,
      reminderCount: 1
    });
    expect(payload.reminders?.[0]).toMatchObject({
      apiKeyId: serviceKey?.apiKey.id,
      apiKeyName: "rotation-worker-key",
      ownerType: "service-account",
      serviceAccountId: serviceAccount.id,
      rotationState: "due-soon",
      daysUntilExpiry: 4,
      reason: "api_key_expires_within_window"
    });
    expect(Object.prototype.hasOwnProperty.call(payload.reminders?.[0] ?? {}, "secretPreview")).toBe(false);
    expect(deliveredJson).toContain(serviceKey?.apiKey.id);
    expect(deliveredJson).not.toContain(serviceKey?.secret);
    expect(deliveredJson).not.toContain(serviceKey?.apiKey.secretPreview);

    const auditEvent = (await authRepository.listAuditEvents({ tenantId }))
      .find((event) => event.action === "auth.api_key.rotation_reminder");

    expect(auditEvent).toBeTruthy();
    expect(auditEvent?.metadata).toMatchObject({
      dueWithinDays: 7,
      dedupeWindowHours: 24,
      reminderCount: 1,
      states: {
        "due-soon": 1
      },
      reminderFingerprint: `${serviceKey?.apiKey.id}:due-soon`
    });
    expect(JSON.stringify(auditEvent?.metadata)).toContain(serviceKey?.apiKey.id);
    expect(JSON.stringify(auditEvent?.metadata)).not.toContain(serviceKey?.secret);
    expect(JSON.stringify(auditEvent?.metadata)).not.toContain(serviceKey?.apiKey.secretPreview);

    const duplicateSkipped = await runApiKeyRotationReminderMaintenance({
      dryRun: false,
      tenantIds: [tenantId],
      asOf: "2026-06-16T00:00:00.000Z",
      dueWithinDays: 7,
      notificationWebhookUrl: "https://notify.example.test/hooks/key-rotation",
      notificationSender
    });

    expect(duplicateSkipped).toMatchObject({
      dryRun: false,
      tenantCount: 1,
      reminderCount: 1,
      auditEventCount: 0,
      skippedDuplicateCount: 1,
      notificationDelivery: {
        attemptedCount: 0,
        deliveredCount: 0,
        skippedDuplicateCount: 1
      }
    });
    expect(deliveries).toHaveLength(1);

    const dedupeDisabled = await runApiKeyRotationReminderMaintenance({
      dryRun: false,
      tenantIds: [tenantId],
      asOf: "2026-06-16T00:00:00.000Z",
      dueWithinDays: 7,
      dedupeWindowHours: 0
    });

    expect(dedupeDisabled).toMatchObject({
      dryRun: false,
      tenantCount: 1,
      reminderCount: 1,
      auditEventCount: 1,
      skippedDuplicateCount: 0
    });

    expect((await authRepository.listAuditEvents({ tenantId, limit: 20 }))
      .filter((event) => event.action === "auth.api_key.rotation_reminder")).toHaveLength(2);
  });

  it("dry-runs and executes due managed query eval schedule policies", async () => {
    const authRepository = new PostgresAuthRepository(pool);
    const registryRepository = new PostgresRegistryRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool);
    const scheduleRepository = new PostgresManagedQueryEvalSchedulePolicyRepository(pool);
    const evalRunRepository = new PostgresManagedQueryEvalRunRepository(pool);
    const suffix = Date.now();
    const tenantId = `tenant_worker_eval_${suffix}`;
    const detail = await registryRepository.createAsset({
      tenantId,
      stableId: `policy.worker-eval-${suffix}`,
      type: "policy",
      ownerId: "user_admin",
      title: "Worker Eval Policy",
      summary: "Scheduled eval citations for worker quality checks.",
      lifecycleState: "active",
      sensitivity: "internal",
      audience: ["ai-team"],
      status: "approved",
      reviewDueAt: "2027-06-17",
      sourceKind: "test",
      allowedSurfaces: ["api", "cli", "mcp", "web"],
      allowedExports: [],
      allowedActions: [],
      instruction: {
        instructionKind: "policy",
        body: "Scheduled eval citations should find this worker policy."
      }
    });

    await retrievalRepository.indexAsset(detail);
    await scheduleRepository.upsertPolicy({
      tenantId,
      enabled: true,
      intervalMinutes: 60,
      evalInput: {
        minimumPassRate: 1,
        tagMinimumPassRates: {
          "citation-accuracy": 1
        },
        cases: [
          {
            id: "eval.worker-schedule",
            query: "scheduled eval citations worker policy",
            expectedStableIds: [`policy.worker-eval-${suffix}`],
            requiredCitationCount: 1,
            tags: ["citation-accuracy"]
          }
        ]
      }
    });

    const dryRun = await runManagedQueryEvalScheduleMaintenance({
      dryRun: true,
      tenantIds: [tenantId],
      now: "2026-06-17T00:00:00.000Z"
    });

    expect(dryRun).toMatchObject({
      dryRun: true,
      duePolicyCount: 1,
      attemptedRunCount: 0,
      evalRunCount: 0
    });

    const executed = await runManagedQueryEvalScheduleMaintenance({
      dryRun: false,
      tenantIds: [tenantId],
      now: "2026-06-17T00:00:00.000Z"
    });

    expect(executed).toMatchObject({
      dryRun: false,
      duePolicyCount: 1,
      attemptedRunCount: 1,
      evalRunCount: 1,
      passedRunCount: 1,
      failedRunCount: 0,
      errorRunCount: 0
    });
    expect(executed.results[0]).toMatchObject({
      tenantId,
      status: "passed",
      caseCount: 1,
      passedCount: 1,
      failedCount: 0,
      passRate: 1,
      thresholdPassed: true
    });

    const policy = await scheduleRepository.getPolicy(tenantId);
    expect(policy.lastStatus).toBe("passed");
    expect(policy.lastEvalRunId).toBe(executed.results[0]?.evalRunId);

    const runs = await evalRunRepository.listRuns({ tenantId });
    expect(runs[0]?.id).toBe(executed.results[0]?.evalRunId);
    expect(runs[0]?.metadata.scheduled).toBe(true);

    const auditEvent = (await authRepository.listAuditEvents({ tenantId }))
      .find((event) => event.action === "agent.eval.scheduled_run");
    expect(auditEvent?.metadata).toMatchObject({
      evalRunId: executed.results[0]?.evalRunId,
      caseCount: 1,
      passedCount: 1,
      thresholdPassed: true
    });

    const notDue = await runManagedQueryEvalScheduleMaintenance({
      dryRun: true,
      tenantIds: [tenantId],
      now: "2026-06-17T00:30:00.000Z"
    });
    expect(notDue.duePolicyCount).toBe(0);
  });

  it("dry-runs and expires stale action approvals", async () => {
    const authRepository = new PostgresAuthRepository(pool);
    const actionExecutionRepository = new PostgresAgentActionExecutionRepository(pool);
    const suffix = Date.now();
    const tenantId = `tenant_worker_action_expiry_${suffix}`;
    await actionExecutionRepository.upsertPolicy({
      tenantId,
      enabled: true,
      allowedActionTypes: ["create-task-record"],
      requireApproval: true,
      dryRunDefault: false,
      killSwitch: false,
      maxRequestsPerHour: 10,
      approvalExpiresInMinutes: 1
    });
    const expiredRequest = await actionExecutionRepository.createRequest({
      tenantId,
      actionType: "create-task-record",
      title: "Worker expired approval",
      dryRun: false,
      status: "approval-required",
      reason: "approval_required",
      policySnapshot: {
        enabled: true,
        requireApproval: true,
        approvalExpiresInMinutes: 1
      },
      approvalExpiresAt: "2026-06-17T00:00:00.000Z"
    });
    const futureRequest = await actionExecutionRepository.createRequest({
      tenantId,
      actionType: "create-task-record",
      title: "Worker future approval",
      dryRun: false,
      status: "approval-required",
      reason: "approval_required",
      policySnapshot: {
        enabled: true,
        requireApproval: true,
        approvalExpiresInMinutes: 1
      },
      approvalExpiresAt: "2026-06-18T00:00:00.000Z"
    });

    const dryRun = await runActionApprovalExpiryMaintenance({
      dryRun: true,
      tenantIds: [tenantId],
      now: "2026-06-17T00:00:01.000Z"
    });

    expect(dryRun).toMatchObject({
      dryRun: true,
      tenantCount: 1,
      candidateCount: 1,
      expiredCount: 0,
      results: [
        {
          tenantId,
          actionRequestId: expiredRequest.id,
          actionType: "create-task-record",
          approvalExpiresAt: "2026-06-17T00:00:00.000Z",
          status: "approval-required",
          expired: false
        }
      ]
    });
    expect(await actionExecutionRepository.getRequest(tenantId, expiredRequest.id)).toMatchObject({
      status: "approval-required"
    });

    const executed = await runActionApprovalExpiryMaintenance({
      dryRun: false,
      tenantIds: [tenantId],
      now: "2026-06-17T00:00:01.000Z"
    });

    expect(executed).toMatchObject({
      dryRun: false,
      tenantCount: 1,
      candidateCount: 1,
      expiredCount: 1,
      results: [
        {
          tenantId,
          actionRequestId: expiredRequest.id,
          actionType: "create-task-record",
          approvalExpiresAt: "2026-06-17T00:00:00.000Z",
          status: "expired",
          expired: true
        }
      ]
    });
    expect(await actionExecutionRepository.getRequest(tenantId, expiredRequest.id)).toMatchObject({
      status: "expired",
      reason: "approval_expired",
      result: {
        approved: false,
        expired: true,
        externalSideEffects: false
      },
      executedAt: null
    });
    expect(await actionExecutionRepository.getRequest(tenantId, futureRequest.id)).toMatchObject({
      status: "approval-required"
    });

    const auditEvent = (await authRepository.listAuditEvents({ tenantId }))
      .find((event) => event.action === "agent.action.approval_expiry");
    expect(auditEvent).toMatchObject({
      outcome: "denied",
      reason: "approval_expired",
      targetId: expiredRequest.id,
      metadata: {
        actionType: "create-task-record",
        approvalExpiresAt: "2026-06-17T00:00:00.000Z",
        expiredAt: "2026-06-17T00:00:01.000Z",
        externalSideEffects: false
      }
    });

    const rerun = await runActionApprovalExpiryMaintenance({
      dryRun: false,
      tenantIds: [tenantId],
      now: "2026-06-17T00:00:01.000Z"
    });
    expect(rerun).toMatchObject({
      candidateCount: 0,
      expiredCount: 0
    });
  });
});
