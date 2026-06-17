# Roadmap

## Phase 0: Planning And Specification

Status: complete for initial scaffold.

Deliverables:

- end-to-end goal
- technical specification
- decision log
- MVP scope
- security model
- synthetic corpus plan
- implementation plan

Exit criteria:

- repo has a clear build goal
- first implementation milestone is defined
- no private source content is committed
- user approves moving from planning to code scaffold

## Phase 1: Code Scaffold

Status: scaffold implemented and locally verified, including Docker Compose startup for Postgres, a one-shot migration gate, API, worker, and web preview.

Goal: create a working monorepo skeleton and local runtime.

Deliverables:

- pnpm workspace
- app/package layout
- shared schema package
- API health service
- worker placeholder
- web placeholder
- CLI placeholder
- MCP server placeholder
- Docker Compose for Postgres and app services
- baseline test/lint/typecheck commands

Exit criteria:

- install succeeds
- typecheck passes
- tests pass
- API health responds locally
- CLI health reaches API
- MCP server lists placeholder tools
- Docker Compose starts cleanly

## Phase 2: Registry Foundation

Status: initial foundation implemented for migrations, create/list/get/update/version-snapshot/review-queue/review/publish/restore API routes, version records, separate instruction/human document persistence, validation, MCP list/fetch/version/review/validate/publish tools, and demo corpus import. Delete workflows, multi-step approval workflows, and deeper validation remain pending.

Goal: implement governed assets, versions, metadata, and validation.

Deliverables:

- database migrations
- asset CRUD
- version records
- instruction object model
- human document model
- metadata validators
- demo corpus importer

Exit criteria:

- valid demo corpus imports
- invalid metadata fails with actionable errors
- asset version history is visible
- instruction and document objects can be linked
- stale review dates can be reported by a repeatable validation command
- restricted assets are blocked from public export packages by validation

## Phase 3: Auth And Permissions

Status: initial foundation implemented for local users, local service accounts, tenant service-account policy limits/default service-key expiry, API key rotation-due reports, dry-run-first deduped worker rotation reminder maintenance with optional signed webhook delivery, local groups and memberships, group member removal and group deletion controls, password login and OIDC/Entra authorization-code login that issue short-lived scoped API keys, database-backed browser login-session inventory/revocation with device labels and safe client metadata, rolling idle-timeout enforcement, absolute browser-session lifetime enforcement, and one-time refresh-token rotation tied to login-created keys, HttpOnly session-cookie web auth over those short-lived keys, signed CSRF protection for cookie-authenticated unsafe browser requests, current-session/key logout revocation, OIDC external identity binding, configurable email account linking, claim-based group sync, web password/OIDC login and sign-out controls, one-time scoped user-owned or service-owned API keys, admin bootstrap, document-level user/group/service-account read grants, permission-filtered asset reads, user and service-account list/create/update/disable controls, API key list/create/rotate/revoke controls, admin-managed OIDC/Entra auth provider configuration, tenant secret-reference policy controls for provider/auth-provider env-var references, web identity operations, MCP identity tools, and denial/login/refresh/logout/login-session/user/service-account/service-account-policy/group/permission/key/auth-provider lifecycle audit events. Remaining work includes richer user and group policy controls plus SCIM/richer Entra mapping, remembered-device trust policy, MFA reporting, and hosted identity hardening.

Goal: enforce user, service-account, group, API key, and permission boundaries.

Deliverables:

- local user auth
- service accounts
- API keys
- roles/groups
- permission grants
- denial audit events
- permission tests

Exit criteria:

- unauthorized users cannot access restricted assets
- API keys enforce scopes
- permission failures are audited

## Phase 4: Search And Retrieval

Status: initial foundation implemented for chunk indexing, Postgres full-text search, transparent `lexical-weighted-v1` ranking metadata, tenant admin retrieval ranking policy, vector-ready chunk storage, permission-filtered search responses, deterministic managed query answer drafts, citation metadata, CLI/MCP search and managed query, worker reindexing, and retrieval telemetry. Embedding generation, vector retrieval, semantic reranking, advanced retrieval evaluation, eval-driven ranking optimization, and richer UI workflows remain pending.

Goal: implement permission-aware lexical and vector retrieval.

Deliverables:

- chunking pipeline
- full-text search
- vector embeddings
- retrieval ranking
- citations
- telemetry

Exit criteria:

- authorized users retrieve expected results
- restricted chunks are filtered before response
- citations include stable IDs and source metadata
- telemetry records retrieval events

## Phase 5: Delivery Surfaces

Status: initial foundation implemented for OpenAPI, same-origin `/api` proxy deployment, server-capped login-session key lifetimes, login-session list/revoke controls with device labels and safe client metadata, rolling idle timeout for cookie-backed sessions, origin-allowlisted credentialed CORS API access, CSRF-protected cookie-backed browser operations, managed query, AI export package generation, CLI export, MCP export, admin telemetry summary, and an operational web UI for cookie-backed password/OIDC login and sign-out, asset browsing, detail inspection, review queue loading, review completion, version diff preview, publish, restore, search, managed-query execution, export generation, telemetry summary, authenticated telemetry/audit views, user/service-account/group/API-key/login-session operations, API-key rotation-due reporting, managed-query feedback, deterministic eval reports, provider config, provider health, secret-reference policy controls, and PII redaction policy controls. Multi-step review and advanced analytics flows remain pending.

Goal: make the system usable through API, CLI, MCP, and web.

Deliverables:

- OpenAPI contract
- CLI commands
- MCP tools
- operational web workflows
- export package generation
- validation report generation

Exit criteria:

- CLI can validate, import, search, fetch, and export
- MCP can search, fetch, validate, and export with citations
- web UI can browse, inspect, list review items, mark assets reviewed, publish, preview versions, restore versions, search, and generate export packages
- export package passes leakage checks

## Phase 6: Operations And Security Hardening

Status: initial foundation started with admin API key list/rotate/revoke controls, audited rotation/revocation, API-key rotation-due reporting for service-account credential hygiene, dry-run-first deduped worker rotation reminder maintenance with optional signed webhook delivery, tenant service-account policy controls, tenant PII redaction policy controls, tenant managed-query cache policy, targeted cache-entry deletion controls, tenant prompt/response capture posture controls, a key-rotation runbook, a web audit-event view, deterministic redaction of common direct identifiers and high-signal secret-token shapes before storing retrieval telemetry queries, managed-query feedback text, and deterministic eval-run report queries, recent-window telemetry analytics summary, tenant telemetry retention policy, manual dry-run/execute purge controls, opt-in worker retention maintenance, opt-in worker managed-query cache cleanup, same-origin browser proxy deployment with optional Compose TLS overlay and local certificate helper, mounted secret-file fallback for provider/OIDC secrets, Postgres backup/restore helpers, non-destructive restore verification, backup/rollback/deploy/restricted-leakage runbooks, asset version snapshot/restore with retrieval reindexing, review queue/review-complete controls, web publish/restore controls, publish gates that expose only `active` + `approved` `public-demo` assets anonymously, deterministic validation surfaces, a restricted leakage verifier, and a GitHub Actions CI validation workflow. Remaining work includes country-specific PII packs, model-based classification, redacted transcript review, notification preferences/escalation, multi-step review workflows, advanced analytics, ACME/managed ingress automation, and deeper hardening tests.

Goal: make the MVP production-credible for SMB self-hosting.

Deliverables:

- backup runbook
- restore test
- rollback runbook
- key rotation runbook
- deploy runbook
- restricted leakage investigation runbook
- PII redaction and retention controls
- audit event views
- security tests

Exit criteria:

- backup/restore works on sample data
- content rollback works
- restricted leakage test suite passes
- PII capture defaults and tenant rule policy are documented and verified for telemetry, feedback, eval-run report queries, and cache bypass
- retention purge defaults to preview and requires admin execution
- prompt/response capture defaults to disabled and metadata-only mode avoids raw content persistence
- generated-answer cache policy can disable caching and cap TTLs
- generated-answer cache entries can be individually deleted without exposing cached answers
- scheduled retention maintenance is opt-in and dry-run by default
- scheduled cache cleanup is opt-in and dry-run by default
- scheduled deterministic eval maintenance is opt-in and dry-run by default
- scheduled action approval expiry maintenance is opt-in and dry-run by default

## Phase 7: Managed Agent Layer

Goal: add admin-controlled model orchestration and task execution.

Status: managed query is implemented through `/agent/query`, SDK, CLI, MCP, and a compact operational web runner. Deterministic mode reuses permission-filtered retrieval and returns an answer draft, citations, grounding checks, warnings, and telemetry. Provider-routed mode adds the first OpenAI, Anthropic, and OpenRouter-style execution path over permitted context only, with admin-managed provider config, env-var secrets constrained by tenant secret-reference policy, provider readiness checks, bounded provider retries, priority-ordered provider fallback when no provider is pinned, generation audit metadata, normalized token usage, optional USD cost estimation from admin metadata, preflight token/cost quota caps, tenant prompt/response capture posture, tenant managed-query mode/citation/grounding policy, tenant-policy-capped permission-scoped response caching, safe cache policy/inspection/targeted-deletion/purge controls, tenant cache invalidation after governed asset source changes, opt-in scheduled expired-cache cleanup, and deterministic fallback. Managed query feedback and acceptance tracking are started through API, SDK, CLI, MCP, audit events, and backup/restore coverage. Deterministic eval-case scaffolding is started through `/agent/evals/run`, `/agent/evals/runs`, `/agent/evals/summary`, `/admin/managed-query-eval-schedule-policy`, SDK, CLI, MCP, web controls, worker schedule execution, and `corpus/demo/evals.json`, with durable run history, stored query redaction, lightweight trend analytics, plus overall and tag-specific pass-rate gates that can fail CLI quality checks. Action execution has a disabled-by-default foundation through tenant policy, durable action requests with payload/metadata redaction before storage, dedicated `agent:execute` request scope, tenant hourly request-rate caps, scoped idempotency keys for safe retries, configurable approval expiry, admin approval/denial/expiry audit evidence, dry-run-first opt-in worker expiry maintenance, SDK, CLI, MCP, and web controls; only the internal `create-task-record` action can execute without external side effects. Advanced quality-based routing policy, raw transcript retention/review, semantic caching, LLM-as-judge eval automation, provider-specific retry taxonomies, budgets, hosted secret-manager adapters, richer multi-step approvals, connector credential governance, and external side-effecting action adapters remain future work.

Deliverables:

- provider adapter hardening, retries, richer health checks, and policy-driven routing
- prompt/harness templates
- model routing policy execution
- response cache foundation
- deterministic eval checks and schedule foundation
- feedback and acceptance tracking foundation
- action execution framework

Exit criteria:

- managed answer flow runs against demo corpus
- citation accuracy evals pass threshold
- policy compliance evals pass threshold
- actions require admin enablement and approval policies
- cache invalidates when source assets change

## Phase 8: Hosted Open-Core Service

Goal: create optional hosted-service path without weakening the OSS core.

Deliverables:

- hosted deployment runbook
- tenant provisioning
- billing boundary
- OIDC/Entra
- managed backups
- hosted telemetry retention controls

Exit criteria:

- hosted environment uses the same core services
- tenant boundaries are tested
- hosted-only features do not block OSS usefulness
