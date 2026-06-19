# ForgetBase Shadcn Migration Codebase Map

Status: delegated analysis report
Date: 2026-06-19
Agent: `019edf6a-4a0f-75b1-87ca-390ff002be4a`

## Current State

- Stack: React 19, Vite, Tailwind CSS v4 with shadcn config already present in `components.json`. Aliases point to `@/components/ui`, `@/lib`, and `@/hooks`; ReUI registry is configured but should not be used by default.
- Existing shadcn-style primitives are only `apps/web/src/components/ui/button.tsx` and `apps/web/src/components/ui/badge.tsx`, both still backed by custom `.ui-*` CSS.
- Preserve only color/token values and logo: tokens live in `apps/web/src/styles.css`, the logo is `/favicon.svg` in the app shell, and option 09 is the selected mark in `docs/design/forgetbase-brand/README.md`.
- Current `App.tsx` is still the main owner: 5,235 lines, 101 raw `<button>`, 92 inputs, 38 selects, 29 forms, 26 `routePanelClass(...)` panels, and 79 `request` references.

## Route And Workflow Clusters

### Shell, Auth, And Public Entry

Owns topbar, logo, command entry, health, density, identity, resizable nav, connection bar, public landing, and login dialog.

Primary files:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- later: `apps/web/src/components/shell/*`
- later: `apps/web/src/routes/navigation.ts`

### Read

Routes: `library`, `search`, `asset-read`.

Includes metrics, filters, table, asset detail, trust banner, metadata grid, content tabs, managed query tabs.

Primary files:

- `apps/web/src/App.tsx`
- `apps/web/src/lib/asset-ui.ts`
- later: `apps/web/src/routes/read/*`
- later: `apps/web/src/components/trust/*`
- later: `apps/web/src/components/state/*`

### Work

Routes: `review`, `versions`.

Includes review queue, publish/review/restore, version snapshot/diff. Mutations synchronize detail and list through asset workflow helpers and must not be forked.

Primary files:

- `apps/web/src/App.tsx`
- later: `apps/web/src/routes/work/*`
- later: `apps/web/src/components/release/*`
- later: `apps/web/src/components/diff/*`

### Distribute

Routes: `distribute` plus `exports` alias already exist. Do not add a second Distribute block.

Includes package builder, JSON/OKF export generation, safe preview, consumer snippets, hashes, and omitted/restricted counts.

Primary files:

- `apps/web/src/App.tsx`
- later: `apps/web/src/routes/distribute/*`
- later: `apps/web/src/components/package-builder/*`

### Operate

Routes: `operations`, `access`, `providers`, `policies`, `telemetry`, `approvals`.

Currently one large operations shell with many forms and panels.

Primary files:

- `apps/web/src/App.tsx`
- later: `apps/web/src/routes/operate/{Operations,Access,Providers,Policies,Telemetry,Approvals,TrustConsole}Route.tsx`

## Replace With Shadcn

- Replace raw/custom buttons with generated shadcn `Button`; then retire `.ui-button*`, `button.primary`, and `button.danger`.
- Replace inputs/selects/textareas/labels with shadcn `Input`, `Select`, `Textarea`, `Label`, `Checkbox`, and `Switch`.
- Replace `.tab-bar` with shadcn `Tabs`.
- Replace `.metric`, `.workflow-panel`, `.content-block`, `.ops-pane`, `.export-summary`, and `.detail-pane` with shadcn `Card` composed through domain layout wrappers.
- Replace custom messages/errors with shadcn `Alert` and optional `Sonner`.
- Replace login/confirm flows with `Dialog` and `AlertDialog`; publish, restore, revoke, purge, and generate should not remain raw button actions.
- Replace tables with shadcn `Table`; defer ReUI/DataGrid unless bulk actions, column controls, or advanced filtering become required.
- Replace nav shell with shadcn `Sidebar`, `ScrollArea`, `Button`, `Badge`, and `Sheet` for mobile while keeping ForgetBase's iconless leaf rule.

## Keep As Custom Domain Components

Keep these custom, but build them from shadcn primitives:

- `TrustStateSummary`
- `TrustRail`
- `PermissionReason`
- `SensitivityMarker`
- `SurfaceEligibilityList`
- `ReleaseGatePanel`
- `PackageTrustRail`
- `OmittedItemsList`
- `ConsumerCommandPanel`
- `HashSummary`
- `NoAccessState`
- `RestrictedEvidenceNotice`
- `DefinitionGrid`

Preserve `isPublicReaderEligible` exactly: `public-demo`, `active`, and `approved` in `apps/web/src/lib/asset-ui.ts`, already covered by `apps/web/src/lib/asset-ui.test.ts`.

## Worker Ownership Sequence

### Worker 1: UI Foundation

Own:

- `components.json`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- `apps/web/src/components/ui/*`
- token-only top of `apps/web/src/styles.css`

Add shadcn components selectively. Do not edit `App.tsx`.

### Worker 2: Shell, Nav, Auth, Public Entry

Own:

- `apps/web/src/App.tsx` shell/public sections
- `apps/web/src/components/shell/*`
- `apps/web/src/routes/navigation.ts`
- public/login components
- related shell/public CSS

Preserve logo and nav resize semantics.

### Worker 3: Read

Own:

- `apps/web/src/routes/read/*`
- `apps/web/src/components/trust/*`
- `apps/web/src/components/state/*`
- `apps/web/src/lib/asset-ui.ts` only if tests require helper additions

### Worker 4: Work

Own:

- `apps/web/src/routes/work/*`
- `apps/web/src/components/release/*`
- `apps/web/src/components/diff/*`

Do not fork asset list/detail synchronization.

### Worker 5: Distribute

Own:

- `apps/web/src/routes/distribute/*`
- `apps/web/src/components/package-builder/*`

Reuse existing endpoint construction and generation behavior.

### Worker 6: Operate

Split `routes/operate/{Operations,Access,Providers,Policies,Telemetry,Approvals,TrustConsole}Route.tsx`. Prefer one worker per subroute after API/session boundaries exist.

### Worker 7: Final CSS Cleanup

Own:

- `apps/web/src/styles.css`

Remove unused custom component system after routes no longer reference those selectors. Keep `:root`, `@theme`, responsive layout tokens, and logo sizing.

## High-Risk Couplings

- `request<T>` is the auth/security boundary: web surface header, bearer auth, CSRF, `credentials: include`, and JSON errors. Do not duplicate it.
- Session/auth state and local storage span app startup, login, logout, refresh, and cookie session behavior.
- Managed query mutates feedback telemetry state; extraction must keep telemetry handoff.
- Global `button`, `input`, `select`, and `textarea` selectors in `styles.css` will interfere with full shadcn until removed.
- Design docs are partly stale: IA docs say Distribute is missing, but live code already has `distribute` route values and nav.

## Acceptance Checks

Commands:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
```

Regression smoke:

- login/session
- refresh assets
- select asset
- public-reader gating
- search
- managed query answer/evidence/diagnostics
- review/publish/restore
- JSON and OKF package generation
- no raw secret leakage
- logout clears protected data

Optional local leakage check when a running API stack exists:

```bash
npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

UI grep gates after each cluster:

- no route-owned raw `<button>`
- no new `.ui-*`
- no live `tab-bar`, `ops-form`, `metadata-grid`, `workflow-panel`, or `metric` dependencies outside wrappers

Browser checks:

- desktop
- 860 px
- 560 px
- 320 px
- no text overflow
- dialog focus works
- mobile nav uses sheet or equivalent responsive pattern
- restricted/denied states do not expose snippets

## Evidence

Inspected by delegated analysis:

- `AGENTS.md`
- `docs/design/README.md`
- `docs/design/forgetbase-brand/README.md`
- `work/beta-execution/app-ia-screen-specs.md`
- `work/beta-execution/codebase-refactor-readiness.md`
- `components.json`
- `apps/web/package.json`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/ui/*`
- `apps/web/src/lib/asset-ui.ts`
- `apps/web/src/lib/asset-ui.test.ts`
- `apps/web/vite.config.ts`
- `package.json`
- `pnpm-workspace.yaml`

Commands used by delegated analysis:

```bash
git status --short
wc -l
rg --files
rg -n
rg -c
nl -ba
sed
```

No tests were run in the delegated analysis pass.
