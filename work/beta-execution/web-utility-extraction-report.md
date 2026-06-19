# Web Utility Extraction Report

Status: complete
Date: 2026-06-19
Lane: Web Utility Extraction
Source checkpoint: `work/beta-execution/integration-checkpoint-1.md`

## Summary

Extracted pure asset UI helper logic from `apps/web/src/App.tsx` into `apps/web/src/lib/asset-ui.ts` and added focused Vitest coverage in `apps/web/src/lib/asset-ui.test.ts`.

This lane did not move route IDs, hash routing, API request behavior, auth/session behavior, CSRF handling, route JSX ownership, provider/policy forms, or search/managed-query workflow.

## Pre-Existing Dirty State

The worktree was already dirty before this lane, including:

- `apps/web/src/App.tsx`
- `apps/web/src/lib/`
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/src/styles.css`
- `docs/design/README.md`
- `work/`
- multiple API, worker, DB, MCP, docs, corpus-adjacent, and package files

Because `App.tsx` already contained broad local changes, this lane proceeded only on pure bottom-of-file helpers with clear call sites and left unrelated app changes untouched.

## Files Inspected

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/design/README.md`
- `work/beta-execution/integration-checkpoint-1.md`
- `work/beta-execution/codebase-refactor-readiness.md`
- `work/beta-execution/app-ia-screen-specs.md`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/lib/utils.ts`
- `apps/web/src/local-dev-auth.test.ts`
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/tsconfig.json`

## Files Changed

- `apps/web/src/App.tsx`
- `apps/web/src/lib/asset-ui.ts`
- `apps/web/src/lib/asset-ui.test.ts`
- `work/beta-execution/web-utility-extraction-report.md`

Local restart-state file:

- repo-local ignored ADHD helper session state

## Helpers Moved

Moved to `apps/web/src/lib/asset-ui.ts`:

- `LibraryViewFilter`
- `isPublicReaderEligible`
- `isAssetGovernanceDue`
- `libraryAssetMatches`
- `libraryAssetMatchesView`
- `reviewDueTimestamp`
- `daysUntilReview`
- `isReviewOverdue`
- `formatReviewDue`
- `stateBadgeVariant`
- `sensitivityBadgeVariant`
- `formatDaysUntil`
- `formatCounts`
- `formatList`
- `formatMetric`
- `formatPercent`
- `formatCurrency`
- `parseOptionalNumber`
- `parseCsvInput`
- `formatRetentionDays`
- `formatRetentionInput`
- `parseRetentionInput`
- `policyValue`
- `formatCachePolicyTtl`
- `parseNullablePolicyNumber`

Kept local in `App.tsx`:

- `upsertApiKeyRecords`
- `selectAssetFromRow`
- `keyOwnerLabel`
- `initialsFor`
- `compactMetadata`
- form state interfaces

Rationale: the kept helpers are React/event-specific, API-key/operations-specific, display-shell-specific, or still coupled to local form metadata construction. They are not part of the pure asset UI helper boundary for this lane.

## Tests Added

Added `apps/web/src/lib/asset-ui.test.ts` covering:

- public-reader eligibility requires `public-demo`, `active`, and `approved`
- governance-due classification for unapproved, non-active, overdue, future, and invalid review dates
- library text query matching across title, stable ID, summary, owner, source kind, and source ref
- library view filters for `all`, `public-reader`, `needs-governance`, and `approved-active`
- review-date fallback formatting for invalid dates
- state and sensitivity badge variant mapping
- parse/format helpers for counts, lists, metrics, percentages, currency, retention, nullable policy numbers, optional numbers, CSV input, cache TTL, and policy values

## Commands Run

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
```

Result: failed once due to the new test fixture using `audience: "agents"` instead of the schema array shape. Fixed the fixture to `audience: ["agents"]`.

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
```

Result: passed.

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
```

Result: passed, 2 test files and 12 tests.

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
```

Result: passed.

## Behavior Notes

- Public-reader eligibility is unchanged: anonymous/public-reader eligibility still requires `public-demo`, `active`, and `approved`.
- Governance-due behavior now uses the same extracted helper everywhere `App.tsx` previously referenced it.
- Library filter/view behavior remains owned by `App.tsx` state and JSX, with only pure predicate logic extracted.
- Request, auth, session, bearer/cookie, CSRF, and browser login behavior were not moved.

## Follow-Up Extraction Order

Recommended next order remains:

1. Route constants and navigation model only, preserving existing hash route IDs.
2. Shared API request boundary, with tests for bearer headers, cookie credentials, CSRF, web-surface header, and JSON/error behavior.
3. Auth/session hook only after the request boundary is stable.
4. Read/library route module after helper and auth/request boundaries are stable.
5. Search/managed-query route module after feedback telemetry handoff is explicit.
6. Operations subroutes, starting with exports and telemetry before larger provider/access/policy forms.

Do not start Distribute/package-builder work until this first extraction lane is accepted and the next UI slice is explicitly opened.
