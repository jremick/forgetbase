# Runtime Smoke And Leakage Report

Status: implemented; manager refresh passed running-stack smoke
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Summary

Implemented a secret-free `smoke:compose` gate that validates Compose config and then checks the running API/export/leakage path without starting or stopping containers.

The worker's first run failed against the API listening on `http://127.0.0.1:3000` because that runtime returned the JSON export shape for `format=okf&okfVersion=0.1`. The existing restricted leakage verifier failed for the same reason. This looked like a stale running API or stack mismatch, because the worktree static OpenAPI check passed and the running API reported only 65 OpenAPI paths while the current source route inventory reported 82 documented routes.

Manager integration update: the manager thread rebuilt the current `migrate` and `api` Compose images, restarted only `migrate` and `api` with the existing Postgres container/volume preserved, and reran `npx -y pnpm@11.7.0 smoke:compose`. The smoke gate now passes end to end, including OKF export and restricted leakage verification.

## Files Inspected

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/runbooks/DEPLOY_DOCKER_COMPOSE.md`
- `work/beta-execution/integration-checkpoint-2.md`
- `work/beta-execution/trust-gates-implementation-report.md`
- `work/beta-execution/demo-corpus-proof-report.md`
- `work/beta-execution/trust-gates-design.md`
- `scripts/verify-restricted-leakage.sh`
- `package.json`
- `compose.yaml`
- `compose.same-origin.yaml`
- `compose.tls.yaml`
- `apps/api/src/server.ts`
- `apps/api/src/openapi.ts`
- `packages/schema/src/index.ts`
- `corpus/demo/assets.json`

## Files Changed

- `package.json`
  - Added `smoke:compose`.
- `scripts/smoke-compose.ts`
  - Adds a deterministic running-stack smoke gate.
  - Validates base, same-origin, and TLS Compose config.
  - Checks Docker CLI, Docker Compose plugin, and Docker daemon availability with readable failure messages.
  - Checks `/health`, `/openapi.json`, JSON `demo-agent-pack` export, OKF `demo-agent-pack` export, and `scripts/verify-restricted-leakage.sh` against `AGENTIC_CMS_API_URL` or `http://127.0.0.1:3000`.
  - Fails clearly for unreachable API, likely port conflict/wrong service, empty demo exports, stale/non-OKF export shape, and leakage verifier failure.
  - Does not start, stop, or mutate containers.
- `docs/DEVELOPMENT.md`
  - Documents `npx -y pnpm@11.7.0 smoke:compose`, running-stack assumptions, `AGENTIC_CMS_API_URL`, and the demo-corpus import assumption.
- `docs/runbooks/DEPLOY_DOCKER_COMPOSE.md`
  - Adds `smoke:compose` to post-health Compose checks.
- `work/beta-execution/runtime-smoke-leakage-report.md`
  - This report.

## Commands Run

```bash
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 claims:lint
```

## Verification Results

`npx -y pnpm@11.7.0 smoke:compose`: failed with an exact runtime blocker.

Passing parts:

```json
{
  "dockerCli": "Docker version 29.5.3, build d1c06ef",
  "dockerCompose": "Docker Compose version v5.1.4",
  "composeConfig": "pass",
  "composeSameOriginConfig": "pass",
  "composeTlsConfig": "pass",
  "dockerDaemon": "29.5.3",
  "health": {
    "status": "ok",
    "service": "agentic-cms-api",
    "version": "0.1.0"
  },
  "openapi": {
    "openapi": "3.1.0",
    "pathCount": 65,
    "hasAiPackageExport": true
  },
  "jsonExport": {
    "packageName": "demo-agent-pack",
    "assetCount": 4,
    "deniedCount": 0
  }
}
```

Failing parts:

```json
{
  "failures": [
    "OKF demo-agent-pack export: OKF export returned the JSON export shape instead of an OKF package; the running API may be stale or ignoring format=okf",
    "security:verify-restricted-leakage: Restricted leakage verifier failed against the running API"
  ],
  "leakageVerifierError": "Reader OKF export did not return an OKF package"
}
```

`npx -y pnpm@11.7.0 openapi:check`: passed.

```text
OpenAPI route inventory OK: 82 documented routes match 84 server routes with 2 explicit meta-route exceptions.
```

`npx -y pnpm@11.7.0 claims:lint`: passed.

```text
Claims lint OK: scanned 28 public copy/source files with 8 claim rules.
```

## Docker And Runtime Assumptions

- Docker CLI was available.
- Docker Compose plugin was available.
- Docker daemon was available.
- Compose config validation passed for:
  - `compose.yaml`
  - `compose.yaml` plus `compose.same-origin.yaml`
  - `compose.yaml` plus `compose.same-origin.yaml` plus `compose.tls.yaml`
- The smoke gate intentionally did not start or stop containers.
- A running API was reachable at `http://127.0.0.1:3000`.
- The running API had demo corpus content for JSON `demo-agent-pack` export.
- The running API did not serve the current OKF export behavior, so full runtime leakage proof remains blocked until the stack/API is rebuilt or restarted from the current code.

## Manager Integration Update

Commands run by the manager after this worker report:

```bash
AGENTIC_CMS_POSTGRES_PORT=55432 docker compose build migrate api
AGENTIC_CMS_POSTGRES_PORT=55432 docker compose up -d migrate api
npx -y pnpm@11.7.0 smoke:compose
curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1"
```

Result: `smoke:compose` passed after the API refresh.

Representative OKF evidence from the refreshed running API:

```json
{
  "format": "okf",
  "okfVersion": "0.1",
  "packageName": "demo-agent-pack",
  "fileCount": 7,
  "assetCount": 4,
  "deniedCount": 0,
  "sourcePackageHash": "string",
  "projectionHash": "string",
  "rootIndexPath": "index.md"
}
```

Representative leakage evidence from `smoke:compose`:

```json
{
  "readerExportAssetCount": 0,
  "readerExportDeniedCount": 1,
  "readerOkfExportFileCount": 3,
  "readerOkfExportDeniedCount": 1
}
```

## Remaining Gaps

- Browser UAT and landing screenshot work are now unblocked from the runtime-smoke perspective.
- CI wiring is still pending; this lane added a package-script gate and manager-side passing evidence, not CI enforcement.
- This lane did not add CI wiring. The script is secret-free and package-script addressable, but the current implementation is intentionally a running-stack gate to avoid unsafe container lifecycle management in a shared local environment.
