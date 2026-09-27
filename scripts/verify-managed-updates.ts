/**
 * Real managed-update E2E proof. Run on an explicitly authorized disposable Linux
 * Docker host after `pnpm build`. Source, database, attachments and registry are
 * synthetic; this never installs a host service or publishes a public image.
 *
 * MANAGED_PROOF_DIR=/private/evidence MANAGED_PROOF_CONFIRM=synthetic-docker
 * pnpm exec tsx scripts/verify-managed-updates.ts
 *
 * The Docker host must resolve its own loopback registry. A runner container can
 * use --network host, or set MANAGED_PROOF_DOCKER_HOST to host.docker.internal.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer } from "node:http";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, computeComposeBundleDigest, initializeManagedInstallation } from "../packages/updater/src/index.js";
import { releaseManifestSchema, type ReleaseManifest } from "../packages/schema/src/index.js";

type Json = Record<string, any>;
const root = process.cwd();
const directory = resolve(process.env.MANAGED_PROOF_DIR ?? "work/managed-update-proof");
const runId = `fb-managed-${Date.now()}-${randomBytes(3).toString("hex")}`;
const project = `${runId}-app`;
const restoreProject = `${runId}-restore`;
const registryName = `${runId}-registry`;
const host = process.env.MANAGED_PROOF_DOCKER_HOST ?? "127.0.0.1";
const portBase = Number(process.env.MANAGED_PROOF_PORT_BASE ?? "28340");
const registryPort = portBase;
const apiPort = portBase + 1;
const webPort = portBase + 2;
const proxyPort = portBase + 3;
const updaterPort = portBase + 4;
const feedPort = portBase + 5;
const healthPort = portBase + 6;
const api = `http://${host}:${apiPort}`;
const updater = `http://127.0.0.1:${updaterPort}`;
const stateDir = join(directory, "state");
const composePath = join(directory, "compose.managed.yaml");
const releaseEnv = join(stateDir, "current-release.env");
const keyId = "synthetic-managed-proof";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const token = randomBytes(36).toString("hex");
const password = randomBytes(24).toString("hex");
const secrets = [token, password];
const entries: Json[] = [];
const phaseHistory: Json[] = [];
const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  FORGETBASE_POSTGRES_PASSWORD: password,
  FORGETBASE_UPDATER_API_TOKEN: token,
  FORGETBASE_SYSTEM_UPDATE_OWNER_EMAILS: "owner@example.test",
  FORGETBASE_UPDATER_URL: `http://host.docker.internal:${updaterPort}`,
  FORGETBASE_REQUIRE_AUTHENTICATION: "false",
  FORGETBASE_POSTGRES_PORT: `127.0.0.1:${portBase + 7}`,
  FORGETBASE_API_PORT: `127.0.0.1:${apiPort}`,
  FORGETBASE_WEB_PORT: `127.0.0.1:${webPort}`,
  FORGETBASE_PROXY_PORT: `127.0.0.1:${proxyPort}`,
  FORGETBASE_CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${proxyPort}`,
};
let child: ChildProcess | undefined;
let updaterEnvironment: NodeJS.ProcessEnv = {};
let feed: Json = {};
let verificationHeld = false;
let denyCandidateHealth = false;
let baselineVersion = "0.1.0";
let candidateVersion = "0.1.1";
let ownerKey = "";
let attachmentId = "";
const attachmentContent = Buffer.from("Synthetic managed-update recovery attachment\n");
const artifactId = "playbook.public-demo-no-export";
let success = false;
let dockerAuthorized = false;
let failure: string | undefined;
const registryPrefix = `localhost:${registryPort}/forgetbase/`;
const servers = [
  createServer((_request, response) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(feed)); }),
  createServer(async (request, response) => {
    try {
      const current = await fetch(`${api}${request.url === "/ready" ? "/ready" : "/health"}`, { signal: AbortSignal.timeout(2000) });
      const body = await current.json() as Json;
      if (request.url !== "/ready" && body.version !== baselineVersion) {
        while (verificationHeld) await delay(100);
        if (denyCandidateHealth) { response.writeHead(503).end("synthetic candidate container outage"); return; }
      }
      response.writeHead(current.status, { "content-type": "application/json" }).end(JSON.stringify(body));
    } catch { response.writeHead(503).end("candidate unavailable"); }
  })
];

await mkdir(directory, { recursive: true, mode: 0o700 });
try {
  assert.equal(process.env.MANAGED_PROOF_CONFIRM, "synthetic-docker", "Explicit synthetic Docker workload confirmation is required");
  assert.equal(process.platform, "linux", "Run this proof on the approved Linux Docker runner, not the Mac host");
  dockerAuthorized = true;
  const platform = await dockerCommand("Docker platform", ["info", "--format", "{{.OSType}}/{{.Architecture}}"]);
  assert.match(platform, /linux\/(x86_64|aarch64|amd64|arm64)/);
  await dockerCommand("Docker Compose version", ["compose", "version", "--short"]);
  record("runner", { node: process.version, platform: process.platform, architecture: process.arch, docker: platform.trim(), runId });
  await Promise.all(servers.map((server, index) => new Promise<void>((done) => server.listen(index === 0 ? feedPort : healthPort, "127.0.0.1", done))));
  await writeFile(join(directory, "public-key.pem"), publicPem, { mode: 0o600 });
  await writeFile(join(directory, "gc-stress.cjs"), "setInterval(() => global.gc(), 100).unref();\n", { mode: 0o600 });
  await mkdir(join(directory, "scripts"), { recursive: true });
  for (const filename of ["backup-postgres.sh", "backup-attachments.sh", "backup-set.sh", "verify-backup-set.sh", "restore-postgres.sh", "restore-attachments.sh"]) {
    await copyFile(join(root, "scripts", filename), join(directory, "scripts", filename));
  }
  // The disposable runner has no host bind path. Initialize extensions explicitly
  // below, preserving the shipped managed Compose services and security settings.
  const compose = (await readFile(join(root, "compose.managed.yaml"), "utf8"))
    .replace(/^\s+- \.\/infra\/docker\/postgres-init:.*\n/m, "");
  await writeFile(composePath, compose);
  await mkdir(join(directory, "bin"), { recursive: true });
  const realDocker = (await collectCommand("Docker executable path", "which docker", () => execute((options) => spawn("which", ["docker"], { ...options, shell: false }), baseEnv, 30_000))).trim();
  await writeFile(join(directory, "bin/docker"), `#!/usr/bin/env bash
set -euo pipefail
args=("$@")
"$MANAGED_PROOF_REAL_DOCKER" "\${args[@]}"
up=-1
for i in "\${!args[@]}"; do if [[ "\${args[$i]}" == up ]]; then up=$i; break; fi; done
joined=" $* "
if [[ $up -ge 0 && "$joined" == *" api "* && "$joined" == *" worker "* && "$joined" == *" proxy "* ]]; then
  if [[ -f "$MANAGED_PROOF_CONTROL_DIR/fail-restored-api" ]]; then
    "$MANAGED_PROOF_REAL_DOCKER" "\${args[@]:0:$up}" stop api
  fi
  if [[ -f "$MANAGED_PROOF_CONTROL_DIR/hold-reopen" ]]; then
    touch "$MANAGED_PROOF_CONTROL_DIR/reopen-ready"
    while [[ -f "$MANAGED_PROOF_CONTROL_DIR/hold-reopen" ]]; do sleep 0.1; done
  fi
fi
`, { mode: 0o700 });
  baseEnv.MANAGED_PROOF_REAL_DOCKER = realDocker;
  baseEnv.MANAGED_PROOF_CONTROL_DIR = directory;
  record("compose fixture", { sha256: sha256(compose), change: "remove host-only postgres init bind; initialize identical extensions with psql" });
  await dockerCommand("start disposable private registry", ["run", "-d", "--name", registryName, "--label", `forgetbase.proof=${runId}`, "-p", `127.0.0.1:${registryPort}:5000`, "registry:3"]);
  await waitUrl(`http://${host}:${registryPort}/v2/`, 60_000);
  const sourceRevision = process.env.MANAGED_PROOF_SOURCE_REVISION ?? "0000000000000000000000000000000000000000";
  const buildArguments = ["--build-arg", `FORGETBASE_SOURCE_REVISION=${sourceRevision}`, "--build-arg", `FORGETBASE_SOURCE_DATE_EPOCH=${process.env.MANAGED_PROOF_SOURCE_DATE_EPOCH ?? Math.floor(Date.now() / 1000)}`];
  const images: ReleaseManifest["images"] = [];
  for (const component of ["api", "worker", "migrate", "web", "proxy"] as const) {
    const tag = `${registryPrefix}${component}:synthetic`;
    await dockerCommand(`build ${component}`, ["build", "-f", "infra/docker/release.Dockerfile", "--target", component, ...buildArguments, "--build-arg", `FORGETBASE_RELEASE_VERSION=${baselineVersion}`, "-t", tag, "."], baseEnv, 20 * 60_000);
    await dockerCommand(`push ${component} to private disposable registry`, ["push", tag], baseEnv, 5 * 60_000);
    const refs = JSON.parse(await dockerCommand(`read ${component} immutable digest`, ["image", "inspect", tag, "--format", "{{json .RepoDigests}}"]));
    const reference = refs.find((value: string) => value.startsWith(`${registryPrefix}${component}@`));
    assert.ok(reference, `${component} registry digest missing`);
    images.push({ component, reference, digest: reference.split("@")[1] });
  }
  const migrations = (await readdir(join(root, "packages/db/migrations"))).filter((file) => file.endsWith(".sql")).sort();
  const schemaVersion = migrations.at(-1)!.replace(/\.sql$/, "");
  const baseline = manifest(baselineVersion, images, schemaVersion, [], sourceRevision);
  await initializeManagedInstallation({ envelope: signed(baseline), publicKeys: new Map([[keyId, publicPem]]), allowedRegistryPrefixes: [registryPrefix], stateDir, updaterVersion: "0.1.0", bundleDigest: await computeComposeBundleDigest(directory, [composePath]) });
  await composeCommand("start baseline database", ["up", "--wait", "-d", "postgres"]);
  await sql("CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector;");
  await composeCommand("baseline migration", ["run", "--rm", "migrate"]);
  await composeCommand("start baseline services", ["up", "-d", "api", "worker", "web"]);
  await waitUrl(`${api}/ready`, 300_000);
  await sql("CREATE TABLE managed_e2e_canary (id text PRIMARY KEY, value text NOT NULL); INSERT INTO managed_e2e_canary VALUES ('before', 'original');");
  const bootstrap = await http(api, "/auth/bootstrap", { method: "POST", body: { tenantId: "tenant_demo", email: "owner@example.test", displayName: "Synthetic Update Owner", password, keyName: "managed-proof" } });
  ownerKey = bootstrap.body.secret;
  assert.ok(ownerKey); secrets.push(ownerKey);
  baseEnv.FORGETBASE_REQUIRE_AUTHENTICATION = "true";
  await composeCommand("enable authentication before update proof", ["up", "--no-deps", "-d", "api", "proxy"]);
  await waitUrl(`${api}/ready`, 120_000);
  await waitUrl(`http://${host}:${proxyPort}/`, 120_000);
  await pnpmCommand("import synthetic corpus", ["--filter", "@forgetbase/cli", "start", "--", "corpus", "import", "--api-url", api, "--file", "corpus/demo/assets.json"], { ...baseEnv, FORGETBASE_API_KEY: ownerKey });
  const upload = await fetch(`${api}/assets/${artifactId}/attachments`, { method: "POST", headers: { authorization: `Bearer ${ownerKey}`, "content-type": "application/octet-stream", "x-forgetbase-attachment-filename-encoded": "recovery-proof.txt", "x-forgetbase-attachment-media-type": "text/plain" }, body: attachmentContent });
  assert.ok(upload.ok, `attachment HTTP ${upload.status}: ${await upload.clone().text()}`);
  attachmentId = ((await upload.json()) as Json).id;
  await verifyCanary("baseline", "original");

  const candidateImages: ReleaseManifest["images"] = [];
  const migrationId = "900_managed_e2e";
  const candidateSource = join(directory, "candidate-source");
  for (const path of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json", "vitest.config.ts", ".dockerignore", "apps", "packages", "infra", "scripts"]) {
    await cp(join(root, path), join(candidateSource, path), { recursive: true, filter: (source) => !/(?:^|\/)(?:node_modules|dist|\.git|\.env)(?:\/|$)/.test(source) });
  }
  await writeFile(join(candidateSource, "packages/db/migrations", `${migrationId}.sql`), "UPDATE managed_e2e_canary SET value = 'candidate-migration' WHERE id = 'before';\n");
  for (const component of ["api", "worker", "migrate", "web", "proxy"] as const) {
    const tag = `${registryPrefix}${component}:candidate`;
    await dockerCommand(`build actual candidate ${component} image`, ["build", "-f", join(candidateSource, "infra/docker/release.Dockerfile"), "--target", component, ...buildArguments, "--build-arg", `FORGETBASE_RELEASE_VERSION=${candidateVersion}`, "-t", tag, candidateSource], baseEnv, 20 * 60_000);
    await dockerCommand(`push candidate ${component} digest`, ["push", tag], baseEnv, 5 * 60_000);
    const refs = JSON.parse(await dockerCommand(`candidate ${component} digest`, ["image", "inspect", tag, "--format", "{{json .RepoDigests}}"]));
    const reference = refs.find((value: string) => value.startsWith(`${registryPrefix}${component}@`));
    assert.ok(reference);
    candidateImages.push({ component, reference, digest: reference.split("@")[1] });
  }
  const candidate = manifest(candidateVersion, candidateImages, migrationId, [migrationId], sourceRevision);
  feed = signed(candidate);
  await startUpdater();
  await duplicateUpdaterMustFail();
  await http(api, "/auth/users", { method: "POST", token: ownerKey, body: { email: "other-admin@example.test", displayName: "Not Deployment Owner", role: "admin", password } });
  const login = await fetch(`${api}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "other-admin@example.test", password }) });
  assert.ok(login.ok, `non-owner login HTTP ${login.status}`);
  const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie); secrets.push(cookie);
  const nonOwner = await fetch(`${api}/system/updates`, { headers: { cookie } });
  assert.equal(nonOwner.status, 403);
  const ownerStatus = await http(api, "/system/updates", { token: ownerKey });
  assert.equal(ownerStatus.status, 200);
  assert.ok(!JSON.stringify(ownerStatus.body).includes(token));
  record("application deployment-owner authority", { nonOwnerAdmin: 403, owner: 200, updaterTokenNotExposed: true });
  assert.equal((await http(updater, "/v1/status", { expected: [401] })).status, 401);
  assert.equal((await http(updater, "/v1/check", { method: "POST", token: "wrong", expected: [401] })).status, 401);
  const tampered = structuredClone(feed); tampered.manifest.notes.summary = "tampered"; feed = tampered;
  await http(updater, "/v1/check", { method: "POST", token, expected: [500] });
  assert.equal((await status()).feedStatus, "invalid");
  for (const [name, rejectedFeed] of [
    ["unknown signing key", { ...signed(candidate), keyId: "untrusted-synthetic-key" }],
    ["revoked release", signed({ ...candidate, revoked: true, revocationReason: "synthetic revocation" })],
    ["disallowed registry", signed({ ...candidate, images: candidate.images.map((image) => ({ ...image, reference: image.reference.replace(registryPrefix, "example.invalid/unapproved/") })) })],
    ["mutable image", signed({ ...candidate, images: candidate.images.map((image) => ({ ...image, reference: `${registryPrefix}${image.component}:mutable` })) })]
  ] as [string, Json][]) {
    feed = rejectedFeed;
    await http(updater, "/v1/check", { method: "POST", token, expected: [400, 500] });
    assert.equal((await status()).jobs.length, 0);
    record(name, { rejectedBeforeMutation: true });
  }
  feed = signed(candidate);
  await control("/v1/check");
  const preflight = await control("/v1/preflight", { version: candidateVersion });
  assert.equal(preflight.eligible, true, JSON.stringify(preflight.checks.filter((check: Json) => check.status === "fail")));
  record("authorization/signature/preflight", { missingToken: 401, wrongToken: 401, tamperRejected: true, eligible: true });
  const scheduled = await control("/v1/jobs", { version: candidateVersion, scheduledFor: new Date(Date.now() + 60 * 60_000).toISOString(), automaticRollback: true });
  assert.equal(scheduled.phase, "scheduled");
  assert.equal((await http(api, "/health")).body.version, baselineVersion);
  await http(updater, "/v1/jobs", { method: "POST", token, body: { version: candidateVersion }, expected: [409] });
  const cancelled = await control(`/v1/jobs/${scheduled.id}/cancel`);
  assert.equal(cancelled.phase, "cancelled");
  record("scheduled operator approval", { scheduledWithoutApplying: true, concurrentMutationRejected: true, cancellationRecorded: true });

  // Hold only the real health dependency, leaving the actual updater, executor,
  // Docker, API, worker and Postgres active and observable.
  verificationHeld = true;
  const failedJob = await control("/v1/jobs", { version: candidateVersion, automaticRollback: true });
  await waitPhase(failedJob.id, "verifying");
  await verifyFences();
  await composeCommand("inject actual candidate Docker outage", ["stop", "api"]);
  denyCandidateHealth = true; verificationHeld = false;
  const rolledBack = await waitTerminal(failedJob.id);
  assert.equal(rolledBack.phase, "rolled-back", rolledBack.message);
  denyCandidateHealth = false;
  await waitUrl(`${api}/ready`, 120_000);
  await verifyCanary("automatic rollback after Docker outage", "original");
  record("Docker failure rollback", { job: rolledBack, identity: await (await fetch(`${api}/health`)).json() });

  verificationHeld = true;
  const interrupted = await control("/v1/jobs", { version: candidateVersion, automaticRollback: true });
  await waitPhase(interrupted.id, "verifying");
  await verifyFences();
  await killUpdater();
  verificationHeld = false;
  await startUpdater();
  const recovered = await waitTerminal(interrupted.id);
  assert.equal(recovered.phase, "needs-attention", recovered.message);
  await verifyFences();
  assert.match(await sql("SELECT value FROM managed_e2e_canary WHERE id='before';"), /candidate-migration/);
  await killUpdater(); await startUpdater();
  assert.equal((await status()).activeJob, null);
  assert.equal((await status()).jobs.find((job: Json) => job.id === interrupted.id).phase, "needs-attention");
  record("updater SIGKILL restart", { recovered, secondRestartHasNoActiveJob: true, candidateDatabasePreserved: true, noAutomaticReplay: true });
  const interruptedPoint = (await status()).recoveryPoints.find((point: Json) => point.id === recovered.recoveryPointId);
  assert.ok(interruptedPoint?.verified);
  const explicitRecovery = await control("/v1/rollback", { recoveryPointId: interruptedPoint.id, confirmDataLossAfter: interruptedPoint.createdAt });
  assert.equal((await waitTerminal(explicitRecovery.id)).phase, "rolled-back");
  await verifyCanary("explicit restart recovery", "original");

  const cleanJob = await control("/v1/jobs", { version: candidateVersion, automaticRollback: true });
  const completed = await waitTerminal(cleanJob.id);
  assert.equal(completed.phase, "completed", completed.message);
  assert.equal(completed.writesReopened, true);
  await waitUrl(`${api}/ready`, 120_000);
  assert.equal(((await http(api, "/health")).body).version, candidateVersion);
  await verifyCanary("successful exact-version update", "candidate-migration");
  const created = await http(api, "/auth/users", { method: "POST", token: ownerKey, body: { email: "post-update@example.test", displayName: "Accepted After Update", role: "reader", password } });
  assert.ok(created.status < 300);
  await sql("INSERT INTO managed_e2e_canary VALUES ('after', 'accepted-after-reopen');");
  await killUpdater(); await startUpdater();
  assert.match(await sql("SELECT value FROM managed_e2e_canary WHERE id='after';"), /accepted-after-reopen/);
  assert.match(await sql("SELECT email FROM users WHERE email='post-update@example.test';"), /post-update@example.test/);
  record("post-reopen writes survive updater restart", { exactVersion: candidateVersion, apiWriteAccepted: true, canaryPreserved: true });

  const recovery = (await status()).recoveryPoints.find((point: Json) => point.id === completed.recoveryPointId);
  assert.ok(recovery?.verified);
  const exportIndex = process.argv.indexOf("--export-recovery");
  if (exportIndex >= 0) {
    const exportPath = process.argv[exportIndex + 1];
    assert.ok(exportPath && !exportPath.startsWith("--"), "--export-recovery requires a private output directory");
    await cp(join(recovery.configurationPath, "..", "backup-set"), resolve(exportPath), { recursive: true, errorOnExist: true, force: false });
    record("synthetic recovery exported", { output: resolve(exportPath), manifestSha256: sha256(await readFile(join(exportPath, "manifest.json"))) });
  }
  await restoreSeparateStack(recovery);
  await http(updater, "/v1/rollback", { method: "POST", token, body: { recoveryPointId: recovery.id }, expected: [409] });
  await copyFile(recovery.backupPath, join(dirname(recovery.backupPath), "wrong.dump"));
  const corruptLedger = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
  corruptLedger.recoveryPoints.find((point: Json) => point.id === recovery.id).backupPath = join(dirname(recovery.backupPath), "wrong.dump");
  await writeFile(join(stateDir, "state.json"), JSON.stringify(corruptLedger));
  const refused = await control("/v1/rollback", { recoveryPointId: recovery.id, confirmDataLossAfter: recovery.createdAt });
  const refusedResult = await waitTerminal(refused.id);
  assert.equal(refusedResult.phase, "needs-attention");
  assert.match(refusedResult.message, /canonical verified path/);
  assert.match(await sql("SELECT value FROM managed_e2e_canary WHERE id='after';"), /accepted-after-reopen/);
  const repairedLedger = JSON.parse(await readFile(join(stateDir, "state.json"), "utf8"));
  repairedLedger.recoveryPoints.find((point: Json) => point.id === recovery.id).backupPath = recovery.backupPath;
  await writeFile(join(stateDir, "state.json"), JSON.stringify(repairedLedger));
  record("recovery ledger path substitution rejected", { needsAttention: true, acceptedWritePreserved: true });
  await writeFile(join(directory, "fail-restored-api"), "synthetic Docker readiness failure");
  const badRestart = await control("/v1/rollback", { recoveryPointId: recovery.id, confirmDataLossAfter: recovery.createdAt });
  const badRestartResult = await waitTerminal(badRestart.id);
  assert.equal(badRestartResult.phase, "needs-attention", badRestartResult.message);
  await rm(join(directory, "fail-restored-api"));
  record("restored API start failure", { result: badRestartResult, successfulRollbackNotClaimed: true });
  const rollback = await control("/v1/rollback", { recoveryPointId: recovery.id, confirmDataLossAfter: recovery.createdAt });
  const manualResult = await waitTerminal(rollback.id);
  assert.equal(manualResult.phase, "rolled-back", manualResult.message);
  await waitUrl(`${api}/ready`, 120_000);
  await verifyCanary("explicit manual rollback", "original");
  assert.doesNotMatch(await sql("SELECT value FROM managed_e2e_canary WHERE id='after';"), /accepted-after-reopen/);
  record("manual rollback", { dataLossConfirmationRequired: true, result: manualResult, priorDatabaseAndAttachmentRestored: true });
  await writeFile(join(directory, "hold-reopen"), "pause real Docker result after reopening writers");
  const boundaryJob = await control("/v1/jobs", { version: candidateVersion, automaticRollback: true });
  await until(async () => { try { await readFile(join(directory, "reopen-ready")); return true; } catch { return false; } }, 10 * 60_000);
  await waitUrl(`${api}/ready`, 120_000);
  assert.equal((await status()).jobs.find((job: Json) => job.id === boundaryJob.id).writesReopened, true);
  await http(api, "/auth/users", { method: "POST", token: ownerKey, body: { email: "boundary-write@example.test", displayName: "Accepted During Reopen", role: "reader", password } });
  await sql("INSERT INTO managed_e2e_canary VALUES ('boundary', 'accepted-during-reopen');");
  await killUpdater();
  const heldLock = await executeNode([join(root, "apps/updater/dist/index.js")], { ...updaterEnvironment, PORT: String(portBase + 8) }, 10_000);
  assert.equal(heldLock.ok, false); assert.match(heldLock.output, /lock|already|running/i);
  await rm(join(directory, "hold-reopen"));
  await delay(1000);
  await startUpdater();
  const boundaryRecovered = await waitTerminal(boundaryJob.id);
  assert.equal(boundaryRecovered.phase, "needs-attention");
  assert.match(await sql("SELECT value FROM managed_e2e_canary WHERE id='boundary';"), /accepted-during-reopen/);
  assert.match(await sql("SELECT email FROM users WHERE email='boundary-write@example.test';"), /boundary-write@example.test/);
  record("SIGKILL after durable write boundary", { result: boundaryRecovered, apiAcceptedWritePreserved: true, databaseCanaryPreserved: true, orphanCommandRetainedLock: true, noAutomaticRestore: true });
  const boundaryPoint = (await status()).recoveryPoints.find((point: Json) => point.id === boundaryRecovered.recoveryPointId);
  const boundaryRollback = await control("/v1/rollback", { recoveryPointId: boundaryPoint.id, confirmDataLossAfter: boundaryPoint.createdAt });
  assert.equal((await waitTerminal(boundaryRollback.id)).phase, "rolled-back");
  await verifyCanary("explicit recovery after reopened-write crash", "original");
  for (const service of ["api", "worker"]) await composeCommand(`${service} Node version`, ["run", "--rm", "--no-deps", service, "node", "--version"]);
  await composeCommand("web Nginx version", ["run", "--rm", "--no-deps", "web", "nginx", "-v"]);
  record("image digest inventory", { images, candidateImages });
  success = true;
  if (process.argv.includes("--keep-stack")) {
    record("browser handoff ready", { updaterPid: child?.pid, harnessPid: process.pid, api, proxy: `http://${host}:${proxyPort}/`, project, registryName, cleanup: "Send SIGTERM to harness PID after browser verification" });
    await writeFile(join(directory, "summary.json"), `${JSON.stringify({ ok: true, runId, keptForBrowser: true, harnessPid: process.pid, entries, phaseHistory }, null, 2)}\n`, { mode: 0o600 });
    await new Promise<void>((done) => { process.once("SIGTERM", () => done()); process.once("SIGINT", () => done()); });
  }
} catch (error) {
  failure = clean(error instanceof Error ? `${error.stack}` : String(error));
  console.error(failure);
} finally {
  await rm(join(directory, "hold-reopen"), { force: true });
  verificationHeld = false;
  await killUpdater();
  for (const server of servers) server.closeAllConnections();
  await Promise.all(servers.map((server) => new Promise<void>((done) => server.close(() => done()))));
  if (dockerAuthorized) for (const name of [project, restoreProject]) await dockerCommand(`cleanup ${name}`, ["compose", "--project-name", name, "--env-file", releaseEnv, "-f", composePath, "down", "--volumes", "--remove-orphans"], baseEnv, 120_000, false);
  if (dockerAuthorized) await dockerCommand("cleanup disposable registry", ["rm", "-f", "-v", registryName], baseEnv, 120_000, false);
  await rm(join(directory, "public-key.pem"), { force: true });
  await writeFile(join(directory, "summary.json"), `${JSON.stringify({ ok: success, runId, sourceRevision: process.env.MANAGED_PROOF_SOURCE_REVISION, platform: `${process.platform}/${process.arch}`, supportedPlatformClaim: "Executed platform only; no ARM64 or physically off-host claim", failure, entries, phaseHistory }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ok: success, runId, summary: join(directory, "summary.json"), failure }));
  if (!success) process.exitCode = 1;
}

function manifest(version: string, images: ReleaseManifest["images"], targetSchemaVersion: string, migrationIds: string[], sourceRevision: string): ReleaseManifest {
  return releaseManifestSchema.parse({ schemaVersion: "1", product: "forgetbase", version, channel: "beta", publishedAt: new Date().toISOString(), sourceRevision, minUpdaterVersion: "0.1.0", upgradeFrom: [baselineVersion], risk: "high", estimatedDowntimeSeconds: 120, requiresBackup: true, rollbackMode: "database-restore", migration: { compatibility: migrationIds.length ? "destructive" : "application-only", targetSchemaVersion, migrationIds }, recovery: { components: ["database", "configuration", "attachments"], attachmentMode: "included" }, images, notes: { summary: "Synthetic signed managed-update E2E release" } });
}
function signed(manifest: ReleaseManifest): Json { return { keyId, signature: sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString("base64"), manifest }; }
function sha256(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function clean(value: string): string { for (const secret of secrets) value = value.replaceAll(secret, "[REDACTED]"); return value; }
function record(name: string, data: Json): void { entries.push({ at: new Date().toISOString(), name, ...data }); console.log(JSON.stringify({ step: name, ok: true })); }
function parseEnv(source: string): Record<string, string> { return Object.fromEntries(source.split("\n").filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])); }
function delay(ms: number): Promise<void> { return new Promise((done) => setTimeout(done, ms)); }
type CommandResult = { ok: boolean; code: number | null; output: string; durationMs: number };
async function dockerCommand(name: string, args: string[], environment = baseEnv, timeoutMs = 120_000, required = true): Promise<string> {
  return collectCommand(name, ["docker", ...args].join(" "), () => executeDocker(args, environment, timeoutMs), required);
}
async function pnpmCommand(name: string, args: string[], environment = baseEnv, timeoutMs = 120_000): Promise<string> {
  return collectCommand(name, ["pnpm", ...args].join(" "), () => execute((options) => spawn("pnpm", args, { ...options, shell: false }), environment, timeoutMs));
}
async function scriptCommand(name: string, script: "restore-postgres.sh" | "restore-attachments.sh" | "verify-backup-set.sh", args: string[], environment: NodeJS.ProcessEnv): Promise<string> {
  const scriptPath = join(root, "scripts", script);
  return collectCommand(name, ["bash", scriptPath, ...args].join(" "), () => execute((options) => spawn("bash", ["--", scriptPath, ...args], { ...options, shell: false }), environment, 120_000));
}
function executeDocker(args: string[], environment: NodeJS.ProcessEnv, timeoutMs: number): Promise<CommandResult> {
  return execute((options) => spawn("docker", args, { ...options, shell: false }), environment, timeoutMs);
}
function executeNode(args: string[], environment: NodeJS.ProcessEnv, timeoutMs: number): Promise<CommandResult> {
  return execute((options) => spawn(process.execPath, args, { ...options, shell: false }), environment, timeoutMs);
}
async function collectCommand(name: string, description: string, run: () => Promise<CommandResult>, required = true): Promise<string> {
  console.log(JSON.stringify({ step: name, phase: "running" }));
  const result = await run();
  entries.push({ name, ok: result.ok, status: result.code, durationMs: result.durationMs, command: clean(description), output: clean(result.output).slice(-12_000) });
  if (required && !result.ok) throw new Error(`${name}: ${clean(result.output).slice(-12_000)}`);
  return result.output;
}
async function execute(launch: (options: SpawnOptions) => ChildProcess, environment: NodeJS.ProcessEnv, timeoutMs: number): Promise<CommandResult> {
  const start = Date.now();
  return new Promise((done) => {
    const runningCommand = launch({ cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let output = "";
    for (const stream of [runningCommand.stdout, runningCommand.stderr]) stream?.on("data", (chunk) => { output = (output + chunk.toString()).slice(-64_000); });
    const timeout = setTimeout(() => runningCommand.kill("SIGKILL"), timeoutMs);
    runningCommand.once("error", (error) => { clearTimeout(timeout); done({ ok: false, code: null, output: error.message, durationMs: Date.now() - start }); });
    runningCommand.once("close", (code) => { clearTimeout(timeout); done({ ok: code === 0, code, output, durationMs: Date.now() - start }); });
  });
}
async function composeCommand(name: string, args: string[], required?: true): Promise<string>;
async function composeCommand(name: string, args: string[], required: false): Promise<{ ok: boolean; output: string }>;
async function composeCommand(name: string, args: string[], required = true): Promise<any> {
  const commandArgs = ["compose", "--project-name", project, "--env-file", releaseEnv, "-f", composePath, ...args];
  if (!required) { const result = await executeDocker(commandArgs, baseEnv, 120_000); return { ok: result.ok, output: result.output }; }
  return dockerCommand(name, commandArgs, baseEnv, 10 * 60_000);
}
async function sql(statement: string, targetProject = project): Promise<string> {
  return dockerCommand("synthetic database assertion", ["compose", "--project-name", targetProject, "--env-file", releaseEnv, "-f", composePath, "exec", "-T", "postgres", "psql", "-U", "forgetbase", "-d", "forgetbase", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", statement]);
}
async function until(check: () => Promise<boolean>, timeoutMs: number): Promise<void> { const started = Date.now(); while (Date.now() - started < timeoutMs) { if (await check()) return; await delay(1000); } throw new Error(`Condition timed out after ${timeoutMs}ms`); }
async function waitUrl(url: string, timeoutMs: number): Promise<void> { await until(async () => { try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } }, timeoutMs); }
async function http(base: string, path: string, input: { method?: string; body?: Json; token?: string; expected?: number[] } = {}): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${base}${path}`, { method: input.method, headers: { ...(input.token ? { authorization: `Bearer ${input.token}` } : {}), ...(input.body ? { "content-type": "application/json" } : {}) }, body: input.body ? JSON.stringify(input.body) : undefined, signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  assert.ok(input.expected ? input.expected.includes(response.status) : response.ok, `${input.method ?? "GET"} ${path}: HTTP ${response.status}: ${clean(text)}`);
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
async function control(path: string, body: Json = {}): Promise<Json> { return (await http(updater, path, { method: "POST", body, token })).body; }
async function status(): Promise<Json> { return (await http(updater, "/v1/status", { token })).body; }
async function startUpdater(): Promise<void> {
  updaterEnvironment = { ...baseEnv, PATH: `${join(directory, "bin")}:${process.env.PATH}`, PORT: String(updaterPort), HOST: "0.0.0.0", FORGETBASE_INSTALLATION_MODE: "managed", FORGETBASE_UPDATES_ENABLED: "true", FORGETBASE_UPDATE_BUNDLE_DIR: directory, FORGETBASE_UPDATE_COMPOSE_FILES: "compose.managed.yaml", FORGETBASE_UPDATER_STATE_DIR: stateDir, FORGETBASE_UPDATE_COMPOSE_PROJECT_NAME: project, FORGETBASE_UPDATE_PUBLIC_KEY_ID: keyId, FORGETBASE_UPDATE_PUBLIC_KEY_FILE: join(directory, "public-key.pem"), FORGETBASE_UPDATE_FEED_URL: `http://127.0.0.1:${feedPort}/manifest`, FORGETBASE_UPDATE_ALLOW_LOCAL_HTTP: "true", FORGETBASE_UPDATE_ALLOWED_REGISTRIES: registryPrefix, FORGETBASE_UPDATE_API_HEALTH_URL: `http://127.0.0.1:${healthPort}/health`, FORGETBASE_UPDATE_WEB_HEALTH_URL: `http://${host}:${webPort}/`, FORGETBASE_UPDATE_MINIMUM_FREE_BYTES: "1" };
  child = spawn(process.execPath, ["--expose-gc", "--require", join(directory, "gc-stress.cjs"), join(root, "apps/updater/dist/index.js")], { cwd: directory, env: updaterEnvironment, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout?.on("data", (chunk) => { log = (log + clean(chunk.toString())).slice(-24_000); });
  child.stderr?.on("data", (chunk) => { log = (log + clean(chunk.toString())).slice(-24_000); });
  child.once("exit", (code, signal) => { entries.push({ name: "updater process exit", code, signal, output: log }); });
  await waitUrl(`${updater}/health`, 120_000);
}
async function duplicateUpdaterMustFail(): Promise<void> {
  const duplicate = await executeNode([join(root, "apps/updater/dist/index.js")], { ...updaterEnvironment, PORT: String(portBase + 8) }, 10_000);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.output, /lock|already|running/i);
  assert.equal((await status()).activeJob, null);
  const mismatch = await executeNode([join(root, "apps/updater/dist/index.js")], { ...updaterEnvironment, PORT: String(portBase + 8), FORGETBASE_INSTALLATION_MODE: "source" }, 10_000);
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.output, /mode|managed|lock|already/i);
  record("duplicate updater process rejected", { rejected: true, existingServiceHealthy: true, changedModeRejected: true });
}
async function killUpdater(): Promise<void> { if (!child || child.exitCode !== null || child.signalCode !== null) return; const current = child; current.kill("SIGKILL"); await new Promise<void>((done) => current.once("exit", () => done())); child = undefined; }
async function waitPhase(id: string, phase: string): Promise<Json> { let job: Json = {}; await until(async () => { job = (await status()).jobs.find((entry: Json) => entry.id === id); if (job) rememberPhase(job); if (["failed", "needs-attention", "rolled-back", "completed"].includes(job?.phase) && job.phase !== phase) throw new Error(`Job reached ${job.phase} instead of ${phase}: ${job.message}`); return job?.phase === phase; }, 10 * 60_000); return job; }
async function waitTerminal(id: string): Promise<Json> { let job: Json = {}; await until(async () => { job = (await status()).jobs.find((entry: Json) => entry.id === id); if (job) rememberPhase(job); return ["failed", "needs-attention", "rolled-back", "completed", "cancelled"].includes(job?.phase); }, 10 * 60_000); return job; }
function rememberPhase(job: Json): void { if (!phaseHistory.some((entry) => entry.id === job.id && entry.phase === job.phase)) phaseHistory.push({ id: job.id, phase: job.phase, writesReopened: job.writesReopened, at: new Date().toISOString() }); }
async function verifyFences(): Promise<void> {
  await waitUrl(`${api}/health`, 120_000);
  const beforeSideEffects = await sql("SELECT (SELECT count(*) FROM audit_events), (SELECT count(*) FROM retrieval_events), (SELECT max(last_used_at) FROM api_keys);");
  for (const path of ["/auth/bootstrap", "/auth/login", "/assets", "/query", "/system/updates"]) {
    const method = ["/auth/bootstrap", "/auth/login", "/query"].includes(path) ? "POST" : "GET";
    assert.equal((await http(api, path, { method, token: ownerKey, ...(method === "POST" ? { body: {} } : {}), expected: [503] })).status, 503);
  }
  const afterSideEffects = await sql("SELECT (SELECT count(*) FROM audit_events), (SELECT count(*) FROM retrieval_events), (SELECT max(last_used_at) FROM api_keys);");
  assert.equal(afterSideEffects, beforeSideEffects, "Fenced requests must not mutate auth or telemetry");
  const running = await composeCommand("fenced service inventory", ["ps", "--status", "running", "--services"]);
  assert.doesNotMatch(running, /^(worker|proxy)$/m);
  const worker = await executeDocker(["compose", "--project-name", project, "--env-file", join(stateDir, "candidate-release.env"), "-f", composePath, "run", "--rm", "--no-deps", "-e", "FORGETBASE_MANAGED_WRITES_ENABLED=false", "-e", "FORGETBASE_INSTALLATION_MODE=managed", "worker"], baseEnv, 30_000);
  assert.equal(worker.ok, false); assert.match(worker.output, /fenc|writ|maintenance/i);
  record("candidate write fencing", { directApi: ["/auth/bootstrap", "/auth/login", "/assets", "/query", "/system/updates"], status: 503, workerRefused: true, proxyStopped: true });
}
async function verifyCanary(name: string, expected: string): Promise<void> {
  assert.match(await sql("SELECT value FROM managed_e2e_canary WHERE id='before';"), new RegExp(expected));
  const response = await fetch(`${api}/assets/${artifactId}/attachments/${attachmentId}/download`, { headers: { authorization: `Bearer ${ownerKey}` } });
  assert.ok(response.ok, `attachment recovery HTTP ${response.status}`);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), sha256(attachmentContent));
  record(name, { databaseValue: expected, attachmentSha256: sha256(attachmentContent) });
}
async function restoreSeparateStack(point: Json): Promise<void> {
  const restoreFile = join(directory, "compose.restore.json");
  const configuration = JSON.parse(await composeCommand("resolve independent restore configuration", ["config", "--format", "json"]));
  for (const service of Object.values(configuration.services) as Json[]) { delete service.ports; delete service.depends_on; }
  configuration.name = restoreProject;
  for (const [key, volume] of Object.entries(configuration.volumes) as [string, Json][]) volume.name = `${restoreProject}_${key}`;
  for (const [key, network] of Object.entries(configuration.networks) as [string, Json][]) network.name = `${restoreProject}_${key}`;
  await writeFile(restoreFile, JSON.stringify(configuration), { mode: 0o600 });
  const restoreEnv = { ...baseEnv, COMPOSE_PROJECT_NAME: restoreProject, COMPOSE_FILE: restoreFile, FORGETBASE_RESTORE_CONFIRM: "forgetbase", FORGETBASE_ATTACHMENT_RESTORE_CONFIRM: "attachments" };
  await dockerCommand("start independent restore database", ["compose", "-p", restoreProject, "-f", restoreFile, "up", "--wait", "-d", "postgres"], restoreEnv);
  await until(async () => (await executeDocker(["compose", "-p", restoreProject, "-f", restoreFile, "exec", "-T", "postgres", "pg_isready", "-U", "forgetbase"], restoreEnv, 10_000)).ok, 120_000);
  await scriptCommand("restore backup into new database volume", "restore-postgres.sh", [point.backupPath, "forgetbase"], restoreEnv);
  await scriptCommand("restore backup into new attachment volume", "restore-attachments.sh", [point.attachmentSnapshotId], restoreEnv);
  const rows = await dockerCommand("independent restored database canary", ["compose", "-p", restoreProject, "-f", restoreFile, "exec", "-T", "postgres", "psql", "-U", "forgetbase", "-d", "forgetbase", "-t", "-A", "-c", "SELECT value FROM managed_e2e_canary WHERE id='before';"], restoreEnv);
  assert.match(rows, /original/);
  const storageKey = (await dockerCommand("independent restored attachment storage key", ["compose", "-p", restoreProject, "-f", restoreFile, "exec", "-T", "postgres", "psql", "-U", "forgetbase", "-d", "forgetbase", "-t", "-A", "-c", `SELECT storage_key FROM attachments WHERE id='${attachmentId}';`], restoreEnv)).trim();
  assert.match(storageKey, /^[0-9a-f]{2}\/[0-9a-f-]{36}$/);
  const restoredHash = await dockerCommand("hash actual bytes in independent attachment volume", ["compose", "-p", restoreProject, "-f", restoreFile, "run", "--rm", "--no-deps", "-T", "api", "sha256sum", `/var/lib/forgetbase/attachments/${storageKey}`], restoreEnv);
  assert.equal(restoredHash.trim().split(/\s+/)[0], sha256(attachmentContent));
  await scriptCommand("independent coordinated backup verification", "verify-backup-set.sh", [join(point.configurationPath, "..", "backup-set")], restoreEnv);
  await dockerCommand("cleanup independent restore stack", ["compose", "-p", restoreProject, "-f", restoreFile, "down", "--volumes", "--remove-orphans"], restoreEnv);
  await rm(restoreFile, { force: true });
  record("independent-stack restore", { distinctProject: restoreProject, originalUntouched: true, databaseCanary: "original", attachmentSetVerified: true, restoredVolumeBytesSha256: sha256(attachmentContent), physicalHost: "same Docker host" });
}
