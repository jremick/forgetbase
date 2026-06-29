# Remaining Functional Gaps

This document records what is not actually complete after the early functional closeout and beta hardening pass. It should prevent the project from claiming production, hosted-service, stable-API, or full orchestration readiness before the evidence exists.

## Completed In Current Alpha Core

- Governed registry, asset versions, review/publish/restore, validation, and synthetic corpus import.
- Local users, service accounts, groups, API keys, scoped permissions, browser sessions, CSRF, OIDC configuration, and audit events.
- Permission-filtered retrieval through lexical, deterministic hash-vector, OpenAI-compatible provider-vector, and hybrid strategies.
- REST/OpenAPI, SDK, CLI, MCP, worker, operational web UI, AI export, and OKF v0.1 export projection, with a documented early contract for the first-run and fetch/search/export lane plus focused CLI and MCP contract-test automation.
- Telemetry, redaction, retention, cache controls, provider-routed managed-query foundation, deterministic evals, and disabled-by-default action-request governance.
- Docker Compose runbooks, backup/restore verification helpers, restricted leakage verifier, Railway deployment template, and public-prototype hardening.

## Deferred: External Decisions Or Credentials Required

- Real provider-routed smoke tests with OpenAI, Anthropic, or OpenRouter secrets and agreed cost/quota limits.
- Real Microsoft Entra/OIDC tenant verification, group-claim mapping, allowed domains, and redirect settings.
- Hosted-service tenant provisioning, billing, managed backups, hosted telemetry retention defaults, and support/SLA posture.
- Public beta release choices: copyright holder/year, private vulnerability reporting confirmation, and tag-only versus GitHub prerelease.
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
- Broader CLI/MCP contract coverage for the remaining long-tail commands beyond the first-run and fetch/search/export lane.
- Compose smoke automation that boots an isolated CI stack, bootstraps an admin, imports corpus, searches, checks same-origin proxy health, and cleans up without relying on persistent Docker state.
- Isolated CI automation for `smoke:compose`, `security:verify-restricted-leakage`, and `db:verify-backup-restore`; default CI currently covers deterministic static gates, static browser UAT, and focused contracts.
- CI automation for authenticated release-mode browser UAT against a seeded same-origin stack; the local UAT script now covers reader/admin roles, restricted/no-access state, ask-with-sources, reviews, policies, access management, approvals, exports, and mobile reader screenshots.
- Final release proof manifest populated with public HTTPS live-demo and GitHub settings evidence, then validated with `release-proof:check`; the local manifest is generated but intentionally fails until the public URL and repo settings pass.
- Live GitHub settings still need public-beta read-back before release through `github:public-beta:check`: public visibility, reader-first description/topics, private vulnerability reporting, default-branch protection or rulesets, and current CI status.

## Current Boundary

The current repo can be described as a public beta candidate for the self-hosted core only after the public beta gates in `docs/PUBLIC_BETA_GOAL.md` pass and the release proof manifest is validated. It should not be described as production-ready, hosted-service-ready, stable-API-compatible, enterprise-identity-complete, or full managed-agent orchestration.
