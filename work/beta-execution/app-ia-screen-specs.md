# ForgetBase Beta App IA And Screen Specs

Status: worker specification
Last updated: 2026-06-19
Owner: App IA + Screen Specs lane

## Summary

ForgetBase beta should present the web app as a business-grade operational console for an agent-native instruction control plane. The app has four primary surfaces:

- Read: find, inspect, and trust governed assets.
- Work: review, compare, publish, restore, and keep assets current.
- Distribute: package approved context for MCP, CLI, API, OKF, JSON, and demo consumers.
- Operate: manage access, policies, providers, telemetry, approvals, health, and trust controls.

The current React app already has useful alpha surfaces, local tokens, a shell, a resizable iconless-leaf navigation tree, local `Button` and `Badge` primitives, and working calls for library, asset detail, review, version snapshot, search, managed query, exports, telemetry, policies, providers, access, and approvals. Beta should preserve that foundation, but split new route modules around workflows instead of continuing to grow `apps/web/src/App.tsx`.

The key beta correction is that Distribute becomes a top-level surface. It is not an admin export utility. It is the product proof that ForgetBase distributes reviewed, permission-filtered agent context to real downstream consumers.

## Goals

- Make the first 15 minutes show governed-context value: import or use demo assets, inspect trust, search/query, review/publish, build a package, prove restricted items are omitted, and fetch through a documented consumer path.
- Make trust/provenance a composite state with progressive disclosure, not a wall of independent badges.
- Reuse the existing design package and React primitives first.
- Keep sub-page nav leaves iconless by default unless a route explicitly configures a leaf icon.
- Specify routes, screens, component inventory, data/API needs, and acceptance checks before heavy UI implementation.

## Non-Goals

- No heavy UI implementation in this lane.
- No shadcn or ReUI bulk install.
- No app architecture replacement.
- No private/customer/company content in examples.
- No claims that beta is production-ready, hosted-service-ready, enterprise-search parity, or full orchestration.

## Information Architecture

### App Shell

Keep the existing shell pattern:

- Sticky top bar with brand, global command/search entry, API health, density toggle, and identity.
- Left page tree with stable top-level groups, folder rows that may use compact glyphs, and iconless leaf rows by default.
- Desktop nav width remains user-resizable in the 240-420 px range with keyboard support and `localStorage` retention.
- Main content uses a route header, local action bar, then workflow-specific content.
- Authenticated routes use cookie-backed browser sessions or bearer key fallback exactly as current app conventions do.

### Target Route Map

The beta implementation can keep hash routes initially. If a router is introduced later, route IDs below should map one-to-one to route modules.

| Surface | Route ID | Label | Role baseline | Reuse or new module | Notes |
|---|---|---|---|---|---|
| Read | `library` | Library | reader | reuse current library, split module | Catalog, filters, visible counts, asset table. |
| Read | `search` | Search / query | reader | reuse current search, split module | Global command target plus full search and managed query. |
| Read | `asset-read` | Asset reader | reader | reuse current detail, expand | Center content plus trust rail. |
| Read | `no-access` | Restricted / unavailable | reader | new module | Generic restricted state unless disclosure policy allows metadata. |
| Work | `review` | Review queue | maintainer | reuse current review queue, expand | Queue, filters, bulk triage, affected consumers. |
| Work | `versions` | Version diff | maintainer | reuse version snapshot, expand | Field-level and side-by-side diff. |
| Work | `publish` | Publish gates | maintainer | new module or drawer | Release checks before publish. |
| Work | `asset-audit` | Asset audit | maintainer | new module | Review, publish, restore, grant, export, retrieval timeline. |
| Distribute | `distribute` | Package builder | maintainer | new top-level route module | MVP package-builder flow. |
| Distribute | `packages` | Packages | maintainer | new module | Saved packages, hashes, generated time, creator, consumer. |
| Distribute | `mcp-setup` | MCP setup | maintainer | new module | Install/config snippet and scoped package fetch. |
| Distribute | `cli-setup` | CLI setup | maintainer | new module | Commands for validate/import/search/export. |
| Distribute | `api-consumers` | API consumers | admin | new module | API keys/service accounts, scopes, expiry, allowed surfaces. |
| Distribute | `export-history` | Export history | maintainer | new module | History from audit/export records. |
| Operate | `operations` | Operations | admin | reuse current overview | Landing summary across operational controls. |
| Operate | `access` | Access | admin | reuse current access forms, split module | Users, groups, service accounts, API keys, sessions. |
| Operate | `providers` | Providers | admin | reuse current providers, split module | Model providers, OIDC providers, readiness. |
| Operate | `policies` | Policies | admin | reuse current policy controls, split module | Managed query, ranking, cache, retention, actions, secrets, PII. |
| Operate | `telemetry` | Telemetry | admin | reuse current telemetry, expand | Retrieval/audit/feedback/eval/cache/provider summary. |
| Operate | `approvals` | Approvals | admin | reuse current approvals, expand | Action governance and decision workflow. |
| Operate | `trust` | Trust console | admin | new module | Composite release/trust health, leakage, stale assets, active exports. |

### Navigation Shape

Top-level groups:

```text
Read
  Library
    Overview
    Search / query
    Asset reader
    Restricted / unavailable

Work
  Governance Work
    Review queue
    Version diff
    Publish gates
    Asset audit

Distribute
  Agent Distribution
    Package builder
    Packages
    MCP setup
    CLI setup
    API consumers
    Export history

Operate
  Control Plane
    Operations
    Access
    Providers
    Policies
    Telemetry
    Approvals
    Trust console
```

Folder/group rows may use compact glyphs such as `RD`, `WK`, `DS`, and `OP`. Leaf rows remain iconless by default.

## Trust And Provenance Model

### Composite Trust State

Each asset and package should expose one primary trust state:

- Trusted: active, approved, not stale, permission-eligible, export-eligible for selected consumer, latest checks passing.
- Needs review: stale review date, draft/reviewing status, non-active lifecycle, missing reviewer, or changed version not yet approved.
- Restricted: current principal lacks permission or selected consumer cannot receive the asset.
- Blocked: leakage, validation, required eval, metadata, export eligibility, provider policy, or permission check fails.
- Unknown: checks not run or source data not loaded.

The UI should show this as one prominent `TrustStateSummary` with reason text and an expand control. Expanded details show lifecycle, sensitivity, owner, reviewer, review due, current/draft versions, source/hash, allowed surfaces, allowed exports, last leakage check, last validation/eval, recent retrieval/export events, and affected consumers.

### Progressive Disclosure Rules

- Default view: one composite state, one short reason, and one next action.
- Expanded view: grouped evidence sections with timestamps and links to audit events.
- Raw view: JSON or event metadata only for admins or maintainers where policy allows.
- Unauthorized readers: generic restricted/unavailable state unless disclosure policy explicitly allows title, owner, or hidden counts.
- Managed-query diagnostics: separate permitted citations from denied/restricted evidence counts; do not expose restricted snippets to unauthorized users.

## Screen Specs

### 1. Global Command And Search

Purpose: let users quickly find assets, run retrieval, and navigate commands without treating search as a plain document search box.

Primary users:

- Reader searches and opens permitted assets.
- Maintainer jumps to review/version/distribution tasks.
- Admin jumps to policies, providers, telemetry, and trust console.

Layout:

- Topbar command button opens a command palette or search sheet.
- Full `search` route contains two panes: deterministic search and managed query.
- Results include title, stable ID, type, lifecycle/status, sensitivity, source/version, trust state, and permission reason.
- Managed-query area uses tabs: Answer, Evidence, Denied, Diagnostics.

States:

- First run: prefill a safe synthetic query such as `PII redaction`; explain no private data should be used.
- Empty query: disabled run button and clear validation.
- No results: show filter reset and corpus/import hint.
- Restricted results: show count and reason class without restricted snippets.
- Provider unavailable: deterministic fallback status and provider-health link.
- Error: API status, retry action, and diagnostic copy without secrets.

Data/API needs:

- Existing: `GET /search?query=&limit=&strategy=`.
- Existing: `POST /agent/query`.
- Existing: `GET /admin/managed-query-policy`, `GET /admin/model-providers/health`, `GET /telemetry/summary`.
- Needed for beta polish: result-level trust reason projection so the client does not infer every permission/export reason locally.
- Needed for command palette: route registry with labels, role visibility, and command actions can be local initially.

Acceptance checks:

- Reader can search and open a permitted active/approved asset.
- Restricted results are omitted or counted without leaking restricted snippets.
- Managed-query answer, citations, denied count, cache status, provider attempts, warnings, and telemetry ID are visible in separate tabs.
- Provider-routed failure keeps a deterministic answer/fallback path visible.
- Keyboard users can open the command palette, navigate results, submit, and close it without pointer input.

Reusable surfaces:

- Current topbar command button, `search` route, search form, managed-query tabs, result list, `Button`, `Badge`, metadata grid.

New route/module work:

- `CommandPalette` or `CommandSheet`.
- `SearchResultsList` with trust and permission reason.
- `ManagedQueryResultTabs` with explicit Denied tab.

### 2. Asset Reader With Trust Rail

Purpose: make a governed asset readable and inspectable as both human content and agent instruction object, with provenance visible but not overwhelming.

Primary users:

- Reader verifies whether guidance is current and allowed.
- Agent operator inspects the exact instruction an agent will consume.
- Maintainer sees next governance action.

Layout:

- Header: breadcrumb, stable ID, title, composite trust state, primary actions.
- Left or upstream context: library selection/search result, not a second heavy nav.
- Center: human document, agent instruction, version, raw metadata tabs.
- Right rail: trust/provenance grouped sections.

Trust rail groups:

- Identity: stable ID, asset type, source kind/ref, current version, source hash when available.
- Governance: lifecycle, status, owner, reviewer, review due, current draft state.
- Access: sensitivity, current principal reason, groups/grants where allowed.
- Distribution: allowed surfaces, allowed exports, package eligibility, affected consumers.
- Checks: metadata validation, stale review, leakage, eval/validation, search index eligibility.
- Activity: recent retrievals, exports, review/publish/restore/audit events.

States:

- Loading: skeleton for title, content, and rail.
- Empty: no asset selected, with action to return to Library.
- No human document: show instruction object first and explain the asset has no linked human page.
- No instruction object: show human page first and flag missing agent-consumable object.
- Restricted: generic unavailable state for readers; admin/maintainer can see denial evidence if policy allows.
- Error: preserve selected stable ID and provide retry.

Data/API needs:

- Existing: `GET /assets`.
- Existing: `GET /assets/{stableId}`.
- Existing: `GET /assets/{stableId}/versions/{versionNumber}`.
- Existing via current app: asset detail returns asset, versions, instruction objects, human documents.
- Needed for beta polish: per-asset trust summary projection; recent audit/retrieval/export events filtered by stable ID; validation/leakage/eval latest check summary by stable ID.

Acceptance checks:

- Reader can inspect content and copy stable ID without seeing admin-only controls.
- The first visible trust element is the composite trust state, not multiple unrelated badges.
- Current version and selected version are distinguishable.
- Allowed surfaces and export eligibility are visible.
- Restricted direct hits do not reveal sensitive metadata by default.
- At 320 px width, content stacks as header, trust summary, tabs, content, expandable rail sections.

Reusable surfaces:

- Current `asset-read` detail pane, trust banner, metadata grid, tabs, content blocks, instruction well styles, local `Badge`.

New route/module work:

- `AssetReaderRoute`.
- `TrustStateSummary`.
- `TrustRail`.
- `AssetContentTabs`.
- `CopyStableIdButton`.

### 3. Review Queue And Version Diff

Purpose: make governance work feel like a review system, not a hidden admin form.

Primary users:

- Maintainer triages stale, draft, reviewing, not-approved, or non-active assets.
- Admin verifies release gates before publishing.

Layout:

- Review queue list: filters for owner, status, lifecycle, sensitivity, review due, affected surface, and check status.
- Queue rows: stable ID, title, type, lifecycle/status, sensitivity, due state, affected consumers, composite trust state.
- Detail side/drawer: selected item summary, latest change note, current version, draft/current comparison, release gates, actions.
- Version diff route: field-level diff for asset metadata plus side-by-side content diff for instruction and human document.

Actions:

- Mark reviewed.
- Request changes or leave review note.
- Publish.
- Restore selected version with reason.
- Archive or defer if supported by current API.
- Open package impact view for affected consumers.

Publish gates:

- Metadata validation.
- Required fields present.
- Review date current.
- Restricted leakage check.
- Search index eligibility.
- Required deterministic evals.
- Export eligibility and affected consumers.
- Cache invalidation/reindex impact.

States:

- Empty queue: "No assets need governance" plus filters and last loaded time.
- Checks not run: Unknown gate state with run/check command hint.
- Diff unavailable: show raw current/selected version and API gap.
- Publish blocked: show blocking reasons and next action.
- Restore confirm: require change note before restore.

Data/API needs:

- Existing: `GET /assets/review-queue`.
- Existing: `POST /assets/{stableId}/review`.
- Existing: `POST /assets/{stableId}/publish`.
- Existing: `POST /assets/{stableId}/restore`.
- Existing: `GET /assets/{stableId}/versions/{versionNumber}`.
- Existing through CLI/validation: corpus and asset validation rules.
- Needed for beta polish: route or SDK projection for release-gate results per asset; affected-consumer/package impact; latest leakage/eval status by asset.
- Client can compute text diffs from current and version snapshot for MVP; a server diff endpoint is not required for beta.

Acceptance checks:

- Maintainer can load the queue, select an asset, inspect current vs selected version, add a note, mark reviewed, publish, and restore with clear audit implications.
- Publish action is never presented as a casual success button when gates are unknown or failing.
- Version diff highlights metadata, instruction object, and human document changes separately.
- Restore requires a reason and shows the target version number before confirmation.
- Queue count in nav matches loaded or computed due count.

Reusable surfaces:

- Current `review` queue, version snapshot, release control panel, tabs, metadata grids, table styles.

New route/module work:

- `ReviewQueueRoute`.
- `VersionDiffRoute`.
- `ReleaseGatePanel`.
- `DiffViewer` using shadcn tabs/scroll area if needed; no ReUI required for MVP.

### 4. Distribution Package Builder

Purpose: prove ForgetBase can distribute approved, permission-filtered context packages to agent consumers without leaving the UI.

Primary users:

- Maintainer builds an MCP/API/CLI/OKF/JSON package for a consumer.
- Admin creates or verifies scoped service account/API key and package eligibility.
- Agent operator copies install/config snippets and verifies hashes.

MVP flow:

1. Select consumer: MCP client, CLI, API key, OKF export, JSON package, or demo bundle.
2. Select scope: assets, collections, lifecycle state, sensitivity band, tenant/group/principal, allowed surfaces, allowed exports.
3. Preview payload: included assets, omitted/restricted assets, reasons, versions, citations, hashes.
4. Run checks: metadata, permission, export eligibility, restricted leakage, required evals where configured.
5. Generate: package name, format, OKF version, install command/config snippet, hash summary.
6. Save/history: generated time, creator, consumer, package hash, source package hash/projection hash where available.
7. Verify downstream fetch: show API curl, CLI command, or MCP config/action to fetch the same package.

Layout:

- Stepper at top with current step and gate status.
- Left: consumer and scope controls.
- Center: package preview table plus payload/code preview.
- Right: trust/package rail with composite package state, omitted reasons, hashes, downstream commands, and history link.

Package preview rows:

- Stable ID.
- Title.
- Version.
- Lifecycle/status.
- Sensitivity.
- Included or omitted.
- Reason.
- Consumer eligibility.
- Source content hash when available.

States:

- First run: demo bundle preset using public-demo, active, approved assets.
- Empty package: no assets match scope; show scope reset.
- Restricted omissions: count and reason, no restricted content snippets.
- Checks failed: blocked package state and next action.
- Generated: immutable generated summary with hashes and copyable commands.
- API gap: if save/history is not implemented, display "generated for this session" and rely on audit events.

Data/API needs:

- Existing: `GET /exports/ai-package?package=demo-agent-pack`.
- Existing: `GET /exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1`.
- Existing: `GET /assets`, `GET /assets/{stableId}`, `GET /auth/service-accounts`, `GET /auth/api-keys`, `GET /audit/events`.
- Existing CLI/MCP wrappers for export.
- Needed for MVP package builder:
  - Export endpoint parameters for selected format, package name, stable IDs/collections, lifecycle/status/sensitivity filters, surface/consumer, principal/service account context, and dry-run preview.
  - Response fields for included items, omitted items with reason codes, content/source/projection hashes, package hash, allowed consumer route, and generated command snippets or enough structured data for the client to render them.
  - Optional persistence endpoint for package history. If deferred, beta can use audit events plus generated response only.

Acceptance checks:

- Distribute is a top-level nav group, not buried under Operate.
- Maintainer can generate a JSON package and OKF package from approved public-demo/demo scope.
- The UI shows exactly what was included and omitted, with reasons.
- Restricted content is not present in package previews, package payloads, or command snippets.
- Generated package exposes stable IDs, source asset versions, content hashes, and OKF projection/source hashes when format is OKF.
- User can copy one downstream command/config snippet for API, CLI, or MCP.
- Package builder does not require creating raw secrets in the browser; API key creation remains Access/API consumers with one-time secret handling.

Reusable surfaces:

- Current `exports` summary, export generation function, metadata grid, table styles, buttons, badges.

New route/module work:

- `DistributeRoute`.
- `PackageBuilder`.
- `PackageScopeForm`.
- `PackagePreviewTable`.
- `PackageTrustRail`.
- `ConsumerCommandPanel`.
- `ExportHistoryRoute`.
- ReUI stepper is justified if shadcn/core primitives make the multi-step package flow too ad hoc; do not install it until this route is implemented.

### 5. Trust Console

Purpose: answer whether the system is safe to publish, distribute, and operate, without making admins assemble evidence from raw panels.

Primary users:

- Admin validates beta readiness.
- Maintainer understands what blocks publish/distribution.
- Operator investigates trust regressions.

Core questions:

- Are restricted assets leaking?
- Which instructions are stale, draft, or unreviewed?
- Which exports/packages are active?
- Which consumers used which versions?
- Which evals or validators are blocking publish?
- Are provider, redaction, retention, cache, and secret-reference settings healthy?

Layout:

- Summary row with composite system trust state, leakage state, stale asset count, active exports/packages, provider readiness, and retention/redaction posture.
- Tabs or sections: Leakage, Staleness, Distribution, Consumers, Evals, Providers, Redaction/Retention, Audit.
- Each issue has severity, affected assets/packages, evidence timestamp, source command/API route, and next action.

States:

- Unknown: checks not run or no data loaded.
- Healthy: all loaded checks pass, with evidence timestamp.
- Warning: stale content, unknown package history, provider not configured for optional path.
- Blocked: leakage failure, export eligibility failure, missing required metadata, or secret policy violation.

Data/API needs:

- Existing: `GET /telemetry/summary`.
- Existing: `GET /audit/events`.
- Existing: `GET /assets/review-queue`.
- Existing: `GET /admin/model-providers/health`.
- Existing: `GET /admin/pii-redaction-policy`, `GET /admin/telemetry-retention`, `GET /admin/secret-reference-policy`.
- Existing command: `npx -y pnpm@11.7.0 security:verify-restricted-leakage`.
- Needed for beta polish: persisted leakage-check result or API-readable latest verifier status; package/export history; per-asset latest validation/eval state.

Acceptance checks:

- Admin can see whether trust state is healthy, warning, blocked, or unknown without reading raw telemetry.
- Restricted leakage status links to verifier evidence or a clear "not run" state.
- Stale/unreviewed assets link to Review queue.
- Active package/export rows link to Distribute history or audit evidence.
- Provider readiness never exposes secret values, only env-var reference availability and safe errors.

Reusable surfaces:

- Current telemetry summary, review queue counts, provider health, policy panels, audit event list.

New route/module work:

- `TrustConsoleRoute`.
- `TrustHealthSummary`.
- `TrustIssueList`.
- `EvidenceLink`.
- ReUI timeline may be justified for audit/evidence history if a simple list becomes hard to scan.

### 6. First-Run, Empty, Restricted, And Error States

Purpose: make non-happy paths intentional enough for beta demos, UAT, and self-hosted onboarding.

First-run states:

- Unauthenticated: login panel with local password/OIDC options, API health, API URL, no raw secret examples.
- Authenticated with no assets: guided import/create panel with CLI import command and demo corpus reference.
- Demo corpus loaded: "Start here" path to Library, Search, Review, Distribute demo bundle, and Trust Console.
- Public reader: only `public-demo`, `active`, and `approved` assets are visible.

Empty states:

- Library: no permitted assets or filters exclude all assets.
- Search: no query run, no results, or filters exclude all results.
- Review: no governance work.
- Distribute: no assets match package scope.
- Telemetry/trust: no events/checks loaded.

Restricted/no-access states:

- Generic unavailable for direct restricted hit unless disclosure policy allows metadata.
- Explain what can be done: sign in, switch principal, request access if later supported, or return to Library.
- Admin-only hidden counts must be labeled as admin disclosure.

Error states:

- API offline/health failed.
- Auth expired/401.
- CSRF or cookie/session issue.
- Provider unavailable.
- Export/check failed.
- Validation/leakage blocked.

Acceptance checks:

- Every route above has first-run/empty/restricted/error copy and actions.
- Error messages do not print API keys, provider secrets, raw env values, or private content.
- Auth expiration clears unsafe local state and offers sign-in.
- Mobile routes do not trap users in an empty table wider than the viewport.

## Component Inventory

### Existing Local Primitives First

Use these before adding dependencies:

| Component/pattern | Existing source | Use for beta |
|---|---|---|
| App shell/topbar | `apps/web/src/App.tsx`, `apps/web/src/styles.css` | Keep for shell; split into modules later. |
| Tree nav/resizer | `App.tsx`, `styles.css`, mockup package | Four top-level surfaces with iconless leaves. |
| Button | `apps/web/src/components/ui/button.tsx` | Primary, default, ghost, command, danger, icon sizes. |
| Badge | `apps/web/src/components/ui/badge.tsx` | Lifecycle, status, sensitivity, trust state chips. |
| Tokens/status colors | `apps/web/src/styles.css` | Quiet Control Plane palette and semantic vars. |
| Tables/table scroll | `styles.css` | Library, review, package preview, export history. |
| Metadata grid | `styles.css` | Trust rail, package rail, diagnostics. |
| Tab bar | `styles.css` | Asset content, managed query, trust console sections. |
| Content block/pre | `styles.css` | Instruction wells, JSON, diagnostics, diffs. |
| Message/error blocks | `styles.css` | Route-level feedback; improve severity and accessibility. |
| Local `cn` helper | `apps/web/src/lib/utils.ts` | shadcn-style class composition. |

### Add shadcn Core Only When Needed

Candidate shadcn core components, installed one workflow at a time:

| shadcn component | Justification |
|---|---|
| Dialog/AlertDialog | Publish, restore, revoke, package generate confirmations. |
| Sheet/Drawer | Command palette, side detail, package rail on mobile. |
| Tooltip | Icon buttons and compact trust markers. |
| Tabs | Replace local tab bar once route modules split. |
| Input/Select/Textarea/Label/Checkbox/Switch | Normalize config forms and package builder fields. |
| Table | If local table styles become hard to keep accessible. |
| Alert | First-run, restricted, blocked checks, and error states. |
| Skeleton | Loading states across reader, package builder, trust console. |
| Breadcrumb | Asset reader and package builder location. |
| Separator/ScrollArea | Trust rail and package preview scrolling. |
| Progress | Package builder/check progress. |

### ReUI Only Where Justified

ReUI should be considered only for richer operational-console behavior after the route is scoped:

| ReUI candidate | Justification | Defer if |
|---|---|---|
| Data grid | Package preview, review queue, audit/export history need column controls, selection, density, or bulk actions. | Static tables are enough for beta. |
| Filter bar | Review, library, telemetry, package scope have repeated advanced filters. | shadcn fields and local layout are enough. |
| Stepper | Package builder requires clear multi-step progress and check gates. | A simple ordered layout is enough. |
| Timeline | Trust console and asset audit need scan-friendly event history. | A list with timestamps works. |
| Tree | Full keyboard tree behavior is implemented properly. | Current nested nav is sufficient. |

### Custom Governed-Asset Components

These should be custom because they encode product semantics:

- `TrustStateSummary`.
- `TrustRail`.
- `SensitivityMarker`.
- `SurfaceEligibilityList`.
- `ReleaseGatePanel`.
- `PermissionReason`.
- `PackageTrustRail`.
- `OmittedItemsList`.
- `ConsumerCommandPanel`.
- `HashSummary`.
- `NoAccessState`.
- `RestrictedEvidenceNotice`.

## Data And API Needs By Screen

| Screen | Existing data/API | Missing or beta-polish need |
|---|---|---|
| Command/search | `/search`, `/agent/query`, `/telemetry/summary`, provider health | Result-level trust/permission reason projection; command registry can be local. |
| Asset reader | `/assets`, `/assets/{stableId}`, version snapshot | Asset trust summary, recent events by asset, latest validation/leakage/eval result. |
| Review/diff | review queue, review, publish, restore, version snapshot | Release-gate projection, affected consumers/packages, latest check status. |
| Package builder | `/exports/ai-package`, OKF format, assets, auth/service accounts, audit | Scoped dry-run preview, omitted reasons, package hash response, package history persistence, generated command metadata. |
| Trust console | telemetry summary, audit events, review queue, provider health, policies | Latest leakage verifier result, export/package history, per-asset latest validation/eval summaries. |
| First-run/empty/error | auth/me, health, login/logout, assets | Route-level state taxonomy and reusable components. |

## Route/Screen Acceptance Matrix

| Route/screen | Must prove | Acceptance check |
|---|---|---|
| `library` | Reader sees governed assets and trust at a glance. | Approved/active count, review-due count, public-reader count, filters, sensitivity/status labels, keyboard-selectable rows. |
| `search` | Retrieval is permission-aware and diagnosable. | Search results omit restricted snippets; managed query separates answer, evidence, denied counts, diagnostics. |
| `asset-read` | Asset is readable as human doc and agent instruction. | Composite trust state, content tabs, trust rail, stable ID copy, allowed surfaces/exports. |
| `no-access` | Restricted assets do not leak. | Generic unavailable state for unauthorized direct hits, no sensitive title/snippet unless policy allows. |
| `review` | Maintainer can triage governance work. | Load queue, filter/sort, select item, see due reason, act or open diff. |
| `versions` | Version changes are reviewable before restore/publish. | Metadata/content diff, current vs selected labels, restore requires note. |
| `publish` | Publish is gated and auditable. | Gate panel shows pass/fail/unknown; blocked publish states explain next action. |
| `asset-audit` | Provenance is inspectable. | Audit/retrieval/export events show timestamp, actor/surface, action, outcome. |
| `distribute` | MVP package builder exists as top-level workflow. | Select consumer/scope, preview included/omitted assets, run checks, generate JSON/OKF, copy command. |
| `packages` | Generated packages are traceable. | Package name, format, generated time, creator, asset count, denied count, hashes/history. |
| `mcp-setup` | MCP consumer path is visible. | Config/install snippet and package/fetch command are copyable and scoped. |
| `cli-setup` | CLI consumer path is visible. | Validate/search/export commands are copyable and match docs. |
| `api-consumers` | Scoped consumers are governed. | Service account/API key links show scopes, expiry, owner, safe secret previews only. |
| `export-history` | Distribution is auditable. | Export events/packages link to hashes, actor, consumer, omitted counts. |
| `operations` | Admin has orientation. | Summary links to access, providers, policies, telemetry, approvals, trust. |
| `access` | Identity and keys are governable. | Users, groups, service accounts, keys, sessions, rotation report, no raw secret leakage after create/rotate. |
| `providers` | Provider/auth readiness is safe. | Env-var references, health state, no secret values, safe errors. |
| `policies` | Guardrails are configurable. | Managed query, ranking, cache, retention, action, secret, PII policies show saved-vs-current state. |
| `telemetry` | Activity is inspectable. | Retrieval/audit/feedback/provider/eval/cache summaries and event lists. |
| `approvals` | Action governance is explicit. | Approval-required actions need operator note and staged confirm. |
| `trust` | System trust posture is legible. | Leakage/stale/export/provider/redaction/retention states show healthy/warn/blocked/unknown and next actions. |

## Accessibility Requirements

- Maintain skip link to `#main`.
- Use `aria-current="page"` only on the active leaf route.
- Use full tree roles only if full tree keyboard behavior is implemented; otherwise keep nested navigation/list semantics.
- Desktop nav resizer must retain `role="separator"`, orientation, min/max/current values, and keyboard resize.
- Every icon-only button needs an accessible name and tooltip.
- Color is never the only signal for trust, sensitivity, due, denied, or blocked states.
- Tables need captions or `aria-label`, stable column headers, row focus state, and no pointer-only row action.
- Modal/confirmation surfaces must trap focus, restore focus, and close with Escape.
- Forms must have labels, helper text where policy matters, and error text associated with fields.
- Loading states use skeletons or live-region text; route-level message/error should use `role="status"` or `role="alert"` as appropriate.
- Diffs must identify additions/removals with text labels, not color alone.
- Copy buttons must announce success/failure.
- Keep WCAG AA contrast; success/good badges need contrast review before beta.
- Honor `prefers-reduced-motion`; avoid layout-shifting animations.

## Mobile Requirements

- At <= 920 px, collapse the left tree behind a nav button or sheet/drawer.
- After mobile nav closes, preserve breadcrumb/current page title in the topbar or route header.
- Asset reader stacks as: header, trust summary, content tabs, content, expandable trust rail.
- Package builder stacks as: stepper, scope controls, preview, trust/package rail, command snippets.
- Tables convert to horizontal scroll with sticky first column or compact row cards; do not squeeze critical labels.
- Topbar command remains accessible and does not overlap identity/health controls.
- Forms use single-column layout and keep action bars sticky only when they do not obscure content.
- No text should overflow buttons, badges, nav leaves, or metric tiles at 320 px.

## Reuse Versus New Route Modules

Reuse current surfaces:

- Shell/topbar/tree nav and density/resizer behavior.
- Library metrics, filters, table, and selected asset detail foundation.
- Search and managed-query runner foundation.
- Review queue, review/publish/restore/version snapshot API calls.
- Operations summary and existing access/provider/policy/telemetry/approval controls.
- Export generation call as the seed for Distribute.

Create new route modules:

- `routes/read/AssetReaderRoute.tsx`.
- `routes/read/SearchRoute.tsx`.
- `routes/work/ReviewQueueRoute.tsx`.
- `routes/work/VersionDiffRoute.tsx`.
- `routes/distribute/PackageBuilderRoute.tsx`.
- `routes/distribute/ExportHistoryRoute.tsx`.
- `routes/operate/TrustConsoleRoute.tsx`.
- Shared `components/trust/*`, `components/package-builder/*`, `components/state/*`.

Avoid:

- Adding Distribute as another conditional block inside the current `operations` route.
- Adding route-specific state to the top-level `App` component when it can live in a route module.
- Installing a full component registry before proving a route needs it.

## Mismatches Between Design Docs And Live App

- Design package originally names three product groups: Read, Work, Operate. The beta plan and manager map require four: Read, Work, Distribute, Operate.
- Live React app currently has Read, Work, Operate only; `exports` is a leaf under Operate. Beta requires Distribute as a top-level surface with package builder.
- Design package focuses on reader path, trust rail, and operations templates. It does not yet specify a full package-builder flow.
- Live app has a trust banner with several badges and metadata grid; beta should replace the first impression with one composite trust state and progressive disclosure.
- Live app has side-by-side raw content comparison; beta needs field-level review/version diff and publish gate semantics.
- Live app `App.tsx` is monolithic. Heavy UI work should split route modules rather than continue adding route-specific state there.
- Current app and design docs align on iconless sub-page leaves, resizable page tree, Quiet Control Plane styling, local shadcn-style primitives, and public-reader gating.

## Files Inspected

- `README.md`
- `work/beta-execution/manager-execution-map.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/design/README.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/lib/utils.ts`
- `docs/design/agentic-cms-design-system/index.html`
- `docs/design/agentic-cms-main-page-mockups/index.html`
- `docs/design/agentic-cms-main-page-mockups/styles.css`
- `docs/design/agentic-cms-main-page-mockups/app.js`
- `apps/api/src/server.ts` (targeted route/API search)
- `packages/schema/src/index.ts` (targeted route/API search)
- `packages/cli/src/index.ts` (targeted CLI surface search)
- `packages/mcp-server/src/server.ts` (targeted MCP surface search)

## Verification Evidence

- Worktree state was checked before writing. Existing dirty work includes `apps/web` and many docs/code files, so this lane treated those files as current source context and only wrote this required output file.
- Route/source search confirmed current web route IDs: `library`, `search`, `asset-read`, `review`, `versions`, `operations`, `access`, `providers`, `policies`, `telemetry`, `approvals`, `exports`.
- Component source inspection confirmed only local `Button`, `Badge`, and `cn` primitives exist under `apps/web/src/components` and `apps/web/src/lib`.
- Design package inspection confirmed local guidance: local primitives first, shadcn core second, ReUI only for richer console components, and iconless leaf navigation by default.
- Development and technical docs confirmed existing API/CLI/MCP/export foundations and the current verification commands: `typecheck`, `test`, `build`, Compose config, restricted leakage verifier, backup/restore verifier, OpenAPI check, Compose smoke, and UAT targets.

## Open Product Decisions

- Package history persistence: use audit/export events for beta, or add a first-class saved package record.
- Package scope model: whether package builder scope is asset IDs only for beta, or also collections/groups/lifecycle/sensitivity/principal.
- Release-gate source: whether latest validation/leakage/eval results are persisted and API-readable, or beta routes launch/check external commands and show unknown when not persisted.
- Trust disclosure policy: exactly which restricted metadata can be shown to readers on direct hits.
- Route implementation strategy: keep hash routing for beta or introduce a lightweight router during route-module split.

## Next Safe Action

Use this spec as the handoff for the heavy UI implementation lane. The first implementation slice should add Distribute as a top-level nav group and route module with a demo-scope package-builder flow backed by the existing `/exports/ai-package` JSON/OKF routes, while leaving deeper package history and trust-console persistence as explicit follow-up API work.
