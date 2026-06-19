# ForgetBase Human UX / IA Review Plan

Date: 2026-06-19
Goal: Produce a practical human-perspective UX and design-architecture review for the current ForgetBase / ForgetBase web UI, grounded in repo state, current design artifacts, and reputable UX frameworks.

## Source Of Truth

- Product frame: agent-native instruction control plane, not a generic human CMS.
- Human UI role: operational surface for reading, review, publishing, debugging, configuration, and fallback inspection.
- Repo/doc baseline: `README.md`, `docs/END_TO_END_GOAL.md`, `docs/TECHNICAL_SPEC.md`, `docs/DECISIONS.md`, `docs/MVP_SCOPE.md`, `docs/DEVELOPMENT.md`, `docs/design/README.md`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`.
- Design continuity: `Read / Work / Distribute / Operate`, Quiet Control Plane, Governed Reading Room, iconless leaf navigation by default.

## Delegation Setup

- Claude Code: `9585735a`, Opus/xhigh, `frontend_design_reviewer`, inspect-only, prompt at `work/ux-review/claude-human-ux-review-prompt.md`.
- Codex sub-agent: codebase IA mapper, read-only route/page-purpose inventory.
- Codex sub-agent: best-practice rubric researcher, source-backed external framework rubric.

## Review Frameworks

- Nielsen Norman Group: heuristic evaluation, 10 usability heuristics, severity by frequency/impact/persistence.
- W3C WCAG 2.2: keyboard, focus, labels, status messages, contrast, target size, accessible names.
- GOV.UK Service Manual / Service Standard: user needs, whole service journeys, simple-to-use services.
- Material Design navigation: navigation should support task completion, hierarchy, and wayfinding.
- IBM Carbon data-table guidance: table search, filtering, sorting, row actions, progressive disclosure, batch actions.
- Atlassian / Fluent enterprise patterns: predictable navigation, breadcrumbs, settings separation, plain labels.

## Confirmed Review Direction

Primary critique: the UI has improved component quality, but the human information architecture is still alpha-shaped.

Highest-priority findings to validate and act on:

1. `Operate` is one mega-surface using route-conditioned show/hide panels, not true pages.
2. Operate data is mostly hidden behind manual load buttons, so pages open empty.
3. The persistent API URL/API key bar exposes implementation plumbing on every authenticated page.
4. `Asset read`, `Version compare`, and `Library` do not map cleanly to distinct human destinations.
5. `Policies`, `Telemetry`, and `Approvals` share panels and ownership ambiguously.
6. Export actions appear in Library even though Distribute is the package/export destination.
7. Breadcrumb primitives exist but page headers do not use them.
8. Folder glyphs (`RD/WK/DS/OP`) are cryptic and should be icons or removed.

## Target IA

- Read: Library, focused Asset Reader, Search & Managed Query.
- Work: Review Queue, review/publish flow, version diff/restore in object context.
- Distribute: Package builder, package result, consumer examples; legacy exports hidden as alias only.
- Operate: overview that routes to Access, Providers, Policies, Telemetry, Approvals. Each page owns its controls once and auto-loads.

## First Implementation Lane

Do this before broad visual work:

1. Auto-load Operate sub-routes on navigation with skeleton/empty/error states.
2. Hide the global API URL/API key control bar for cookie-session users; move it to a developer disclosure/settings location.
3. Fix nav-to-page truth: make Asset Reader a real focused destination; keep version compare in one place; remove visible legacy exports leaf.
4. Move export actions out of Library and into Distribute.
5. Replace or remove text folder glyphs and wire breadcrumbs through existing components.

Follow-on lane: split `App.tsx` route modules and rebuild Policies/Telemetry as grouped config/reporting templates with sub-nav, saved-vs-current state, and single ownership for each panel.

## Verification

- Static: `npx -y pnpm@11.7.0 --filter @forgetbase/web typecheck`, then web build and focused route tests.
- Browser: 15-minute beta path from login to Library, Asset Reader, Search/Managed Query, Review, Distribute export, restricted-omission proof, Telemetry read-back.
- IA truth test: every nav leaf lands on a distinct, single-purpose, populated page.
- Accessibility: keyboard nav, visible focus, status messages, accessible folder labels, contrast checks for success/warning badges, one `h1` per page.
- Responsive: 1180, 860, and 560 px checks for nav, tables, headings, and primary actions.

## Open Decisions

- Is manual loading intentional cost control or unfinished wiring? If intentional, replace with explicit lazy-load affordances; otherwise auto-load.
- Is self-hosted first-admin bootstrap expected in UI for beta, or is invitation/login-only the supported human path?
- Should the current shadcn migration lane include route-module splitting now, or should this UX/IA lane happen immediately after component migration stabilizes?
