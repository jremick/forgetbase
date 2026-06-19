# IA Review Decisions

Date: 2026-06-19

## Decision 1: Separate manager and reader jobs instead of forcing one CMS surface

Decision: Use stable console zones around governed assets, work, distribution, activity, health, integrations, settings, and approvals for managers/operators, and provide a separate reader-facing published-material interface for consumer users.

Rationale: The product is agent-native, but it has two human jobs. Content/system managers need a control surface for governance, publishing, permissions, distribution, and operations. Reader users need a simple web interface for consuming published material without seeing the control system. NN/g complex-app guidance, GOV.UK service guidance, and enterprise console patterns all point toward separating user jobs and keeping admin controls out of reader journeys.

Uncertainty: Exact manager labels still need real operator testing. The reader surface also needs a later information-scent pass once real customer content replaces the demo corpus.

## Decision 2: Replace visible Operations with Health

Decision: `#operations` and `#operate` now alias to `#health`; Operate exposes five visible leaves instead of an “Overview” leaf.

Rationale: “Operations” describes a department or area, not a specific job. Health gives the old overview intent a more concrete operator purpose: check whether the system is ready and safe.

Uncertainty: A future Control Room/Home page may still be useful when recents, favorites, failed runs, and pending work exist.

## Decision 3: Keep Review under Work

Decision: Review remains a Work route and no longer participates in Operate nav active state or breadcrumbs, while the existing JSX panel stays in the same implementation section for now.

Rationale: Review is governance work, not system operation. Moving JSX sections tonight would add risk without improving the rendered IA.

Uncertainty: The large `App.tsx` should eventually be split into route modules, but this pass avoided that while shadcn/ReUI migration work is already in progress.

## Decision 4: Rename Telemetry to Activity

Decision: `#telemetry` aliases to `#activity`.

Rationale: The page includes retrieval events, audit events, feedback, evals, and model-generation signals. Activity is a better human label for mixed event streams and observability.

Uncertainty: Deep observability users may still expect a lower-level Telemetry label. If tree testing shows that, Activity can contain a visible “Telemetry” subsection without restoring it as top-level IA.

## Decision 5: Rename Providers to Integrations

Decision: `#providers` aliases to `#integrations`.

Rationale: The page configures both model providers and auth providers. Integrations describes the broader job more accurately.

Uncertainty: If connectors expand substantially, Integrations may need subnavigation by model providers, identity providers, importers, exporters, and webhooks.

## Decision 6: Fold Access and Policies into Settings

Decision: `#access` and `#policies` alias to `#settings`.

Rationale: Users, service accounts, groups, keys, sessions, policy controls, retention, secrets, and PII are administrative settings. Grouping them prevents an Operate nav made of implementation fragments.

Uncertainty: The resulting Settings page is long. Future work should add route-level subsections or tabs once the module split is safer.

## Decision 7: Preserve legacy hashes instead of breaking old URLs

Decision: Old route hashes remain supported through an alias map and display a compatibility notice when opened.

Rationale: Backward-compatible aliases reduce confusion for existing screenshots, notes, and links while allowing the visible IA to improve.

Uncertainty: These aliases can be removed later after public docs and screenshots stop referencing old hashes.

## Decision 8: Keep implementation surgical

Decision: No route-module rewrite, package changes, backend route renames, shadcn component additions, or API contract changes in this pass.

Rationale: The IA issue could be improved at the shell/route/panel layer, and the repo already has active shadcn migration changes. A broader rewrite would raise merge and regression risk without being required for the user-facing IA improvement.

Uncertainty: This leaves structural debt in `App.tsx`; the next safe lane is a focused route-module extraction after current UI migrations settle.

## Decision 9: Let every authenticated role open the reader interface

Decision: Add `#reader` as an authenticated route that renders the same published-material reader shell for admins, maintainers, and readers. Actual reader accounts are still routed there by default.

Rationale: Managers and operators need to verify and debug the consumer experience without creating a separate login or using an impersonation path. This is a view-mode change only: it uses the current principal and existing permission-filtered API responses, so it does not bypass access control.

Uncertainty: A later enterprise version may need true delegated impersonation with audit evidence, but that would be a separate security-sensitive workflow.
