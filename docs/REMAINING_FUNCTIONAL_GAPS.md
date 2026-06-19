# Remaining Functional Gaps

This document records what is not actually complete after the alpha functional closeout and private-beta hardening pass. It should prevent the project from claiming production, hosted-service, or full orchestration readiness before the evidence exists.

## Completed In Current Alpha Core

- Governed registry, asset versions, review/publish/restore, validation, and synthetic corpus import.
- Local users, service accounts, groups, API keys, scoped permissions, browser sessions, CSRF, OIDC configuration, and audit events.
- Permission-filtered retrieval through lexical, deterministic hash-vector, OpenAI-compatible provider-vector, and hybrid strategies.
- REST/OpenAPI, SDK, CLI, MCP, worker, operational web UI, AI export, and OKF v0.1 export projection, with a documented private-beta contract for the first-run and fetch/search/export lane plus focused CLI and MCP contract-test automation.
- Telemetry, redaction, retention, cache controls, provider-routed managed-query foundation, deterministic evals, and disabled-by-default action-request governance.
- Docker Compose runbooks, backup/restore verification helpers, restricted leakage verifier, Railway private-alpha template, and public-prototype hardening.

## Deferred: External Decisions Or Credentials Required

- Real provider-routed smoke tests with OpenAI, Anthropic, or OpenRouter secrets and agreed cost/quota limits.
- Real Microsoft Entra/OIDC tenant verification, group-claim mapping, allowed domains, and redirect settings.
- Hosted-service tenant provisioning, billing, managed backups, hosted telemetry retention defaults, and support/SLA posture.
- Public alpha release choices: copyright holder/year, private vulnerability reporting confirmation, and tag-only versus GitHub prerelease.
- Any non-synthetic corpus import or private/customer data use.

## Deferred: Product Or Architecture Work

- Richer embedding lifecycle automation beyond env-based provider/model selection, semantic reranking, per-tenant retrieval profiles, and search-service federation.
- Full quality-based model routing, budgets, LLM-as-judge automation, raw transcript review, and semantic caching.
- External side-effecting action adapters, connector credential governance, sandboxing, rollback semantics, and richer multi-step approvals.
- SCIM, MFA enforcement/reporting, remembered-device trust policy, richer Entra lifecycle mapping, and hosted identity hardening.
- Advanced analytics warehouse, long-range dashboards, alerting/escalation preferences, and ACME/managed ingress automation.
- Object storage adapters for attachments, generated export artifacts, large logs, and their backup/restore path.

## Deferred: Repo-Local Hardening Still Worth Doing

- Generated OpenAPI or a stronger route/schema drift check beyond the current hand-authored OpenAPI inventory gate and beta-critical fixture tests.
- Broader CLI/MCP contract coverage for the remaining long-tail commands beyond the private-beta first-run and fetch/search/export lane.
- Compose smoke automation that boots an isolated CI stack, bootstraps an admin, imports corpus, searches, checks same-origin proxy health, and cleans up without relying on persistent Docker state.
- CI or release automation for `security:verify-restricted-leakage` and `db:verify-backup-restore`; default CI currently covers only deterministic static gates and focused contracts.
- Browser/UAT automation after the separate UI design review lands.

## Current Boundary

The current repo can be described as a private beta candidate for the self-hosted open-source core when the release gates in `docs/BETA_PRIVATE_CONTRACT.md` pass. It should not be described as production-ready, hosted-service-ready, stable-API-compatible outside the documented beta lane, enterprise-identity-complete, or full managed-agent orchestration.
