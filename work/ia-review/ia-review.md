# ForgetBase IA Review And Implementation Pass

Date: 2026-06-19

## Scope

This pass reviewed the human-facing information architecture of the current web UI for two human jobs: a manager/operator console for governed instruction operations, and a reader-facing web interface for consuming published material. It focused on page purpose, navigation taxonomy, route labels, panel placement, legacy aliases, and whether each visible surface maps to a human job.

The implementation intentionally stayed inside the current hash-routed `apps/web/src/App.tsx` shell. It did not rename API routes, rewrite routing, install packages, split the large app file, or change backend contracts.

After user correction, the architecture explicitly treats consumer/reader users as separate from content/system managers. Managers keep the control-plane shell; users with the `reader` role now receive a published-material reading surface without the side nav, command palette, distribution controls, release controls, settings, or operations pages.

## Best-Practice Basis

- NN/g IA and complex-application guidance: organize around user tasks and domain objects, support nonlinear workflows, reduce clutter without hiding required capability, and validate labels with card sorting or tree testing.
- NN/g usability heuristics: keep system status visible, preserve user control, use consistent labels, prevent errors around high-impact actions, and make workflows recognizable.
- W3C WCAG 2.2: keep repeated navigation in consistent order, provide more than one way to find pages, use headings/labels, maintain keyboard operability and visible focus, and expose status updates.
- GOV.UK Service Manual and Design Principles: start with user needs, solve the whole problem, use accessible/simple patterns, and keep security/privacy/reliability visible.
- IBM Carbon: operational collections should be table-first with search, filters, empty states, counts, and batch/action affordances.
- Atlassian and Fluent: enterprise tools need stable navigation, real breadcrumbs, strong page headers, predictable settings separation, and restrained hierarchy.
- AWS/Azure/Google Cloud console patterns: complex operator consoles commonly separate resources, activity/logs, health, integrations/settings, recent/favorite destinations, and command/search entry points.

## IA Findings

The strongest mismatch was that the UI exposed implementation categories as page labels: `Telemetry`, `Providers`, `Policies`, `Access`, and `Operations`. Those are understandable to builders but weaker for humans trying to answer “where do I do this job?”

The revised taxonomy maps visible routes to operator intents:

| Zone | Visible Route | Human Purpose |
|---|---|---|
| Read | Asset library, Search, Reading room | Browse and inspect governed assets with trust state visible. |
| Work | Review queue, Version compare | Handle governance work and inspect version changes. |
| Distribute | Package builder | Build API/CLI/MCP/JSON/OKF packages from approved assets. |
| Operate | Activity | Inspect retrieval, audit, feedback, and eval activity. |
| Operate | Health | Check API, provider readiness, telemetry summary, action policy, eval status, and cache posture. |
| Operate | Integrations | Configure model providers and external auth providers. |
| Operate | Settings | Manage users, service accounts, groups, keys, sessions, policy controls, retention, secrets, and PII. |
| Operate | Approvals | Review action requests and action-execution governance. |

## Implemented Improvements

- Canonicalized Operate navigation to five job-oriented leaves: `Activity`, `Health`, `Integrations`, `Settings`, and `Approvals`.
- Kept `Review queue` under Work instead of letting the Operate route classifier own it.
- Converted old hashes into compatibility aliases:
  - `#operations` and `#operate` open `#health`.
  - `#telemetry` opens `#activity`.
  - `#providers` opens `#integrations`.
  - `#policies` and `#access` open `#settings`.
  - `#exports` continues to open `#distribute`.
- Added a visible legacy-route notice for renamed Operate hashes so humans understand why an old URL lands on a new page.
- Moved the identity-menu shortcut from `Access` to `Settings`.
- Added a Health workspace panel with API status, provider readiness, recent retrieval count, action policy status, pending actions, latest eval posture, and cache policy state.
- Separated panel purpose:
  - Activity: telemetry summary, retrieval events, audit events, feedback, eval report/history.
  - Health: status summaries, provider readiness, telemetry summary, eval report/history.
  - Integrations: model providers and auth providers.
  - Settings: access administration, policy controls, retention, cache controls, secrets, and PII.
- Updated workspace auto-loaders so each renamed page loads the data its panels need.
- Fixed the missing operations-region heading target by adding an `ops-title` screen-reader heading.
- Added a dedicated reader-role interface for published material: published-library list, reader search, focused article view, and source/version footer.
- Gated the reader interface to active, approved web-surface assets while preserving the existing permission-filtered API boundary.

## Validation Still Needed

- Run a lightweight tree test with representative operator prompts before treating the route labels as final. Example tasks:
  - “Where would you check whether exports are failing?”
  - “Where would you rotate an API key?”
  - “Where would you find a retrieval denial?”
  - “Where would you configure model providers?”
  - “Where would you approve an action request?”
- Future IA work should move from route grouping to object-level structure: asset detail tabs for Overview, Content, Metadata, Permissions, Versions, References, Distribution, and Activity.
- Saved views, recents, favorites, and pinned routes are credible enterprise-console patterns but were not implemented in this pass.
