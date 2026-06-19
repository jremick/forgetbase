# Contract Freeze Tests Report

Status: implemented focused beta contract lane
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Summary

Added focused, deterministic contract coverage for the canonical beta machine-consumer path without freezing the full API, CLI, MCP, SDK, admin, operations, hosted-service, or runtime-smoke surfaces.

The frozen beta path is:

1. OpenAPI advertises the canonical fetch/search/export paths: `GET /assets/{stableId}`, `GET /search`, and `GET /exports/ai-package`.
2. API can anonymously fetch/search an active approved `public-demo` asset while excluding a restricted asset from anonymous JSON and OKF exports.
3. SDK maps search plus JSON/OKF export calls to the canonical REST paths with the expected surface and bearer headers.
4. CLI `exports ai-package` maps JSON and OKF flags to the same export path and preserves export metadata in output.
5. MCP exposes the canonical `get_asset`, `search_assets`, and `generate_ai_export` tools and forwards fetch/search/export through the SDK with the `mcp` surface header.
6. JSON export metadata includes stable IDs, source version metadata, allowed surfaces, allowed exports, citation metadata, asset count, and denied count.
7. OKF export metadata includes `okfVersion: "0.1"`, spec metadata, source package hash, projection hash, root index path, generated bundle files, concept frontmatter, source version number, and no restricted instruction content.

## Files Inspected

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/OKF_EXPORTS.md`
- `work/beta-execution/integration-checkpoint-2.md`
- `work/beta-execution/api-cli-mcp-contract-audit.md`
- `work/beta-execution/trust-gates-implementation-report.md`
- `package.json`
- `vitest.config.ts`
- `apps/api/src/openapi.ts`
- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`
- `packages/schema/src/index.ts`
- `packages/sdk/src/index.ts`
- `packages/sdk/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/src/index.test.ts`
- `packages/cli/package.json`
- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/src/server.test.ts`
- `packages/mcp-server/package.json`

## Files Changed

- `package.json`
  - Added `contracts:check`.
  - The script builds only the API/CLI/MCP contract dependency closure, runs `openapi:check`, then runs the focused contract test files.

- `apps/api/src/beta-contract.test.ts`
  - Added an in-memory API contract test for OpenAPI path/parameter exposure, public fetch, public search, JSON export, OKF export, source-version metadata, projection metadata, and restricted export omission.

- `packages/sdk/src/index.test.ts`
  - Added SDK contract coverage for search, JSON export, OKF export, query parameters, bearer auth, and `x-agentic-cms-surface: api`.

- `packages/cli/src/index.test.ts`
  - Strengthened OKF export assertions to cover generated OKF metadata and restricted-content omission.
  - Added JSON export command coverage for path, query parameters, headers, source-version metadata, allowed surfaces, and allowed exports.

- `packages/mcp-server/src/server.test.ts`
  - Strengthened MCP tool-shape assertions for `get_asset`, `search_assets`, and `generate_ai_export`.
  - Added MCP fetch and OKF export forwarding coverage with `x-agentic-cms-surface: mcp`.

## Contract Boundary Covered

Covered and beta-frozen for this lane:

- `GET /assets/{stableId}` as the canonical fetch route for a visible governed asset.
- `GET /search` query, strategy, and limit parameters for permission-filtered search.
- `GET /exports/ai-package` package, format, OKF version, and limit parameters.
- SDK `search()` and `exportAiPackage()` request construction for JSON and OKF.
- CLI `exports ai-package --format json`.
- CLI `exports ai-package --format okf --okf-version 0.1`.
- MCP `get_asset`, `search_assets`, and `generate_ai_export` tool names, input shape, and API forwarding.
- JSON AI export package metadata for a synthetic public asset plus denied restricted asset count.
- OKF v0.1 projection metadata and concept frontmatter generated from the JSON package.

## Remaining Preview Or Unfrozen Surfaces

Not frozen by this lane:

- Full API route inventory beyond the OpenAPI drift gate and the canonical fetch/search/export path.
- All admin, auth administration, provider, cache, telemetry-retention, action, OIDC, and operations routes.
- Full CLI command tree beyond search and export command contract tests already present here.
- Full MCP tool catalog beyond `get_asset`, `search_assets`, `generate_ai_export`, `list_asset_types`, and `validate_context_access` coverage.
- Hosted-service behavior, Railway behavior, browser UI behavior, Docker Compose runtime behavior, and runtime leakage smoke.
- Enterprise identity completeness, full orchestration/action adapters, production readiness, and complete API stability.
- OKF spec versions beyond `0.1`.

## Command Evidence

Commands run:

```bash
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 openapi:check
```

Observed results:

- `contracts:check`: passed. It built the targeted API/CLI/MCP dependency closure, ran `openapi:check`, then ran 4 focused contract test files with 11 passing tests.
- `openapi:check`: passed. It reported 82 documented OpenAPI route/method pairs matching 84 server route/method pairs with 2 explicit meta-route exceptions.

The first `contracts:check` run failed only because the new tests expected an invented OKF concept filename and export citation title. The assertions were corrected to match the actual generated beta contract: concept filenames use a slug plus deterministic hash, and the citation title comes from the exported instruction source.

## Notes

- No Docker, live API, secrets, web UI, corpus, Compose, claims lint, or runtime smoke files were changed for this lane.
- `package.json` already had unrelated uncommitted script changes from other lanes in this worktree. This lane only added `contracts:check` on top of the current working tree and did not revert those changes.
- The contract checks are deterministic and secret-free.

## Next Safe Action

Run the next integration checkpoint after runtime-smoke and Distribute workers finish, then decide whether `contracts:check` should enter CI beside `openapi:check` and `claims:lint`.
