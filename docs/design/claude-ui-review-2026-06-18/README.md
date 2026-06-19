# ForgetBase — Claude UI Design Review (2026-06-18)

A fresh, implementation-grounded design review of the ForgetBase operational web UI,
with recommended-improvement mockups for every major page as a self-contained static
artifact.

- **Open `index.html`** in a browser (from disk or any static server). No network or build step.
- Toggle **Show review notes** in the top bar to overlay per-page rationale and risk on each mockup.
- **View as** (Reader / Maintainer / Admin) and **Density** demonstrate role chrome and table density.
- All content is **synthetic/demo**, aligned to `corpus/demo/assets.json` and `corpus/demo/evals.json`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Review overview + 13 page mockups + state system + responsive frames |
| `styles.css` | Stylesheet; inherits the established design tokens, adds new shared patterns |
| `app.js` | Static interactions (routing, tabs, sub-nav, copy, density, role, review toggle) |
| `README.md` | This document: critique, page-by-page improvements, sequencing, risks |

## Sources reviewed

- Live UI: `apps/web/src/App.tsx` (~4.4k lines) and `apps/web/src/styles.css` (~1k lines)
- Saved design package: `docs/design/forgetbase-design-system/`, `docs/design/forgetbase-main-page-mockups/`
- Product model: `README.md`, `docs/END_TO_END_GOAL.md`, `docs/MVP_SCOPE.md`
- Synthetic corpus: `corpus/demo/assets.json`, `corpus/demo/evals.json`

---

## Design direction

The established direction — **"Quiet Control Plane with a Governed Reading Room"** — is correct
for this product and is **kept verbatim**. This is a continuation, not a re-skin:

- Restrained slate + deep teal-blue palette; severity colors reserved strictly for health/risk.
- Sensitivity rendered as a **keyline + label**, visually distinct from status chips (a real product asset).
- Provenance-forward primitives: trust banner, stable IDs, structured instruction objects, citations.
- Light theme first; tokens, radii (≤ 8px), spacing, and type roles reused exactly.

The review's value is **not** a new visual language. It is **information architecture, workflow
completeness, and state coverage** — the three areas where the live app diverges most from the
quality bar the design package itself sets.

### Where direction was genuinely open (and the choice made)

The overall direction is settled, so the artifact does not re-litigate it. Three sub-decisions were
ambiguous; each was resolved in the mockups and is called out here so it can be reversed cheaply:

1. **Library representation** — tree-in-nav-only vs. tree + in-page browser + table.
   → **Chose** single catalog table; tree lives only in the left nav. (See risk R1.)
2. **Human doc vs. agent instruction** — tabs vs. side-by-side split.
   → **Chose** tabs, with the agent instruction rendered structurally from the schema. (See risk R3.)
3. **Operations** — keep one bucket vs. overview-that-routes vs. in-page sub-nav.
   → **Chose** an overview that routes; each domain owns a dedicated shallow page. (See risk R2.)

---

## Critique summary

The strongest finding is that the **live app is materially weaker than its own saved design package.**
The package already specifies dedicated route templates; the implementation collapses most of them into
one surface. The mockups bring the implementation up to (and slightly past) the package's intent.

### Findings, ordered by severity

| # | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| H1 | High | **Operations is a ~25-section mega-page.** Access, Providers, Policies, Telemetry, Approvals, Exports, users, groups, keys, sessions, evals, and every policy form render into one scrolling column; nav routes for those domains resolve into it. | `App.tsx:2708–4240` |
| H2 | High | **Destructive actions fire inline with hardcoded reasons.** Approve/deny and restore execute immediately; denial reason is a constant string; restore appears in both a toolbar and a confirm. | `App.tsx ~3120, ~3290`; `main-page-mockups/index.html:410–416` |
| H3 | High | **No real loading / empty / error / no-access system.** Async states are bare `"No X loaded."` paragraphs; errors are plain red text with no code or next step; reader-vs-admin affordances are missing. | `App.tsx` empty/`error` usage; structural map |
| M4 | Med | **Library shows the same content three ways** (nav tree + in-page folder browser + catalog table). | `main-page-mockups/index.html:190–267` |
| M5 | Med | **Search blends the synthesized answer into the evidence list** — same card styling flattens the answer/evidence hierarchy. | `App.tsx:2577–2706` |
| M6 | Med | **The agent-instruction object renders as a raw `<pre>` blob** even though it is the product's core primitive and has a rich schema. | `App.tsx` compare grid; `corpus/demo/assets.json` instruction schema |
| M7 | Med | **Policies cram unrelated domains into a flat grid** with inconsistent depth and no saved-vs-current state. | `main-page-mockups/index.html:444–452`; `App.tsx:2868–3296` |
| M8 | Med | **Heavy 4-up 26px metric tiles repeat on reader and admin pages alike**, costing scanability. | `styles.css .metric`; multiple pages |

### New shared patterns introduced

- **Summary strip** — compact, bordered counts that replace heavy tile rows on content pages.
- **Destructive staging** — dry-run evidence + required reason + impact preview + typed confirm, in one place, never duplicated.
- **Answer / evidence split** — a primary answer card over a ranked evidence list, with an admin-only denied-results rail.
- **State system** — skeleton, empty, error, and no-access components reused everywhere; no-access disclosure stays conservative.

Supporting moves reused across pages: a persistent **breadcrumb/context bar**, a **policy/access sub-nav rail**,
an **approval queue + detail**, and **provider readiness cards**.

---

## Page-by-page improvements

### Login / private access
Replaces the centered-card-on-gradient login (`App.tsx:2245–2268`) — the one generic-AI tell in the
product — with an operational split: a restrained product statement, a focused auth card (password + Entra
OIDC), an explicit **Private alpha** gate, and a link to the anonymous public-demo reading path. Shows
tenant, API base, and build for operator orientation.

### Library / reader overview
One representation: a single scannable **catalog table** with a filter bar and a compact **summary strip**.
Removes the redundant in-page folder browser; the tree lives only in the left nav. Reader chrome — no admin
CTA as primary; "Import corpus" is maintainer-gated. Restricted rows are summarized as a count and shown
muted-with-generic-label for admins; readers don't see them at all.

### Asset read / detail
Human document and agent instruction are separate-but-linked primitives, presented via tabs. The **agent
instruction renders structurally from the schema** (kind, target agents, input/output contracts, constraints,
failure modes, escalation) — the surface operators actually use to debug what an agent consumes — with a Raw
JSON fallback. Sticky trust banner; copyable stable ID and agent-access snippets; linked sources.

### Search & managed query
**Answer and evidence are separated.** The synthesized answer is one primary card carrying grounding, cache,
cost, and citation-floor signals; evidence is a ranked, citable list below. Mode is a clear segmented control
showing the active policy floor. An **admin-only denied-results rail** shows what was filtered without
exposing it to readers.

### Review queue
A real maintainer worklist: reason filter bar, selectable rows, and a **sticky bulk action bar** on selection.
Each row names the exact reason and the single next action. Bulk publish routes through destructive staging,
re-asserting the active + approved gate per asset.

### Version compare
Side-by-side diff with a unified toggle, and restore handled by a **single destructive-staging panel**:
required change note, explicit impact preview (pointer move, reindex, cache invalidation, audit event), and a
**typed confirmation**. The destructive trigger appears only here.

### Operations dashboard
The biggest IA change: Operations becomes a **router to work**, not a place that does everything. A health
summary, a prioritized **needs-attention list** that deep-links into each domain, maintenance posture
(dry-run jobs), a runbook launcher, and recent audit. The 25 sections move to their owning pages.

### Access management
Identity work split into tabbed sub-views (Users · Service accounts · Groups · API keys · Sessions). **One-time
key reveal** handled in a staging panel with explicit "shown once" semantics; only a safe preview persists.

### Providers
Model providers and auth providers separated into labeled groups. Each card leads with a **readiness state**,
shows the env-var reference (never the value), priority/fallback order, and a health-check timestamp.
"Not ready" providers are visually distinct and surfaced on the Operations overview.

### Policies
A **policy index with a sub-nav rail** replaces the flat 2×2. Each domain gets a focused form with a
**saved-vs-current dirty state** and a sticky save bar. Detail shown is Action execution — the riskiest,
disabled-by-default domain — leading with kill switch, approval requirement, and dry-run default.

### Telemetry
Scoped to observability — redacted retrieval/query events, provider-usage metadata, cache status, retention —
with a time-window control. **Redaction-applied is a first-class column.** The eval run is a linked summary
card, not merged into the telemetry table (it's governance, not telemetry).

### Approvals / action requests
A **queue + detail**, replacing the single inline request. List shows action, requester, risk, and an expiry
countdown; detail shows scope, dry-run evidence in a console, the policy guardrail context, and a **staged
decision with a required note** (no hardcoded denial reason).

### Exports
The **leakage check is a precondition**, not an afterthought: Generate is gated on the restricted-leakage
verifier. Shows the package rule (public-demo only), validation results, excluded-restricted count, and OKF
projection metadata (`okfVersion`, source hashes, `projectionHash`). Blocking failures (leakage) are
distinguished from non-blocking warnings (review-due).

### State system & responsive (reference pages)
A dedicated page demonstrating the four shared states, and a responsive page with three device frames
(Library table→cards, Asset detail rail-below, Approval sticky decision bar). Text always stays inside its
container; no viewport-scaled fonts.

---

## Implementation sequencing

1. **State system + summary strip.** Low-risk shared components; immediate scanability win on every page.
2. **Split the Operations mega-page.** Operations overview + dedicated Access / Providers / Policies /
   Telemetry / Approvals / Exports. The highest-impact structural change.
3. **Destructive staging.** Route restore, publish, revoke, purge, and deny through one staged surface.
4. **Reader polish.** Library catalog, answer/evidence search, structured instruction object.
5. **Role-aware chrome.** Hide maintainer/admin actions by capability, not just markup; audit role changes.

Steps 1 and 3 are shared primitives that pay off across every later step; do them before the page-by-page work.

---

## Risk notes (where the mockups intentionally change IA, density, or workflow)

- **R1 — Library IA.** Removing the in-page folder browser concentrates folder navigation in the left nav and
  breadcrumb. Verify the nav tree exposes enough depth for users who navigated via the in-page browser before
  shipping; if folder-as-workspace is important, a folder-detail drawer can return without re-introducing the
  triple representation.
- **R2 — Operations IA.** Admins accustomed to scrolling one page must now navigate. Mitigated by the
  needs-attention list, deep links, and command palette — nothing is more than one click from the overview.
  Validate with a real admin that the needs-attention list surfaces the right six signals.
- **R3 — Structured instruction view.** Assumes the schema is populated. Sparse or legacy instruction objects
  must fall back to the raw body (the Raw tab) rather than render an empty structure.
- **R4 — Typed-confirm friction.** Restore uses a typed phrase because it moves the current pointer and
  invalidates tenant-wide cache. Do **not** spread typed-confirm to lighter actions; reserve it for
  pointer-moving / irreversible operations.
- **R5 — Density.** The summary strip is denser than the 4-up tiles. On the Operations overview, large metric
  tiles are retained deliberately because that page is glance-first; elsewhere the strip is correct.
- **R6 — Export gating.** Gating Generate on validation must distinguish blocking failures (leakage) from
  non-blocking warnings (review-due). Only leakage blocks; a review-due asset should warn, not stop the package.
- **R7 — Role chrome is demo-only here.** The "View as" switch toggles `data-role` for preview. In the product,
  capability must be enforced server-side; markup-gating alone (the live app's current posture) is not access
  control.

## App observations worth a ticket (not patched — review scope is artifact-only)

- `App.tsx ~3290`: denial reason is a hardcoded string (`"Denied from web operations."`). Decisions should
  capture an operator-entered, audited reason.
- `App.tsx:3120–3126`: approve/deny mutate immediately with no confirmation or dry-run gate in the UI.
- `App.tsx:2245–2268`: login uses a decorative gradient background — the only place the product drifts toward
  generic SaaS styling.
- Async surfaces lack loading/error components; `error` renders as plain red text without a code or retry.
- Reader/maintainer/admin actions (e.g., Review, Publish) are not visibly gated or disabled by role in shared
  views, which can imply permissions the principal lacks.

---

*Generated as a self-contained design review for ForgetBase. Findings reflect the repository state on
2026-06-18. Synthetic/demo content only; no private, customer, staff, or company content is introduced.*
