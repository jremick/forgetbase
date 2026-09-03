import { generateKeyPairSync } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localSyncConfigurationSchema,
  localSyncRecordSchema,
  type LocalSyncRecord
} from "@forgetbase/schema";
import {
  canonicalJson,
  computeLocalSyncRecordSetHash,
  createEd25519LocalSyncSigner,
  createLocalSyncManifestBundle,
  sha256Digest
} from "@forgetbase/local-sync";
import {
  connectLocalProfile,
  disconnectLocalProfile,
  doctorLocalProfile,
  getLocalGuidance,
  getLocalSource,
  getLocalStatus,
  rebuildLocalProfile,
  searchLocalProfile,
  syncLocalProfile,
  LocalKnowledgeStore,
  MemoryLocalCredentialStore
} from "./index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function record(
  stableId: string,
  sensitivity: "public-demo" | "internal" | "restricted" = "public-demo",
  revision = 1
): LocalSyncRecord {
  const assetId = `asset_${stableId}`;
  const versionId = `version_${stableId}_${revision}`;
  const payload = {
    recordId: `record_${stableId}_${revision}`,
    asset: {
      id: assetId,
      tenantId: "tenant_demo",
      stableId,
      type: "policy" as const,
      ownerId: "user_admin",
      title: stableId === "policy.secure-build"
        ? `Secure build policy revision ${revision}`
        : "Privacy practice",
      summary: "Approved software engineering guidance",
      lifecycleState: "active" as const,
      sensitivity,
      audience: ["developers"],
      status: "approved",
      reviewDueAt: "2027-01-01",
      allowedSurfaces: ["local-cache" as const],
      allowedExports: [],
      allowedActions: [],
      sourceKind: "synthetic-demo",
      sourceRef: `kb://${stableId}`,
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
      body: "Run security checks before releasing software and cite the governing source.",
      inputContract: {},
      outputContract: {},
      constraints: ["Do not expose secrets."],
      examples: [],
      failureModes: ["Skipping the release check."],
      escalation: "Ask the security owner.",
      createdAt: "2026-09-03T00:00:00.000Z"
    }],
    humanDocuments: [{
      id: `document_${stableId}`,
      assetId,
      versionId,
      format: "markdown" as const,
      body: "# Secure build\n\nValidate dependencies and preserve audit evidence.",
      renderOptions: {},
      linkedInstructionIds: [],
      createdAt: "2026-09-03T00:00:00.000Z"
    }]
  };
  return localSyncRecordSchema.parse({
    ...payload,
    payloadHash: sha256Digest(canonicalJson(payload))
  });
}

async function setup(options: {
  invalidRevocation?: boolean;
  conflictingGeneration?: boolean;
  rejectAuthentication?: boolean;
  deltaSecond?: boolean;
  contentChange?: boolean;
  configurationChange?: boolean;
  rejectConfiguration?: boolean;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "forgetbase-local-runtime-"));
  temporaryRoots.push(root);
  const credentialStore = new MemoryLocalCredentialStore();
  const { privateKey } = generateKeyPairSync("ed25519");
  const signer = createEd25519LocalSyncSigner({ keyId: "local-key-1", privateKey });
  const configuration = localSyncConfigurationSchema.parse({
    protocolVersion: "1",
    serverId: "server_test",
    tenantId: "tenant_demo",
    principalType: "user",
    principalId: "user_device",
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
  const records = [record("policy.secure-build"), record("practice.privacy")];
  let manifestRequestCount = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.pathname === "/local-sync/v1/device-sessions") {
      return new Response(JSON.stringify({
        approvalUrl: "https://forgetbase.example.test/?local-device-request=request-token",
        requestToken: "request-token",
        expiresAt: "2026-09-03T00:05:00.000Z"
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/local-sync/v1/device-sessions/token") {
      return new Response(JSON.stringify(deviceTokenResponse("initial")), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.pathname === "/local-sync/v1/device-sessions/refresh") {
      return new Response(JSON.stringify(deviceTokenResponse(`refresh-${manifestRequestCount}`)), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.pathname === "/local-sync/v1/configuration") {
      if (options.rejectConfiguration && manifestRequestCount > 0) {
        return new Response(JSON.stringify({ error: "local_device_session_required" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify(options.configurationChange && manifestRequestCount > 0
        ? { ...configuration, allowedSensitivities: ["public-demo"] }
        : configuration), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.pathname !== "/local-sync/v1/manifest") {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }
    manifestRequestCount += 1;
    if (options.rejectAuthentication && manifestRequestCount > 1) {
      return new Response(JSON.stringify({ error: "authentication_required" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
    const request: {
      knownAuthorizationEpoch?: number;
      knownContentGeneration?: number;
      knownRecordSetHash?: string;
    } = {
      knownAuthorizationEpoch: url.searchParams.has("knownAuthorizationEpoch")
        ? Number(url.searchParams.get("knownAuthorizationEpoch"))
        : undefined,
      knownContentGeneration: url.searchParams.has("knownContentGeneration")
        ? Number(url.searchParams.get("knownContentGeneration"))
        : undefined,
      knownRecordSetHash: url.searchParams.get("knownRecordSetHash") ?? undefined
    };
    const changedAuthorization = options.invalidRevocation && manifestRequestCount > 1;
    const conflictingGeneration = options.conflictingGeneration && manifestRequestCount > 1;
    const deltaSecond = options.deltaSecond && manifestRequestCount > 1;
    const manifestRecords = changedAuthorization
      ? [record("policy.restricted", "restricted")]
      : conflictingGeneration
        ? [record("policy.changed")]
        : options.contentChange && manifestRequestCount > 1
          ? [record("policy.secure-build", "public-demo", 2), record("practice.privacy")]
        : deltaSecond
          ? [record("policy.secure-build", "public-demo", 2)]
          : records;
    const bundle = createLocalSyncManifestBundle({
      signer,
      serverId: configuration.serverId,
      tenantId: configuration.tenantId,
      principalType: configuration.principalType,
      principalId: configuration.principalId,
      authorizationEpoch: changedAuthorization || deltaSecond ? 2 : 1,
      contentGeneration: changedAuthorization || deltaSecond || options.contentChange && manifestRequestCount > 1 ? 2 : 1,
      records: manifestRecords,
      snapshotId: `snapshot-${manifestRequestCount}`,
      issuedAt: new Date("2026-09-03T00:00:00.000Z"),
      leaseDurationSeconds: configuration.leaseDurationSeconds,
      minimumClientVersion: configuration.minimumClientVersion,
      allowedSensitivities: configuration.allowedSensitivities,
      delta: deltaSecond ? {
        baseRecordSetHash: computeLocalSyncRecordSetHash(records),
        records: manifestRecords,
        removedStableIds: ["practice.privacy"]
      } : undefined,
      ...request
    });
    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  await connectLocalProfile({
    root,
    profile: "work",
    baseUrl: "https://forgetbase.example.test",
    deviceName: "Test laptop",
    fetchImpl,
    credentialStore,
    authorizer: async () => "test-authorization-code",
    now: new Date("2026-09-03T00:00:00.000Z")
  });
  return { root, fetchImpl, credentialStore };
}

function deviceTokenResponse(suffix: string) {
  return {
    accessToken: `access-token-${suffix}`.padEnd(40, "x"),
    accessTokenExpiresAt: "2026-09-03T00:30:00.000Z",
    refreshToken: `refresh-token-${suffix}`.padEnd(40, "x"),
    refreshTokenExpiresAt: "2026-09-10T00:00:00.000Z",
    deviceSession: {
      id: "session_device",
      tenantId: "tenant_demo",
      userId: "user_device",
      apiKeyId: `key_${suffix}`,
      source: "local-device",
      deviceLabel: "Test laptop",
      clientUserAgent: "vitest",
      createdAt: "2026-09-03T00:00:00.000Z",
      expiresAt: "2026-09-03T00:30:00.000Z",
      absoluteExpiresAt: "2026-10-03T00:00:00.000Z",
      lastSeenAt: null,
      revokedAt: null
    }
  };
}

describe("local agent runtime", () => {
  it("builds an atomic SQLite index and serves bounded search, source, and guidance", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    const synced = await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    expect(synced).toMatchObject({ mode: "full", recordCount: 2, authorizationEpoch: 1 });

    const results = await searchLocalProfile('security" OR secret*', {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    });
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ stableId: "policy.secure-build", sourceRef: "kb://policy.secure-build" })
    ]));
    const source = await getLocalSource("policy.secure-build", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    });
    expect(source?.instructionObjects[0]?.body).toContain("security checks");
    const guidance = await getLocalGuidance("secure release", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    });
    expect(guidance.sources[0]?.instructions[0]?.constraints).toContain("Do not expose secrets.");
    expect((await doctorLocalProfile({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).ok).toBe(true);

    const profileFile = await stat(join(root, "profiles", "work", "profile.json"));
    expect(profileFile.mode & 0o777).toBe(0o600);
  });

  it("serves 1,000 warm local queries without network traffic or repeated credential reads", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const networkCallsBefore = vi.mocked(fetchImpl).mock.calls.length;
    const credentialReads = vi.spyOn(credentialStore, "get");
    credentialReads.mockClear();
    const store = new LocalKnowledgeStore({ root, profile: "work", credentialStore });
    const durations: number[] = [];
    try {
      for (let index = 0; index < 1_000; index += 1) {
        const startedAt = performance.now();
        const results = await store.search("secure release", {
          limit: 3,
          now: new Date("2026-09-03T00:02:00.000Z")
        });
        durations.push(performance.now() - startedAt);
        expect(results[0]?.stableId).toBe("policy.secure-build");
      }
      await store.search("private-query-canary-9c14db", {
        now: new Date("2026-09-03T00:02:00.000Z")
      });
    } finally {
      store.close();
    }
    const p95 = [...durations].sort((left, right) => left - right)[Math.floor(durations.length * 0.95)] ?? Infinity;
    expect(p95).toBeLessThan(100);
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(networkCallsBefore);
    expect(credentialReads).toHaveBeenCalledTimes(1);

    const profileText = await readFile(join(root, "profiles", "work", "profile.json"), "utf8");
    const profile = JSON.parse(profileText) as { activeGenerationFile: string };
    const generation = await readFile(join(
      root,
      "profiles",
      "work",
      "generations",
      profile.activeGenerationFile
    ));
    expect(profileText).not.toContain("private-query-canary-9c14db");
    expect(generation.includes(Buffer.from("private-query-canary-9c14db"))).toBe(false);
  });

  it("renews a lease through the signed unchanged path", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const second = await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    });
    expect(second.mode).toBe("unchanged");
  });

  it("applies a signed delta atomically and removes superseded local content", async () => {
    const { root, fetchImpl, credentialStore } = await setup({ deltaSecond: true });
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const second = await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    });

    expect(second).toMatchObject({ mode: "delta", recordCount: 1, authorizationEpoch: 2 });
    expect((await getLocalSource("policy.secure-build", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    }))?.version.versionNumber).toBe(2);
    expect(await getLocalSource("practice.privacy", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    })).toBeNull();
  });

  it("fails closed after a signed authorization change until a safe generation activates", async () => {
    const { root, fetchImpl, credentialStore } = await setup({ invalidRevocation: true });
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    await expect(syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toThrow(/not eligible/);
    expect((await getLocalStatus({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    })).status).toBe("revocation-pending");
    await expect(searchLocalProfile("secure", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    })).rejects.toThrow(/authorization change/);
  });

  it("fails closed when equal high-water counters describe a different signed record set", async () => {
    const { root, fetchImpl, credentialStore } = await setup({ conflictingGeneration: true });
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    await expect(syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toThrow(/conflicts with the accepted local high-water state/);
    expect((await getLocalStatus({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    })).status).toBe("revocation-pending");
  });

  it("fails closed when the server rejects a previously accepted sync credential", async () => {
    const { root, fetchImpl, credentialStore } = await setup({ rejectAuthentication: true });
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    await expect(syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toMatchObject({ status: 401 });
    expect((await getLocalStatus({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    })).status).toBe("revocation-pending");
  });

  it("refuses queries after the signed lease expires", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    await expect(searchLocalProfile("secure", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T01:01:00.000Z")
    })).rejects.toThrow(/lease has expired/);
  });

  it("detects authenticated profile and SQLite generation tampering", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const profilePath = join(root, "profiles", "work", "profile.json");
    const profile = JSON.parse(await readFile(profilePath, "utf8")) as Record<string, unknown>;
    profile.recordCount = Number(profile.recordCount) + 1;
    await writeFile(profilePath, `${JSON.stringify(profile)}\n`, { mode: 0o600 });
    await expect(getLocalStatus({ root, profile: "work", credentialStore }))
      .rejects.toThrow(/integrity verification failed/);

    const fresh = await setup();
    await syncLocalProfile({
      root: fresh.root,
      profile: "work",
      fetchImpl: fresh.fetchImpl,
      credentialStore: fresh.credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const freshProfile = JSON.parse(await readFile(
      join(fresh.root, "profiles", "work", "profile.json"),
      "utf8"
    )) as { activeGenerationFile: string };
    const generationPath = join(fresh.root, "profiles", "work", "generations", freshProfile.activeGenerationFile);
    const generation = await readFile(generationPath);
    await writeFile(generationPath, Buffer.concat([generation, Buffer.from("tamper")]), { mode: 0o600 });
    await expect(searchLocalProfile("secure", {
      root: fresh.root,
      profile: "work",
      credentialStore: fresh.credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toThrow(/file-integrity check/);
  });

  it("rejects symlinked profile metadata and hard-linked cache generations", async () => {
    const symlinkFixture = await setup();
    await syncLocalProfile({
      root: symlinkFixture.root,
      profile: "work",
      fetchImpl: symlinkFixture.fetchImpl,
      credentialStore: symlinkFixture.credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const profilePath = join(symlinkFixture.root, "profiles", "work", "profile.json");
    const profileBackup = join(symlinkFixture.root, "profiles", "work", "profile-backup.json");
    await writeFile(profileBackup, await readFile(profilePath), { mode: 0o600 });
    await rm(profilePath);
    await symlink(profileBackup, profilePath);
    await expect(getLocalStatus({
      root: symlinkFixture.root,
      profile: "work",
      credentialStore: symlinkFixture.credentialStore
    })).rejects.toThrow(/symlink/);

    const hardLinkFixture = await setup();
    await syncLocalProfile({
      root: hardLinkFixture.root,
      profile: "work",
      fetchImpl: hardLinkFixture.fetchImpl,
      credentialStore: hardLinkFixture.credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const hardLinkProfile = JSON.parse(await readFile(
      join(hardLinkFixture.root, "profiles", "work", "profile.json"),
      "utf8"
    )) as { activeGenerationFile: string };
    const generationPath = join(
      hardLinkFixture.root,
      "profiles",
      "work",
      "generations",
      hardLinkProfile.activeGenerationFile
    );
    await link(generationPath, join(hardLinkFixture.root, "generation-copy.sqlite"));
    await expect(searchLocalProfile("secure", {
      root: hardLinkFixture.root,
      profile: "work",
      credentialStore: hardLinkFixture.credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toThrow(/hard link/);
  });

  it("rebuilds a damaged generation from a newly signed full snapshot", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const profile = JSON.parse(await readFile(
      join(root, "profiles", "work", "profile.json"),
      "utf8"
    )) as { activeGenerationFile: string };
    const generationPath = join(root, "profiles", "work", "generations", profile.activeGenerationFile);
    await writeFile(generationPath, Buffer.from("damaged generation"), { mode: 0o600 });

    const rebuilt = await rebuildLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    });
    expect(rebuilt).toMatchObject({ mode: "full", recordCount: 2 });
    expect((await doctorLocalProfile({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    })).ok).toBe(true);
  });

  it("keeps the prior valid generation active when a replacement cannot be written", async () => {
    const { root, fetchImpl, credentialStore } = await setup({ contentChange: true });
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    const generationsDir = join(root, "profiles", "work", "generations");
    const blockedGeneration = `generation-${sha256Digest("snapshot-2").slice("sha256:".length)}.sqlite`;
    await mkdir(join(generationsDir, blockedGeneration));
    await expect(syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toThrow();
    const source = await getLocalSource("policy.secure-build", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    });
    expect(source?.version.versionNumber).toBe(1);
    expect((await getLocalStatus({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:03:00.000Z")
    })).status).toBe("ready");
  });

  it("blocks reads after a material backward clock movement", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:10:00.000Z")
    });
    await expect(searchLocalProfile("secure", {
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-02T23:00:00.000Z")
    })).rejects.toThrow(/clock moved backward/);
    await expect(getLocalStatus({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-02T23:00:00.000Z")
    })).rejects.toThrow(/clock moved backward/);
  });

  it("blocks the active generation after a detected server policy change", async () => {
    const { root, fetchImpl, credentialStore } = await setup({ configurationChange: true });
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    await expect(syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toThrow(/differs from the pinned profile/);
    expect((await getLocalStatus({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).status).toBe("revocation-pending");
  });

  it("blocks the active generation when the refreshed device is denied at configuration", async () => {
    const { root, fetchImpl, credentialStore } = await setup({ rejectConfiguration: true });
    await syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    });
    await expect(syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).rejects.toMatchObject({ status: 403 });
    expect((await getLocalStatus({
      root,
      profile: "work",
      credentialStore,
      now: new Date("2026-09-03T00:02:00.000Z")
    })).status).toBe("revocation-pending");
  });

  it("refuses a concurrent writer for the same profile", async () => {
    const { root, fetchImpl, credentialStore } = await setup();
    await writeFile(
      join(root, "profiles", "work", ".sync.lock"),
      JSON.stringify({ pid: process.pid, nonce: "active", createdAt: new Date().toISOString() }),
      { mode: 0o600 }
    );
    await expect(syncLocalProfile({
      root,
      profile: "work",
      fetchImpl,
      credentialStore,
      now: new Date("2026-09-03T00:01:00.000Z")
    })).rejects.toThrow(/already running/);
    await expect(disconnectLocalProfile({
      root,
      profile: "work",
      localOnly: true,
      credentialStore
    })).rejects.toThrow(/already running/);
    await expect(connectLocalProfile({
      root,
      profile: "work",
      baseUrl: "https://forgetbase.example.test",
      fetchImpl,
      credentialStore,
      authorizer: async () => "unused"
    })).rejects.toThrow(/already running/);
    expect((await getLocalStatus({ root, profile: "work", credentialStore })).status).toBe("not-built");
  });
});
