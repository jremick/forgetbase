#!/usr/bin/env node
// Portable CI and release-check entrypoint. Usage and evidence contract: docs/LOCAL_CI.md.
// Runs the repository's own gate commands, writes evidence outside the checkout and removes
// only resources named for LOCAL_CI_RUN_ID. result.json, not the exit code, is the record.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync,
  statSync, writeFileSync, writeSync
} from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
// Mirrors setup-node in .github/workflows and the Dockerfile base images; change them together.
const nodeVersion = "26.10.0";
const pnpmVersion = String(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).packageManager ?? "")
  .replace(/^pnpm@/, "").split("+")[0];
// The CI service pin. It intentionally differs from the compose.yaml digest.
const postgresImage = "pgvector/pgvector:pg17@sha256:d2ef61f42ef767baa5a1475393303cc235bcd92febd9d7014eddb48b41f3bad0";
const runIdPattern = /^[a-z0-9][a-z0-9-]{6,61}[a-z0-9]$/;
const shaPattern = /^[a-f0-9]{40}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const runLabel = "dev.forgetbase.local-ci.run-id";
const composeFiles = ["-f", "compose.yaml", "-f", "compose.same-origin.yaml"];
const deploymentServices = ["api", "worker", "web", "proxy"];
// GitHub default setup languages, query suites and SARIF categories for this repository.
const codeqlLanguages = {
  "javascript-typescript": { suite: "codeql/javascript-queries:codeql-suites/javascript-code-scanning.qls", build: ["--build-mode=none"] },
  actions: { suite: "codeql/actions-queries:codeql-suites/actions-code-scanning.qls", build: ["--build-mode=none"] },
  swift: {
    suite: "codeql/swift-queries:codeql-suites/swift-code-scanning.qls",
    build: [`--command=swift build -c release --arch ${arch() === "arm64" ? "arm64" : "x86_64"}`],
    platform: "darwin"
  }
};
const jobTimeoutSeconds = {
  verify: 25 * 60,
  "private-live-proof": 60 * 60,
  "release-artifacts": 10 * 60,
  "dependency-audit": 10 * 60,
  ...Object.fromEntries(Object.keys(codeqlLanguages).map((language) => [`codeql-${language}`, 60 * 60]))
};
const releaseCheckJobs = ["release-artifacts", "dependency-audit", "verify", "private-live-proof"];
const dockerJobs = new Set(["verify", "private-live-proof"]);
const jobs = [...Object.keys(jobTimeoutSeconds), "release-check", "cleanup"];
const requiredProofSteps = [
  "run Postgres-backed repository tests",
  "import synthetic demo corpus",
  "verify clean attachment lifecycle and EICAR rejection",
  "run Compose smoke and restricted-leakage proof",
  "create coordinated database and attachment backup set",
  "verify coordinated backup set",
  "run authenticated admin browser UAT",
  "run authenticated reader browser UAT",
  "remove isolated stack and volumes"
];
// Checks receive only these caller variables; tokens in the caller's environment stay behind.
const inheritedEnvironment = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TERM", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
  "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY", "XDG_RUNTIME_DIR",
  "XDG_CACHE_HOME", "PNPM_HOME", "COREPACK_HOME", "PLAYWRIGHT_BROWSERS_PATH", "NODE_EXTRA_CA_CERTS", "DEVELOPER_DIR",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
  "npm_config_registry", "npm_config_cache", "npm_config_store_dir"
];

class Refusal extends Error {}
class Stopped extends Error {}

const startedAt = Date.now();
const checks = [];
const cleanup = { attempted: false, ok: true, verified: true, actions: [], remaining: [], log: null };
const host = { platform: platform(), arch: arch(), kernel: release() };
let settings = {};
let job = null;
let runId = null;
let evidenceDir = null;
let source = null;
let codeql = null;
let stopRequest = null;
let active = null;
let cleanupFd = null;
let finished = false;

try {
  await main();
} catch (error) {
  if (error instanceof Refusal) finish("refused", 2, error.message);
  else finish("error", 1, error instanceof Error ? error.stack ?? error.message : String(error));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !jobs.includes(args[0])) throw new Refusal(`Usage: scripts/local-ci.sh <${jobs.join("|")}>`);
  job = args[0];
  if (!runIdPattern.test(process.env.LOCAL_CI_RUN_ID ?? "")) {
    throw new Refusal("LOCAL_CI_RUN_ID must be 8-63 lowercase letters, digits or hyphens, starting and ending with a letter or digit");
  }
  runId = process.env.LOCAL_CI_RUN_ID;
  evidenceDir = prepareEvidenceDirectory(process.env.LOCAL_CI_EVIDENCE_DIR);
  for (const [signal, exitCode] of [["SIGHUP", 129], ["SIGINT", 130], ["SIGTERM", 143]]) {
    process.on(signal, () => requestStop(signal, exitCode));
  }
  settings = readSettings();

  if (job === "cleanup") {
    const dockerOwned = existsSync(settings.dockerOwnership);
    removeRunResources({ project: true, required: dockerOwned });
    removeScratch();
    verifyCleanup({ required: dockerOwned });
    finish(cleanup.ok ? "passed" : "failed", cleanup.ok ? 0 : 1);
    return;
  }

  source = inspectSource();
  const phases = (job === "release-check" ? releaseCheckJobs : [job]).map(createPhase);
  const preflight = addCheck({ id: "preflight/environment", name: "Check toolchain and existing run resources" });
  for (const phase of phases) for (const step of phase.steps) step.record = addCheck(step);
  const preflightStatus = runPreflight(preflight, phases);
  if (preflightStatus) {
    finish(preflightStatus, preflightStatus === "refused" ? 2 : 1, preflight.issues.join("; "));
    return;
  }
  const dockerClaimed = phases.some((phase) => dockerJobs.has(phase.name));
  if (dockerClaimed) {
    try {
      writeFileSync(settings.dockerOwnership, `${JSON.stringify({ runId, job, claimedAt: new Date().toISOString() })}\n`,
        { flag: "wx", mode: 0o600 });
    } catch (error) {
      finish("failed", 1, `Could not record Docker ownership at ${display(settings.dockerOwnership)}: ${error.code ?? error.message}`);
      return;
    }
  }

  const started = [];
  try {
    for (const phase of phases) {
      if (halted()) break;
      started.push(phase.name);
      const deadline = Date.now() + (settings.timeoutOverride ?? jobTimeoutSeconds[phase.name]) * 1_000;
      try {
        for (const step of phase.steps) {
          if (halted()) break;
          await runStep(step, phase, deadline);
        }
      } finally {
        phase.cleanup?.();
      }
    }
  } finally {
    if (dockerClaimed) verifyCleanup({ required: true });
  }

  checkFinalSource();
  const passed = checks.every((check) => check.status === "passed") && cleanup.ok && source.issues.length === 0;
  const status = stopRequest?.status ?? (passed ? "passed" : "failed");
  finish(status, status === "passed" ? 0 : status === "cancelled" ? stopRequest.exitCode : 1);
}

function prepareEvidenceDirectory(value) {
  if (!value || !isAbsolute(value)) throw new Refusal("LOCAL_CI_EVIDENCE_DIR must be an absolute path outside the checkout");
  const target = resolveThroughExisting(resolve(value));
  if (isWithin(target, root)) throw new Refusal("LOCAL_CI_EVIDENCE_DIR must be outside the checkout");
  if (existsSync(target) && (!statSync(target).isDirectory() || readdirSync(target).length > 0)) {
    throw new Refusal("LOCAL_CI_EVIDENCE_DIR must not exist yet or must be an empty directory");
  }
  mkdirSync(join(target, "checks"), { recursive: true });
  return target;
}

function readSettings() {
  const timeout = process.env.LOCAL_CI_JOB_TIMEOUT_SECONDS;
  if (timeout && !(/^\d+$/.test(timeout) && Number(timeout) >= 1 && Number(timeout) <= 14_400)) {
    throw new Refusal("LOCAL_CI_JOB_TIMEOUT_SECONDS must be an integer from 1 to 14400");
  }
  const releaseVersion = process.env.LOCAL_CI_RELEASE_VERSION || "0.0.0-local-ci";
  if (!versionPattern.test(releaseVersion)) throw new Refusal("LOCAL_CI_RELEASE_VERSION must be a semantic version");
  const codeqlBinary = process.env.LOCAL_CI_CODEQL || "codeql";
  if (process.env.LOCAL_CI_CODEQL && !isAbsolute(codeqlBinary)) throw new Refusal("LOCAL_CI_CODEQL must be an absolute path");
  const scratchValue = process.env.LOCAL_CI_SCRATCH_DIR || tmpdir();
  let scratchRoot;
  try {
    scratchRoot = isAbsolute(scratchValue) ? realpathSync(scratchValue) : "";
  } catch {
    scratchRoot = "";
  }
  if (!scratchRoot || isWithin(scratchRoot, root) || isWithin(scratchRoot, evidenceDir)) {
    throw new Refusal("LOCAL_CI_SCRATCH_DIR must be an existing absolute directory outside the checkout and evidence");
  }
  // A runner may supply a work directory that outlives the run's TMPDIR; Docker ownership lives there.
  let workRoot = null;
  if (process.env.LOCAL_CI_WORK_DIR) {
    try {
      workRoot = isAbsolute(process.env.LOCAL_CI_WORK_DIR) ? realpathSync(process.env.LOCAL_CI_WORK_DIR) : "";
    } catch {
      workRoot = "";
    }
    if (!workRoot || isWithin(workRoot, root) || isWithin(workRoot, evidenceDir)) {
      throw new Refusal("LOCAL_CI_WORK_DIR must be an existing absolute directory outside the checkout and evidence");
    }
  }
  return {
    timeoutOverride: timeout ? Number(timeout) : null,
    releaseVersion,
    codeqlBinary,
    scratchRoot,
    workRoot,
    // Run IDs cannot contain ".", so this name cannot collide with another run's directory.
    scratch: join(scratchRoot, `forgetbase-lci-${runId}.codeql`),
    // Written before a Docker job creates anything and removed only after a verified cleanup, so a
    // recovery cleanup knows Docker must be reachable. Recovery must reuse the original work or scratch root.
    dockerOwnership: join(workRoot ?? scratchRoot, `forgetbase-lci-${runId}.docker`)
  };
}

function inspectSource() {
  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.code !== 0 || safeRealpath(top.stdout.trim()) !== root) {
    throw new Refusal("The checkout must contain Git metadata for its own root");
  }
  const headSha = git(["rev-parse", "--verify", "HEAD^{commit}"]).stdout.trim();
  if (!shaPattern.test(headSha)) throw new Refusal("HEAD must resolve to a commit");
  const expectedSha = process.env.LOCAL_CI_SOURCE_SHA || null;
  if (expectedSha !== null && !shaPattern.test(expectedSha)) {
    throw new Refusal("LOCAL_CI_SOURCE_SHA must be a full 40-character lowercase commit SHA");
  }
  if (expectedSha !== null && expectedSha !== headSha) {
    throw new Refusal(`HEAD ${headSha} does not match LOCAL_CI_SOURCE_SHA ${expectedSha}`);
  }
  const allowDirtyValue = process.env.LOCAL_CI_ALLOW_DIRTY ?? "";
  if (!["", "0", "1"].includes(allowDirtyValue)) throw new Refusal("LOCAL_CI_ALLOW_DIRTY must be 1 or unset");
  const allowDirty = allowDirtyValue === "1";
  if (allowDirty && job !== "verify") throw new Refusal("LOCAL_CI_ALLOW_DIRTY is accepted only for verify");
  if (allowDirty && expectedSha) throw new Refusal("A dirty run cannot certify LOCAL_CI_SOURCE_SHA");
  const persisted = persistedCredentials();
  if (persisted.length > 0) {
    throw new Refusal(`Git config persists credentials (${persisted.join(", ")}); use a checkout without persisted credentials`);
  }
  const initial = worktreeStatus();
  if (!initial.clean && !allowDirty) {
    throw new Refusal(`The worktree has ${initial.entryCount} uncommitted or untracked entries; commit them or set LOCAL_CI_ALLOW_DIRTY=1 for a non-gating verify`);
  }
  return {
    headSha,
    expectedSha,
    shaVerified: expectedSha !== null,
    allowDirty,
    sourceDateEpoch: git(["show", "-s", "--format=%ct", "HEAD"]).stdout.trim(),
    initial,
    final: null,
    issues: []
  };
}

function persistedCredentials() {
  const found = new Set();
  const headers = git(["config", "--get-regexp", "^http\\..*extraheader$"]);
  if (headers.code === 0 && headers.stdout.trim()) found.add("http extraheader");
  const urls = git(["config", "--get-regexp", "^(remote\\..*\\.(url|pushurl)|url\\..*\\.(insteadof|pushinsteadof))$"]);
  for (const outcome of [headers, urls]) {
    if (outcome.code !== 0 && outcome.code !== 1) throw new Refusal("Could not read Git config to check for persisted credentials");
  }
  for (const line of lines(urls.stdout)) {
    if (/\bhttps?:\/\/[^/\s@]+@/i.test(line)) found.add(line.startsWith("url.") ? "URL rewrite" : "remote URL");
  }
  return [...found];
}

function worktreeStatus() {
  const outcome = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (outcome.code !== 0) throw new Refusal("Could not read the worktree status");
  const entries = lines(outcome.stdout);
  return {
    clean: entries.length === 0,
    entryCount: entries.length,
    entries: entries.slice(0, 200),
    digest: sha256(Buffer.from(outcome.stdout))
  };
}

function checkFinalSource() {
  const headSha = git(["rev-parse", "--verify", "HEAD^{commit}"]).stdout.trim();
  source.final = worktreeStatus();
  if (headSha !== source.headSha) source.issues.push(`HEAD changed during the run to ${headSha || "nothing"}`);
  const changed = source.allowDirty ? source.final.digest !== source.initial.digest : !source.final.clean;
  if (changed) source.issues.push("Checks modified the checkout");
}

function createPhase(name) {
  if (name === "verify") {
    return { name, env: { VITE_ENABLE_RICH_EDITOR: "true" }, steps: verifySteps(), cleanup: () => removeRunResources({ project: false }) };
  }
  if (name === "private-live-proof") {
    return { name, env: {}, steps: proofSteps(), cleanup: () => removeRunResources({ project: true }) };
  }
  if (name === "release-artifacts") return { name, env: {}, steps: releaseArtifactSteps() };
  if (name === "dependency-audit") return { name, env: {}, steps: auditSteps() };
  return { name, env: {}, steps: codeqlSteps(name.slice("codeql-".length)), cleanup: removeScratch };
}

// The required Actions `Verify` job, step for step. The database is its `services.postgres`.
function verifySteps() {
  const uatDir = artifact("public-beta-uat");
  const brandingDir = artifact("branding-proof");
  return [
    { id: "verify/postgres-service", name: "Start the PostgreSQL service", run: startPostgres },
    pnpm("verify/install", "Install dependencies", "install", "--frozen-lockfile"),
    pnpm("verify/typecheck", "Typecheck", "typecheck"),
    pnpm("verify/build", "Build", "build"),
    pnpm("verify/web-bundle-budget", "Enforce web bundle budget", "web:bundle-budget"),
    pnpm("verify/public-beta-ui", "Check public beta UI source gate", "public-beta:check"),
    pnpm("verify/deployment-security-defaults", "Check deployment security defaults", "security:check-deployment-defaults"),
    pnpm("verify/playwright-chromium", "Install Playwright Chromium", "exec", "playwright", "install", "chromium"),
    {
      ...pnpm("verify/public-beta-uat", "Run public beta UAT", "test:uat"),
      env: { UAT_OUTPUT_DIR: uatDir },
      verify: () => uatReportIssues(uatDir, "public")
    },
    pnpm("verify/demo-corpus", "Validate demo corpus", "--filter", "@forgetbase/cli", "start", "--", "validate",
      "--file", "corpus/demo/assets.json", "--as-of", "2026-06-16", "--fail-on-warnings"),
    { id: "verify/compose-config", name: "Validate Compose config", command: ["docker", "compose", "-f", "compose.yaml", "config", "--quiet"] },
    {
      id: "verify/compose-config-same-origin",
      name: "Validate same-origin Compose config",
      command: ["docker", "compose", "-f", "compose.yaml", "-f", "compose.same-origin.yaml", "config", "--quiet"]
    },
    {
      id: "verify/compose-config-tls",
      name: "Validate TLS Compose config",
      command: ["docker", "compose", "-f", "compose.yaml", "-f", "compose.same-origin.yaml", "-f", "compose.tls.yaml", "config", "--quiet"]
    },
    pnpm("verify/openapi-drift", "Check OpenAPI drift", "openapi:check"),
    pnpm("verify/public-claims", "Lint public claims", "claims:lint"),
    pnpm("verify/beta-contracts", "Check beta contracts", "contracts:check"),
    {
      ...pnpm("verify/branding-proof", "Verify admin branding with PostgreSQL", "exec", "tsx", "scripts/verify-branding.ts"),
      env: { BRANDING_PROOF_DIR: brandingDir },
      verify: () => brandingIssues(brandingDir)
    },
    pnpm("verify/test", "Test", "test")
  ];
}

// The `Private live isolated proof` workflow: deployment image builds, then the isolated stack proof.
function proofSteps() {
  const proofDir = artifact("private-live-proof");
  return [
    pnpm("private-live-proof/install", "Install dependencies", "install", "--frozen-lockfile"),
    pnpm("private-live-proof/playwright-chromium", "Install Playwright Chromium", "exec", "playwright", "install", "chromium"),
    ...deploymentServices.map((service) => ({
      id: `private-live-proof/deployment-image-${service}`,
      name: `Build the ${service} deployment image and record its runtime version`,
      run: (context) => buildDeploymentImage(context, service)
    })),
    {
      ...pnpm("private-live-proof/isolated-proof", "Run private live isolated proof", "private-live:isolated-proof"),
      env: {
        PRIVATE_LIVE_PROOF_DIR: proofDir,
        PRIVATE_LIVE_REQUIRE_CLEAN: "1",
        KEEP_PRIVATE_LIVE_STACK: "0",
        PRIVATE_LIVE_PROJECT_NAME: composeProject()
      },
      // The proof removes its own stack on SIGTERM; allow that before escalating.
      graceMs: 360_000,
      verify: () => proofIssues(proofDir)
    }
  ];
}

function releaseArtifactSteps() {
  const version = settings.releaseVersion;
  const prepare = (directory) => [process.execPath, "scripts/prepare-release.mjs", version, directory];
  return [
    { id: "release-artifacts/prepare", name: "Prepare the source archive, manifest and checksums", command: prepare(artifact("release-artifacts")) },
    { id: "release-artifacts/prepare-repeat", name: "Repeat release preparation", command: prepare(artifact("release-artifacts-repeat")) },
    { id: "release-artifacts/reproducibility", name: "Compare release artifacts and source identity", run: async () => releaseArtifactIssues(version) }
  ];
}

// Required by docs/runbooks/REPRODUCIBLE_RAILWAY_RELEASE.md; not part of the Actions workflows.
function auditSteps() {
  const report = artifact("dependency-audit/pnpm-audit.json");
  return [{
    ...pnpm("dependency-audit/production", "Audit production dependencies", "audit", "--prod", "--json"),
    stdoutFile: report,
    verify: () => auditIssues(report)
  }];
}

// Replaces GitHub default setup for one language. Uploading SARIF and triaging alerts against
// dismissed ones stays with the controller that holds GitHub credentials.
function codeqlSteps(language) {
  const config = codeqlLanguages[language];
  const sourceDir = join(settings.scratch, "source");
  const database = join(settings.scratch, "database");
  const sarifPath = artifact(`codeql/${language}.sarif`);
  const category = `/language:${language}`;
  return [
    {
      id: `codeql-${language}/export`,
      name: "Export HEAD for analysis",
      run: async ({ exec }) => {
        mkdirSync(settings.scratch, { mode: 0o700 });
        mkdirSync(sourceDir);
        const archive = join(settings.scratch, "source.tar");
        if ((await exec(["git", "archive", "--format=tar", `--output=${archive}`, source.headSha])).code !== 0) return ["git archive failed"];
        if ((await exec(["tar", "-x", "-f", archive, "-C", sourceDir])).code !== 0) return ["Could not unpack the source archive"];
        rmSync(archive);
        return exportIssues(sourceDir);
      }
    },
    {
      id: `codeql-${language}/database`,
      name: `Create the ${language} CodeQL database`,
      run: async ({ exec }) => {
        const created = await exec([settings.codeqlBinary, "database", "create", database, `--language=${language}`, ...config.build,
          `--source-root=${sourceDir}`, `--working-dir=${sourceDir}`, "--threads=0"]);
        return created.code === 0 ? [] : [`codeql database create exited with ${created.code ?? created.signal}`];
      }
    },
    {
      id: `codeql-${language}/analyze`,
      name: `Analyze with ${config.suite}`,
      run: async ({ exec }) => {
        mkdirSync(dirname(sarifPath), { recursive: true });
        const analyzed = await exec([settings.codeqlBinary, "database", "analyze", database, config.suite, "--format=sarifv2.1.0",
          `--output=${sarifPath}`, `--sarif-category=${category}`, "--threads=0"]);
        const issues = analyzed.code === 0 ? [] : [`codeql database analyze exited with ${analyzed.code ?? analyzed.signal}`];
        return [...issues, ...sarifIssues(language, category, sarifPath)];
      }
    }
  ];
}

function pnpm(id, name, ...args) {
  return { id, name, command: ["pnpm", ...args] };
}

async function startPostgres({ exec, wait, phase }) {
  const name = `forgetbase-lci-${runId}-postgres`;
  const started = await exec(["docker", "run", "-d", "--name", name, "--label", `${runLabel}=${runId}`,
    "--env", "POSTGRES_DB=forgetbase", "--env", "POSTGRES_USER=forgetbase", "--env", "POSTGRES_PASSWORD=forgetbase_dev",
    "--publish", "127.0.0.1::5432", "--health-cmd", "pg_isready -U forgetbase -d forgetbase",
    "--health-interval", "10s", "--health-timeout", "5s", "--health-retries", "5", postgresImage], { capture: true });
  if (started.code !== 0) return ["The PostgreSQL service container did not start"];
  const port = (await exec(["docker", "port", name, "5432/tcp"], { capture: true })).stdout.match(/^127\.0\.0\.1:(\d+)$/m)?.[1];
  if (!port) return ["The PostgreSQL service was not published on a loopback port"];
  for (;;) {
    const health = await exec(["docker", "inspect", "--format", "{{.State.Health.Status}}", name], { capture: true });
    const status = health.stdout.trim();
    if (health.code !== 0) return ["Could not inspect the PostgreSQL service"];
    if (status === "healthy") break;
    if (status === "unhealthy") return ["The PostgreSQL service became unhealthy"];
    await wait(2_000);
  }
  phase.env.TEST_DATABASE_URL = `postgres://forgetbase:forgetbase_dev@127.0.0.1:${port}/forgetbase`;
  return [];
}

async function buildDeploymentImage({ exec }, service) {
  const directory = artifact("deployment-image-proof");
  mkdirSync(directory, { recursive: true });
  const image = deploymentImage(service);
  const build = await exec(["docker", "build", "--progress=plain", "--file", `infra/docker/railway-${service}.Dockerfile`,
    "--build-arg", `FORGETBASE_SOURCE_REVISION=${source.headSha}`,
    "--build-arg", `FORGETBASE_SOURCE_DATE_EPOCH=${source.sourceDateEpoch}`,
    "--build-arg", "FORGETBASE_RELEASE_VERSION=0.0.0-proof",
    "--build-arg", "VITE_ENABLE_RICH_EDITOR=true",
    "--label", `${runLabel}=${runId}`, "--tag", image, "."], { outputFile: join(directory, `${service}-build.log`) });
  if (build.code !== 0) return [`The ${service} deployment image did not build`];
  const issues = [];
  const runtimeFile = join(directory, `${service}-runtime.txt`);
  const [entrypoint, flag] = service === "proxy" ? ["nginx", "-v"] : ["node", "--version"];
  const runtime = await exec(["docker", "run", "--rm", "--name", `forgetbase-lci-${runId}-${service}-runtime`,
    "--label", `${runLabel}=${runId}`, "--entrypoint", entrypoint, image, flag],
  service === "proxy" ? { outputFile: runtimeFile } : { stdoutFile: runtimeFile });
  if (runtime.code !== 0 || !readFileSync(runtimeFile, "utf8").trim()) issues.push(`The ${service} runtime version was not recorded`);
  const id = await exec(["docker", "image", "inspect", "--format", "{{.Id}}", image], { capture: true });
  if (id.code === 0 && id.stdout.trim()) writeFileSync(join(directory, `${service}-image-id.txt`), id.stdout);
  else issues.push(`The ${service} image ID was not recorded`);
  if ((await exec(["docker", "image", "rm", image])).code !== 0) issues.push(`The ${service} proof image was not removed`);
  return issues;
}

function uatReportIssues(directory, mode) {
  const report = readJson(join(directory, "public-beta-uat-report.json"));
  const label = display(join(directory, "public-beta-uat-report.json"));
  if (!isRecord(report)) return [`${label} is missing or invalid`];
  const issues = [];
  if (report.mode !== mode) issues.push(`${label} mode is ${String(report.mode)}, expected ${mode}`);
  if (report.commitSha !== source.headSha) issues.push(`${label} does not identify HEAD`);
  if (!Array.isArray(report.checks) || report.checks.length === 0 || !report.checks.every((check) => isRecord(check) && check.status === "pass")) {
    issues.push(`${label} does not contain passing checks`);
  }
  return issues;
}

function brandingIssues(directory) {
  const report = readJson(join(directory, "api-report.json"));
  return isRecord(report) && report.status === "passed" && Array.isArray(report.checks) && report.checks.length > 0
    ? []
    : ["The branding proof did not write a passed api-report.json"];
}

function proofIssues(directory) {
  const summary = readJson(join(directory, "summary.json"));
  if (!isRecord(summary)) return ["The isolated proof did not write a valid summary.json"];
  const issues = [];
  const require = (condition, message) => {
    if (!condition) issues.push(message);
  };
  require(summary.ok === true, "summary.ok is not true");
  require(summary.candidateCommit === source.headSha, "summary.candidateCommit is not HEAD");
  require(summary.worktreeClean === true, "The proof did not record a clean worktree");
  require(summary.projectName === composeProject(), "summary.projectName is not this run's Compose project");
  const assumptions = isRecord(summary.assumptions) ? summary.assumptions : {};
  const expected = { isolatedComposeProject: true, syntheticCorpusOnly: true, repositoryVisibilityChanged: false, tagOrReleaseCreated: false, stackKept: false };
  for (const [key, value] of Object.entries(expected)) require(assumptions[key] === value, `summary.assumptions.${key} must be ${value}`);
  const stackCleanup = isRecord(summary.cleanup) ? summary.cleanup : {};
  require(stackCleanup.attempted === true && stackCleanup.cleanedUp === true && stackCleanup.stackKept === false, "The proof did not remove its stack");
  const steps = Array.isArray(summary.steps) ? summary.steps.filter(isRecord) : [];
  for (const step of steps) require(step.ok === true, `Proof step failed: ${String(step.name)}`);
  for (const name of requiredProofSteps) require(steps.some((step) => step.name === name), `Proof step missing: ${name}`);
  for (const role of ["admin", "reader"]) issues.push(...uatReportIssues(join(directory, `uat-${role}`), "release"));
  return issues;
}

function releaseArtifactIssues(version) {
  const first = artifact("release-artifacts");
  const second = artifact("release-artifacts-repeat");
  const archive = `forgetbase-${version}-source.tar.gz`;
  const expected = [archive, "SHA256SUMS", "release-manifest.json"].sort();
  for (const directory of [first, second]) {
    const names = existsSync(directory) ? readdirSync(directory).sort() : [];
    if (names.join("\n") !== expected.join("\n")) return [`${display(directory)} must contain exactly ${expected.join(", ")}`];
  }
  const issues = [];
  for (const name of expected) {
    if (!readFileSync(join(first, name)).equals(readFileSync(join(second, name)))) issues.push(`${name} is not reproducible`);
  }
  const listed = new Set();
  for (const line of lines(readFileSync(join(first, "SHA256SUMS"), "utf8"))) {
    const match = /^([a-f0-9]{64}) {2}(\S+)$/.exec(line);
    if (!match || !expected.includes(match[2]) || sha256(readFileSync(join(first, match[2]))) !== match[1]) {
      issues.push(`SHA256SUMS entry does not verify: ${line}`);
    } else {
      listed.add(match[2]);
    }
  }
  if (!listed.has(archive) || !listed.has("release-manifest.json")) issues.push("SHA256SUMS must cover the archive and manifest");
  const manifest = readJson(join(first, "release-manifest.json"));
  if (!isRecord(manifest)) return [...issues, "release-manifest.json is invalid"];
  if (manifest.release !== version) issues.push("The manifest release does not match the requested version");
  if (manifest.sourceRevision !== source.headSha) issues.push("The manifest sourceRevision is not HEAD");
  if (String(manifest.sourceDateEpoch) !== source.sourceDateEpoch) issues.push("The manifest sourceDateEpoch is not the HEAD commit time");
  if (!isRecord(manifest.buildVariables) || manifest.buildVariables.FORGETBASE_SOURCE_REVISION !== source.headSha) {
    issues.push("The manifest build variables do not identify HEAD");
  }
  if (!isRecord(manifest.sourceArchive) || manifest.sourceArchive.filename !== archive
    || manifest.sourceArchive.sha256 !== sha256(readFileSync(join(first, archive)))) {
    issues.push("The manifest does not identify the source archive");
  }
  return issues;
}

function auditIssues(path) {
  const counts = readJson(path)?.metadata?.vulnerabilities;
  if (!isRecord(counts)) return ["The audit report has no vulnerability summary"];
  const levels = ["low", "moderate", "high", "critical"];
  if (!levels.every((level) => Number.isInteger(counts[level]) && counts[level] >= 0)) return ["The audit vulnerability summary is incomplete"];
  const total = levels.reduce((sum, level) => sum + counts[level], 0);
  return total === 0 ? [] : [`${total} production vulnerabilities at low severity or above`];
}

function exportIssues(sourceDir) {
  const tree = git(["ls-tree", "-r", "-z", source.headSha]);
  if (tree.code !== 0) return ["Could not list the HEAD tree"];
  const expected = tree.stdout.split("\0").filter(Boolean)
    .map((entry) => entry.split("\t"))
    .filter(([meta]) => meta.split(" ")[1] === "blob")
    .map(([, path]) => path)
    .sort();
  const actual = listFiles(sourceDir).map((path) => relative(sourceDir, path).split(sep).join("/")).sort();
  return actual.join("\n") === expected.join("\n")
    ? []
    : [`The exported tree has ${actual.length} files; HEAD has ${expected.length}`];
}

function sarifIssues(language, category, path) {
  const report = readJson(path);
  const run = Array.isArray(report?.runs) && report.runs.length === 1 ? report.runs[0] : null;
  if (!isRecord(run)) return ["The SARIF output must contain exactly one run"];
  const issues = [];
  if (run.tool?.driver?.name !== "CodeQL") issues.push("The SARIF run was not produced by CodeQL");
  const id = run.automationDetails?.id;
  if (id !== category && id !== `${category}/`) issues.push(`The SARIF category is ${String(id)}, expected ${category}`);
  const invocations = Array.isArray(run.invocations) ? run.invocations : [];
  if (invocations.length === 0 || !invocations.every((invocation) => invocation?.executionSuccessful === true)) {
    issues.push("CodeQL did not report a successful invocation");
  }
  const extractedFiles = invocations.flatMap((invocation) => invocation?.toolExecutionNotifications ?? [])
    .filter((notification) => /\/diagnostics\/successfully-extracted-files$/.test(notification?.descriptor?.id ?? "")).length;
  if (extractedFiles === 0) issues.push("CodeQL reported no successfully extracted files");
  const results = Array.isArray(run.results) ? run.results : [];
  codeql = {
    language,
    category,
    codeqlVersion: run.tool?.driver?.semanticVersion ?? null,
    sarif: relative(evidenceDir, path).split(sep).join("/"),
    sha256: sha256(readFileSync(path)),
    extractedFiles,
    results: results.length,
    // Findings are not judged here: GitHub alert state (including dismissals) decides.
    findingsGate: "external",
    findings: results.slice(0, 500).map((result) => ({
      ruleId: result?.ruleId ?? null,
      level: result?.level ?? null,
      uri: result?.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? null,
      startLine: result?.locations?.[0]?.physicalLocation?.region?.startLine ?? null,
      fingerprints: result?.partialFingerprints ?? null
    }))
  };
  return issues;
}

function runPreflight(record, phases) {
  const fd = openSync(join(evidenceDir, record.log), "a");
  const started = Date.now();
  record.status = "running";
  record.startedAt = new Date(started).toISOString();
  const names = new Set(phases.map((phase) => phase.name));
  const usesDocker = phases.some((phase) => dockerJobs.has(phase.name));
  const language = [...names].find((name) => name.startsWith("codeql-"))?.slice("codeql-".length);
  const issues = [];
  const probe = (label, argv, expected) => {
    const outcome = runSync(argv, fd);
    const value = lines(outcome.stdout)[0] ?? "";
    host[label] = value || null;
    if (outcome.code !== 0) issues.push(`${label} is unavailable: ${display(argv.join(" "))} exited with ${outcome.code ?? outcome.error}`);
    else if (expected !== undefined && value !== expected) issues.push(`${label} must be ${expected}; found ${value || "nothing"}`);
  };
  if (language) {
    probe("node", ["node", "--version"]);
    probe("codeql", [settings.codeqlBinary, "version", "--format=terse"]);
    const required = codeqlLanguages[language].platform;
    if (required && platform() !== required) issues.push(`codeql-${language} must run on ${required}; this host is ${platform()}`);
    else if (language === "swift") probe("swift", ["swift", "--version"]);
  } else {
    probe("node", ["node", "--version"], `v${nodeVersion}`);
    probe("pnpm", ["pnpm", "--version"], pnpmVersion);
  }
  if (usesDocker) {
    probe("docker", ["docker", "version", "--format", "{{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}"]);
    probe("compose", ["docker", "compose", "version", "--short"]);
    if (names.has("private-live-proof")) probe("buildx", ["docker", "buildx", "version"]);
  }
  let refused = false;
  if (issues.length === 0 && usesDocker) {
    const existing = readbackResources(fd);
    if (!existing.verified) issues.push("Could not list Docker resources for this run ID");
    else if (existing.found.length > 0) {
      refused = true;
      issues.push(`Resources for this run ID already exist (${existing.found.join(", ")}); run the cleanup job with a new evidence directory`);
    }
  }
  if (issues.length === 0 && usesDocker && existsSync(settings.dockerOwnership)) {
    refused = true;
    issues.push(`An earlier run with this run ID still owns Docker resources (${display(settings.dockerOwnership)}); run the cleanup job with a new evidence directory`);
  }
  if (issues.length === 0 && language && existsSync(settings.scratch)) {
    refused = true;
    issues.push(`${display(settings.scratch)} already exists; run the cleanup job with a new evidence directory`);
  }
  record.durationMs = Date.now() - started;
  record.issues = issues.map(display);
  record.status = issues.length ? "failed" : "passed";
  writeSync(fd, `# ${record.status}${issues.length ? `: ${record.issues.join("; ")}` : ""}\n`);
  closeSync(fd);
  report(record);
  return issues.length === 0 ? null : refused ? "refused" : "failed";
}

async function runStep(step, phase, deadline) {
  const record = step.record;
  const fd = openSync(join(evidenceDir, record.log), "a");
  const started = Date.now();
  record.status = "running";
  record.startedAt = new Date(started).toISOString();
  const exec = async (argv, options = {}) => {
    if (stopRequest) throw new Stopped();
    const outcome = await execute(argv, {
      ...options,
      fd,
      deadline,
      graceMs: step.graceMs ?? 15_000,
      env: childEnvironment({ ...phase.env, ...step.env })
    });
    if (stopRequest) throw new Stopped();
    return outcome;
  };
  const issues = [];
  try {
    if (step.command) {
      const outcome = await exec(step.command, { stdoutFile: step.stdoutFile });
      record.exitCode = outcome.code;
      if (outcome.code !== 0) issues.push(outcome.error ?? `Exited with ${outcome.code ?? outcome.signal}`);
    } else {
      issues.push(...await step.run({ exec, phase, wait: (milliseconds) => pause(milliseconds, deadline) }));
    }
    if (step.verify) issues.push(...step.verify());
  } catch (error) {
    if (!(error instanceof Stopped)) issues.push(error instanceof Error ? error.message : String(error));
  }
  record.durationMs = Date.now() - started;
  record.issues = issues.map(display);
  record.status = stopRequest ? stopRequest.status : issues.length > 0 ? "failed" : "passed";
  writeSync(fd, `# ${record.status} after ${record.durationMs} ms${issues.length ? `: ${record.issues.join("; ")}` : ""}\n`);
  closeSync(fd);
  report(record);
}

// Each command runs in its own process group so a cancel, timeout or exit reaches its descendants.
function execute(argv, { env, fd, deadline, graceMs, stdoutFile, outputFile, capture }) {
  return new Promise((resolveRun) => {
    if (Date.now() >= deadline) {
      stopRequest ??= { status: "timed-out", exitCode: 1 };
      resolveRun({ code: null, signal: null, stdout: "" });
      return;
    }
    writeSync(fd, `$ ${display(argv.join(" "))}\n`);
    const opened = [];
    const openOutput = (path) => {
      mkdirSync(dirname(path), { recursive: true });
      opened.push(openSync(path, "w"));
      return opened.at(-1);
    };
    const stdout = capture ? "pipe" : stdoutFile ? openOutput(stdoutFile) : outputFile ? openOutput(outputFile) : fd;
    const stderr = outputFile ? stdout : fd;
    let captured = "";
    let escalation = null;
    let settled = false;
    const child = spawn(argv[0], argv.slice(1), { cwd: root, env, detached: true, stdio: ["ignore", stdout, stderr] });
    const stop = () => {
      signalGroup(child.pid, "SIGTERM");
      escalation ??= setTimeout(() => signalGroup(child.pid, "SIGKILL"), graceMs);
    };
    const timer = setTimeout(() => {
      stopRequest ??= { status: "timed-out", exitCode: 1 };
      writeSync(fd, "# job deadline reached; stopping the check\n");
      stop();
    }, deadline - Date.now());
    active = { stop };
    child.stdout?.on("data", (chunk) => {
      writeSync(fd, chunk);
      if (captured.length < 1_048_576) captured += chunk.toString();
    });
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(escalation);
      active = null;
      signalGroup(child.pid, "SIGKILL");
      for (const handle of opened) closeSync(handle);
      if (outcome.error) writeSync(fd, `${outcome.error}\n`);
      resolveRun({ ...outcome, stdout: captured });
    };
    child.once("error", (error) => settle({ code: null, signal: null, error: `Could not start ${argv[0]}: ${error.message}` }));
    child.once("close", (code, signal) => settle({ code, signal }));
  });
}

function signalGroup(pid, signal) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already exited.
  }
}

function requestStop(signal, exitCode) {
  if (stopRequest) return;
  stopRequest = { status: "cancelled", signal, exitCode };
  process.stderr.write(`local-ci: ${signal} received; stopping and cleaning up\n`);
  active?.stop();
}

async function pause(milliseconds, deadline) {
  const until = Math.min(Date.now() + milliseconds, deadline);
  while (Date.now() < until) {
    if (stopRequest) throw new Stopped();
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(200, until - Date.now())));
  }
  if (Date.now() >= deadline) stopRequest ??= { status: "timed-out", exitCode: 1 };
  if (stopRequest) throw new Stopped();
}

function halted() {
  return stopRequest !== null || checks.some((check) => ["failed", "timed-out", "cancelled"].includes(check.status));
}

// Removes containers and images labelled with this run ID and, for the proof, its exact Compose project.
function removeRunResources({ project, required = true }) {
  const fd = cleanupLog();
  cleanup.attempted = true;
  const act = (argv) => {
    const outcome = runSync(argv, fd, { timeoutMs: 10 * 60_000 });
    cleanup.actions.push({ command: display(argv.join(" ")), exitCode: outcome.code ?? null });
    if (outcome.code !== 0) cleanup.ok = false;
  };
  const listed = (argv) => {
    const outcome = runSync(argv, fd);
    if (outcome.code !== 0) cleanup.ok = false;
    return outcome.code === 0 ? lines(outcome.stdout) : [];
  };
  if (runSync(["docker", "version", "--format", "{{.Client.Version}}"], fd).error) {
    // A run that never used Docker has nothing to remove. A Docker-backed one cannot be cleaned here.
    if (required) {
      cleanup.ok = false;
      cleanup.verified = false;
      cleanup.remaining.push("Docker resources for this run ID: the Docker CLI is unavailable, so they were neither removed nor verified");
    }
    return;
  }
  for (const name of listed(["docker", "ps", "-a", "--filter", `label=${runLabel}=${runId}`, "--format", "{{.Names}}"])) {
    act(["docker", "rm", "--force", "--volumes", name]);
  }
  if (!project) return;
  act(["docker", "compose", "--project-name", composeProject(), ...composeFiles, "down", "--volumes", "--remove-orphans", "--rmi", "local"]);
  for (const id of listed(["docker", "image", "ls", "--filter", `label=${runLabel}=${runId}`, "--format", "{{.ID}}"])) {
    act(["docker", "image", "rm", id]);
  }
  for (const image of deploymentServices.map(deploymentImage)) {
    if (imageExists(image, fd) === true) act(["docker", "image", "rm", image]);
  }
}

function removeScratch() {
  if (!existsSync(settings.scratch)) return;
  cleanup.attempted = true;
  try {
    rmSync(settings.scratch, { recursive: true, force: true });
  } catch {
    // Reported below.
  }
  const remains = existsSync(settings.scratch);
  cleanup.actions.push({ command: `remove ${display(settings.scratch)}`, exitCode: remains ? 1 : 0 });
  if (remains) {
    cleanup.ok = false;
    cleanup.remaining.push(`directory ${display(settings.scratch)}`);
  }
}

function verifyCleanup({ required = true } = {}) {
  const readback = readbackResources(cleanupLog(), { required });
  cleanup.verified &&= readback.verified;
  cleanup.remaining.push(...readback.found);
  cleanup.ok &&= readback.verified && readback.found.length === 0;
  if (cleanup.ok && existsSync(settings.dockerOwnership)) {
    rmSync(settings.dockerOwnership, { force: true });
    const remains = existsSync(settings.dockerOwnership);
    cleanup.actions.push({ command: `release ${display(settings.dockerOwnership)}`, exitCode: remains ? 1 : 0 });
    if (remains) {
      cleanup.ok = false;
      cleanup.remaining.push(`ownership record ${display(settings.dockerOwnership)}`);
    }
  }
}

function readbackResources(fd, { required = true } = {}) {
  const found = new Set();
  let verified = true;
  const version = runSync(["docker", "version", "--format", "{{.Client.Version}}"], fd);
  // Without a Docker CLI, only a run with no Docker ownership record can be treated as having none.
  if (version.error) return { verified: !required, found: [] };
  const project = composeProject();
  const list = (kind, args) => {
    const outcome = runSync(["docker", ...args], fd);
    if (outcome.code !== 0) verified = false;
    else for (const name of lines(outcome.stdout)) found.add(`${kind} ${name}`);
  };
  list("container", ["ps", "-a", "--filter", `label=${runLabel}=${runId}`, "--format", "{{.Names}}"]);
  list("container", ["ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Names}}"]);
  list("volume", ["volume", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"]);
  list("network", ["network", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"]);
  list("image", ["image", "ls", "--filter", `label=${runLabel}=${runId}`, "--format", "{{.ID}}"]);
  const built = composeBuiltImages(fd);
  if (built === null) verified = false;
  for (const image of [...(built ?? []), ...deploymentServices.map(deploymentImage)]) {
    const exists = imageExists(image, fd);
    if (exists === null) verified = false;
    else if (exists) found.add(`image ${image}`);
  }
  return { verified, found: [...found] };
}

// Images Compose builds for the proof project; `down --rmi local` removes exactly these.
function composeBuiltImages(fd) {
  const project = composeProject();
  // Not logged: the rendered config can include values from a developer's .env file.
  const outcome = runSync(["docker", "compose", "--project-name", project, ...composeFiles, "config", "--format", "json"], fd, { logStdout: false });
  if (outcome.code !== 0) return null;
  try {
    const services = JSON.parse(outcome.stdout).services ?? {};
    return Object.entries(services)
      .filter(([name, service]) => service?.build && (!service.image || service.image === `${project}-${name}`))
      .map(([name]) => `${project}-${name}`);
  } catch {
    return null;
  }
}

function imageExists(image, fd) {
  const outcome = runSync(["docker", "image", "inspect", "--format", "{{.Id}}", image], fd);
  if (outcome.code === 0) return true;
  return /no such image/i.test(outcome.stderr) ? false : null;
}

function cleanupLog() {
  if (cleanupFd === null) {
    cleanup.log = "cleanup.log";
    cleanupFd = openSync(join(evidenceDir, cleanup.log), "a");
  }
  return cleanupFd;
}

function finish(status, exitCode, reason) {
  if (finished) return;
  finished = true;
  process.exitCode = exitCode;
  if (!evidenceDir) {
    process.stderr.write(`local-ci: ${status}: ${reason}\n`);
    return;
  }
  if (cleanupFd !== null) closeSync(cleanupFd);
  const finishedAt = Date.now();
  const manifest = writeManifest();
  const result = {
    schemaVersion: 1,
    app: "forgetbase",
    job,
    runId,
    status,
    ok: status === "passed",
    gating: Boolean(source && !source.allowDirty),
    exitCode,
    ...(reason ? { reason: display(reason) } : {}),
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    source,
    host,
    settings: {
      timeoutSeconds: settings.timeoutOverride ?? null,
      releaseVersion: settings.releaseVersion ?? null
    },
    checks,
    ...(codeql ? { codeql } : {}),
    cleanup,
    evidence: { manifest: "evidence-manifest.json", manifestSha256: manifest.sha256, files: manifest.files }
  };
  const temporary = join(evidenceDir, `.result.json.${process.pid}.tmp`);
  const handle = openSync(temporary, "w");
  writeSync(handle, `${JSON.stringify(result, null, 2)}\n`);
  fsyncSync(handle);
  closeSync(handle);
  renameSync(temporary, join(evidenceDir, "result.json"));
  process.stdout.write(`local-ci: ${job} ${status}; evidence ${evidenceDir}\n`);
  if (reason && status !== "passed") process.stderr.write(`local-ci: ${display(reason)}\n`);
}

function writeManifest() {
  const files = listFiles(evidenceDir)
    .map((path) => ({ path, name: relative(evidenceDir, path).split(sep).join("/") }))
    .filter(({ name }) => name !== "result.json" && name !== "evidence-manifest.json" && !/^\.result\.json\.\d+\.tmp$/.test(name))
    .map(({ path, name }) => {
      const content = readFileSync(path);
      return { path: name, size: content.length, sha256: sha256(content) };
    });
  const text = `${JSON.stringify({ schemaVersion: 1, runId, files }, null, 2)}\n`;
  writeFileSync(join(evidenceDir, "evidence-manifest.json"), text);
  return { sha256: sha256(Buffer.from(text)), files: files.length };
}

function addCheck(step) {
  const record = {
    id: step.id,
    name: step.name,
    status: "not-run",
    command: step.command ? display(step.command.join(" ")) : null,
    log: `checks/${String(checks.length).padStart(2, "0")}-${step.id.replaceAll("/", "-")}.log`,
    exitCode: null,
    startedAt: null,
    durationMs: null,
    issues: []
  };
  checks.push(record);
  return record;
}

function report(record) {
  process.stdout.write(`local-ci: ${record.status.padEnd(9)} ${record.id} (${(record.durationMs / 1_000).toFixed(1)} s)\n`);
  if (record.status === "passed") return;
  const text = readFileSync(join(evidenceDir, record.log), "utf8");
  process.stderr.write(`${text.split("\n").slice(-30).join("\n")}\n`);
}

function runSync(argv, fd, { timeoutMs = 120_000, logStdout = true } = {}) {
  if (fd !== undefined) writeSync(fd, `$ ${display(argv.join(" "))}\n`);
  const outcome = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    env: childEnvironment(),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024
  });
  if (fd !== undefined) {
    if (logStdout && outcome.stdout) writeSync(fd, outcome.stdout);
    if (outcome.stderr) writeSync(fd, outcome.stderr);
    if (outcome.error) writeSync(fd, `${outcome.error.message}\n`);
  }
  return { code: outcome.status, stdout: outcome.stdout ?? "", stderr: outcome.stderr ?? "", error: outcome.error?.message };
}

function git(args) {
  return runSync(["git", "-C", root, ...args]);
}

function childEnvironment(extra = {}) {
  const environment = { CI: "true" };
  for (const name of inheritedEnvironment) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  for (const [name, value] of Object.entries(extra)) {
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function display(value) {
  let text = String(value);
  const replacements = [
    [evidenceDir, "$LOCAL_CI_EVIDENCE_DIR"],
    [settings.workRoot, "$LOCAL_CI_WORK_DIR"],
    [settings.scratchRoot, "$LOCAL_CI_SCRATCH_DIR"],
    [process.execPath, "node"],
    [`${root}${sep}`, ""],
    [root, "."]
  ];
  for (const [from, to] of replacements) if (from) text = text.split(from).join(to);
  return text;
}

function artifact(path) {
  return join(evidenceDir, "artifacts", path);
}

function composeProject() {
  return `forgetbase-lci-${runId}-live`;
}

function deploymentImage(service) {
  return `forgetbase-proof-${runId}-${service}`;
}

function resolveThroughExisting(path) {
  const missing = [];
  let current = path;
  while (!existsSync(current) && dirname(current) !== current) {
    missing.unshift(basename(current));
    current = dirname(current);
  }
  return join(realpathSync(current), ...missing);
}

function isWithin(path, parent) {
  return Boolean(parent) && (path === parent || path.startsWith(`${parent}${sep}`));
}

function safeRealpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function lines(text) {
  return String(text).split("\n").map((line) => line.trim()).filter(Boolean);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
