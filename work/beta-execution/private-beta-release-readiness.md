# ForgetBase Private Beta Release Readiness

Status: ready for private self-hosted beta; not ready for public beta or a shared hosted endpoint
Date: 2026-06-19
Branch: `codex/forgetbase-beta-readiness`
PR: `https://github.com/jremick/forgetbase/pull/1`
Hosted CI evidence: read back from PR #1 before merge.

## Decision

The current branch is release-ready for a private, self-hosted beta of the ForgetBase core after merge. The beta claim is limited to the frozen machine-consumer lane in `docs/BETA_PRIVATE_CONTRACT.md` and the local Docker Compose first-run path.

This is not a production-readiness claim, public-beta claim, hosted-service maturity claim, enterprise identity completion claim, full managed-agent orchestration claim, broad enterprise-search parity claim, or full API stability claim.

## Release Surface

Customer-facing private beta surface:

- `README.md`
- `docs/BETA_PRIVATE_CONTRACT.md`
- `docs/DEVELOPMENT.md`
- `docs/runbooks/DEPLOY_DOCKER_COMPOSE.md`
- `docs/runbooks/BACKUP_RESTORE.md`
- `docs/runbooks/RESTRICTED_LEAKAGE_INVESTIGATION.md`
- `docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md` for operator-owned staging only
- `corpus/demo/assets.json` and `corpus/demo/evals.json`
- Docker Compose, API, SDK, CLI, MCP, JSON export, and OKF export paths covered by the private beta contract

Maintainer evidence surface:

- `work/beta-execution/**`
- `work/model-council/forgetbase-beta-20260619/**`
- `docs/design/**`

The maintainer evidence surface records planning, screenshots, model-council notes, and implementation proof. It is useful for audit and review, but it is not the beta customer contract and should not be packaged as the primary onboarding artifact.

## Public Endpoint Boundary

A shared public or private hosted URL is not cleared by this record. Before any public endpoint is shared, run live read-backs against the real deployment and record evidence that:

- only the same-origin proxy has a public domain
- direct `api` and `web` services have no public domains
- `FORGETBASE_REQUIRE_AUTHENTICATION=true`
- `FORGETBASE_SESSION_COOKIE_SECURE=true`
- `FORGETBASE_CORS_ALLOWED_ORIGINS` is an approved HTTPS origin
- `/api/auth/bootstrap` is blocked at the public proxy
- unauthenticated protected API routes return `401 {"error":"authentication_required"}`

The default local Compose path remains optimized for local bootstrap and is not public-safe without the public deployment gate.

## Evidence Summary

Hosted CI:

- GitHub Actions `Verify` passed on PR #1 before the final release-readiness record was amended.
- Prior evidence run: `https://github.com/jremick/forgetbase/actions/runs/27816817227`
- Required merge condition: PR #1 must show `Verify` passing on its latest head before merge.
- CI steps covered by `Verify`: install, typecheck, build, strict demo corpus validation, base/same-origin/TLS Compose config parsing, OpenAPI drift, claims lint, beta contracts, and full tests.

Local release gates passed:

```bash
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 security:check-deployment-defaults
FORGETBASE_PUBLIC_DEPLOYMENT=true FORGETBASE_REQUIRE_AUTHENTICATION=true FORGETBASE_SESSION_COOKIE_SECURE=true FORGETBASE_PUBLIC_ENTRYPOINT=railway-proxy FORGETBASE_CORS_ALLOWED_ORIGINS=https://cms.example.com npx -y pnpm@11.7.0 security:check-deployment-defaults
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
npx -y pnpm@11.7.0 auth:verify-oidc-login
```

Focused results:

- Claims lint scanned 37 public copy/source files with 8 rules and passed.
- OpenAPI check passed: 82 documented routes matched 84 server routes with 2 explicit meta-route exceptions.
- Deployment-default checks passed locally and in public-deployment mode.
- `contracts:check` passed 4 contract test files and 14 tests.
- Full tests passed locally: 10 files passed, 1 skipped; 121 tests passed, 28 skipped.
- Strict corpus validation passed: 9 assets, 0 errors, 0 warnings, 0 stale assets.
- `smoke:compose` passed health, OpenAPI, JSON export, OKF export, and restricted leakage checks.
- Standalone restricted leakage passed: anonymous and reader search returned 0 restricted hits; admin saw the fixture; reader JSON/OKF exports excluded restricted content with denied counts.
- Backup/restore verification passed against a temporary restored database.
- Fake-provider OIDC verification passed with signed-state configuration and synced groups.

Fresh-clone timed proof:

- Isolated clone path: `/tmp/forgetbase-private-beta-quickstart`
- Compose project: `forgetbase_beta_quickstart`
- Ports: API `4310`, web `5176`, Postgres `55433`
- Result: passed in 37 seconds.
- Verified install, build, Compose startup, API health, local admin bootstrap, demo corpus import, worker once, search, JSON export, OKF export, web render, and `smoke:compose`.
- Fresh-clone evidence drove the runbook correction requiring `pnpm build` before host-run CLI/worker commands in a clean checkout.

Browser proof:

- Manual browser UAT passed for landing, login, Distribute, JSON package generation, OKF package generation, and mobile layout.
- Evidence: `work/beta-execution/landing-browser-uat-report.md`
- Screenshots: `work/beta-execution/screenshots/`

Security review:

- No confirmed auth, search, or export leakage blocker remained.
- The beta contract file is tracked and committed.
- Local maintainer paths and fake design secret fixtures were sanitized where found in tracked release evidence.
- Public endpoint exposure remains blocked until real deployment read-backs are recorded.

## Gate Matrix

| Gate | Status | Evidence |
|---|---|---|
| Source docs and beta plan read | Passed | Manager artifacts and checkpoints under `work/beta-execution/` |
| Claim-safe positioning | Passed | `claims:lint`; README and contract wording |
| Frozen private beta contract | Passed | `docs/BETA_PRIVATE_CONTRACT.md`; `contracts:check` |
| API/OpenAPI drift | Passed | `openapi:check` |
| CLI/SDK/MCP beta path | Passed | `contracts:check` and fresh-clone proof |
| Synthetic corpus only | Passed | strict corpus validation; no private corpus committed |
| JSON and OKF exports | Passed | browser UAT, `smoke:compose`, contract tests |
| Restricted leakage | Passed | `smoke:compose`; `security:verify-restricted-leakage` |
| Docker Compose quickstart | Passed | fresh-clone timed proof |
| Backup/restore | Passed | `db:verify-backup-restore` |
| OIDC fake-provider smoke | Passed | `auth:verify-oidc-login` |
| Hosted/public deployment | Deferred | requires real live read-backs before sharing a URL |
| Real-provider smoke | Deferred | requires approved external secrets and cost boundary |
| Automated browser UAT | Deferred | manual browser proof accepted for this private beta |

## Known Deferrals

- Real OpenAI/Anthropic/OpenRouter provider smoke is not run because it needs approved secrets and a cost envelope.
- Browser UAT is manual evidence, not committed automated Playwright coverage.
- A public/hosted beta URL is not approved until live deployment read-backs satisfy the public endpoint boundary above.
- Broad admin/provider/identity/action/telemetry routes remain preview outside the private beta contract.
- npm publishing, managed hosting, enterprise identity, SCIM, billing, support SLA, managed backups, and production operations remain out of scope.

## Release Recommendation

Mark PR #1 ready for review and merge it for the private self-hosted beta branch. Do not create a public beta announcement, public hosted endpoint, stable release, or broad compatibility promise from this branch.

If a GitHub prerelease is created, label it as private self-hosted beta and link to this readiness record plus `docs/BETA_PRIVATE_CONTRACT.md`.
