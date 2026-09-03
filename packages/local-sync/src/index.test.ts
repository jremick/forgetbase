import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  localSyncConfigurationSchema,
  localSyncRecordSchema,
  type LocalSyncConfiguration,
  type LocalSyncManifestBundle,
  type LocalSyncRecord
} from "@forgetbase/schema";
import {
  canonicalJson,
  computeLocalSyncEntitlementHash,
  computeLocalSyncRecordSetHash,
  createEd25519LocalSyncSigner,
  createLocalDeviceAuthorizationCode,
  createLocalDeviceAuthorizationRequest,
  createLocalDevicePkceChallenge,
  createLocalDevicePkcePair,
  createLocalSyncManifestBundle,
  sha256Digest,
  verifyLocalDeviceAuthorizationCode,
  verifyLocalDeviceAuthorizationRequest,
  verifyLocalSyncManifestBundle
} from "./index.js";

function record(stableId: string, revision = 1): LocalSyncRecord {
  const assetId = `asset_${stableId}`;
  const versionId = `version_${stableId}_${revision}`;
  const payload = {
    recordId: `record_${stableId}`,
    asset: {
      id: assetId,
      tenantId: "tenant_demo",
      stableId,
      type: "policy" as const,
      ownerId: "user_admin",
      title: `Title ${stableId} revision ${revision}`,
      summary: `Summary ${stableId}`,
      lifecycleState: "active" as const,
      sensitivity: "public-demo" as const,
      audience: ["all-staff"],
      status: "approved",
      reviewDueAt: "2027-01-01",
      allowedSurfaces: ["local-cache" as const],
      allowedExports: [],
      allowedActions: [],
      sourceKind: "synthetic-demo",
      sourceRef: stableId,
      currentVersionId: versionId,
      metadata: {},
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z"
    },
    version: {
      id: versionId,
      assetId,
      versionNumber: revision,
      contentHash: `content-hash-${revision}`,
      metadata: {},
      createdBy: "user_admin",
      createdAt: "2026-09-03T00:00:00.000Z",
      changeNote: null
    },
    instructionObjects: [{
      id: `instruction_${stableId}`,
      assetId,
      versionId,
      instructionKind: "policy",
      targetAgents: ["coding-agent"],
      body: `Follow ${stableId}`,
      inputContract: {},
      outputContract: {},
      constraints: [],
      examples: [],
      failureModes: [],
      escalation: null,
      createdAt: "2026-09-03T00:00:00.000Z"
    }],
    humanDocuments: []
  };
  return localSyncRecordSchema.parse({
    ...payload,
    payloadHash: sha256Digest(canonicalJson(payload))
  });
}

function fixture(): {
  configuration: LocalSyncConfiguration;
  bundle: LocalSyncManifestBundle;
} {
  const { privateKey } = generateKeyPairSync("ed25519");
  const signer = createEd25519LocalSyncSigner({ keyId: "local-sync-key-1", privateKey });
  const configuration = localSyncConfigurationSchema.parse({
    protocolVersion: "1",
    serverId: "server_demo",
    tenantId: "tenant_demo",
    principalType: "service-account",
    principalId: "service_local",
    signingKeyId: signer.keyId,
    signingPublicKey: signer.publicKey,
    leaseDurationSeconds: 3_600,
    minimumClientVersion: "0.1.0",
    allowedSensitivities: ["public-demo", "internal"],
    maxRecords: 5_000,
    maxRecordsPerPage: 100,
    maxRecordBytes: 2 * 1024 * 1024,
    maxSnapshotBytes: 100 * 1024 * 1024
  });
  const bundle = createLocalSyncManifestBundle({
    signer,
    serverId: configuration.serverId,
    tenantId: configuration.tenantId,
    principalType: configuration.principalType,
    principalId: configuration.principalId,
    authorizationEpoch: 3,
    contentGeneration: 8,
    records: [record("policy.b"), record("policy.a")],
    issuedAt: new Date("2026-09-03T00:00:00.000Z"),
    leaseDurationSeconds: configuration.leaseDurationSeconds,
    minimumClientVersion: configuration.minimumClientVersion,
    allowedSensitivities: configuration.allowedSensitivities,
    maxRecordsPerPage: 1
  });
  return { configuration, bundle };
}

describe("local sync signed manifests", () => {
  it("canonicalizes object keys and verifies an ordered page chain", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(computeLocalSyncEntitlementHash([record("policy.ä"), record("policy.z")])).toBe(
      sha256Digest(canonicalJson(["policy.z", "policy.ä"]))
    );
    const { configuration, bundle } = fixture();

    const verified = verifyLocalSyncManifestBundle(bundle, {
      configuration,
      now: new Date("2026-09-03T00:30:00.000Z")
    });

    expect(verified.records.map((entry) => entry.asset.stableId)).toEqual(["policy.a", "policy.b"]);
    expect(verified.page.authorizationEpoch).toBe(3);
  });

  it("rejects tampering, reordered pages, expired leases, and rollback", () => {
    const { configuration, bundle } = fixture();
    const tampered = structuredClone(bundle);
    tampered.pages[0]!.records[0]!.asset.title = "Tampered";
    expect(() => verifyLocalSyncManifestBundle(tampered, {
      configuration,
      now: new Date("2026-09-03T00:30:00.000Z")
    })).toThrow(/page hash is invalid/);

    const reordered = structuredClone(bundle);
    reordered.pages.reverse();
    expect(() => verifyLocalSyncManifestBundle(reordered, {
      configuration,
      now: new Date("2026-09-03T00:30:00.000Z")
    })).toThrow(/page order or chain|metadata is inconsistent/);

    expect(() => verifyLocalSyncManifestBundle(bundle, {
      configuration,
      now: new Date("2026-09-03T02:00:00.000Z")
    })).toThrow(/lease has expired/);

    expect(() => verifyLocalSyncManifestBundle(bundle, {
      configuration,
      now: new Date("2026-09-03T00:30:00.000Z"),
      minimumAuthorizationEpoch: 4
    })).toThrow(/high-water mark/);
  });

  it("returns a signed empty delta when the caller already has the current generation", () => {
    const { configuration, bundle } = fixture();
    const current = bundle.pages[0]!;
    const { privateKey } = generateKeyPairSync("ed25519");
    const signer = createEd25519LocalSyncSigner({ keyId: "replacement", privateKey });
    const replacementConfiguration = localSyncConfigurationSchema.parse({
      ...configuration,
      signingKeyId: signer.keyId,
      signingPublicKey: signer.publicKey
    });
    const unchanged = createLocalSyncManifestBundle({
      signer,
      serverId: replacementConfiguration.serverId,
      tenantId: replacementConfiguration.tenantId,
      principalType: replacementConfiguration.principalType,
      principalId: replacementConfiguration.principalId,
      authorizationEpoch: current.authorizationEpoch,
      contentGeneration: current.contentGeneration,
      records: [record("policy.a"), record("policy.b")],
      issuedAt: new Date("2026-09-03T00:00:00.000Z"),
      leaseDurationSeconds: replacementConfiguration.leaseDurationSeconds,
      minimumClientVersion: replacementConfiguration.minimumClientVersion,
      allowedSensitivities: replacementConfiguration.allowedSensitivities,
      knownAuthorizationEpoch: current.authorizationEpoch,
      knownContentGeneration: current.contentGeneration,
      knownRecordSetHash: current.recordSetHash
    });

    expect(unchanged.pages).toHaveLength(1);
    expect(unchanged.pages[0]!.mode).toBe("unchanged");
    expect(unchanged.pages[0]!.records).toEqual([]);
    expect(verifyLocalSyncManifestBundle(unchanged, {
      configuration: replacementConfiguration,
      now: new Date("2026-09-03T00:30:00.000Z")
    }).records).toEqual([]);
  });

  it("signs and verifies a bounded delta against its explicit base generation", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const signer = createEd25519LocalSyncSigner({ keyId: "delta-key", privateKey });
    const configuration = localSyncConfigurationSchema.parse({
      protocolVersion: "1",
      serverId: "server_demo",
      tenantId: "tenant_demo",
      principalType: "user",
      principalId: "user_delta",
      signingKeyId: signer.keyId,
      signingPublicKey: signer.publicKey,
      leaseDurationSeconds: 3_600,
      minimumClientVersion: "0.1.0",
      allowedSensitivities: ["public-demo"],
      maxRecords: 5_000,
      maxRecordsPerPage: 100,
      maxRecordBytes: 2 * 1024 * 1024,
      maxSnapshotBytes: 100 * 1024 * 1024
    });
    const base = [record("policy.a"), record("policy.b")];
    const changed = record("policy.b", 2);
    const finalRecords = [changed, record("policy.c")];
    const bundle = createLocalSyncManifestBundle({
      signer,
      serverId: configuration.serverId,
      tenantId: configuration.tenantId,
      principalType: configuration.principalType,
      principalId: configuration.principalId,
      authorizationEpoch: 2,
      contentGeneration: 2,
      records: finalRecords,
      issuedAt: new Date("2026-09-03T00:00:00.000Z"),
      leaseDurationSeconds: configuration.leaseDurationSeconds,
      minimumClientVersion: configuration.minimumClientVersion,
      allowedSensitivities: configuration.allowedSensitivities,
      delta: {
        baseRecordSetHash: computeLocalSyncRecordSetHash(base),
        records: [changed, record("policy.c")],
        removedStableIds: ["policy.a"]
      }
    });

    const verified = verifyLocalSyncManifestBundle(bundle, {
      configuration,
      now: new Date("2026-09-03T00:30:00.000Z")
    });
    expect(verified.page).toMatchObject({
      mode: "delta",
      recordCount: 2,
      changedRecordCount: 2,
      removalCount: 1,
      baseRecordSetHash: computeLocalSyncRecordSetHash(base)
    });
    expect(verified.records.map((entry) => entry.asset.stableId)).toEqual(["policy.b", "policy.c"]);
    expect(verified.removedStableIds).toEqual(["policy.a"]);
  });

  it("enforces the pinned lease, record, page, and byte limits", () => {
    const { configuration, bundle } = fixture();

    expect(() => verifyLocalSyncManifestBundle(bundle, {
      configuration: localSyncConfigurationSchema.parse({ ...configuration, leaseDurationSeconds: 60 }),
      now: new Date("2026-09-03T00:00:30.000Z")
    })).toThrow(/lease exceeds/);

    expect(() => verifyLocalSyncManifestBundle(bundle, {
      configuration: localSyncConfigurationSchema.parse({ ...configuration, maxRecords: 1 }),
      now: new Date("2026-09-03T00:30:00.000Z")
    })).toThrow(/record count exceeds/);

    expect(() => verifyLocalSyncManifestBundle(bundle, {
      configuration: localSyncConfigurationSchema.parse({ ...configuration, maxRecordsPerPage: 2, maxRecordBytes: 32 }),
      now: new Date("2026-09-03T00:30:00.000Z")
    })).toThrow(/byte limit/);
  });
});

describe("local device authorization proofs", () => {
  it("binds a short-lived request and code to PKCE, target identity, and purpose", () => {
    const secret = "test-enrollment-secret-with-at-least-32-bytes";
    const issuedAt = new Date("2026-09-03T00:00:00.000Z");
    const pkce = createLocalDevicePkcePair();
    expect(createLocalDevicePkceChallenge(pkce.verifier)).toBe(pkce.challenge);
    const request = createLocalDeviceAuthorizationRequest({
      secret,
      serverId: "server_test",
      serverOrigin: "https://forgetbase.example.test",
      signingKeyId: "key_1",
      deviceName: "Test laptop",
      redirectUri: "http://127.0.0.1:45731/forgetbase/local/callback",
      state: "s".repeat(43),
      codeChallenge: pkce.challenge,
      issuedAt
    });
    const verifiedRequest = verifyLocalDeviceAuthorizationRequest(
      request.token,
      secret,
      new Date("2026-09-03T00:01:00.000Z")
    );
    const code = createLocalDeviceAuthorizationCode({
      request: verifiedRequest,
      tenantId: "tenant_demo",
      userId: "user_1",
      secret,
      issuedAt: new Date("2026-09-03T00:01:00.000Z")
    });
    expect(verifyLocalDeviceAuthorizationCode(
      code.token,
      secret,
      new Date("2026-09-03T00:01:30.000Z")
    )).toMatchObject({
      enrollmentId: request.payload.enrollmentId,
      tenantId: "tenant_demo",
      userId: "user_1",
      codeChallenge: pkce.challenge
    });
    expect(() => verifyLocalDeviceAuthorizationCode(request.token, secret, issuedAt)).toThrow();
    expect(() => verifyLocalDeviceAuthorizationRequest(code.token, secret, issuedAt)).toThrow();
  });

  it("rejects tampering, the wrong secret, and expiry", () => {
    const secret = "test-enrollment-secret-with-at-least-32-bytes";
    const request = createLocalDeviceAuthorizationRequest({
      secret,
      serverId: "server_test",
      serverOrigin: "https://forgetbase.example.test",
      signingKeyId: "key_1",
      deviceName: "Test laptop",
      redirectUri: "http://127.0.0.1:45731/forgetbase/local/callback",
      state: "s".repeat(43),
      codeChallenge: "c".repeat(43),
      issuedAt: new Date("2026-09-03T00:00:00.000Z"),
      ttlMs: 60_000
    });
    const tampered = `${request.token.slice(0, -1)}${request.token.endsWith("a") ? "b" : "a"}`;
    expect(() => verifyLocalDeviceAuthorizationRequest(tampered, secret, new Date("2026-09-03T00:00:30.000Z")))
      .toThrow(/signature/);
    expect(() => verifyLocalDeviceAuthorizationRequest(
      request.token,
      "different-enrollment-secret-with-32-bytes",
      new Date("2026-09-03T00:00:30.000Z")
    )).toThrow(/signature/);
    expect(() => verifyLocalDeviceAuthorizationRequest(
      request.token,
      secret,
      new Date("2026-09-03T00:01:01.000Z")
    )).toThrow(/expired/);
  });
});
