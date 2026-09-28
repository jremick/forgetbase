import { createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, PostgresAuthRepository, PostgresRegistryRepository, PostgresLocalSyncSnapshotRepository, runMigrations } from '../packages/db/src/index.js';
import { createEd25519LocalSyncSigner, createLocalSyncRecord, verifyLocalSyncManifestBundle } from '../packages/local-sync/src/index.js';
import { ForgetBaseClient } from '../packages/sdk/src/index.js';
import { connectLocalProfile, syncLocalProfile, disconnectLocalProfile, LocalKnowledgeStore, MemoryLocalCredentialStore } from '../packages/local-runtime/src/index.js';
import { buildServer } from '../apps/api/src/server.js';
import { localSyncMaxRecordBytes, type AssetCreateInput } from '../packages/schema/src/index.js';

// Strongest boundary: actual HTTP + SDK + PostgreSQL migrations/transactions +
// signed records + SQLite restart. Memory credentials are used only in CI; the
// native OS store and executable transports have a separate macOS proof.
// Failure cases: telemetry invalidates its own snapshot; 413 becomes 500;
// draft body/title replaces or removes publication; narrowed policy leaks;
// stale snapshots sign after mutations; rotated/revoked credentials still work.
const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('local runtime PostgreSQL HTTP end-to-end', () => {
  let pool: ReturnType<typeof createPool>;
  let adminPool: ReturnType<typeof createPool>;
  let isolatedDatabaseUrl: string;
  const databaseName = `local_runtime_e2e_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    adminPool = createPool(databaseUrl);
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
    const url = new URL(databaseUrl!);
    url.pathname = `/${databaseName}`;
    isolatedDatabaseUrl = url.toString();
    pool = createPool(isolatedDatabaseUrl);
    await runMigrations(pool);
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await adminPool.end();
    }
  });

  async function fixture() {
    const tenantId = `local_e2e_${randomUUID().replaceAll('-', '')}`;
    const registry = new PostgresRegistryRepository(pool);
    const auth = new PostgresAuthRepository(pool);
    const user = await auth.createUser({ tenantId, email: 'reader@example.test', displayName: 'Synthetic reader', role: 'reader', status: 'active' });
    const browser = await auth.issueLoginCredentials({
      tenantId, userId: user.id, keyName: 'synthetic browser', scopes: ['asset:read'], allowedSurfaces: ['web'],
      source: 'password', expiresAt: new Date(Date.now() + 3600_000).toISOString(), auditAction: 'auth.login'
    });
    if (!browser) throw new Error('Missing browser session');
    const nonce = 'synthetic-csrf';
    const csrf = `${nonce}.${createHmac('sha256', browser.secret).update(nonce).digest('base64url')}`;
    const browserHeaders = { cookie: `forgetbase_session=${browser.secret}; forgetbase_csrf=${csrf}`, 'x-forgetbase-csrf': csrf };
    const signer = createEd25519LocalSyncSigner({ keyId: 'synthetic-e2e', privateKey: generateKeyPairSync('ed25519').privateKey });
    const server = buildServer({
      databaseUrl: isolatedDatabaseUrl, autoMigrate: false, logger: false, localSyncSigner: signer,
      localSyncEnrollmentSecret: 'synthetic-enrollment-secret-at-least-32-bytes',
      localSyncPublicBaseUrl: 'http://127.0.0.1:49000', localSyncWebBaseUrl: 'http://127.0.0.1:49000',
      localSyncAllowInternal: true, requestRateLimitMax: 100_000
    });
    const baseUrl = await server.listen({ host: '127.0.0.1', port: 0 });
    const request = async (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init);
    const post = async (path: string, body: unknown, browserAuth = false) => request(path, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(browserAuth ? browserHeaders : {}) }, body: JSON.stringify(body)
    });
    const create = (stableId: string, overrides: Partial<AssetCreateInput> = {}) => registry.createAsset({
      tenantId, stableId, title: stableId, type: 'policy', ownerId: 'synthetic-owner', lifecycleState: 'active',
      sensitivity: 'public-demo', audience: ['developers'], status: 'approved', reviewDueAt: '2027-01-01',
      sourceKind: 'synthetic-demo', sourceRef: `https://example.test/${stableId}`, allowedSurfaces: ['local-cache'],
      humanDocument: { format: 'markdown', body: `Published anchor ${stableId}` }, ...overrides
    });
    const root = await mkdtemp(join(tmpdir(), 'forgetbase-local-e2e-'));
    const credentialStore = new MemoryLocalCredentialStore();
    const options = { root, profile: 'proof', credentialStore };
    let lastDevice: { accessToken: string; refreshToken: string; deviceSession: { id: string } };
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).endsWith('/token') || String(input).endsWith('/refresh')) {
        if (response.ok) lastDevice = await response.clone().json() as typeof lastDevice;
      }
      return response;
    };
    const connect = () => connectLocalProfile({
      ...options, baseUrl, fetchImpl,
      authorizer: async ({ approvalUrl, state }) => {
        const token = new URL(approvalUrl).searchParams.get('local-device-request');
        const preview = await post('/local-sync/v1/device-sessions/authorization/preview', { requestToken: token }, true);
        expect(preview.status).toBe(200);
        const approval = await post('/local-sync/v1/device-sessions/authorization', { requestToken: token }, true);
        expect(approval.status).toBe(200);
        const redirect = new URL((await approval.json() as { redirectUrl: string }).redirectUrl);
        expect(redirect.searchParams.get('state')).toBe(state);
        // Exercise the real loopback callback as well as the token exchange.
        expect((await fetch(redirect)).status).toBe(200);
        return redirect.searchParams.get('code')!;
      }
    });
    return { tenantId, registry, auth, user, browserHeaders, server, request, post, create, options, fetchImpl, connect,
      device: () => lastDevice,
      client: () => new ForgetBaseClient({ baseUrl, surface: 'local-cache', apiKey: lastDevice.accessToken }),
      close: async () => { await server.close(); await rm(root, { recursive: true, force: true }); }
    };
  }

  it('enrolls, signs paginated publication, rotates credentials, applies deltas and deletions, and fails closed on revocation', async () => {
    const f = await fixture();
    try {
      for (let index = 0; index < 105; index++) await f.create(`policy.p${String(index).padStart(3, '0')}`);
      await f.create('policy.internal', { sensitivity: 'internal' });
      await f.create('policy.restricted', { sensitivity: 'restricted' });
      await f.create('policy.draft-only', { lifecycleState: 'draft', status: 'draft' });
      await f.auth.createPermissionGrant({ tenantId: f.tenantId, stableId: 'policy.internal', principalType: 'user', principalId: f.user.id, action: 'read', surfaces: ['local-cache'] });
      await f.connect();
      const initialDevice = f.device();
      const client = f.client();
      const configuration = await client.getLocalSyncConfiguration();
      const manifest = await client.getLocalSyncManifest();
      expect(manifest.pages.length).toBeGreaterThan(1);
      const verified = verifyLocalSyncManifestBundle(manifest, { configuration });
      expect(verified.records).toHaveLength(106);
      expect(JSON.stringify(manifest)).not.toContain('policy.restricted');
      expect(JSON.stringify(manifest)).not.toContain('policy.draft-only');
      expect((await f.request('/assets', { headers: { authorization: `Bearer ${initialDevice.accessToken}` } })).status).toBe(403);
      expect((await syncLocalProfile({ ...f.options, fetchImpl: f.fetchImpl })).mode).toBe('full');
      await expect(client.refreshLocalDeviceSession({ refreshToken: initialDevice.refreshToken })).rejects.toMatchObject({ status: 401 });
      expect((await f.request('/local-sync/v1/configuration', { headers: { authorization: `Bearer ${initialDevice.accessToken}` } })).status).toBe(401);
      expect((await syncLocalProfile({ ...f.options, fetchImpl: f.fetchImpl })).mode).toBe('unchanged');

      await f.registry.updateAsset('policy.p000', { tenantId: f.tenantId, title: 'DRAFT SENTINEL', summary: 'DRAFT SUMMARY SENTINEL', humanDocument: { format: 'markdown', body: 'DRAFT BODY SENTINEL' } });
      const draftSync = await syncLocalProfile({ ...f.options, fetchImpl: f.fetchImpl });
      expect(draftSync.recordCount).toBe(106);
      let store = new LocalKnowledgeStore(f.options);
      expect((await store.source('policy.p000'))?.asset.title).toBe('policy.p000');
      expect(JSON.stringify(await store.source('policy.p000'))).not.toContain('DRAFT');
      expect(await store.search('anchor')).not.toHaveLength(0);
      store.close();
      // Fresh object reopens SQLite and OS-backed profile metadata without HTTP.
      store = new LocalKnowledgeStore(f.options);
      expect((await store.source('policy.p000'))?.humanDocuments[0]?.body).toBe('Published anchor policy.p000');
      store.close();
      await f.registry.publishAsset('policy.p000', { tenantId: f.tenantId });
      expect((await syncLocalProfile({ ...f.options, fetchImpl: f.fetchImpl })).mode).toBe('delta');
      store = new LocalKnowledgeStore(f.options);
      expect((await store.source('policy.p000'))?.asset.title).toBe('DRAFT SENTINEL');
      store.close();
      await f.registry.updateAsset('policy.internal', { tenantId: f.tenantId, sensitivity: 'restricted', humanDocument: { format: 'markdown', body: 'Internal policy now restricted' } });
      await f.registry.updateAsset('policy.p001', { tenantId: f.tenantId, allowedSurfaces: ['web'], humanDocument: { format: 'markdown', body: 'Web only' } });
      const removal = await syncLocalProfile({ ...f.options, fetchImpl: f.fetchImpl });
      expect(removal).toMatchObject({ mode: 'delta', recordCount: 104 });
      store = new LocalKnowledgeStore(f.options);
      expect(await store.source('policy.internal')).toBeNull();
      expect(await store.source('policy.p001')).toBeNull();
      store.close();
      const revoked = await f.request(`/local-sync/v1/device-sessions/${f.device().deviceSession.id}`, { method: 'DELETE', headers: f.browserHeaders });
      expect(revoked.status).toBe(200);
      await expect(syncLocalProfile({ ...f.options, fetchImpl: f.fetchImpl })).rejects.toMatchObject({ status: 401 });
      store = new LocalKnowledgeStore(f.options);
      await expect(store.search('anchor')).rejects.toThrow();
      store.close();
      await disconnectLocalProfile({ ...f.options, localOnly: true });
    } finally { await f.close(); }
  }, 300_000);

  it('rejects device refresh credentials on the browser route without consuming them', async () => {
    const f = await fixture();
    try {
      await f.connect();
      const response = await f.request('/auth/session/refresh', { method: 'POST',
        headers: { cookie: `forgetbase_refresh=${f.device().refreshToken}` } });
      expect(response.status).toBe(401);
      const deviceRefresh = await f.client().refreshLocalDeviceSession({ refreshToken: f.device().refreshToken });
      expect(deviceRefresh.deviceSession.source).toBe('local-device');
      expect(Date.parse(deviceRefresh.accessTokenExpiresAt) - Date.now()).toBeLessThanOrEqual(600_000);
    } finally { await f.close(); }
  }, 30_000);

  it('returns 413 for an oversized authorized record without an internal error', async () => {
    const f = await fixture();
    try {
      await f.create('policy.large', { humanDocument: { format: 'markdown', body: 'x'.repeat(localSyncMaxRecordBytes + 1) } });
      await f.connect();
      const response = await f.request('/local-sync/v1/manifest', { headers: { authorization: `Bearer ${f.device().accessToken}` } });
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: 'local_sync_payload_too_large' });
    } finally { await f.close(); }
  }, 30_000);

  it('rejects a database snapshot after concurrent content or authorization mutation', async () => {
    const f = await fixture();
    try {
      await f.create('policy.concurrent');
      await f.connect();
      const principal = await f.auth.authenticateApiKey(f.device().accessToken);
      const snapshots = new PostgresLocalSyncSnapshotRepository(pool);
      const capture = () => snapshots.buildSnapshot({ principal: principal!, sensitivities: ['public-demo'], maxRecords: 100, maxRecordBytes: 1_000_000, maxSnapshotBytes: 10_000_000 }, detail => {
        const record = createLocalSyncRecord(detail);
        return { record, descriptor: { stableId: record.asset.stableId, payloadHash: record.payloadHash, recordId: record.recordId } };
      });
      const first = await capture();
      await f.registry.updateAsset('policy.concurrent', { tenantId: f.tenantId, sensitivity: 'restricted', humanDocument: { format: 'markdown', body: 'Concurrent restricted policy' } });
      await expect(snapshots.assertSnapshotCurrent({ principal: principal!, state: first.state!, serializationRevision: first.serializationRevision, serializationFingerprint: first.serializationFingerprint }, () => 'must not sign')).rejects.toThrow(/stale/);
      const second = await capture();
      await f.auth.revokeLoginSession({ tenantId: f.tenantId, sessionId: f.device().deviceSession.id });
      await expect(snapshots.assertSnapshotCurrent({ principal: principal!, state: second.state!, serializationRevision: second.serializationRevision, serializationFingerprint: second.serializationFingerprint }, () => 'must not sign')).rejects.toThrow(/stale/);
    } finally { await f.close(); }
  }, 30_000);
});
