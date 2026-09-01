import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

type StepResult = {
  name: string;
  command: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
};

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const projectName = `forgetbase-proof-${process.pid}-${Date.now()}`.toLowerCase();
const outputDir = resolve(
  root,
  process.env.PRIVATE_LIVE_PROOF_DIR ?? `work/private-live-proof/${timestamp}`
);
const keepStack = process.env.KEEP_PRIVATE_LIVE_STACK === "1";
const requireClean = process.env.PRIVATE_LIVE_REQUIRE_CLEAN !== "0";
const composeFiles = ["-f", "compose.yaml", "-f", "compose.same-origin.yaml"];
const steps: StepResult[] = [];
const redactions: string[] = [];
const baseEnv = buildProofEnvironment();
let composeEnv: NodeJS.ProcessEnv = { ...baseEnv, COMPOSE_PROJECT_NAME: projectName };
let cleanedUp = false;
let failed = false;
let cleanupAttempted = false;
let resultSummary: Record<string, unknown> | null = null;

mkdirSync(outputDir, { recursive: true });
process.once("SIGINT", () => handleSignal("SIGINT", 130));
process.once("SIGTERM", () => handleSignal("SIGTERM", 143));

try {
  const worktree = run("record candidate worktree", "git", ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (requireClean && worktree.stdout.trim()) {
    throw new Error("The private-live proof requires a clean worktree. Commit or otherwise preserve the candidate, or set PRIVATE_LIVE_REQUIRE_CLEAN=0 for implementation-only validation.");
  }

  const commit = run("record candidate commit", "git", ["rev-parse", "HEAD"]).stdout.trim();
  run(
    "build host workspace for proof commands",
    "npx",
    ["-y", "pnpm@11.7.0", "build"],
    baseEnv,
    15 * 60 * 1_000
  );
  const ports = await reserveDistinctPorts(4);
  const [postgresPort, apiPort, webPort, proxyPort] = ports;
  composeEnv = {
    ...composeEnv,
    FORGETBASE_POSTGRES_PORT: `127.0.0.1:${postgresPort}`,
    FORGETBASE_API_PORT: `127.0.0.1:${apiPort}`,
    FORGETBASE_WEB_PORT: `127.0.0.1:${webPort}`,
    FORGETBASE_PROXY_PORT: `127.0.0.1:${proxyPort}`
  };
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${proxyPort}/`;

  run("validate isolated Compose config", "docker", ["compose", ...composeFiles, "config", "--quiet"], composeEnv);
  run(
    "build and start isolated stack",
    "docker",
    ["compose", ...composeFiles, "up", "--build", "-d", "postgres", "migrate", "api", "worker", "web", "proxy"],
    composeEnv,
    30 * 60 * 1_000
  );

  await waitForUrl(`${apiUrl}/ready`, 120_000);
  await waitForUrl(webUrl, 120_000);

  run(
    "run Postgres-backed repository tests",
    "npx",
    ["-y", "pnpm@11.7.0", "exec", "vitest", "run", "packages/db/src/index.test.ts"],
    {
      ...composeEnv,
      TEST_DATABASE_URL: `postgres://forgetbase:forgetbase_dev@127.0.0.1:${postgresPort}/forgetbase`
    },
    15 * 60 * 1_000
  );

  const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const tenantId = "tenant_demo";
  const adminEmail = `admin-${suffix}@example.test`;
  const readerEmail = `reader-${suffix}@example.test`;
  const password = randomBytes(24).toString("base64url");
  redactions.push(password);

  const bootstrap = await requestJson(`${apiUrl}/auth/bootstrap`, {
    method: "POST",
    body: {
      tenantId,
      email: adminEmail,
      displayName: "Private Live Admin",
      password,
      keyName: "private-live-proof-admin"
    }
  });
  const adminKey = readRequiredString(bootstrap, "secret", "bootstrap API key");
  redactions.push(adminKey);

  await requestJson(`${apiUrl}/auth/users`, {
    method: "POST",
    apiKey: adminKey,
    body: {
      email: readerEmail,
      displayName: "Private Live Reader",
      role: "reader",
      password
    }
  });

  run(
    "import synthetic demo corpus",
    "npx",
    ["-y", "pnpm@11.7.0", "--filter", "@forgetbase/cli", "start", "--", "corpus", "import", "--api-url", apiUrl, "--file", "corpus/demo/assets.json"],
    { ...composeEnv, FORGETBASE_API_KEY: adminKey },
    5 * 60 * 1_000
  );
  await verifySyntheticAttachment(apiUrl, adminKey);

  run(
    "run Compose smoke and restricted-leakage proof",
    "npx",
    ["-y", "pnpm@11.7.0", "smoke:compose"],
    { ...composeEnv, FORGETBASE_API_URL: apiUrl },
    10 * 60 * 1_000
  );
  const backupSetPath = resolve(outputDir, "backup-set");
  run(
    "stop writers for coordinated backup",
    "docker",
    ["compose", ...composeFiles, "stop", "api", "worker"],
    composeEnv,
    5 * 60 * 1_000
  );
  run(
    "create coordinated database and attachment backup set",
    "npx",
    ["-y", "pnpm@11.7.0", "backup:set", "--", backupSetPath],
    composeEnv,
    10 * 60 * 1_000
  );
  run(
    "verify coordinated backup set",
    "npx",
    ["-y", "pnpm@11.7.0", "backup:set:verify", "--", backupSetPath],
    composeEnv,
    10 * 60 * 1_000
  );
  run(
    "restart writers after backup verification",
    "docker",
    ["compose", ...composeFiles, "up", "-d", "api", "worker", "web", "proxy"],
    composeEnv,
    10 * 60 * 1_000
  );
  await waitForUrl(`${apiUrl}/ready`, 120_000);
  run(
    "run authenticated admin browser UAT",
    "npx",
    ["-y", "pnpm@11.7.0", "test:uat"],
    {
      ...composeEnv,
      UAT_BASE_URL: webUrl,
      UAT_MODE: "release",
      UAT_EXPECT_ROLE: "admin",
      UAT_TEST_AUTHORING: "true",
      UAT_TENANT_ID: tenantId,
      UAT_EMAIL: adminEmail,
      UAT_PASSWORD: password,
      UAT_EXPECT_ATTACHMENT_FILENAME: "private-live-proof.txt",
      UAT_OUTPUT_DIR: `${outputDir}/uat-admin`
    },
    10 * 60 * 1_000
  );
  run(
    "run authenticated reader browser UAT",
    "npx",
    ["-y", "pnpm@11.7.0", "test:uat"],
    {
      ...composeEnv,
      UAT_BASE_URL: webUrl,
      UAT_MODE: "release",
      UAT_EXPECT_ROLE: "reader",
      UAT_TENANT_ID: tenantId,
      UAT_EMAIL: readerEmail,
      UAT_PASSWORD: password,
      UAT_EXPECT_ATTACHMENT_FILENAME: "private-live-proof.txt",
      UAT_OUTPUT_DIR: `${outputDir}/uat-reader`
    },
    10 * 60 * 1_000
  );

  resultSummary = {
    ok: true,
    candidateCommit: commit,
    worktreeClean: !worktree.stdout.trim(),
    projectName,
    outputDir: outputDir.replace(`${root}/`, ""),
    endpoints: { apiUrl, webUrl },
    assumptions: {
      isolatedComposeProject: true,
      syntheticCorpusOnly: true,
      repositoryVisibilityChanged: false,
      tagOrReleaseCreated: false,
      stackKept: keepStack
    },
    steps
  };
} catch (error) {
  failed = true;
  const diagnostics = runBestEffort(
    "capture isolated stack diagnostics",
    "docker",
    ["compose", ...composeFiles, "logs", "--no-color", "--tail", "200"],
    composeEnv
  );
  resultSummary = {
    ok: false,
    projectName,
    outputDir: outputDir.replace(`${root}/`, ""),
    error: sanitize(error instanceof Error ? error.message : String(error)),
    diagnostics,
    steps
  };
} finally {
  if (!keepStack) {
    const cleanupResult = cleanupStack();
    cleanedUp = cleanupResult.ok;
    if (!cleanupResult.ok) {
      failed = true;
    }
  }

  writeFileSync(
    resolve(outputDir, "cleanup.json"),
    `${JSON.stringify({ projectName, cleanedUp, stackKept: keepStack }, null, 2)}\n`
  );
}

const summary = {
  ...(resultSummary ?? {
    projectName,
    outputDir: outputDir.replace(`${root}/`, ""),
    error: "The isolated proof ended without a result"
  }),
  ok: !failed && resultSummary?.ok === true,
  cleanup: {
    attempted: cleanupAttempted,
    cleanedUp,
    stackKept: keepStack
  }
};
writeSummary(summary);
if (summary.ok) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.error(JSON.stringify(summary, null, 2));
}

if (failed) {
  process.exitCode = 1;
}

function run(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = baseEnv,
  timeout = 2 * 60 * 1_000
): StepResult {
  const result = execute(name, command, args, env, timeout);
  steps.push(result);
  if (!result.ok) {
    throw new Error(`${name} failed with status ${String(result.status)}: ${result.stderr || result.stdout}`);
  }
  return result;
}

function runBestEffort(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = baseEnv,
  timeout = 2 * 60 * 1_000
): StepResult {
  const result = execute(name, command, args, env, timeout);
  steps.push(result);
  return result;
}

function execute(
  name: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout: number
): StepResult {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: 20 * 1024 * 1024,
    timeout
  });
  return {
    name,
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    durationMs: Date.now() - started,
    stdout: sanitize(result.stdout ?? ""),
    stderr: sanitize(result.stderr ?? "")
  };
}

function cleanupStack(): StepResult {
  if (cleanupAttempted) {
    return {
      name: "remove isolated stack and volumes",
      command: "docker compose down",
      ok: cleanedUp,
      status: cleanedUp ? 0 : 1,
      durationMs: 0,
      stdout: "",
      stderr: "Cleanup was already attempted"
    };
  }

  cleanupAttempted = true;
  return runBestEffort(
    "remove isolated stack and volumes",
    "docker",
    ["compose", ...composeFiles, "down", "--volumes", "--remove-orphans"],
    composeEnv,
    5 * 60 * 1_000
  );
}

function handleSignal(signal: NodeJS.Signals, exitCode: number): never {
  failed = true;
  const cleanupResult = keepStack ? null : cleanupStack();
  cleanedUp = cleanupResult?.ok ?? false;
  const interruptedSummary = {
    ok: false,
    projectName,
    outputDir: outputDir.replace(`${root}/`, ""),
    error: `Isolated proof interrupted by ${signal}`,
    cleanup: {
      attempted: cleanupAttempted,
      cleanedUp,
      stackKept: keepStack
    },
    steps
  };
  writeSummary(interruptedSummary);
  writeFileSync(
    resolve(outputDir, "cleanup.json"),
    `${JSON.stringify({ projectName, cleanedUp, stackKept: keepStack, signal }, null, 2)}\n`
  );
  console.error(JSON.stringify(interruptedSummary, null, 2));
  process.exit(exitCode);
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let lastError = "no response";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function requestJson(
  url: string,
  input: { method: string; apiKey?: string; body?: Record<string, unknown> }
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: input.method,
    headers: {
      accept: "application/json",
      ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      ...(input.body ? { "content-type": "application/json" } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${input.method} ${url} failed with HTTP ${response.status}: ${sanitize(text)}`);
  }
  const parsed: unknown = text ? JSON.parse(text) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${input.method} ${url} did not return a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

async function verifySyntheticAttachment(apiUrl: string, apiKey: string): Promise<void> {
  const startedAt = Date.now();
  const stableId = "playbook.public-demo-no-export";
  const content = Buffer.from("ForgetBase synthetic attachment proof\n", "utf8");
  const uploadUrl = new URL(`/assets/${encodeURIComponent(stableId)}/attachments`, apiUrl);

  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/octet-stream",
      "x-forgetbase-attachment-filename-encoded": encodeURIComponent("private-live-proof.txt"),
      "x-forgetbase-attachment-media-type": "text/plain"
    },
    body: content
  });
  const uploadText = await upload.text();
  if (!upload.ok) {
    throw new Error(`Synthetic attachment upload failed with HTTP ${upload.status}: ${sanitize(uploadText)}`);
  }
  const metadata = JSON.parse(uploadText) as Record<string, unknown>;
  const attachmentId = readRequiredString(metadata, "id", "synthetic attachment ID");
  if ("storageKey" in metadata || "tenantId" in metadata || "uploadedByApiKeyId" in metadata) {
    throw new Error("Synthetic attachment upload exposed private persistence metadata");
  }

  const list = await requestJson(`${apiUrl}/assets/${encodeURIComponent(stableId)}/attachments`, {
    method: "GET",
    apiKey
  });
  const listed = Array.isArray(list.attachments) ? list.attachments : [];
  if (!listed.some((attachment) => attachment && typeof attachment === "object" && (attachment as Record<string, unknown>).id === attachmentId)) {
    throw new Error("Synthetic attachment was missing from the authorized list response");
  }

  const download = await fetch(`${apiUrl}/assets/${encodeURIComponent(stableId)}/attachments/${encodeURIComponent(attachmentId)}/download`, {
    headers: { authorization: `Bearer ${apiKey}` }
  });
  if (!download.ok) {
    throw new Error(`Synthetic attachment download failed with HTTP ${download.status}`);
  }
  const downloaded = Buffer.from(await download.arrayBuffer());
  if (!downloaded.equals(content)) {
    throw new Error("Synthetic attachment download bytes did not match the upload");
  }
  if (
    download.headers.get("x-content-type-options") !== "nosniff" ||
    download.headers.get("cache-control") !== "private, no-store" ||
    !download.headers.get("content-disposition")?.startsWith("attachment;")
  ) {
    throw new Error("Synthetic attachment download security headers were incomplete");
  }

  const eicar = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    "utf8"
  );
  const infectedUpload = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/octet-stream",
      "x-forgetbase-attachment-filename-encoded": encodeURIComponent("scanner-proof.txt"),
      "x-forgetbase-attachment-media-type": "text/plain"
    },
    body: eicar
  });
  const infectedText = await infectedUpload.text();
  if (infectedUpload.status !== 422 || !infectedText.includes("malware")) {
    throw new Error(`ClamAV did not reject the synthetic EICAR attachment: HTTP ${infectedUpload.status}`);
  }

  steps.push({
    name: "verify clean attachment lifecycle and EICAR rejection",
    command: "HTTP attachment lifecycle proof",
    ok: true,
    status: 0,
    durationMs: Date.now() - startedAt,
    stdout: `verified ${content.byteLength} synthetic bytes`,
    stderr: ""
  });
}

function readRequiredString(value: Record<string, unknown>, key: string, description: string): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || !candidate) {
    throw new Error(`${description} was missing`);
  }
  return candidate;
}

async function reserveDistinctPorts(count: number): Promise<number[]> {
  const ports = new Set<number>();
  while (ports.size < count) {
    ports.add(await reservePort());
  }
  return [...ports];
}

async function reservePort(): Promise<number> {
  return await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not reserve a local proof port")));
        return;
      }
      const { port } = address;
      server.close(() => resolvePromise(port));
    });
  });
}

function sanitize(value: string): string {
  let sanitized = value.slice(0, 200_000);
  for (const secret of redactions) {
    sanitized = sanitized.replaceAll(secret, "[redacted]");
  }
  return sanitized.trim();
}

function buildProofEnvironment(): NodeJS.ProcessEnv {
  const allowedNames = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TERM",
    "CI",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
    "XDG_RUNTIME_DIR",
    "PNPM_HOME",
    "COREPACK_HOME",
    "PLAYWRIGHT_BROWSERS_PATH",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "npm_config_registry",
    "npm_config_cache"
  ];

  return Object.fromEntries(
    allowedNames.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]])
  );
}

function writeSummary(summary: unknown): void {
  writeFileSync(resolve(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}
