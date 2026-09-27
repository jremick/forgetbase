// Synthetic, interactive macOS proof. Build and bundle first. Requires a
// disposable PostgreSQL server and the normal browser approval UI.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, request as proxyRequest } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { createPool, runMigrations, PostgresAuthRepository, PostgresRegistryRepository } from "../packages/db/src/index.js";
import { createEd25519LocalSyncSigner } from "../packages/local-sync/src/index.js";
import { createSystemCredentialStore } from "../packages/local-runtime/src/credentials.js";
import { buildServer } from "../apps/api/src/server.js";

assert.equal(process.platform, "darwin", "This proof requires native macOS Keychain");
assert(process.env.TEST_DATABASE_URL, "Set TEST_DATABASE_URL to a disposable PostgreSQL server");
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.env.LOCAL_RUNTIME_PROOF_OUTPUT ?? "local-runtime-native-proof.json");
const root = await mkdtemp(join(tmpdir(), "forgetbase-native-proof-"));
const bundle = join(repo, "packages/cli/bundle/forgetbase.mjs");
const account = `profile:${createHash("sha256").update(`${root}\0proof`).digest("hex")}`;
const credentials = createSystemCredentialStore();
const adminPool = createPool(process.env.TEST_DATABASE_URL);
const databaseName = `local_native_${randomUUID().replaceAll("-", "")}`;
await adminPool.query(`CREATE DATABASE ${databaseName}`);
const databaseUrl = new URL(process.env.TEST_DATABASE_URL!);
databaseUrl.pathname = `/${databaseName}`;
const pool = createPool(databaseUrl.toString());
const port = Number(process.env.LOCAL_RUNTIME_PROOF_PORT ?? "48763");
const origin = `http://127.0.0.1:${port}`;
const api = buildServer({
  databaseUrl: databaseUrl.toString(), autoMigrate: false, logger: false, allowedOrigins: [origin],
  localSyncSigner: createEd25519LocalSyncSigner({ keyId: "synthetic-native-proof", privateKey: generateKeyPairSync("ed25519").privateKey }),
  localSyncEnrollmentSecret: randomUUID() + randomUUID(),
  localSyncPublicBaseUrl: `${origin}/api`, localSyncWebBaseUrl: origin,
  // This proof uses public synthetic content only.
  localSyncAllowInternal: false, requestRateLimitMax: 100_000
});
let apiUrl = "";
const web = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", origin).pathname;
  if (path.startsWith("/api/")) {
    const upstream = proxyRequest(`${apiUrl}${request.url!.slice(4)}`, {
      method: request.method, headers: { ...request.headers, host: new URL(apiUrl).host }
    }, (result) => { response.writeHead(result.statusCode!, result.headers); result.pipe(response); });
    upstream.on("error", () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
    return;
  }
  const directory = join(repo, "apps/web/dist");
  const file = resolve(directory, `.${path === "/" ? "/index.html" : path}`);
  if (!file.startsWith(directory + sep)) { response.writeHead(400); response.end(); return; }
  try {
    const content = await readFile(file);
    const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
const run = promisify(execFile);
const cancellation = new AbortController();
const cancel = () => cancellation.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const cli = async (...args: string[]) => JSON.parse((await run(process.execPath, [bundle, "local", ...args, "--root", root, "--profile", "proof"], { signal: cancellation.signal, timeout: 300_000, maxBuffer: 2 * 1024 * 1024 })).stdout);
const report: Record<string, unknown> = { node: process.version, platform: process.platform, architecture: process.arch, credentialBackend: credentials.backend, checks: [] };
const checks = report.checks as string[];
let connected = false;
let apiClosed = false;
try {
  await runMigrations(pool);
  const auth = new PostgresAuthRepository(pool);
  await auth.createUser({ tenantId: "tenant_demo", email: "native-proof@example.test", displayName: "Synthetic native proof", password: "synthetic-native-proof-password", role: "reader", status: "active" });
  const registry = new PostgresRegistryRepository(pool);
  for (const [stableId, sensitivity] of [["policy.native-proof", "public-demo"], ["policy.denied-native", "restricted"]] as const) {
    await registry.createAsset({ tenantId: "tenant_demo", stableId, title: stableId, type: "policy", ownerId: "synthetic", lifecycleState: "active", status: "approved", sensitivity, audience: ["developers"], sourceKind: "synthetic-demo", sourceRef: `https://example.test/${stableId}`, reviewDueAt: "2027-01-01", allowedSurfaces: ["web", "local-cache"], humanDocument: { format: "markdown", body: "Native proof anchor for release verification." } });
  }
  apiUrl = await api.listen({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve, reject) => { web.once("error", reject); web.listen(port, "127.0.0.1", resolve); });
  console.log(`Synthetic proof ready at ${origin}. Sign in as native-proof@example.test with the fixture password in this script. Press Enter here after login; the CLI then opens the default browser for approval of Synthetic native proof.`);
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(new Error("Synthetic proof cancelled"));
    cancellation.signal.addEventListener("abort", abort, { once: true });
    process.stdin.once("data", () => {
      cancellation.signal.removeEventListener("abort", abort);
      process.stdin.pause(); resolve();
    });
  });
  const enrollment = await cli("connect", "--api-url", `${origin}/api`, "--device-name", "Synthetic native proof");
  connected = true;
  assert.equal(enrollment.state, "not-built");
  assert(await credentials.get(account));
  checks.push("browser approval, loopback PKCE callback, native Keychain persistence");
  assert.equal((await cli("sync")).mode, "full");
  assert.equal((await cli("sync")).mode, "unchanged");
  const search = await cli("search", "--query", "anchor");
  assert.deepEqual(search.results.map((item: {stableId: string}) => item.stableId), ["policy.native-proof"]);
  assert.equal((await cli("source", "--stable-id", "policy.native-proof")).asset.stableId, "policy.native-proof");
  assert((await cli("guidance", "--query", "anchor")).sources.length > 0);
  checks.push("separate bundled CLI processes: full/unchanged sync, SQLite restart, search/source/guidance");
  const requireMcp = createRequire(join(repo, "packages/mcp-server/package.json"));
  const { Client } = await import(requireMcp.resolve("@modelcontextprotocol/sdk/client/index.js"));
  const { StdioClientTransport } = await import(requireMcp.resolve("@modelcontextprotocol/sdk/client/stdio.js"));
  const client = new Client({ name: "synthetic-native-proof", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [bundle, "local", "mcp", "--root", root, "--profile", "proof"], stderr: "pipe" });
  await client.connect(transport);
  try {
    assert.deepEqual((await client.listTools()).tools.map((tool: {name: string}) => tool.name).sort(), ["get_local_guidance", "get_local_runtime_status", "get_local_source", "search_local_knowledge"]);
    for (const [name, args] of [["get_local_guidance", { query: "anchor" }], ["get_local_source", { stableId: "policy.native-proof" }], ["get_local_runtime_status", {}]] as const) {
      assert(!(await client.callTool({ name, arguments: args })).isError);
    }
    await api.close(); apiClosed = true;
    await new Promise<void>((resolve) => web.close(() => resolve()));
    await assert.rejects(cli("sync"));
    assert.equal((await cli("search", "--query", "anchor")).results.length, 1);
    checks.push("offline network refusal retains only the existing valid signed lease");
    const latencies: number[] = [];
    for (let index = 0; index < 1000; index++) {
      cancellation.signal.throwIfAborted();
      const start = performance.now();
      const result = await client.callTool({ name: "search_local_knowledge", arguments: { query: "anchor" } });
      assert(!result.isError);
      assert.deepEqual(JSON.parse(result.content[0].text).results.map((item: {stableId: string}) => item.stableId), ["policy.native-proof"]);
      latencies.push(performance.now() - start);
      if ((index + 1) % 100 === 0) console.log(`Offline MCP proof: ${index + 1}/1000 queries`);
    }
    latencies.sort((a, b) => a - b);
    report.offlineMcpQueries = { count: latencies.length, p50Milliseconds: latencies[499], p95Milliseconds: latencies[949], maxMilliseconds: latencies[999] };
    checks.push("real MCP stdio transport: four read-only tools and 1000 offline queries with exact allowed IDs");
  } finally { await client.close(); }
  await cli("disconnect", "--local-only"); connected = false;
  assert.equal(await credentials.get(account), null);
  checks.push("local-only disconnect removes the task credential and cache; server revocation separately covered by PostgreSQL E2E");
  report.success = true;
} finally {
  process.stdin.pause();
  if (connected) await cli("disconnect", "--local-only").catch(() => undefined);
  // Cover cancellation or failure between a successful CLI enrollment and
  // parsing its output. This account belongs only to this disposable root.
  if (await credentials.get(account)) await credentials.delete(account);
  if (!apiClosed) await api.close();
  if (web.listening) await new Promise<void>((resolve) => web.close(() => resolve()));
  await pool.end();
  await adminPool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await adminPool.end();
  await rm(root, { recursive: true, force: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Proof report: ${output}`);
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
}
