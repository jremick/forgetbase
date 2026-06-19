# Trust Gates Implementation Report

Status: implemented first deterministic lane
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Summary

Implemented the first cheap, secret-free Deterministic Trust Gates lane:

- `openapi:check` compares the current Fastify route/method inventory in `apps/api/src/server.ts` against the hand-authored OpenAPI document from `apps/api/src/openapi.ts`.
- `claims:lint` scans public docs/copy surfaces for unsupported overclaims while allowing explicit boundary, blocklist, future-work, and "not claimed" contexts.
- Root package scripts now expose both gates.
- OpenAPI stability wording was softened from a stable contract claim to a current contract target with beta stability gated on drift/freeze checks.
- Two incidental production-readiness phrases were softened to hardened-deployment language so the claims gate can stay useful.

## Files Inspected

- `README.md`
- `CHANGELOG.md`
- `SECURITY.md`
- `package.json`
- `apps/api/src/server.ts`
- `apps/api/src/openapi.ts`
- `docs/ALPHA_RELEASE_CHECKLIST.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT.md`
- `docs/END_TO_END_GOAL.md`
- `docs/MVP_SCOPE.md`
- `docs/PRODUCT_GOAL.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `docs/SECURITY_MODEL.md`
- `docs/TECHNICAL_SPEC.md`
- `work/beta-execution/api-cli-mcp-contract-audit.md`
- `work/beta-execution/integration-checkpoint-1.md`
- `work/beta-execution/trust-gates-design.md`

## Files Changed

- `scripts/check-openapi.ts`
  - Extracts literal `server.get/post/put/delete/patch/options/head("...")` route declarations from `apps/api/src/server.ts`.
  - Normalizes Fastify path params from `:id` to OpenAPI `{id}`.
  - Imports `buildOpenApiDocument()` and compares normalized `METHOD path` pairs.
  - Keeps explicit meta-route exceptions for `GET /` and `GET /openapi.json`.

- `scripts/claims-lint-rules.json`
  - Defines deterministic blocked-claim rules for production readiness, hosted-service maturity, enterprise identity completeness, full orchestration, broad enterprise-search parity, observability overclaim, API stability overclaim, and unqualified control-plane wording.

- `scripts/claims-lint.ts`
  - Scans `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `apps/web/index.html`, `docs/**/*.md`, and non-test `apps/web/src/**/*.{ts,tsx}`.
  - Excludes generated/dependency directories.
  - Allows explicit boundary contexts such as "avoid", "not claimed", "not yet", "future work", "excluded", "deferred", "blocks", and similar blocklist/gap language.
  - Supports narrow inline exceptions with a reason and expiry using `claims-lint-disable-next-line <rule-id> -- <reason>; expires YYYY-MM-DD`.

- `package.json`
  - Adds `openapi:check`.
  - Adds `claims:lint`.

- `docs/TECHNICAL_SPEC.md`
  - Changes the hand-authored `/openapi.json` description from a "stable contract target" to a "current contract target".
  - Adds that beta stability should only be claimed after OpenAPI drift and contract-freeze checks exist.

- `docs/PRODUCT_GOAL.md`
  - Changes "First Production Definition" and "production-ready SMB deployment" to hardened-deployment wording.

- `docs/SECURITY_MODEL.md`
  - Changes "Production-ready deployments need" to "Hardened deployments need".

## Command Evidence

Commands run:

```bash
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 claims:lint
```

Observed results:

- `openapi:check`: passed. It reported 82 documented OpenAPI route/method pairs matching 84 server route/method pairs with 2 explicit meta-route exceptions.
- `claims:lint`: passed. It reported 36 scanned public copy/source files with 8 claim rules after manager review follow-up added the React UI source to the scan target set.

The first `claims:lint` run intentionally failed while the boundary heuristic was too narrow. It caught many legitimate "future work", "avoid this claim", and "not yet stable" references. The linter was tightened to allow those explicit boundary contexts rather than suppressing whole docs broadly.

## Allowlist And Blocklist Rationale

OpenAPI allowlist:

- `GET /`: root service metadata route, not part of the API contract surface.
- `GET /openapi.json`: self-description endpoint that serves the contract and should not have to document itself.

Claims blocklist:

- Blocks unsupported claims around production readiness, hosted service maturity, enterprise identity completeness, full orchestration, broad enterprise-search parity, complete observability, API stability, and unqualified control-plane language.
- Keeps `docs/REMAINING_FUNCTIONAL_GAPS.md`, release plans, decision records, and checklist docs usable by allowing explicit gap/blocklist contexts instead of treating every mention of a blocked phrase as a public claim.
- Manager review follow-up now scans the operational React UI source so landing and in-app public copy are covered by the same deterministic overclaim rules.

## Remaining Gates

- Restricted leakage: `security:verify-restricted-leakage` still needs CI/release wrapper work or a documented release-gate run against a booted API.
- Compose smoke: `smoke:compose` is not implemented in this lane.
- Backup/restore: `db:verify-backup-restore` exists, but beta release gating still needs policy/workflow placement and fresh evidence.
- Secure-default Option C: accepted in planning, not implemented here. Public/deployment templates still need contextual secure defaults and warnings.
- UAT: `test:uat` remains deferred until the canonical UI walkthrough and browser automation path exist.

## Notes

- No network dependencies or provider/OIDC secrets were added.
- CI was not changed in this lane. The repo has an obvious CI workflow, but this pass kept to package-script wiring as requested and avoided broad workflow changes while adjacent workers are active.
- The worktree had pre-existing modifications in several docs and app files. This lane did not revert or normalize unrelated changes.
