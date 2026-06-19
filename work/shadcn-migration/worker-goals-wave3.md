# Shadcn Migration Wave 3 Worker Goals

Status: prepared
Date: 2026-06-19
Branch: `codex/shadcn-ui-migration`

Use these goals after the authenticated shell/nav/command slice is integrated. Do not run App.tsx route workers concurrently unless their ownership has been narrowed to non-overlapping extracted files.

## Worker Goal: Distribute Route

```text
/goal
Migrate the Distribute route (`#distribute` and `#exports` legacy alias) to shadcn-style route composition while preserving export behavior and beta safety boundaries.

Source of truth:
- /Users/jarel/Documents/forgetbase/AGENTS.md
- /Users/jarel/Documents/forgetbase/work/shadcn-migration/shadcn-target-ux-spec.md
- /Users/jarel/Documents/forgetbase/work/shadcn-migration/route-migration-inventory.md
- current `apps/web/src/App.tsx`, `apps/web/src/styles.css`, and `apps/web/src/components/{ui,app,domain}/**`

Ownership:
- Own only the Distribute UI in `apps/web/src/App.tsx`: the section rendered for `visibleDistributePage`, its package metrics, package builder, package result, legacy `#exports` notice, and consumer examples.
- Own only CSS required for those Distribute selectors in `apps/web/src/styles.css`.
- You may add narrow package-builder components under `apps/web/src/components/package-builder/**`.

Must produce:
- Replace route metrics with `MetricCard`.
- Replace `.workflow-panel.package-builder`, `.export-summary.package-result`, and `.command-examples` with `SectionCard`, `DefinitionGrid`, `StatusAlert`, `EmptyState`, `FormField`, `Input`, `Select`, and `Button`.
- Preserve JSON/OKF endpoint construction and `generateExport` behavior.
- Keep restricted/denied items counted but not previewed.
- Keep `#exports` as a lower-priority alias notice only.

Do not do:
- Do not change export API calls, payloads, `exportPackage` parsing, or OKF semantics.
- Do not expose package bodies, secrets, private content, or restricted snippets.
- Do not edit Read/Work/Operate routes.

Done when:
- web typecheck, web test, web build, and `git diff --check` pass.
- grep in the owned Distribute section no longer shows raw `<input>`, `<select>`, raw `<button>`, `.metric`, `.workflow-panel`, `.export-summary`, or `.command-examples` except where intentionally preserved and documented.
- Final response lists changed files, verification, residual selectors, and screenshots if browser verification was run.

Stop and ask:
- If you need to change API contracts, persist package history, expose export bodies, or alter restricted-content handling.
```

## Worker Goal: Read And Search Routes

```text
/goal
Migrate the Read/Search route cluster (`#library`, `#asset-read`, `#versions`, `#search`) to shadcn-style route composition while preserving governed asset selection, public-reader gating, and managed-query behavior.

Source of truth:
- /Users/jarel/Documents/forgetbase/AGENTS.md
- /Users/jarel/Documents/forgetbase/work/shadcn-migration/shadcn-target-ux-spec.md
- /Users/jarel/Documents/forgetbase/work/shadcn-migration/route-migration-inventory.md
- `apps/web/src/lib/asset-ui.ts` and `apps/web/src/lib/asset-ui.test.ts`
- current `apps/web/src/App.tsx`, `apps/web/src/styles.css`, and `apps/web/src/components/{ui,app,domain}/**`

Ownership:
- Own only the Read/Search UI in `apps/web/src/App.tsx`: sections for `library`, `asset-read`, `versions`, and `search`.
- Own only CSS required for those Read/Search selectors.
- You may add narrow components under `apps/web/src/routes/read/**` or `apps/web/src/components/trust/**` if that reduces App.tsx complexity without changing behavior.

Must produce:
- Replace route metrics with `MetricCard`.
- Replace asset table with `DataTableShell` plus `Table`.
- Replace filter/search/managed-query forms with `Toolbar`, `FormField`, `Input`, `Select`, `Checkbox`, and `Button`.
- Replace detail panels and metadata grids with `SectionCard`, `DefinitionGrid`, and `TrustStateSummary`.
- Replace custom tab bars with `Tabs`.
- Preserve asset row click/keyboard selection, selected state, review/publish/restore calls, version snapshot behavior, managed query tabs, citation/denied counts, cache/telemetry display, and `isPublicReaderEligible`.

Do not do:
- Do not change `isPublicReaderEligible` logic.
- Do not change `request<T>`, managed-query API payloads, or asset state synchronization.
- Do not edit Distribute or Operate route bodies.

Done when:
- web typecheck, web test, web build, and `git diff --check` pass.
- `apps/web/src/lib/asset-ui.test.ts` still passes through the web test command.
- grep in the owned section no longer shows raw form controls, raw tables, `.metric`, `.asset-table`, `.table-scroll`, `.detail-pane`, `.workflow-panel`, `.content-block`, `.tab-bar`, `.metadata-grid`, `.state-pill`, or `.stable-id-chip` except where intentionally preserved and documented.

Stop and ask:
- If migration requires changing public-reader gating, managed query semantics, asset list/detail state shape, or backend API contracts.
```

## Worker Goal: Operate Landing And Actions

```text
/goal
Migrate the Operate landing and shared route action surfaces to shadcn-style composition while preserving all route navigation and load-action behavior.

Source of truth:
- /Users/jarel/Documents/forgetbase/AGENTS.md
- /Users/jarel/Documents/forgetbase/work/shadcn-migration/shadcn-target-ux-spec.md
- /Users/jarel/Documents/forgetbase/work/shadcn-migration/route-migration-inventory.md
- current `apps/web/src/App.tsx`, `apps/web/src/styles.css`, and `apps/web/src/components/{ui,app,domain}/**`

Ownership:
- Own only Operate landing (`currentPage === "operations"`), summary route links, shared operations route action strip, review queue panel, and telemetry summary panel.
- Do not migrate the deep forms in access/providers/policies/telemetry/approvals in this slice.

Must produce:
- Replace `.operations-overview`, `.summary-link`, and shared `.button-row` action strip with `SectionCard`, `MetricCard`, `Toolbar`, `Button`, and `Badge`.
- Replace review queue raw table with `DataTableShell` and `Table`.
- Replace telemetry summary metadata grid with `DefinitionGrid`.
- Preserve `routePanelClass` behavior unless you can remove it only for the owned panels without changing visibility.

Do not do:
- Do not alter load functions, API payloads, route names, hash routing, or deep Operate forms.

Done when:
- web typecheck, web test, web build, and `git diff --check` pass.
- Final response identifies remaining Operate subroute/forms selectors for the next worker.

Stop and ask:
- If you need to change data loading, route state, or admin operation semantics.
```
