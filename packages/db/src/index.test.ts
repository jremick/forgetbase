import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { AssetCreateInput, ManagedQueryEvalReport } from "@agentic-cms/schema";
import {
  InMemoryAgentActionExecutionRepository,
  InMemoryAuthRepository,
  InMemoryAuthProviderConfigRepository,
  InMemoryManagedQueryEvalRunRepository,
  InMemoryManagedQueryEvalSchedulePolicyRepository,
  InMemoryManagedQueryCachePolicyRepository,
  InMemoryManagedQueryCacheRepository,
  InMemoryManagedQueryFeedbackRepository,
  InMemoryManagedQueryPolicyRepository,
  InMemoryManagedQueryRetentionPolicyRepository,
  InMemoryModelProviderConfigRepository,
  InMemoryRetrievalRankingPolicyRepository,
  InMemoryRetrievalRepository,
  InMemoryRegistryRepository,
  InMemorySecretReferencePolicyRepository,
  InMemoryTelemetryRetentionPolicyRepository,
  PostgresAgentActionExecutionRepository,
  PostgresAuthRepository,
  PostgresAuthProviderConfigRepository,
  PostgresManagedQueryEvalRunRepository,
  PostgresManagedQueryEvalSchedulePolicyRepository,
  PostgresManagedQueryCachePolicyRepository,
  PostgresManagedQueryCacheRepository,
  PostgresManagedQueryFeedbackRepository,
  PostgresManagedQueryPolicyRepository,
  PostgresManagedQueryRetentionPolicyRepository,
  PostgresModelProviderConfigRepository,
  PostgresRetrievalRankingPolicyRepository,
  PostgresRetrievalRepository,
  PostgresRegistryRepository,
  PostgresSecretReferencePolicyRepository,
  PostgresTelemetryRetentionPolicyRepository,
  ServiceAccountPolicyViolationError,
  isSecretEnvVarAllowed,
  purgeTelemetryForRetentionPolicy,
  runMigrations,
  type AuthRepository,
  type RegistryRepository
} from "./index.js";

const sampleAsset = {
  stableId: "guardrail.context-boundaries",
  type: "guardrail",
  ownerId: "user_admin",
  title: "Context Boundary Guardrail",
  lifecycleState: "active",
  sensitivity: "internal",
  audience: ["ai-team"],
  status: "approved",
  reviewDueAt: "2027-01-31",
  sourceKind: "synthetic-demo",
  allowedSurfaces: ["api", "cli", "mcp", "web"],
  instruction: {
    instructionKind: "guardrail",
    body: "Keep model context inside the requested tenant and asset permissions."
  },
  humanDocument: {
    format: "markdown",
    body: "# Context Boundary Guardrail\n\nUse tenant and asset permissions before retrieval."
  }
} satisfies AssetCreateInput;

function sampleEvalReport(tenantId = "tenant_demo"): ManagedQueryEvalReport {
  return {
    ok: true,
    mode: "deterministic-retrieval",
    checkedAt: new Date("2026-06-17T00:00:00.000Z").toISOString(),
    tenantId,
    caseCount: 1,
    passedCount: 1,
    failedCount: 0,
    passRate: 1,
    minimumPassRate: 1,
    thresholdPassed: true,
    tagResults: [
      {
        tag: "citation-accuracy",
        caseCount: 1,
        passedCount: 1,
        failedCount: 0,
        passRate: 1
      }
    ],
    tagThresholdResults: [
      {
        scope: "tag",
        tag: "citation-accuracy",
        minimumPassRate: 1,
        passRate: 1,
        caseCount: 1,
        passedCount: 1,
        failedCount: 0,
        passed: true,
        reason: null
      }
    ],
    results: [
      {
        id: "eval.citation-accuracy",
        query: "citation accuracy",
        passed: true,
        resultStableIds: ["guardrail.context-boundaries"],
        missingStableIds: [],
        expectedStableIds: ["guardrail.context-boundaries"],
        requiredCitationCount: 1,
        citationCount: 1,
        grounded: true,
        tags: ["citation-accuracy"],
        telemetryEventId: "retrieval_eval_1",
        warnings: []
      }
    ]
  };
}

describe("InMemoryRegistryRepository", () => {
  it("creates, lists, and fetches governed assets", async () => {
    const repository: RegistryRepository = new InMemoryRegistryRepository();

    const created = await repository.createAsset(sampleAsset);
    const list = await repository.listAssets();
    const fetched = await repository.getAssetByStableId(sampleAsset.stableId);

    expect(created.asset.stableId).toBe(sampleAsset.stableId);
    expect(created.versions).toHaveLength(1);
    expect(created.instructionObjects[0]?.body).toContain("tenant");
    expect(list.map((asset) => asset.stableId)).toEqual([sampleAsset.stableId]);
    expect(fetched?.humanDocuments[0]?.format).toBe("markdown");
  });

  it("creates new asset versions and restores prior content", async () => {
    const repository: RegistryRepository = new InMemoryRegistryRepository();
    await repository.createAsset(sampleAsset);

    const updated = await repository.updateAsset(sampleAsset.stableId, {
      instruction: {
        instructionKind: "guardrail",
        body: "Updated context boundary instruction."
      },
      changeNote: "Update instruction"
    });

    expect(updated?.versions.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(updated?.instructionObjects).toHaveLength(1);
    expect(updated?.instructionObjects[0]?.body).toContain("Updated");
    expect(updated?.humanDocuments[0]?.body).toContain("tenant and asset permissions");

    const versionOne = await repository.getAssetVersionSnapshot(sampleAsset.stableId, {
      versionNumber: 1
    });
    const versionTwo = await repository.getAssetVersionSnapshot(sampleAsset.stableId, {
      versionNumber: 2
    });

    expect(versionOne?.instructionObjects[0]?.body).toContain("Keep model context");
    expect(versionTwo?.instructionObjects[0]?.body).toContain("Updated context");
    expect(versionTwo?.humanDocuments[0]?.body).toContain("tenant and asset permissions");

    const restored = await repository.restoreAssetVersion(sampleAsset.stableId, {
      versionNumber: 1
    });

    expect(restored?.asset.currentVersionId).toBe(restored?.versions.find((version) => version.versionNumber === 1)?.id);
    expect(restored?.instructionObjects[0]?.body).toContain("Keep model context");
  });

  it("publishes draft assets without creating a new content version", async () => {
    const repository: RegistryRepository = new InMemoryRegistryRepository();
    await repository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.publish-draft",
      lifecycleState: "draft",
      status: "reviewing"
    });

    const published = await repository.publishAsset("guardrail.publish-draft", {
      reviewDueAt: "2027-06-30",
      changeNote: "Approve draft"
    });

    expect(published?.asset.lifecycleState).toBe("active");
    expect(published?.asset.status).toBe("approved");
    expect(published?.asset.reviewDueAt).toBe("2027-06-30");
    expect(published?.versions).toHaveLength(1);

    const reviewStableId = `guardrail.review-${Date.now()}`;
    await repository.createAsset({
      ...sampleAsset,
      stableId: reviewStableId,
      tenantId: "tenant_test",
      status: "reviewing",
      reviewDueAt: "2026-01-31"
    });
    const reviewQueue = await repository.listAssetsNeedingReview({
      tenantId: "tenant_test",
      asOf: "2026-06-16"
    });
    const reviewed = await repository.reviewAsset(reviewStableId, {
      tenantId: "tenant_test",
      status: "approved",
      reviewDueAt: "2027-07-31"
    });
    const nextReviewQueue = await repository.listAssetsNeedingReview({
      tenantId: "tenant_test",
      asOf: "2026-06-16"
    });

    expect(reviewQueue.assets.map((asset) => asset.stableId)).toContain(reviewStableId);
    expect(reviewed?.asset.status).toBe("approved");
    expect(reviewed?.asset.reviewDueAt).toBe("2027-07-31");
    expect(reviewed?.versions).toHaveLength(1);
    expect(nextReviewQueue.assets.map((asset) => asset.stableId)).not.toContain(reviewStableId);
  });

  it("lists assets needing review and completes review without creating a new content version", async () => {
    const repository: RegistryRepository = new InMemoryRegistryRepository();
    await repository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.review-due",
      status: "reviewing",
      reviewDueAt: "2026-01-31"
    });

    const queue = await repository.listAssetsNeedingReview({
      asOf: "2026-06-16"
    });

    expect(queue.assets.map((asset) => asset.stableId)).toEqual(["guardrail.review-due"]);

    const reviewed = await repository.reviewAsset("guardrail.review-due", {
      status: "approved",
      reviewDueAt: "2027-06-30",
      changeNote: "Reviewed current guidance"
    });
    const nextQueue = await repository.listAssetsNeedingReview({
      asOf: "2026-06-16"
    });

    expect(reviewed?.asset.status).toBe("approved");
    expect(reviewed?.asset.reviewDueAt).toBe("2027-06-30");
    expect(reviewed?.versions).toHaveLength(1);
    expect(nextQueue.assets).toHaveLength(0);
  });
});

describe("InMemoryAuthRepository", () => {
  it("authenticates API keys and enforces document-level grants", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository: AuthRepository = new InMemoryAuthRepository();
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.restricted-context",
      sensitivity: "restricted"
    });
    const user = await authRepository.createUser({
      email: "reader@example.test",
      displayName: "Reader",
      role: "reader"
    });

    expect((await authRepository.listUsers()).map((listedUser) => listedUser.id)).toContain(user.id);

    const apiKey = requireTestValue(await authRepository.createApiKey({
      userId: user.id,
      name: "reader-key",
      scopes: ["asset:read"]
    }));
    const principal = await authRepository.authenticateApiKey(apiKey.secret);

    expect(await authRepository.canAccessAsset({
      principal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    const group = await authRepository.createGroup({
      slug: "ai-readers",
      name: "AI Readers"
    });
    const member = await authRepository.addGroupMember({
      groupId: group.id,
      userId: user.id
    });
    const groupedPrincipal = await authRepository.authenticateApiKey(apiKey.secret);

    expect(member?.userEmail).toBe(user.email);
    expect(groupedPrincipal?.groupIds).toContain(group.id);

    await authRepository.createPermissionGrant({
      stableId: asset.asset.stableId,
      principalType: "group",
      principalId: group.id,
      action: "read",
      surfaces: ["api", "mcp"]
    });

    expect(await authRepository.canAccessAsset({
      principal: groupedPrincipal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(true);

    const removedMember = await authRepository.removeGroupMember({
      groupId: group.id,
      userId: user.id
    });
    const principalAfterRemoval = await authRepository.authenticateApiKey(apiKey.secret);

    expect(removedMember?.userId).toBe(user.id);
    expect(principalAfterRemoval?.groupIds).not.toContain(group.id);
    expect(await authRepository.canAccessAsset({
      principal: principalAfterRemoval,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    await authRepository.addGroupMember({
      groupId: group.id,
      userId: user.id
    });
    const deletedGroup = await authRepository.deleteGroup({ groupId: group.id });
    const principalAfterGroupDelete = await authRepository.authenticateApiKey(apiKey.secret);

    expect(deletedGroup?.id).toBe(group.id);
    expect((await authRepository.listGroups()).map((listedGroup) => listedGroup.id)).not.toContain(group.id);
    expect(await authRepository.listGroupMembers({ groupId: group.id })).toEqual([]);
    expect(principalAfterGroupDelete?.groupIds).not.toContain(group.id);
    expect(await authRepository.canAccessAsset({
      principal: principalAfterGroupDelete,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    const listedKeys = await authRepository.listApiKeys();
    expect(listedKeys.map((listedKey) => listedKey.id)).toContain(apiKey.apiKey.id);
    const revoked = await authRepository.revokeApiKey({ apiKeyId: apiKey.apiKey.id });

    expect(revoked?.revokedAt).toBeTruthy();
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
  });

  it("updates local users and disables password and API key authentication", async () => {
    const authRepository: AuthRepository = new InMemoryAuthRepository();
    const user = await authRepository.createUser({
      email: "local-user-update@example.test",
      displayName: "Local User",
      role: "reader",
      password: "initial-password-123"
    });
    const apiKey = requireTestValue(await authRepository.createApiKey({
      userId: user.id,
      name: "local-user-key",
      scopes: ["asset:read"]
    }));

    expect(await authRepository.authenticateLocalUser("tenant_demo", user.email, "initial-password-123")).not.toBeNull();
    expect(await authRepository.authenticateApiKey(apiKey.secret)).not.toBeNull();

    const updated = await authRepository.updateUser({
      userId: user.id,
      displayName: "Updated Local User",
      role: "maintainer",
      password: "updated-password-123"
    });

    expect(updated?.displayName).toBe("Updated Local User");
    expect(updated?.role).toBe("maintainer");
    expect(await authRepository.authenticateLocalUser("tenant_demo", user.email, "initial-password-123")).toBeNull();
    expect(await authRepository.authenticateLocalUser("tenant_demo", user.email, "updated-password-123")).not.toBeNull();

    const disabled = await authRepository.updateUser({
      userId: user.id,
      status: "disabled"
    });

    expect(disabled?.status).toBe("disabled");
    expect(await authRepository.authenticateLocalUser("tenant_demo", user.email, "updated-password-123")).toBeNull();
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
  });

  it("tracks and revokes login sessions with their API keys", async () => {
    const authRepository: AuthRepository = new InMemoryAuthRepository();
    const user = await authRepository.createUser({
      email: "session-user@example.test",
      displayName: "Session User",
      role: "reader",
      password: "session-password-123"
    });
    const apiKey = requireTestValue(await authRepository.createApiKey({
      userId: user.id,
      name: "session-key",
      scopes: ["asset:read"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }));
    const absoluteExpiresAt = new Date(Date.now() + 90_000).toISOString();
    const session = await authRepository.createLoginSession({
      userId: user.id,
      apiKeyId: apiKey.apiKey.id,
      source: "password",
      deviceLabel: "Work laptop",
      clientUserAgent: "AgenticCMSRepositoryTest/1.0",
      expiresAt: apiKey.apiKey.expiresAt ?? "",
      absoluteExpiresAt
    });

    expect(session?.apiKeyId).toBe(apiKey.apiKey.id);
    expect(session?.deviceLabel).toBe("Work laptop");
    expect(session?.clientUserAgent).toBe("AgenticCMSRepositoryTest/1.0");
    expect(session?.absoluteExpiresAt).toBe(absoluteExpiresAt);
    expect((await authRepository.listLoginSessions({ userId: user.id })).map((candidate) => candidate.id))
      .toContain(session?.id);
    expect(await authRepository.findActiveLoginSessionByApiKeyId({
      apiKeyId: apiKey.apiKey.id,
      idleTimeoutSeconds: 0
    })).toBeNull();
    expect(await authRepository.findActiveLoginSessionByApiKeyId({ apiKeyId: apiKey.apiKey.id }))
      .toMatchObject({ id: session?.id, lastSeenAt: expect.any(String) });

    const refreshToken = requireTestValue(await authRepository.createLoginSessionRefreshToken({
      loginSessionId: session?.id ?? "",
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    }));
    expect(Date.parse(refreshToken.expiresAt)).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    const refreshed = requireTestValue(await authRepository.refreshLoginSession({
      refreshToken: refreshToken.token,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString()
    }));

    expect(refreshed.session.id).toBe(session?.id);
    expect(refreshed.apiKey.id).not.toBe(apiKey.apiKey.id);
    expect(refreshed.session.apiKeyId).toBe(refreshed.apiKey.id);
    expect(refreshed.session.deviceLabel).toBe("Work laptop");
    expect(refreshed.session.clientUserAgent).toBe("AgenticCMSRepositoryTest/1.0");
    expect(Date.parse(refreshed.session.expiresAt)).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    expect(Date.parse(refreshed.apiKey.expiresAt ?? "")).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    expect(Date.parse(refreshed.refreshTokenExpiresAt)).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    expect(refreshed.refreshToken).toMatch(/^acms_refresh_/);
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
    expect(await authRepository.authenticateApiKey(refreshed.secret))
      .toMatchObject({ apiKeyId: refreshed.apiKey.id });
    expect(await authRepository.refreshLoginSession({
      refreshToken: refreshToken.token,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString()
    })).toBeNull();

    const revoked = await authRepository.revokeLoginSession({ sessionId: refreshed.session.id, userId: user.id });

    expect(revoked?.session.revokedAt).toBeTruthy();
    expect(revoked?.apiKey.revokedAt).toBeTruthy();
    expect(await authRepository.findActiveLoginSessionByApiKeyId({ apiKeyId: apiKey.apiKey.id })).toBeNull();
    expect(await authRepository.findActiveLoginSessionByApiKeyId({ apiKeyId: refreshed.apiKey.id })).toBeNull();
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
    expect(await authRepository.authenticateApiKey(refreshed.secret)).toBeNull();

    const expiredApiKey = requireTestValue(await authRepository.createApiKey({
      userId: user.id,
      name: "absolute-expired-session-key",
      scopes: ["asset:read"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }));
    const expiredSession = requireTestValue(await authRepository.createLoginSession({
      userId: user.id,
      apiKeyId: expiredApiKey.apiKey.id,
      source: "password",
      expiresAt: expiredApiKey.apiKey.expiresAt ?? "",
      absoluteExpiresAt: new Date(Date.now() - 1_000).toISOString()
    }));

    expect(await authRepository.findActiveLoginSessionByApiKeyId({
      apiKeyId: expiredApiKey.apiKey.id
    })).toBeNull();
    expect(await authRepository.createLoginSessionRefreshToken({
      loginSessionId: expiredSession.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })).toBeNull();
  });

  it("authenticates service account API keys and enforces direct service account grants", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository: AuthRepository = new InMemoryAuthRepository();
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.service-account-context",
      sensitivity: "restricted"
    });
    const serviceAccount = await authRepository.createServiceAccount({
      slug: "automation",
      name: "Automation",
      role: "reader"
    });

    expect((await authRepository.listServiceAccounts()).map((listed) => listed.id)).toContain(serviceAccount.id);

    const apiKey = requireTestValue(await authRepository.createApiKey({
      serviceAccountId: serviceAccount.id,
      name: "automation-key",
      scopes: ["asset:read"]
    }));
    const principal = await authRepository.authenticateApiKey(apiKey.secret);

    expect(apiKey.apiKey.userId).toBeNull();
    expect(apiKey.apiKey.serviceAccountId).toBe(serviceAccount.id);
    expect(principal?.principalType).toBe("service-account");
    expect(principal?.principalId).toBe(serviceAccount.id);
    expect(principal?.userId).toBeNull();
    expect(principal?.serviceAccountId).toBe(serviceAccount.id);
    expect(principal?.groupIds).toEqual([]);
    expect(await authRepository.canAccessAsset({
      principal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    await authRepository.createPermissionGrant({
      stableId: asset.asset.stableId,
      principalType: "service-account",
      principalId: serviceAccount.id,
      action: "read",
      surfaces: ["api", "mcp"]
    });

    expect(await authRepository.canAccessAsset({
      principal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(true);

    const event = await authRepository.recordAuditEvent({
      tenantId: serviceAccount.tenantId,
      actorServiceAccountId: serviceAccount.id,
      actorApiKeyId: apiKey.apiKey.id,
      action: "asset.read",
      targetType: "asset",
      targetId: asset.asset.id,
      outcome: "success"
    });

    expect(event.actorUserId).toBeNull();
    expect(event.actorServiceAccountId).toBe(serviceAccount.id);

    const disabled = await authRepository.updateServiceAccount({
      serviceAccountId: serviceAccount.id,
      status: "disabled"
    });

    expect(disabled?.status).toBe("disabled");
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
    expect(await authRepository.createApiKey({
      serviceAccountId: "missing-service-account",
      name: "missing-owner",
      scopes: ["asset:read"]
    })).toBeNull();
  });

  it("enforces service account policy limits and default service-key expiry", async () => {
    const authRepository: AuthRepository = new InMemoryAuthRepository();
    const tenantId = "tenant_service_policy_memory";
    const defaults = await authRepository.getServiceAccountPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      maxServiceAccounts: 50,
      maxActiveApiKeysPerServiceAccount: 5,
      defaultApiKeyExpiresInDays: 90,
      source: "default"
    });

    const stored = await authRepository.upsertServiceAccountPolicy({
      tenantId,
      maxServiceAccounts: 1,
      maxActiveApiKeysPerServiceAccount: 1,
      defaultApiKeyExpiresInDays: 30
    });

    expect(stored).toMatchObject({
      tenantId,
      maxServiceAccounts: 1,
      maxActiveApiKeysPerServiceAccount: 1,
      defaultApiKeyExpiresInDays: 30,
      source: "stored"
    });

    const serviceAccount = await authRepository.createServiceAccount({
      tenantId,
      slug: "automation",
      name: "Automation",
      role: "reader"
    });

    await expect(authRepository.createServiceAccount({
      tenantId,
      slug: "blocked-automation",
      name: "Blocked Automation",
      role: "reader"
    })).rejects.toBeInstanceOf(ServiceAccountPolicyViolationError);

    const apiKey = requireTestValue(await authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "automation-key",
      scopes: ["asset:read"]
    }));

    expect(apiKey.apiKey.expiresAt).toBeTruthy();
    await expect(authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "blocked-automation-key",
      scopes: ["asset:read"]
    })).rejects.toMatchObject({
      code: "max_active_api_keys_per_service_account_exceeded",
      limit: 1,
      tenantId,
      serviceAccountId: serviceAccount.id
    });
  });

  it("reports service API keys due for rotation without including user keys by default", async () => {
    const authRepository: AuthRepository = new InMemoryAuthRepository();
    const tenantId = "tenant_rotation_report_memory";
    await authRepository.upsertServiceAccountPolicy({
      tenantId,
      maxServiceAccounts: 5,
      maxActiveApiKeysPerServiceAccount: 5,
      defaultApiKeyExpiresInDays: null
    });
    const serviceAccount = await authRepository.createServiceAccount({
      tenantId,
      slug: "rotation-automation",
      name: "Rotation Automation",
      role: "reader"
    });
    const user = await authRepository.createUser({
      tenantId,
      email: "rotation-reader@example.test",
      displayName: "Rotation Reader",
      role: "reader"
    });
    const serviceDue = requireTestValue(await authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "service-due",
      scopes: ["asset:read"],
      expiresAt: "2026-06-20T00:00:00.000Z"
    }));
    const serviceMissingExpiry = requireTestValue(await authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "service-missing-expiry",
      scopes: ["asset:read"]
    }));
    const userDue = requireTestValue(await authRepository.createApiKey({
      tenantId,
      userId: user.id,
      name: "user-due",
      scopes: ["asset:read"],
      expiresAt: "2026-06-20T00:00:00.000Z"
    }));

    const report = await authRepository.getApiKeyRotationReport({
      tenantId,
      asOf: "2026-06-16T00:00:00.000Z",
      dueWithinDays: 7
    });

    expect(report.reminders.map((reminder) => reminder.apiKey.id)).toEqual(expect.arrayContaining([
      serviceDue.apiKey.id,
      serviceMissingExpiry.apiKey.id
    ]));
    expect(report.reminders.map((reminder) => reminder.apiKey.id)).not.toContain(userDue.apiKey.id);
    expect(report.reminders.find((reminder) => reminder.apiKey.id === serviceDue.apiKey.id)).toMatchObject({
      ownerType: "service-account",
      rotationState: "due-soon",
      daysUntilExpiry: 4
    });
    expect(report.reminders.find((reminder) => reminder.apiKey.id === serviceMissingExpiry.apiKey.id)).toMatchObject({
      ownerType: "service-account",
      rotationState: "missing-expiry",
      daysUntilExpiry: null
    });

    const withUserKeys = await authRepository.getApiKeyRotationReport({
      tenantId,
      asOf: "2026-06-16T00:00:00.000Z",
      dueWithinDays: 7,
      includeUserKeys: true
    });

    expect(withUserKeys.reminders.map((reminder) => reminder.apiKey.id)).toContain(userDue.apiKey.id);

    const tenantReports = await authRepository.listApiKeyRotationReports({
      asOf: "2026-06-16T00:00:00.000Z",
      dueWithinDays: 7,
      tenantIds: [tenantId]
    });

    expect(tenantReports).toHaveLength(1);
    expect(tenantReports[0]?.tenantId).toBe(tenantId);
    expect(tenantReports[0]?.reminders.map((reminder) => reminder.apiKey.id)).toEqual(expect.arrayContaining([
      serviceDue.apiKey.id,
      serviceMissingExpiry.apiKey.id
    ]));
  });
});

describe("InMemoryTelemetryRetentionPolicyRepository", () => {
  it("returns safer defaults and stores tenant policy overrides", async () => {
    const repository = new InMemoryTelemetryRetentionPolicyRepository();
    const defaults = await repository.getPolicy("tenant_retention_memory");

    expect(defaults).toMatchObject({
      tenantId: "tenant_retention_memory",
      retrievalEventRetentionDays: 30,
      auditEventRetentionDays: 365,
      feedbackRetentionDays: 90,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId: "tenant_retention_memory",
      retrievalEventRetentionDays: 14,
      auditEventRetentionDays: null
    });

    expect(stored).toMatchObject({
      retrievalEventRetentionDays: 14,
      auditEventRetentionDays: null,
      feedbackRetentionDays: 90,
      source: "stored"
    });
  });
});

describe("InMemoryRetrievalRepository", () => {
  it("indexes assets and returns citation-bearing search results", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.search-context",
      summary: "Searchable context boundary guidance for retrieval tests."
    });

    await retrievalRepository.indexAsset(asset);
    const results = await retrievalRepository.search({
      query: "context boundary",
      limit: 5
    });

    expect(results[0]?.asset.stableId).toBe("guardrail.search-context");
    expect(results[0]?.citation.stableId).toBe("guardrail.search-context");
    expect(results[0]?.citation.chunkId).toBeTruthy();
    expect(results[0]?.ranking).toMatchObject({
      strategy: "lexical-weighted-v1"
    });
    expect(results[0]?.rank).toBeCloseTo(results[0]?.ranking.finalScore ?? 0);
  });

  it("weights agent-instruction chunks above equal human-document matches", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.rank-weighting",
      instruction: {
        instructionKind: "guardrail",
        body: "rankprioritytoken"
      },
      humanDocument: {
        format: "markdown",
        body: "rankprioritytoken"
      }
    });

    await retrievalRepository.indexAsset(asset);
    const results = await retrievalRepository.search({
      query: "rankprioritytoken",
      limit: 5
    });

    expect(results.map((result) => result.sourceKind)).toEqual([
      "agent-instruction",
      "human-document"
    ]);
    expect(results[0]?.ranking.sourceKindWeight).toBeGreaterThan(results[1]?.ranking.sourceKindWeight ?? 0);
  });

  it("applies tenant retrieval ranking policy overrides", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const rankingPolicyRepository = new InMemoryRetrievalRankingPolicyRepository();
    const retrievalRepository = new InMemoryRetrievalRepository(rankingPolicyRepository);
    const tenantId = "tenant_ranking_memory";
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      tenantId,
      stableId: "guardrail.rank-policy",
      instruction: {
        instructionKind: "guardrail",
        body: "rankpolicytoken"
      },
      humanDocument: {
        format: "markdown",
        body: "rankpolicytoken"
      }
    });

    await rankingPolicyRepository.upsertPolicy({
      tenantId,
      agentInstructionWeight: 1,
      assetSummaryWeight: 1,
      humanDocumentWeight: 2,
      exactPhraseBoost: 0
    });
    await retrievalRepository.indexAsset(asset);

    const results = await retrievalRepository.search({
      tenantId,
      query: "rankpolicytoken",
      limit: 5
    });

    expect(results.map((result) => result.sourceKind)).toEqual([
      "human-document",
      "agent-instruction"
    ]);
    expect(results[0]?.ranking.sourceKindWeight).toBe(2);
    expect(results[1]?.ranking.sourceKindWeight).toBe(1);
  });

  it("supports deterministic hash-vector and hybrid retrieval strategies", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const targetAsset = await registryRepository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.vector-target",
      summary: "Vector retrieval target guidance with vectormatchtoken."
    });
    const otherAsset = await registryRepository.createAsset({
      ...sampleAsset,
      stableId: "guardrail.vector-other",
      summary: "Unrelated guidance for a separate operating mode."
    });

    await retrievalRepository.indexAsset(targetAsset);
    await retrievalRepository.indexAsset(otherAsset);

    const vectorResults = await retrievalRepository.search({
      query: "vectormatchtoken",
      strategy: "vector",
      limit: 2
    });
    const hybridResults = await retrievalRepository.search({
      query: "vectormatchtoken",
      strategy: "hybrid",
      limit: 2
    });

    expect(vectorResults[0]?.asset.stableId).toBe("guardrail.vector-target");
    expect(vectorResults[0]?.ranking).toMatchObject({
      strategy: "vector-hash-v1",
      lexicalRank: expect.any(Number),
      vectorSimilarity: expect.any(Number),
      vectorWeight: null
    });
    expect(hybridResults[0]?.asset.stableId).toBe("guardrail.vector-target");
    expect(hybridResults[0]?.ranking).toMatchObject({
      strategy: "hybrid-hash-lexical-v1",
      vectorSimilarity: expect.any(Number),
      vectorWeight: expect.any(Number)
    });
  });
});

describe("InMemoryManagedQueryFeedbackRepository", () => {
  it("records managed query outcome and quality feedback", async () => {
    const repository = new InMemoryManagedQueryFeedbackRepository();
    const recorded = await repository.recordFeedback({
      telemetryEventId: "retrieval_1",
      query: "citation accuracy",
      outcome: "accepted",
      factualCitationAccuracy: 5,
      policyCompliance: 4,
      taskCompletionQuality: 5,
      consistency: 4,
      responseEffectiveness: 5,
      metadata: {
        source: "test"
      }
    });

    expect(recorded.id).toBe("feedback_1");
    expect(recorded.factualCitationAccuracy).toBe(5);
    expect((await repository.listFeedback())[0]?.id).toBe(recorded.id);
  });
});

describe("InMemoryManagedQueryEvalRunRepository", () => {
  it("records and lists managed query eval run history", async () => {
    const repository = new InMemoryManagedQueryEvalRunRepository();
    const report = sampleEvalReport();
    const recorded = await repository.recordRun({
      report,
      metadata: {
        source: "test"
      }
    });

    expect(recorded.id).toBe("managed_query_eval_run_1");
    expect(recorded.ok).toBe(true);
    expect(recorded.report.results[0]?.id).toBe("eval.citation-accuracy");
    expect(recorded.metadata.source).toBe("test");
    expect((await repository.listRuns())[0]?.id).toBe(recorded.id);
  });
});

describe("InMemoryManagedQueryEvalSchedulePolicyRepository", () => {
  it("stores inline eval schedule policy and due/run status", async () => {
    const repository = new InMemoryManagedQueryEvalSchedulePolicyRepository();
    const tenantId = "tenant_eval_schedule_memory";
    await expect(repository.upsertPolicy({
      tenantId,
      enabled: true
    })).rejects.toThrow("managed_query_eval_schedule_requires_cases");

    const policy = await repository.upsertPolicy({
      tenantId,
      enabled: true,
      intervalMinutes: 60,
      evalInput: {
        cases: [
          {
            id: "eval.memory",
            query: "memory schedule",
            expectedStableIds: ["policy.memory"],
            requiredCitationCount: 1
          }
        ]
      }
    });

    expect(policy.enabled).toBe(true);
    expect(policy.evalInput?.cases).toHaveLength(1);
    expect(await repository.listDuePolicies({ now: "2026-06-17T00:00:00.000Z" })).toHaveLength(1);

    const recorded = await repository.recordRunResult({
      tenantId,
      evalRunId: "managed_query_eval_run_memory",
      status: "passed",
      ranAt: "2026-06-17T00:00:00.000Z"
    });

    expect(recorded.lastStatus).toBe("passed");
    expect(recorded.lastEvalRunId).toBe("managed_query_eval_run_memory");
    expect(await repository.listDuePolicies({ now: "2026-06-17T00:30:00.000Z" })).toHaveLength(0);
    expect(await repository.listDuePolicies({ now: "2026-06-17T01:00:00.000Z" })).toHaveLength(1);
  });
});

describe("InMemoryManagedQueryCacheRepository", () => {
  it("stores fresh managed-query responses and ignores expired entries", async () => {
    const repository = new InMemoryManagedQueryCacheRepository();
    const fresh = await repository.upsert({
      cacheKey: "cache_fresh",
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Cached answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const hit = await repository.getFresh({ cacheKey: fresh.cacheKey });

    expect(hit?.answer).toBe("Cached answer");
    expect(hit?.hitCount).toBe(1);
    expect((await repository.listEntries()).map((entry) => entry.cacheKey)).toContain("cache_fresh");
    const deleted = await repository.deleteEntry({ cacheKey: "cache_fresh" });

    expect(deleted?.answer).toBe("Cached answer");
    expect(await repository.getFresh({ cacheKey: "cache_fresh" })).toBeNull();
    expect(await repository.deleteEntry({ cacheKey: "cache_fresh" })).toBeNull();

    await repository.upsert({
      cacheKey: "cache_expired",
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Expired answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() - 1000).toISOString()
    });

    expect(await repository.purgeExpired({
      expiredBefore: new Date().toISOString(),
      dryRun: true
    })).toBe(1);
    expect(await repository.purgeExpired({
      expiredBefore: new Date().toISOString(),
      dryRun: false
    })).toBe(1);
    expect(await repository.getFresh({ cacheKey: "cache_expired" })).toBeNull();
  });

  it("purges expired managed-query cache entries across tenants", async () => {
    const repository = new InMemoryManagedQueryCacheRepository();
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    const expiredBefore = new Date().toISOString();

    await repository.upsert({
      tenantId: "tenant_cache_a",
      cacheKey: "expired_a_1",
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Expired tenant A answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: expiredAt
    });
    await repository.upsert({
      tenantId: "tenant_cache_b",
      cacheKey: "expired_b_1",
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Expired tenant B answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: expiredAt
    });
    await repository.upsert({
      tenantId: "tenant_cache_b",
      cacheKey: "fresh_b_1",
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Fresh tenant B answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    expect(await repository.purgeExpiredForAllTenants({
      expiredBefore,
      dryRun: true
    })).toEqual([
      {
        tenantId: "tenant_cache_a",
        deletedCount: 1
      },
      {
        tenantId: "tenant_cache_b",
        deletedCount: 1
      }
    ]);
    expect(await repository.listEntries({ tenantId: "tenant_cache_a" })).toHaveLength(1);

    expect(await repository.purgeExpiredForAllTenants({
      expiredBefore,
      dryRun: false
    })).toEqual([
      {
        tenantId: "tenant_cache_a",
        deletedCount: 1
      },
      {
        tenantId: "tenant_cache_b",
        deletedCount: 1
      }
    ]);
    expect(await repository.listEntries({ tenantId: "tenant_cache_a" })).toHaveLength(0);
    expect((await repository.listEntries({ tenantId: "tenant_cache_b" })).map((entry) => entry.cacheKey)).toEqual([
      "fresh_b_1"
    ]);
    expect(await repository.invalidateTenant({ tenantId: "tenant_cache_b", dryRun: true })).toBe(1);
    expect((await repository.listEntries({ tenantId: "tenant_cache_b" })).map((entry) => entry.cacheKey)).toEqual([
      "fresh_b_1"
    ]);
    expect(await repository.invalidateTenant({ tenantId: "tenant_cache_b" })).toBe(1);
    expect(await repository.listEntries({ tenantId: "tenant_cache_b" })).toHaveLength(0);
  });
});

describe("InMemoryManagedQueryCachePolicyRepository", () => {
  it("returns default cache policy and stores tenant overrides", async () => {
    const repository = new InMemoryManagedQueryCachePolicyRepository();
    const defaults = await repository.getPolicy("tenant_cache_policy_memory");

    expect(defaults).toMatchObject({
      tenantId: "tenant_cache_policy_memory",
      cacheEnabled: true,
      maxCacheTtlSeconds: 3600,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId: "tenant_cache_policy_memory",
      cacheEnabled: false,
      maxCacheTtlSeconds: null,
      updatedByApiKeyId: "api_key_test"
    });

    expect(stored).toMatchObject({
      cacheEnabled: false,
      maxCacheTtlSeconds: null,
      updatedByApiKeyId: "api_key_test",
      source: "stored"
    });
  });
});

describe("InMemoryManagedQueryPolicyRepository", () => {
  it("returns default managed query policy and stores tenant overrides", async () => {
    const repository = new InMemoryManagedQueryPolicyRepository();
    const defaults = await repository.getPolicy("tenant_query_policy_memory");

    expect(defaults).toMatchObject({
      tenantId: "tenant_query_policy_memory",
      defaultMode: "deterministic-retrieval",
      allowedModes: ["deterministic-retrieval", "provider-routed"],
      minimumCitationCount: 1,
      requireGrounded: false,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId: "tenant_query_policy_memory",
      defaultMode: "provider-routed",
      allowedModes: ["provider-routed"],
      minimumCitationCount: 2,
      requireGrounded: true,
      updatedByApiKeyId: "api_key_test"
    });

    expect(stored).toMatchObject({
      defaultMode: "provider-routed",
      allowedModes: ["provider-routed"],
      minimumCitationCount: 2,
      requireGrounded: true,
      updatedByApiKeyId: "api_key_test",
      source: "stored"
    });
  });
});

describe("InMemoryAgentActionExecutionRepository", () => {
  it("stores disabled-by-default policies and action request decisions", async () => {
    const repository = new InMemoryAgentActionExecutionRepository();
    const defaults = await repository.getPolicy("tenant_action_memory");

    expect(defaults).toMatchObject({
      tenantId: "tenant_action_memory",
      enabled: false,
      allowedActionTypes: [],
      requireApproval: true,
      dryRunDefault: true,
      killSwitch: false,
      maxRequestsPerHour: 60,
      approvalExpiresInMinutes: 1440,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId: "tenant_action_memory",
      enabled: true,
      allowedActionTypes: ["create-task-record", "create-task-record"],
      requireApproval: true,
      dryRunDefault: false,
      killSwitch: false,
      maxRequestsPerHour: 3,
      approvalExpiresInMinutes: 30,
      updatedByApiKeyId: "api_key_admin"
    });

    expect(stored).toMatchObject({
      enabled: true,
      allowedActionTypes: ["create-task-record"],
      requireApproval: true,
      dryRunDefault: false,
      maxRequestsPerHour: 3,
      approvalExpiresInMinutes: 30,
      updatedByApiKeyId: "api_key_admin",
      source: "stored"
    });

    const approvalExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const request = await repository.createRequest({
      tenantId: "tenant_action_memory",
      actionType: "create-task-record",
      title: "Create review task",
      idempotencyKey: "memory-action-retry-key",
      dryRun: false,
      payload: {
        stableId: "policy.action-execution"
      },
      status: "approval-required",
      reason: "approval_required",
      policySnapshot: {
        enabled: true,
        requireApproval: true,
        approvalExpiresInMinutes: 30
      },
      approvalExpiresAt,
      requestedByUserId: "user_reader"
    });

    expect(request).toMatchObject({
      tenantId: "tenant_action_memory",
      actionType: "create-task-record",
      status: "approval-required",
      dryRun: false,
      idempotencyKey: "memory-action-retry-key",
      requestedByUserId: "user_reader",
      decidedAt: null,
      approvalExpiresAt,
      executedAt: null
    });
    expect(await repository.getRequest("tenant_action_memory", request.id)).toMatchObject({ id: request.id });
    expect(await repository.getRequestByIdempotencyKey({
      tenantId: "tenant_action_memory",
      idempotencyKey: "memory-action-retry-key",
      requestedByUserId: "user_reader"
    })).toMatchObject({ id: request.id });
    expect(await repository.listRequests({ tenantId: "tenant_action_memory" })).toHaveLength(1);
    expect(await repository.countRequestsSince(
      "tenant_action_memory",
      new Date(Date.now() - 60 * 60 * 1000)
    )).toBe(1);

    const decided = await repository.decideRequest({
      tenantId: "tenant_action_memory",
      actionRequestId: request.id,
      decision: "approve",
      status: "executed",
      reason: "Approved",
      result: {
        taskRecordCreated: true,
        externalSideEffects: false
      },
      decidedByApiKeyId: "api_key_admin"
    });

    expect(decided).toMatchObject({
      status: "executed",
      reason: "Approved",
      result: {
        taskRecordCreated: true,
        externalSideEffects: false
      },
      decidedByApiKeyId: "api_key_admin"
    });
    expect(decided?.decidedAt).toBeTruthy();
    expect(decided?.executedAt).toBeTruthy();
  });
});

describe("InMemoryManagedQueryRetentionPolicyRepository", () => {
  it("returns default retention policy and stores tenant overrides", async () => {
    const repository = new InMemoryManagedQueryRetentionPolicyRepository();
    const defaults = await repository.getPolicy("tenant_query_retention_memory");

    expect(defaults).toMatchObject({
      tenantId: "tenant_query_retention_memory",
      promptCaptureMode: "disabled",
      responseCaptureMode: "disabled",
      metadataRetentionDays: 30,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId: "tenant_query_retention_memory",
      promptCaptureMode: "metadata-only",
      responseCaptureMode: "metadata-only",
      metadataRetentionDays: null,
      updatedByApiKeyId: "api_key_test"
    });

    expect(stored).toMatchObject({
      promptCaptureMode: "metadata-only",
      responseCaptureMode: "metadata-only",
      metadataRetentionDays: null,
      updatedByApiKeyId: "api_key_test",
      source: "stored"
    });
  });
});

describe("InMemorySecretReferencePolicyRepository", () => {
  it("returns default secret-reference policy and stores tenant overrides", async () => {
    const repository = new InMemorySecretReferencePolicyRepository();
    const defaults = await repository.getPolicy("tenant_secret_policy_memory");

    expect(defaults).toMatchObject({
      tenantId: "tenant_secret_policy_memory",
      allowedEnvVarPrefixes: expect.arrayContaining(["OPENAI_", "ENTRA_"]),
      allowedEnvVars: [],
      allowUnlistedEnvVars: false,
      source: "default"
    });
    expect(isSecretEnvVarAllowed(defaults, "OPENAI_API_KEY")).toBe(true);
    expect(isSecretEnvVarAllowed(defaults, "PATH")).toBe(false);

    const stored = await repository.upsertPolicy({
      tenantId: "tenant_secret_policy_memory",
      allowedEnvVarPrefixes: ["CUSTOM_"],
      allowedEnvVars: ["SPECIAL_PROVIDER_SECRET"],
      allowUnlistedEnvVars: false,
      updatedByApiKeyId: "api_key_test"
    });

    expect(stored).toMatchObject({
      allowedEnvVarPrefixes: ["CUSTOM_"],
      allowedEnvVars: ["SPECIAL_PROVIDER_SECRET"],
      allowUnlistedEnvVars: false,
      updatedByApiKeyId: "api_key_test",
      source: "stored"
    });
    expect(isSecretEnvVarAllowed(stored, "CUSTOM_OPENAI_KEY")).toBe(true);
    expect(isSecretEnvVarAllowed(stored, "SPECIAL_PROVIDER_SECRET")).toBe(true);
    expect(isSecretEnvVarAllowed(stored, "OPENAI_API_KEY")).toBe(false);
  });
});

describe("InMemoryModelProviderConfigRepository", () => {
  it("upserts provider configuration stubs", async () => {
    const repository = new InMemoryModelProviderConfigRepository();
    const created = await repository.upsertProviderConfig({
      provider: "openai",
      enabled: true,
      apiKeyEnvVar: "OPENAI_API_KEY",
      defaultModel: "gpt-5.1",
      availableModels: ["gpt-5.1"],
      priority: 10
    });
    const updated = await repository.upsertProviderConfig({
      provider: "openai",
      enabled: false,
      priority: 20
    });

    expect(updated.id).toBe(created.id);
    expect(updated.enabled).toBe(false);
    expect((await repository.listProviderConfigs())[0]?.provider).toBe("openai");
  });
});

describe("InMemoryAuthProviderConfigRepository", () => {
  it("upserts external auth provider configuration stubs", async () => {
    const repository = new InMemoryAuthProviderConfigRepository();
    const created = await repository.upsertAuthProviderConfig({
      provider: "microsoft-entra",
      enabled: true,
      issuerUrl: "https://login.microsoftonline.com/common/v2.0",
      clientId: "agentic-cms",
      clientSecretEnvVar: "ENTRA_CLIENT_SECRET",
      groupClaim: "groups",
      allowedDomains: ["example.com"]
    });
    const updated = await repository.upsertAuthProviderConfig({
      provider: "microsoft-entra",
      enabled: false,
      issuerUrl: "https://login.microsoftonline.com/common/v2.0",
      clientId: "agentic-cms",
      priority: 20
    });

    expect(updated.id).toBe(created.id);
    expect(updated.enabled).toBe(false);
    expect(updated.defaultRole).toBe("reader");
    expect((await repository.listAuthProviderConfigs())[0]?.provider).toBe("microsoft-entra");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgresRegistryRepository", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("serializes concurrent migration runners with an advisory lock", async () => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const id = `900_concurrent_lock_${suffix}`;
    const typeName = `migration_lock_type_${suffix}`;
    const tableName = `migration_lock_table_${suffix}`;
    const migrationsDir = await mkdtemp(join(tmpdir(), "agentic-cms-migration-lock-"));

    await writeFile(
      join(migrationsDir, `${id}.sql`),
      `
        CREATE TYPE ${typeName} AS ENUM ('ok');
        CREATE TABLE ${tableName} (
          id ${typeName} PRIMARY KEY
        );
      `
    );

    try {
      const [left, right] = await Promise.all([
        runMigrations(pool, migrationsDir),
        runMigrations(pool, migrationsDir)
      ]);
      const appliedCount = [left, right].filter((result) => result.applied.includes(id)).length;
      const skippedCount = [left, right].filter((result) => result.skipped.includes(id)).length;
      const created = await pool.query<{ exists: string | null }>(
        "SELECT to_regclass($1) AS exists",
        [`public.${tableName}`]
      );

      expect(appliedCount).toBe(1);
      expect(skippedCount).toBe(1);
      expect(created.rows[0]?.exists).toBe(tableName);
    } finally {
      await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
      await pool.query(`DROP TYPE IF EXISTS ${typeName}`);
      await pool.query("DELETE FROM schema_migrations WHERE id = $1", [id]);
      await rm(migrationsDir, { recursive: true, force: true });
    }
  });

  it("persists governed assets in Postgres", async () => {
    const repository = new PostgresRegistryRepository(pool);
    const stableId = `guardrail.integration-${Date.now()}`;
    const publishStableId = `guardrail.publish-${Date.now()}`;

    const created = await repository.createAsset({
      ...sampleAsset,
      stableId,
      tenantId: "tenant_test"
    });
    const fetched = await repository.getAssetByStableId(stableId, {
      tenantId: "tenant_test"
    });

    expect(created.asset.currentVersionId).toBeTruthy();
    expect(fetched?.asset.stableId).toBe(stableId);
    expect(fetched?.instructionObjects[0]?.instructionKind).toBe("guardrail");

    const updated = await repository.updateAsset(stableId, {
      tenantId: "tenant_test",
      instruction: {
        instructionKind: "guardrail",
        body: "Updated integration instruction."
      },
      changeNote: "Integration update"
    });

    expect(updated?.versions.map((version) => version.versionNumber)).toEqual([2, 1]);
    expect(updated?.instructionObjects[0]?.body).toContain("Updated integration");

    const versionOne = await repository.getAssetVersionSnapshot(stableId, {
      tenantId: "tenant_test",
      versionNumber: 1
    });
    const versionTwo = await repository.getAssetVersionSnapshot(stableId, {
      tenantId: "tenant_test",
      versionNumber: 2
    });

    expect(versionOne?.instructionObjects[0]?.body).toContain("Keep model context");
    expect(versionTwo?.instructionObjects[0]?.body).toContain("Updated integration");

    const restored = await repository.restoreAssetVersion(stableId, {
      tenantId: "tenant_test",
      versionNumber: 1
    });

    expect(restored?.asset.currentVersionId).toBe(restored?.versions.find((version) => version.versionNumber === 1)?.id);
    expect(restored?.instructionObjects[0]?.body).toContain("Keep model context");

    await repository.createAsset({
      ...sampleAsset,
      stableId: publishStableId,
      tenantId: "tenant_test",
      lifecycleState: "draft",
      status: "reviewing"
    });
    const published = await repository.publishAsset(publishStableId, {
      tenantId: "tenant_test",
      reviewDueAt: "2027-06-30"
    });

    expect(published?.asset.lifecycleState).toBe("active");
    expect(published?.asset.status).toBe("approved");
    expect(published?.asset.reviewDueAt).toBe("2027-06-30");
    expect(published?.versions).toHaveLength(1);
  });

  it("persists users, scoped API keys, grants, and audit events", async () => {
    const registryRepository = new PostgresRegistryRepository(pool);
    const authRepository = new PostgresAuthRepository(pool);
    const tenantId = "tenant_auth_test";
    const stableId = `guardrail.auth-${Date.now()}`;
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      tenantId,
      stableId,
      sensitivity: "restricted"
    });
    const user = await authRepository.createUser({
      tenantId,
      email: `reader-${Date.now()}@example.test`,
      displayName: "Auth Reader",
      role: "reader",
      password: "initial-password-123"
    });

    expect((await authRepository.listUsers({ tenantId })).map((listedUser) => listedUser.id)).toContain(user.id);
    expect((await authRepository.findUserByEmail(tenantId, user.email))?.id).toBe(user.id);

	    const externalSubject = `external-reader-subject-${Date.now()}`;
	    const linkedSubject = `linked-local-subject-${Date.now()}`;
	    const externalUser = await authRepository.createExternalUser({
	      tenantId,
	      email: `external-${Date.now()}@example.test`,
	      displayName: "External Reader",
	      role: "reader",
	      authProvider: "oidc",
	      externalIssuer: "https://issuer.example.test",
	      externalSubject
	    });

	    expect(externalUser.authProvider).toBe("oidc");
	    expect(externalUser.externalIssuer).toBe("https://issuer.example.test");
	    expect(externalUser.externalSubject).toBe(externalSubject);
	    expect((await authRepository.findUserByExternalIdentity({
	      tenantId,
	      provider: "oidc",
	      issuer: "https://issuer.example.test",
	      subject: externalSubject
	    }))?.id).toBe(externalUser.id);
	    expect((await authRepository.findUserByEmail(tenantId, externalUser.email))?.id).toBe(externalUser.id);

	    const linkedUser = await authRepository.linkExternalUserIdentity({
	      tenantId,
	      userId: user.id,
	      provider: "oidc",
	      issuer: "https://issuer.example.test",
	      subject: linkedSubject
	    });

	    expect(linkedUser?.id).toBe(user.id);
	    expect(linkedUser?.authProvider).toBe("local");
	    expect(linkedUser?.externalSubject).toBe(linkedSubject);
	    expect((await authRepository.findUserByExternalIdentity({
	      tenantId,
	      provider: "oidc",
	      issuer: "https://issuer.example.test",
	      subject: linkedSubject
	    }))?.id).toBe(user.id);

	    const initialExternalSync = await authRepository.syncExternalGroupMemberships({
	      tenantId,
	      provider: "oidc",
	      userId: externalUser.id,
	      externalGroupIds: ["external-group-a", "external-group-b", "external-group-a"]
	    });

	    expect(initialExternalSync.groups).toHaveLength(2);
	    expect(initialExternalSync.addedMembershipCount).toBe(2);
	    expect(initialExternalSync.removedMembershipCount).toBe(0);
	    expect(initialExternalSync.groups[0]?.externalProvider).toBe("oidc");
	    expect(initialExternalSync.groups[0]?.externalId).toBe("external-group-a");

	    const localPreservedGroup = await authRepository.createGroup({
	      tenantId,
	      slug: `local-preserved-${Date.now()}`,
	      name: "Local Preserved"
	    });
	    await authRepository.addGroupMember({
	      tenantId,
	      groupId: localPreservedGroup.id,
	      userId: externalUser.id
	    });

	    const secondExternalSync = await authRepository.syncExternalGroupMemberships({
	      tenantId,
	      provider: "oidc",
	      userId: externalUser.id,
	      externalGroupIds: ["external-group-b"]
	    });

	    expect(secondExternalSync.groups).toHaveLength(1);
	    expect(secondExternalSync.addedMembershipCount).toBe(0);
	    expect(secondExternalSync.removedMembershipCount).toBe(1);
	    expect((await authRepository.listGroupMembers({ tenantId, groupId: initialExternalSync.groups[0]?.id ?? "" }))
	      .map((member) => member.userId)).not.toContain(externalUser.id);
	    expect((await authRepository.listGroupMembers({ tenantId, groupId: localPreservedGroup.id }))[0]?.userId)
	      .toBe(externalUser.id);

	    const apiKey = requireTestValue(await authRepository.createApiKey({
	      tenantId,
      userId: user.id,
      name: "reader-key",
      scopes: ["asset:read"]
    }));
    const principal = await authRepository.authenticateApiKey(apiKey.secret);

    expect(principal?.userId).toBe(user.id);
    expect(await authRepository.canAccessAsset({
      principal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    const group = await authRepository.createGroup({
      tenantId,
      slug: `ai-readers-${Date.now()}`,
      name: "AI Readers"
    });
    const member = await authRepository.addGroupMember({
      tenantId,
      groupId: group.id,
      userId: user.id
    });
    const groupedPrincipal = await authRepository.authenticateApiKey(apiKey.secret);

    expect((await authRepository.listGroups({ tenantId })).map((listedGroup) => listedGroup.id)).toContain(group.id);
    expect(member?.userEmail).toBe(user.email);
    expect((await authRepository.listGroupMembers({ tenantId, groupId: group.id }))[0]?.userId).toBe(user.id);
    expect(groupedPrincipal?.groupIds).toContain(group.id);

    await authRepository.createPermissionGrant({
      tenantId,
      stableId,
      principalType: "group",
      principalId: group.id,
      action: "read",
      surfaces: ["api"]
    });

    expect(await authRepository.canAccessAsset({
      principal: groupedPrincipal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(true);

    const removedMember = await authRepository.removeGroupMember({
      tenantId,
      groupId: group.id,
      userId: user.id
    });
    const principalAfterRemoval = await authRepository.authenticateApiKey(apiKey.secret);

    expect(removedMember?.userId).toBe(user.id);
    expect(principalAfterRemoval?.groupIds).not.toContain(group.id);
    expect(await authRepository.canAccessAsset({
      principal: principalAfterRemoval,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    await authRepository.addGroupMember({
      tenantId,
      groupId: group.id,
      userId: user.id
    });
    const deletedGroup = await authRepository.deleteGroup({
      tenantId,
      groupId: group.id
    });
    const principalAfterGroupDelete = await authRepository.authenticateApiKey(apiKey.secret);

    expect(deletedGroup?.id).toBe(group.id);
    expect((await authRepository.listGroups({ tenantId })).map((listedGroup) => listedGroup.id)).not.toContain(group.id);
    expect(await authRepository.listGroupMembers({ tenantId, groupId: group.id })).toEqual([]);
    expect(principalAfterGroupDelete?.groupIds).not.toContain(group.id);
    expect(await authRepository.canAccessAsset({
      principal: principalAfterGroupDelete,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    const updatedUser = await authRepository.updateUser({
      tenantId,
      userId: user.id,
      displayName: "Updated Auth Reader",
      role: "maintainer",
      password: "updated-password-123"
    });

    expect(updatedUser?.displayName).toBe("Updated Auth Reader");
    expect(updatedUser?.role).toBe("maintainer");
    expect(await authRepository.authenticateLocalUser(tenantId, user.email, "initial-password-123")).toBeNull();
    expect(await authRepository.authenticateLocalUser(tenantId, user.email, "updated-password-123")).not.toBeNull();

    const disabledUser = await authRepository.updateUser({
      tenantId,
      userId: user.id,
      status: "disabled"
    });

    expect(disabledUser?.status).toBe("disabled");
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
    expect(await authRepository.authenticateLocalUser(tenantId, user.email, "updated-password-123")).toBeNull();

    const event = await authRepository.recordAuditEvent({
      tenantId,
      actorUserId: user.id,
      actorApiKeyId: apiKey.apiKey.id,
      action: "asset.read",
      targetType: "asset",
      targetId: asset.asset.id,
      outcome: "denied",
      reason: "test_denial"
    });

    expect(event.outcome).toBe("denied");
    expect((await authRepository.listAuditEvents({ tenantId }))[0]?.id).toBe(event.id);

    const listedKeys = await authRepository.listApiKeys({ tenantId });
    expect(listedKeys.map((listedKey) => listedKey.id)).toContain(apiKey.apiKey.id);
    const revoked = await authRepository.revokeApiKey({
      tenantId,
      apiKeyId: apiKey.apiKey.id
    });

    expect(revoked?.revokedAt).toBeTruthy();
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
  });

  it("persists login sessions and revokes their underlying login keys", async () => {
    const authRepository = new PostgresAuthRepository(pool);
    const tenantId = "tenant_login_session_test";
    const user = await authRepository.createUser({
      tenantId,
      email: `session-${Date.now()}@example.test`,
      displayName: "Session User",
      role: "reader",
      password: "session-password-123"
    });
    const apiKey = requireTestValue(await authRepository.createApiKey({
      tenantId,
      userId: user.id,
      name: "session-key",
      scopes: ["asset:read"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }));
    const absoluteExpiresAt = new Date(Date.now() + 90_000).toISOString();
    const session = requireTestValue(await authRepository.createLoginSession({
      tenantId,
      userId: user.id,
      apiKeyId: apiKey.apiKey.id,
      source: "password",
      deviceLabel: "Postgres work laptop",
      clientUserAgent: "AgenticCMSPostgresRepositoryTest/1.0",
      expiresAt: apiKey.apiKey.expiresAt ?? "",
      absoluteExpiresAt
    }));
    expect(session.deviceLabel).toBe("Postgres work laptop");
    expect(session.clientUserAgent).toBe("AgenticCMSPostgresRepositoryTest/1.0");
    expect(session.absoluteExpiresAt).toBe(absoluteExpiresAt);

    expect((await authRepository.listLoginSessions({ tenantId, userId: user.id })).map((candidate) => candidate.id))
      .toContain(session.id);
    expect(await authRepository.findActiveLoginSessionByApiKeyId({
      tenantId,
      apiKeyId: apiKey.apiKey.id,
      idleTimeoutSeconds: 0
    })).toBeNull();
    expect(await authRepository.findActiveLoginSessionByApiKeyId({ tenantId, apiKeyId: apiKey.apiKey.id }))
      .toMatchObject({ id: session.id, lastSeenAt: expect.any(String) });

    const refreshToken = requireTestValue(await authRepository.createLoginSessionRefreshToken({
      tenantId,
      loginSessionId: session.id,
      expiresAt: new Date(Date.now() + 120_000).toISOString()
    }));
    expect(Date.parse(refreshToken.expiresAt)).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    const refreshed = requireTestValue(await authRepository.refreshLoginSession({
      tenantId,
      refreshToken: refreshToken.token,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString()
    }));

    expect(refreshed.session.id).toBe(session.id);
    expect(refreshed.apiKey.id).not.toBe(apiKey.apiKey.id);
    expect(refreshed.session.apiKeyId).toBe(refreshed.apiKey.id);
    expect(refreshed.session.deviceLabel).toBe("Postgres work laptop");
    expect(refreshed.session.clientUserAgent).toBe("AgenticCMSPostgresRepositoryTest/1.0");
    expect(Date.parse(refreshed.session.expiresAt)).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    expect(Date.parse(refreshed.apiKey.expiresAt ?? "")).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    expect(Date.parse(refreshed.refreshTokenExpiresAt)).toBeLessThanOrEqual(Date.parse(absoluteExpiresAt));
    expect(refreshed.refreshToken).toMatch(/^acms_refresh_/);
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
    expect(await authRepository.authenticateApiKey(refreshed.secret))
      .toMatchObject({ apiKeyId: refreshed.apiKey.id });
    expect(await authRepository.refreshLoginSession({
      tenantId,
      refreshToken: refreshToken.token,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshTokenExpiresAt: new Date(Date.now() + 120_000).toISOString()
    })).toBeNull();

    const revoked = await authRepository.revokeLoginSession({
      tenantId,
      sessionId: refreshed.session.id,
      userId: user.id
    });

    expect(revoked?.session.revokedAt).toBeTruthy();
    expect(revoked?.apiKey.revokedAt).toBeTruthy();
    expect(await authRepository.findActiveLoginSessionByApiKeyId({ tenantId, apiKeyId: apiKey.apiKey.id })).toBeNull();
    expect(await authRepository.findActiveLoginSessionByApiKeyId({
      tenantId,
      apiKeyId: refreshed.apiKey.id
    })).toBeNull();
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
    expect(await authRepository.authenticateApiKey(refreshed.secret)).toBeNull();

    const expiredApiKey = requireTestValue(await authRepository.createApiKey({
      tenantId,
      userId: user.id,
      name: "absolute-expired-session-key",
      scopes: ["asset:read"],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }));
    const expiredSession = requireTestValue(await authRepository.createLoginSession({
      tenantId,
      userId: user.id,
      apiKeyId: expiredApiKey.apiKey.id,
      source: "password",
      expiresAt: expiredApiKey.apiKey.expiresAt ?? "",
      absoluteExpiresAt: new Date(Date.now() - 1_000).toISOString()
    }));

    expect(await authRepository.findActiveLoginSessionByApiKeyId({
      tenantId,
      apiKeyId: expiredApiKey.apiKey.id
    })).toBeNull();
    expect(await authRepository.createLoginSessionRefreshToken({
      tenantId,
      loginSessionId: expiredSession.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })).toBeNull();
  });

  it("persists service accounts, service-owned API keys, grants, and audit actor attribution", async () => {
    const registryRepository = new PostgresRegistryRepository(pool);
    const authRepository = new PostgresAuthRepository(pool);
    const tenantId = "tenant_service_account_test";
    const stableId = `guardrail.service-account-${Date.now()}`;
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      tenantId,
      stableId,
      sensitivity: "restricted"
    });
    const serviceAccount = await authRepository.createServiceAccount({
      tenantId,
      slug: `automation-${Date.now()}`,
      name: "Automation",
      role: "reader"
    });

    expect((await authRepository.listServiceAccounts({ tenantId })).map((listed) => listed.id))
      .toContain(serviceAccount.id);

    const apiKey = requireTestValue(await authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "automation-key",
      scopes: ["asset:read"]
    }));
    const principal = await authRepository.authenticateApiKey(apiKey.secret);

    expect(apiKey.apiKey.userId).toBeNull();
    expect(apiKey.apiKey.serviceAccountId).toBe(serviceAccount.id);
    expect(principal?.principalType).toBe("service-account");
    expect(principal?.principalId).toBe(serviceAccount.id);
    expect(principal?.userId).toBeNull();
    expect(principal?.serviceAccountId).toBe(serviceAccount.id);
    expect(principal?.groupIds).toEqual([]);
    expect(await authRepository.canAccessAsset({
      principal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(false);

    await authRepository.createPermissionGrant({
      tenantId,
      stableId,
      principalType: "service-account",
      principalId: serviceAccount.id,
      action: "read",
      surfaces: ["api", "mcp"]
    });

    expect(await authRepository.canAccessAsset({
      principal,
      asset: asset.asset,
      action: "read",
      surface: "api"
    })).toBe(true);

    const event = await authRepository.recordAuditEvent({
      tenantId,
      actorServiceAccountId: serviceAccount.id,
      actorApiKeyId: apiKey.apiKey.id,
      action: "asset.read",
      targetType: "asset",
      targetId: asset.asset.id,
      outcome: "success"
    });

    expect(event.actorUserId).toBeNull();
    expect(event.actorServiceAccountId).toBe(serviceAccount.id);

    const disabled = await authRepository.updateServiceAccount({
      tenantId,
      serviceAccountId: serviceAccount.id,
      status: "disabled"
    });

    expect(disabled?.status).toBe("disabled");
    expect(await authRepository.authenticateApiKey(apiKey.secret)).toBeNull();
    expect(await authRepository.createApiKey({
      tenantId,
      serviceAccountId: "00000000-0000-0000-0000-000000000000",
      name: "missing-owner",
      scopes: ["asset:read"]
    })).toBeNull();
  });

  it("persists service account policy limits and default service-key expiry", async () => {
    const authRepository = new PostgresAuthRepository(pool);
    const tenantId = `tenant_service_policy_${Date.now()}`;
    const defaults = await authRepository.getServiceAccountPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      maxServiceAccounts: 50,
      maxActiveApiKeysPerServiceAccount: 5,
      defaultApiKeyExpiresInDays: 90,
      source: "default"
    });

    const stored = await authRepository.upsertServiceAccountPolicy({
      tenantId,
      maxServiceAccounts: 1,
      maxActiveApiKeysPerServiceAccount: 1,
      defaultApiKeyExpiresInDays: 30
    });

    expect(stored).toMatchObject({
      tenantId,
      maxServiceAccounts: 1,
      maxActiveApiKeysPerServiceAccount: 1,
      defaultApiKeyExpiresInDays: 30,
      source: "stored"
    });

    const serviceAccount = await authRepository.createServiceAccount({
      tenantId,
      slug: `automation-${Date.now()}`,
      name: "Automation",
      role: "reader"
    });

    await expect(authRepository.createServiceAccount({
      tenantId,
      slug: `blocked-automation-${Date.now()}`,
      name: "Blocked Automation",
      role: "reader"
    })).rejects.toBeInstanceOf(ServiceAccountPolicyViolationError);

    const apiKey = requireTestValue(await authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "automation-key",
      scopes: ["asset:read"]
    }));

    expect(apiKey.apiKey.expiresAt).toBeTruthy();
    const rotationReport = await authRepository.getApiKeyRotationReport({
      tenantId,
      dueWithinDays: 365
    });

    expect(rotationReport.reminders.map((reminder) => reminder.apiKey.id)).toContain(apiKey.apiKey.id);
    expect(rotationReport.reminders.find((reminder) => reminder.apiKey.id === apiKey.apiKey.id)).toMatchObject({
      ownerType: "service-account",
      rotationState: "due-soon"
    });
    await expect(authRepository.createApiKey({
      tenantId,
      serviceAccountId: serviceAccount.id,
      name: "blocked-automation-key",
      scopes: ["asset:read"]
    })).rejects.toMatchObject({
      code: "max_active_api_keys_per_service_account_exceeded",
      limit: 1,
      tenantId,
      serviceAccountId: serviceAccount.id
    });
  });

  it("indexes and searches chunks in Postgres full-text search", async () => {
    const registryRepository = new PostgresRegistryRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool);
    const tenantId = "tenant_retrieval_test";
    const stableId = `guardrail.retrieval-${Date.now()}`;
    const uniqueToken = `retrievaltoken${Date.now()}`;
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      tenantId,
      stableId,
      summary: `Retrieval smoke test guidance about citation accuracy ${uniqueToken}.`
    });

    const indexed = await retrievalRepository.indexAsset(asset);
    const results = await retrievalRepository.search({
      tenantId,
      query: uniqueToken,
      limit: 5
    });
    const event = await retrievalRepository.recordRetrievalEvent({
      tenantId,
      surface: "api",
      query: uniqueToken,
      resultCount: results.length,
      deniedCount: 0,
      latencyMs: 1
    });

    expect(indexed.chunksIndexed).toBeGreaterThan(0);
    expect(results[0]?.asset.stableId).toBe(stableId);
    expect(results[0]?.citation.stableId).toBe(stableId);
    expect(results[0]?.ranking).toMatchObject({
      strategy: "lexical-weighted-v1"
    });
    expect(results[0]?.rank).toBeCloseTo(results[0]?.ranking.finalScore ?? 0);
    expect((await retrievalRepository.listRetrievalEvents({ tenantId }))[0]?.id).toBe(event.id);
  });

  it("persists weighted ranking metadata for Postgres search results", async () => {
    const registryRepository = new PostgresRegistryRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool);
    const tenantId = `tenant_retrieval_ranking_${Date.now()}`;
    const stableId = `guardrail.ranking-${Date.now()}`;
    const uniqueToken = `rankprioritytoken${Date.now()}`;
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      tenantId,
      stableId,
      instruction: {
        instructionKind: "guardrail",
        body: uniqueToken
      },
      humanDocument: {
        format: "markdown",
        body: uniqueToken
      }
    });

    await retrievalRepository.indexAsset(asset);
    const results = await retrievalRepository.search({
      tenantId,
      query: uniqueToken,
      limit: 5
    });

    expect(results.map((result) => result.sourceKind)).toEqual([
      "agent-instruction",
      "human-document"
    ]);
    expect(results[0]?.ranking.sourceKindWeight).toBeGreaterThan(results[1]?.ranking.sourceKindWeight ?? 0);
    expect(results[0]?.rank).toBeGreaterThan(results[1]?.rank ?? 0);
  });

  it("persists retrieval ranking policy overrides for Postgres search", async () => {
    const registryRepository = new PostgresRegistryRepository(pool);
    const rankingPolicyRepository = new PostgresRetrievalRankingPolicyRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool, rankingPolicyRepository);
    const tenantId = `tenant_retrieval_policy_${Date.now()}`;
    const stableId = `guardrail.ranking-policy-${Date.now()}`;
    const uniqueToken = `rankpolicytoken${Date.now()}`;
    const defaults = await rankingPolicyRepository.getPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      agentInstructionWeight: 1.2,
      assetSummaryWeight: 1.1,
      humanDocumentWeight: 1,
      exactPhraseBoost: 0.25,
      source: "default"
    });

    const stored = await rankingPolicyRepository.upsertPolicy({
      tenantId,
      agentInstructionWeight: 1,
      assetSummaryWeight: 1,
      humanDocumentWeight: 2,
      exactPhraseBoost: 0
    });
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      tenantId,
      stableId,
      instruction: {
        instructionKind: "guardrail",
        body: uniqueToken
      },
      humanDocument: {
        format: "markdown",
        body: uniqueToken
      }
    });

    await retrievalRepository.indexAsset(asset);
    const results = await retrievalRepository.search({
      tenantId,
      query: uniqueToken,
      limit: 5
    });

    expect(stored).toMatchObject({
      tenantId,
      humanDocumentWeight: 2,
      source: "stored"
    });
    expect(results.map((result) => result.sourceKind)).toEqual([
      "human-document",
      "agent-instruction"
    ]);
    expect(results[0]?.ranking.sourceKindWeight).toBe(2);
    expect((await rankingPolicyRepository.getPolicy(tenantId)).humanDocumentWeight).toBe(2);
  });

  it("persists hash embeddings and supports Postgres vector retrieval", async () => {
    const registryRepository = new PostgresRegistryRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool);
    const tenantId = `tenant_vector_${Date.now()}`;
    const stableId = `guardrail.vector-${Date.now()}`;
    const uniqueToken = `vectortoken${Date.now()}`;
    const asset = await registryRepository.createAsset({
      ...sampleAsset,
      tenantId,
      stableId,
      summary: `Vector retrieval smoke test guidance for ${uniqueToken}.`
    });

    await retrievalRepository.indexAsset(asset);
    const embeddingCount = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM asset_chunks WHERE asset_id = $1 AND embedding IS NOT NULL",
      [asset.asset.id]
    );
    const vectorResults = await retrievalRepository.search({
      tenantId,
      query: uniqueToken,
      strategy: "vector",
      limit: 5
    });
    const hybridResults = await retrievalRepository.search({
      tenantId,
      query: uniqueToken,
      strategy: "hybrid",
      limit: 5
    });

    expect(Number.parseInt(embeddingCount.rows[0]?.count ?? "0", 10)).toBeGreaterThan(0);
    expect(vectorResults[0]?.asset.stableId).toBe(stableId);
    expect(vectorResults[0]?.ranking.strategy).toBe("vector-hash-v1");
    expect(vectorResults[0]?.ranking.vectorSimilarity).toBeGreaterThan(0);
    expect(hybridResults[0]?.asset.stableId).toBe(stableId);
    expect(hybridResults[0]?.ranking.strategy).toBe("hybrid-hash-lexical-v1");
  });

  it("persists managed query feedback records", async () => {
    const feedbackRepository = new PostgresManagedQueryFeedbackRepository(pool);
    const tenantId = "tenant_demo";
    const recorded = await feedbackRepository.recordFeedback({
      tenantId,
      telemetryEventId: `retrieval_${Date.now()}`,
      query: "citation accuracy",
      outcome: "accepted",
      factualCitationAccuracy: 5,
      policyCompliance: 5,
      taskCompletionQuality: 4,
      consistency: 4,
      responseEffectiveness: 5,
      notes: "Accepted by evaluator",
      metadata: {
        source: "postgres-test"
      }
    });

    const feedback = await feedbackRepository.listFeedback({ tenantId });

    expect(feedback[0]?.id).toBe(recorded.id);
    expect(feedback[0]?.metadata.source).toBe("postgres-test");
  });

	  it("persists managed query eval run history", async () => {
	    const evalRunRepository = new PostgresManagedQueryEvalRunRepository(pool);
    const tenantId = "tenant_demo";
    const recorded = await evalRunRepository.recordRun({
      tenantId,
      report: sampleEvalReport(tenantId),
      metadata: {
        source: "postgres-test"
      }
    });

    const runs = await evalRunRepository.listRuns({ tenantId });

    expect(runs[0]?.id).toBe(recorded.id);
    expect(runs[0]?.ok).toBe(true);
    expect(runs[0]?.report.results[0]?.id).toBe("eval.citation-accuracy");
	    expect(runs[0]?.metadata.source).toBe("postgres-test");
	  });

  it("persists managed query eval schedule policies and due status", async () => {
    const evalRunRepository = new PostgresManagedQueryEvalRunRepository(pool);
    const scheduleRepository = new PostgresManagedQueryEvalSchedulePolicyRepository(pool);
    const tenantId = `tenant_eval_schedule_${Date.now()}`;

    await pool.query(
      "INSERT INTO tenants (id, slug, name) VALUES ($1, $1, $1) ON CONFLICT DO NOTHING",
      [tenantId]
    );

    const evalRun = await evalRunRepository.recordRun({
      tenantId,
      report: sampleEvalReport(tenantId),
      metadata: {
        source: "schedule-postgres-test"
      }
    });

    await expect(scheduleRepository.upsertPolicy({
      tenantId,
      enabled: true
    })).rejects.toThrow("managed_query_eval_schedule_requires_cases");

    const policy = await scheduleRepository.upsertPolicy({
      tenantId,
      enabled: true,
      intervalMinutes: 30,
      evalInput: {
        cases: [
          {
            id: "eval.postgres",
            query: "postgres schedule",
            expectedStableIds: ["policy.postgres"],
            requiredCitationCount: 1
          }
        ]
      }
    });

    expect(policy.source).toBe("stored");
    expect(policy.evalInput?.cases[0]?.id).toBe("eval.postgres");
    expect((await scheduleRepository.listDuePolicies({ now: "2026-06-17T00:00:00.000Z" }))
      .map((candidate) => candidate.tenantId)).toContain(tenantId);

    const recorded = await scheduleRepository.recordRunResult({
      tenantId,
      evalRunId: evalRun.id,
      status: "passed",
      ranAt: "2026-06-17T00:00:00.000Z"
    });

    expect(recorded.lastStatus).toBe("passed");
    expect(recorded.lastEvalRunId).toBe(evalRun.id);
    expect((await scheduleRepository.listDuePolicies({ now: "2026-06-17T00:29:00.000Z" }))
      .map((candidate) => candidate.tenantId)).not.toContain(tenantId);
    expect((await scheduleRepository.listDuePolicies({ now: "2026-06-17T00:30:00.000Z" }))
      .map((candidate) => candidate.tenantId)).toContain(tenantId);
  });

	  it("stores telemetry retention policies and purges old telemetry records", async () => {
    const authRepository = new PostgresAuthRepository(pool);
    const retrievalRepository = new PostgresRetrievalRepository(pool);
    const feedbackRepository = new PostgresManagedQueryFeedbackRepository(pool);
    const policyRepository = new PostgresTelemetryRetentionPolicyRepository(pool);
    const tenantId = `tenant_retention_${Date.now()}`;
    const user = await authRepository.createUser({
      tenantId,
      email: `retention-${Date.now()}@example.test`,
      displayName: "Retention Admin",
      role: "admin"
    });
    const apiKey = requireTestValue(await authRepository.createApiKey({
      tenantId,
      userId: user.id,
      name: "retention-admin",
      scopes: ["admin", "asset:read"]
    }));
    const audit = await authRepository.recordAuditEvent({
      tenantId,
      actorUserId: user.id,
      actorApiKeyId: apiKey.apiKey.id,
      action: "retention.old",
      targetType: "test",
      outcome: "success"
    });
    const retrieval = await retrievalRepository.recordRetrievalEvent({
      tenantId,
      actorUserId: user.id,
      actorApiKeyId: apiKey.apiKey.id,
      surface: "api",
      query: "old telemetry",
      resultCount: 1,
      deniedCount: 0,
      latencyMs: 1
    });
    const feedback = await feedbackRepository.recordFeedback({
      tenantId,
      telemetryEventId: retrieval.id,
      actorUserId: user.id,
      actorApiKeyId: apiKey.apiKey.id,
      query: "old telemetry",
      outcome: "accepted"
    });

    await pool.query("UPDATE audit_events SET created_at = now() - interval '40 days' WHERE id = $1", [audit.id]);
    await pool.query("UPDATE retrieval_events SET created_at = now() - interval '40 days' WHERE id = $1", [retrieval.id]);
    await pool.query("UPDATE managed_query_feedback SET created_at = now() - interval '40 days' WHERE id = $1", [feedback.id]);

    const policy = await policyRepository.upsertPolicy({
      tenantId,
      retrievalEventRetentionDays: 30,
      auditEventRetentionDays: 30,
      feedbackRetentionDays: 30,
      updatedByUserId: user.id,
      updatedByApiKeyId: apiKey.apiKey.id
    });
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    expect(policy).toMatchObject({
      source: "stored",
      retrievalEventRetentionDays: 30,
      auditEventRetentionDays: 30,
      feedbackRetentionDays: 30
    });
    expect((await policyRepository.listPolicies({ tenantIds: [tenantId] }))[0]?.tenantId).toBe(tenantId);
    expect((await policyRepository.listPolicies()).map((listedPolicy) => listedPolicy.tenantId)).toContain(tenantId);
    expect(await retrievalRepository.purgeRetrievalEvents({ tenantId, before: cutoff, dryRun: true })).toBe(1);
    expect(await authRepository.purgeAuditEvents({ tenantId, before: cutoff, dryRun: true })).toBe(1);
    expect(await feedbackRepository.purgeFeedback({ tenantId, before: cutoff, dryRun: true })).toBe(1);

    const dryRunResult = await purgeTelemetryForRetentionPolicy({
      tenantId,
      dryRun: true,
      policy,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      now: new Date()
    });

    expect(dryRunResult.retrievalEvents.deletedCount).toBe(1);
    expect(dryRunResult.auditEvents.deletedCount).toBe(1);
    expect(dryRunResult.managedQueryFeedback.deletedCount).toBe(1);

    const purgeResult = await purgeTelemetryForRetentionPolicy({
      tenantId,
      dryRun: false,
      policy,
      authRepository,
      retrievalRepository,
      feedbackRepository,
      now: new Date()
    });

    expect(purgeResult.retrievalEvents.deletedCount).toBe(1);
    expect(purgeResult.auditEvents.deletedCount).toBe(1);
    expect(purgeResult.managedQueryFeedback.deletedCount).toBe(1);
    expect(await retrievalRepository.listRetrievalEvents({ tenantId })).toHaveLength(0);
    expect(await authRepository.listAuditEvents({ tenantId })).toHaveLength(0);
    expect(await feedbackRepository.listFeedback({ tenantId })).toHaveLength(0);
  });

  it("persists model provider configuration stubs", async () => {
    const repository = new PostgresModelProviderConfigRepository(pool);
    const tenantId = "tenant_demo";
    const created = await repository.upsertProviderConfig({
      tenantId,
      provider: "openrouter",
      enabled: true,
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnvVar: "OPENROUTER_API_KEY",
      defaultModel: "openai/gpt-5.1",
      availableModels: ["openai/gpt-5.1"],
      priority: 30
    });

    const providers = await repository.listProviderConfigs({ tenantId });

    expect(providers.map((provider) => provider.id)).toContain(created.id);
    expect(providers.find((provider) => provider.id === created.id)?.apiKeyEnvVar).toBe("OPENROUTER_API_KEY");
  });

  it("persists managed-query cache entries with hit accounting", async () => {
    const repository = new PostgresManagedQueryCacheRepository(pool);
    const tenantId = "tenant_demo";
    const cacheKey = `cache_${Date.now()}`;
    const created = await repository.upsert({
      tenantId,
      cacheKey,
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Cached provider answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const hit = await repository.getFresh({ tenantId, cacheKey });
    const expiredKey = `cache_expired_${Date.now()}`;

    await repository.upsert({
      tenantId,
      cacheKey: expiredKey,
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Expired provider answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() - 1000).toISOString()
    });

    expect(created.cacheKey).toBe(cacheKey);
    expect(hit?.answer).toBe("Cached provider answer");
    expect(hit?.hitCount).toBe(1);
    expect(hit?.lastHitAt).toBeTruthy();
    expect((await repository.listEntries({ tenantId })).map((entry) => entry.cacheKey)).toContain(cacheKey);
    const deleted = await repository.deleteEntry({ tenantId, cacheKey });

    expect(deleted?.answer).toBe("Cached provider answer");
    expect(await repository.getFresh({ tenantId, cacheKey })).toBeNull();
    expect(await repository.deleteEntry({ tenantId, cacheKey })).toBeNull();
    expect(await repository.purgeExpired({
      tenantId,
      expiredBefore: new Date().toISOString(),
      dryRun: true
    })).toBeGreaterThanOrEqual(1);
    expect(await repository.purgeExpired({
      tenantId,
      expiredBefore: new Date().toISOString(),
      dryRun: false
    })).toBeGreaterThanOrEqual(1);
  });

  it("invalidates managed-query cache entries for one tenant", async () => {
    const repository = new PostgresManagedQueryCacheRepository(pool);
    const suffix = Date.now();
    const tenantA = `tenant_cache_invalidate_a_${suffix}`;
    const tenantB = `tenant_cache_invalidate_b_${suffix}`;

    await pool.query(
      `
        INSERT INTO tenants (id, slug, name)
        VALUES ($1, $1, $1), ($2, $2, $2)
        ON CONFLICT (id) DO NOTHING
      `,
      [tenantA, tenantB]
    );

    await repository.upsert({
      tenantId: tenantA,
      cacheKey: `cache_a_${suffix}`,
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Tenant A cached answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    await repository.upsert({
      tenantId: tenantB,
      cacheKey: `cache_b_${suffix}`,
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Tenant B cached answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    expect(await repository.invalidateTenant({ tenantId: tenantA, dryRun: true })).toBe(1);
    expect(await repository.listEntries({ tenantId: tenantA })).toHaveLength(1);
    expect(await repository.invalidateTenant({ tenantId: tenantA })).toBe(1);
    expect(await repository.listEntries({ tenantId: tenantA })).toHaveLength(0);
    expect(await repository.listEntries({ tenantId: tenantB })).toHaveLength(1);
  });

  it("persists managed-query cache policy overrides", async () => {
    const repository = new PostgresManagedQueryCachePolicyRepository(pool);
    const tenantId = `tenant_cache_policy_${Date.now()}`;
    const defaults = await repository.getPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      cacheEnabled: true,
      maxCacheTtlSeconds: 3600,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId,
      cacheEnabled: false,
      maxCacheTtlSeconds: null
    });

    expect(stored).toMatchObject({
      tenantId,
      cacheEnabled: false,
      maxCacheTtlSeconds: null,
      source: "stored"
    });
    expect((await repository.getPolicy(tenantId)).cacheEnabled).toBe(false);
  });

  it("persists managed-query policy overrides", async () => {
    const repository = new PostgresManagedQueryPolicyRepository(pool);
    const tenantId = `tenant_query_policy_${Date.now()}`;
    const defaults = await repository.getPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      defaultMode: "deterministic-retrieval",
      allowedModes: ["deterministic-retrieval", "provider-routed"],
      minimumCitationCount: 1,
      requireGrounded: false,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId,
      defaultMode: "provider-routed",
      allowedModes: ["provider-routed"],
      minimumCitationCount: 2,
      requireGrounded: true
    });

    expect(stored).toMatchObject({
      tenantId,
      defaultMode: "provider-routed",
      allowedModes: ["provider-routed"],
      minimumCitationCount: 2,
      requireGrounded: true,
      source: "stored"
    });
    expect((await repository.getPolicy(tenantId)).minimumCitationCount).toBe(2);
  });

  it("persists action execution policies and action requests", async () => {
    const repository = new PostgresAgentActionExecutionRepository(pool);
    const authRepository = new PostgresAuthRepository(pool);
    const tenantId = `tenant_action_execution_${Date.now()}`;
    const requester = await authRepository.createUser({
      tenantId,
      email: `action-requester-${Date.now()}@example.test`,
      displayName: "Action Requester",
      role: "reader"
    });
    const defaults = await repository.getPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      enabled: false,
      allowedActionTypes: [],
      requireApproval: true,
      dryRunDefault: true,
      killSwitch: false,
      maxRequestsPerHour: 60,
      approvalExpiresInMinutes: 1440,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId,
      enabled: true,
      allowedActionTypes: ["create-task-record"],
      requireApproval: true,
      dryRunDefault: false,
      killSwitch: false,
      maxRequestsPerHour: 3,
      approvalExpiresInMinutes: 45
    });

    expect(stored).toMatchObject({
      tenantId,
      enabled: true,
      allowedActionTypes: ["create-task-record"],
      dryRunDefault: false,
      maxRequestsPerHour: 3,
      approvalExpiresInMinutes: 45,
      source: "stored"
    });

    const approvalExpiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const request = await repository.createRequest({
      tenantId,
      actionType: "create-task-record",
      title: "Create review task",
      target: "task://review",
      idempotencyKey: "postgres-action-retry-key",
      dryRun: false,
      payload: {
        stableId: "policy.action-execution"
      },
      status: "approval-required",
      reason: "approval_required",
      policySnapshot: {
        enabled: true,
        requireApproval: true,
        approvalExpiresInMinutes: 45
      },
      approvalExpiresAt,
      metadata: {
        test: true
      },
      requestedByUserId: requester.id
    });

    expect(request).toMatchObject({
      tenantId,
      actionType: "create-task-record",
      target: "task://review",
      idempotencyKey: "postgres-action-retry-key",
      status: "approval-required",
      dryRun: false,
      approvalExpiresAt
    });
    expect(await repository.getRequest(tenantId, request.id)).toMatchObject({ id: request.id });
    expect(await repository.getRequestByIdempotencyKey({
      tenantId,
      idempotencyKey: "postgres-action-retry-key",
      requestedByUserId: requester.id
    })).toMatchObject({ id: request.id });
    const duplicate = await repository.createRequest({
      tenantId,
      actionType: "create-task-record",
      title: "Duplicate retry",
      target: "task://other",
      idempotencyKey: "postgres-action-retry-key",
      dryRun: false,
      payload: {
        stableId: "policy.action-execution-retry"
      },
      status: "approval-required",
      reason: "approval_required",
      requestedByUserId: requester.id
    });
    expect(duplicate.id).toBe(request.id);
    expect((await repository.listRequests({ tenantId, limit: 5 }))[0]?.id).toBe(request.id);
    expect(await repository.countRequestsSince(tenantId, new Date(Date.now() - 60 * 60 * 1000))).toBe(1);

    const decided = await repository.decideRequest({
      tenantId,
      actionRequestId: request.id,
      decision: "approve",
      status: "executed",
      reason: "Approved",
      result: {
        taskRecordCreated: true,
        externalSideEffects: false
      },
      metadata: {
        decisionSurface: "test"
      }
    });

    expect(decided).toMatchObject({
      status: "executed",
      reason: "Approved",
      result: {
        taskRecordCreated: true,
        externalSideEffects: false
      }
    });
    expect(decided?.metadata).toMatchObject({
      test: true,
      decisionSurface: "test"
    });
    expect(decided?.executedAt).toBeTruthy();
  });

  it("persists managed-query retention policy overrides", async () => {
    const repository = new PostgresManagedQueryRetentionPolicyRepository(pool);
    const tenantId = `tenant_query_retention_${Date.now()}`;
    const defaults = await repository.getPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      promptCaptureMode: "disabled",
      responseCaptureMode: "disabled",
      metadataRetentionDays: 30,
      source: "default"
    });

    const stored = await repository.upsertPolicy({
      tenantId,
      promptCaptureMode: "metadata-only",
      responseCaptureMode: "metadata-only",
      metadataRetentionDays: null
    });

    expect(stored).toMatchObject({
      tenantId,
      promptCaptureMode: "metadata-only",
      responseCaptureMode: "metadata-only",
      metadataRetentionDays: null,
      source: "stored"
    });
    expect((await repository.getPolicy(tenantId)).promptCaptureMode).toBe("metadata-only");
  });

  it("persists secret-reference policy overrides", async () => {
    const repository = new PostgresSecretReferencePolicyRepository(pool);
    const tenantId = `tenant_secret_policy_${Date.now()}`;
    const defaults = await repository.getPolicy(tenantId);

    expect(defaults).toMatchObject({
      tenantId,
      allowedEnvVarPrefixes: expect.arrayContaining(["OPENAI_", "ENTRA_"]),
      allowedEnvVars: [],
      allowUnlistedEnvVars: false,
      source: "default"
    });
    expect(isSecretEnvVarAllowed(defaults, "PATH")).toBe(false);

    const stored = await repository.upsertPolicy({
      tenantId,
      allowedEnvVarPrefixes: ["CUSTOM_"],
      allowedEnvVars: ["SPECIAL_PROVIDER_SECRET"],
      allowUnlistedEnvVars: false
    });

    expect(stored).toMatchObject({
      tenantId,
      allowedEnvVarPrefixes: ["CUSTOM_"],
      allowedEnvVars: ["SPECIAL_PROVIDER_SECRET"],
      allowUnlistedEnvVars: false,
      source: "stored"
    });
    expect((await repository.getPolicy(tenantId)).allowedEnvVars).toEqual(["SPECIAL_PROVIDER_SECRET"]);
    expect(isSecretEnvVarAllowed(stored, "CUSTOM_PROVIDER_SECRET")).toBe(true);
    expect(isSecretEnvVarAllowed(stored, "OPENAI_API_KEY")).toBe(false);
  });

  it("purges expired managed-query cache entries across Postgres tenants", async () => {
    const repository = new PostgresManagedQueryCacheRepository(pool);
    const suffix = Date.now();
    const tenantA = `tenant_cache_all_a_${suffix}`;
    const tenantB = `tenant_cache_all_b_${suffix}`;
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    const expiredBefore = new Date().toISOString();

    await pool.query(
      `
        INSERT INTO tenants (id, slug, name)
        VALUES ($1, $2, $3), ($4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `,
      [tenantA, tenantA, "Cache Test Tenant A", tenantB, tenantB, "Cache Test Tenant B"]
    );

    await repository.upsert({
      tenantId: tenantA,
      cacheKey: `expired_a_${suffix}`,
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Expired tenant A provider answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: expiredAt
    });
    await repository.upsert({
      tenantId: tenantB,
      cacheKey: `expired_b_${suffix}`,
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Expired tenant B provider answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: expiredAt
    });
    await repository.upsert({
      tenantId: tenantB,
      cacheKey: `fresh_b_${suffix}`,
      provider: "openai",
      model: "gpt-test",
      mode: "provider-routed",
      queryHash: "query_hash",
      surface: "api",
      principalHash: "principal_hash",
      contextHash: "context_hash",
      answer: "Fresh tenant B provider answer",
      generation: sampleManagedQueryGeneration("openai", "gpt-test"),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    const dryRunResults = await repository.purgeExpiredForAllTenants({
      expiredBefore,
      dryRun: true
    });

    expect(dryRunResults.find((result) => result.tenantId === tenantA)?.deletedCount).toBe(1);
    expect(dryRunResults.find((result) => result.tenantId === tenantB)?.deletedCount).toBe(1);
    expect(await repository.listEntries({ tenantId: tenantA })).toHaveLength(1);

    const executeResults = await repository.purgeExpiredForAllTenants({
      expiredBefore,
      dryRun: false
    });

    expect(executeResults.find((result) => result.tenantId === tenantA)?.deletedCount).toBe(1);
    expect(executeResults.find((result) => result.tenantId === tenantB)?.deletedCount).toBe(1);
    expect(await repository.listEntries({ tenantId: tenantA })).toHaveLength(0);
    expect((await repository.listEntries({ tenantId: tenantB })).map((entry) => entry.cacheKey)).toEqual([
      `fresh_b_${suffix}`
    ]);
  });

  it("persists external auth provider configuration stubs", async () => {
    const repository = new PostgresAuthProviderConfigRepository(pool);
    const tenantId = `tenant_auth_provider_${Date.now()}`;
    const created = await repository.upsertAuthProviderConfig({
      tenantId,
      provider: "microsoft-entra",
      enabled: true,
      displayName: "Microsoft Entra ID",
      issuerUrl: "https://login.microsoftonline.com/common/v2.0",
      clientId: "agentic-cms",
      clientSecretEnvVar: "ENTRA_CLIENT_SECRET",
	      redirectUri: "http://localhost:3000/auth/oidc/callback",
	      groupClaim: "groups",
	      autoProvisionUsers: true,
	      accountLinkingMode: "email",
	      groupSyncEnabled: true,
	      allowedDomains: ["example.com"],
      priority: 10
    });

    const configs = await repository.listAuthProviderConfigs({ tenantId });

	    expect(configs.map((config) => config.id)).toContain(created.id);
	    expect(configs.find((config) => config.id === created.id)?.clientSecretEnvVar).toBe("ENTRA_CLIENT_SECRET");
	    expect(configs.find((config) => config.id === created.id)?.accountLinkingMode).toBe("email");
	    expect(configs.find((config) => config.id === created.id)?.groupSyncEnabled).toBe(true);
  });
});

function sampleManagedQueryGeneration(provider: "openai" | "anthropic" | "openrouter", model: string) {
  return {
    provider,
    model,
    status: "completed" as const,
    reason: null,
    latencyMs: 10,
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      estimatedCostUsd: null
    },
    attempts: [
      {
        provider,
        model,
        status: "completed" as const,
        reason: null,
        latencyMs: 10
      }
    ]
  };
}

function requireTestValue<T>(value: T | null | undefined): T {
  expect(value).toBeTruthy();

  if (!value) {
    throw new Error("Expected test value to be present");
  }

  return value;
}
