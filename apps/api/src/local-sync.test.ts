import { createHmac, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  localSyncConfigurationSchema,
  localSyncManifestBundleSchema
} from "@forgetbase/schema";
import {
  InMemoryAuthRepository,
  InMemoryLocalSyncStateRepository,
  InMemoryRegistryRepository
} from "@forgetbase/db";
import {
  createEd25519LocalSyncSigner,
  createLocalDevicePkcePair,
  verifyLocalSyncManifestBundle
} from "@forgetbase/local-sync";
import { buildServer } from "./server.js";

const servers: ReturnType<typeof buildServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function fixture(options: { allowInternal?: boolean } = {}) {
  const registryRepository = new InMemoryRegistryRepository();
  const authRepository = new InMemoryAuthRepository();
  const localSyncStateRepository = new InMemoryLocalSyncStateRepository();
  const user = await authRepository.createUser({
    tenantId: "tenant_demo",
    email: "pilot@example.test",
    displayName: "Pilot user",
    role: "reader",
    status: "active",
    password: "private-pilot-password",
  });
  const browserCredentials = await authRepository.issueLoginCredentials({
    tenantId: "tenant_demo",
    userId: user.id,
    keyName: "browser login",
    scopes: ["asset:read"],
    allowedSurfaces: ["web"],
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
    source: "password",
    absoluteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    auditAction: "auth.login"
  });
  if (!browserCredentials) throw new Error("Test browser session was not created");
  const serviceAccount = await authRepository.createServiceAccount({
    slug: "broader-key",
    name: "Broader key",
    role: "reader"
  });
  const broadKey = await authRepository.createApiKey({
    serviceAccountId: serviceAccount.id,
    name: "broad local sync",
    scopes: ["admin", "local:sync"],
    allowedSurfaces: ["local-cache"]
  });
  if (!broadKey) throw new Error("Test API key was not created");

  const createAsset = async (input: {
    stableId: string;
    title: string;
    tenantId?: string;
    sensitivity?: "public-demo" | "internal" | "restricted";
    lifecycleState?: "active" | "draft";
    status?: string;
  }) => registryRepository.createAsset({
    tenantId: input.tenantId,
    stableId: input.stableId,
    type: "policy",
    ownerId: "user_admin",
    title: input.title,
    lifecycleState: input.lifecycleState ?? "active",
    sensitivity: input.sensitivity ?? "public-demo",
    audience: ["developers"],
    status: input.status ?? "approved",
    reviewDueAt: "2027-01-01",
    sourceKind: "synthetic-demo",
    sourceRef: input.stableId,
    allowedSurfaces: ["local-cache"],
    instruction: {
      instructionKind: "policy",
      targetAgents: ["coding-agent"],
      body: `Apply ${input.title}.`
    },
    humanDocument: {
      format: "markdown",
      body: `# ${input.title}\n\nLocal guidance for ${input.stableId}.`
    }
  });

  await createAsset({ stableId: "policy.public", title: "Public policy" });
  await createAsset({ stableId: "policy.internal.allowed", title: "Allowed internal policy", sensitivity: "internal" });
  await createAsset({ stableId: "policy.internal.denied", title: "Denied internal policy", sensitivity: "internal" });
  await createAsset({ stableId: "policy.restricted", title: "Restricted policy", sensitivity: "restricted" });
  await createAsset({ stableId: "policy.draft", title: "Draft policy", lifecycleState: "draft", status: "reviewing" });
  await authRepository.createPermissionGrant({
    stableId: "policy.internal.allowed",
    principalType: "user",
    principalId: user.id,
    action: "read",
    surfaces: ["local-cache"]
  });
  await authRepository.createPermissionGrant({
    stableId: "policy.restricted",
    principalType: "user",
    principalId: user.id,
    action: "read",
    surfaces: ["local-cache"]
  });

  const { privateKey } = generateKeyPairSync("ed25519");
  const localSyncSigner = createEd25519LocalSyncSigner({ keyId: "test-local-key", privateKey });
  const server = buildServer({
    logger: false,
    registryRepository,
    authRepository,
    localSyncStateRepository,
    localSyncSigner,
    localSyncEnrollmentSecret: "test-local-device-enrollment-secret-with-32-bytes",
    localSyncPublicBaseUrl: "https://forgetbase.example.test",
    localSyncWebBaseUrl: "https://forgetbase.example.test",
    localSyncServerId: "server_test",
    localSyncLeaseDurationSeconds: 3_600,
    localSyncAllowInternal: options.allowInternal ?? true
  });
  servers.push(server);
  const localKey = await enrollLocalDevice(server, browserCredentials.secret);
  return {
    server,
    authRepository,
    registryRepository,
    user,
    createAsset,
    localKey,
    broadKey,
    browserKey: browserCredentials.secret
  };
}

async function enrollLocalDevice(server: ReturnType<typeof buildServer>, browserKey: string) {
  const pkce = createLocalDevicePkcePair();
  const state = "local-device-test-state".padEnd(43, "x");
  const started = await server.inject({
    method: "POST",
    url: "/local-sync/v1/device-sessions",
    payload: {
      deviceName: "Test laptop",
      redirectUri: "http://127.0.0.1:45731/forgetbase/local/callback",
      state,
      codeChallenge: pkce.challenge,
      codeChallengeMethod: "S256"
    }
  });
  expect(started.statusCode).toBe(201);
  const requestToken = started.json().requestToken as string;
  const approved = await server.inject({
    method: "POST",
    url: "/local-sync/v1/device-sessions/authorization",
    headers: browserSessionHeaders(browserKey),
    payload: { requestToken }
  });
  expect(approved.statusCode).toBe(200);
  const redirect = new URL(approved.json().redirectUrl as string);
  expect(redirect.searchParams.get("state")).toBe(state);
  const exchanged = await server.inject({
    method: "POST",
    url: "/local-sync/v1/device-sessions/token",
    payload: {
      code: redirect.searchParams.get("code"),
      codeVerifier: pkce.verifier
    }
  });
  expect(exchanged.statusCode).toBe(201);
  return exchanged.json() as {
    accessToken: string;
    refreshToken: string;
    deviceSession: { id: string };
  };
}

function browserSessionHeaders(secret: string): { cookie: string; "x-forgetbase-csrf": string } {
  const nonce = "local-device-test-csrf-nonce";
  const csrf = `${nonce}.${createHmac("sha256", secret).update(nonce).digest("base64url")}`;
  return {
    cookie: `forgetbase_session=${encodeURIComponent(secret)}; forgetbase_csrf=${encodeURIComponent(csrf)}`,
    "x-forgetbase-csrf": csrf
  };
}

describe("local agent sync API", () => {
  it("returns only eligible records allowed for the authenticated principal", async () => {
    const { server, authRepository, localKey } = await fixture();
    const configurationResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/configuration",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    expect(configurationResponse.statusCode).toBe(200);
    const configuration = localSyncConfigurationSchema.parse(configurationResponse.json());

    const manifestResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    expect(manifestResponse.statusCode).toBe(200);
    expect(manifestResponse.headers["cache-control"]).toBe("no-store");
    const manifest = localSyncManifestBundleSchema.parse(manifestResponse.json());
    const verified = verifyLocalSyncManifestBundle(manifest, { configuration });

    expect(verified.records.map((record) => record.asset.stableId)).toEqual([
      "policy.internal.allowed",
      "policy.public"
    ]);
    expect(manifestResponse.body).not.toContain("policy.internal.denied");
    expect(manifestResponse.body).not.toContain("policy.restricted");
    expect(manifestResponse.body).not.toContain("policy.draft");
    const auditEvent = (await authRepository.listAuditEvents())
      .find((event) => event.action === "local_sync.manifest.generate");
    expect(auditEvent?.metadata).toMatchObject({ recordCount: 2 });
    expect(auditEvent?.metadata).not.toHaveProperty("permissionDeniedCount");
    expect(auditEvent?.metadata).not.toHaveProperty("ineligibleCount");
  });

  it("supports a signed unchanged response and rejects broader credentials", async () => {
    const { server, localKey, broadKey } = await fixture();
    const configurationResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/configuration",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    const configuration = localSyncConfigurationSchema.parse(configurationResponse.json());
    const firstResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    const first = localSyncManifestBundleSchema.parse(firstResponse.json()).pages[0]!;
    const unchangedResponse = await server.inject({
      method: "GET",
      url: `/local-sync/v1/manifest?knownAuthorizationEpoch=${first.authorizationEpoch}`
        + `&knownContentGeneration=${first.contentGeneration}`
        + `&knownRecordSetHash=${encodeURIComponent(first.recordSetHash)}`,
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    const unchanged = localSyncManifestBundleSchema.parse(unchangedResponse.json());
    expect(verifyLocalSyncManifestBundle(unchanged, { configuration }).page.mode).toBe("unchanged");
    expect(unchanged.pages[0]!.records).toEqual([]);

    const broadResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${broadKey.secret}` }
    });
    expect(broadResponse.statusCode).toBe(403);
    expect(broadResponse.json().error).toBe("dedicated_local_sync_credential_required");
  });

  it("returns a compact one-generation delta and rebases a stale caller with a full snapshot", async () => {
    const { server, localKey, createAsset } = await fixture();
    const configuration = localSyncConfigurationSchema.parse((await server.inject({
      method: "GET",
      url: "/local-sync/v1/configuration",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    })).json());
    const first = localSyncManifestBundleSchema.parse((await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    })).json()).pages[0]!;

    await createAsset({ stableId: "policy.delta.one", title: "Delta policy one" });
    const fromFirst = `/local-sync/v1/manifest?knownAuthorizationEpoch=${first.authorizationEpoch}`
      + `&knownContentGeneration=${first.contentGeneration}`
      + `&knownRecordSetHash=${encodeURIComponent(first.recordSetHash)}`;
    const deltaBundle = localSyncManifestBundleSchema.parse((await server.inject({
      method: "GET",
      url: fromFirst,
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    })).json());
    const delta = verifyLocalSyncManifestBundle(deltaBundle, { configuration });
    expect(delta.page).toMatchObject({
      mode: "delta",
      baseRecordSetHash: first.recordSetHash,
      recordCount: 3,
      changedRecordCount: 1,
      removalCount: 0
    });
    expect(delta.records.map((record) => record.asset.stableId)).toEqual(["policy.delta.one"]);

    await createAsset({ stableId: "policy.delta.two", title: "Delta policy two" });
    const staleBundle = localSyncManifestBundleSchema.parse((await server.inject({
      method: "GET",
      url: fromFirst,
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    })).json());
    const stale = verifyLocalSyncManifestBundle(staleBundle, { configuration });
    expect(stale.page).toMatchObject({ mode: "full", recordCount: 4 });
    expect(stale.records).toHaveLength(4);
  });

  it("reconciles direct-grant and group-membership contractions without retaining denied records", async () => {
    const { server, localKey, authRepository, registryRepository, user, createAsset } = await fixture();
    const configuration = localSyncConfigurationSchema.parse((await server.inject({
      method: "GET",
      url: "/local-sync/v1/configuration",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    })).json());
    const manifestAfter = async (known?: { authorizationEpoch: number; contentGeneration: number; recordSetHash: string }) => {
      const query = known
        ? `?knownAuthorizationEpoch=${known.authorizationEpoch}`
          + `&knownContentGeneration=${known.contentGeneration}`
          + `&knownRecordSetHash=${encodeURIComponent(known.recordSetHash)}`
        : "";
      const response = await server.inject({
        method: "GET",
        url: `/local-sync/v1/manifest${query}`,
        headers: { authorization: `Bearer ${localKey.accessToken}` }
      });
      expect(response.statusCode).toBe(200);
      return verifyLocalSyncManifestBundle(localSyncManifestBundleSchema.parse(response.json()), { configuration });
    };

    const first = await manifestAfter();
    await authRepository.createPermissionGrant({
      stableId: "policy.internal.allowed",
      principalType: "user",
      principalId: user.id,
      action: "read",
      surfaces: ["api"]
    });
    const directRemoved = await manifestAfter(first.page);
    expect(directRemoved.page.mode).toBe("delta");
    expect(directRemoved.removedStableIds).toEqual(["policy.internal.allowed"]);
    expect(JSON.stringify(directRemoved)).not.toContain("Allowed internal policy");

    await authRepository.createPermissionGrant({
      stableId: "policy.internal.allowed",
      principalType: "user",
      principalId: user.id,
      action: "read",
      surfaces: ["local-cache"]
    });
    const directRestored = await manifestAfter(directRemoved.page);
    expect(directRestored.records.map((record) => record.asset.stableId)).toEqual(["policy.internal.allowed"]);

    await createAsset({ stableId: "policy.group", title: "Group policy", sensitivity: "internal" });
    const group = await authRepository.createGroup({ slug: "pilot-group", name: "Pilot group" });
    await authRepository.createPermissionGrant({
      stableId: "policy.group",
      principalType: "group",
      principalId: group.id,
      action: "read",
      surfaces: ["local-cache"]
    });
    await authRepository.addGroupMember({ groupId: group.id, userId: user.id });
    const groupAdded = await manifestAfter(directRestored.page);
    expect(groupAdded.records.map((record) => record.asset.stableId)).toEqual(["policy.group"]);

    await authRepository.removeGroupMember({ groupId: group.id, userId: user.id });
    const groupRemoved = await manifestAfter(groupAdded.page);
    expect(groupRemoved.removedStableIds).toEqual(["policy.group"]);
    expect(JSON.stringify(groupRemoved)).not.toContain("Group policy");
    expect(await registryRepository.getAssetByStableId("policy.group", { tenantId: user.tenantId })).not.toBeNull();

    await registryRepository.updateAsset("policy.public", {
      tenantId: user.tenantId,
      allowedSurfaces: ["api"],
      instruction: {
        instructionKind: "policy",
        targetAgents: ["coding-agent"],
        body: "Apply Public policy."
      },
      changeNote: "Remove local-cache eligibility"
    });
    const surfaceRemoved = await manifestAfter(groupRemoved.page);
    expect(surfaceRemoved.removedStableIds).toEqual(["policy.public"]);
    expect(JSON.stringify(surfaceRemoved)).not.toContain("Public policy");
  });

  it("keeps same-tenant principals and another tenant in separate signed projections", async () => {
    const { server, authRepository, createAsset, localKey } = await fixture();
    const createBrowserKey = async (tenantId: string, email: string, label: string) => {
      const user = await authRepository.createUser({
        tenantId,
        email,
        displayName: label,
        role: "reader",
        status: "active",
        password: "synthetic-isolation-password"
      });
      const credentials = await authRepository.issueLoginCredentials({
        tenantId,
        userId: user.id,
        keyName: `${label} browser`,
        scopes: ["asset:read"],
        allowedSurfaces: ["web"],
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        source: "password",
        absoluteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        auditAction: "auth.login"
      });
      if (!credentials) throw new Error("Isolation browser credentials were not created");
      return credentials.secret;
    };
    const sameTenantKey = await enrollLocalDevice(
      server,
      await createBrowserKey("tenant_demo", "second@example.test", "Second user")
    );
    await createAsset({
      tenantId: "tenant_other",
      stableId: "policy.other-tenant",
      title: "Other tenant policy"
    });
    const otherTenantKey = await enrollLocalDevice(
      server,
      await createBrowserKey("tenant_other", "other@example.test", "Other tenant user")
    );
    const readProjection = async (accessToken: string, known?: {
      authorizationEpoch: number;
      contentGeneration: number;
      recordSetHash: string;
    }) => {
      const configuration = localSyncConfigurationSchema.parse((await server.inject({
        method: "GET",
        url: "/local-sync/v1/configuration",
        headers: { authorization: `Bearer ${accessToken}` }
      })).json());
      const query = known
        ? `?knownAuthorizationEpoch=${known.authorizationEpoch}`
          + `&knownContentGeneration=${known.contentGeneration}`
          + `&knownRecordSetHash=${encodeURIComponent(known.recordSetHash)}`
        : "";
      const response = await server.inject({
        method: "GET",
        url: `/local-sync/v1/manifest${query}`,
        headers: { authorization: `Bearer ${accessToken}` }
      });
      expect(response.statusCode).toBe(200);
      return {
        body: response.body,
        verified: verifyLocalSyncManifestBundle(localSyncManifestBundleSchema.parse(response.json()), { configuration })
      };
    };

    const first = await readProjection(localKey.accessToken);
    const second = await readProjection(sameTenantKey.accessToken);
    const other = await readProjection(otherTenantKey.accessToken, first.verified.page);
    expect(second.verified.records.map((record) => record.asset.stableId)).toEqual(["policy.public"]);
    expect(second.body).not.toContain("policy.internal.allowed");
    expect(second.body).not.toContain("policy.internal.denied");
    expect(other.verified.page.mode).toBe("full");
    expect(other.verified.records.map((record) => record.asset.stableId)).toEqual(["policy.other-tenant"]);
    expect(other.body).not.toContain("policy.public");
    expect(other.body).not.toContain("policy.internal");
    expect(first.body).not.toContain("policy.other-tenant");
  });

  it.each(["/auth/me", "/assets", "/search?query=policy", "/exports/ai-package"])(
    "rejects the dedicated local credential outside local-sync on %s",
    async (url) => {
      const { server, localKey } = await fixture();
      const response = await server.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${localKey.accessToken}` }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("local_sync_credential_route_restricted");
    }
  );

  it("keeps internal synchronization disabled unless the deployment opts in", async () => {
    const { server, localKey } = await fixture({ allowInternal: false });
    const configurationResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/configuration",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    expect(configurationResponse.json().allowedSensitivities).toEqual(["public-demo"]);
    const manifestResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    const manifest = localSyncManifestBundleSchema.parse(manifestResponse.json());
    expect(manifest.pages.flatMap((page) => page.records).map((entry) => entry.asset.stableId)).toEqual([
      "policy.public"
    ]);
    expect(manifestResponse.body).not.toContain("policy.internal.allowed");
  });

  it("scans past full pages of denied records without counting them against the authorized cap", async () => {
    const { server, localKey, createAsset } = await fixture();
    await Promise.all(Array.from({ length: 251 }, (_, index) => createAsset({
      stableId: `aaa.denied.${String(index).padStart(3, "0")}`,
      title: `Denied policy ${index}`,
      sensitivity: "internal"
    })));

    const manifestResponse = await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });

    expect(manifestResponse.statusCode).toBe(200);
    const manifest = localSyncManifestBundleSchema.parse(manifestResponse.json());
    expect(manifest.pages.flatMap((page) => page.records).map((record) => record.asset.stableId)).toEqual([
      "policy.internal.allowed",
      "policy.public"
    ]);
    expect(manifestResponse.body).not.toContain("aaa.denied");
  });

  it("rotates refresh tokens once, lists the named device, and enforces browser revocation", async () => {
    const { server, localKey, browserKey } = await fixture();
    const refreshed = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions/refresh",
      payload: { refreshToken: localKey.refreshToken }
    });
    expect(refreshed.statusCode).toBe(200);
    const rotated = refreshed.json() as {
      accessToken: string;
      refreshToken: string;
      deviceSession: { id: string; source: string; deviceLabel: string };
    };
    expect(rotated.refreshToken).not.toBe(localKey.refreshToken);
    expect(rotated.deviceSession).toMatchObject({ source: "local-device", deviceLabel: "Test laptop" });

    const replay = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions/refresh",
      payload: { refreshToken: localKey.refreshToken }
    });
    expect(replay.statusCode).toBe(401);

    const listed = await server.inject({
      method: "GET",
      url: "/local-sync/v1/device-sessions",
      headers: browserSessionHeaders(browserKey)
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().devices).toEqual([
      expect.objectContaining({ id: rotated.deviceSession.id, source: "local-device", deviceLabel: "Test laptop" })
    ]);

    const revoked = await server.inject({
      method: "DELETE",
      url: `/local-sync/v1/device-sessions/${rotated.deviceSession.id}`,
      headers: browserSessionHeaders(browserKey)
    });
    expect(revoked.statusCode).toBe(200);
    const afterRevoke = await server.inject({
      method: "GET",
      url: "/local-sync/v1/configuration",
      headers: { authorization: `Bearer ${rotated.accessToken}` }
    });
    expect(afterRevoke.statusCode).toBe(401);
    const refreshAfterRevoke = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions/refresh",
      payload: { refreshToken: rotated.refreshToken }
    });
    expect(refreshAfterRevoke.statusCode).toBe(401);
  });

  it("denies both local-sync access and refresh after the owning account is disabled", async () => {
    const { server, authRepository, localKey, user } = await fixture();
    expect((await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    })).statusCode).toBe(200);
    await authRepository.updateUser({ tenantId: user.tenantId, userId: user.id, status: "disabled" });

    const manifest = await server.inject({
      method: "GET",
      url: "/local-sync/v1/manifest",
      headers: { authorization: `Bearer ${localKey.accessToken}` }
    });
    const refresh = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions/refresh",
      payload: { refreshToken: localKey.refreshToken }
    });
    expect(manifest.statusCode).toBe(401);
    expect(refresh.statusCode).toBe(401);
  });

  it("rejects non-literal loopback redirects and replayed authorization codes", async () => {
    const { server, browserKey } = await fixture();
    const pkce = createLocalDevicePkcePair();
    const invalidRedirect = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions",
      payload: {
        deviceName: "Host alias",
        redirectUri: "http://localhost:45731/forgetbase/local/callback",
        state: "invalid-redirect-state".padEnd(43, "x"),
        codeChallenge: pkce.challenge,
        codeChallengeMethod: "S256"
      }
    });
    expect(invalidRedirect.statusCode).toBe(400);

    const state = "replay-test-state".padEnd(43, "x");
    const started = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions",
      payload: {
        deviceName: "Replay test",
        redirectUri: "http://127.0.0.1:45732/forgetbase/local/callback",
        state,
        codeChallenge: pkce.challenge,
        codeChallengeMethod: "S256"
      }
    });
    const bearerApproval = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions/authorization",
      headers: { authorization: `Bearer ${browserKey}` },
      payload: { requestToken: started.json().requestToken }
    });
    expect(bearerApproval.statusCode).toBe(403);
    expect(bearerApproval.json().error).toBe("browser_login_session_required");
    const approved = await server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions/authorization",
      headers: browserSessionHeaders(browserKey),
      payload: { requestToken: started.json().requestToken }
    });
    const code = new URL(approved.json().redirectUrl as string).searchParams.get("code");
    const exchange = () => server.inject({
      method: "POST",
      url: "/local-sync/v1/device-sessions/token",
      payload: { code, codeVerifier: pkce.verifier }
    });
    expect((await exchange()).statusCode).toBe(201);
    expect((await exchange()).statusCode).toBe(401);
  });
});
