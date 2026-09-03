import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign as signBytes,
  timingSafeEqual,
  verify as verifyBytes,
  type KeyObject
} from "node:crypto";
import {
  localSyncManifestBundleSchema,
  localSyncManifestPagePayloadSchema,
  localSyncManifestPageSchema,
  localSyncDigestSchema,
  localSyncMaxRecordBytes,
  localSyncMaxRecords,
  localSyncMaxRecordsPerPage,
  localSyncMaxSnapshotBytes,
  localSyncRecordSchema,
  type AssetDetail,
  type LocalSyncConfiguration,
  type LocalSyncManifestBundle,
  type LocalSyncManifestPage,
  type LocalSyncManifestPagePayload,
  type LocalSyncRecord
} from "@forgetbase/schema";

const LOCAL_SYNC_SIGNATURE_DOMAIN = "forgetbase.local-sync.manifest-page.v1";
const LOCAL_DEVICE_REQUEST_DOMAIN = "forgetbase.local-device.authorization-request.v1";
const LOCAL_DEVICE_CODE_DOMAIN = "forgetbase.local-device.authorization-code.v1";
const LOCAL_DEVICE_MAX_TOKEN_TTL_MS = 10 * 60 * 1_000;

export interface LocalDeviceAuthorizationRequestPayload {
  kind: "request";
  enrollmentId: string;
  serverId: string;
  serverOrigin: string;
  signingKeyId: string;
  deviceName: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  issuedAt: string;
  expiresAt: string;
}

export interface LocalDeviceAuthorizationCodePayload extends Omit<LocalDeviceAuthorizationRequestPayload, "kind"> {
  kind: "code";
  tenantId: string;
  userId: string;
}

export interface LocalSyncSigner {
  readonly keyId: string;
  readonly publicKey: string;
  sign(input: string): string;
}

export interface CreateLocalSyncManifestOptions {
  signer: LocalSyncSigner;
  serverId: string;
  tenantId: string;
  principalType: "user" | "service-account";
  principalId: string;
  authorizationEpoch: number;
  contentGeneration: number;
  records: LocalSyncRecord[];
  issuedAt?: Date;
  leaseDurationSeconds: number;
  minimumClientVersion: string;
  allowedSensitivities: Array<"public-demo" | "internal">;
  snapshotId?: string;
  knownAuthorizationEpoch?: number;
  knownContentGeneration?: number;
  knownRecordSetHash?: string;
  maxRecordsPerPage?: number;
  delta?: {
    baseRecordSetHash: string;
    records: LocalSyncRecord[];
    removedStableIds: string[];
  };
}

export interface VerifyLocalSyncManifestOptions {
  configuration: LocalSyncConfiguration;
  now?: Date;
  maximumClockSkewSeconds?: number;
  minimumAuthorizationEpoch?: number;
  minimumContentGeneration?: number;
}

export interface VerifiedLocalSyncManifest {
  page: LocalSyncManifestPage;
  records: LocalSyncRecord[];
  removedStableIds: string[];
  baseRecordSetHash: string | null;
}

type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | {
  [key: string]: CanonicalJsonValue;
};

function normalizeCanonicalJson(value: unknown): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain non-finite numbers");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeCanonicalJson(entry));
  }

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, CanonicalJsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) {
        normalized[key] = normalizeCanonicalJson(source[key]);
      }
    }
    return normalized;
  }

  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonicalJson(value));
}

export function sha256Digest(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function createLocalDevicePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString("base64url");
  return { verifier, challenge: createLocalDevicePkceChallenge(verifier) };
}

export function createLocalDevicePkceChallenge(verifier: string): string {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) {
    throw new TypeError("Local device PKCE verifier must be 43 to 128 base64url characters");
  }
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function createLocalDeviceAuthorizationRequest(options: {
  secret: string;
  serverId: string;
  serverOrigin: string;
  signingKeyId: string;
  deviceName: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  issuedAt?: Date;
  ttlMs?: number;
  enrollmentId?: string;
}): { token: string; payload: LocalDeviceAuthorizationRequestPayload } {
  assertEnrollmentSecret(options.secret);
  const issuedAt = options.issuedAt ?? new Date();
  const ttlMs = options.ttlMs ?? 5 * 60 * 1_000;
  assertLocalDeviceTokenTtl(ttlMs);
  const payload: LocalDeviceAuthorizationRequestPayload = {
    kind: "request",
    enrollmentId: options.enrollmentId ?? randomUUID(),
    serverId: requiredBoundString(options.serverId, "serverId", 250),
    serverOrigin: requiredBoundString(options.serverOrigin, "serverOrigin", 2_048),
    signingKeyId: requiredBoundString(options.signingKeyId, "signingKeyId", 250),
    deviceName: requiredBoundString(options.deviceName, "deviceName", 120),
    redirectUri: requiredBoundString(options.redirectUri, "redirectUri", 2_048),
    state: requiredBoundBase64Url(options.state, "state", 32, 128),
    codeChallenge: requiredBoundBase64Url(options.codeChallenge, "codeChallenge", 43, 128),
    codeChallengeMethod: "S256",
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString()
  };
  return { token: signBoundToken(payload, options.secret, LOCAL_DEVICE_REQUEST_DOMAIN), payload };
}

export function verifyLocalDeviceAuthorizationRequest(
  token: string,
  secret: string,
  now = new Date()
): LocalDeviceAuthorizationRequestPayload {
  return validateAuthorizationRequestPayload(
    verifyBoundToken(token, secret, LOCAL_DEVICE_REQUEST_DOMAIN),
    now
  );
}

export function createLocalDeviceAuthorizationCode(options: {
  request: LocalDeviceAuthorizationRequestPayload;
  tenantId: string;
  userId: string;
  secret: string;
  issuedAt?: Date;
  ttlMs?: number;
}): { token: string; payload: LocalDeviceAuthorizationCodePayload } {
  assertEnrollmentSecret(options.secret);
  const issuedAt = options.issuedAt ?? new Date();
  const ttlMs = options.ttlMs ?? 2 * 60 * 1_000;
  assertLocalDeviceTokenTtl(ttlMs);
  const requestExpiry = Date.parse(options.request.expiresAt);
  if (!Number.isFinite(requestExpiry) || requestExpiry <= issuedAt.getTime()) {
    throw new Error("Local device authorization request has expired");
  }
  const payload: LocalDeviceAuthorizationCodePayload = {
    ...options.request,
    kind: "code",
    tenantId: requiredBoundString(options.tenantId, "tenantId", 250),
    userId: requiredBoundString(options.userId, "userId", 250),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(Math.min(requestExpiry, issuedAt.getTime() + ttlMs)).toISOString()
  };
  return { token: signBoundToken(payload, options.secret, LOCAL_DEVICE_CODE_DOMAIN), payload };
}

export function verifyLocalDeviceAuthorizationCode(
  token: string,
  secret: string,
  now = new Date()
): LocalDeviceAuthorizationCodePayload {
  const value = verifyBoundToken(token, secret, LOCAL_DEVICE_CODE_DOMAIN);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Local device authorization code is invalid");
  }
  const source = value as Record<string, unknown>;
  if (source.kind !== "code") {
    throw new Error("Local device authorization code has the wrong purpose");
  }
  const request = validateAuthorizationRequestPayload({ ...source, kind: "request" }, now);
  return {
    ...request,
    kind: "code",
    tenantId: requiredBoundString(source.tenantId, "tenantId", 250),
    userId: requiredBoundString(source.userId, "userId", 250)
  };
}

function validateAuthorizationRequestPayload(value: unknown, now: Date): LocalDeviceAuthorizationRequestPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Local device authorization request is invalid");
  }
  const source = value as Record<string, unknown>;
  if (source.kind !== "request" || source.codeChallengeMethod !== "S256") {
    throw new Error("Local device authorization request has the wrong purpose");
  }
  const issuedAt = requiredBoundDateTime(source.issuedAt, "issuedAt");
  const expiresAt = requiredBoundDateTime(source.expiresAt, "expiresAt");
  const issuedAtMs = Date.parse(issuedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (issuedAtMs > now.getTime() + 5 * 60 * 1_000 || expiresAtMs <= now.getTime()
    || expiresAtMs - issuedAtMs > LOCAL_DEVICE_MAX_TOKEN_TTL_MS) {
    throw new Error("Local device authorization request has expired or invalid timing");
  }
  return {
    kind: "request",
    enrollmentId: requiredBoundString(source.enrollmentId, "enrollmentId", 250),
    serverId: requiredBoundString(source.serverId, "serverId", 250),
    serverOrigin: requiredBoundString(source.serverOrigin, "serverOrigin", 2_048),
    signingKeyId: requiredBoundString(source.signingKeyId, "signingKeyId", 250),
    deviceName: requiredBoundString(source.deviceName, "deviceName", 120),
    redirectUri: requiredBoundString(source.redirectUri, "redirectUri", 2_048),
    state: requiredBoundBase64Url(source.state, "state", 32, 128),
    codeChallenge: requiredBoundBase64Url(source.codeChallenge, "codeChallenge", 43, 128),
    codeChallengeMethod: "S256",
    issuedAt,
    expiresAt
  };
}

function signBoundToken(payload: unknown, secret: string, domain: string): string {
  const encodedPayload = Buffer.from(canonicalJson(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(`${domain}.${encodedPayload}`, "ascii").digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyBoundToken(token: string, secret: string, domain: string): unknown {
  assertEnrollmentSecret(secret);
  if (token.length > 8_192) {
    throw new Error("Local device authorization token is too large");
  }
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra !== undefined
    || !/^[A-Za-z0-9_-]+$/.test(encodedPayload) || !/^[A-Za-z0-9_-]+$/.test(suppliedSignature)) {
    throw new Error("Local device authorization token is malformed");
  }
  const expectedSignature = createHmac("sha256", secret)
    .update(`${domain}.${encodedPayload}`, "ascii")
    .digest();
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (supplied.byteLength !== expectedSignature.byteLength || !timingSafeEqual(supplied, expectedSignature)) {
    throw new Error("Local device authorization token signature is invalid");
  }
  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new Error("Local device authorization token payload is invalid");
  }
}

function assertEnrollmentSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Local device enrollment secret must contain at least 32 bytes");
  }
}

function assertLocalDeviceTokenTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > LOCAL_DEVICE_MAX_TOKEN_TTL_MS) {
    throw new RangeError("Local device authorization TTL must be between 1 second and 10 minutes");
  }
}

function requiredBoundString(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximumLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Local device authorization ${label} is invalid`);
  }
  return value;
}

function requiredBoundBase64Url(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number
): string {
  if (typeof value !== "string" || value.length < minimumLength || value.length > maximumLength
    || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Local device authorization ${label} is invalid`);
  }
  return value;
}

function requiredBoundDateTime(value: unknown, label: string): string {
  const result = requiredBoundString(value, label, 64);
  if (!Number.isFinite(Date.parse(result))) {
    throw new Error(`Local device authorization ${label} is invalid`);
  }
  return result;
}

export function createEd25519LocalSyncSigner(options: {
  keyId: string;
  privateKey: string | Buffer | KeyObject;
}): LocalSyncSigner {
  const privateKey = typeof options.privateKey === "string" || Buffer.isBuffer(options.privateKey)
    ? createPrivateKey(options.privateKey)
    : options.privateKey;
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError("The local sync signing key must be Ed25519");
  }
  const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();

  return {
    keyId: options.keyId,
    publicKey,
    sign(input) {
      return signBytes(null, Buffer.from(input, "utf8"), privateKey).toString("base64url");
    }
  };
}

function unsignedRecord(record: LocalSyncRecord): Omit<LocalSyncRecord, "payloadHash"> {
  const { payloadHash: _payloadHash, ...payload } = record;
  return payload;
}

export function createLocalSyncRecord(detail: AssetDetail): LocalSyncRecord {
  const currentVersionId = detail.asset.currentVersionId;
  if (!currentVersionId) {
    throw new Error(`Asset ${detail.asset.stableId} does not have a current version`);
  }
  const version = detail.versions.find((candidate) => candidate.id === currentVersionId);
  if (!version) {
    throw new Error(`Asset ${detail.asset.stableId} is missing current version ${currentVersionId}`);
  }

  const payload = {
    recordId: sha256Digest(`${detail.asset.stableId}\0${version.id}`),
    asset: detail.asset,
    version,
    instructionObjects: detail.instructionObjects.filter((instruction) => instruction.versionId === version.id),
    humanDocuments: detail.humanDocuments.filter((document) => document.versionId === version.id)
  };

  return localSyncRecordSchema.parse({
    ...payload,
    payloadHash: sha256Digest(canonicalJson(payload))
  });
}

export function computeLocalSyncEntitlementHash(records: LocalSyncRecord[]): `sha256:${string}` {
  const identities = records
    .map((record) => record.asset.stableId)
    .sort(compareCodeUnits);
  return sha256Digest(canonicalJson(identities));
}

export function computeLocalSyncRecordSetHash(records: LocalSyncRecord[]): `sha256:${string}` {
  const identities = records
    .map((record) => ({ recordId: record.recordId, payloadHash: record.payloadHash }))
    .sort((left, right) => compareCodeUnits(left.recordId, right.recordId));
  return sha256Digest(canonicalJson(identities));
}

function normalizeRemovedStableIds(values: string[]): string[] {
  if (values.length > localSyncMaxRecords) {
    throw new RangeError(`Local sync delta supports at most ${localSyncMaxRecords} removals`);
  }
  const normalized = values.map((value) => {
    if (typeof value !== "string" || !value || value.length > 250 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new TypeError("Local sync delta contains an invalid removed stable ID");
    }
    return value;
  }).sort(compareCodeUnits);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Local sync delta contains duplicate removed stable IDs");
  }
  return normalized;
}

function signatureInput(
  payload: LocalSyncManifestPagePayload,
  pageHash: string,
  signingKeyId: string
): string {
  return canonicalJson({
    domain: LOCAL_SYNC_SIGNATURE_DOMAIN,
    payload,
    pageHash,
    signingKeyId
  });
}

export function createLocalSyncManifestBundle(options: CreateLocalSyncManifestOptions): LocalSyncManifestBundle {
  if (options.records.length > localSyncMaxRecords) {
    throw new RangeError(`Local sync supports at most ${localSyncMaxRecords} records`);
  }
  if (!Number.isInteger(options.authorizationEpoch) || options.authorizationEpoch < 1) {
    throw new RangeError("authorizationEpoch must be a positive integer");
  }
  if (!Number.isInteger(options.contentGeneration) || options.contentGeneration < 1) {
    throw new RangeError("contentGeneration must be a positive integer");
  }
  if (!Number.isInteger(options.leaseDurationSeconds) || options.leaseDurationSeconds < 1) {
    throw new RangeError("leaseDurationSeconds must be a positive integer");
  }

  const maxRecordsPerPage = options.maxRecordsPerPage ?? localSyncMaxRecordsPerPage;
  if (!Number.isInteger(maxRecordsPerPage) || maxRecordsPerPage < 1 || maxRecordsPerPage > localSyncMaxRecordsPerPage) {
    throw new RangeError(`maxRecordsPerPage must be between 1 and ${localSyncMaxRecordsPerPage}`);
  }

  const records = options.records
    .map((record) => localSyncRecordSchema.parse(record))
    .sort((left, right) => compareCodeUnits(left.asset.stableId, right.asset.stableId));
  let snapshotBytes = 0;
  for (const record of records) {
    const recordBytes = Buffer.byteLength(canonicalJson(record), "utf8");
    snapshotBytes += recordBytes;
    if (recordBytes > localSyncMaxRecordBytes || snapshotBytes > localSyncMaxSnapshotBytes) {
      throw new RangeError("Local sync snapshot exceeds the signed payload safety limit");
    }
    const expectedHash = sha256Digest(canonicalJson(unsignedRecord(record)));
    if (record.payloadHash !== expectedHash) {
      throw new Error(`Local sync record ${record.recordId} has an invalid payload hash`);
    }
  }

  const entitlementHash = computeLocalSyncEntitlementHash(records);
  const recordSetHash = computeLocalSyncRecordSetHash(records);
  const unchanged = options.knownAuthorizationEpoch === options.authorizationEpoch
    && options.knownContentGeneration === options.contentGeneration
    && options.knownRecordSetHash === recordSetHash;
  const mode = unchanged ? "unchanged" : options.delta ? "delta" : "full";
  const manifestRecords = unchanged ? [] : options.delta?.records ?? records;
  const removedStableIds = mode === "delta"
    ? normalizeRemovedStableIds(options.delta?.removedStableIds ?? [])
    : [];
  const baseRecordSetHash = mode === "delta"
    ? localSyncDigestSchema.parse(options.delta?.baseRecordSetHash)
    : null;
  if (mode === "delta") {
    const currentByStableId = new Map(records.map((record) => [record.asset.stableId, record]));
    for (const changed of manifestRecords) {
      if (currentByStableId.get(changed.asset.stableId)?.payloadHash !== changed.payloadHash) {
        throw new Error("Local sync delta contains a record outside the final record set");
      }
    }
    if (removedStableIds.some((stableId) => currentByStableId.has(stableId))) {
      throw new Error("Local sync delta removes a record that remains in the final record set");
    }
  }
  const chunks: LocalSyncRecord[][] = [];
  for (let offset = 0; offset < manifestRecords.length; offset += maxRecordsPerPage) {
    chunks.push(manifestRecords.slice(offset, offset + maxRecordsPerPage));
  }
  if (chunks.length === 0) {
    chunks.push([]);
  }
  if (chunks.length > Math.ceil(localSyncMaxRecords / localSyncMaxRecordsPerPage)) {
    throw new RangeError("Local sync manifest exceeds the maximum signed page count");
  }

  const issuedAt = options.issuedAt ?? new Date();
  const issuedAtIso = issuedAt.toISOString();
  const leaseExpiresAt = new Date(issuedAt.getTime() + options.leaseDurationSeconds * 1_000).toISOString();
  const snapshotId = options.snapshotId ?? randomUUID();
  const pages: LocalSyncManifestPage[] = [];
  let previousPageHash: `sha256:${string}` | null = null;

  for (const [pageIndex, pageRecords] of chunks.entries()) {
    const payload = localSyncManifestPagePayloadSchema.parse({
      protocolVersion: "1",
      mode,
      serverId: options.serverId,
      tenantId: options.tenantId,
      principalType: options.principalType,
      principalId: options.principalId,
      snapshotId,
      authorizationEpoch: options.authorizationEpoch,
      contentGeneration: options.contentGeneration,
      entitlementHash,
      recordSetHash,
      baseRecordSetHash,
      issuedAt: issuedAtIso,
      serverTime: issuedAtIso,
      leaseExpiresAt,
      minimumClientVersion: options.minimumClientVersion,
      allowedSensitivities: options.allowedSensitivities,
      pageIndex,
      pageCount: chunks.length,
      recordCount: records.length,
      changedRecordCount: manifestRecords.length,
      removalCount: removedStableIds.length,
      previousPageHash,
      records: pageRecords,
      removedStableIds: pageIndex === 0 ? removedStableIds : []
    });
    const pageHash = sha256Digest(canonicalJson(payload));
    const page = localSyncManifestPageSchema.parse({
      ...payload,
      pageHash,
      signingKeyId: options.signer.keyId,
      signature: options.signer.sign(signatureInput(payload, pageHash, options.signer.keyId))
    });
    pages.push(page);
    previousPageHash = pageHash;
  }

  return localSyncManifestBundleSchema.parse({ pages });
}

function pagePayload(page: LocalSyncManifestPage): LocalSyncManifestPagePayload {
  return localSyncManifestPagePayloadSchema.parse(page);
}

export class TrustedLocalSyncManifestError extends Error {
  readonly authorizationEpoch: number;

  constructor(message: string, authorizationEpoch: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TrustedLocalSyncManifestError";
    this.authorizationEpoch = authorizationEpoch;
  }
}

export function verifyLocalSyncManifestBundle(
  input: LocalSyncManifestBundle,
  options: VerifyLocalSyncManifestOptions
): VerifiedLocalSyncManifest {
  const bundle = localSyncManifestBundleSchema.parse(input);
  const configuration = options.configuration;
  const firstPage = bundle.pages[0];
  if (!firstPage) {
    throw new Error("Local sync manifest has no pages");
  }
  const maximumClockSkewSeconds = options.maximumClockSkewSeconds ?? 300;
  if (!Number.isFinite(maximumClockSkewSeconds) || maximumClockSkewSeconds < 0) {
    throw new RangeError("maximumClockSkewSeconds must be a non-negative number");
  }

  const expectedIdentity = {
    protocolVersion: configuration.protocolVersion,
    serverId: configuration.serverId,
    tenantId: configuration.tenantId,
    principalType: configuration.principalType,
    principalId: configuration.principalId,
    signingKeyId: configuration.signingKeyId
  };
  const verificationKey = createPublicKey(configuration.signingPublicKey);
  if (verificationKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Pinned local sync signing key is not Ed25519");
  }

  for (const page of bundle.pages) {
    const payload = pagePayload(page);
    if (page.protocolVersion !== expectedIdentity.protocolVersion
      || page.serverId !== expectedIdentity.serverId
      || page.tenantId !== expectedIdentity.tenantId
      || page.principalType !== expectedIdentity.principalType
      || page.principalId !== expectedIdentity.principalId
      || page.signingKeyId !== expectedIdentity.signingKeyId) {
      throw new Error("Local sync manifest identity does not match the pinned configuration");
    }
    const expectedPageHash = sha256Digest(canonicalJson(payload));
    if (page.pageHash !== expectedPageHash) {
      throw new Error("Local sync manifest page hash is invalid");
    }
    const verified = verifyBytes(
      null,
      Buffer.from(signatureInput(payload, page.pageHash, page.signingKeyId), "utf8"),
      verificationKey,
      Buffer.from(page.signature, "base64url")
    );
    if (!verified) {
      throw new Error("Local sync manifest signature is invalid");
    }
  }

  const trustedAuthorizationEpoch = Math.max(...bundle.pages.map((page) => page.authorizationEpoch));
  try {
    if (firstPage.pageCount !== bundle.pages.length) {
      throw new Error("Local sync page count does not match the bundle");
    }
    const now = options.now ?? new Date();
    const maximumClockSkewMs = maximumClockSkewSeconds * 1_000;
    const serverTimeMs = Date.parse(firstPage.serverTime);
    const leaseExpiresAtMs = Date.parse(firstPage.leaseExpiresAt);
    if (serverTimeMs > now.getTime() + maximumClockSkewMs) {
      throw new Error("Signed server time is too far in the future");
    }
    if (leaseExpiresAtMs <= now.getTime()) {
      throw new Error("Local sync manifest lease has expired");
    }
    if (leaseExpiresAtMs <= serverTimeMs
      || leaseExpiresAtMs - serverTimeMs > configuration.leaseDurationSeconds * 1_000) {
      throw new Error("Local sync manifest lease exceeds the pinned configuration");
    }
    if (firstPage.recordCount > configuration.maxRecords) {
      throw new Error("Local sync manifest record count exceeds the pinned configuration");
    }
    if (firstPage.pageCount > Math.ceil(configuration.maxRecords / configuration.maxRecordsPerPage)) {
      throw new Error("Local sync manifest page count exceeds the pinned configuration");
    }
    if ((options.minimumAuthorizationEpoch ?? 0) > firstPage.authorizationEpoch) {
      throw new Error("Local sync manifest authorization epoch is older than the accepted high-water mark");
    }
    if ((options.minimumContentGeneration ?? 0) > firstPage.contentGeneration) {
      throw new Error("Local sync manifest content generation is older than the accepted high-water mark");
    }

    let previousPageHash: string | null = null;
    const records: LocalSyncRecord[] = [];
    const removedStableIds: string[] = [];
    for (const [expectedPageIndex, page] of bundle.pages.entries()) {
      if (page.pageIndex !== expectedPageIndex || page.previousPageHash !== previousPageHash) {
        throw new Error("Local sync manifest page order or chain is invalid");
      }
      if (page.records.length > configuration.maxRecordsPerPage) {
        throw new Error("Local sync manifest page exceeds the pinned record limit");
      }
      if (page.snapshotId !== firstPage.snapshotId
        || page.mode !== firstPage.mode
        || page.authorizationEpoch !== firstPage.authorizationEpoch
        || page.contentGeneration !== firstPage.contentGeneration
        || page.entitlementHash !== firstPage.entitlementHash
        || page.recordSetHash !== firstPage.recordSetHash
        || page.baseRecordSetHash !== firstPage.baseRecordSetHash
        || page.recordCount !== firstPage.recordCount
        || page.changedRecordCount !== firstPage.changedRecordCount
        || page.removalCount !== firstPage.removalCount
        || page.pageCount !== firstPage.pageCount
        || page.issuedAt !== firstPage.issuedAt
        || page.serverTime !== firstPage.serverTime
        || page.leaseExpiresAt !== firstPage.leaseExpiresAt
        || page.minimumClientVersion !== firstPage.minimumClientVersion) {
        throw new Error("Local sync manifest page metadata is inconsistent");
      }
      if (canonicalJson(page.allowedSensitivities) !== canonicalJson(firstPage.allowedSensitivities)
        || canonicalJson(page.allowedSensitivities) !== canonicalJson(configuration.allowedSensitivities)) {
        throw new Error("Local sync manifest sensitivity policy is inconsistent");
      }
      records.push(...page.records);
      if (expectedPageIndex === 0) {
        removedStableIds.push(...page.removedStableIds);
      } else if (page.removedStableIds.length !== 0) {
        throw new Error("Local sync removals must appear only on the first page");
      }
      previousPageHash = page.pageHash;
    }

    if (firstPage.mode === "unchanged") {
      if (records.length !== 0 || removedStableIds.length !== 0 || bundle.pages.length !== 1
        || firstPage.baseRecordSetHash !== null || firstPage.changedRecordCount !== 0
        || firstPage.removalCount !== 0) {
        throw new Error("An unchanged local sync manifest must not include records");
      }
    } else {
      if (records.length !== firstPage.changedRecordCount) {
        throw new Error("Local sync record count does not match the signed manifest");
      }
      if (removedStableIds.length !== firstPage.removalCount) {
        throw new Error("Local sync removal count does not match the signed manifest");
      }
      const normalizedRemovals = normalizeRemovedStableIds(removedStableIds);
      const normalizedRemovalSet = new Set(normalizedRemovals);
      if (canonicalJson(normalizedRemovals) !== canonicalJson(removedStableIds)) {
        throw new Error("Local sync removals are not in canonical order");
      }
      if (firstPage.mode === "full" && (firstPage.baseRecordSetHash !== null
        || removedStableIds.length !== 0 || records.length !== firstPage.recordCount)) {
        throw new Error("A full local sync manifest has invalid delta metadata");
      }
      if (firstPage.mode === "delta" && firstPage.baseRecordSetHash === null) {
        throw new Error("A local sync delta is missing its base record-set hash");
      }
      let snapshotBytes = 0;
      const recordIds = new Set<string>();
      const stableIds = new Set<string>();
      for (const record of records) {
        const recordBytes = Buffer.byteLength(canonicalJson(record), "utf8");
        snapshotBytes += recordBytes;
        if (recordBytes > configuration.maxRecordBytes || snapshotBytes > configuration.maxSnapshotBytes) {
          throw new Error("Local sync manifest payload exceeds the pinned byte limit");
        }
        if (recordIds.has(record.recordId) || stableIds.has(record.asset.stableId)) {
          throw new Error("Local sync manifest contains duplicate record identity");
        }
        recordIds.add(record.recordId);
        stableIds.add(record.asset.stableId);
        if (normalizedRemovalSet.has(record.asset.stableId)) {
          throw new Error("Local sync delta both changes and removes the same stable ID");
        }
        if (record.asset.tenantId !== configuration.tenantId
          || record.asset.lifecycleState !== "active"
          || record.asset.status !== "approved"
          || !configuration.allowedSensitivities.includes(record.asset.sensitivity as "public-demo" | "internal")
          || !record.asset.allowedSurfaces.includes("local-cache")) {
          throw new Error(`Local sync record ${record.recordId} is not eligible for the pinned configuration`);
        }
        const expectedPayloadHash = sha256Digest(canonicalJson(unsignedRecord(record)));
        if (record.payloadHash !== expectedPayloadHash) {
          throw new Error(`Local sync record ${record.recordId} has an invalid payload hash`);
        }
      }
      if (firstPage.mode === "full" && (computeLocalSyncEntitlementHash(records) !== firstPage.entitlementHash
        || computeLocalSyncRecordSetHash(records) !== firstPage.recordSetHash)) {
        throw new Error("Local sync manifest record-set hashes are invalid");
      }
    }

    return {
      page: firstPage,
      records,
      removedStableIds,
      baseRecordSetHash: firstPage.baseRecordSetHash
    };
  } catch (error) {
    throw new TrustedLocalSyncManifestError(errorMessage(error), trustedAuthorizationEpoch, error);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
