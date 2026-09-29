import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync,
  symlinkSync, writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Strongest boundary without a Docker daemon: the real entrypoint, real Git checkouts and the
// real release preparation script. pnpm and docker are stateful executables at the process
// boundary; real Docker, browser and database behaviour is proven by the Linux runner.
// Failure cases: an unsafe run ID or evidence path reaches Docker names or the checkout; a
// stale or mismatched SHA is certified; credentials in the caller or checkout reach checks or
// evidence; PostgreSQL tests silently skip without TEST_DATABASE_URL; a green exit without its
// evidence passes; checks continue after a failure; a cancelled or timed-out run leaves its
// database or reports success; cleanup removes another run's resources; the isolated proof
// exits 0 with a failing, incomplete or foreign summary; release artifacts do not identify HEAD;
// CodeQL scans ignored local files or accepts a foreign, empty or unsuccessful analysis.

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const packageManager = JSON.parse(readFileSync(join(scriptsDir, "../package.json"), "utf8")).packageManager as string;
const canary = "canary-credential-7f3a9c";
const runId = "run-0123abcd";
const project = `forgetbase-lci-${runId}-live`;
const postgresUrl = "postgres://forgetbase:forgetbase_dev@127.0.0.1:55432/forgetbase";
const postgresImage = "pgvector/pgvector:pg17@sha256:d2ef61f42ef767baa5a1475393303cc235bcd92febd9d7014eddb48b41f3bad0";
const unrelated = {
  containers: ["unrelated-postgres", "forgetbase-lci-run-0123abcd-live-x-live-api-1"],
  images: ["forgetbase-proof-run-0123abcd-x-api"]
};
// The required Actions `Verify` job at 41f2b64, in order. Changing this list changes the merge gate.
const verifyCommands = [
  "pnpm install --frozen-lockfile",
  "pnpm typecheck",
  "pnpm build",
  "pnpm web:bundle-budget",
  "pnpm public-beta:check",
  "pnpm security:check-deployment-defaults",
  "pnpm exec playwright install chromium",
  "pnpm test:uat",
  "pnpm --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings",
  "docker compose -f compose.yaml config --quiet",
  "docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet",
  "docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet",
  "pnpm openapi:check",
  "pnpm claims:lint",
  "pnpm contracts:check",
  "pnpm exec tsx scripts/verify-branding.ts",
  "pnpm test"
];
const proofSteps = [
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
const completeSummary = {
  ok: true,
  candidateCommit: "@COMMIT@",
  worktreeClean: true,
  projectName: "@PROJECT@",
  assumptions: {
    isolatedComposeProject: true, syntheticCorpusOnly: true, repositoryVisibilityChanged: false,
    tagOrReleaseCreated: false, stackKept: false
  },
  steps: proofSteps.map((name) => ({ name, ok: true, status: 0 })),
  cleanup: { attempted: true, cleanedUp: true, stackKept: false }
};

type Fixture = { base: string; repo: string; bin: string; state: string; evidence: string; head: string };
type Summary = typeof completeSummary;
type Result = {
  status: string; ok: boolean; gating: boolean; runId: string; job: string; reason?: string;
  source: { headSha: string; expectedSha: string | null; final?: { clean: boolean } };
  checks: Array<{ id: string; status: string; log: string; issues: string[] }>;
  cleanup: { ok: boolean };
  evidence: { manifest: string; manifestSha256: string };
};

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("portable CI entrypoint", () => {
  const refusals: Array<[string, (fixture: Fixture) => { args?: string[]; env?: Record<string, string | undefined>; recorded: boolean }]> = [
    ["a missing job", () => ({ args: [], recorded: false })],
    ["an unknown job", () => ({ args: ["deploy"], recorded: false })],
    ["an extra argument", () => ({ args: ["verify", "--skip"], recorded: false })],
    ["a missing run ID", () => ({ env: { LOCAL_CI_RUN_ID: undefined }, recorded: false })],
    ...["UPPERCASE-run-1", "../escape-run", "short", "run id 0001", "run-0001-", "run_0001_id", "a".repeat(64)]
      .map((id): [string, () => { env: Record<string, string>; recorded: boolean }] =>
        [`run ID ${JSON.stringify(id)}`, () => ({ env: { LOCAL_CI_RUN_ID: id }, recorded: false })]),
    ["a relative evidence directory", () => ({ env: { LOCAL_CI_EVIDENCE_DIR: "evidence" }, recorded: false })],
    ["an evidence directory inside the checkout", (fixture) =>
      ({ env: { LOCAL_CI_EVIDENCE_DIR: join(fixture.repo, "work/evidence") }, recorded: false })],
    ["an evidence path that resolves into the checkout", (fixture) => {
      symlinkSync(join(fixture.repo, "packages"), join(fixture.base, "link"));
      return { env: { LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "link/evidence") }, recorded: false };
    }],
    ["a non-empty evidence directory", (fixture) => {
      mkdirSync(fixture.evidence);
      writeFileSync(join(fixture.evidence, "previous.json"), "{}\n");
      return { recorded: false };
    }],
    ["a malformed source SHA", () => ({ env: { LOCAL_CI_SOURCE_SHA: "HEAD" }, recorded: true })],
    ["a source SHA that is not HEAD", () => ({ env: { LOCAL_CI_SOURCE_SHA: "0".repeat(40) }, recorded: true })],
    ["a dirty worktree", (fixture) => {
      writeFileSync(join(fixture.repo, "untracked.txt"), "not committed\n");
      return { recorded: true };
    }],
    ["dirty mode for a release check", (fixture) => {
      writeFileSync(join(fixture.repo, "untracked.txt"), "not committed\n");
      return { args: ["release-check"], env: { LOCAL_CI_ALLOW_DIRTY: "1" }, recorded: true };
    }],
    ["dirty mode with a certified SHA", (fixture) =>
      ({ env: { LOCAL_CI_ALLOW_DIRTY: "1", LOCAL_CI_SOURCE_SHA: fixture.head }, recorded: true })],
    ["credentials persisted in a remote URL", (fixture) => {
      git(fixture, "remote", "add", "origin", `https://x-access-token:${canary}@github.com/example/forgetbase.git`);
      return { recorded: true };
    }],
    ["a persisted authorization header", (fixture) => {
      git(fixture, "config", "http.https://github.com/.extraheader", `AUTHORIZATION: basic ${canary}`);
      return { recorded: true };
    }]
  ];

  it.each(refusals)("refuses %s before running any check", (_name, setup) => {
    const fixture = createFixture();
    const { args = ["verify"], env = {}, recorded } = setup(fixture);
    const run = runEntry(fixture, args, env);

    expect(run.status, run.stderr).toBe(2);
    expect(calls(fixture)).toEqual([]);
    expect(`${run.stdout}${run.stderr}`).not.toContain(canary);
    expect(existsSync(join(fixture.repo, "packages/evidence"))).toBe(false);
    if (recorded) {
      const result = readResult(fixture);
      expect(result).toMatchObject({ status: "refused", ok: false, runId, job: args[0] });
      expect(result.reason).toBeTruthy();
      expect(evidenceText(fixture)).not.toContain(canary);
    } else if (existsSync(fixture.evidence)) {
      expect(readdirSync(fixture.evidence).filter((name) => name !== "previous.json")).toEqual([]);
    }
  });

  it("refuses a checkout without Git metadata", () => {
    const fixture = createFixture({ git: false });
    const run = runEntry(fixture, ["verify"]);

    expect(run.status, run.stderr).toBe(2);
    expect(calls(fixture)).toEqual([]);
    expect(readResult(fixture)).toMatchObject({ status: "refused", ok: false });
  });

  it("runs the Verify sequence against its own database with complete evidence and no caller credentials", () => {
    const fixture = createFixture();
    const credentials = { GH_TOKEN: canary, GITHUB_TOKEN: canary, NPM_TOKEN: canary, AWS_SECRET_ACCESS_KEY: canary };
    const run = runEntry(fixture, ["verify"], { LOCAL_CI_SOURCE_SHA: fixture.head, ...credentials });

    expect(run.status, run.stderr).toBe(0);
    const invoked = calls(fixture);
    expect(invoked.map((call) => call.command).filter((command) => verifyCommands.includes(command))).toEqual(verifyCommands);
    expect(invoked.some((call) => call.command.startsWith("docker run -d ") && call.command.endsWith(` ${postgresImage}`))).toBe(true);
    for (const call of invoked) {
      expect([...call.env.keys()].filter((name) => name in credentials)).toEqual([]);
      expect([...call.env.values()].join("\n")).not.toContain(canary);
    }
    for (const command of verifyCommands) {
      const call = invoked.find((candidate) => candidate.command === command)!;
      expect(call.env.get("TEST_DATABASE_URL"), command).toBe(postgresUrl);
      expect(call.env.get("VITE_ENABLE_RICH_EDITOR"), command).toBe("true");
      expect(call.env.get("CI"), command).toBe("true");
    }

    const result = readResult(fixture);
    expect(result).toMatchObject({ status: "passed", ok: true, gating: true, runId, job: "verify" });
    expect(result.source).toMatchObject({ headSha: fixture.head, expectedSha: fixture.head, final: { clean: true } });
    expect(result.cleanup.ok).toBe(true);
    for (const check of result.checks) {
      expect(check.status, check.id).toBe("passed");
      expect(existsSync(join(fixture.evidence, check.log)), check.log).toBe(true);
    }
    expect(existsSync(join(fixture.evidence, "artifacts/public-beta-uat/public-beta-uat-report.json"))).toBe(true);
    expect(existsSync(join(fixture.evidence, "artifacts/branding-proof/api-report.json"))).toBe(true);
    expectVerifiedManifest(fixture, result);
    expect(`${run.stdout}${run.stderr}${evidenceText(fixture)}`).not.toContain(canary);
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  it.each([
    ["a failing UAT run", "fail_on='pnpm test:uat'", "verify/public-beta-uat"],
    ["a UAT run that exits 0 without its report", "uat_writes_nothing=1", "verify/public-beta-uat"],
    ["a branding proof that exits 0 without a passed report", "branding_status=failed", "verify/branding-proof"]
  ])("fails fast on %s and still removes the database", (_name, config, failedCheck) => {
    const fixture = createFixture();
    writeFileSync(join(fixture.state, "config"), `${config}\n`);
    const run = runEntry(fixture, ["verify"]);

    expect(run.status, run.stderr).toBe(1);
    const result = readResult(fixture);
    expect(result).toMatchObject({ status: "failed", ok: false });
    const index = result.checks.findIndex((check) => check.id === failedCheck);
    expect(result.checks[index]?.status).toBe("failed");
    expect(result.checks.slice(index + 1).map((check) => check.status)).toEqual(
      result.checks.slice(index + 1).map(() => "not-run")
    );
    expect(calls(fixture).some((call) => call.command === "pnpm test")).toBe(false);
    expect(result.cleanup.ok).toBe(true);
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  it("fails a run whose checks modify the checkout", () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.state, "config"), "dirty_on='pnpm build'\n");
    const run = runEntry(fixture, ["verify"]);

    expect(run.status, run.stderr).toBe(1);
    const result = readResult(fixture);
    expect(result).toMatchObject({ status: "failed", ok: false, source: { final: { clean: false } } });
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  it("marks an explicitly dirty verify run as non-gating", () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.repo, "untracked.txt"), "local experiment\n");
    const run = runEntry(fixture, ["verify"], { LOCAL_CI_ALLOW_DIRTY: "1" });

    expect(run.status, run.stderr).toBe(0);
    expect(readResult(fixture)).toMatchObject({ status: "passed", ok: true, gating: false });
  }, 60_000);

  it.each([
    ["SIGTERM", {}, 143, "cancelled"],
    ["the job deadline", { LOCAL_CI_JOB_TIMEOUT_SECONDS: "5" }, 1, "timed-out"]
  ] as const)("stops the running check group on %s and cleans up exactly", async (_name, env, exitCode, status) => {
    const fixture = createFixture();
    writeFileSync(join(fixture.state, "config"), "sleep_on='pnpm build'\n");
    const child = spawn("bash", [join(fixture.repo, "scripts/local-ci.sh"), "verify"], {
      cwd: fixture.repo,
      env: entryEnv(fixture, env),
      stdio: "ignore"
    });
    const exited = new Promise<number | null>((resolveExit) => child.once("exit", (code) => resolveExit(code)));
    const sleeping = await waitForFile(join(fixture.state, "sleeping.pid"), 30_000);
    if (status === "cancelled") child.kill("SIGTERM");

    expect(await exited).toBe(exitCode);
    const result = readResult(fixture);
    expect(result).toMatchObject({ status, ok: false });
    const index = result.checks.findIndex((check) => check.id === "verify/build");
    expect(result.checks[index]?.status).toBe(status);
    expect(new Set(result.checks.slice(index + 1).map((check) => check.status))).toEqual(new Set(["not-run"]));
    expect(isAlive(Number(readFileSync(sleeping, "utf8")))).toBe(false);
    expect(result.cleanup.ok).toBe(true);
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  it.each([
    ["accepts a complete summary", (summary: Summary) => summary, "", 0],
    ["rejects ok=false", (summary: Summary) => ({ ...summary, ok: false }), "", 1],
    ["rejects incomplete cleanup", (summary: Summary) => ({ ...summary, cleanup: { ...summary.cleanup, cleanedUp: false } }), "", 1],
    ["rejects another commit", (summary: Summary) => ({ ...summary, candidateCommit: "f".repeat(40) }), "", 1],
    ["rejects another Compose project", (summary: Summary) => ({ ...summary, projectName: "forgetbase-proof-1-2" }), "", 1],
    ["rejects a kept stack", (summary: Summary) => ({ ...summary, assumptions: { ...summary.assumptions, stackKept: true } }), "", 1],
    ["rejects a failed step", (summary: Summary) => ({ ...summary, steps: summary.steps.map((step, index) => index === 0 ? { ...step, ok: false } : step) }), "", 1],
    ["rejects a missing reader UAT step", (summary: Summary) => ({ ...summary, steps: summary.steps.filter((step) => !step.name.includes("reader")) }), "", 1],
    ["rejects a missing reader UAT report", (summary: Summary) => summary, "proof_missing_uat=reader", 1],
    ["rejects a missing summary", () => null, "", 1]
  ] as const)("private-live-proof %s even when the proof exits 0", (_name, mutate, config, exitCode) => {
    const fixture = createFixture();
    const summary = mutate(completeSummary);
    if (summary) writeFileSync(join(fixture.state, "proof-summary.json"), JSON.stringify(summary));
    writeFileSync(join(fixture.state, "config"), `proof_leaves_resources=1\n${config}\n`);
    const run = runEntry(fixture, ["private-live-proof"], { LOCAL_CI_SOURCE_SHA: fixture.head });

    expect(run.status, run.stderr).toBe(exitCode);
    const result = readResult(fixture);
    const proof = result.checks.find((check) => check.id === "private-live-proof/isolated-proof")!;
    expect(proof.status).toBe(exitCode === 0 ? "passed" : "failed");
    expect(proof.issues.length > 0).toBe(exitCode !== 0);
    const proofCall = calls(fixture).find((call) => call.command === "pnpm private-live:isolated-proof")!;
    expect(proofCall.env.get("PRIVATE_LIVE_PROJECT_NAME")).toBe(project);
    expect(proofCall.env.get("PRIVATE_LIVE_REQUIRE_CLEAN")).toBe("1");
    expect(proofCall.env.get("KEEP_PRIVATE_LIVE_STACK")).toBe("0");
    for (const service of ["api", "worker", "web", "proxy"]) {
      for (const file of [`${service}-build.log`, `${service}-runtime.txt`]) {
        expect(existsSync(join(fixture.evidence, "artifacts/deployment-image-proof", file)), file).toBe(true);
      }
    }
    expect(result.cleanup.ok).toBe(true);
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  it("release-check produces reproducible artifacts that identify HEAD after every gate passes", () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.state, "proof-summary.json"), JSON.stringify(completeSummary));
    const run = runEntry(fixture, ["release-check"], { LOCAL_CI_SOURCE_SHA: fixture.head });

    expect(run.status, run.stderr).toBe(0);
    const result = readResult(fixture);
    expect(result).toMatchObject({ status: "passed", ok: true, gating: true, job: "release-check" });
    for (const prefix of ["verify/", "private-live-proof/", "release-artifacts/", "dependency-audit/"]) {
      expect(result.checks.filter((check) => check.id.startsWith(prefix)).length, prefix).toBeGreaterThan(0);
    }
    expect(result.checks.every((check) => check.status === "passed")).toBe(true);
    const artifacts = join(fixture.evidence, "artifacts/release-artifacts");
    const manifest = JSON.parse(readFileSync(join(artifacts, "release-manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ release: "0.0.0-local-ci", sourceRevision: fixture.head });
    const sums = readFileSync(join(artifacts, "SHA256SUMS"), "utf8").trim().split("\n");
    expect(sums).toHaveLength(2);
    for (const line of sums) {
      const [digest, file] = line.split(/\s+/);
      expect(sha256(readFileSync(join(artifacts, file!))), file).toBe(digest);
    }
    expect(existsSync(join(fixture.evidence, "artifacts/dependency-audit/pnpm-audit.json"))).toBe(true);
    expectVerifiedManifest(fixture, result);
    expectOnlyUnrelatedResources(fixture);
  }, 90_000);

  it("refuses to reuse a run ID with leftovers until cleanup removes exactly that run's resources", () => {
    const fixture = createFixture();
    const label = `dev.forgetbase.local-ci.run-id=${runId}`;
    writeFileSync(join(fixture.state, "containers", `forgetbase-lci-${runId}-postgres`), `${label}\n`);
    writeFileSync(join(fixture.state, "containers", `${project}-api-1`), `com.docker.compose.project=${project}\n`);
    writeFileSync(join(fixture.state, "images", `forgetbase-proof-${runId}-api`), `${label}\n`);
    writeFileSync(join(fixture.state, "images", `${project}-api`), "\n");

    const refused = runEntry(fixture, ["verify"]);
    expect(refused.status, refused.stderr).toBe(2);
    expect(readResult(fixture)).toMatchObject({ status: "refused" });
    expect(readdirSync(join(fixture.state, "containers"))).toHaveLength(unrelated.containers.length + 2);
    expect(calls(fixture).some((call) => /^pnpm (?!--version)/.test(call.command))).toBe(false);

    const cleanup = runEntry(fixture, ["cleanup"], { LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "cleanup-evidence") });
    expect(cleanup.status, cleanup.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture.base, "cleanup-evidence/result.json"), "utf8")))
      .toMatchObject({ status: "passed", job: "cleanup", cleanup: { ok: true } });
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  // Review r4130795404: after a hard-killed Docker-backed job, cleanup must not treat an unavailable
  // Docker CLI as proof that nothing remains. It fails closed and leaves resources for a later run.
  it("cleanup after a hard-killed Docker run fails closed without Docker, then removes exactly that run's resources", async () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.state, "config"), "sleep_on='pnpm build'\n");
    const child = spawn("bash", [join(fixture.repo, "scripts/local-ci.sh"), "verify"], {
      cwd: fixture.repo,
      env: entryEnv(fixture),
      stdio: "ignore",
      detached: true
    });
    const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
    const sleeping = await waitForFile(join(fixture.state, "sleeping.pid"), 30_000);
    process.kill(-child.pid!, "SIGKILL");
    await exited;
    try { process.kill(Number(readFileSync(sleeping, "utf8")), "SIGKILL"); } catch { /* already gone */ }
    const postgres = join(fixture.state, "containers", `forgetbase-lci-${runId}-postgres`);
    expect(existsSync(postgres)).toBe(true);
    const dockerCalls = () => calls(fixture).filter((call) => call.command.startsWith("docker ")).length;
    const before = dockerCalls();

    const withoutDocker = runEntry(fixture, ["cleanup"], {
      LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "cleanup-no-docker"),
      PATH: dockerFreePath(fixture)
    });
    expect(withoutDocker.status, withoutDocker.stderr).toBe(1);
    expect(JSON.parse(readFileSync(join(fixture.base, "cleanup-no-docker/result.json"), "utf8")))
      .toMatchObject({ status: "failed", job: "cleanup", cleanup: { ok: false, verified: false } });
    expect(existsSync(postgres)).toBe(true);
    expect(dockerCalls()).toBe(before);

    const withDocker = runEntry(fixture, ["cleanup"], { LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "cleanup-docker") });
    expect(withDocker.status, withDocker.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture.base, "cleanup-docker/result.json"), "utf8")))
      .toMatchObject({ status: "passed", job: "cleanup", cleanup: { ok: true, verified: true } });
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  // The private worker gives each run a fresh TMPDIR and deletes it at completion, but keeps
  // LOCAL_CI_WORK_DIR until an explicit prune. Docker ownership must survive the TMPDIR removal.
  it("a failed Docker cleanup keeps ownership across a new TMPDIR until recovery with Docker succeeds", () => {
    const fixture = createFixture();
    const work = join(fixture.base, "work");
    const tmp = (name: string) => { const path = join(fixture.base, name); mkdirSync(path); return path; };
    const worker = (tmpdir: string) => ({ LOCAL_CI_SCRATCH_DIR: undefined, LOCAL_CI_WORK_DIR: work, TMPDIR: tmpdir });
    mkdirSync(work);
    const postgres = `forgetbase-lci-${runId}-postgres`;
    writeFileSync(join(fixture.state, "config"), `fail_on='docker rm --force --volumes ${postgres}'\n`);
    const firstTmp = tmp("tmp-run");
    const run = runEntry(fixture, ["verify"], { ...worker(firstTmp), LOCAL_CI_SOURCE_SHA: fixture.head });
    expect(run.status, run.stderr).toBe(1);
    expect(readResult(fixture)).toMatchObject({ status: "failed", cleanup: { ok: false } });
    rmSync(firstTmp, { recursive: true, force: true });

    const noDocker = (dir: string) => runEntry(fixture, ["cleanup"], {
      ...worker(tmp(`tmp-${dir}`)), LOCAL_CI_EVIDENCE_DIR: join(fixture.base, dir), PATH: dockerFreePath(fixture)
    });
    for (const dir of ["recover-1", "recover-2"]) {
      const recovery = noDocker(dir);
      expect(recovery.status, recovery.stderr).toBe(1);
      expect(JSON.parse(readFileSync(join(fixture.base, dir, "result.json"), "utf8")))
        .toMatchObject({ status: "failed", cleanup: { ok: false, verified: false } });
    }
    expect(existsSync(join(fixture.state, "containers", postgres))).toBe(true);

    writeFileSync(join(fixture.state, "config"), "");
    const recovered = runEntry(fixture, ["cleanup"], {
      ...worker(tmp("tmp-recover-docker")), LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "recover-docker")
    });
    expect(recovered.status, recovered.stderr).toBe(0);
    expectOnlyUnrelatedResources(fixture);
    const released = noDocker("recover-after");
    expect(released.status, released.stderr).toBe(0);
  }, 90_000);

  it("cleanup reports a failed removal command even when the readback finds nothing", () => {
    const fixture = createFixture();
    const down = `docker compose --project-name ${project} -f compose.yaml -f compose.same-origin.yaml down --volumes --remove-orphans --rmi local`;
    writeFileSync(join(fixture.state, "config"), `fail_on='${down}'\n`);
    const cleanup = runEntry(fixture, ["cleanup"], { LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "cleanup-evidence") });

    expect(cleanup.status, cleanup.stderr).toBe(1);
    const result = JSON.parse(readFileSync(join(fixture.base, "cleanup-evidence/result.json"), "utf8"));
    expect(result).toMatchObject({ status: "failed", cleanup: { ok: false } });
    expect(result.cleanup.actions).toContainEqual(expect.objectContaining({ exitCode: 1 }));
    expectOnlyUnrelatedResources(fixture);
  }, 60_000);

  it("cleanup of a run that never used Docker still passes on a host without Docker", () => {
    const fixture = createFixture();
    const scratch = join(fixture.base, "scratch", `forgetbase-lci-${runId}.codeql`);
    mkdirSync(join(scratch, "database"), { recursive: true });
    const cleanup = runEntry(fixture, ["cleanup"], {
      LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "cleanup-evidence"),
      PATH: dockerFreePath(fixture)
    });

    expect(cleanup.status, cleanup.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture.base, "cleanup-evidence/result.json"), "utf8")))
      .toMatchObject({ status: "passed", job: "cleanup", cleanup: { ok: true, verified: true } });
    expect(existsSync(scratch)).toBe(false);
  }, 60_000);

  it("a completed Docker run releases its ownership, so later cleanup without Docker passes", () => {
    const fixture = createFixture();
    const run = runEntry(fixture, ["verify"], { LOCAL_CI_SOURCE_SHA: fixture.head });
    expect(run.status, run.stderr).toBe(0);
    const cleanup = runEntry(fixture, ["cleanup"], {
      LOCAL_CI_EVIDENCE_DIR: join(fixture.base, "cleanup-evidence"),
      PATH: dockerFreePath(fixture)
    });
    expect(cleanup.status, cleanup.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(fixture.base, "cleanup-evidence/result.json"), "utf8")))
      .toMatchObject({ status: "passed", cleanup: { ok: true } });
  }, 60_000);

  it("codeql scans an exact export of HEAD and leaves alert triage to the controller", () => {
    const fixture = createFixture();
    mkdirSync(join(fixture.repo, "node_modules/pkg"), { recursive: true });
    writeFileSync(join(fixture.repo, "node_modules/pkg/index.js"), "module.exports = 1;\n");
    writeFileSync(join(fixture.repo, ".env"), `FORGETBASE_API_KEY=${canary}\n`);
    writeFileSync(join(fixture.state, "codeql.sarif"), JSON.stringify(sarif({ results: 2 })));
    const run = runEntry(fixture, ["codeql-javascript-typescript"], { LOCAL_CI_SOURCE_SHA: fixture.head });

    expect(run.status, run.stderr).toBe(0);
    const scanned = readFileSync(join(fixture.state, "codeql-source.txt"), "utf8").trim().split("\n").map((path) => path.replace(/^\.\//, ""));
    expect(scanned.sort()).toEqual(git(fixture, "ls-files").split("\n").sort());
    expect(existsSync(readFileSync(join(fixture.state, "codeql-database.txt"), "utf8").trim())).toBe(false);
    const result = readResult(fixture) as Result & { codeql: Record<string, unknown> };
    expect(result).toMatchObject({ status: "passed", ok: true });
    expect(result.codeql).toMatchObject({
      language: "javascript-typescript", category: "/language:javascript-typescript", results: 2, findingsGate: "external"
    });
    const sarifPath = join(fixture.evidence, String(result.codeql.sarif));
    expect(sha256(readFileSync(sarifPath))).toBe(result.codeql.sha256);
    expect(evidenceText(fixture)).not.toContain(canary);
    expectVerifiedManifest(fixture, result);
  }, 60_000);

  it.each([
    ["another category", sarif({ category: "/language:python" })],
    ["no extracted files", sarif({ extracted: 0 })],
    ["an unsuccessful invocation", sarif({ successful: false })],
    ["no SARIF output", null]
  ])("codeql fails on SARIF with %s", (_name, content) => {
    const fixture = createFixture();
    if (content) writeFileSync(join(fixture.state, "codeql.sarif"), JSON.stringify(content));
    const run = runEntry(fixture, ["codeql-javascript-typescript"]);

    expect(run.status, run.stderr).toBe(1);
    expect(readResult(fixture)).toMatchObject({ status: "failed", ok: false });
    expect(existsSync(readFileSync(join(fixture.state, "codeql-database.txt"), "utf8").trim())).toBe(false);
  }, 60_000);

  // The proof ends with `compose down --volumes`; an override must not name a developer's stack.
  it.each(["forgetbase", "forgetbase-proof-1", "forgetbase-lci-../escape", "forgetbase-lci-"])(
    "the isolated proof refuses Compose project override %j before any command",
    (name) => {
      const base = realpathSync(mkdtempSync(join(tmpdir(), "forgetbase-proof-override-")));
      folders.push(base);
      const bin = join(base, "bin");
      mkdirSync(bin);
      for (const tool of ["git", "npx", "docker"]) writeTool(bin, tool, `echo "${tool} $*" >> '${base}/calls.log'\nexit 1\n`);
      const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/run-private-live-isolated-proof.ts"], {
        cwd: join(scriptsDir, ".."),
        encoding: "utf8",
        timeout: 60_000,
        env: {
          PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
          HOME: base,
          PRIVATE_LIVE_PROJECT_NAME: name,
          PRIVATE_LIVE_PROOF_DIR: join(base, "proof")
        }
      });

      expect(result.status).not.toBe(0);
      expect(existsSync(join(base, "calls.log"))).toBe(false);
      expect(existsSync(join(base, "proof"))).toBe(false);
    },
    60_000
  );
});

function createFixture(options: { git?: boolean } = {}): Fixture {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "forgetbase-local-ci-")));
  folders.push(base);
  const repo = join(base, "repo");
  const bin = join(base, "bin");
  const state = join(base, "state");
  for (const folder of [join(repo, "scripts"), join(repo, "packages/db/migrations"), bin, join(state, "containers"), join(state, "images"), join(base, "home"), join(base, "scratch")]) {
    mkdirSync(folder, { recursive: true });
  }
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({ name: "fixture", version: "0.1.0", private: true, packageManager })}\n`);
  writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(repo, "packages/db/migrations/001_fixture.sql"), "SELECT 1;\n");
  writeFileSync(join(repo, ".gitignore"), "node_modules/\nwork/\n.env\n");
  for (const name of ["local-ci.sh", "local-ci.mjs", "prepare-release.mjs"]) {
    copyFileSync(join(scriptsDir, name), join(repo, "scripts", name));
  }
  chmodSync(join(repo, "scripts/local-ci.sh"), 0o755);
  writeTool(bin, "node", `if [ "$#" = 1 ] && [ "$1" = --version ]; then echo v26.10.0; exit 0; fi\nexec '${process.execPath}' "$@"\n`);
  writeTool(bin, "pnpm", fakePnpm(state));
  writeTool(bin, "docker", fakeDocker(state));
  writeTool(bin, "codeql", fakeCodeql(state));
  writeFileSync(join(state, "config"), "");
  writeFileSync(join(state, "containers", unrelated.containers[0]!), "dev.forgetbase.local-ci.run-id=other-run-0001\n");
  writeFileSync(join(state, "containers", unrelated.containers[1]!), `com.docker.compose.project=${project}-x-live\n`);
  writeFileSync(join(state, "images", unrelated.images[0]!), `dev.forgetbase.local-ci.run-id=${runId}-x\n`);
  const fixture = { base, repo, bin, state, evidence: join(base, "evidence"), head: "" };
  if (options.git !== false) {
    git(fixture, "init", "--initial-branch=main");
    git(fixture, "add", ".");
    git(fixture, "-c", "user.name=Local CI Test", "-c", "user.email=local-ci@example.test", "commit", "-m", "Synthetic checkout");
    fixture.head = git(fixture, "rev-parse", "HEAD");
  }
  return fixture;
}

function fakePnpm(state: string): string {
  return `state='${state}'
. "$state/config"
call="pnpm $*"
{ printf 'CALL %s\\n' "$call"; env | LC_ALL=C sort | sed 's/^/ENV /'; } >> "$state/calls.log"
if [ "$*" = --version ]; then echo '${packageManager.replace(/^pnpm@/, "")}'; exit 0; fi
if [ "\${sleep_on:-}" = "$call" ]; then echo $$ > "$state/sleeping.pid"; sleep 60; exit 0; fi
if [ "\${fail_on:-}" = "$call" ]; then echo "synthetic failure: $call" >&2; exit 1; fi
if [ "\${dirty_on:-}" = "$call" ]; then echo stray > stray-output.txt; fi
head=$(git rev-parse HEAD)
case "$*" in
  test:uat)
    mkdir -p "$UAT_OUTPUT_DIR"
    [ "\${uat_writes_nothing:-}" = 1 ] || printf '{"mode":"public","commitSha":"%s","checks":[{"name":"login","status":"pass"}]}' "$head" > "$UAT_OUTPUT_DIR/public-beta-uat-report.json" ;;
  "exec tsx scripts/verify-branding.ts")
    mkdir -p "$BRANDING_PROOF_DIR"
    printf '{"status":"%s","checks":["defaults"]}' "\${branding_status:-passed}" > "$BRANDING_PROOF_DIR/api-report.json" ;;
  private-live:isolated-proof)
    mkdir -p "$PRIVATE_LIVE_PROOF_DIR"
    if [ -f "$state/proof-summary.json" ]; then
      sed -e "s/@COMMIT@/$head/g" -e "s/@PROJECT@/$PRIVATE_LIVE_PROJECT_NAME/g" "$state/proof-summary.json" > "$PRIVATE_LIVE_PROOF_DIR/summary.json"
    fi
    for role in admin reader; do
      [ "\${proof_missing_uat:-}" = "$role" ] && continue
      mkdir -p "$PRIVATE_LIVE_PROOF_DIR/uat-$role"
      printf '{"mode":"release","commitSha":"%s","checks":[{"name":"reader","status":"pass"}]}' "$head" > "$PRIVATE_LIVE_PROOF_DIR/uat-$role/public-beta-uat-report.json"
    done
    if [ "\${proof_leaves_resources:-}" = 1 ]; then
      echo "com.docker.compose.project=$PRIVATE_LIVE_PROJECT_NAME" > "$state/containers/$PRIVATE_LIVE_PROJECT_NAME-api-1"
      echo > "$state/images/$PRIVATE_LIVE_PROJECT_NAME-api"
    fi ;;
  "audit --prod --json")
    echo '{"advisories":{},"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}}}' ;;
esac
exit 0
`;
}

function fakeDocker(state: string): string {
  return `state='${state}'
. "$state/config"
call="docker $*"
{ printf 'CALL %s\\n' "$call"; env | LC_ALL=C sort | sed 's/^/ENV /'; } >> "$state/calls.log"
if [ "\${fail_on:-}" = "$call" ]; then echo "synthetic failure: $call" >&2; exit 1; fi
labelled() { for file in "$state/$1"/*; do [ -e "$file" ] && grep -qxF "$2" "$file" && basename "$file"; done; return 0; }
filter() { for arg in "$@"; do case "$arg" in label=*) echo "\${arg#label=}";; esac; done; }
last="\${@: -1}"
case "$1" in
  version) echo 28.3.0 ;;
  buildx) echo "github.com/docker/buildx v0.26.1" ;;
  port) echo 127.0.0.1:55432 ;;
  inspect) [ -e "$state/containers/$last" ] || { echo "No such object: $last" >&2; exit 1; }; echo healthy ;;
  rm) [ -e "$state/containers/$last" ] || { echo "No such container: $last" >&2; exit 1; }; rm -f "$state/containers/$last" ;;
  ps) labelled containers "$(filter "$@")" ;;
  run)
    shift; name=""; labels=""; detach=0; entrypoint=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -d) detach=1 ;;
        --rm) ;;
        --name) name="$2"; shift ;;
        --label) labels="$labels$2"$'\\n'; shift ;;
        --entrypoint) entrypoint="$2"; shift ;;
        --env|--publish|--health-cmd|--health-interval|--health-timeout|--health-retries) shift ;;
        *) break ;;
      esac
      shift
    done
    if [ "$detach" = 1 ]; then printf '%s' "$labels" > "$state/containers/$name"; echo 0123456789ab; exit 0; fi
    if [ "$entrypoint" = nginx ]; then echo "nginx version: nginx/1.31.0" >&2; else echo v26.10.0; fi ;;
  build)
    tag=""; labels=""
    while [ $# -gt 0 ]; do
      case "$1" in --tag) tag="$2"; shift ;; --label) labels="$labels$2"$'\\n'; shift ;; esac
      shift
    done
    printf '%s' "$labels" > "$state/images/$tag"; echo "#1 naming to $tag done" ;;
  image)
    case "$2" in
      inspect) [ -e "$state/images/$last" ] || { echo "No such image: $last" >&2; exit 1; }; echo sha256:0000000000000000000000000000000000000000000000000000000000000000 ;;
      rm) [ -e "$state/images/$last" ] || { echo "No such image: $last" >&2; exit 1; }; rm -f "$state/images/$last" ;;
      ls) labelled images "$(filter "$@")" ;;
    esac ;;
  compose)
    project=""; previous=""
    for arg in "$@"; do [ "$previous" = --project-name ] && project="$arg"; previous="$arg"; done
    case " $* " in
      *" version "*) echo 2.39.1 ;;
      *" config --format json "*) echo '{"services":{"api":{"build":{"context":"."}},"proxy":{"image":"nginx"}}}' ;;
      *" down "*)
        for name in $(labelled containers "com.docker.compose.project=$project"); do rm -f "$state/containers/$name"; done
        case " $* " in *" --rmi local "*) rm -f "$state/images/$project-api" ;; esac ;;
    esac ;;
esac
exit 0
`;
}

function fakeCodeql(state: string): string {
  return `state='${state}'
{ printf 'CALL codeql %s\\n' "$*"; env | LC_ALL=C sort | sed 's/^/ENV /'; } >> "$state/calls.log"
option() { for arg in "\${@:2}"; do case "$arg" in "$1"=*) echo "\${arg#$1=}";; esac; done; }
case "$1 $2" in
  "version "*) echo 2.27.1 ;;
  "database create")
    echo "$3" > "$state/codeql-database.txt"; mkdir -p "$3"
    (cd "$(option --source-root "$@")" && find . -type f | LC_ALL=C sort) > "$state/codeql-source.txt" ;;
  "database analyze")
    output=$(option --output "$@")
    [ -f "$state/codeql.sarif" ] && sed "s#@CATEGORY@#$(option --sarif-category "$@")#g" "$state/codeql.sarif" > "$output" ;;
esac
exit 0
`;
}

function sarif(options: { category?: string; results?: number; extracted?: number; successful?: boolean }) {
  return {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "CodeQL", semanticVersion: "2.27.1" } },
      automationDetails: { id: `${options.category ?? "@CATEGORY@"}/` },
      invocations: [{
        executionSuccessful: options.successful ?? true,
        toolExecutionNotifications: Array.from({ length: options.extracted ?? 3 }, (_, index) => ({
          descriptor: { id: "js/diagnostics/successfully-extracted-files" },
          locations: [{ physicalLocation: { artifactLocation: { uri: `file-${index}.ts` } } }]
        }))
      }],
      results: Array.from({ length: options.results ?? 0 }, (_, index) => ({
        ruleId: "js/example", level: "warning", message: { text: "synthetic" },
        locations: [{ physicalLocation: { artifactLocation: { uri: "scripts/local-ci.mjs" }, region: { startLine: index + 1 } } }],
        partialFingerprints: { primaryLocationLineHash: `hash-${index}` }
      }))
    }]
  };
}

function writeTool(bin: string, name: string, body: string): void {
  writeFileSync(join(bin, name), `#!/bin/bash\n${body}`);
  chmodSync(join(bin, name), 0o755);
}

function git(fixture: Pick<Fixture, "repo" | "base">, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: fixture.repo,
    env: { PATH: process.env.PATH, HOME: join(fixture.base, "home"), GIT_CONFIG_NOSYSTEM: "1" },
    stdio: "pipe"
  }).toString().trim();
}

function entryEnv(fixture: Fixture, env: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const merged: Record<string, string | undefined> = {
    PATH: `${fixture.bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: join(fixture.base, "home"),
    GIT_CONFIG_NOSYSTEM: "1",
    LANG: "C",
    LOCAL_CI_RUN_ID: runId,
    LOCAL_CI_EVIDENCE_DIR: fixture.evidence,
    LOCAL_CI_SCRATCH_DIR: join(fixture.base, "scratch"),
    ...env
  };
  return Object.fromEntries(Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function runEntry(fixture: Fixture, args: string[], env: Record<string, string | undefined> = {}) {
  const result = spawnSync("bash", [join(fixture.repo, "scripts/local-ci.sh"), ...args], {
    cwd: fixture.repo,
    encoding: "utf8",
    env: entryEnv(fixture, env),
    timeout: 80_000
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function calls(fixture: Fixture): Array<{ command: string; env: Map<string, string> }> {
  const path = join(fixture.state, "calls.log");
  const parsed: Array<{ command: string; env: Map<string, string> }> = [];
  for (const line of existsSync(path) ? readFileSync(path, "utf8").split("\n") : []) {
    if (line.startsWith("CALL ")) parsed.push({ command: line.slice(5), env: new Map() });
    if (line.startsWith("ENV ")) {
      const pair = line.slice(4);
      parsed.at(-1)?.env.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
    }
  }
  return parsed;
}

function readResult(fixture: Fixture): Result {
  return JSON.parse(readFileSync(join(fixture.evidence, "result.json"), "utf8")) as Result;
}

function listFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function evidenceText(fixture: Fixture): string {
  return existsSync(fixture.evidence) ? listFiles(fixture.evidence).map((file) => readFileSync(file, "utf8")).join("\n") : "";
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function expectVerifiedManifest(fixture: Fixture, result: Result): void {
  const manifestPath = join(fixture.evidence, result.evidence.manifest);
  expect(sha256(readFileSync(manifestPath))).toBe(result.evidence.manifestSha256);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: Array<{ path: string; sha256: string; size: number }> };
  const listed = new Map(manifest.files.map((file) => [file.path, file]));
  const actual = listFiles(fixture.evidence)
    .map((file) => relative(fixture.evidence, file))
    .filter((file) => file !== "result.json" && file !== result.evidence.manifest);
  expect([...listed.keys()].sort()).toEqual(actual.sort());
  for (const file of actual) {
    const content = readFileSync(join(fixture.evidence, file));
    expect(listed.get(file), file).toMatchObject({ sha256: sha256(content), size: content.length });
  }
}

// A PATH with only what scripts/local-ci.sh needs. Unlike dropping the fake bin, this cannot reach a
// real /usr/bin/docker on a Linux worker, so it truly models a host where Docker is unavailable.
function dockerFreePath(fixture: Fixture): string {
  const bin = join(fixture.base, "docker-free-bin");
  if (!existsSync(bin)) {
    mkdirSync(bin);
    for (const [name, target] of [["node", process.execPath], ["bash", which("bash")], ["dirname", which("dirname")]]) {
      symlinkSync(target, join(bin, name));
    }
  }
  return bin;
}

function which(tool: string): string {
  return execFileSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim();
}

function expectOnlyUnrelatedResources(fixture: Fixture): void {
  expect(readdirSync(join(fixture.state, "containers")).sort()).toEqual([...unrelated.containers].sort());
  expect(readdirSync(join(fixture.state, "images")).sort()).toEqual([...unrelated.images].sort());
}

async function waitForFile(path: string, timeoutMs: number): Promise<string> {
  const started = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${path}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  return path;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
