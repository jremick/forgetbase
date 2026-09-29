# Portable CI

`scripts/local-ci.sh` runs the repository's CI and release checks on any Linux host with Docker. It runs
the same commands as the GitHub Actions workflows, writes evidence outside the checkout, and removes only
the resources it created. The Actions workflows stay in place until a replacement reporter is verified.

## Prerequisites

- Linux with Bash, Git and `tar`. `codeql-swift` needs macOS instead.
- Node.js 26.10.0 and pnpm 11.7.0 first on `PATH`. The entrypoint refuses other versions. CodeQL jobs
  record the Node.js version but do not require pnpm.
- Playwright Chromium system packages. Install them once with root access:
  `pnpm exec playwright install --with-deps chromium`.
- Docker Engine with Compose v2 and Buildx for `verify`, `private-live-proof` and `release-check`.
- Network access to the npm registry, Docker Hub and, if browsers are missing, the Playwright download host.
- Loopback port 4175 free during `verify`. The public UAT static server uses that fixed port, so run one
  `verify` at a time per host.
- A clean Git checkout (a depth-1 clone is enough) with no credentials stored in `.git/config`.
- The CodeQL CLI, only for `codeql-*` jobs.

## Run

```bash
export LOCAL_CI_RUN_ID="dev-$(date +%Y%m%d%H%M%S)"
export LOCAL_CI_EVIDENCE_DIR="$HOME/forgetbase-ci/$LOCAL_CI_RUN_ID"
scripts/local-ci.sh verify
```

Read `$LOCAL_CI_EVIDENCE_DIR/result.json` for the outcome. For a quick check of uncommitted work, add
`LOCAL_CI_ALLOW_DIRTY=1`. The result is then marked `"gating": false` and certifies nothing.

| Job | Purpose | Default deadline |
|---|---|---|
| `verify` | The required `CI / Verify` job | 25 min |
| `private-live-proof` | Deployment image builds and the isolated full-stack proof | 60 min |
| `release-artifacts` | `release:prepare` twice, byte comparison, checksum and identity checks | 10 min |
| `dependency-audit` | `pnpm audit --prod`, required by the Railway release runbook | 10 min |
| `release-check` | `release-artifacts`, `dependency-audit`, `verify`, `private-live-proof`, stopping at the first failure | Per job |
| `codeql-javascript-typescript`, `codeql-actions`, `codeql-swift` | CodeQL analysis of an exact `git archive` export of `HEAD` | 60 min |
| `cleanup` | Removes this run ID's containers, Compose project, images and scratch directory | None |

## Inputs

| Variable | Required | Rule |
|---|---|---|
| `LOCAL_CI_RUN_ID` | Yes | 8–63 lowercase letters, digits or hyphens; starts and ends with a letter or digit |
| `LOCAL_CI_EVIDENCE_DIR` | Yes | Absolute path outside the checkout that does not exist yet or is empty |
| `LOCAL_CI_SOURCE_SHA` | No | Full 40-character SHA; the run is refused unless it equals `HEAD` |
| `LOCAL_CI_ALLOW_DIRTY` | No | `1` permits a dirty tree for `verify` only; refused with `LOCAL_CI_SOURCE_SHA` |
| `LOCAL_CI_JOB_TIMEOUT_SECONDS` | No | Replaces each job deadline, from 1 to 14400 |
| `LOCAL_CI_RELEASE_VERSION` | No | Semantic version for `release-artifacts`; default `0.0.0-local-ci` |
| `LOCAL_CI_CODEQL` | No | Absolute path to the CodeQL CLI; default `codeql` on `PATH` |
| `LOCAL_CI_SCRATCH_DIR` | No | Existing directory for CodeQL databases; default is the system temporary directory |

Checks receive only an allowlist of environment variables: path, home, locale, Docker client, proxy,
package cache and Playwright browser settings. Tokens in the caller's environment do not reach checks.

## Results

`result.json` is written last and atomically. The exit code alone is not the result.

- `status`: `passed`, `failed`, `timed-out`, `cancelled`, `refused` or `error`.
- `source`: `HEAD`, the verified expected SHA, and the worktree state at start and end. A check that
  changes the checkout fails the run.
- `checks`: one record per check with its status (`passed`, `failed`, `timed-out`, `cancelled` or
  `not-run`), command, exit code, duration, log path under `checks/`, and any contract issues.
- `cleanup`: removal actions and a Docker readback. Any remaining resource fails the run.
- `evidence`: the SHA-256 of `evidence-manifest.json`, which lists the size and SHA-256 of every file.
- `codeql` (CodeQL jobs): SARIF path and hash, category, extracted file count and findings.

Exit codes: `0` passed; `1` failed, timed out or errored; `2` refused before any check ran;
`129`, `130` or `143` cancelled by `SIGHUP`, `SIGINT` or `SIGTERM`.

A zero exit from a check is not enough. The entrypoint also requires its evidence:

- Public UAT writes a report for `HEAD` in public mode with passing checks.
- The branding proof writes a passed `api-report.json`.
- The isolated proof summary identifies `HEAD` and this run's Compose project. It also records a clean
  worktree, every required step as passed, removal of its own stack, and admin and reader release UAT reports.
- Release artifacts are byte-identical across two builds. Their checksums verify and their manifest identifies `HEAD`.
- The audit reports no production vulnerabilities at low severity or above.
- CodeQL SARIF has one successful CodeQL run in the expected `/language:<language>` category with
  at least one extracted file.

CodeQL findings do not fail the job. GitHub alert state, including dismissed alerts, decides them after
the SARIF is uploaded with the recorded category. The entrypoint does not upload anything.

## Resources and cancellation

Every name comes from the run ID:

- The `verify` database container `forgetbase-lci-<run-id>-postgres`, published on an ephemeral loopback port.
- The isolated proof Compose project `forgetbase-lci-<run-id>-live` and the images Compose builds for it.
- Deployment proof images `forgetbase-proof-<run-id>-<service>` and runtime probe containers.
- The CodeQL scratch directory `forgetbase-lci-<run-id>.codeql`.

Containers and images the entrypoint creates directly carry the label
`dev.forgetbase.local-ci.run-id=<run-id>`. The entrypoint refuses to start if resources for the run ID
already exist. It never prunes and never matches by name prefix.

On `SIGTERM`, `SIGINT` or `SIGHUP`, the running check's process group receives `SIGTERM`. `SIGKILL`
follows after 15 seconds, or after 6 minutes for the isolated proof, which removes its own stack first.
Cleanup then runs. A supervisor should wait at least 7 minutes before `SIGKILL`. After a `SIGKILL`,
run the `cleanup` job with the same run ID and a new evidence directory.

The workload runs with Docker socket access. Run it only for trusted source.

## Mapping from GitHub Actions

| Workflow gate | Portable equivalent |
|---|---|
| `CI / Verify` Postgres service (digest-pinned pgvector, `pg_isready` health check) | `verify/postgres-service` with the same image digest and health options |
| Job environment `VITE_ENABLE_RICH_EDITOR`, `TEST_DATABASE_URL` | Set for every `verify` check |
| Checkout with `persist-credentials: false` | Refusal of credentials stored in Git config |
| Set up pnpm 11.7.0 and Node.js 26.10.0 | Version checks in `preflight/environment` |
| Install, typecheck, build, bundle budget, UI source gate, deployment defaults | `verify/install` … `verify/deployment-security-defaults` |
| Install Playwright Chromium | `verify/playwright-chromium` (browser only; system packages are a prerequisite) |
| Public beta UAT and its artifact upload | `verify/public-beta-uat`, `artifacts/public-beta-uat/` |
| Demo corpus, three Compose configs, OpenAPI, claims, contracts | `verify/demo-corpus` … `verify/beta-contracts` |
| Branding proof and its artifact upload | `verify/branding-proof`, `artifacts/branding-proof/` |
| Test | `verify/test` |
| `timeout-minutes: 25` | 25-minute `verify` deadline |
| `Private live isolated proof` install and Chromium | `private-live-proof/install`, `private-live-proof/playwright-chromium` |
| Deployment image builds, runtime versions and artifact | `private-live-proof/deployment-image-<service>`, `artifacts/deployment-image-proof/` |
| Isolated proof (`REQUIRE_CLEAN=1`, `KEEP=0`) and artifact | `private-live-proof/isolated-proof`, `artifacts/private-live-proof/` |
| `timeout-minutes: 60` | 60-minute `private-live-proof` deadline |
| CodeQL default setup (JavaScript/TypeScript, Actions, Swift) | `codeql-<language>` SARIF with categories `/language:<language>` |

The entrypoint does not provide these. They belong to the runner, the reporter or the owner:

- Triggers, `concurrency` cancellation, artifact retention and required-check reporting.
- SARIF upload and code scanning alert triage.
- Dependabot, which is a GitHub service rather than a workflow gate.
- `github:public-beta:check` and `release-proof:collect`, which need GitHub credentials, a live demo or
  both. They read the `local-ci/*` commit statuses and uploaded CodeQL analyses for the release commit,
  so the reporter must post those exact contexts from the maintainer account.
- Signed managed-release manifests and bundles, which need the release signing key. `pnpm test` covers
  their logic with synthetic keys.
- The managed-update Docker drill in `scripts/verify-managed-updates.ts`, which stays a separately
  authorized manual proof.
- Tagging, publishing and deployment.
