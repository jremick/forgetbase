# CI Gate Wiring Report

Status: implemented and locally verified
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Summary

Wired the current GitHub Actions workflow to enforce the deterministic, secret-free beta gates that do not require a pre-running API, persistent Docker state, provider credentials, external identity, or browser UAT state.

Default CI now covers:

- frozen `pnpm install`
- `pnpm typecheck`
- `pnpm build`
- strict demo corpus validation with `--fail-on-warnings`
- static Compose config parsing for base, same-origin, and TLS overlays
- `pnpm openapi:check`
- `pnpm claims:lint`
- `pnpm contracts:check`
- `pnpm test` against the existing `pgvector/pgvector:pg17` service

`smoke:compose` remains a release/runtime gate because it requires a reachable API with imported demo corpus data and intentionally does not own container startup or cleanup.

## Files Inspected

- `README.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/DEVELOPMENT.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/ci.yml`
- `scripts/check-openapi.ts`
- `scripts/claims-lint.ts`
- `scripts/smoke-compose.ts`
- `work/beta-execution/integration-checkpoint-3.md`
- `work/beta-execution/trust-gates-design.md`
- `work/beta-execution/trust-gates-implementation-report.md`
- `work/beta-execution/runtime-smoke-leakage-report.md`
- `work/beta-execution/contract-freeze-tests-report.md`

## Files Changed

- `.github/workflows/ci.yml`
  - Preserved the existing `verify` job, Postgres service, frozen install, typecheck, build, strict corpus validation, and test coverage.
  - Increased the `verify` job timeout from 15 to 25 minutes to account for the added gates without changing test behavior.
  - Added `Validate Compose config`.
  - Added `Validate same-origin Compose config`.
  - Added `Validate TLS Compose config`.
  - Added `Check OpenAPI drift`.
  - Added `Lint public claims`.
  - Added `Check beta contracts`.

- `docs/DEVELOPMENT.md`
  - Added local equivalents for strict corpus validation, OpenAPI drift, claims lint, contract checks, and same-origin Compose config parsing.
  - Updated the CI section to identify CI gates versus local release/manual gates.

- `docs/BETA_RELEASE_PLAN.md`
  - Reframed Phase A around deterministic CI gates.
  - Kept restricted leakage and runtime Compose smoke as release gates until isolated CI wrappers exist.
  - Split beta exit criteria into CI/static gates and release/manual gates.

- `docs/REMAINING_FUNCTIONAL_GAPS.md`
  - Updated remaining hardening language to reflect that default CI now covers deterministic static gates and focused contracts.
  - Left isolated runtime smoke, leakage CI wrapper, backup/restore, and browser UAT as gaps.

- `README.md`
  - Updated the CI capability bullet to include static Compose config, OpenAPI drift, claims lint, and focused beta contracts.

- `work/beta-execution/ci-gate-wiring-report.md`
  - Added this report.

## Exact CI Commands

The `Verify` job now runs these commands after checkout, Node setup, and frozen install:

```bash
pnpm typecheck
pnpm build
pnpm --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
pnpm openapi:check
pnpm claims:lint
pnpm contracts:check
pnpm test
```

The workflow still installs with:

```bash
pnpm install --frozen-lockfile
```

## Gate Placement

| Gate | Placement | Reason |
|---|---|---|
| `pnpm typecheck` | CI | Deterministic, secret-free compile check. |
| `pnpm build` | CI | Deterministic, secret-free artifact build. |
| strict demo corpus validation | CI | Deterministic public corpus proof; warnings block. |
| static Compose config parsing | CI | Secret-free config validation; no containers are started. |
| `pnpm openapi:check` | CI | Deterministic route/OpenAPI drift gate. |
| `pnpm claims:lint` | CI | Deterministic public-copy overclaim gate. |
| `pnpm contracts:check` | CI | Deterministic focused beta API/SDK/CLI/MCP contract check. |
| `pnpm test` | CI | Existing unit and Postgres-backed suite with CI Postgres service. |
| `pnpm smoke:compose` | Release/manual | Requires a reachable current API, imported demo corpus, and Docker runtime state; current script does not start or stop containers. |
| `pnpm security:verify-restricted-leakage` | Release/manual | Requires a running API; can move to CI after a wrapper owns API startup, health wait, verifier run, and teardown. |
| `pnpm db:verify-backup-restore` | Release/manual | Requires running Compose Postgres and backup/restore lifecycle. |
| `pnpm auth:verify-oidc-login` | Release/manual | Requires fake-provider/API setup and explicit auth runtime assumptions. |
| provider smoke | Manual/secret-gated | Requires approved provider secrets and cost/quota controls. |
| browser UAT | Deferred/manual | Requires canonical browser walkthrough and app state. |

## Local Verification

Commands run after the CI/docs patch:

```bash
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 build
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 test
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "workflow yaml parsed"'
```

Observed results:

- `pnpm install --frozen-lockfile`: passed; lockfile was already up to date.
- Strict demo corpus validation: passed with `assetCount: 9`, `errorCount: 0`, `warningCount: 0`, and `staleCount: 0`.
- Base Compose config parse: passed.
- Same-origin Compose config parse: passed.
- TLS Compose config parse: passed.
- `openapi:check`: passed; 82 documented routes matched 84 server routes with 2 explicit meta-route exceptions.
- `claims:lint`: passed; scanned 36 public copy/source files with 8 claim rules after manager review follow-up added the React UI source to the scan target set.
- `typecheck`: passed across the workspace.
- `build`: passed across the workspace.
- `contracts:check`: passed; targeted build completed, OpenAPI check passed, and 4 contract test files / 11 tests passed.
- `test`: passed; 10 test files passed, 1 skipped; 118 tests passed, 28 skipped.
- Workflow YAML parse: passed with Ruby/Psych. This is a local syntax parse only, not a hosted GitHub Actions execution.

Skipped by design:

- `pnpm smoke:compose` was not run as part of CI-equivalent verification because it is intentionally a runtime/release gate against a running API, not an unconditional static CI gate.
- `pnpm security:verify-restricted-leakage`, `pnpm db:verify-backup-restore`, `pnpm auth:verify-oidc-login`, provider smoke, and browser UAT were not run in this CI wiring lane because they remain release/manual, secret-gated, or deferred gates.

## Deferred Gates

- No live API dependency was hidden inside default CI.
- No unconditional `smoke:compose` step was added.
- No provider, OIDC, or hosted-service secrets were added.
- No application behavior, API/CLI/MCP contracts, corpus content, auth defaults, Docker runtime behavior, or web UI implementation was changed.

## Readiness Judgment

Final beta readiness review can rely on CI for deterministic static gates and focused beta contract checks once the updated GitHub Actions workflow runs on a branch or PR. It still cannot rely on CI for full runtime leakage proof, running-stack smoke, backup/restore, browser UAT, real-provider behavior, hosted-service maturity, enterprise identity, or production readiness.
