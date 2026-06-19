import { spawnSync } from "node:child_process";
import net from "node:net";

type SmokeStep = {
  name: string;
  status: "pass" | "fail" | "skip";
  detail?: unknown;
};

const apiUrl = stripTrailingSlash(process.env.FORGETBASE_API_URL ?? `http://127.0.0.1:${process.env.FORGETBASE_API_PORT ?? "3000"}`);
const packageName = process.env.FORGETBASE_SMOKE_EXPORT_PACKAGE ?? "demo-agent-pack";
const requestTimeoutMs = parsePositiveInteger(process.env.FORGETBASE_SMOKE_TIMEOUT_MS, 10_000);
const steps: SmokeStep[] = [];
const failures: string[] = [];

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function recordPass(name: string, detail?: unknown): void {
  steps.push({ name, status: "pass", detail });
  console.error(`[smoke:compose] pass: ${name}`);
}

function recordFail(name: string, message: string, detail?: unknown): void {
  steps.push({ name, status: "fail", detail: { message, ...(isRecord(detail) ? detail : { detail }) } });
  failures.push(`${name}: ${message}`);
  console.error(`[smoke:compose] fail: ${name}: ${message}`);
}

function recordSkip(name: string, message: string, detail?: unknown): void {
  steps.push({ name, status: "skip", detail: { message, ...(isRecord(detail) ? detail : { detail }) } });
  console.error(`[smoke:compose] skip: ${name}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCommandOutput(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 4_000);
}

function runCommand(name: string, command: string, args: string[], env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  error?: string;
} {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    maxBuffer: 1024 * 1024 * 8
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: normalizeCommandOutput(result.stdout),
    stderr: normalizeCommandOutput(result.stderr),
    error: result.error?.message
  };
}

function commandLine(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function joinApiPath(path: string): string {
  return `${apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(joinApiPath(path), {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    try {
      return text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Response was not valid JSON: ${(error as Error).message}; body=${text.slice(0, 500)}`);
    }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? `Request timed out after ${requestTimeoutMs}ms`
      : (error as Error).message;
    throw new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

function assertRecord(value: unknown, description: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${description} was not a JSON object`);
  }
}

function assertString(value: unknown, description: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${description} was not a non-empty string`);
  }
  return value;
}

function assertNonNegativeInteger(value: unknown, description: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${description} was not a non-negative integer`);
  }
  return value as number;
}

function assertArray(value: unknown, description: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${description} was not an array`);
  }
  return value;
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function checkTcpReachability(targetUrl: string): Promise<"open" | "closed" | "unsupported"> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return "unsupported";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "unsupported";
  }

  const port = Number.parseInt(parsed.port || (parsed.protocol === "https:" ? "443" : "80"), 10);
  const host = parsed.hostname;

  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (status: "open" | "closed") => {
      socket.destroy();
      resolve(status);
    };

    socket.setTimeout(1_000);
    socket.once("connect", () => finish("open"));
    socket.once("timeout", () => finish("closed"));
    socket.once("error", () => finish("closed"));
  });
}

function validateOpenApiDocument(document: unknown): Record<string, unknown> {
  assertRecord(document, "OpenAPI document");
  const openapi = assertString(document.openapi, "OpenAPI version");
  assertRecord(document.paths, "OpenAPI paths");
  assertRecord(document.paths["/exports/ai-package"], "OpenAPI /exports/ai-package path");
  assertRecord((document.paths["/exports/ai-package"] as Record<string, unknown>).get, "OpenAPI /exports/ai-package GET operation");
  return {
    openapi,
    pathCount: Object.keys(document.paths).length,
    hasAiPackageExport: true
  };
}

function validateJsonExport(payload: unknown): Record<string, unknown> {
  assertRecord(payload, "JSON export response");
  const returnedPackageName = assertString(payload.packageName, "JSON export packageName");
  const assetCount = assertNonNegativeInteger(payload.assetCount, "JSON export assetCount");
  const deniedCount = assertNonNegativeInteger(payload.deniedCount, "JSON export deniedCount");
  const assets = assertArray(payload.assets, "JSON export assets");

  if (returnedPackageName !== packageName) {
    throw new Error(`JSON export returned packageName=${returnedPackageName}; expected ${packageName}`);
  }

  if (assetCount !== assets.length) {
    throw new Error(`JSON export assetCount=${assetCount} did not match assets.length=${assets.length}`);
  }

  if (assetCount < 1) {
    throw new Error(`JSON export for ${packageName} returned 0 assets; import corpus/demo/assets.json into the running API before this smoke gate`);
  }

  return { packageName: returnedPackageName, assetCount, deniedCount };
}

function validateOkfExport(payload: unknown): Record<string, unknown> {
  assertRecord(payload, "OKF export response");

  if (payload.format === undefined && payload.assets !== undefined) {
    throw new Error("OKF export returned the JSON export shape instead of an OKF package; the running API may be stale or ignoring format=okf");
  }

  const format = assertString(payload.format, "OKF export format");
  const returnedPackageName = assertString(payload.packageName, "OKF export packageName");
  const okfVersion = assertString(payload.okfVersion, "OKF export okfVersion");
  const assetCount = assertNonNegativeInteger(payload.assetCount, "OKF export assetCount");
  const deniedCount = assertNonNegativeInteger(payload.deniedCount, "OKF export deniedCount");
  const files = assertArray(payload.files, "OKF export files");

  if (format !== "okf") {
    throw new Error(`OKF export returned format=${format}; expected okf`);
  }

  if (returnedPackageName !== packageName) {
    throw new Error(`OKF export returned packageName=${returnedPackageName}; expected ${packageName}`);
  }

  if (okfVersion !== "0.1") {
    throw new Error(`OKF export returned okfVersion=${okfVersion}; expected 0.1`);
  }

  if (assetCount < 1) {
    throw new Error(`OKF export for ${packageName} returned 0 assets; import corpus/demo/assets.json into the running API before this smoke gate`);
  }

  if (files.length < 1) {
    throw new Error("OKF export returned no files");
  }

  return { packageName: returnedPackageName, okfVersion, assetCount, deniedCount, fileCount: files.length };
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  console.error(`[smoke:compose] target API: ${apiUrl}`);
  console.error("[smoke:compose] this gate validates compose config and a running API; it does not start or stop containers");

  const dockerVersion = runCommand("docker version", "docker", ["--version"]);
  const dockerAvailable = dockerVersion.ok;

  if (dockerAvailable) {
    recordPass("docker CLI", { output: dockerVersion.stdout || dockerVersion.stderr });
  } else {
    recordFail("docker CLI", "Docker CLI is unavailable; install Docker Desktop or a compatible Docker CLI before running Compose validation", dockerVersion);
  }

  const composeVersion = dockerAvailable ? runCommand("docker compose version", "docker", ["compose", "version"]) : null;
  const composeAvailable = Boolean(composeVersion?.ok);

  if (composeAvailable && composeVersion) {
    recordPass("docker compose CLI", { output: composeVersion.stdout || composeVersion.stderr });
  } else if (dockerAvailable && composeVersion) {
    recordFail("docker compose CLI", "Docker Compose plugin is unavailable; install/enable `docker compose` before running Compose validation", composeVersion);
  } else {
    recordSkip("docker compose CLI", "Skipped because Docker CLI is unavailable");
  }

  if (composeAvailable) {
    const composeConfigs = [
      ["compose config", ["compose", "-f", "compose.yaml", "config", "--quiet"]],
      ["compose same-origin config", ["compose", "-f", "compose.yaml", "-f", "compose.same-origin.yaml", "config", "--quiet"]],
      ["compose tls config", ["compose", "-f", "compose.yaml", "-f", "compose.same-origin.yaml", "-f", "compose.tls.yaml", "config", "--quiet"]]
    ] as const;

    for (const [name, args] of composeConfigs) {
      const result = runCommand(name, "docker", [...args]);
      if (result.ok) {
        recordPass(name, { command: commandLine("docker", [...args]) });
      } else {
        recordFail(name, `Compose config validation failed for ${commandLine("docker", [...args])}`, result);
      }
    }

    const dockerInfo = runCommand("docker daemon", "docker", ["info", "--format", "{{json .ServerVersion}}"]);
    if (dockerInfo.ok) {
      recordPass("docker daemon", { serverVersion: dockerInfo.stdout.replace(/^"|"$/g, "") });
    } else {
      recordFail("docker daemon", "Docker daemon is unavailable; start Docker Desktop or target an already reachable API with FORGETBASE_API_URL", dockerInfo);
    }
  }

  let apiHealthy = false;
  try {
    const health = await fetchJson("/health");
    assertRecord(health, "Health response");
    apiHealthy = true;
    recordPass("API /health", health);
  } catch (error) {
    const tcpStatus = await checkTcpReachability(apiUrl);
    const composePs = composeAvailable ? runCommand("docker compose ps", "docker", ["compose", "ps"]) : undefined;
    const message = tcpStatus === "open"
      ? `API health check failed even though ${apiUrl} accepts TCP connections; this often means a port conflict or a non-ForgetBase service is on the configured port`
      : `No running ForgetBase API is reachable at ${apiUrl}; start the Compose stack first or set FORGETBASE_API_URL to a reachable API`;
    recordFail("API /health", message, {
      error: summarizeError(error),
      tcpStatus,
      composePs: composePs ? {
        status: composePs.status,
        stdout: composePs.stdout,
        stderr: composePs.stderr
      } : undefined
    });
  }

  if (apiHealthy) {
    try {
      const openApi = await fetchJson("/openapi.json");
      recordPass("API /openapi.json", validateOpenApiDocument(openApi));
    } catch (error) {
      recordFail("API /openapi.json", summarizeError(error));
    }

    try {
      const jsonExport = await fetchJson(`/exports/ai-package?package=${encodeURIComponent(packageName)}`);
      recordPass("JSON demo-agent-pack export", validateJsonExport(jsonExport));
    } catch (error) {
      recordFail("JSON demo-agent-pack export", summarizeError(error));
    }

    try {
      const okfExport = await fetchJson(`/exports/ai-package?package=${encodeURIComponent(packageName)}&format=okf&okfVersion=0.1`);
      recordPass("OKF demo-agent-pack export", validateOkfExport(okfExport));
    } catch (error) {
      recordFail("OKF demo-agent-pack export", summarizeError(error));
    }

    const leakage = runCommand("restricted leakage verifier", "bash", ["scripts/verify-restricted-leakage.sh"], {
      ...process.env,
      FORGETBASE_API_URL: apiUrl
    });

    if (leakage.ok) {
      recordPass("security:verify-restricted-leakage", parseJsonObject(leakage.stdout) ?? { stdout: leakage.stdout });
    } else {
      recordFail("security:verify-restricted-leakage", "Restricted leakage verifier failed against the running API", leakage);
    }
  } else {
    recordSkip("API /openapi.json", "Skipped because API health failed");
    recordSkip("JSON demo-agent-pack export", "Skipped because API health failed");
    recordSkip("OKF demo-agent-pack export", "Skipped because API health failed");
    recordSkip("security:verify-restricted-leakage", "Skipped because API health failed");
  }

  const summary = {
    ok: failures.length === 0,
    apiUrl,
    packageName,
    assumptions: {
      dockerCliRequiredForComposeConfig: true,
      runningApiRequiredForRuntimeChecks: true,
      startsContainers: false,
      stopsContainers: false,
      secretsRequired: false
    },
    failures,
    steps
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[smoke:compose] unexpected failure: ${summarizeError(error)}`);
  process.exitCode = 1;
});
