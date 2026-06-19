# Codebase Refactor Readiness

Status: planning artifact
Last updated: 2026-06-19
Owner: delegated refactor-readiness lane from manager thread `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Scope

This is a low-risk readiness plan for decomposing the current React web app, especially `apps/web/src/App.tsx`, before beta UI implementation. It is not a broad refactor and does not change runtime behavior.

The practical goal is to let a later UI worker start with one narrow extraction, preserve browser-auth and permission-aware behavior, and have an obvious rollback path.

## Files Inspected

- `work/beta-execution/manager-execution-map.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/design/README.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/lib/utils.ts`
- `apps/web/src/local-dev-auth.ts`
- `apps/web/src/local-dev-auth.test.ts`
- `apps/web/package.json`
- `apps/web/vite.config.ts`

## Metrics Used

- `apps/web/src/App.tsx`: 5,094 lines.
- `apps/web/src/styles.css`: 1,690 lines.
- Local UI primitives currently present: 2 files, `Button` and `Badge`.
- Route values in `App.tsx`: 12 logical routes: `library`, `search`, `asset-read`, `review`, `versions`, `operations`, `access`, `providers`, `policies`, `telemetry`, `approvals`, `exports`.
- Render roots: 3 top-level page sections: library/read/version, search/query, operations.
- `useState` calls in `App.tsx`: 74.
- `useEffect` calls in `App.tsx`: 13.
- `useMemo` calls in `App.tsx`: 3.
- In-component function declarations before render close: 81.
- `request<T>` calls: 79. Raw `fetch` calls: 1, inside `request<T>`.
- `routePanelClass(...)` render branches: 26.
- Forms in `App.tsx`: 30.
- Existing web test coverage found: `apps/web/src/local-dev-auth.test.ts`; no direct `App.tsx` or browser UAT tests found.

## Current `App.tsx` Responsibility Map

### Shell, routing, and navigation

Lines 134-159 define hash route values. Lines 2357-2361 update `currentPage` and `window.location.hash`. Lines 2387-2429 build the current nav tree inline. Lines 2432-4788 render both the authenticated app shell and unauthenticated sign-in shell.

Current routes are grouped as Read, Work, and Operate, but Distribute is not yet a top-level surface. Export behavior exists under Operate as `exports`.

### Browser auth and API transport

Lines 237-248 hold API URL, bearer key, session-cookie state, auth state, principal, login credentials, and OIDC provider state. Lines 614-655 define `request<T>`, which owns:

- API base URL normalization.
- `x-forgetbase-surface: web`.
- Bearer authorization.
- CSRF header attachment for unsafe cookie-backed requests.
- `credentials: include`.
- JSON/error normalization.

Lines 657-919 handle health, session check, login, logout, OIDC start/callback, and initial asset refresh.

This is the highest-risk coupling. Route extraction should not fork request/auth behavior.

### Read and governed library

Lines 249-257 hold asset list, selected asset, asset detail, content view, version snapshot, review due date, and workflow note state. Lines 446-470 derive selected asset, current version, and filtered library assets. Lines 2547-2895 render library metrics, filters, table selection, governed reader, trust metadata, release controls, content tabs, and version compare.

Public-reader gating is local and explicit: `isPublicReaderEligible(...)` at lines 4812-4814 requires `public-demo`, `active`, and `approved`. This rule also appears in the library table, detail badge, and beta design guidance. It must remain a shared helper with tests before any public/anonymous route is introduced.

### Search and managed query

Lines 258-267 hold search and managed-query form/result state. Lines 1050-1094 run search and managed query. Lines 2897-3064 render the search pane, managed-query controls, answer/evidence/diagnostics tabs, denied count, cost, cache, telemetry event ID, warnings, and provider-routed options.

Risk: managed-query success mutates feedback state (`feedbackTelemetryEventId`, `feedbackQuery`) that is rendered later in telemetry. Extracting search without a shared telemetry/feedback boundary can silently break feedback workflows.

### Review, publish, restore, and versions

Lines 253-257, 934-1048, and the reader/version UI at lines 2723-2887 hold version snapshot, review queue, review due date, workflow note, review, publish, restore, and local asset replacement.

Risk: review/publish/restore update both `assetDetail` and the parent `assets` list via `replaceAsset(...)`. A route module should receive a narrow asset workflow controller rather than duplicating list synchronization.

### Operate: access, policy, telemetry, providers, approvals, exports

Lines 268-430 hold export, telemetry, policy, action, access, key, session, feedback, eval, provider, and OIDC config state. Lines 1096-2355 define most operation loaders/mutators. Lines 3066-4732 render a large operations route with `routePanelClass(...)` panels.

Risk: this is several route families collapsed into one render block. It is lower product-risk than auth/read/search, but higher mechanical-risk because it contains many forms and state setters.

### Local helpers and display utilities

Lines 4793-5088 contain helper utilities and form-state interfaces. Some are pure and easy to extract:

- `isPublicReaderEligible`
- `isAssetGovernanceDue`
- `libraryAssetMatches`
- `libraryAssetMatchesView`
- review due date formatters
- badge variant mappers
- number/currency/list formatters
- CSV and nullable-number parsers

These are the best first extraction candidates because rollback is a single import reversal.

## Proposed Extraction Order

### PR 1: Pure web domain utilities

Extract helpers from the bottom of `App.tsx` into `apps/web/src/lib/asset-ui.ts` and `apps/web/src/lib/format.ts`, or one `apps/web/src/lib/app-ui.ts` if the worker wants the smallest first diff.

Move only pure functions first:

- `isPublicReaderEligible`
- `isAssetGovernanceDue`
- `libraryAssetMatches`
- `libraryAssetMatchesView`
- review due date helpers
- badge variant helpers
- simple format/parse helpers

Add focused Vitest coverage for public-reader gating, governance-due behavior, library filter behavior, and parse/format edge cases.

Rollback path: inline the imports back into `App.tsx`; no runtime state shape changes.

### PR 2: Route constants and navigation model

Extract `pageRouteValues`, `operationsRouteValues`, `normalizePageRoute`, nav config types, and nav construction into a route/nav module. Keep rendering in `App.tsx`; only move route vocabulary and derived nav data.

The module should still express current Read, Work, Operate behavior. Do not introduce the final Distribute IA here unless the App IA worker has delivered route specs.

Rollback path: paste constants and `normalizePageRoute` back into `App.tsx`.

### PR 3: Shared API client hook without route movement

Introduce a small `useWebApiClient` or `createWebApiRequest` boundary that preserves the exact current `request<T>` behavior:

- same API URL source,
- same `x-forgetbase-surface: web`,
- same bearer-vs-cookie behavior,
- same CSRF behavior for unsafe methods,
- same `credentials: include`,
- same JSON/error semantics.

Do not move login/session workflows in this PR. Replace call sites with the new request function only after tests cover headers/credentials/CSRF behavior.

Rollback path: restore local `request<T>` and remove the hook import.

### PR 4: Auth/session hook

Extract auth/session state and methods into `useWebSession` only after PR 3 lands. Include:

- `apiUrl`, `apiKey`, `sessionCookieActive`,
- auth state and current principal,
- login form defaults,
- login/logout/OIDC start/callback,
- `initializeSession`, `refreshHealth`, and authenticated `refresh`.

Keep route data loaders in `App.tsx` during this PR. The hook may return a `request` function plus session actions.

Rollback path: revert this PR as a unit. Do not partially keep a duplicated auth request path.

### PR 5: Read/library route module

Extract the library/asset reader/version compare JSX into a route component after helper and auth boundaries are stable. The route should receive a single asset-workflow controller containing:

- asset list and selected asset,
- `assetDetail`, current version, version snapshot,
- library filters,
- review/publish/restore/inspect actions,
- `generateExport` only as a shell action until Distribute is specified.

Do not change public-reader gating. Keep the `public-demo` + `active` + `approved` rule centralized.

Rollback path: re-inline the route component; asset state remains in the parent or asset hook.

### PR 6: Search/managed-query route module

Extract search and managed-query JSX with a dedicated `useManagedQueryWorkflow` only after feedback coupling is explicit. The hook should expose the telemetry event ID handoff to feedback/telemetry intentionally.

Preserve denied-result visibility, answer/evidence/diagnostics tabs, provider-routed controls, cache flag behavior, and message/error propagation.

Rollback path: re-inline component and keep the shared request/auth hook.

### PR 7: Operations subroutes

Split operations into access, providers, policies, telemetry, approvals, and exports route modules. Start with the least coupled panel:

1. Exports summary/read-only generate panel.
2. Telemetry read panels.
3. Provider config panels.
4. Access and API key panels.
5. Policies and approvals last.

This ordering avoids moving the largest form clusters first.

Rollback path: each subroute should be removable independently because the parent still owns route state and request/session behavior.

## Shared Hook And Module Candidates

| Candidate | Purpose | Readiness | Risk |
|---|---|---:|---|
| `lib/asset-ui.ts` | Public-reader eligibility, governance-due checks, library matching, badge mapping | Start now | Low, but public-reader gating needs tests |
| `lib/format.ts` | Dates, counts, retention/cache policy formatting, CSV/nullable parsing | Start now | Low |
| `routes.ts` or `navigation.ts` | Route values, normalization, current nav tree data | Start now | Medium if it accidentally introduces final IA before App IA output |
| `useWebApiClient` | Shared API request with auth headers, CSRF, cookies, JSON errors | Start after helper tests | High because every data call depends on it |
| `useWebSession` | API URL/key/session/principal/login/OIDC/logout/refresh | After API client | High because browser-auth constraints and local split-origin behavior are subtle |
| `useAssetsWorkflow` | Assets, selected asset, detail, version inspect, review/publish/restore | After session | Medium-high because it synchronizes detail and list state |
| `useManagedQueryWorkflow` | Search, managed query, provider mode, cache, result tabs, telemetry handoff | After session | Medium because feedback/telemetry state crosses routes |
| `useOperationsData` families | Access, policy, provider, telemetry, eval, approvals, exports | After routes exist | Medium-high because forms are numerous and error/message handling is shared |

## Risk Notes

- Do not create multiple request clients. The current request path is the security boundary for bearer auth, cookie auth, CSRF, and web-surface headers.
- Do not loosen public-reader gating. The current rule is `public-demo` sensitivity, `active` lifecycle, and `approved` status. Future anonymous/public surfaces need this rule plus server-side permission checks.
- Do not assume hash routes are disposable. Existing navigation, active section logic, and route visibility all depend on `currentPage`.
- Do not move Distribute into the route map until the App IA worker defines the final route names and package-builder screen. The current `exports` panel can be renamed later.
- Do not let route modules own global `message` and `error` differently per route unless a shared notification pattern lands first.
- Avoid styling changes during decomposition. `styles.css` is already large and tightly coupled to current class names.
- Avoid bulk shadcn/ReUI installs. Existing design guidance says adoption is `react-custom-css`, using local tokens and primitives first.

## Test Strategy

### Before any extraction

- Run `npx -y pnpm@11.7.0 --filter @forgetbase/web typecheck`.
- Run `npx -y pnpm@11.7.0 --filter @forgetbase/web test`.
- Capture a lightweight browser smoke checklist manually until Playwright UAT exists:
  - login or API-key session initializes,
  - assets load,
  - selecting an asset loads detail,
  - public-reader badge shows eligible only for `public-demo` + `active` + `approved`,
  - search runs,
  - managed query shows answer/evidence/diagnostics and denied count,
  - review/publish/restore controls still update selected asset and list,
  - export generation still shows asset and denied counts,
  - logout clears loaded protected state.

### PR 1 tests

Add pure unit tests for:

- public-reader gating positive and negative cases,
- governance-due classification,
- library filtering by query, view, and sensitivity,
- date/retention/cache formatting edge cases.

### PR 3 and PR 4 tests

Add request/auth tests using mocked `fetch`, localStorage, and cookies:

- bearer key sets `Authorization` and does not require CSRF,
- unsafe cookie-backed requests attach `x-forgetbase-csrf`,
- requests use `credentials: include`,
- `x-forgetbase-surface` remains `web`,
- local split-origin login keeps the bearer key while same-origin browser login uses the cookie path,
- 401 clears stale bearer/session state without leaving protected route data visible.

### Route extraction tests

Until real browser UAT exists, keep route extraction tests focused on pure helpers and hook behavior. Add Playwright only when the Demo Spine worker defines the canonical path; then cover login, library, asset reader, search, managed query, review/diff, distribute/export, policy/provider/telemetry, and no-access states.

## Boundaries Waiting On App IA And Demo Spine

Wait for App IA output before:

- final route names and hierarchy for Read, Work, Distribute, Operate,
- whether current `exports` becomes `distribute`, `packages`, or another route,
- package-builder steps and object model in UI,
- trust rail layout and composite trust-state indicator,
- first-run, empty, restricted, no-access, and error state specs,
- component inventory beyond current `Button` and `Badge`.

Wait for Demo Spine output before:

- hard-coding walkthrough route order,
- choosing screenshot-critical states,
- adding browser UAT assertions for the 15-minute value path,
- deciding which synthetic corpus rows must appear in the library/search/export screens,
- making export package builder UX prove MCP/API/CLI/OKF handoff.

## First Extraction Recommendation

Start with PR 1: pure utility extraction plus tests. It gives immediate line-count reduction, makes public-reader gating testable, and has the safest rollback path.

Suggested first-file targets:

- `apps/web/src/lib/asset-ui.ts`
- `apps/web/src/lib/asset-ui.test.ts`

Do not move JSX, auth, request handling, or route state in the first extraction.

## Verification Evidence

- Inspected the files listed above.
- Collected line counts, hook counts, route counts, render-root counts, request-call counts, form count, and component inventory.
- No tests were run in this lane because the only change is this planning artifact and the repo worktree already contains broad unowned changes. The plan specifies the first tests to add and the baseline commands future refactor PRs should run.
- No blocking pre-refactor bug was found during this audit. The main blockers are coupling and missing browser/UAT coverage, not an obvious correctness defect requiring an immediate fix.

## Changed

- Added `work/beta-execution/codebase-refactor-readiness.md`.

## Verified

- Verified the plan against the current app file structure, beta plan, design guidance, package scripts, Vite config, and existing web tests.

## Open Loops

- App IA worker must define final four-surface route names and package-builder shape before Distribute implementation.
- Demo Spine worker must define the canonical browser path before Playwright UAT is worth encoding.
- Future implementation worker should run web typecheck/tests before and after each extraction.

## Next Safe Action

- Open a narrow PR that extracts and tests pure asset UI helpers, especially public-reader gating, without moving auth, request, route, or JSX ownership.
