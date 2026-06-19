# ForgetBase Beta Integration Checkpoint 3

Status: second implementation wave accepted; third implementation wave ready
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Purpose

This checkpoint integrates the second implementation wave, records the manager-side runtime refresh decision, and unlocks landing/browser UAT, CI gate wiring, and secure-default implementation without asking for minor user review.

## Worker Artifacts Reviewed

| Lane | Artifact | Manager status | Notes |
|---|---|---|---|
| Runtime Smoke And Leakage Gate | `work/beta-execution/runtime-smoke-leakage-report.md` | Accepted after manager runtime refresh | Adds `smoke:compose`, Compose config validation, JSON/OKF export checks, and restricted leakage verification against a running API. |
| Distribute Surface MVP | `work/beta-execution/distribute-surface-mvp-report.md` | Accepted | Adds top-level `#distribute`, keeps `#exports` as legacy alias, and adds a safe session-local package builder backed by existing `/exports/ai-package`. |
| Contract Freeze Tests | `work/beta-execution/contract-freeze-tests-report.md` | Accepted | Adds `contracts:check` and focused API/SDK/CLI/MCP tests for the canonical beta machine-consumer path. |

## Manager Verification

The manager reran these checks after worker completion:

```bash
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 --filter @forgetbase/web typecheck
npx -y pnpm@11.7.0 --filter @forgetbase/web test
npx -y pnpm@11.7.0 --filter @forgetbase/web build
npx -y pnpm@11.7.0 smoke:compose
```

Initial manager `smoke:compose` failed for the same stale running API mismatch reported by workers. The manager inspected Docker ownership and found the listener belonged to this repo's Compose project:

```text
forgetbase-api-1
forgetbase-postgres-1
```

The manager then made the narrow runtime refresh call:

```bash
FORGETBASE_POSTGRES_PORT=55432 docker compose build migrate api
FORGETBASE_POSTGRES_PORT=55432 docker compose up -d migrate api
npx -y pnpm@11.7.0 smoke:compose
```

Results:

- OpenAPI drift gate passed with 82 documented routes matching 84 server routes and 2 explicit meta-route exceptions.
- Claims lint passed across 28 public copy/source files with 8 claim rules.
- `contracts:check` passed targeted API/CLI/MCP dependency builds, OpenAPI check, 4 contract test files, and 11 tests.
- Web typecheck, Vitest, and build passed.
- After the API refresh, `smoke:compose` passed: Compose config, Docker daemon, API health, OpenAPI, JSON export, OKF export, and restricted leakage verification.

Representative refreshed OKF response evidence:

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

Representative leakage evidence:

```json
{
  "readerExportAssetCount": 0,
  "readerExportDeniedCount": 1,
  "readerOkfExportFileCount": 3,
  "readerOkfExportDeniedCount": 1
}
```

## Manager Decisions

### D-20260619-013 - Second Implementation Wave Is Accepted

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: Runtime smoke, Distribute surface, beta contract checks
- `Decision`: Accept the second implementation wave as beta-progressing and safe to build on.
- `Why`: Each lane produced the required durable report, stayed within its outcome boundary, avoided unsupported maturity claims, preserved public-safe content boundaries, and passed manager-side verification after the targeted runtime refresh.
- `Alternatives`: Hold for a full browser UAT pass before accepting. Rejected because browser UAT is the next executable lane and depends on these accepted surfaces.
- `Follow-ups`: Dispatch landing/browser UAT, CI gate wiring, and secure-default Option C implementation.

### D-20260619-014 - Manager Runtime Refresh Was Safe And Necessary

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: Local Compose runtime
- `Decision`: Rebuild and restart only `migrate` and `api` in the existing `forgetbase` Compose project, preserving the running Postgres container and volume.
- `Why`: The blocker was not an unrelated user process; Docker labels showed the stale listener belonged to this repo's Compose project. Restarting only the API path was the smallest action that could turn the runtime gate from an environmental caveat into proof.
- `Alternatives`: Ask the user; dispatch another worker; leave the caveat. Rejected because the user delegated minor decisions to the manager and the action was narrow, reversible, and aligned with the runbook.
- `Follow-ups`: Record the refresh evidence in this checkpoint and rerun OKF browser UAT against the refreshed API.

### D-20260619-015 - Runtime Smoke Is A Release Gate, Not A CI Default Yet

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: CI/release gate worker
- `Scope`: `smoke:compose`, CI gates, release checklist
- `Decision`: Treat `smoke:compose` as a required release/runtime gate, but do not make it an unconditional CI default until the CI lane decides whether Docker/runtime dependencies are available and properly guarded.
- `Why`: The gate is secret-free but requires Docker plus a running API with demo corpus data. Static gates are CI-safe by default; runtime gates need lifecycle assumptions.
- `Alternatives`: Add `smoke:compose` directly to CI now. Rejected because a running-stack requirement could make CI brittle or misleading.
- `Follow-ups`: CI gate wiring should add `openapi:check`, `claims:lint`, and `contracts:check`; runtime smoke can be documented as release-gate/manual or guarded if CI can manage an isolated stack safely.

### D-20260619-016 - Distribute Is The Canonical Beta Screenshot Surface

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Landing/browser UAT worker
- `Scope`: Landing page, screenshots, walkthrough
- `Decision`: Use `#distribute` as the canonical screenshot surface for the beta wedge. Keep `#exports` only as a legacy alias in public/internal notes.
- `Why`: The Distribute route now exposes the agent-consumer package builder with API/CLI/MCP/OKF examples and safe metadata. This directly supports the beta thesis.
- `Alternatives`: Use Operations exports or catalog screenshots as the main proof. Rejected because they understate the product wedge.
- `Follow-ups`: Capture JSON and OKF success states against the refreshed API; do not show restricted package contents.

### D-20260619-017 - Contract Freeze Remains Canonical-Path Only

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Contract/CI worker
- `Scope`: API, SDK, CLI, MCP contracts
- `Decision`: Keep the beta contract freeze limited to canonical fetch/search/export through API/SDK/CLI/MCP and JSON/OKF export metadata.
- `Why`: The focused tests provide useful release confidence without implying all admin, hosted-service, identity, operations, or orchestration paths are stable.
- `Alternatives`: Expand the contract freeze before landing/UAT. Rejected because visible proof and trust gates are more urgent.
- `Follow-ups`: CI gate wiring can run `contracts:check`; broader contract maturity should remain a post-beta backlog item.

## Third Implementation Wave

Dispatch these lanes in parallel:

| Lane | Outcome | File boundaries | Can run now |
|---|---|---|---|
| Landing + Browser UAT | Implement or finish claim-safe landing proof and rendered browser walkthrough using real product states, including `#distribute` OKF success after the API refresh. | Landing/web files, browser screenshots/evidence, `work/beta-execution/landing-browser-uat-report.md` | yes |
| CI Gate Wiring | Wire deterministic static gates for beta release confidence without introducing brittle live-runtime requirements. | `.github/workflows/`, package scripts if needed, docs/release checklist, `work/beta-execution/ci-gate-wiring-report.md` | yes |
| Secure Default Option C | Implement contextual secure-default warnings/templates/policy checks from Checkpoint 1 without breaking local bootstrap. | Compose/template/docs/security scripts only as needed, `work/beta-execution/secure-default-option-c-report.md` | yes |

Hold these lanes until the third wave lands:

- Final beta readiness review.
- Broad App.tsx route-module decomposition.
- Full package-history persistence.
- Broad API/admin/MCP stability freeze.

## Current Blocker State

No hard blockers. No Pushover notification sent.

The prior runtime blocker is resolved by the manager API refresh. The active dependency is now browser-rendered proof and release-gate wiring, not API/runtime availability.
