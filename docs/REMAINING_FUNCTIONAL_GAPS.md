# Remaining Functional Gaps

This document records what is not actually complete after the early functional closeout and beta hardening pass. It should prevent the project from claiming production, hosted-service, stable-API, or full orchestration readiness before the evidence exists.

## Completed In Current Alpha Core

- Governed registry, asset versions, review/publish/restore, validation, and synthetic corpus import.
- Local users, service accounts, groups, API keys, scoped permissions, browser sessions, CSRF, OIDC configuration, and audit events.
- Permission-filtered retrieval through lexical, deterministic hash-vector, OpenAI-compatible provider-vector, and hybrid strategies.
- REST/OpenAPI, SDK, CLI, MCP, worker, operational web UI, AI export, and OKF v0.1 export projection, with a documented early contract for the first-run and fetch/search/export lane plus focused CLI and MCP contract-test automation.
- Telemetry, redaction, retention, cache controls, provider-routed managed-query foundation, deterministic evals, and disabled-by-default action-request governance.
- Docker Compose runbooks, backup/restore verification helpers, restricted leakage verifier, Railway deployment template, and public-prototype hardening.
- Reader/admin runtime splitting with an authorization guard before the lazy admin import, compiler-enforced unused-code checks, and a measured raw/gzip bundle budget.
- A push/manual GitHub Actions workflow for the isolated private-live proof, including synthetic seed data, smoke/leakage checks, backup/restore, authenticated reader/admin UAT, evidence upload, and cleanup.

## Deferred: External Decisions Or Credentials Required

- Real provider-routed smoke tests with OpenAI, Anthropic, or OpenRouter secrets and agreed cost/quota limits.
- Real Microsoft Entra/OIDC tenant verification, group-claim mapping, allowed domains, and redirect settings.
- Hosted-service tenant provisioning, billing, managed backups, hosted telemetry retention defaults, and support/SLA posture.
- Public beta release choices: copyright holder/year, private vulnerability reporting confirmation, and tag-only versus GitHub prerelease.
- Controlled private-live reader/admin UAT with named testers, captured observations, triaged findings, and exact deployed-commit proof.
- Any non-synthetic corpus import or private/customer data use.

## Deferred: Product Or Architecture Work

- Richer embedding lifecycle automation beyond env-based provider/model selection, semantic reranking, per-tenant retrieval profiles, and search-service federation.
- Full quality-based model routing, budgets, LLM-as-judge automation, raw transcript review, and semantic caching.
- External side-effecting action adapters, connector credential governance, sandboxing, rollback semantics, and richer multi-step approvals.
- SCIM, MFA enforcement/reporting, remembered-device trust policy, richer Entra lifecycle mapping, and hosted identity hardening.
- Advanced analytics warehouse, long-range dashboards, alerting/escalation preferences, and ACME/managed ingress automation. The bounded 7/30/90-day operational dashboard is implemented without a warehouse.
- S3-compatible object storage for attachments, plus storage adapters for generated export artifacts, large logs, and hosted backup orchestration. The local attachment adapter and coordinated self-hosted backup/restore path are implemented.

## Deferred: Repo-Local Hardening Still Worth Doing

- Generated OpenAPI or a stronger route/schema drift check beyond the current hand-authored OpenAPI inventory gate and beta-critical fixture tests.
- Broader CLI/MCP contract coverage for the remaining long-tail commands beyond the first-run and fetch/search/export lane.
- Decompose the lazy admin surface into domain modules with shared session ownership. The current split keeps the reader entry near 613 kB raw / 175 kB gzip and moves about 226 kB raw / 55 kB gzip into an authorization-gated admin chunk, but `AdminSurface.tsx` remains a large legacy component.
- Reduce the remaining initial reader graph where changes produce a measured interaction or load benefit. CI now enforces raw and gzip ceilings and rejects admin-only markers in the reader's static import graph.
- Final release proof manifest populated with public HTTPS live-demo and GitHub settings evidence, then validated with `release-proof:check`; the local manifest is generated but intentionally fails until the public URL and repo settings pass.
- Live GitHub settings still need public-beta read-back before release through `github:public-beta:check`: owner-approved public visibility, reader-first description/topics, a confirmed private vulnerability-reporting route, default-branch protection or rulesets when the plan supports them, and current CI status. Dependabot alerts and security updates are enabled while the repo remains private.

## Current Boundary

The current repo is a private candidate undergoing controlled live UAT. It can be described as a public beta candidate for the self-hosted core only after the gates in `docs/PUBLIC_BETA_GOAL.md` pass and the release proof manifest is validated. It should not be described as production-ready, hosted-service-ready, stable-API-compatible, enterprise-identity-complete, or full managed-agent orchestration.
