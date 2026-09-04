# Operational release plan

Date: 2026-09-05
Status: implementation verified; hosted release gates pending
Owner: Jarel Remick

## Outcome and authority

Deliver a dependable, single-tenant ForgetBase installation in which people and
agents retrieve the same approved version, permissions hold across every delivery
surface, and an operator can identify, deploy, back up, and recover the release.
Use the existing personal Railway deployment for the reproducible hosted release.
Docker Compose remains the supported self-hosted installation contract.

The owner requested this plan and authorized execution and use of the existing
Railway deployment on 2026-09-05. This includes the necessary implementation,
tests, reviewed Git integration, private release artifacts, and deployment.
Repository visibility stays private. Production data must be preserved.

Source baseline: remote main `d002642ea84b4697f8f097e55f71254fc458375d`.
Work in an isolated `codex/operational-release` checkout. Preserve all existing
branches and dirty worktrees. Treat feature-branch and local safety work as
candidates that need integration and verification.

## Scope and decisions

- Keep the TypeScript/Fastify/React/PostgreSQL modular monolith, storage adapter,
  existing worker, CLI, SDK, and MCP. Refactor the affected domain rules as needed.
- Separate draft editing from the immutable version selected for publication.
- Share target, scope, surface, grant, and publication authorization across
  commands, queries, exports, and sync.
- Make collection traversal complete and permission-aware before final limits.
- Persist content and durable follow-up work together. Retries must not misreport
  or duplicate successful content writes.
- Keep local SQLite data a disposable permission-scoped projection.
- Establish exact source identity and backup/recovery evidence before declaring
  the existing Railway installation operational.
- Use synthetic content and existing project authentication routes for tests.
- No public launch, repository visibility change, paid model evaluation, new
  provider, hosted multi-tenancy, billing, Kubernetes, SCIM, or broad UI redesign.

## Delivery gates

| Gate | Required work | Exit evidence | State |
| --- | --- | --- | --- |
| 1. Governed core | Lifecycle authorization; individual grant list/revoke; draft/published separation; complete list/search/export; durable indexing and truthful save results; resolved Compose auth/cookie checks; dependency remediation; deterministic analytics test | Unit and PostgreSQL integration tests for negative roles/surfaces, drafts, >200 assets, denied leading search hits, retry/outage/revocation behavior; clean supported-runtime install/build/contracts | Local checks pass; exact release CI pending |
| 2. Human and agent workflow | Publish/update/revoke a linked instruction and document; complete reader navigation/search; usable instruction authoring/import path; source/citation parity through API/CLI/MCP | Rendered desktop/mobile reader/admin checks and synthetic end-to-end task, denial, and citation evidence | Isolated proof passes; hosted checks pending |
| 3. Reproducible release | Integrate approved candidate; version and source identity in artifacts/runtime; current CI; private release notes and checksums; use the existing Railway project and services | Exact Git SHA and build identity, successful migrations, authenticated readiness/UAT, protected-route denial, coherent API/web/worker deployment | Pending |
| 4. Operation and recovery | Verify stopped-writer database/blob backup and isolated restore; health/index/worker observability; deployment rollback and key-rotation runbooks | Recovery manifest and integrity/access checks; named rollback target and preserved production data; deployment readback | Pending |
| 5. Extension graduation | Review and integrate managed-upgrade and local-runtime candidates, including safety WIP; verify write fencing, concurrent revocation/sync, snapshot serialization, credential rollback, and restore behavior; complete bounded import semantics where needed for the supported workflow | Focused security/contract tests and isolated failure injection; real activation only after its own gates pass | Pending |

## Implementation lanes

Use bounded parallel work only for independent scopes, with explicit file/function
ownership. The parent owns integration, PostgreSQL and browser verification, live
operations, and final release. Serialize expensive builds and shared-state changes.

1. Authorization and grants: common mutation authorization, targeted revocation,
   corresponding API/SDK contracts, and negative tests.
2. Publication: immutable published pointer, preview semantics, migration and
   repository projections, and draft-isolation tests.
3. Installation/release defaults: Compose validation, safe dependency updates,
   deterministic test clocks, and release identity preparation.
4. Parent integration: collection/query completeness, durable processing,
   consumer behavior, security review, release and Railway verification.

## Trust boundaries and failure handling

Authentication identifies the principal; authorization checks the actual target,
action, client surface, and publication visibility. A write role does not grant
read access to every document. Canonical records and durable work must commit
together; a provider/index outage must not convert a committed save into an
ambiguous failure. Search/index/cache data must not bypass current permission or
publication checks. Exports must declare completion and use stable traversal.

Production changes are Tier 3 under the delivery harness. Review migrations as
additive/backward-compatible where possible. Capture the current deployment and
database/blob recovery point before migration. Never roll a database backward
after reopening writers without an explicit recovery decision. Local sync and
updater activation require separate proven invariants, even if their code ships.

Stop the dependent release action if production identity, ownership, credentials,
backup integrity, schema compatibility, or a required verification gate is
uncertain. Continue independent implementation and verification. Ask only for a
new material scope/cost/credential decision or genuinely necessary user input.

## Verification ledger

Record exact commands, runtime versions, results, commit, deployment IDs, artifact
hashes, and remaining limitations in `docs/OPERATIONAL_RELEASE_VERIFICATION.md`.
Keep secrets, raw live content, backups, and machine-specific credentials outside
version control. A passing unit suite does not replace PostgreSQL integration,
rendered browser UAT, or deployed readback.

The release is complete when Gates 1-4 pass for the declared supported surface.
Extension status must be explicit; do not advertise activation or readiness for
any Gate 5 feature without its required evidence.
