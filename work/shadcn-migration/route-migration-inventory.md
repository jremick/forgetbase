# ForgetBase Route Migration Inventory

Status: manager handoff
Date: 2026-06-19
Branch: `codex/shadcn-ui-migration`

## Purpose

This inventory scopes the remaining authenticated route migration after the public entry, foundation primitives, and shell/nav slice. It keeps worker ownership by user-facing outcome, not by arbitrary file location, while acknowledging that `apps/web/src/App.tsx` is still monolithic.

## Current Shared Primitives

- shadcn primitives available: `Alert`, `AlertDialog`, `Badge`, `Button`, `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `DropdownMenu`, `Input`, `Label`, `Pagination`, `Popover`, `Progress`, `ScrollArea`, `Select`, `Separator`, `Sheet`, `Skeleton`, `Sonner`, `Switch`, `Table`, `Tabs`, `Textarea`, `ToggleGroup`, `Tooltip`.
- app compositions available: `RouteHeader`, `SectionCard`, `MetricCard`, `StatusAlert`, `FormField`, `Toolbar`, `DataTableShell`, `DefinitionGrid`, `EmptyState`.
- domain composition available: `TrustStateSummary`.

## Remaining Route Clusters

### Read And Search

Routes: `library`, `asset-read`, `versions`, `search`.

Owned UI:

- metrics at the top of the library route
- library filter bar
- asset table
- detail pane and trust banner
- release control form
- human/instruction/version/raw tabs
- search form and result list
- managed query form, tabs, answer/evidence/diagnostics panels

Replace:

- `.metric` with `MetricCard`
- `.asset-table`, `.table-scroll`, raw `<table>` with `DataTableShell` plus `Table`
- `.library-filter-bar` with `Toolbar`, `FormField`, `Input`, `Select`, `Button`
- `.detail-pane`, `.workflow-panel`, `.content-block` with `SectionCard`, `Card`, `DefinitionGrid`, `TrustStateSummary`
- `.tab-bar` raw buttons with `Tabs`
- raw search/managed query form controls with `FormField`, `Input`, `Select`, `Checkbox`, `Button`

Keep:

- `isPublicReaderEligible` unchanged
- asset row selection behavior, keyboard row selection, selected asset state
- review/publish/restore function calls and version synchronization
- managed query telemetry/cache/citation behavior

Stop and ask:

- any need to alter `request<T>`, managed query response parsing, asset selection state shape, or public-reader gating.

### Distribute

Routes: `distribute`, `exports` alias.

Owned UI:

- package metrics
- package builder form
- local result summary
- safe included-stable-ID list
- consumer command examples
- legacy `#exports` alias notice

Replace:

- `.metric` with `MetricCard`
- `.workflow-panel.package-builder` with `SectionCard`
- `.export-summary.package-result` with `SectionCard`, `DefinitionGrid`, `EmptyState`
- raw form controls with `FormField`, `Input`, `Select`, `Button`
- command examples with `Card`, `Textarea`/`pre` inside a command panel composition, `Button` copy actions
- route message with `StatusAlert`

Keep:

- existing export endpoint construction
- `exportFormat`, `okfVersion`, `packageName`, `exportPackage`, denied count handling
- no package body preview and no restricted content preview
- `#exports` as legacy alias only

Stop and ask:

- any need to persist package history, expose export bodies, or change JSON/OKF response handling.

### Operate Landing And Actions

Routes: `operations`, plus shared action strip for `review`, `access`, `providers`, `policies`, `telemetry`, `approvals`.

Owned UI:

- operations overview summary links
- route action button rows
- review queue table
- telemetry summary cards

Replace:

- `.operations-overview` with `SectionCard` and `MetricCard`
- `.summary-link` raw buttons with `Button`/`Card` compositions
- action strip raw buttons with `Toolbar` and `Button`
- review queue raw table with `DataTableShell` and `Table`
- telemetry summary `.metadata-grid` with `DefinitionGrid`

Keep:

- route navigation target behavior
- routePanelClass visibility behavior until subroutes are extracted
- all load action functions and current state names

Stop and ask:

- any need to split `App.tsx` route state, change load action semantics, or alter telemetry summaries.

### Operate Subroutes And Forms

Routes: `access`, `providers`, `policies`, `telemetry`, `approvals`.

Owned UI:

- telemetry retention, purge, feedback, eval report/history
- managed query policy, ranking, eval schedule, action execution, cache, retention, secrets, PII policy
- users, service accounts, service policy, groups, API keys, login sessions
- model provider config, provider health, auth provider config

Replace:

- `.ops-pane`, `.event-list`, `.ops-form`, `.provider-form`, `.metadata-grid` with `SectionCard`, `FormField`, `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Button`, `DefinitionGrid`, `StatusAlert`, and `DataTableShell`.
- destructive actions such as purge/delete/revoke/execute should use `AlertDialog` where practical.
- long command/action rows should use `Toolbar` and grouped buttons.

Keep:

- every existing form submission handler and state setter
- secret-safe behavior: no secret values printed, stored, or newly exposed
- one-time API key secret shown only when already present in state
- current auth-provider and model-provider config behavior

Stop and ask:

- any need to change API payloads, local state names, secret handling, auth provider behavior, or confirmation semantics.

## Recommended Worker Order

1. Shell/nav/command/connection worker. One worker may touch the shell portion of `App.tsx`.
2. Distribute worker. Lower blast radius and important beta proof path.
3. Read/Search worker. Broader but high user value.
4. Operate landing/actions worker.
5. Operate subroutes/forms workers, split by route if possible.
6. Final CSS cleanup worker, after grep shows routes no longer use bespoke selectors.

## Common Verification

Run after every route cluster:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/web typecheck
npx -y pnpm@11.7.0 --filter @forgetbase/web test
npx -y pnpm@11.7.0 --filter @forgetbase/web build
git diff --check
```

Browser smoke when a preview is running:

- public page still has no visible login form before clicking `Log in`
- authenticated shell route navigation still changes `window.location.hash`
- route content has no horizontal overflow at desktop and 390px mobile
- no console warnings/errors

Final grep gates:

```bash
rg -n '<button|<input|<select|<textarea|<table' apps/web/src/App.tsx
rg -n 'metric|workflow-panel|content-block|ops-pane|detail-pane|tab-bar|library-filter-bar|metadata-grid|table-scroll|asset-table|export-summary|operations-overview|summary-link|state-pill|stable-id-chip' apps/web/src/App.tsx apps/web/src/styles.css
```
