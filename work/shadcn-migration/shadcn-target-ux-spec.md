# ForgetBase shadcn Target UX Spec

Status: worker specification
Last updated: 2026-06-19
Scope: local-doc-only shadcn/ui target design direction for the ForgetBase web app migration

## Summary

ForgetBase should migrate from the current bespoke operational UI language to a shadcn/ui product-console language while preserving the product thesis, information architecture, existing color scheme CSS variables, and selected custom logo/favicon mark.

The target experience is a quiet, dense, agent-native instruction control plane. It should feel like a governed operational console for technical teams, not a marketing site, generic wiki, decorative AI dashboard, or broad enterprise-search product.

This report is a design migration handoff only. It does not change source code outside this report.

## Source Files Inspected

- `docs/BETA_RELEASE_PLAN.md`
- `docs/design/README.md`
- `docs/design/forgetbase-brand/README.md`
- `work/beta-execution/app-ia-screen-specs.md`
- `work/beta-execution/landing-browser-uat-report.md`
- `work/beta-execution/distribute-surface-mvp-report.md`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`

Additional local implementation context inspected:

- `components.json`
- `apps/web/package.json`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/lib/utils.ts`
- `apps/web/index.html`

No web research was used.

## Migration Decision

This spec should be treated as the newer design package for the shadcn migration. It supersedes the prior bespoke visual language in the static design package and current React CSS, while keeping the same product model and public content boundary.

No stop-and-ask condition was hit. The instruction to preserve only colors and logo/favicon does not conflict with a hard product requirement because the required product behaviors are IA, permissioning, distribution, trust, leakage safety, and beta claim boundaries. Those can be preserved while replacing the UI language.

## Preserve Exactly

Preserve only these visual identity elements:

- Existing color scheme CSS variables and their current semantic intent in `apps/web/src/styles.css`, including neutral, brand, success, warning, destructive, focus, background, foreground, card, popover, primary, secondary, muted, accent, border, input, ring, info, success, warning, destructive, and invert tokens.
- The custom ForgetBase mark selected from `docs/design/forgetbase-brand/marks/09-dissolve.svg`.
- The app favicon/logo path behavior that uses `/favicon.svg`, with the mark derived from option 09.

Implementation implication:

- shadcn components should map onto the existing CSS variables.
- Do not introduce new brand colors, decorative gradients, or one-off hard-coded component colors.
- Replace any remaining hard-coded non-token UI colors with existing semantic variables.
- Do not preserve bespoke shape, spacing, card, nav, tab, form, table, badge, or button styling as brand requirements.

## Replace Explicitly

Replace these current bespoke patterns with shadcn-style primitives and compositions:

- Bespoke cards and panels: `metric`, `workflow-panel`, `detail-pane`, `ops-pane`, `content-block`, `export-summary`, `operations-overview`, and similar local panel classes.
- Bespoke buttons: raw `button` styles and route-specific button classes.
- Bespoke badges and pills: `state-pill`, `nav-badge`, `stable-id-chip`, bespoke sensitivity chips, and ad hoc status pills.
- Bespoke forms: hand-rolled label/input/select/checkbox layouts, especially operational forms and package-builder controls.
- Bespoke tables: raw table styling, clickable rows without a reusable table composition, and custom table scroll wrappers.
- Bespoke tabs: `tab-bar` and custom tab button state.
- Bespoke dialogs: `login-dialog`, confirmation overlays, and any future modal-like custom panels.
- Bespoke navigation containers: `side-nav`, `tree-nav`, `nav-folder`, `nav-link`, glyph pills, and custom branch lines.
- Bespoke filter bars: `library-filter-bar` and local search/filter strips.
- Bespoke layout primitives: page grids, nested section wrappers, route-specific panel grids, and card-like page sections.

Custom product components remain appropriate only when they encode governed-instruction semantics, such as trust state, permissions, package eligibility, omitted items, release gates, and no-access behavior. Those custom components should still be built from shadcn primitives.

## Product Guardrails

- Keep Read, Work, Distribute, and Operate as the top-level product model.
- Keep Distribute first-class. It must not regress into an Operate/export utility.
- Keep public/demo surfaces synthetic and reusable only.
- Do not show private source exports, customer/staff/company content, credentials, auth dumps, raw telemetry, or private snippets.
- Do not claim production readiness, hosted-service maturity, enterprise SSO/SCIM completion, full managed-agent orchestration, broad enterprise-search parity, or certification-level compliance.
- Keep web UI as an operational surface. APIs, CLI, MCP, OKF, JSON, and agent consumers remain primary product consumers.
- Use real product proof and command/config snippets. Avoid abstract gradients, decorative hero patterns, and generic AI dashboard visuals.

## shadcn Adoption Mode

Adoption mode: `react-custom-css` migration.

Current evidence:

- React 19 and Vite are present.
- Tailwind v4 is present through `apps/web/src/styles.css`.
- `components.json` is already configured with shadcn aliases, Tailwind CSS entry, lucide icons, and the ReUI registry namespace.
- Local shadcn-style `Button` and `Badge` already exist.
- Current UI is still largely monolithic and bespoke in `apps/web/src/App.tsx` and `apps/web/src/styles.css`.

Migration rule:

- Install or author only the shadcn components needed by the current slice.
- Review imported/generated shadcn code as project code.
- Prefer shadcn core components first.
- Use ReUI registry components only when a route needs richer console behavior such as data grid, filters, stepper, timeline, or tree behavior that shadcn core cannot cover cleanly.

## Target App Shell

### Desktop Layout

Target structure:

```text
Top app bar
  Brand mark/name
  Global command/search
  API health
  Density control
  Identity/session menu

Sidebar
  Read
  Work
  Distribute
  Operate

Main content
  Breadcrumb
  Route header
  Local action bar
  Route content
```

shadcn component choices:

- `Sidebar`, `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuSub`, `SidebarInset` for shell and navigation.
- `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` if retaining desktop nav width resizing.
- `Command`, `Dialog` or `Sheet` for global command/search.
- `Breadcrumb` for route location and asset/package context.
- `Button` for all actions.
- `Badge` for health, route counts, trust, lifecycle, status, sensitivity, denied counts, and alias markers.
- `Tooltip` for icon-only actions and compact status controls.
- `DropdownMenu` for identity/session controls.
- `ToggleGroup` or `Button` variant for density mode.
- `Separator` for structural boundaries.
- `Alert` for route-level message/error states.
- `Skeleton` for route loading states.

Behavior:

- Top bar remains sticky on desktop.
- Sidebar is persistent on desktop and collapsible.
- Current page state uses `aria-current="page"` on the active leaf only.
- Sidebar group rows may use lucide icons. Leaf rows should be text-only by default unless a route explicitly needs an icon.
- Route headers should be compact: eyebrow, H1, one-line lede where useful, and a small action cluster.
- Avoid nested cards. Use one route-level content layout, then shadcn components inside it.

### Global Command

Target:

- Replace the current topbar command button that navigates to Search with a real command/search surface.
- Open with `Cmd+K` / `Ctrl+K`.
- Include commands for route navigation, asset lookup, review queue, package builder, provider/policy pages, and trust console.
- Show permitted search results only. Restricted result counts may appear only if policy allows.

shadcn components:

- `Command`
- `Dialog` on desktop, `Sheet` on mobile if needed
- `Input`
- `Badge`
- `ScrollArea`
- `Separator`
- `Button`

Acceptance:

- Keyboard user can open, search, navigate, submit, and close without pointer input.
- Focus returns to the command trigger after close.
- Restricted snippets are never exposed.

## Navigation

Primary groups:

```text
Read
  Library
  Search / query
  Asset reader
  Restricted / unavailable

Work
  Review queue
  Version diff
  Publish gates
  Asset audit

Distribute
  Package builder
  Packages
  MCP setup
  CLI setup
  API consumers
  Export history

Operate
  Operations
  Access
  Providers
  Policies
  Telemetry
  Approvals
  Trust console
```

Target rules:

- Distribute is a top-level group and `#exports` remains only a legacy alias if kept.
- Leaf rows are iconless by default.
- Counts use `Badge` slots, not custom pills.
- The legacy alias must be visually lower priority than `Package builder`.
- Hidden routes such as restricted/unavailable states should still have route-level UI, but they do not need a permanent sidebar leaf unless useful for UAT.
- Sidebar content scrolls independently and does not trap keyboard focus.

shadcn component choices:

- `Sidebar` family for nav containers.
- `Collapsible` for group expand/collapse if groups become collapsible.
- `Badge` for counts and alias tags.
- `Tooltip` for collapsed sidebar labels.
- `ScrollArea` for long nav.

## Landing And Auth

Target:

- Keep the accepted claim-safe public entry, but migrate it away from marketing-hero styling into a shadcn product-entry composition.
- First viewport should show the product proof path and auth entry, not a decorative hero.
- Preserve copy constraints from the beta plan and landing UAT report.
- The primary unauthenticated story remains: governed instructions for AI agents, self-hosted.
- The demo path should still queue `#distribute` after login.

Layout:

```text
Public top bar
  Logo/name
  Run locally
  View demo
  Sign in

Main
  Compact value statement
  Product proof preview
  Auth card or login dialog
  Beta boundary panel
```

shadcn component choices:

- `Button` for CTAs.
- `Card` only for the login/auth panel and repeated proof panels.
- `Dialog` for login if sign-in is modal.
- `Form`, `Label`, `Input` for local login fields.
- `Alert` for beta boundary and session/API errors.
- `Tabs` only if local password, API key, and OIDC are presented as peer auth modes.
- `Separator`, `Badge`, `Tooltip`.

Visual rules:

- No decorative gradients, gradient orbs, abstract AI backgrounds, or split marketing hero card layouts.
- Keep proof scene product-like: asset review/trust rail plus API/CLI/MCP/OKF package evidence.
- Keep claim boundaries visible, compact, and specific.
- Do not show secret values. API key examples use environment variable names only.

Auth states:

- Checking session: skeleton or neutral status, no blank page.
- Unauthenticated: sign-in options, API health, API URL only if needed.
- Auth failed: `Alert` with safe error text.
- Auth expired: clear unsafe local state and offer sign-in.
- Local demo login: available only as local/dev behavior, not as a production claim.

## Read Layouts

Read covers Library, Search/query, Asset reader, and Restricted/unavailable.

### Library

Target layout:

```text
Route header
  Title, lede, refresh/import/export actions

Summary row
  Visible assets
  Approved current
  Needs governance
  Public reader eligible

Filter bar
  Search
  View
  Sensitivity
  Lifecycle/status
  Owner/freshness when available

Asset table/list
  Asset
  Type
  Trust
  Sensitivity
  Review
  Public/demo eligibility

Optional detail drawer
  Selected asset summary
```

shadcn component choices:

- `Card` for repeated summary metrics only.
- `Input`, `Select`, `Button`, `Badge` for filters.
- `Popover` for advanced filters if the filter bar becomes crowded.
- `Table` for simple beta rows.
- ReUI `DataGrid` only if column controls, selection, sorting, density, or bulk actions become required.
- `Sheet` for selected asset summary on narrow screens.
- `Pagination` if result sets grow.
- `Skeleton` for loading.
- `Alert` for no-access or API errors.

Replace:

- Replace `library-filter-bar` with a shadcn filter toolbar.
- Replace bespoke raw table styling with `Table` or DataGrid composition.
- Replace `metric` tiles with shadcn metric cards.
- Replace multiple lifecycle/status/sensitivity chips with a consistent `Badge` variant map.

### Search And Managed Query

Target layout:

```text
Route header

Two-pane desktop
  Search controls/results
  Managed query controls/results

Managed query result tabs
  Answer
  Evidence
  Denied
  Diagnostics
```

shadcn component choices:

- `Input`, `Select`, `Switch`, `Button`, `Label`.
- `Tabs` for Answer, Evidence, Denied, Diagnostics.
- `Card` for individual result rows only.
- `Badge` for trust, denied count, provider/cache status.
- `Alert` for provider unavailable, deterministic fallback, and blocked states.
- `ScrollArea` for evidence lists and diagnostics.
- `Skeleton` for loading query states.

Required UX:

- Denied/restricted evidence has its own tab or panel.
- Denied counts can be shown. Restricted snippets cannot.
- Diagnostics separate answer quality, citations, provider attempts, cache state, telemetry ID, cost, and warnings.
- Empty query disables run action and explains the required input.
- Provider-routed failure keeps deterministic retrieval state visible when available.

### Asset Reader

Target layout:

```text
Header
  Breadcrumb
  Stable ID
  Title
  Composite trust state
  Actions

Desktop split
  Center: content tabs
  Right: trust/provenance rail

Content tabs
  Human document
  Agent instruction
  Version
  Raw metadata
```

shadcn component choices:

- `Breadcrumb`, `Button`, `Badge`.
- `Tabs` for content sections.
- `Accordion` for trust rail groups.
- `ScrollArea` for long content and rail.
- `Sheet` for trust rail on mobile.
- `Tooltip` for compact trust and copy controls.
- `Alert` for missing human document, missing instruction object, restricted hit, or stale/blocked trust.
- `Skeleton` for title, content, and rail.

Custom product components built from shadcn:

- `TrustStateSummary`
- `TrustRail`
- `SensitivityMarker`
- `SurfaceEligibilityList`
- `PermissionReason`
- `HashSummary`
- `CopyStableIdButton`

Trust rail groups:

- Identity: stable ID, type, source, version, hash.
- Governance: lifecycle, status, owner, reviewer, review due.
- Access: sensitivity, principal reason, allowed groups where policy allows.
- Distribution: allowed surfaces, exports, packages, affected consumers.
- Checks: metadata validation, leakage, eval, search eligibility.
- Activity: recent retrieval, export, review, publish, restore, audit events.

Required change:

- Replace the current wall of badges in `trust-banner` with one composite state and progressive disclosure.

### Restricted / Unavailable

Target:

- Generic no-access state for readers.
- No title, summary, snippet, source, owner, hidden count, or metadata unless disclosure policy explicitly allows it.
- Actions: sign in, switch principal, return to Library, or request access if a future workflow exists.

shadcn components:

- `Alert`
- `Button`
- `Card` only if used as a focused no-access state component
- `Badge` for disclosure policy state where allowed

## Work Layouts

Work covers Review queue, Version diff, Publish gates, and Asset audit.

### Review Queue

Target layout:

```text
Route header
  Queue count
  Load/refresh
  Bulk action entry if supported

Filter bar
  Owner
  Status
  Lifecycle
  Sensitivity
  Review due
  Affected surface
  Check status

Queue table
  Asset
  Due reason
  Trust
  Sensitivity
  Affected consumers
  Last change

Detail drawer/panel
  Summary
  Release gates
  Actions
```

shadcn component choices:

- `Table` or ReUI `DataGrid` if bulk/selection/sorting is required.
- `Input`, `Select`, `Checkbox`, `Button`, `Badge`.
- `Sheet` for detail drawer.
- `Alert` for blocked or unknown gates.
- `Tooltip` for due reasons.
- `Skeleton` for queue load.

### Version Diff

Target:

- Make review work feel like a code-review surface.
- Separate metadata diff, instruction object diff, and human document diff.
- Show current version and selected version clearly.
- Restore requires a note and explicit target version confirmation.

shadcn component choices:

- `Tabs` for metadata, instruction, human document, raw.
- `ScrollArea` for diff panes.
- `AlertDialog` for restore/publish confirmations.
- `Textarea` for change note.
- `Badge` for current, selected, blocked, unknown.
- `Separator`.

Custom product components:

- `DiffViewer`
- `ReleaseGatePanel`
- `ReviewActionBar`

Accessibility:

- Additions/removals must have text labels, not color alone.
- Keyboard users can move through diff sections and actions.

### Publish Gates

Gates:

- Metadata validation.
- Required fields present.
- Review date current.
- Restricted leakage check.
- Search index eligibility.
- Required deterministic evals.
- Export eligibility and affected consumers.
- Cache invalidation/reindex impact.

shadcn component choices:

- `Alert` for blocked/unknown.
- `Progress` only for active check execution.
- `Badge` for pass/warn/block/unknown.
- `Accordion` for gate evidence.
- `AlertDialog` for publish.

Rule:

- Publish is never a casual primary success button when gates are unknown or failing.

### Asset Audit

Target:

- Timeline/list of review, publish, restore, retrieval, export, access, and policy events.
- Evidence entries include timestamp, actor/surface, action, outcome, and safe details.

shadcn component choices:

- `Table` for dense audit.
- ReUI `Timeline` only if event relationships need richer scan behavior.
- `Badge`, `Tooltip`, `ScrollArea`, `Separator`.

## Distribute Layouts

Distribute is the clearest product proof. It must feel first-class and safer than raw export utilities.

### Package Builder

Target layout:

```text
Route header
  Distribute
  Generate action
  Last generated state

Stepper / staged workflow
  1. Consumer
  2. Scope
  3. Preview
  4. Checks
  5. Generate
  6. Verify

Desktop content
  Left: consumer and scope form
  Center: included/omitted preview table and payload metadata
  Right: package trust rail and downstream commands
```

shadcn component choices:

- `Tabs` or a custom Stepper composition using `Button`, `Badge`, `Progress`, and `Separator`.
- ReUI `Stepper` only if the route needs persistent multi-step status beyond simple tabs.
- `Form`, `Label`, `Input`, `Select`, `Checkbox`, `Switch`.
- `Table` or ReUI `DataGrid` for included/omitted preview.
- `Alert` for omitted/restricted items and failed checks.
- `Accordion` for check evidence.
- `Card` for generated summary only.
- `ScrollArea` for preview and command panels.
- `Tooltip` for hash and consumer eligibility explanations.
- `Button` for copy/generate/clear.

Fields:

- Consumer: MCP client, CLI, API key, OKF export, JSON package, demo bundle.
- Scope: package name, assets/collections when available, lifecycle/status, sensitivity band, tenant/group/principal, allowed surfaces, allowed exports.
- Format: JSON or OKF.
- OKF version: `0.1` when OKF is selected.

Preview rows:

- Stable ID.
- Title.
- Version.
- Lifecycle/status.
- Sensitivity.
- Included or omitted.
- Omission/inclusion reason.
- Consumer eligibility.
- Source/content/projection hash when available.

Safety:

- Package preview shows safe metadata only.
- Do not preview instruction bodies, human document bodies, OKF file contents, denied assets, or restricted snippets.
- Commands use env var placeholders such as `$FORGETBASE_API_KEY`.
- API key creation remains in Access/API consumers with one-time secret handling.

### Packages

Target:

- Saved/generated packages list if persistence exists.
- If persistence remains deferred, clearly label session-local generated state and audit-event fallback.

shadcn component choices:

- `Table`
- `Badge`
- `Button`
- `Alert`
- `Skeleton`
- `Pagination` if needed

Rows:

- Package name.
- Format.
- Generated time.
- Creator.
- Consumer.
- Asset count.
- Denied count.
- Source hash.
- Projection hash.
- Package hash.

### MCP Setup, CLI Setup, API Consumers

Target:

- Setup surfaces are operational reference panels, not docs pages.
- Each setup page shows scoped commands/config snippets, prerequisites, and safe copy controls.
- API consumer keys, service accounts, scopes, expiry, and owner are visible without exposing secrets.

shadcn component choices:

- `Tabs` for API, CLI, MCP examples if grouped.
- `Card` for individual command/config snippets.
- `Button` for copy.
- `Alert` for scope/secret warnings.
- `Table` for service accounts and API keys.
- `Dialog` or `AlertDialog` for create/rotate/revoke flows.
- `Tooltip` for scope explanations.

### Export History

Target:

- Trace distribution evidence from UI, API, CLI, MCP, JSON, and OKF consumers.
- Link generated packages to audit events and hashes.

shadcn component choices:

- `Table` or ReUI `DataGrid`.
- `Badge`.
- `Sheet` for event detail.
- `ScrollArea`.
- ReUI `Timeline` only if event chronology needs stronger scanability.

## Operate Layouts

Operate covers Operations, Access, Providers, Policies, Telemetry, Approvals, and Trust console.

### Operations

Target:

- Orientation hub for operational work.
- Summary links to Access, Providers, Policies, Telemetry, Approvals, Trust, and Distribute evidence.
- Avoid making Operations a raw dump of every admin form.

shadcn component choices:

- `Card` for route summary tiles only.
- `Button`.
- `Badge`.
- `Alert`.
- `Separator`.

### Access

Target:

- Manage local users, groups, service accounts, API keys, sessions, rotation reports, and service-account guardrails.
- Split into tabs or subroutes instead of one long page.

shadcn component choices:

- `Tabs` for Users, Groups, Service accounts, API keys, Sessions, Rotation, Guardrails.
- `Table` for records.
- `Dialog` for create/edit.
- `AlertDialog` for revoke/delete/rotate confirmations.
- `Form`, `Label`, `Input`, `Select`, `Checkbox`, `Switch`, `Textarea`.
- `Badge` for role, status, expiry, scope, revoked/current.
- `Alert` for one-time secret handling.

Safety:

- Secret values are shown only at creation/rotation when required and never persisted in visible page state after dismissal.
- Provider/env var references are labels only.

### Providers

Target:

- Model providers and auth providers show readiness without exposing credentials.
- Configuration is grouped by provider and policy area.

shadcn component choices:

- `Tabs` for Model providers and Auth providers.
- `Accordion` for provider cards/details.
- `Table` for configured providers.
- `Form` controls.
- `Badge` for ready/warn/error.
- `Alert` for missing env vars and safe provider errors.

### Policies

Target:

- Managed query, ranking, cache, retention, eval, action, secret-reference, and PII controls are explicit and comparable.
- Saved/current state is visible.

shadcn component choices:

- `Tabs` or `Accordion`.
- `Form`, `Switch`, `Select`, `Input`, `Textarea`.
- `Alert` for dangerous or blocked policy states.
- `Badge` for saved/current/changed.
- `Dialog` for reset or destructive policy actions.

### Telemetry

Target:

- Show retrieval, audit, feedback, provider, eval, cache, retention, and redaction evidence.
- Keep raw details available only where appropriate.

shadcn component choices:

- `Tabs`.
- `Table` or ReUI `DataGrid`.
- `Badge`.
- `ScrollArea`.
- `Alert`.
- Optional `Chart` only if a metric visualization has clear operational value.

### Approvals

Target:

- Make action governance explicit.
- Approval-required actions use staged review with notes and safe confirm.

shadcn component choices:

- `Table`.
- `Sheet` for action detail.
- `AlertDialog` for approve/reject/execute.
- `Textarea` for operator note.
- `Badge` for action type, state, dry-run, blocked, approved.
- `Alert` for kill-switch or disabled action policy.

### Trust Console

Target:

- Answer whether the system is safe to publish, distribute, and operate.
- This is not a metrics dashboard. It is a trust posture page.

Core questions:

- Are restricted assets leaking?
- Which instructions are stale, draft, or unreviewed?
- Which packages/exports are active?
- Which consumers used which versions?
- Which evals or validators block publish?
- Are provider, redaction, retention, cache, and secret-reference settings healthy?

shadcn component choices:

- `Card` for summary posture tiles.
- `Tabs` for Leakage, Staleness, Distribution, Consumers, Evals, Providers, Redaction/Retention, Audit.
- `Table` for issue lists.
- `Accordion` for evidence detail.
- `Alert` for blocked/unknown.
- `Badge` for healthy/warn/blocked/unknown.
- ReUI `Timeline` only for evidence history if a table is insufficient.

Custom product components:

- `TrustHealthSummary`
- `TrustIssueList`
- `EvidenceLink`

## Component Replacement Map

| Current pattern | Target shadcn-style replacement |
|---|---|
| Raw `button` and `.ui-button` class reliance | `Button` variants with shared cva definitions |
| `state-pill`, `nav-badge`, sensitivity chips | `Badge` variants mapped to existing semantic variables |
| `tab-bar` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `login-dialog` and custom overlay | `Dialog` or `AlertDialog` |
| `side-nav`, `tree-nav`, glyph nav | `Sidebar` family with optional `Collapsible` |
| `library-filter-bar` | shadcn filter toolbar using `Input`, `Select`, `Popover`, `Button` |
| Raw table styling | `Table` composition or ReUI `DataGrid` where justified |
| `workflow-panel`, `detail-pane`, `ops-pane` | route layouts plus `Card` only for repeated items/tool panels |
| Ad hoc message/error paragraphs | `Alert` with status/alert semantics |
| Raw copy buttons | `Button` plus `Tooltip` and live-region copy feedback |
| Custom form grids | `Form`, `Label`, `Input`, `Select`, `Textarea`, `Checkbox`, `Switch` |
| Current trust-banner badge cluster | `TrustStateSummary` plus expandable `TrustRail` |
| Current package result metadata panel | `PackageTrustRail`, `HashSummary`, `OmittedItemsList`, `ConsumerCommandPanel` |

## Density Rules

Supported density modes:

- Comfortable: default for first-run, landing/auth, and lower-density admin forms.
- Compact: default target for authenticated operational workflows after user selection.

Sizing targets:

- App shell top bar: 56 px comfortable, 48 px compact.
- Sidebar row: 36 px comfortable, 32 px compact.
- Form control: 36 px comfortable, 32 px compact.
- Table row: 44 px comfortable, 36 px compact.
- Badge/chip: 22-24 px, never below readable text height.
- Route header gap: compact enough that table/list content is visible above the fold at 1280x720.
- Border radius: use existing `--radius` mapping; cards and panels stay at 8 px or less.

Rules:

- Do not scale font size with viewport width.
- Letter spacing stays 0 for headings/body; uppercase labels may use the existing restrained tracking pattern only where already tokenized.
- Text must not overflow buttons, badges, nav rows, cards, command snippets, or table cells.
- Dense does not mean cramped: preserve readable labels, focus rings, and hit targets.
- Code/config blocks use mono font and horizontal scroll or wrapping depending on content safety.
- Avoid page-section cards. Use cards for repeated items, dialogs, and framed tools only.

## Empty, Loading, Restricted, And Error States

Build reusable state components:

- `EmptyState`
- `LoadingState`
- `NoAccessState`
- `RouteErrorState`
- `RestrictedEvidenceNotice`
- `BlockedCheckState`

shadcn components:

- `Alert`
- `Skeleton`
- `Button`
- `Card` only when the state is a focused framed tool or repeated state item
- `Badge`

Required states by surface:

- Landing/auth: checking session, unauthenticated, auth failed, auth expired, API offline.
- Library: no permitted assets, filters exclude all assets, load failure.
- Search: no query run, empty query, no results, restricted results omitted/count only, provider unavailable.
- Asset reader: no asset selected, missing human document, missing instruction object, restricted direct hit, version unavailable, load error.
- Review: empty queue, filters exclude all work, checks unknown, publish blocked, diff unavailable.
- Distribute: no package generated, no assets match scope, restricted omissions, checks failed, generated session-local result, format mismatch, API gap for persistence/history.
- Operate: no records loaded, policy load failure, provider not configured, telemetry absent, trust checks not run.

Copy rules:

- Keep text factual and short.
- Do not show private data or secret values in errors.
- When a state is unknown because a check was not run, say "not run" or "unknown"; do not imply pass.
- Restricted content states explain action without disclosing sensitive metadata.

## Responsive Behavior

Desktop target, >= 1200 px:

- Sidebar persistent and optionally resizable/collapsible.
- Read Library can use table plus side detail.
- Asset Reader uses center content plus right trust rail.
- Distribute uses left scope controls, center preview, right trust/package rail.
- Operate pages use tabs and dense tables/forms.

Tablet target, 860-1199 px:

- Sidebar may remain but can collapse.
- Main route grids collapse to one column before content becomes cramped.
- Trust rail moves below content or into a `Sheet`.
- Package builder stacks controls above preview, with command snippets below.

Mobile target, <= 860 px:

- Sidebar becomes a `Sheet` or mobile sidebar trigger.
- Top bar preserves logo/name, nav trigger, command/search, and session/health affordance without overlap.
- Current page title/breadcrumb remains visible after nav closes.
- Tables either horizontally scroll with stable headers or convert to compact row cards for critical workflows.
- Action bars wrap and do not cover content.
- Dialogs and sheets fit within viewport and have scrollable bodies.

Narrow mobile target, 320-480 px:

- Buttons can become full-width when paired in auth/landing and destructive confirmation contexts.
- Badges wrap or truncate with tooltips; they do not force horizontal page scroll.
- Command snippets wrap safely or scroll inside their own container.
- Package builder order: stepper, scope controls, preview, trust rail, command snippets.
- Asset reader order: header, trust summary, content tabs, content, expandable trust rail.

## Accessibility And Focus Requirements

Global:

- Preserve skip link to `#main`.
- Use visible focus ring based on existing focus/ring variable.
- Do not rely on color alone for trust, denied, blocked, sensitivity, or due states.
- Keep WCAG AA contrast for text and interactive states.
- Honor `prefers-reduced-motion`.
- Do not use hover-only disclosure for critical information.

Navigation:

- Use `aria-current="page"` only on the active leaf.
- Use full tree roles only if full tree keyboard behavior is implemented. Otherwise use sidebar/menu/list semantics.
- Resizable sidebar handle, if retained, needs `role="separator"`, orientation, min/max/current values, and keyboard resize.

Dialogs and sheets:

- Trap focus.
- Restore focus to the trigger.
- Close on Escape unless a destructive confirmation must force explicit cancel/confirm.
- Have accessible names and descriptions.

Forms:

- Every input/select/textarea/checkbox/switch has a visible label or accessible name.
- Error text is associated with the field.
- Helper text is present where policy, secret, or irreversible behavior matters.
- Disabled controls explain why when the reason is not obvious.

Tables/data grids:

- Provide captions or `aria-label`.
- Use real column headers.
- Row actions are keyboard reachable and not pointer-only.
- Selected row state is announced where appropriate.
- Bulk selection, if added, has clear labels and counts.

Tabs:

- Use correct tab roles through shadcn `Tabs`.
- Active tab has both visual and semantic state.
- Tab content has stable accessible names.

Copy and code:

- Copy buttons announce success/failure.
- Command snippets never include raw secret values.
- Long code lines do not create page-level horizontal scroll.

## Visual Acceptance Checklist

### Global Visual Checks

- Existing color variables are used; no new brand colors are introduced.
- The custom option 09 mark remains the only custom logo/favicon mark.
- No decorative gradients, gradient orbs, abstract AI art, or marketing-style hero patterns appear.
- shadcn-style `Button`, `Badge`, form, table, tab, dialog, sidebar, alert, skeleton, tooltip, and sheet/dialog patterns replace bespoke UI classes.
- Cards are used only for repeated items, dialogs/modals, and genuinely framed tools.
- No card-in-card layouts.
- Text fits in nav rows, buttons, badges, table cells, route headers, metric cards, dialogs, and command snippets.
- Success/good-state badges meet contrast requirements.
- Public copy stays within beta claims and does not imply production/enterprise maturity.
- Synthetic/demo content only.

### Desktop Checks

Use at least these viewports:

- `1280x720`
- `1440x900`
- `1920x1080`

Desktop acceptance:

- App shell renders with stable top bar, sidebar, command/search, health, density, and identity controls.
- Read Library shows filters and table without horizontal page scroll.
- Asset Reader shows composite trust summary first and trust rail without badge clutter.
- Search/managed query separates Answer, Evidence, Denied, and Diagnostics.
- Work Review queue supports scan-friendly rows and clear publish gate states.
- Version Diff distinguishes metadata, instruction object, and human document changes.
- Distribute is top-level and Package builder is the primary leaf.
- Distribute preview shows included/omitted metadata and never shows restricted bodies.
- Operate surfaces are split into clear tabs/subsections instead of one raw admin dump.
- Dialogs/sheets trap and restore focus.
- Command palette can be opened, searched, used, and closed by keyboard.

### Mobile Checks

Use at least these viewports:

- `390x844`
- `375x667`
- `320x568`

Mobile acceptance:

- Body scroll width equals viewport width.
- Sidebar is reachable through a mobile trigger and does not cover content after close.
- Top bar controls do not overlap or wrap incoherently.
- Landing/auth shows product proof, beta boundary, and sign-in without decorative hero treatment.
- Asset Reader stacks as header, trust summary, tabs, content, expandable trust rail.
- Package Builder stacks as stepper, controls, preview, trust rail, command snippets.
- Tables either scroll inside their own container or become readable row cards.
- Dialogs and sheets fit viewport height and remain keyboard accessible.
- Buttons and badges do not overflow at 320 px.

### Data Safety Checks

- Restricted assets are omitted or counted without snippets.
- Package previews show stable IDs and metadata only.
- OKF and JSON package outputs are not body-previewed in the browser.
- API key and secret values are never printed in the UI after one-time creation/rotation handling.
- Provider errors reveal env-var references and safe status only, not secret values.
- No private source content appears in landing, app states, examples, screenshots, or command snippets.

## Implementation Slice Guidance

Suggested migration order:

1. Token and primitive normalization
   - Keep existing color variables.
   - Replace raw button/badge usages with `Button` and `Badge`.
   - Add `Alert`, `Skeleton`, `Tabs`, `Dialog`, `Sheet`, `Tooltip`, `Table`, `Input`, `Select`, `Label`, `Textarea`, `Checkbox`, `Switch`, `Separator`, `Breadcrumb`, and `Sidebar` only as needed.

2. Shell and navigation
   - Replace bespoke sidebar/topbar containers with shadcn shell/sidebar composition.
   - Keep Read, Work, Distribute, Operate.
   - Preserve leaf-iconless default.

3. Landing/auth
   - Migrate the accepted proof-led public entry into shadcn cards/dialog/forms/alerts.
   - Remove decorative gradient treatment.

4. Read
   - Replace Library filters/table, Asset Reader tabs, and trust banner with shadcn components.
   - Introduce `TrustStateSummary` and `TrustRail`.

5. Distribute
   - Migrate Package Builder into staged shadcn composition.
   - Add omitted/included preview and package trust rail semantics.

6. Work
   - Migrate Review queue, Version diff, and Publish gates.
   - Add `ReleaseGatePanel` and safer confirm dialogs.

7. Operate
   - Split admin workspaces into tabs/subroutes and migrate forms/tables/dialogs.
   - Add Trust Console if not already implemented.

Each slice should have desktop and mobile browser evidence before it is considered accepted.

## Verification Evidence To Capture During Implementation

For each implemented slice, capture:

- Source files changed.
- shadcn components added or modified.
- Commands run, at minimum web typecheck/build/test where applicable.
- Desktop screenshot at `1280x720` or larger.
- Mobile screenshot at `390x844`.
- Console error/warning check.
- Body scroll width check on mobile.
- Keyboard focus check for command, nav, dialogs/sheets, tabs, and row actions.
- Data-safety check proving no restricted body/snippet/secret appears.

For the full migration, final browser acceptance should cover:

- Public landing/auth.
- Read Library.
- Asset Reader.
- Search/Managed Query.
- Work Review.
- Version Diff.
- Distribute Package Builder JSON and OKF states.
- Operate Access.
- Operate Providers or Policies.
- Operate Telemetry.
- Trust Console or explicit unknown/not-run trust state.

