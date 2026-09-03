import { describe, expect, it } from "vitest";
import { InMemoryLocalSyncStateRepository } from "./local-sync.js";

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
});
