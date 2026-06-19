# ForgetBase Shadcn UI Migration Manager Map

Status: active manager plan
Date: 2026-06-19
Branch: `codex/shadcn-ui-migration`
Manager goal: migrate the ForgetBase web UI to a shadcn/ui-based interface while preserving only the existing color scheme and custom logo.

## Objective

Implement a full shadcn/ui migration for `apps/web` without changing product claims, auth/security behavior, API contracts, or the public synthetic-content boundary.

The migration should replace the bespoke UI language with shadcn-style elements, layout primitives, and interaction patterns. Preserve only:

- existing ForgetBase color scheme and semantic CSS variables in `apps/web/src/styles.css`
- existing custom logo/favicon mark at `apps/web/public/favicon.svg`
- product/domain behavior, copy boundaries, and route workflows

## Source Of Truth

Read before implementation:

- `AGENTS.md`
- `components.json`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/DEVELOPMENT.md`
- `docs/MVP_SCOPE.md`
- `docs/design/README.md`
- `docs/design/forgetbase-brand/README.md`
- `work/beta-execution/app-ia-screen-specs.md`
- `work/beta-execution/codebase-refactor-readiness.md`
- `work/beta-execution/distribute-surface-mvp-report.md`
- `work/beta-execution/landing-browser-uat-report.md`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/ui/*`
- `apps/web/src/lib/*`

Current framework facts:

- React 19, Vite, TypeScript, Tailwind CSS v4.
- `components.json` already exists and uses Tailwind v4 configless setup, `apps/web/src/styles.css`, `@` alias, lucide icons, and ReUI registry namespace.
- Existing shadcn-style primitives are `Button` and `Badge`.
- `App.tsx` is still a large monolith and must be migrated in controlled slices.

Current shadcn doc grounding:

- Vite + Tailwind v4 `components.json` should use empty `tailwind.config`, CSS entry path, semantic CSS variables, aliases for `@/components`, `@/components/ui`, `@/lib/utils`, and lucide icons.
- shadcn code is project code after install and must be reviewed.
- Use targeted component installation, not `add --all`.

## Migration Principles

- Full shadcn migration means replacing the visible UI component language, not merely adding a few primitives.
- Preserve behavior first: auth/session cookies, CSRF, permission-aware retrieval, public-reader gating, route hash behavior, and export safety cannot regress.
- Keep the product operational and dense. This is a work console, not a marketing app.
- Do not introduce new colors, decorative gradients, oversized hero language, fake production claims, or private data.
- Keep sub-page nav leaves iconless by default unless explicitly configured.
- Treat `Distribute` as a first-class product surface.
- Prefer shadcn core for foundational elements. Use ReUI only for richer data/grid/filter patterns when a slice truly needs it.
- Keep file ownership narrow for delegated workers.

## First-Wave Delegation

### Lane A: Codebase Migration Map

Agent: `019edf6a-4a0f-75b1-87ca-390ff002be4a`
Type: read-only codebase analysis
Artifact: `work/shadcn-migration/codebase-migration-map.md`

Must produce:

- current UI surface inventory
- route/workflow clusters
- component inventory to replace
- recommended migration sequence
- exact file ownership boundaries for later workers
- high-risk coupling notes
- acceptance checks

Do not edit app source.

### Lane B: Target UX Spec

Agent: `019edf6b-366a-7393-ae85-5d5ce7872ae6`
Type: local-doc-only design/spec worker
Artifact: `work/shadcn-migration/shadcn-target-ux-spec.md`

Must produce:

- target app shell, navigation, landing/auth, Read, Work, Distribute, Operate layouts
- shadcn component choices per surface
- density rules
- empty/loading/error states
- responsive behavior
- accessibility/focus requirements
- visual acceptance checklist

Do not edit app source.

### Lane C: Shadcn Foundation Components

Agent: `019edf6a-c66a-7e72-ac4e-908d2397dab4`
Type: implementation worker
Owned files:

- `components.json`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- `apps/web/src/components/ui/**`
- `apps/web/src/hooks/**` if needed
- shadcn token/base utility section of `apps/web/src/styles.css`

Must add/verify local shadcn-compatible primitives:

- input
- label
- textarea
- select
- checkbox
- switch
- tabs
- dialog
- sheet
- tooltip
- table
- card
- alert
- skeleton
- separator
- breadcrumb
- pagination
- dropdown-menu
- popover
- progress
- scroll-area
- sonner/toast if compatible

Do not edit `App.tsx` or route/business logic.

Verification:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
```

## Planned Implementation Waves

### Wave 1: Foundation And Public Entry

Dependencies:

- Lane C complete.
- Lane B gives target public/auth layout.

Owner: manager or one worker after foundation lands.
Files likely owned:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/ui/**` only if a primitive bug is found

Scope:

- Replace public landing/auth CTA/login dialog with shadcn `Button`, `Card`, `Dialog`, `Input`, `Label`, `Alert`, `Separator`, and responsive layout classes.
- Preserve current copy safety and no-prefill login behavior.
- Preserve existing logo and color variables only.
- Remove bespoke public-entry CSS that becomes unused.

Acceptance:

- Initial public home has no inline login form.
- `Log in` opens a shadcn dialog with only username/email and password.
- No API key, tenant, or SSO controls on unauthenticated home.
- Stale login localStorage keys clear on reload.
- Desktop and mobile have no horizontal overflow.

### Wave 2: App Shell And Navigation

Dependencies:

- Codebase map and UX spec accepted.
- Public entry migrated or not conflicting.

Files likely owned:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- optional `apps/web/src/components/app/**`

Scope:

- Replace topbar, side nav, route header, identity, health, density control, and command/search button with shadcn-style layout and controls.
- Use shadcn `Sidebar` only if it fits the existing resizable tree behavior; otherwise compose with `Button`, `ScrollArea`, `Separator`, `Tooltip`, and local nav data.
- Keep hash routes and resizable nav behavior unless explicitly replaced with equal-or-better behavior.

Acceptance:

- Current route highlighting works.
- Keyboard nav resize still works if preserved.
- Leaf nav items remain iconless by default.
- Topbar command/search remains accessible.
- Authenticated app shell renders desktop and mobile without overlap.

### Wave 3: Shared Forms, Tables, Tabs, Cards

Dependencies:

- Foundation components complete.
- App shell stable.

Files likely owned:

- `apps/web/src/App.tsx`
- `apps/web/src/components/app/**`
- `apps/web/src/styles.css`

Scope:

- Replace generic form fields, filter bars, metrics, section panels, tables, and tabs with shadcn `Input`, `Label`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Card`, `Table`, `Tabs`, `Badge`, `Alert`, `Skeleton`, `Progress`, `Tooltip`.
- Start by creating local domain compositions like `MetricCard`, `RouteHeader`, `SectionCard`, `FormGrid`, `StatusAlert`, and `DataTableShell` that wrap shadcn primitives.

Acceptance:

- No route loses a form control, button, table column, status indicator, or message/error state.
- All forms retain labels and disabled/loading states.
- Tables remain scannable and keyboard-readable.

### Wave 4: Read And Work Routes

Dependencies:

- Shared domain compositions exist.

Files likely owned:

- `apps/web/src/App.tsx`
- optional `apps/web/src/components/routes/read/**`
- optional `apps/web/src/components/routes/work/**`
- `apps/web/src/lib/asset-ui.ts`

Scope:

- Migrate Library, Asset Reader, Search, Managed Query, Review, and Versions to shadcn-based cards/tables/tabs/alerts.
- Keep public-reader eligibility centralized.
- Keep denied/restricted evidence non-leaking.

Acceptance:

- Reader can search/open permitted asset.
- Trust/provenance remains visible.
- Managed query tabs still separate answer/evidence/denied/diagnostics.
- Review/publish/restore still update both asset detail and list.

### Wave 5: Distribute And Operate Routes

Dependencies:

- Shared domain compositions exist.
- Distribute UX spec accepted.

Files likely owned:

- `apps/web/src/App.tsx`
- optional `apps/web/src/components/routes/distribute/**`
- optional `apps/web/src/components/routes/operate/**`

Scope:

- Migrate Distribute package builder, export preview/results, Access, Providers, Policies, Telemetry, Approvals, and API key/session controls to shadcn forms/tables/dialogs/cards.
- If ReUI is used, use it only for high-value data-grid/filter patterns and document the reason.

Acceptance:

- JSON/OKF package generation still works.
- Safe package preview does not expose obvious body previews.
- Admin/provider/policy forms preserve values and submit behavior.
- API key/session controls do not expose raw secrets.

### Wave 6: Cleanup, Verification, Deployment

Scope:

- Remove unused bespoke CSS classes and dead custom component styles.
- Review dependency surface and prune unused packages.
- Run final checks and browser verification.
- Push branch and open PR or merge/push if instructed.
- Deploy only after checks pass and live private deployment is explicitly in scope.

Verification:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 typecheck
```

Browser checks:

- local preview desktop 1440x1000
- local preview mobile 390x844
- unauthenticated home
- login dialog no-prefill
- authenticated Read/Work/Distribute/Operate smoke if credentials/local demo stack are available

Live deployment checks if deployed:

- `https://askbase.dev/` serves new bundle.
- `/api/health` returns OK.
- `/api/assets` unauthenticated remains 401.
- `/api/auth/bootstrap` remains unavailable.
- desktop/mobile browser checks pass.

## Exact Future Worker Goal Prompts

### Worker: Public Entry Migration

```text
/goal Migrate ForgetBase public landing/auth entry to shadcn/ui primitives while preserving current behavior and only the existing colors/logo. Start by reading work/shadcn-migration/manager-execution-map.md, work/shadcn-migration/shadcn-target-ux-spec.md, apps/web/src/App.tsx, apps/web/src/styles.css, and apps/web/src/components/ui. Own only the unauthenticated render branch in App.tsx, related public/auth CSS, and any tiny local domain component extracted for that branch. Replace bespoke public panels/buttons/dialog/login fields with shadcn Button, Card, Dialog, Input, Label, Alert, Separator, and responsive layout. Preserve no-prefill login behavior, hidden beta tenant fallback, claim-safe copy, and no API-key/tenant/SSO controls on the public page. Do not edit authenticated route behavior. Done when web test/build pass and Playwright/local browser checks prove initial home has no login fields, Log in opens a blank username/email plus password dialog, stale login storage is cleared, and desktop/mobile have no overflow.
```

### Worker: App Shell Migration

```text
/goal Migrate the authenticated ForgetBase app shell and navigation to shadcn-style layout while preserving route behavior, auth behavior, color variables, and logo. Start by reading work/shadcn-migration/manager-execution-map.md, work/shadcn-migration/codebase-migration-map.md, work/shadcn-migration/shadcn-target-ux-spec.md, apps/web/src/App.tsx, apps/web/src/styles.css, and components.json. Own only shell/nav/topbar/header CSS and JSX plus small local app-shell components if useful. Replace bespoke topbar/nav/control wrappers with shadcn Button, Tooltip, ScrollArea, Separator, Sheet/Dialog where appropriate, and dense layout primitives. Preserve hash routes, active route state, leaf iconless rule, health indicator, density toggle, identity, command/search entry, and no auth/session regressions. Done when web test/build pass and browser checks verify authenticated shell desktop/mobile render, active nav, command button, density toggle, and no overlap/overflow.
```

### Worker: Read And Work Routes Migration

```text
/goal Migrate ForgetBase Read and Work surfaces to shadcn/ui components without changing data behavior. Start by reading work/shadcn-migration/manager-execution-map.md, work/beta-execution/app-ia-screen-specs.md, apps/web/src/App.tsx, apps/web/src/styles.css, apps/web/src/lib/asset-ui.ts, and apps/web/src/components/ui. Own Library, Asset Reader, Search/Managed Query, Review Queue, and Versions JSX/CSS only. Replace bespoke metrics, cards, filters, forms, tables, tabs, alerts, and trust panels with shadcn Card, Table, Tabs, Input, Select, Badge, Alert, Skeleton, Tooltip, Progress, and Separator compositions. Preserve public-reader eligibility, denied/restricted non-leakage, search/query behavior, version inspect/restore, review/publish synchronization, and all labels/states. Done when web test/build pass and browser checks verify Library, Asset Reader, Search/Managed Query, Review, and Versions on desktop/mobile with no lost controls or overflow.
```

### Worker: Distribute And Operate Routes Migration

```text
/goal Migrate ForgetBase Distribute and Operate surfaces to shadcn/ui components without changing API behavior or security posture. Start by reading work/shadcn-migration/manager-execution-map.md, work/beta-execution/distribute-surface-mvp-report.md, work/beta-execution/app-ia-screen-specs.md, apps/web/src/App.tsx, apps/web/src/styles.css, and apps/web/src/components/ui. Own Distribute/Exports, Access, Providers, Policies, Telemetry, Approvals, API keys, and Sessions JSX/CSS only. Replace bespoke panels, package builder controls, forms, tables, tabs, and status blocks with shadcn Card, Table, Tabs, Input, Select, Textarea, Checkbox/Switch, Dialog/Popover, Alert, Badge, Progress, Tooltip, Separator, and Skeleton. Preserve JSON/OKF package generation, safe preview behavior, admin/provider/policy submit behavior, API key/session secret safety, and claim-safe copy. Done when web test/build pass and browser checks verify package generation plus representative Operate forms on desktop/mobile.
```

### Worker: Final UI QA And Deployment Readiness

```text
/goal Perform final QA for the ForgetBase shadcn UI migration and prepare deploy readiness evidence. Start by reading work/shadcn-migration/manager-execution-map.md, docs/DEVELOPMENT.md, apps/web/src/App.tsx, apps/web/src/styles.css, and the final diff. Do not implement broad feature changes; only fix small visual/test regressions in files touched by the migration. Verify test/build/claims/typecheck, inspect unused CSS/dependencies, run local browser checks at desktop 1440x1000 and mobile 390x844 for unauth home, login dialog, Read, Work, Distribute, and Operate representative flows. Produce work/shadcn-migration/final-qa-report.md with commands, screenshots or Playwright assertions, remaining risks, and deploy recommendation. Done when the report supports a go/no-go decision and any small fixes are included.
```

## Stop Rules

Pause for manager judgment only if:

- a required source file or shadcn setup file is missing in a way that changes the migration strategy
- shadcn CLI wants to overwrite brand tokens or delete existing primitives
- auth/session/CSRF behavior requires changes outside UI migration
- route behavior or API contracts would need to change
- a worker needs live secrets or private data
- dependency footprint expands far beyond shadcn/Radix primitives

Do not pause for minor design choices. Choose the most shadcn-native, dense, accessible option aligned to the goal and record the decision.

## Manager Acceptance Criteria

The migration is complete only when:

- The app visibly uses shadcn-style primitives/compositions for buttons, badges, inputs, labels, selects, textareas, checkboxes/switches, tabs, dialogs/sheets, tooltips, tables, cards, alerts, skeletons, separators, breadcrumbs/pagination where applicable, dropdowns/popovers, progress, and scroll areas.
- Existing ForgetBase color scheme and logo remain.
- No old bespoke visual system dominates the final UI.
- Public no-prefill login behavior remains.
- Public content remains synthetic/claim-safe.
- API/auth/CSRF/session behavior remains intact.
- Read, Work, Distribute, and Operate representative paths pass browser checks.
- `npx -y pnpm@11.7.0 --filter @agentic-cms/web test` passes.
- `npx -y pnpm@11.7.0 --filter @agentic-cms/web build` passes.
- `npx -y pnpm@11.7.0 claims:lint` passes.
- Final diff is reviewed for unused bespoke CSS and dependency bloat.
