# API/CLI/MCP Contract Audit

Status: beta planning audit
Last updated: 2026-06-19
Scope: API, CLI, MCP, SDK/export, OpenAPI, JSON AI export packages, and OKF v0.1 export packages.

## Executive Summary

The current machine-consumer surface is beta-promising but not beta-frozen.

The canonical path already exists across API, SDK, CLI, MCP, OpenAPI, JSON export, and OKF export:

1. authenticate/bootstrap a local operator or scoped key
2. import or create governed assets
3. validate metadata and restricted export rules
4. review/publish assets
5. retrieve through API/CLI/MCP with permission filtering and citations
6. generate JSON and OKF packages from `/exports/ai-package`
7. inspect telemetry/audit evidence

The main beta risk is not missing functionality. It is contract breadth and drift. The server exposes 84 route/method pairs, OpenAPI documents 82 route/method pairs, CLI exposes a large command tree, and MCP registers 72 tools. Existing tests cover important paths, but there is no generated OpenAPI drift gate, no versioned beta contract artifact, no SDK-specific contract test suite, and only partial CLI/MCP command/tool coverage.

Beta should freeze a small, explicit value-path contract first and classify the rest as long-tail/preview operations.

## Source Files Inspected

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `docs/OKF_EXPORTS.md`
- `work/beta-execution/manager-execution-map.md`
- `package.json`
- `apps/api/package.json`
- `apps/api/src/server.ts`
- `apps/api/src/openapi.ts`
- `apps/api/src/server.test.ts`
- `packages/cli/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/src/index.test.ts`
- `packages/mcp-server/package.json`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/src/server.test.ts`
- `packages/sdk/package.json`
- `packages/sdk/src/index.ts`
- `packages/schema/package.json`
- `packages/schema/src/index.ts`
- `packages/schema/src/index.test.ts`
- `packages/validation/src/index.test.ts`
- `packages/db/src/index.test.ts`
- `apps/worker/src/index.test.ts`
- `apps/web/src/local-dev-auth.test.ts`

## Current Contract Inventory

### API Routes

Observed in `apps/api/src/server.ts`: 84 route/method pairs.

Beta-critical routes:

- `GET /health`
- `GET /openapi.json`
- `POST /auth/bootstrap`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/api-keys`
- `GET /auth/api-keys`
- `POST /auth/api-keys/:apiKeyId/rotate`
- `POST /auth/api-keys/:apiKeyId/revoke`
- `POST /auth/service-accounts`
- `GET /auth/service-accounts`
- `POST /auth/groups`
- `POST /auth/groups/:groupId/members`
- `POST /assets`
- `GET /assets`
- `GET /assets/:stableId`
- `POST /assets/:stableId/versions`
- `GET /assets/:stableId/versions/:versionNumber`
- `GET /assets/:stableId/versions/by-id/:versionId`
- `GET /assets/review-queue`
- `POST /assets/:stableId/review`
- `POST /assets/:stableId/publish`
- `POST /assets/:stableId/restore`
- `POST /assets/:stableId/grants`
- `POST /validation/assets`
- `GET /search`
- `POST /agent/query`
- `POST /agent/evals/run`
- `GET /agent/evals/runs`
- `GET /agent/evals/summary`
- `GET /exports/ai-package`
- `GET /audit/events`
- `GET /telemetry/summary`

Long-tail or preview routes:

- browser-session and OIDC routes: `/auth/session/refresh`, `/auth/sessions`, `/auth/oidc/*`
- full local user/group/session administration beyond the beta demo path
- service-account policy and rotation-due reporting
- provider config, provider health, auth-provider config, secret-reference policy
- PII redaction, telemetry retention, managed-query retention/cache policy and cache maintenance
- retrieval ranking policy
- managed-query feedback list/create
- action execution policy and action request/decision routes
- `GET /telemetry/retrieval-events`
- root info route `GET /`

### OpenAPI

Observed in `apps/api/src/openapi.ts`: 82 route/method pairs.

Mechanical route/method comparison found:

- server route/method count: 84
- OpenAPI route/method count: 82
- missing from OpenAPI: `GET /`, `GET /openapi.json`
- extra in OpenAPI but missing from server: none

That is acceptable for alpha if `GET /` and `GET /openapi.json` are treated as meta routes, but beta still needs an `openapi:check` gate that verifies at least:

- server route/method inventory matches OpenAPI allowlist
- beta-critical query/path parameters are present
- request and response schemas are either generated from `packages/schema` or covered by fixture validation
- OpenAPI artifact is versioned or snapshotted for release review

### CLI Commands

Observed in `packages/cli/src/index.ts`.

Beta-critical commands:

- `agentic-cms health`
- `agentic-cms capabilities`
- `agentic-cms validate --file ... --fail-on-warnings`
- `agentic-cms corpus import --file ...`
- `agentic-cms auth bootstrap`
- `agentic-cms auth login`
- `agentic-cms auth me`
- `agentic-cms auth api-key-create`
- `agentic-cms auth api-key-list`
- `agentic-cms auth api-key-rotate`
- `agentic-cms auth api-key-revoke`
- `agentic-cms auth service-account-create`
- `agentic-cms auth service-account-list`
- `agentic-cms auth group-create`
- `agentic-cms auth group-member-add`
- `agentic-cms auth grant`
- `agentic-cms assets list`
- `agentic-cms assets get <stable-id>`
- `agentic-cms assets create --file ...`
- `agentic-cms assets update <stable-id> --file ...`
- `agentic-cms assets version <stable-id> --version-number ...`
- `agentic-cms assets review-queue`
- `agentic-cms assets review <stable-id>`
- `agentic-cms assets publish <stable-id>`
- `agentic-cms assets restore <stable-id>`
- `agentic-cms search --query ... --strategy lexical|vector|hybrid`
- `agentic-cms agent query --query ... --mode deterministic-retrieval|provider-routed`
- `agentic-cms agent eval --file ... --fail-on-threshold true`
- `agentic-cms agent eval-runs`
- `agentic-cms agent eval-summary`
- `agentic-cms exports ai-package --format json`
- `agentic-cms exports ai-package --format okf --okf-version 0.1`
- `agentic-cms telemetry summary`
- `agentic-cms audit events`

Long-tail or preview commands:

- OIDC login helper commands
- full user/group/session administration beyond the beta demo path
- admin provider/auth-provider/secret-reference/PII/cache/ranking/retention/service-account policies
- managed-query feedback
- action execution/list/decision
- telemetry retention and purge

### MCP Tools

Observed in `packages/mcp-server/src/server.ts`: 72 registered tools.

Beta-critical tools:

- `list_asset_types`
- `list_assets`
- `list_assets_needing_review`
- `get_asset`
- `get_asset_version`
- `search_assets`
- `managed_query`
- `validate_context_access`
- `validate_assets`
- `generate_ai_export`
- `run_managed_query_eval`
- `list_managed_query_eval_runs`
- `summarize_managed_query_eval_runs`
- `publish_asset`
- `review_asset`
- `list_audit_events`
- `get_telemetry_summary`

Long-tail or preview tools:

- managed-query feedback and cache controls
- managed-query policy, retention, and schedule policy controls
- retrieval ranking policy controls
- secret-reference and PII policy controls
- telemetry retention purge controls
- action execution policy/action request tools
- model-provider and auth-provider config tools
- OIDC login tools
- full user, service-account, API-key, login-session, and group administration tools

Tool naming is mostly idiomatic snake_case, but it should be frozen by explicit snapshot. The beta contract should document the equivalence between `GET /exports/ai-package`, SDK `exportAiPackage`, CLI `exports ai-package`, and MCP `generate_ai_export`.

### SDK Surface

Observed in `packages/sdk/src/index.ts`.

Beta-critical methods:

- `health`
- `bootstrapAuth`, `login`, `me`, `logout`
- `createApiKey`, `listApiKeys`, `rotateApiKey`, `revokeApiKey`
- `createServiceAccount`, `listServiceAccounts`
- `createGroup`, `addGroupMember`, `grantAssetPermission`
- `listAssets`, `listAssetsNeedingReview`, `getAsset`
- `createAsset`, `updateAsset`, `getAssetVersionSnapshot`, `reviewAsset`, `publishAsset`, `restoreAssetVersion`
- `validateAssets`
- `search`
- `managedQuery`
- `runManagedQueryEval`, `listManagedQueryEvalRuns`, `managedQueryEvalSummary`
- `exportAiPackage`, `exportOkfPackage`
- `listAuditEvents`, `telemetrySummary`

Gap: there is no `packages/sdk/src/*.test.ts`. SDK behavior is indirectly exercised by CLI and MCP tests, but beta should add SDK-focused tests for URL construction, headers, schema parsing, JSON export, OKF export, and error handling.

### JSON AI Export Package Shape

Observed in `packages/schema/src/index.ts`.

Top-level fields:

- `packageName`
- `generatedAt`
- `tenantId`
- `assetCount`
- `deniedCount`
- `assets`

Asset fields:

- `stableId`
- `assetId`
- `type`
- `title`
- `summary`
- `audience`
- `status`
- `sensitivity`
- `lifecycleState`
- `sourceRef`
- `currentVersionId`
- `sourceVersion`
- `allowedSurfaces`
- `allowedExports`
- `instructions`
- `humanDocuments`
- `citations`

Source version fields:

- `id`
- `versionNumber`
- `contentHash`
- `createdAt`
- `changeNote`

Instruction fields:

- `id`
- `instructionKind`
- `targetAgents`
- `body`
- `constraints`
- `failureModes`
- `escalation`

Human document fields:

- `id`
- `format`
- `body`

Beta freeze recommendation: freeze this shape before beta. New fields may be additive; renamed or removed fields require a post-beta migration note and fixture update.

### OKF v0.1 Export Package Shape

Observed in `packages/schema/src/index.ts` and `docs/OKF_EXPORTS.md`.

Top-level fields:

- `format: "okf"`
- `packageName`
- `generatedAt`
- `tenantId`
- `okfVersion`
- `spec`
- `assetCount`
- `deniedCount`
- `sourcePackageHash`
- `projectionHash`
- `rootIndexPath`
- `files`

Spec fields:

- `name: "Open Knowledge Format"`
- `version`
- `status: "draft"`
- `sourceUrl`
- `checkedAt`

File fields:

- `path`
- `contentHash`
- `content`

Generated file set:

- `index.md`
- `manifest.md`
- `log.md`
- one concept file per exported asset, under type-derived directories such as `policies/`

Concept frontmatter includes:

- `stable_id`
- `asset_id`
- `source_version_id`
- `source_version_number`
- `source_content_hash`
- `allowed_surfaces`
- `allowed_exports`

Boundary: OKF is an export projection only. Canonical storage remains governed ForgetBase/Agentic CMS asset and asset-version records.

## Gap Analysis

### Drift Risk

- OpenAPI is hand-authored. Current path/method coverage is close, but there is no durable drift check.
- Route parameters and response shapes are not generated from `packages/schema`.
- OpenAPI currently omits only meta routes, but future route changes could drift silently.
- CLI help text, CLI handlers, SDK methods, MCP tools, and OpenAPI are maintained separately.
- JSON and OKF export schemas are shared and validated, but fixture/snapshot coverage is not yet strong enough to call the package shape beta-frozen.

### Missing Tests

Minimum missing before beta freeze:

- `openapi:check`: route/method inventory, beta-critical params, and saved artifact diff.
- SDK contract tests for `AgenticCmsClient`.
- CLI contract tests for `validate`, `corpus import`, `assets get`, `assets review/publish`, JSON export, and auth/grant commands.
- MCP snapshot test for the beta-critical tool list and input schemas.
- MCP call tests for `get_asset`, `managed_query`, `generate_ai_export` JSON, `generate_ai_export` OKF, and `validate_context_access`.
- Export fixture tests that pin JSON package shape and OKF generated file/frontmatter/hash behavior.
- CI/release gate for `security:verify-restricted-leakage`, covering JSON and OKF exports.
- Compose smoke script for the canonical beta value path.

### Naming Instability

No blocking incompatible naming mismatch was found, but the same concepts are named differently by surface:

- API route: `GET /exports/ai-package`
- SDK: `exportAiPackage`, `exportOkfPackage`
- CLI: `exports ai-package`
- MCP: `generate_ai_export`
- API route: `POST /agent/query`
- SDK: `managedQuery`
- CLI: `agent query`
- MCP: `managed_query`
- API route: `GET /search`
- SDK: `search`
- CLI: `search`
- MCP: `search_assets`

These differences are acceptable if documented as surface idioms. They should not be renamed before this audit is integrated unless the manager explicitly chooses a new convention.

### Compatibility Risk

- README correctly warns that API routes, CLI flags, MCP tool names, and package boundaries may change before beta.
- `docs/REMAINING_FUNCTIONAL_GAPS.md` correctly states that stable API compatibility should not be claimed.
- `docs/TECHNICAL_SPEC.md` says `/openapi.json` gives consumers a "stable contract target." This should be softened before beta to "current contract target" or paired with a note that beta stability starts only after `openapi:check` and contract freeze gates exist.
- `docs/DECISIONS.md` uses phrases such as "stable target" and "stable managed-query contract" in historical decision records. Those are acceptable as internal rationale if beta docs clearly state compatibility is not guaranteed until freeze checks pass.

## Existing Tests And Scripts Found

Scripts in `package.json`:

- `pnpm build`
- `pnpm check`
- `pnpm db:backup`
- `pnpm db:migrate`
- `pnpm db:restore`
- `pnpm db:verify-backup-restore`
- `pnpm dev:api`
- `pnpm dev:web`
- `pnpm auth:verify-oidc-login`
- `pnpm security:verify-restricted-leakage`
- `pnpm start:api`
- `pnpm start:mcp`
- `pnpm test`
- `pnpm typecheck`

Planned but not implemented script names in `docs/BETA_RELEASE_PLAN.md`:

- `openapi:check`
- `smoke:compose`
- `claims:lint`
- `test:uat`

Existing contract-relevant tests:

- `apps/api/src/server.test.ts`
  - health, auth, asset CRUD/review/publish/restore, permissions, search, managed query, evals, provider-routed fallback, OIDC, OpenAPI, JSON export, OKF export, and restricted leakage assertions.
- `packages/cli/src/index.test.ts`
  - search flags to `/search`
  - managed-query flags to `POST /agent/query`
  - admin managed-query policy flags to typed JSON
  - OKF export flags to `/exports/ai-package?format=okf&okfVersion=0.1`
- `packages/mcp-server/src/server.test.ts`
  - core tool registration
  - `search_assets` forwarding with MCP surface headers
  - unauthorized `validate_context_access` result shape
- `packages/schema/src/index.test.ts`
  - governed asset schema
  - managed-query eval input
  - provider-routed managed-query input
  - provider/auth-provider config stubs
  - OKF bundle construction
- `packages/validation/src/index.test.ts`
  - PII redaction and governed asset validation, including restricted public export failures.
- `packages/db/src/index.test.ts`
  - repository and Postgres coverage for assets, auth, grants, retrieval, ranking, evals, telemetry, provider config, cache, policies, action requests, and retention.
- `apps/worker/src/index.test.ts`
  - dry-run/execute maintenance for rotation reminders, eval schedules, and stale action approvals.

## Proposed Beta Contract Freeze Document Outline

Create `docs/BETA_CONTRACT.md` or `docs/contracts/beta-v0.md` with this structure:

1. Status and compatibility promise
   - beta version
   - supported surfaces
   - what is frozen versus preview
   - allowed additive changes
   - breaking-change process
2. Canonical value path
   - setup/auth
   - import/create
   - validate
   - review/publish
   - search/fetch
   - managed query/eval
   - JSON export
   - OKF export
   - telemetry/audit read-back
3. REST/OpenAPI contract
   - beta-critical route table
   - auth requirements
   - required params
   - response schema references
   - error shape and status-code policy
4. CLI contract
   - beta-critical commands and flags
   - environment variables
   - output JSON shape policy
   - exit-code policy
5. MCP contract
   - beta-critical tool names
   - input schema snapshots
   - output content conventions
   - permission-denied behavior
6. SDK contract
   - exported client class
   - constructor options
   - beta-critical methods
   - schema parsing and error policy
7. Export package contracts
   - JSON AI package fields
   - OKF v0.1 fields/files/frontmatter
   - hash semantics
   - immutability/regeneration rules
   - OKF-as-projection boundary
8. Compatibility gates
   - `openapi:check`
   - CLI contract tests
   - MCP contract tests
   - SDK contract tests
   - export fixture tests
   - restricted leakage verifier
   - Compose smoke
9. Preview/long-tail surfaces
   - admin policies
   - provider/OIDC config
   - retention/cache/ranking controls
   - action execution
   - advanced telemetry
10. Migration notes
   - known pre-beta rename risk
   - post-beta deprecation process

## Smoke And Contract Test Plan

### Minimum Local Contract Tests

Add a deterministic contract suite that does not need live provider secrets:

1. `openapi:check`
   - parse `apps/api/src/server.ts` route/method pairs
   - parse `apps/api/src/openapi.ts` paths/methods
   - fail when beta-critical server routes are missing from OpenAPI
   - allowlist meta routes `GET /` and `GET /openapi.json`
2. SDK contract tests
   - mock `fetch`
   - assert URL/method/header/body for `health`, `search`, `managedQuery`, `exportAiPackage`, `exportOkfPackage`, `validateAssets`, `getAsset`, `publishAsset`
   - assert `x-agentic-cms-surface: api` default or configured surface behavior
3. CLI contract tests
   - extend existing stubbed-fetch tests to cover beta-critical commands
   - assert output remains parseable JSON for machine use
4. MCP contract tests
   - snapshot beta-critical tool names and input schemas
   - call `get_asset`, `managed_query`, `generate_ai_export` JSON/OKF, and `validate_context_access`
5. Export shape fixture tests
   - pin JSON top-level and asset fields
   - pin OKF top-level fields, generated file list, concept frontmatter, `sourcePackageHash`, and `projectionHash`
6. Restricted leakage contract test
   - run the existing verifier in CI/release gate
   - explicitly assert restricted content is absent from JSON and OKF package bodies

### Canonical Beta Value Path Smoke

Candidate future `smoke:compose` flow:

1. `docker compose -f compose.yaml -f compose.same-origin.yaml up --build -d postgres api worker web proxy`
2. `GET /health`
3. `GET /openapi.json`
4. `POST /auth/bootstrap`
5. import synthetic corpus with `agentic-cms corpus import`
6. validate corpus with `agentic-cms validate --fail-on-warnings`
7. verify an asset through API `GET /assets/:stableId`
8. review/publish or confirm active approved state
9. create a scoped service-account/API key for machine access
10. grant restricted fixture access for the appropriate surface
11. API `GET /search?query=...&strategy=lexical`
12. CLI `search --query ...`
13. MCP `search_assets`
14. API/CLI/MCP managed query deterministic mode
15. API JSON export from `/exports/ai-package`
16. API/CLI/MCP OKF export with `format=okf&okfVersion=0.1`
17. verify JSON/OKF include public allowed asset and exclude restricted ungranted asset
18. read back `telemetry/summary` and `audit/events`
19. run `security:verify-restricted-leakage`

### Freeze Gate Recommendation

Before beta claim, require:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm security:verify-restricted-leakage`
- `pnpm db:verify-backup-restore`
- `pnpm openapi:check`
- `pnpm smoke:compose`
- beta-critical CLI/MCP/SDK contract tests
- JSON/OKF export fixture tests

## Stop Conditions Checked

No stop condition was triggered.

- No contract mismatch was found that obviously breaks the current demo or public docs.
- Naming differs by surface, but the differences are idiomatic rather than incompatible.
- No route, command, package, tool, or schema rename is recommended in this audit.

## Verification

Read-only checks performed:

- listed route/method pairs from `apps/api/src/server.ts`
- listed OpenAPI path/method pairs from `apps/api/src/openapi.ts`
- ran a local Node route-vs-OpenAPI comparison:
  - server route/method count: 84
  - OpenAPI route/method count: 82
  - missing from OpenAPI: `GET /`, `GET /openapi.json`
  - extra in OpenAPI but missing from server: none
- listed CLI command handlers from `packages/cli/src/index.ts`
- listed MCP registered tool names from `packages/mcp-server/src/server.ts`
- inspected existing tests and package scripts

Product test suite was not run because this was a read-only audit with one required markdown output file and the worktree already contains many unrelated active changes from other workers.

## Open Loops

- Implement `openapi:check`.
- Decide where the beta contract freeze document lives.
- Add SDK-specific contract tests.
- Expand CLI/MCP contract tests for the canonical value path.
- Add JSON/OKF fixture snapshots.
- Wire restricted leakage verification and backup/restore verification into CI/release gates.
- Soften or caveat `docs/TECHNICAL_SPEC.md` wording around the current hand-authored OpenAPI endpoint as a "stable contract target".

## Next Safe Action

Have the manager synthesize this audit with the demo-spine and trust-gates lanes, then create a small implementation task for `openapi:check` plus beta-critical SDK/CLI/MCP/export contract tests.
