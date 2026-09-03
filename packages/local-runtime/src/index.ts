import type { DatabaseSync } from "node:sqlite";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  localSyncConfigurationSchema,
  localSyncDigestSchema,
  localSyncMaxRecordBytes,
  localSyncMaxSnapshotBytes,
  localSyncRecordSchema,
  type LocalSyncConfiguration,
  type LocalSyncManifestBundle,
  type LocalSyncRecord
} from "@forgetbase/schema";
import { ForgetBaseClient, ForgetBaseHttpError } from "@forgetbase/sdk";
import {
  canonicalJson,
  computeLocalSyncEntitlementHash,
  computeLocalSyncRecordSetHash,
  sha256Digest,
  TrustedLocalSyncManifestError,
  verifyLocalSyncManifestBundle
} from "@forgetbase/local-sync";
import { authorizeLocalDevice, type LocalBrowserAuthorizer } from "./authorization.js";
import {
  createSystemCredentialStore,
  type LocalCredentialBundle,
  type LocalCredentialStore
} from "./credentials.js";

export {
  createSystemCredentialStore,
  MemoryLocalCredentialStore,
  type LocalCredentialBundle,
  type LocalCredentialStore
} from "./credentials.js";
export type { LocalBrowserAuthorizationPrompt, LocalBrowserAuthorizer } from "./authorization.js";

export const localRuntimeVersion = "0.1.0";
export const minimumLocalRuntimeNodeVersion = "22.13.0";
export const defaultLocalSearchLimit = 8;
export const maximumLocalSearchLimit = 50;
export const maximumLocalRecordBytes = localSyncMaxRecordBytes;
export const maximumLocalSnapshotBytes = localSyncMaxSnapshotBytes;

const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const GENERATION_FILE_PATTERN = /^generation-[0-9a-f]{64}\.sqlite$/;
const MAXIMUM_QUERY_LENGTH = 500;
const MAXIMUM_QUERY_TOKENS = 24;
const DEFAULT_GUIDANCE_BYTES = 32 * 1024;
const PROFILE_INTEGRITY_DOMAIN = "forgetbase.local-profile.v2";
const CLOCK_ROLLBACK_TOLERANCE_MILLISECONDS = 5 * 60 * 1_000;
const GENERAL_FRESHNESS_WARNING_MILLISECONDS = 24 * 60 * 60 * 1_000;
const SYNC_LOCK_STALE_MILLISECONDS = 15 * 60 * 1_000;

export type LocalProfileState = "not-built" | "ready" | "revocation-pending";

export interface LocalRuntimeProfile {
  schemaVersion: 2;
  name: string;
  baseUrl: string;
  configuration: LocalSyncConfiguration;
  state: LocalProfileState;
  activeGenerationFile: string | null;
  snapshotId: string | null;
  authorizationEpoch: number | null;
  contentGeneration: number | null;
  entitlementHash: string | null;
  recordSetHash: string | null;
  recordCount: number;
  leaseExpiresAt: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastAuthorizationCheckAt: string | null;
  trustedServerTime: string | null;
  trustedTimeObservedAt: string | null;
  generationFileHash: string | null;
  integrityTag: string;
}

export interface LocalRuntimeOptions {
  root?: string;
  profile?: string;
  credentialStore?: LocalCredentialStore;
}

export interface ConnectLocalProfileOptions extends LocalRuntimeOptions {
  baseUrl: string;
  deviceName?: string;
  fetchImpl?: typeof fetch;
  authorizer?: LocalBrowserAuthorizer;
  authorizationTimeoutMilliseconds?: number;
  now?: Date;
}

export interface SyncLocalProfileOptions extends LocalRuntimeOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  forceFull?: boolean;
}

export interface DisconnectLocalProfileOptions extends LocalRuntimeOptions {
  fetchImpl?: typeof fetch;
  localOnly?: boolean;
}

export interface LocalDisconnectResult {
  profile: string;
  remoteSessionRevoked: boolean;
  localCacheRemoved: boolean;
  secureEraseGuaranteed: false;
}

export interface LocalSyncResult {
  mode: "full" | "delta" | "unchanged";
  profile: string;
  snapshotId: string;
  authorizationEpoch: number;
  contentGeneration: number;
  recordCount: number;
  leaseExpiresAt: string;
}

export interface LocalSearchOptions extends LocalRuntimeOptions {
  limit?: number;
  now?: Date;
}

export interface LocalSearchResult {
  stableId: string;
  title: string;
  summary: string | null;
  snippet: string;
  score: number;
  sourceRef: string | null;
  versionNumber: number;
  updatedAt: string;
  assetType: LocalSyncRecord["asset"]["type"];
  authority: LocalAuthority;
  freshness: LocalFreshness;
}

export type LocalAuthority = "mandatory" | "recommended" | "informational";

export interface LocalFreshness {
  status: "fresh" | "warning";
  lastAuthorizationCheckAt: string;
  leaseExpiresAt: string;
  authorizationEpoch: number;
  contentGeneration: number;
}

export interface LocalGuidanceSource {
  stableId: string;
  title: string;
  sourceRef: string | null;
  versionNumber: number;
  assetType: LocalSyncRecord["asset"]["type"];
  authority: LocalAuthority;
  instructions: Array<{
    instructionKind: string;
    targetAgents: string[];
    body: string;
    constraints: string[];
    failureModes: string[];
    escalation: string | null;
  }>;
}

export interface LocalGuidanceResult {
  query: string;
  sources: LocalGuidanceSource[];
  truncated: boolean;
  freshness: LocalFreshness;
}

export interface LocalRuntimeStatus {
  profile: string;
  status: "not-built" | "ready" | "expired" | "revocation-pending";
  serverId: string;
  principalType: "user" | "service-account";
  principalId: string;
  authorizationEpoch: number | null;
  contentGeneration: number | null;
  recordCount: number;
  lastSyncedAt: string | null;
  lastAuthorizationCheckAt: string | null;
  leaseExpiresAt: string | null;
  credentialStore: LocalCredentialStore["backend"];
}

export interface LocalDoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface LocalDoctorResult {
  ok: boolean;
  checks: LocalDoctorCheck[];
}

interface ProfilePaths {
  root: string;
  profileDir: string;
  generationsDir: string;
  profileFile: string;
  syncLockFile: string;
  credentialAccount: string;
}

export async function connectLocalProfile(options: ConnectLocalProfileOptions): Promise<LocalRuntimeProfile> {
  assertSupportedNodeVersion();
  const paths = resolveProfilePaths(options);
  const releaseLock = await acquireSyncLock(paths);
  try {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    if (await pathExists(paths.profileFile)) {
      throw new Error("This local profile is already connected; sync it or disconnect it before reconnecting");
    }
    const credentialStore = options.credentialStore ?? createSystemCredentialStore();
    if (await credentialStore.get(paths.credentialAccount)) {
      throw new Error("This local profile has an orphaned credential; run local disconnect --local-only before reconnecting");
    }
    const client = new ForgetBaseClient({
      baseUrl,
      surface: "local-cache",
      fetchImpl: options.fetchImpl
    });
    const authorization = await authorizeLocalDevice({
      client,
      deviceName: options.deviceName ?? "ForgetBase Local CLI",
      authorizer: options.authorizer,
      authorizationTimeoutMilliseconds: options.authorizationTimeoutMilliseconds
    });
    const accessClient = new ForgetBaseClient({
      baseUrl,
      apiKey: authorization.accessToken,
      surface: "local-cache",
      fetchImpl: options.fetchImpl
    });
    const configuration = await accessClient.getLocalSyncConfiguration();
    assertSupportedClientVersion(configuration.minimumClientVersion);
    const profileIntegrityKey = randomBytes(32).toString("base64url");
    const credential: LocalCredentialBundle = {
      schemaVersion: 1,
      refreshToken: authorization.refreshToken,
      refreshTokenExpiresAt: authorization.refreshTokenExpiresAt,
      profileIntegrityKey
    };
    const connectedAt = (options.now ?? new Date()).toISOString();
    const profile: LocalRuntimeProfile = {
      schemaVersion: 2,
      name: readProfileName(options.profile),
      baseUrl,
      configuration,
      state: "not-built",
      activeGenerationFile: null,
      snapshotId: null,
      authorizationEpoch: null,
      contentGeneration: null,
      entitlementHash: null,
      recordSetHash: null,
      recordCount: 0,
      leaseExpiresAt: null,
      connectedAt,
      lastSyncedAt: null,
      lastAuthorizationCheckAt: null,
      trustedServerTime: null,
      trustedTimeObservedAt: null,
      generationFileHash: null,
      integrityTag: ""
    };
    await credentialStore.set(paths.credentialAccount, credential);
    try {
      return await writeProfile(paths, profile, profileIntegrityKey);
    } catch (error) {
      await credentialStore.delete(paths.credentialAccount).catch(() => undefined);
      await accessClient.revokeCurrentLocalDeviceSession().catch(() => undefined);
      throw error;
    }
  } finally {
    await releaseLock();
  }
}

export async function syncLocalProfile(options: SyncLocalProfileOptions): Promise<LocalSyncResult> {
  assertSupportedNodeVersion();
  const paths = resolveProfilePaths(options);
  const releaseLock = await acquireSyncLock(paths);
  try {
    const credentialStore = options.credentialStore ?? createSystemCredentialStore();
    const credential = await requireCredential(credentialStore, paths);
    const profile = await readProfile(paths, credential.profileIntegrityKey);
    const now = options.now ?? new Date();
    assertTrustedClock(profile, now);
    assertSupportedClientVersion(profile.configuration.minimumClientVersion);
    const publicClient = new ForgetBaseClient({
      baseUrl: profile.baseUrl,
      surface: "local-cache",
      fetchImpl: options.fetchImpl
    });
    let refreshed: Awaited<ReturnType<ForgetBaseClient["refreshLocalDeviceSession"]>>;
    try {
      refreshed = await publicClient.refreshLocalDeviceSession({ refreshToken: credential.refreshToken });
    } catch (error) {
      if (error instanceof ForgetBaseHttpError && (error.status === 401 || error.status === 403)) {
        await writeProfile(paths, { ...profile, state: "revocation-pending" }, credential.profileIntegrityKey);
      }
      throw error;
    }
    const rotatedCredential: LocalCredentialBundle = {
      ...credential,
      refreshToken: refreshed.refreshToken,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt
    };
    try {
      await credentialStore.set(paths.credentialAccount, rotatedCredential);
    } catch (error) {
      throw new Error("The refreshed device credential could not be stored; reconnect this local profile", {
        cause: error
      });
    }
    const client = new ForgetBaseClient({
      baseUrl: profile.baseUrl,
      apiKey: refreshed.accessToken,
      surface: "local-cache",
      fetchImpl: options.fetchImpl
    });
    let currentConfiguration: LocalSyncConfiguration;
    try {
      currentConfiguration = await client.getLocalSyncConfiguration();
    } catch (error) {
      if (error instanceof ForgetBaseHttpError && (error.status === 401 || error.status === 403)) {
        await writeProfile(paths, { ...profile, state: "revocation-pending" }, credential.profileIntegrityKey);
      }
      throw error;
    }
    try {
      assertPinnedConfiguration(profile.configuration, currentConfiguration);
    } catch (error) {
      await writeProfile(paths, { ...profile, state: "revocation-pending" }, credential.profileIntegrityKey);
      throw error;
    }
    let manifest: LocalSyncManifestBundle;
    try {
      manifest = await client.getLocalSyncManifest({
        knownAuthorizationEpoch: options.forceFull ? undefined : profile.authorizationEpoch ?? undefined,
        knownContentGeneration: options.forceFull ? undefined : profile.contentGeneration ?? undefined,
        knownRecordSetHash: options.forceFull ? undefined : profile.recordSetHash ?? undefined
      });
    } catch (error) {
      if (error instanceof ForgetBaseHttpError && (error.status === 401 || error.status === 403)) {
        await writeProfile(paths, { ...profile, state: "revocation-pending" }, credential.profileIntegrityKey);
      }
      throw error;
    }
    let verified: ReturnType<typeof verifyLocalSyncManifestBundle>;
    try {
      verified = verifyLocalSyncManifestBundle(manifest, {
        configuration: profile.configuration,
        now,
        minimumAuthorizationEpoch: profile.authorizationEpoch ?? undefined,
        minimumContentGeneration: profile.contentGeneration ?? undefined
      });
    } catch (error) {
      if (
        error instanceof TrustedLocalSyncManifestError &&
        profile.authorizationEpoch !== null &&
        error.authorizationEpoch > profile.authorizationEpoch
      ) {
        await writeProfile(paths, { ...profile, state: "revocation-pending" }, credential.profileIntegrityKey);
      }
      throw error;
    }
    const equalAuthorizationConflict = profile.authorizationEpoch !== null
      && verified.page.authorizationEpoch === profile.authorizationEpoch
      && profile.entitlementHash !== null
      && verified.page.entitlementHash !== profile.entitlementHash;
    const equalContentConflict = profile.contentGeneration !== null
      && verified.page.contentGeneration === profile.contentGeneration
      && profile.recordSetHash !== null
      && verified.page.recordSetHash !== profile.recordSetHash;
    if (equalAuthorizationConflict || equalContentConflict) {
      await writeProfile(paths, { ...profile, state: "revocation-pending" }, credential.profileIntegrityKey);
      throw new Error("The signed manifest conflicts with the accepted local high-water state");
    }
    if (profile.authorizationEpoch !== null && verified.page.authorizationEpoch > profile.authorizationEpoch) {
      await writeProfile(paths, { ...profile, state: "revocation-pending" }, credential.profileIntegrityKey);
    }
    assertSupportedClientVersion(verified.page.minimumClientVersion);
    const trustedTimes = {
      lastAuthorizationCheckAt: now.toISOString(),
      trustedServerTime: verified.page.issuedAt,
      trustedTimeObservedAt: now.toISOString()
    };

    if (verified.page.mode === "unchanged") {
      if (!profile.activeGenerationFile || profile.state !== "ready") {
        throw new Error("The server returned unchanged but this profile has no ready local generation");
      }
      if (profile.authorizationEpoch !== verified.page.authorizationEpoch
        || profile.contentGeneration !== verified.page.contentGeneration
        || profile.entitlementHash !== verified.page.entitlementHash
        || profile.recordSetHash !== verified.page.recordSetHash) {
        throw new Error("The unchanged manifest does not match the active local generation");
      }
      const updated: LocalRuntimeProfile = {
        ...profile,
        ...trustedTimes,
        leaseExpiresAt: verified.page.leaseExpiresAt,
        lastSyncedAt: now.toISOString()
      };
      await writeProfile(paths, updated, credential.profileIntegrityKey);
      return resultFromProfile(updated, "unchanged");
    }

    const nextRecords = verified.page.mode === "delta"
      ? await applyDelta(paths, profile, verified)
      : verified.records;
    validateRecordsForProfile(nextRecords, profile.configuration);
    const activeGenerationFile = generationFileName(verified.page.snapshotId);
    const generationFileHash = await buildGeneration(paths, activeGenerationFile, nextRecords, verified.page);
    const updated: LocalRuntimeProfile = {
      ...profile,
      ...trustedTimes,
      state: "ready",
      activeGenerationFile,
      snapshotId: verified.page.snapshotId,
      authorizationEpoch: verified.page.authorizationEpoch,
      contentGeneration: verified.page.contentGeneration,
      entitlementHash: verified.page.entitlementHash,
      recordSetHash: verified.page.recordSetHash,
      recordCount: nextRecords.length,
      leaseExpiresAt: verified.page.leaseExpiresAt,
      lastSyncedAt: now.toISOString(),
      generationFileHash
    };
    await writeProfile(paths, updated, credential.profileIntegrityKey);
    try {
      await pruneInactiveGenerations(paths, activeGenerationFile);
    } catch (error) {
      await writeProfile(paths, { ...updated, state: "revocation-pending" }, credential.profileIntegrityKey);
      throw new Error("The new generation activated, but stale generation cleanup failed; local access is blocked", {
        cause: error
      });
    }
    return resultFromProfile(updated, verified.page.mode);
  } finally {
    await releaseLock();
  }
}

export async function rebuildLocalProfile(options: Omit<SyncLocalProfileOptions, "forceFull">): Promise<LocalSyncResult> {
  return syncLocalProfile({ ...options, forceFull: true });
}

export async function disconnectLocalProfile(options: DisconnectLocalProfileOptions = {}): Promise<LocalDisconnectResult> {
  const paths = resolveProfilePaths(options);
  const releaseLock = await acquireSyncLock(paths);
  try {
    const credentialStore = options.credentialStore ?? createSystemCredentialStore();
    let remoteSessionRevoked = false;
    if (!options.localOnly && await pathExists(paths.profileFile)) {
      const credential = await requireCredential(credentialStore, paths);
      const profile = await readProfile(paths, credential.profileIntegrityKey);
      const publicClient = new ForgetBaseClient({
        baseUrl: profile.baseUrl,
        surface: "local-cache",
        fetchImpl: options.fetchImpl
      });
      const refreshed = await publicClient.refreshLocalDeviceSession({ refreshToken: credential.refreshToken });
      await credentialStore.set(paths.credentialAccount, {
        ...credential,
        refreshToken: refreshed.refreshToken,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt
      });
      const accessClient = new ForgetBaseClient({
        baseUrl: profile.baseUrl,
        apiKey: refreshed.accessToken,
        surface: "local-cache",
        fetchImpl: options.fetchImpl
      });
      await accessClient.revokeCurrentLocalDeviceSession();
      remoteSessionRevoked = true;
    }
    await rm(paths.profileDir, { recursive: true, force: true });
    await credentialStore.delete(paths.credentialAccount);
    return {
      profile: readProfileName(options.profile),
      remoteSessionRevoked,
      localCacheRemoved: true,
      secureEraseGuaranteed: false
    };
  } finally {
    await releaseLock();
  }
}

export class LocalKnowledgeStore {
  private database: DatabaseSync | null = null;
  private activeGenerationFile: string | null = null;
  private readyProfile: LocalRuntimeProfile | null = null;
  private profileIntegrityKey: string | null = null;
  private readonly paths: ProfilePaths;
  private readonly credentialStore: LocalCredentialStore;

  constructor(options: LocalRuntimeOptions = {}) {
    this.paths = resolveProfilePaths(options);
    this.credentialStore = options.credentialStore ?? createSystemCredentialStore();
  }

  async search(query: string, options: Omit<LocalSearchOptions, "root" | "profile"> = {}): Promise<LocalSearchResult[]> {
    const database = await this.readyDatabase(options.now);
    const profile = this.requireReadyProfile();
    const freshness = freshnessForProfile(profile, options.now ?? new Date());
    const limit = readSearchLimit(options.limit);
    const matchQuery = buildFtsQuery(query);
    const rows = database.prepare(`
      SELECT
        records.stable_id,
        records.title,
        records.summary,
        snippet(search_index, -1, '[', ']', '...', 24) AS snippet,
        bm25(search_index, 0.0, 8.0, 4.0, 2.0, 1.0) AS rank,
        records.source_ref,
        records.version_number,
        records.updated_at,
        records.record_json
      FROM search_index
      JOIN records ON records.stable_id = search_index.stable_id
      WHERE search_index MATCH ?
      ORDER BY rank ASC, records.stable_id ASC
      LIMIT ?
    `).all(matchQuery, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const record = localSyncRecordSchema.parse(JSON.parse(String(row.record_json)));
      return {
        stableId: String(row.stable_id),
        title: String(row.title),
        summary: row.summary === null ? null : String(row.summary),
        snippet: String(row.snippet ?? ""),
        score: -Number(row.rank),
        sourceRef: row.source_ref === null ? null : String(row.source_ref),
        versionNumber: Number(row.version_number),
        updatedAt: String(row.updated_at),
        assetType: record.asset.type,
        authority: authorityForRecord(record),
        freshness
      };
    });
  }

  async source(stableId: string, now?: Date): Promise<LocalSyncRecord | null> {
    if (!stableId.trim() || stableId.length > 250) {
      throw new Error("stableId must contain between 1 and 250 characters");
    }
    const database = await this.readyDatabase(now);
    const row = database.prepare("SELECT record_json FROM records WHERE stable_id = ?").get(stableId) as
      | { record_json: string }
      | undefined;
    return row ? localSyncRecordSchema.parse(JSON.parse(row.record_json)) : null;
  }

  async guidance(
    query: string,
    options: Omit<LocalSearchOptions, "root" | "profile"> & { maxBytes?: number } = {}
  ): Promise<LocalGuidanceResult> {
    const results = await this.search(query, options);
    const maxBytes = options.maxBytes ?? DEFAULT_GUIDANCE_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes < 1_024 || maxBytes > 1024 * 1024) {
      throw new RangeError("maxBytes must be between 1024 and 1048576");
    }
    const sources: LocalGuidanceSource[] = [];
    let truncated = false;
    for (const result of results) {
      const record = await this.source(result.stableId, options.now);
      if (!record) {
        continue;
      }
      const source: LocalGuidanceSource = {
        stableId: record.asset.stableId,
        title: record.asset.title,
        sourceRef: record.asset.sourceRef,
        versionNumber: record.version.versionNumber,
        assetType: record.asset.type,
        authority: authorityForRecord(record),
        instructions: record.instructionObjects.map((instruction) => ({
          instructionKind: instruction.instructionKind,
          targetAgents: instruction.targetAgents,
          body: instruction.body,
          constraints: instruction.constraints,
          failureModes: instruction.failureModes,
          escalation: instruction.escalation
        }))
      };
      const candidate = [...sources, source];
      if (Buffer.byteLength(JSON.stringify({ query, sources: candidate }), "utf8") > maxBytes) {
        truncated = true;
        break;
      }
      sources.push(source);
    }
    const profile = this.requireReadyProfile();
    return { query, sources, truncated, freshness: freshnessForProfile(profile, options.now ?? new Date()) };
  }

  close(): void {
    this.database?.close();
    this.database = null;
    this.activeGenerationFile = null;
    this.readyProfile = null;
    this.profileIntegrityKey = null;
  }

  private async readyDatabase(now = new Date()): Promise<DatabaseSync> {
    this.profileIntegrityKey ??= (await requireCredential(this.credentialStore, this.paths)).profileIntegrityKey;
    const profile = await readProfile(this.paths, this.profileIntegrityKey);
    assertProfileUsable(profile, now);
    if (!profile.activeGenerationFile) {
      throw new Error("The local profile has no active generation");
    }
    if (!this.database || this.activeGenerationFile !== profile.activeGenerationFile) {
      this.database?.close();
      await assertRegularPrivateFile(join(this.paths.generationsDir, profile.activeGenerationFile));
      const generationHash = await sha256File(join(this.paths.generationsDir, profile.activeGenerationFile));
      if (!profile.generationFileHash || !timingSafeTextEqual(generationHash, profile.generationFileHash)) {
        throw new Error("The active local generation failed its authenticated file-integrity check; rebuild the profile");
      }
      const { DatabaseSync } = await import("node:sqlite");
      this.database = new DatabaseSync(join(this.paths.generationsDir, profile.activeGenerationFile), {
        readOnly: true
      });
      this.database.exec("PRAGMA query_only = ON");
      this.activeGenerationFile = profile.activeGenerationFile;
    }
    this.readyProfile = profile;
    return this.database;
  }

  private requireReadyProfile(): LocalRuntimeProfile {
    if (!this.readyProfile) throw new Error("The local profile was not prepared for a query");
    return this.readyProfile;
  }
}

export async function openLocalKnowledgeStore(options: LocalRuntimeOptions = {}): Promise<LocalKnowledgeStore> {
  assertSupportedNodeVersion();
  const store = new LocalKnowledgeStore(options);
  await store.search("healthcheck", { limit: 1 }).catch(async (error: unknown) => {
    store.close();
    throw error;
  });
  return store;
}

export async function assertLocalProfileSelection(options: LocalRuntimeOptions = {}): Promise<void> {
  if (options.profile !== undefined) return;
  const root = resolve(options.root ?? process.env.FORGETBASE_HOME ?? join(homedir(), ".forgetbase"));
  try {
    const entries = await readdir(join(root, "profiles"), { withFileTypes: true });
    const profileNames = entries
      .filter((entry) => entry.isDirectory() && PROFILE_NAME_PATTERN.test(entry.name))
      .map((entry) => entry.name);
    if (profileNames.length > 1) {
      throw new Error("More than one ForgetBase Local profile exists; select one with --profile");
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

export async function searchLocalProfile(query: string, options: LocalSearchOptions = {}): Promise<LocalSearchResult[]> {
  const store = new LocalKnowledgeStore(options);
  try {
    return await store.search(query, options);
  } finally {
    store.close();
  }
}

export async function getLocalSource(stableId: string, options: LocalRuntimeOptions & { now?: Date } = {}) {
  const store = new LocalKnowledgeStore(options);
  try {
    return await store.source(stableId, options.now);
  } finally {
    store.close();
  }
}

export async function getLocalGuidance(
  query: string,
  options: LocalSearchOptions & { maxBytes?: number } = {}
): Promise<LocalGuidanceResult> {
  const store = new LocalKnowledgeStore(options);
  try {
    return await store.guidance(query, options);
  } finally {
    store.close();
  }
}

export async function getLocalStatus(options: LocalRuntimeOptions & { now?: Date } = {}): Promise<LocalRuntimeStatus> {
  const paths = resolveProfilePaths(options);
  const credentialStore = options.credentialStore ?? createSystemCredentialStore();
  const credential = await requireCredential(credentialStore, paths);
  const profile = await readProfile(paths, credential.profileIntegrityKey);
  const now = options.now ?? new Date();
  assertTrustedClock(profile, now);
  const effectiveNow = effectiveTrustedNow(profile, now);
  const status = profile.state === "revocation-pending"
    ? "revocation-pending"
    : profile.state === "not-built"
      ? "not-built"
      : !profile.leaseExpiresAt || Date.parse(profile.leaseExpiresAt) <= effectiveNow
        ? "expired"
        : "ready";
  return {
    profile: profile.name,
    status,
    serverId: profile.configuration.serverId,
    principalType: profile.configuration.principalType,
    principalId: profile.configuration.principalId,
    authorizationEpoch: profile.authorizationEpoch,
    contentGeneration: profile.contentGeneration,
    recordCount: profile.recordCount,
    lastSyncedAt: profile.lastSyncedAt,
    lastAuthorizationCheckAt: profile.lastAuthorizationCheckAt,
    leaseExpiresAt: profile.leaseExpiresAt,
    credentialStore: credentialStore.backend
  };
}

export async function doctorLocalProfile(options: LocalRuntimeOptions & { now?: Date } = {}): Promise<LocalDoctorResult> {
  const checks: LocalDoctorCheck[] = [];
  try {
    assertSupportedNodeVersion();
    checks.push({ name: "node-version", ok: true, detail: `Node ${process.versions.node}` });
  } catch (error) {
    checks.push({ name: "node-version", ok: false, detail: errorMessage(error) });
  }
  const paths = resolveProfilePaths(options);
  const credentialStore = options.credentialStore ?? createSystemCredentialStore();
  let profile: LocalRuntimeProfile;
  try {
    const credential = await requireCredential(credentialStore, paths);
    profile = await readProfile(paths, credential.profileIntegrityKey);
    checks.push({ name: "profile", ok: true, detail: `Profile ${profile.name} is readable` });
    checks.push({ name: "credential-store", ok: true, detail: `Credential available in ${credentialStore.backend}` });
  } catch (error) {
    checks.push({ name: "profile", ok: false, detail: errorMessage(error) });
    return { ok: false, checks };
  }

  const status = await getLocalStatus({ ...options, now: options.now, credentialStore });
  checks.push({ name: "lease", ok: status.status === "ready", detail: `Local cache status is ${status.status}` });
  if (!profile.activeGenerationFile) {
    checks.push({ name: "database", ok: false, detail: "No active generation" });
    return { ok: false, checks };
  }
  try {
    const generationPath = join(paths.generationsDir, profile.activeGenerationFile);
    await assertRegularPrivateFile(generationPath);
    const generationHash = await sha256File(generationPath);
    if (!profile.generationFileHash || !timingSafeTextEqual(generationHash, profile.generationFileHash)) {
      throw new Error("Active generation file hash does not match its authenticated profile metadata");
    }
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(generationPath, { readOnly: true });
    try {
      const integrity = database.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
      const snapshot = database.prepare("SELECT value FROM metadata WHERE key = 'snapshotId'").get() as
        | { value?: string }
        | undefined;
      if (integrity?.integrity_check !== "ok" || snapshot?.value !== profile.snapshotId) {
        throw new Error("SQLite integrity or generation metadata check failed");
      }
    } finally {
      database.close();
    }
    checks.push({ name: "database", ok: true, detail: `${profile.recordCount} records; SQLite integrity ok` });
  } catch (error) {
    checks.push({ name: "database", ok: false, detail: errorMessage(error) });
  }
  return { ok: checks.every((check) => check.ok), checks };
}

async function applyDelta(
  paths: ProfilePaths,
  profile: LocalRuntimeProfile,
  verified: ReturnType<typeof verifyLocalSyncManifestBundle>
): Promise<LocalSyncRecord[]> {
  if (profile.state !== "ready" || !profile.activeGenerationFile || !profile.recordSetHash
    || !profile.entitlementHash || !profile.generationFileHash) {
    throw new Error("A local sync delta requires a complete ready base generation");
  }
  if (!verified.baseRecordSetHash || verified.baseRecordSetHash !== profile.recordSetHash) {
    throw new Error("The local sync delta does not match the active base generation; request a full rebase");
  }

  const generationPath = join(paths.generationsDir, profile.activeGenerationFile);
  await assertRegularPrivateFile(generationPath);
  const generationHash = await sha256File(generationPath);
  if (!timingSafeTextEqual(generationHash, profile.generationFileHash)) {
    throw new Error("The delta base generation failed its authenticated file-integrity check");
  }

  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(generationPath, { readOnly: true });
  let baseRecords: LocalSyncRecord[];
  try {
    database.exec("PRAGMA query_only = ON");
    const integrity = database.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    if (integrity?.integrity_check !== "ok") {
      throw new Error("The delta base generation failed SQLite integrity validation");
    }
    const rows = database.prepare("SELECT record_json FROM records ORDER BY stable_id ASC").all() as Array<{
      record_json: string;
    }>;
    baseRecords = rows.map((row) => localSyncRecordSchema.parse(JSON.parse(row.record_json)));
  } finally {
    database.close();
  }

  if (baseRecords.length !== profile.recordCount
    || computeLocalSyncEntitlementHash(baseRecords) !== profile.entitlementHash
    || computeLocalSyncRecordSetHash(baseRecords) !== profile.recordSetHash) {
    throw new Error("The local sync delta base does not match authenticated profile metadata");
  }

  const nextByStableId = new Map(baseRecords.map((record) => [record.asset.stableId, record]));
  for (const stableId of verified.removedStableIds) {
    if (!nextByStableId.delete(stableId)) {
      throw new Error(`The local sync delta removes unknown stable ID ${stableId}`);
    }
  }
  for (const record of verified.records) {
    nextByStableId.set(record.asset.stableId, record);
  }
  const nextRecords = [...nextByStableId.values()]
    .sort((left, right) => compareCodeUnits(left.asset.stableId, right.asset.stableId));
  if (nextRecords.length !== verified.page.recordCount
    || computeLocalSyncEntitlementHash(nextRecords) !== verified.page.entitlementHash
    || computeLocalSyncRecordSetHash(nextRecords) !== verified.page.recordSetHash) {
    throw new Error("The applied local sync delta does not match its signed final record set");
  }
  return nextRecords;
}

async function buildGeneration(
  paths: ProfilePaths,
  activeGenerationFile: string,
  records: LocalSyncRecord[],
  page: {
    snapshotId: string;
    authorizationEpoch: number;
    contentGeneration: number;
    recordSetHash: string;
    leaseExpiresAt: string;
  }
): Promise<string> {
  await ensurePrivateDirectories(paths);
  const finalPath = join(paths.generationsDir, activeGenerationFile);
  const temporaryPath = join(paths.generationsDir, `.${activeGenerationFile}.${randomUUID()}.tmp`);
  const { DatabaseSync } = await import("node:sqlite");
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(temporaryPath);
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
      CREATE TABLE records (
        stable_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT,
        source_ref TEXT,
        version_number INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE VIRTUAL TABLE search_index USING fts5(
        stable_id UNINDEXED,
        title,
        summary,
        instructions,
        documents,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
    const insertMetadata = database.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    const metadata = {
      snapshotId: page.snapshotId,
      authorizationEpoch: String(page.authorizationEpoch),
      contentGeneration: String(page.contentGeneration),
      recordSetHash: page.recordSetHash,
      leaseExpiresAt: page.leaseExpiresAt,
      recordCount: String(records.length)
    };
    for (const [key, value] of Object.entries(metadata)) {
      insertMetadata.run(key, value);
    }
    const insertRecord = database.prepare(`
      INSERT INTO records (
        stable_id, title, summary, source_ref, version_number, updated_at, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSearch = database.prepare(`
      INSERT INTO search_index (stable_id, title, summary, instructions, documents)
      VALUES (?, ?, ?, ?, ?)
    `);
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const record of records) {
        insertRecord.run(
          record.asset.stableId,
          record.asset.title,
          record.asset.summary ?? null,
          record.asset.sourceRef,
          record.version.versionNumber,
          record.asset.updatedAt,
          JSON.stringify(record)
        );
        insertSearch.run(
          record.asset.stableId,
          record.asset.title,
          record.asset.summary ?? "",
          record.instructionObjects.map((instruction) => [
            instruction.body,
            ...instruction.constraints,
            ...instruction.failureModes,
            instruction.escalation ?? ""
          ].join("\n")).join("\n"),
          record.humanDocuments.map((document) => document.body).join("\n")
        );
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    database.close();
    database = null;
    await chmod(temporaryPath, 0o600);
    const handle = await open(temporaryPath, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    const integrityDatabase = new DatabaseSync(temporaryPath, { readOnly: true });
    try {
      const result = integrityDatabase.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
      const storedRecords = integrityDatabase.prepare("SELECT COUNT(*) AS count FROM records").get() as
        | { count?: number }
        | undefined;
      const indexedRecords = integrityDatabase.prepare("SELECT COUNT(*) AS count FROM search_index").get() as
        | { count?: number }
        | undefined;
      if (
        result?.integrity_check !== "ok" ||
        Number(storedRecords?.count) !== records.length ||
        Number(indexedRecords?.count) !== records.length
      ) {
        throw new Error("New local SQLite generation failed its integrity or completeness check");
      }
    } finally {
      integrityDatabase.close();
    }
    await rename(temporaryPath, finalPath);
    await syncDirectory(paths.generationsDir);
    return await sha256File(finalPath);
  } catch (error) {
    database?.close();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function validateRecordsForProfile(records: LocalSyncRecord[], configuration: LocalSyncConfiguration): void {
  let totalBytes = 0;
  const stableIds = new Set<string>();
  for (const recordInput of records) {
    const record = localSyncRecordSchema.parse(recordInput);
    const bytes = Buffer.byteLength(JSON.stringify(record), "utf8");
    totalBytes += bytes;
    if (bytes > maximumLocalRecordBytes || totalBytes > maximumLocalSnapshotBytes) {
      throw new Error("Local sync snapshot exceeds the client safety limit");
    }
    if (record.asset.tenantId !== configuration.tenantId
      || record.asset.lifecycleState !== "active"
      || record.asset.status !== "approved"
      || !configuration.allowedSensitivities.includes(record.asset.sensitivity as "public-demo" | "internal")
      || !record.asset.allowedSurfaces.includes("local-cache")) {
      throw new Error(`Local sync record ${record.recordId} is not eligible for this profile`);
    }
    if (stableIds.has(record.asset.stableId)) {
      throw new Error(`Local sync snapshot contains duplicate stable ID ${record.asset.stableId}`);
    }
    stableIds.add(record.asset.stableId);
  }
}

function buildFtsQuery(query: string): string {
  const normalized = query.trim();
  if (!normalized || normalized.length > MAXIMUM_QUERY_LENGTH) {
    throw new Error(`Query must contain between 1 and ${MAXIMUM_QUERY_LENGTH} characters`);
  }
  const tokens = normalized.match(/[\p{L}\p{N}_-]+/gu)?.slice(0, MAXIMUM_QUERY_TOKENS) ?? [];
  if (tokens.length === 0) {
    throw new Error("Query must contain at least one searchable word or number");
  }
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" OR ");
}

function readSearchLimit(value = defaultLocalSearchLimit): number {
  if (!Number.isInteger(value) || value < 1 || value > maximumLocalSearchLimit) {
    throw new RangeError(`Search limit must be between 1 and ${maximumLocalSearchLimit}`);
  }
  return value;
}

function assertProfileUsable(profile: LocalRuntimeProfile, now: Date): void {
  assertTrustedClock(profile, now);
  if (profile.state === "revocation-pending") {
    throw new Error("Local cache access is blocked while an authorization change is being applied");
  }
  if (profile.state !== "ready" || !profile.leaseExpiresAt) {
    throw new Error("Local cache is not ready; run forgetbase local sync");
  }
  if (Date.parse(profile.leaseExpiresAt) <= effectiveTrustedNow(profile, now)) {
    throw new Error("Local cache lease has expired; run forgetbase local sync");
  }
}

function resultFromProfile(profile: LocalRuntimeProfile, mode: "full" | "delta" | "unchanged"): LocalSyncResult {
  if (!profile.snapshotId || profile.authorizationEpoch === null || profile.contentGeneration === null || !profile.leaseExpiresAt) {
    throw new Error("Local profile is missing active generation metadata");
  }
  return {
    mode,
    profile: profile.name,
    snapshotId: profile.snapshotId,
    authorizationEpoch: profile.authorizationEpoch,
    contentGeneration: profile.contentGeneration,
    recordCount: profile.recordCount,
    leaseExpiresAt: profile.leaseExpiresAt
  };
}

async function ensurePrivateDirectories(paths: ProfilePaths): Promise<void> {
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await assertPrivateDirectory(paths.root);
  await chmod(paths.root, 0o700);
  await mkdir(paths.profileDir, { recursive: true, mode: 0o700 });
  await assertPrivateDirectory(paths.profileDir);
  await chmod(paths.profileDir, 0o700);
  await mkdir(paths.generationsDir, { recursive: true, mode: 0o700 });
  await assertPrivateDirectory(paths.generationsDir);
  await chmod(paths.generationsDir, 0o700);
}

async function writeProfile(
  paths: ProfilePaths,
  profile: LocalRuntimeProfile,
  profileIntegrityKey: string
): Promise<LocalRuntimeProfile> {
  await ensurePrivateDirectories(paths);
  const temporaryPath = join(paths.profileDir, `.profile.${randomUUID()}.tmp`);
  const authenticatedProfile = authenticateProfile(profile, profileIntegrityKey);
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(authenticatedProfile, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, paths.profileFile);
    await chmod(paths.profileFile, 0o600);
    await syncDirectory(paths.profileDir);
    return authenticatedProfile;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  await assertPrivateDirectory(directory);
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readProfile(paths: ProfilePaths, profileIntegrityKey: string): Promise<LocalRuntimeProfile> {
  await assertRegularPrivateFile(paths.profileFile, 256 * 1024);
  const input = JSON.parse(await readFile(paths.profileFile, "utf8")) as unknown;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Local profile is not a JSON object");
  }
  const value = input as Record<string, unknown>;
  const configuration = localSyncConfigurationSchema.parse(value.configuration);
  const state = value.state;
  if (value.schemaVersion !== 2
    || value.name !== readProfileName(String(value.name ?? ""))
    || typeof value.baseUrl !== "string"
    || (state !== "not-built" && state !== "ready" && state !== "revocation-pending")) {
    throw new Error("Local profile has an unsupported or invalid shape");
  }
  const activeGenerationFile = nullableString(value.activeGenerationFile);
  if (activeGenerationFile && (basename(activeGenerationFile) !== activeGenerationFile
    || !GENERATION_FILE_PATTERN.test(activeGenerationFile))) {
    throw new Error("Local profile contains an invalid generation filename");
  }
  const authorizationEpoch = nullablePositiveInteger(value.authorizationEpoch);
  const contentGeneration = nullablePositiveInteger(value.contentGeneration);
  const entitlementHash = nullableDigest(value.entitlementHash);
  const recordSetHash = nullableDigest(value.recordSetHash);
  const generationFileHash = nullableDigest(value.generationFileHash);
  const recordCount = value.recordCount;
  if (!Number.isInteger(recordCount) || Number(recordCount) < 0 || Number(recordCount) > 5_000) {
    throw new Error("Local profile contains an invalid record count");
  }
  const profile: LocalRuntimeProfile = {
    schemaVersion: 2,
    name: value.name as string,
    baseUrl: normalizeBaseUrl(value.baseUrl),
    configuration,
    state,
    activeGenerationFile,
    snapshotId: nullableString(value.snapshotId),
    authorizationEpoch,
    contentGeneration,
    entitlementHash,
    recordSetHash,
    recordCount: Number(recordCount),
    leaseExpiresAt: nullableDateTime(value.leaseExpiresAt),
    connectedAt: requiredDateTime(value.connectedAt, "connectedAt"),
    lastSyncedAt: nullableDateTime(value.lastSyncedAt),
    lastAuthorizationCheckAt: nullableDateTime(value.lastAuthorizationCheckAt),
    trustedServerTime: nullableDateTime(value.trustedServerTime),
    trustedTimeObservedAt: nullableDateTime(value.trustedTimeObservedAt),
    generationFileHash,
    integrityTag: requiredIntegrityTag(value.integrityTag)
  };
  const expected = profileIntegrityTag(profile, profileIntegrityKey);
  if (!timingSafeTextEqual(expected, profile.integrityTag)) {
    throw new Error("Local profile integrity verification failed; rebuild or reconnect the profile");
  }
  return profile;
}

async function pruneInactiveGenerations(paths: ProfilePaths, activeGenerationFile: string): Promise<void> {
  const files = await readdir(paths.generationsDir);
  await Promise.all(files
    .filter((file) => file !== activeGenerationFile && GENERATION_FILE_PATTERN.test(file))
    .map((file) => rm(join(paths.generationsDir, file), { force: true })));
}

function resolveProfilePaths(options: LocalRuntimeOptions): ProfilePaths {
  const root = resolve(options.root ?? process.env.FORGETBASE_HOME ?? join(homedir(), ".forgetbase"));
  const profile = readProfileName(options.profile);
  const profileDir = join(root, "profiles", profile);
  return {
    root,
    profileDir,
    generationsDir: join(profileDir, "generations"),
    profileFile: join(profileDir, "profile.json"),
    syncLockFile: join(profileDir, ".sync.lock"),
    credentialAccount: `profile:${createHash("sha256").update(`${root}\0${profile}`, "utf8").digest("hex")}`
  };
}

function readProfileName(value = "default"): string {
  if (!PROFILE_NAME_PATTERN.test(value)) {
    throw new Error("Profile names must use lowercase letters, numbers, dots, underscores, or hyphens");
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Local sync server URLs must not contain credentials, query parameters, or fragments");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("Local sync requires HTTPS except for a loopback development server");
  }
  return url.toString().replace(/\/$/, "");
}

function generationFileName(snapshotId: string): string {
  return `generation-${sha256Digest(snapshotId).slice("sha256:".length)}.sqlite`;
}

function assertSupportedNodeVersion(): void {
  if (compareVersions(process.versions.node, minimumLocalRuntimeNodeVersion) < 0) {
    throw new Error(`Local runtime requires Node ${minimumLocalRuntimeNodeVersion} or newer`);
  }
}

function assertSupportedClientVersion(minimumVersion: string): void {
  if (compareVersions(localRuntimeVersion, minimumVersion) < 0) {
    throw new Error(`Server requires local runtime ${minimumVersion} or newer`);
  }
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(".").slice(0, 3).map((part) => {
    const match = /^\d+/.exec(part);
    return match ? Number.parseInt(match[0], 10) : 0;
  });
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value) throw new Error("Local profile contains an invalid string");
  return value;
}

function nullablePositiveInteger(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error("Local profile contains an invalid counter");
  return Number(value);
}

function nullableDigest(value: unknown): string | null {
  return value === null ? null : localSyncDigestSchema.parse(value);
}

function requiredDateTime(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Local profile contains an invalid ${label}`);
  }
  return value;
}

function nullableDateTime(value: unknown): string | null {
  return value === null ? null : requiredDateTime(value, "date-time");
}

function requiredIntegrityTag(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error("Local profile contains an invalid integrity tag");
  }
  return value;
}

function authenticateProfile(profile: LocalRuntimeProfile, profileIntegrityKey: string): LocalRuntimeProfile {
  return { ...profile, integrityTag: profileIntegrityTag(profile, profileIntegrityKey) };
}

function profileIntegrityTag(profile: LocalRuntimeProfile, profileIntegrityKey: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(profileIntegrityKey)) {
    throw new Error("Local profile integrity key is invalid");
  }
  const { integrityTag: _integrityTag, ...payload } = profile;
  return createHmac("sha256", Buffer.from(profileIntegrityKey, "base64url"))
    .update(PROFILE_INTEGRITY_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(canonicalJson(payload), "utf8")
    .digest("base64url");
}

function timingSafeTextEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

async function requireCredential(
  credentialStore: LocalCredentialStore,
  paths: ProfilePaths
): Promise<LocalCredentialBundle> {
  const credential = await credentialStore.get(paths.credentialAccount);
  if (!credential) {
    throw new Error("No device credential exists for this local profile; connect it again");
  }
  return credential;
}

function assertPinnedConfiguration(
  pinned: LocalSyncConfiguration,
  current: LocalSyncConfiguration
): void {
  if (canonicalJson(pinned) !== canonicalJson(current)) {
    throw new Error("The server local-sync identity or policy differs from the pinned profile; reconnect to approve it");
  }
}

function assertTrustedClock(profile: LocalRuntimeProfile, now: Date): void {
  if (!Number.isFinite(now.getTime())) throw new Error("Current time is invalid");
  if ((profile.trustedServerTime === null) !== (profile.trustedTimeObservedAt === null)) {
    throw new Error("Local profile has an incomplete trusted-time anchor");
  }
  if (profile.trustedTimeObservedAt
    && now.getTime() + CLOCK_ROLLBACK_TOLERANCE_MILLISECONDS < Date.parse(profile.trustedTimeObservedAt)) {
    throw new Error("The local clock moved backward beyond the allowed tolerance; sync after correcting the clock");
  }
}

function effectiveTrustedNow(profile: LocalRuntimeProfile, now: Date): number {
  if (!profile.trustedServerTime || !profile.trustedTimeObservedAt) return now.getTime();
  const elapsed = Math.max(0, now.getTime() - Date.parse(profile.trustedTimeObservedAt));
  return Math.max(now.getTime(), Date.parse(profile.trustedServerTime) + elapsed);
}

function freshnessForProfile(profile: LocalRuntimeProfile, now: Date): LocalFreshness {
  if (!profile.lastAuthorizationCheckAt
    || !profile.leaseExpiresAt
    || profile.authorizationEpoch === null
    || profile.contentGeneration === null) {
    throw new Error("Local profile is missing freshness metadata");
  }
  return {
    status: now.getTime() - Date.parse(profile.lastAuthorizationCheckAt) > GENERAL_FRESHNESS_WARNING_MILLISECONDS
      ? "warning"
      : "fresh",
    lastAuthorizationCheckAt: profile.lastAuthorizationCheckAt,
    leaseExpiresAt: profile.leaseExpiresAt,
    authorizationEpoch: profile.authorizationEpoch,
    contentGeneration: profile.contentGeneration
  };
}

function authorityForRecord(record: LocalSyncRecord): LocalAuthority {
  if (record.asset.type === "policy" || record.asset.type === "guardrail" || record.asset.type === "sop") {
    return "mandatory";
  }
  if (record.asset.type === "guideline" || record.asset.type === "playbook" || record.asset.type === "skill") {
    return "recommended";
  }
  return "informational";
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error("ForgetBase Local storage contains a symlink or non-directory path component");
  }
}

async function assertRegularPrivateFile(path: string, maximumBytes = maximumLocalSnapshotBytes): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) {
    throw new Error("ForgetBase Local storage contains a symlink, hard link, or non-regular file");
  }
  if ((entry.mode & 0o077) !== 0) {
    throw new Error("ForgetBase Local storage file permissions are too broad");
  }
  if (entry.size > maximumBytes) {
    throw new Error("ForgetBase Local storage file exceeds the safety limit");
  }
}

async function sha256File(path: string): Promise<`sha256:${string}`> {
  const bytes = await readFile(path);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function acquireSyncLock(paths: ProfilePaths): Promise<() => Promise<void>> {
  await ensurePrivateDirectories(paths);
  const nonce = randomUUID();
  const contents = JSON.stringify({ pid: process.pid, nonce, createdAt: new Date().toISOString() });
  const tryAcquire = async (): Promise<boolean> => {
    try {
      const handle = await open(paths.syncLockFile, "wx", 0o600);
      try {
        await handle.writeFile(contents, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return true;
    } catch (error) {
      if (isAlreadyExistsError(error)) return false;
      throw error;
    }
  };
  if (!await tryAcquire()) {
    await recoverStaleSyncLock(paths.syncLockFile);
    if (!await tryAcquire()) {
      throw new Error("Another ForgetBase Local writer is already running for this profile");
    }
  }
  return async () => {
    try {
      const existing = await readFile(paths.syncLockFile, "utf8");
      if (existing === contents) await rm(paths.syncLockFile, { force: true });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  };
}

async function recoverStaleSyncLock(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error("The ForgetBase Local sync lock is not a regular file");
    }
    if (Date.now() - entry.mtimeMs < SYNC_LOCK_STALE_MILLISECONDS) return;
    const value = JSON.parse(await readFile(path, "utf8")) as { pid?: unknown };
    if (typeof value.pid !== "number" || !Number.isInteger(value.pid) || value.pid < 1 || processIsRunning(value.pid)) {
      return;
    }
    await rm(path, { force: true });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
