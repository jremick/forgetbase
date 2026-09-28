import { describe, expect, it } from "vitest";
import {
  InMemoryLocalSyncSnapshotRepository,
  InMemoryLocalSyncStateRepository,
  InMemoryAuthRepository,
  InMemoryRegistryRepository
} from "./index.js";
import type { AuthPrincipal } from "@forgetbase/schema";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

describe("local sync state", () => {
  it("increments authorization and content counters independently", async () => {
    const repository = new InMemoryLocalSyncStateRepository();
    const identity = {
      tenantId: "tenant_demo",
      principalType: "user" as const,
      principalId: "user_1"
    };
    const first = await repository.resolveState({
      ...identity,
      entitlementHash: digest("a"),
      recordSetHash: digest("b"),
      recordDescriptors: [{ stableId: "policy.one", payloadHash: digest("b") }]
    });
    const same = await repository.resolveState({
      ...identity,
      entitlementHash: first.entitlementHash,
      recordSetHash: first.recordSetHash,
      recordDescriptors: first.recordDescriptors
    });
    const contentChanged = await repository.resolveState({
      ...identity,
      entitlementHash: first.entitlementHash,
      recordSetHash: digest("c"),
      recordDescriptors: [{ stableId: "policy.one", payloadHash: digest("c") }]
    });
    const permissionsChanged = await repository.resolveState({
      ...identity,
      entitlementHash: digest("d"),
      recordSetHash: contentChanged.recordSetHash,
      recordDescriptors: contentChanged.recordDescriptors
    });

    expect(first.authorizationEpoch).toBe(1);
    expect(same).toMatchObject({ authorizationEpoch: 1, contentGeneration: 1 });
    expect(contentChanged).toMatchObject({ authorizationEpoch: 1, contentGeneration: 2 });
    expect(contentChanged.previousRecordSetHash).toBe(first.recordSetHash);
    expect(contentChanged.previousRecordDescriptors).toEqual(first.recordDescriptors);
    expect(permissionsChanged).toMatchObject({ authorizationEpoch: 2, contentGeneration: 2 });
    expect(await repository.bumpAuthorizationEpoch(identity)).toBe(3);
    const afterBump = await repository.resolveState({
      ...identity,
      entitlementHash: permissionsChanged.entitlementHash,
      recordSetHash: permissionsChanged.recordSetHash,
      recordDescriptors: permissionsChanged.recordDescriptors
    });
    expect(afterBump.authorizationEpoch).toBe(3);
  });

  it("does not create authorization state merely to revoke an unknown device", async () => {
    const repository = new InMemoryLocalSyncStateRepository();
    expect(await repository.bumpAuthorizationEpoch({
      tenantId: "tenant_demo",
      principalType: "user",
      principalId: "unknown"
    })).toBeNull();
  });

  it("requires mutation revisions and rejects a changed in-memory snapshot before lease issuance", async () => {
    const registry = new InMemoryRegistryRepository();
    const auth = new InMemoryAuthRepository();
    const state = new InMemoryLocalSyncStateRepository();
    const principal = {
      tenantId: "tenant_demo",
      principalType: "user",
      principalId: "user_1",
      userId: "user_1",
      serviceAccountId: null,
      apiKeyId: "key_1",
      email: "user@example.test",
      displayName: "User",
      role: "admin",
      scopes: ["local:sync"],
      allowedSurfaces: ["local-cache"],
      groupIds: []
    } satisfies AuthPrincipal;
    await registry.createAsset({
      tenantId: "tenant_demo",
      stableId: "policy.one",
      type: "policy",
      ownerId: "user_1",
      title: "Policy one",
      summary: "A policy",
      lifecycleState: "active",
      sensitivity: "public-demo",
      audience: ["developers"],
      status: "approved",
      reviewDueAt: "2027-01-01",
      sourceKind: "synthetic",
      sourceRef: "source://policy.one",
      allowedSurfaces: ["local-cache"],
      allowedExports: [],
      allowedActions: [],
      humanDocument: {
        format: "markdown",
        body: "A policy"
      }
    });
    const snapshots = new InMemoryLocalSyncSnapshotRepository(registry, auth, state);
    const captured = await snapshots.buildSnapshot({
      principal,
      sensitivities: ["public-demo"],
      maxRecords: 10,
      maxRecordBytes: 10_000,
      maxSnapshotBytes: 100_000
    }, (detail) => ({
      record: detail.asset.stableId,
      descriptor: { stableId: detail.asset.stableId, payloadHash: digest("a") }
    }));
    expect(captured.state?.recordDescriptors).toHaveLength(1);
    expect(captured.state?.authorizationEpoch).toBe(1);
    expect(captured.state?.contentGeneration).toBe(1);
    expect(captured.serializationRevision).toBe(1);
    expect(captured.serializationFingerprint).toBe("1:0:1");
    await registry.updateAsset("policy.one", {
      tenantId: "tenant_demo",
      summary: "Changed policy",
      humanDocument: {
        format: "markdown",
        body: "Changed policy"
      }
    });
    await expect(snapshots.assertSnapshotCurrent({
      principal,
      serializationRevision: captured.serializationRevision,
      serializationFingerprint: captured.serializationFingerprint,
      state: captured.state!
    }, () => "lease")).rejects.toThrow(/stale/);
    expect(() => new InMemoryLocalSyncSnapshotRepository(
      {} as import("./index.js").RegistryRepository,
      auth,
      state
    )).toThrow(/mutation revision/);
  });
});
