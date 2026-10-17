import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { buildServer } from "../apps/api/src/server.js";

// Failure cases, specified before implementation: a cold upload exceeds NGINX's
// old 60s timeout; readiness keeps clamd awake; a stalled scan outlives its
// budget or persists bytes; malware is accepted; the proxy depends on web;
// a real worker cannot start against API migrations or drain on SIGTERM.
// Uses real HTTP, PostgreSQL, filesystem storage, NGINX and ClamD TCP framing.
// The controlled scanner simulates cold/clean/infected/unresponsive states;
// it does not prove ClamAV signatures, Railway sleep, or billing savings.
const execFile = promisify(execFileCallback);
const output = resolve(process.argv[2] ?? "work/railway-resource-proof");
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "forgetbase-resource-proof-"));
const suffix = randomUUID().slice(0, 8);
const network = `forgetbase-resource-${suffix}`;
const containers = [`forgetbase-resource-db-${suffix}`, `forgetbase-resource-proxy-${suffix}`];
const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), scanner: "controlled TCP fixture", checks: {} };
const checks = evidence.checks as Record<string, unknown>;
const docker = async (...args: string[]) => (await execFile("docker", args, { maxBuffer: 1024 * 1024 })).stdout.trim();
async function port(name: string, containerPort: string): Promise<number> {
  return Number((await docker("port", name, containerPort)).split(":").at(-1));
}
async function waitFor(check: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await sleep(200);
  }
  throw new Error("Fixture readiness timed out");
}
let mode: "cold" | "clean" | "infected" | "unresponsive" = "clean";
let wakeAt = 0;
let connections = 0;
const sockets = new Set<Socket>();
const scanner = createServer((socket) => {
  connections += 1;
  sockets.add(socket);
  socket.on("error", () => {});
  socket.once("close", () => sockets.delete(socket));
  let bytes = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    bytes = Buffer.concat([bytes, chunk]);
    if (mode === "unresponsive") return;
    if (mode === "cold" && Date.now() < wakeAt) return socket.destroy();
    if (bytes.includes("zPING\0")) return void socket.end("PONG\0");
    if (!bytes.subarray(0, 10).equals(Buffer.from("zINSTREAM\0"))) return;
    let offset = 10;
    while (bytes.length >= offset + 4) {
      const length = bytes.readUInt32BE(offset);
      if (length === 0) {
        socket.end(mode === "infected" ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
        return;
      }
      if (bytes.length < offset + 4 + length) return;
      offset += 4 + length;
    }
  });
});
let api: ReturnType<typeof buildServer> | undefined;
let worker: ReturnType<typeof spawn> | undefined;
try {
  evidence.sourceRevision = (await execFile("git", ["rev-parse", "HEAD"])).stdout.trim();
  evidence.dirty = (await execFile("git", ["status", "--porcelain"])).stdout.trim().length > 0;
  await docker("network", "create", network);
  await docker("run", "-d", "--network", network, "--name", containers[0]!, "--tmpfs", "/var/lib/postgresql/data",
    "-e", "POSTGRES_DB=forgetbase", "-e", "POSTGRES_USER=forgetbase", "-e", "POSTGRES_PASSWORD=synthetic-proof",
    "-p", "127.0.0.1::5432", "pgvector/pgvector:pg17@sha256:d2ef61f42ef767baa5a1475393303cc235bcd92febd9d7014eddb48b41f3bad0");
  const databaseUrl = `postgres://forgetbase:synthetic-proof@127.0.0.1:${await port(containers[0]!, "5432/tcp")}/forgetbase`;
  await waitFor(async () => { await docker("exec", containers[0]!, "pg_isready", "-h", "127.0.0.1", "-U", "forgetbase"); return true; });
  await new Promise<void>((resolveListen) => scanner.listen(0, "127.0.0.1", resolveListen));
  const address = scanner.address();
  assert(address && typeof address !== "string");
  process.env.FORGETBASE_ATTACHMENT_CLAMD_HOST = "127.0.0.1";
  process.env.FORGETBASE_ATTACHMENT_CLAMD_PORT = String(address.port);
  process.env.FORGETBASE_ATTACHMENT_SCANNER_ON_DEMAND = "true";
  process.env.FORGETBASE_ATTACHMENT_SCAN_TIMEOUT_MS = "500";
  delete process.env.FORGETBASE_ATTACHMENT_SCAN_WAKE_TIMEOUT_MS;
  const startApi = async (apiPort = 0) => {
    api = buildServer({ databaseUrl, autoMigrate: true, logger: false, attachmentScanRequired: true,
      attachmentStorageRoot: join(temporary, "attachments") });
    await api.listen({ host: "0.0.0.0", port: apiPort });
    const listening = api.server.address();
    assert(listening && typeof listening !== "string");
    return listening.port;
  };
  const apiPort = await startApi();
  const bootstrap = await fetch(`http://127.0.0.1:${apiPort}/auth/bootstrap`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "resource-proof@example.test", displayName: "Synthetic resource proof" })
  });
  assert.equal(bootstrap.status, 201);
  const admin = await bootstrap.json() as { secret: string; user: { id: string } };
  const authorization = { authorization: `Bearer ${admin.secret}` };
  const template = await readFile(process.argv[3] ?? "infra/docker/nginx.railway-proxy.conf.template", "utf8");
  // Only adapt Railway private DNS/ports for the local Docker host. Preserve
  // proxy timeouts, routes and static serving from the actual template.
  const config = template.replace("${PORT}", "8080")
    .replace("resolver [fd12::10] valid=10s ipv6=off;", "resolver 127.0.0.11 valid=10s ipv6=off;")
    .replace("api.railway.internal:${FORGETBASE_API_UPSTREAM_PORT}", `host.docker.internal:${apiPort}`);
  await writeFile(join(temporary, "nginx.conf"), config);
  const nginxImage = (await readFile("infra/docker/railway-proxy.Dockerfile", "utf8")).match(/^FROM (nginx:\S+)/m)?.[1];
  assert(nginxImage);
  await docker("run", "-d", "--network", network, "--name", containers[1]!,
    ...(process.platform === "darwin" ? [] : ["--add-host", "host.docker.internal:host-gateway"]),
    "-p", "127.0.0.1::8080", "-v", `${join(temporary, "nginx.conf")}:/etc/nginx/conf.d/default.conf:ro`,
    "-v", `${resolve("apps/web/dist")}:/usr/share/nginx/html:ro`, nginxImage);
  const origin = `http://127.0.0.1:${await port(containers[1]!, "8080/tcp")}`;
  await waitFor(async () => (await fetch(`${origin}/api/ready`)).status === 200);
  assert.equal(connections, 0, "readiness must not contact a sleeping scanner");
  checks.readinessWithoutScannerTraffic = true;
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<html/);
  checks.staticUiWithoutWebService = true;
  const asset = await fetch(`${origin}/api/assets`, { method: "POST", headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ stableId: "page.resource-proof", type: "human-document", ownerId: admin.user.id,
      title: "Resource proof", lifecycleState: "active", sensitivity: "internal", audience: ["readers"], status: "approved",
      reviewDueAt: "2027-01-31", allowedSurfaces: ["api", "web"], humanDocument: { format: "markdown", body: "Synthetic resource proof" } }) });
  assert.equal(asset.status, 201, await asset.text());
  const content = "%PDF-1.7\nsynthetic upload content";
  const upload = () => fetch(`${origin}/api/assets/page.resource-proof/attachments`, { method: "POST",
    headers: { ...authorization, "content-type": "application/octet-stream", "x-forgetbase-attachment-filename-encoded": "proof.pdf",
      "x-forgetbase-attachment-media-type": "application/pdf" }, body: content });
  mode = "cold";
  wakeAt = Date.now() + 62_000;
  let started = performance.now();
  const cold = await upload();
  checks.coldUpload = { status: cold.status, durationMs: Math.round(performance.now() - started) };
  assert.equal(cold.status, 201, "cold scan must survive the old 60-second proxy boundary");
  const attachment = await cold.json() as { id: string };
  const download = await fetch(`${origin}/api/assets/page.resource-proof/attachments/${attachment.id}/download`, { headers: authorization });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), content);
  mode = "clean";
  const warm = await upload();
  assert.equal(warm.status, 201);
  checks.warmUpload = warm.status;
  mode = "infected";
  const infected = await upload();
  assert.equal(infected.status, 422);
  assert.deepEqual(await infected.json(), { error: "attachment_malware_detected" });
  checks.infectedUpload = infected.status;
  await api!.close();
  process.env.FORGETBASE_ATTACHMENT_SCAN_WAKE_TIMEOUT_MS = "200";
  await startApi(apiPort);
  mode = "unresponsive";
  started = performance.now();
  const unavailable = await upload();
  const elapsed = performance.now() - started;
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "attachment_scanner_unavailable" });
  assert(elapsed < 1_000, `expired scan took ${elapsed}ms`);
  await sleep(50);
  assert.equal(sockets.size, 0);
  const listed = await fetch(`${origin}/api/assets/page.resource-proof/attachments`, { headers: authorization });
  assert.equal((await listed.json() as { attachments: unknown[] }).attachments.length, 2);
  const storedFiles = (await readdir(join(temporary, "attachments"), { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).length;
  assert.equal(storedFiles, 2, "failed scans must not store file bytes");
  checks.unavailableUpload = { status: unavailable.status, durationMs: Math.round(elapsed), sockets: sockets.size, storedAttachments: 2, storedFiles };
  let workerLog = "";
  worker = spawn(process.execPath, ["apps/worker/dist/index.js"], { env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl, FORGETBASE_AUTO_MIGRATE: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  worker.stdout!.on("data", (chunk) => { workerLog += String(chunk); });
  worker.stderr!.on("data", (chunk) => { workerLog += String(chunk); });
  const exited = new Promise<number | null>((resolveExit) => worker!.once("exit", resolveExit));
  await waitFor(async () => workerLog.includes("asset-change-reconciliation"));
  started = performance.now();
  worker.kill("SIGTERM");
  const shutdownDeadline = new AbortController();
  let exitCode: number | null;
  try {
    exitCode = await Promise.race([exited, sleep(30_000, undefined, { signal: shutdownDeadline.signal }).then(() => { throw new Error("Worker did not drain"); })]);
  } finally {
    shutdownDeadline.abort();
  }
  assert.equal(exitCode, 0);
  checks.workerShutdown = { exitCode, durationMs: Math.round(performance.now() - started) };
  await writeFile(join(output, "worker.log"), workerLog);
  evidence.passed = true;
} catch (error) {
  await writeFile(join(output, "proxy.log"), await docker("logs", containers[1]!).catch(() => "Proxy did not start"));
  evidence.passed = false;
  evidence.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  worker?.kill("SIGKILL");
  await api?.close();
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolveClose) => scanner.close(() => resolveClose()));
  for (const name of containers) await docker("rm", "-f", name).catch(() => {});
  await docker("network", "rm", network).catch(() => {});
  await rm(temporary, { recursive: true, force: true });
  evidence.finishedAt = new Date().toISOString();
  await writeFile(join(output, "result.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}
