# Decisions

This log records current product and architecture decisions. Revisit dates are review prompts, not automatic expiry.

## 0076: Product And Codebase Name Is ForgetBase

### Context

The project adopted ForgetBase as the product-facing identity while several internal code, deployment, and machine-consumer surfaces still used the former working namespace. Keeping both identities would make beta docs, contracts, troubleshooting, and public repo posture ambiguous.

### Options Considered

- Keep the former namespace internally and use ForgetBase only as the public brand
- Rename visible docs and UI only
- Hard-rename the repo and codebase to ForgetBase
- Rename with a legacy compatibility cycle

### Decision And Rationale

Hard-rename the product and codebase to ForgetBase with no planned legacy compatibility cycle. The canonical package scope is `@forgetbase/*`, the CLI command is `forgetbase`, the runtime env prefix is `FORGETBASE_`, browser cookies and local storage use `forgetbase`, and machine-readable headers use `x-forgetbase-*`.

The product category remains an agent-native instruction control plane. ForgetBase is the product name, not a shift toward a generic CMS, wiki, or knowledge-base category.

### Consequences

- Existing local env files, scripts, database URLs, API clients, MCP configs, and browser state that use the former namespace must be updated.
- Fresh Docker Compose installs use `forgetbase` database defaults.
- The beta contract intentionally changes before public beta rather than carrying old identifiers forward.
- Any missed former-name references should be fixed as discovered rather than supported as compatibility aliases.

### Follow-Ups / Review

Review residual former-name references before public beta and again before any package publishing.

## 0001: Product Category Is Agent-Native Instruction Control Plane

### Context

The inherited brief described a platform-agnostic AI Resource Hub. The product direction has advanced: human-readable content remains useful, but agents, AI tools, and harnesses are the primary consumers.

### Options Considered

- Conventional CMS or wiki with AI-friendly export
- Static knowledge hub with Markdown source
- Agent-native instruction management platform with human docs as a projection

### Decision And Rationale

Build an agent-native instruction control plane. This better matches the intended value: governed instructions, policies, guardrails, skills, and playbooks that agentic systems can use directly.

### Consequences

- Human docs are secondary and operational.
- API, CLI, MCP, retrieval, permissions, telemetry, and validation become core.
- The data model must support agent-optimized objects, not just rendered pages.

### Follow-Ups / Review

Review after MVP schema design.

## 0002: Open-Core With Apache 2.0 Core

### Context

The project should be open source while allowing an optional hosted service and commercial extensions.

### Options Considered

- Apache 2.0
- AGPL
- source-available commercial license
- dual license

### Decision And Rationale

Use Apache 2.0 for the self-hostable core. Adoption, trust, and broad integration matter more than defensive licensing at this stage.

### Consequences

- Competitors can use the core.
- Hosted and commercial value must come from operations, SSO, advanced orchestration, analytics, eval management, compliance features, and support.
- The OSS core must remain genuinely useful.

### Follow-Ups / Review

Review before first public release and before adding hosted-only features.

## 0003: Single-Tenant OSS Core With Tenant-Aware Data Model

### Context

The first users are AI teams and individual power users. Hosted multi-tenancy is likely later.

### Options Considered

- single-tenant only with no tenant abstraction
- single-tenant runtime with `tenant_id` in schema
- full multi-tenant architecture from day one

### Decision And Rationale

Build the OSS core as single-tenant first, but include `tenant_id` in the data model from day one.

### Consequences

- MVP remains simpler.
- Hosted service migration is easier.
- Tests must ensure tenant boundaries are not ignored.

### Follow-Ups / Review

Review before hosted service design.

## 0004: Docker Compose Is Canonical OSS Deployment

### Context

The project needs to work for individual power users and SMB teams without forcing a cloud vendor.

### Options Considered

- Docker Compose
- PaaS-first deployment
- Vercel plus managed services
- Kubernetes-first deployment

### Decision And Rationale

Use Docker Compose as the canonical OSS install. Keep PaaS container deployment as the first hosted path and Kubernetes as a later enterprise target.

### Consequences

- The core must run as ordinary containers.
- Secrets, backups, upgrades, and TLS need explicit runbooks.
- The hosted product should reuse the same services.

### Follow-Ups / Review

Review during deployment milestone.

## 0005: Local Users First, Pluggable Auth Next, OIDC/Entra Third

### Context

The first release must work without enterprise identity infrastructure, but SMBs will need OIDC and Microsoft Entra ID.

### Options Considered

- local users only
- local users plus pluggable auth abstraction
- OIDC/Entra-first
- SAML-first

### Decision And Rationale

Start with local users and API keys, design an auth adapter boundary, then add OIDC/Entra.

### Consequences

- MVP can be self-hosted easily.
- Enterprise auth is not blocked by schema decisions.
- Permission and audit events must not assume local-only identity.

### Follow-Ups / Review

Review before implementation of auth module.

## 0006: Managed Agent Layer Is Architectural Core But Not MVP

### Context

The system should eventually control model routing, response quality, caching, prompt/harness templates, tool execution, evals, and response policies.

### Options Considered

- build full orchestration first
- ignore orchestration until after MVP
- design orchestration interfaces now, implement after core retrieval works

### Decision And Rationale

Design orchestration interfaces now, but MVP should first prove the registry, permission-aware retrieval, API, CLI, MCP, web UI, validation, and telemetry.

### Consequences

- MVP stays achievable.
- Schema and telemetry must anticipate orchestration.
- Provider adapters can be added without rewriting retrieval.

### Follow-Ups / Review

Review after MVP retrieval and MCP milestones.

## 0007: Separate Human Docs From Agent Instructions

### Context

Human pages and agent instructions need different optimization criteria.

### Options Considered

- one Markdown/page object for both humans and agents
- separate docs and instruction objects with links
- fully separate systems

### Decision And Rationale

Keep human-readable documents and agent-optimized instruction objects separate but linked.

### Consequences

- Human pages can be rendered as Markdown/HTML.
- Instructions can be structured for retrieval, execution, policy, and eval.
- Publishing workflows must handle linked assets.

### Follow-Ups / Review

Review during schema design.

## 0008: Security Posture Is SOC 2-Ready Architecture, Pragmatic SMB Operation

### Context

The product handles policy-sensitive instructions, telemetry, prompts, responses, and potentially PII.

### Options Considered

- lightweight SMB-only security
- SOC 2-ready architecture without certification ceremony
- certification-driven process from day one

### Decision And Rationale

Design controls that support SOC 2 readiness, but operate initially at a pragmatic SMB level.

### Consequences

- Audit logs, RBAC, backups, secrets handling, retention, PII controls, and tenant boundaries are first-order design concerns.
- Formal compliance process is deferred.

### Follow-Ups / Review

Review before hosted service and before handling real customer data.

## 0009: Start Registry Persistence With SQL Migrations And `pg`

### Context

The technical direction recommended Drizzle as the likely ORM, but the first registry milestone mainly needs transparent tables, migrations, and a small repository boundary.

### Options Considered

- Drizzle schema and migrations immediately
- Prisma client and migrations immediately
- explicit SQL migrations with `pg` and a repository interface

### Decision And Rationale

Use explicit SQL migrations and `pg` for the first registry foundation. This keeps the schema easy to inspect, avoids early ORM churn, and still leaves a clean repository seam for moving to Drizzle later if it improves maintainability.

### Consequences

- Migration SQL is the current source of truth for registry persistence.
- Repository methods must keep row mapping and validation disciplined.
- The project should revisit Drizzle once asset versioning, permissions, and search schemas settle.

### Follow-Ups / Review

Review before Phase 4 search and retrieval schema work.

## 0010: Bootstrap Admin API Key For Self-Hosted Local Auth

### Context

The OSS install needs local users and scoped API keys before enterprise OIDC exists. A fresh self-host install also needs a way to create the first admin without storing a default secret.

### Options Considered

- seed a default admin and password
- require direct database setup for the first user
- expose a bootstrap endpoint that works only before any tenant user exists

### Decision And Rationale

Use a bootstrap endpoint and CLI command that create the first local admin and return a one-time scoped API key secret. After a tenant has users, bootstrap returns a conflict and normal admin-scoped API keys must be used.

### Consequences

- No default password or committed secret is needed.
- Operators must treat the returned bootstrap secret as sensitive because it cannot be read again.
- Later auth work should add password login, key rotation/revocation, and OIDC without weakening the bootstrap invariant.

### Follow-Ups / Review

Review during production hardening and before hosted-service onboarding.

## 0011: Start Retrieval With Postgres Full-Text Search And Vector-Ready Chunks

### Context

The MVP needs permission-aware retrieval with citations before a managed agent layer can be credible. The system already uses Postgres and `pgvector`, but embedding providers and semantic ranking policy are not settled.

### Options Considered

- implement semantic vector search first
- add a separate search service
- start with Postgres full-text search and store vector-ready chunks

### Decision And Rationale

Start with Postgres full-text search over indexed chunks, keep citations in chunk metadata, and include a nullable `vector(1536)` embedding column for later semantic retrieval.

This makes retrieval immediately self-hostable and permission-filterable while avoiding premature provider and ranking decisions.

### Consequences

- Lexical search is the current implemented retrieval path.
- API permission filtering remains mandatory before returning API, CLI, MCP, export, or model-context results.
- Embedding generation, semantic ranking, hybrid scoring, and retrieval eval thresholds remain Phase 4 follow-up work.

### Follow-Ups / Review

Review after embedding provider adapters and retrieval eval cases exist.

## 0012: Start Delivery With JSON AI Export Packages And Hand-Authored OpenAPI

### Context

Phase 5 needs usable delivery surfaces before the system has a generated API contract pipeline or managed orchestration layer.

### Options Considered

- wait for generated OpenAPI before exposing a contract
- expose ad hoc API, CLI, and MCP behavior without a shared export shape
- start with a hand-authored OpenAPI document and shared schema-validated JSON export package

### Decision And Rationale

Start with a hand-authored `/openapi.json` endpoint and a shared schema-validated JSON AI export package exposed through API, SDK, CLI, and MCP.

This gives connector builders an immediate stable target while keeping the implementation small. The export package is permission-filtered and citation-bearing, which directly supports the agent-first product thesis.

### Consequences

- OpenAPI may drift unless tests and docs keep it current.
- Export package shape is now part of the public contract and should evolve carefully.
- Generated OpenAPI remains a follow-up once route/schema generation is worth the extra machinery.

### Follow-Ups / Review

Review before public release and before adding non-JSON connector package formats.

## 0013: Implement API Key Revocation Before Password Login And OIDC

### Context

Local users and API keys are the current authentication path. The project still needs password login and future OIDC/Entra, but self-hosted operators already need a practical way to rotate or disable API keys.

### Options Considered

- defer revocation until full auth UI work
- revoke keys only through direct database updates
- add admin API/SDK/CLI revocation using the existing `revoked_at` field

### Decision And Rationale

Add admin-only API key list and revoke controls through API, SDK, CLI, and tests before building password login or OIDC.

This makes the current self-hosted auth path operable and reduces security risk without forcing a broader identity-system buildout.

### Consequences

- API key records are now an operational admin surface.
- Raw secrets remain one-time only and are not returned by list or revoke responses.
- OIDC, hosted secret-manager adapters, per-service quotas, and richer admin controls remain follow-up work.

### Follow-Ups / Review

Review during Phase 6 runbook work and before hosted-service onboarding.

## 0014: Redact Direct Identifiers Before Storing Retrieval Telemetry

### Context

Search queries can include emails, phone numbers, pasted API keys, card-like numbers, or other direct identifiers. Retrieval telemetry is useful for quality, compliance, and operations, but storing raw query text by default increases privacy and incident risk.

### Options Considered

- store raw telemetry and rely on admin policy
- disable query telemetry until full PII detection exists
- deterministically redact common direct identifiers before storage

### Decision And Rationale

Redact common direct identifiers before storing retrieval telemetry query text. Keep the live search response unchanged so clients can correlate their own request, but persist only the redacted query and redaction metadata.

This gives the MVP a practical privacy default without depending on model-based classification or external services.

### Consequences

- Telemetry remains useful for query patterns but loses exact raw values for redacted fields.
- Deterministic rules can miss PII and can over-redact edge cases.
- Configurable capture levels, richer detectors, retention controls, and delete/export workflows remain Phase 6 follow-up work.

### Follow-Ups / Review

Review when adding provider prompts/responses to telemetry, tenant-configurable redaction policy, redacted transcript review, or before public release.

## 0015: Use Custom-Format Postgres Dumps For Compose Backup And Restore

### Context

The OSS deployment path uses Docker Compose and Postgres as the system of record. Operators need a recovery path before the project can credibly claim SMB production readiness.

### Options Considered

- document manual `pg_dump` commands only
- add database backup helpers without verification
- add backup, restore, and non-destructive restore verification helpers

### Decision And Rationale

Use custom-format Postgres dumps with helper scripts for Docker Compose, and verify restores by loading the dump into a temporary database and comparing core table counts.

This gives operators a repeatable backup path and gives the project a practical recovery gate without introducing a separate backup service.

### Consequences

- Backup/restore currently covers Postgres only.
- Main-database restore requires explicit confirmation.
- Future object storage and attachment features need separate recovery coverage.
- Count comparison proves table coverage and basic restore integrity, not semantic business correctness.

### Follow-Ups / Review

Review before adding file/object storage and before publishing a hosted deployment guide.

## 0016: Restore Asset Versions By Moving The Current Version Pointer

### Context

The registry already stores asset versions and points each asset at a `current_version_id`. Phase 6 needs a practical content rollback path that can be used through API, CLI, MCP inspection, and the operational web UI.

### Options Considered

- require database restore for content rollback
- create a new version that copies the old version content
- move `current_version_id` back to an existing version

### Decision And Rationale

Restore an asset by moving `current_version_id` to the selected existing version, then reindex retrieval chunks and record an audit event.

This uses the schema that already exists, preserves the historical version list, and avoids creating noisy duplicate versions for a rollback operation.

### Consequences

- Rollback changes the active content but does not duplicate the restored content into a new version.
- API/CLI/MCP users can inspect a historical version snapshot before restoring it.
- The web UI exposes a first-pass current-versus-selected preview before restore.
- Richer visual diffs, multi-step approvals, and restore confirmation policies remain future work.

### Follow-Ups / Review

Review when adding richer visual diffs, multi-step approvals, scheduled releases, or stricter restore confirmation policies.

## 0017: Treat Publish As A Metadata Release Gate

### Context

The registry stores lifecycle state, status, sensitivity, allowed surfaces, and versioned content separately. Phase 6 needs a practical way to keep draft or reviewing `public-demo` content out of anonymous API, CLI, MCP, search, and export results until a maintainer intentionally releases it.

### Options Considered

- make every `public-demo` asset anonymously readable immediately
- create a new content version whenever an asset is published
- treat publish as a metadata transition to `active` and `approved`

### Decision And Rationale

Publish an asset by setting `lifecycle_state` to `active` and `status` to `approved`, then reindex retrieval chunks and record an `asset.publish` audit event.

Anonymous public read/search/export requires all three conditions: `sensitivity = public-demo`, `lifecycle_state = active`, and `status = approved`.

This keeps content version history focused on content changes while making public release an explicit administrative control.

### Consequences

- Draft and reviewing `public-demo` assets are private until published.
- Publish does not create a new asset version.
- Authenticated admins can still read and export unpublished assets according to their scopes.
- The web UI has first-pass publish controls; multi-step review workflows are still pending.

### Follow-Ups / Review

Review when adding multi-step approvals, scheduled publishing, archive/unpublish workflows, and richer web review queues.

## 0018: Start Validation As A Deterministic Pre-Import Gate

### Context

The MVP needs repeatable validation for required metadata, stale review dates, internal links, allowed surfaces, and restricted export leakage before operators import or publish a corpus.

### Options Considered

- rely only on API create-time schema validation
- build validation as a server-only workflow
- build a shared deterministic validator with local CLI, API, SDK, and MCP surfaces

### Decision And Rationale

Implement validation in the shared validation package and expose it through local CLI, API, SDK, and MCP.

The CLI validates local files offline by default. The API path requires an authenticated writer/admin when auth is enabled because validation payloads can contain draft or sensitive content.

Validation errors fail the report. Stale reviews and consistency risks are warnings by default so operators can report aging content without blocking every import; CLI users can opt into strict warning failure with `--fail-on-warnings`.

### Consequences

- Import can be preceded by a deterministic validation gate.
- Missing required metadata and restricted public export leakage fail validation.
- Stale review dates are visible in a repeatable command.
- Richer validators for chunk orphaning, source link reachability, and full instruction/document link integrity remain future work.

### Follow-Ups / Review

Review before adding CI validation workflows, hosted ingestion pipelines, or configurable validation policies.

## 0019: Use Official GitHub Actions With Repo-Pinned pnpm

### Context

The project now has deterministic validation, Postgres-backed tests, and a synthetic corpus that should be checked automatically before changes merge.

### Options Considered

- defer CI until the full MVP is complete
- use a third-party pnpm setup action
- use official GitHub checkout/setup-node actions and invoke the repo-pinned pnpm through `npx`

### Decision And Rationale

Add `.github/workflows/ci.yml` using official checkout and Node setup actions, `Node.js 22`, `npx -y pnpm@11.7.0 install --frozen-lockfile`, typecheck, strict demo corpus validation, and the full test suite against a `pgvector/pgvector:pg17` service.

This keeps CI close to local development commands, avoids adding another action dependency for pnpm, and exercises the database-backed path instead of only running in-memory tests.

### Consequences

- Pull requests and pushes to `main` get a deterministic validation gate.
- The demo corpus must stay warning-free in CI unless the workflow policy is changed.
- CI depends on Docker service containers, so it is aimed at GitHub-hosted Linux runners rather than minimal non-Docker CI environments.
- Action major versions should be reviewed periodically as GitHub updates Node runtime requirements.

### Follow-Ups / Review

Review when adding linting, coverage, security scanning, Docker image publishing, or deployment workflows.

## 0020: Make API Key Rotation A Staged Admin Operation

### Context

The auth foundation supports one-time API key creation, key listing without raw secrets, and revocation. SMB operators need a safe key-rotation path that avoids downtime for deployed CLI, MCP, and integration clients.

### Options Considered

- document manual create-and-revoke only
- rotate by always revoking the old key immediately
- create a replacement key from the old key and make revocation explicit

### Decision And Rationale

Add an admin-only API key rotation operation that creates a replacement key from the old key's tenant, user, scopes, and expiry. Staged rotation is the default: the old key remains active until an admin explicitly revokes it. Operators can request same-operation revocation with `revokeOld` or CLI `--revoke-old`.

This matches how service secrets are usually deployed: create replacement, update consumers, verify, then revoke old. Immediate revocation remains available for suspected compromise.

### Consequences

- Rotation returns the replacement raw secret once, just like API key creation.
- API key list, audit, and telemetry surfaces still show only secret previews, never raw secrets.
- `auth.api_key.rotate` records the rotation event. `auth.api_key.revoke` records manual revocation.
- Rotation of an already revoked key returns not found to avoid reviving disabled credentials.

### Follow-Ups / Review

Review when adding OAuth/OIDC client credentials, service-account policy controls, web key-management UI, or hosted secret-manager adapters.

## 0021: Local Password Login Issues Short-Lived API Keys

### Context

The project needs local users first, with pluggable auth and OIDC/Entra later. API keys already enforce scopes and permissions across API, CLI, MCP, and web surfaces, but users still need a password-backed local login path.

### Options Considered

- keep API keys as the only local authentication path
- add a separate session table and cookie/session token model now
- verify local passwords and issue short-lived scoped API keys

### Decision And Rationale

Add optional password hashes to local users and expose `/auth/login`. A successful login creates a short-lived API key for the user. Scopes are derived from role: admins receive admin/write/read/permission scopes, maintainers receive read/write scopes, and readers receive read scope.

This avoids adding a second authorization mechanism before the permission model stabilizes. It also lets CLI and future web login flows reuse the same bearer-key enforcement path.

### Consequences

- Password hashes are stored server-side and never returned through user records.
- Login returns the raw session-like API key once.
- Login-created keys default to a 12-hour expiry.
- The web UI can use the same login endpoint without changing API authorization semantics.

### Follow-Ups / Review

Review when adding password reset, account lockout, MFA, cookie sessions, CSRF protection, richer web auth/key-management UI, service-account policy controls, or OIDC/Entra.

## 0022: Start Managed Agent Layer With Deterministic Query

### Context

The product direction requires an admin-controlled agent query layer, but full model orchestration, provider routing, caching, evals, feedback, and action execution should not precede the permissioned registry and retrieval foundation.

### Options Considered

- wait until provider adapters and evals are ready
- call a model directly from the first managed endpoint
- add a deterministic managed query path over existing permission-filtered retrieval

### Decision And Rationale

Add `/agent/query` plus SDK, CLI, and MCP surfaces that run the existing permission-filtered retrieval path and return a deterministic answer draft, citations, grounding checks, warnings, and telemetry.

This gives agent harnesses a stable managed-query contract now while avoiding premature provider coupling. It also proves that the managed layer does not bypass permission filtering.

### Consequences

- The current response is an answer draft assembled from governed snippets, not a model-generated final answer.
- Citation and denied-result accounting are explicit in the response.
- Retrieval telemetry records `queryKind: managed-query`.
- Provider adapters, routing, response caching, eval checks, and feedback have since been layered behind the same contract; action execution remains future work.

### Follow-Ups / Review

Review when adding provider-backed answers, cache invalidation, eval scoring, feedback collection, action tools, or admin routing policies.

## 0023: Record Managed Query Feedback Before Provider Orchestration

### Context

The product optimizes for factual citation accuracy, policy compliance, task completion quality, consistency, and outcome acceptance. The managed query route now returns deterministic citation-backed answer drafts, but there is no durable way to capture whether the result was accepted or where quality failed.

### Options Considered

- wait for provider-backed orchestration and full eval jobs
- store unstructured feedback only in retrieval telemetry metadata
- add a dedicated managed-query feedback record tied to retrieval telemetry

### Decision And Rationale

Add managed-query feedback as a first-class record with outcome acceptance and optional 1-5 scores for factual citation accuracy, policy compliance, task completion quality, consistency, and response effectiveness.

Feedback records are tied to a `telemetryEventId`, listed through an admin-only route, submitted through API/SDK/CLI/MCP surfaces, and audited when auth is enabled. Persisted feedback query and notes text are redacted for common direct identifiers before storage.

This creates the data foundation for eval dashboards and routing optimization without coupling the product to a provider, cache, or scoring engine too early.

### Consequences

- The current feedback layer is deterministic collection and reporting, not automated evaluation.
- Operators can inspect outcome acceptance before model orchestration exists.
- Redaction reduces risk from pasted prompts or notes, but it is not a complete PII classifier.
- Backup/restore verification includes feedback counts.

### Follow-Ups / Review

Review when adding automated eval jobs, admin quality dashboards, provider-backed answer generation, cache policy, configurable PII detection, or action execution feedback.

## 0024: Start Evals With Deterministic Managed Query Cases

### Context

The product needs evals for factual citation accuracy, policy compliance, task completion quality, consistency, and outcome acceptance. The current managed query layer is deterministic and provider-free, so the first eval step should test the properties that are already observable.

### Options Considered

- wait for provider-backed generation and LLM judges
- store eval cases only as future `eval-case` assets
- add a deterministic eval runner over managed query retrieval results

### Decision And Rationale

Add `/agent/evals/run` plus SDK, CLI, MCP, and demo corpus support for deterministic eval cases. Each case declares a query, expected stable IDs, expected groundedness, and required citation count. The runner reuses permission-filtered retrieval and records retrieval telemetry with `queryKind: managed-query-eval`.

This proves the eval harness shape early while keeping automated model judging and provider-specific scoring out of the MVP core.

### Consequences

- Eval cases currently check source coverage and citation presence, not semantic answer quality.
- Admin authentication is required when auth is enabled.
- Demo eval cases live in `corpus/demo/evals.json` and can run against the local demo corpus.
- More advanced policy-compliance and task-completion scoring can layer on top of the same eval contract later.

### Follow-Ups / Review

Review when adding eval-case asset publishing, scheduled eval jobs, LLM-as-judge scoring, quality dashboards, provider-backed answers, or regression thresholds in CI.

## 0025: Store Provider Routing Metadata Without Provider Secrets

### Context

The target product needs OpenAI, Anthropic, and OpenRouter-style routing, but full orchestration is intentionally not part of the first core MVP. Admins still need a stable place to configure which provider adapters are enabled and what models should be used later.

### Options Considered

- defer all provider configuration until provider calls exist
- store provider API keys directly in the application database
- store provider metadata and env var names only

### Decision And Rationale

Add admin-managed model provider configuration stubs through API, SDK, CLI, MCP, and Postgres. Records capture provider, enablement, display name, base URL, secret env var name, default model, available models, priority, and non-secret metadata.

Provider API keys are not stored in the database. Operators should keep secrets in deployment environment or a future secret manager and reference only env var names such as `OPENAI_API_KEY`.

### Consequences

- The product can expose routing controls before making provider calls.
- Admin API rejects metadata keys that look like secrets, tokens, passwords, or API keys.
- Backup/restore includes provider config records, but not provider secrets.
- Actual provider adapters, model-call execution, fallback policy, and secret-manager integration remain future work.

### Follow-Ups / Review

Review when adding provider adapter execution, hosted secret storage, provider health checks, model fallback routing, cost telemetry, or per-tenant provider credentials.

## 0026: Keep Agent-Layer Web Controls Operational

### Context

The human web UI is intentionally secondary, but admins still need to inspect and operate the managed-query feedback, eval, and provider-config foundations without leaving the self-hosted app.

### Options Considered

- keep these controls API/CLI/MCP-only until a richer admin console exists
- build a separate analytics/admin dashboard now
- extend the existing Operations panel with compact controls and readouts

### Decision And Rationale

Extend the existing operational web UI, not a separate dashboard. The Operations panel can load retrieval telemetry, audit events, managed-query feedback, deterministic demo eval results, and provider config stubs.

This keeps web support aligned with the product direction: humans can inspect, debug, and operate the system, while API/CLI/MCP remain the primary agent-native surfaces.

### Consequences

- The UI remains operational rather than analytics-heavy.
- Feedback, eval, and provider config web controls reuse the same admin APIs as CLI and MCP.
- Richer charts, scheduled eval history, and advanced provider routing UX remain future work.

### Follow-Ups / Review

Review when adding scheduled eval dashboards, provider routing policy editors, web user/key management, or hosted analytics.

## 0027: Make Local Groups The First Shared Authorization Primitive

### Context

The production goal requires users, groups, roles, and API keys. The database schema and permission checks already supported group principals, but admins could not create groups or assign members through supported product surfaces.

### Options Considered

- defer groups until OIDC/Entra group sync exists
- model only role-based access for MVP
- add local groups and memberships now, then map external groups onto the same principal model later

### Decision And Rationale

Implement local groups as the first shared authorization primitive. Admins can create groups, add users to groups, and grant document-level access to group principals through API, SDK, CLI, MCP, and the operational web UI.

This closes the SMB self-hosting gap without forcing enterprise identity integration into the MVP. It also gives future OIDC/Entra sync a stable target: external directory groups can map onto the existing group principal model rather than requiring a new permission path.

### Consequences

- Group membership is now part of API-key authentication context through `groupIds`.
- User and group grants use the same permission table and retrieval filtering path.
- Group creation and membership addition are audited.
- Group member removal and group deletion are handled by a later identity-operations decision.
- Role assignment policy, SCIM/OIDC/Entra sync, and richer web user/key/group administration remain future work.

### Follow-Ups / Review

Review when extending service-account policy controls, role-policy customization, OIDC/Entra group sync, SCIM, or hosted enterprise administration.

## 0028: Make Admin Identity Operations First-Class Across Surfaces

### Context

The SMB production outcome requires admins to operate local users, roles, groups, and API keys. The project already supported user creation and key lifecycle through API/CLI pieces, but user listing, MCP identity operations, and web key lifecycle controls were incomplete.

### Options Considered

- keep identity operations primarily CLI/API-only until a dedicated admin console exists
- build a separate full user-management product area now
- extend the shared auth repository and existing operational surfaces with compact admin identity controls

### Decision And Rationale

Expose local user listing and identity operations across API, SDK, CLI, MCP, and the operational web UI. The web Operations panel can create/list users, create/list groups, add/list group members, and list/create/rotate/revoke API keys.

This makes the self-hosted core operable for SMB admins without creating a separate administrative application. Raw API-key secrets are still returned only once on create or rotate; list responses and web readouts show previews and metadata only.

### Consequences

- API, CLI, MCP, and web now share one admin identity lifecycle path.
- MCP admin tools can create or rotate API keys and therefore return one-time raw secrets when called with an admin API key.
- User list responses exclude password hashes.
- Group removal is handled by a later identity-operations decision; SCIM, OIDC/Entra, MFA, service-account policy controls, richer password reset policy, and richer admin UX remain future work.

### Follow-Ups / Review

Review before adding hosted tenant administration, SCIM, OIDC/Entra group sync, MFA, service-account policy controls, or a dedicated admin console.

## 0029: Treat Local User Update And Disable As Core SMB Operations

### Context

Local users are the first authentication path for self-hosted SMB installs. Admins could create and list users, but they could not update display names, roles, status, or reset a local password through supported product surfaces.

### Options Considered

- defer user updates until OIDC/Entra or a dedicated admin console exists
- add only password reset and leave role/status changes for direct database operations
- expose a compact local user update path through the same API, SDK, CLI, MCP, and web operations surfaces as user creation

### Decision And Rationale

Expose local user update as a first-class admin operation across API, SDK, CLI, MCP, and the operational web UI. The update path supports display name, role, status, and optional password reset while keeping email immutable for this lane.

This closes a practical self-hosting gap without overbuilding external identity management. Disabled users immediately fail password login and API-key authentication because the existing auth boundary already requires active users.

### Consequences

- Local admins can disable accounts without directly editing the database.
- Existing API keys stop authenticating when the owning user is disabled.
- User update audit events record changed field names but never raw password values.
- Email changes, account deletion, SCIM, OIDC/Entra sync, MFA, service-account policy controls, and richer password reset policy remain future work.

### Follow-Ups / Review

Review before adding destructive account deletion, user email changes, SCIM/OIDC/Entra identity sync, MFA, service-account policy controls, or a dedicated admin console.

## 0030: Treat Group Removal As A Core Local Authorization Operation

### Context

Local groups are the first shared authorization primitive. Admins could create groups and add members, but they also need supported removal paths to revoke group-based access without direct database edits.

### Options Considered

- defer group removal until OIDC/Entra group sync
- support removal through direct database operations only
- expose group member removal and group deletion across the existing admin identity surfaces

### Decision And Rationale

Expose group member removal and group deletion across API, SDK, CLI, MCP, and the operational web UI. Deleting a local group removes its memberships and group-based permission grants.

This keeps local SMB administration reversible while preserving the existing authorization model: permission-aware retrieval already evaluates the authenticated principal's current `groupIds`, so removing membership or deleting the group immediately removes group-granted access after re-authentication.

### Consequences

- Local admins can revoke group-based access without direct SQL.
- Permission filtering continues to use the same user/group/service-account grant table and principal lookup path.
- Group member removal and group deletion are audited.
- Local group deletion is a hard delete; hosted enterprise administration, SCIM, OIDC/Entra sync, service-account policy controls, and richer group policy remain future work.

### Follow-Ups / Review

Review before adding external directory sync, soft-delete/recovery for hosted tenants, service-account policy controls, richer group policy controls, or SCIM/OIDC/Entra group lifecycle management.

## 0031: Treat Service Accounts As First-Class Non-Human Principals

### Context

The agent-first product direction needs integrations, MCP clients, automation, and future managed harnesses to authenticate without pretending to be a human user. Local users and groups already support SMB administration, but service-owned API keys and service-specific restricted asset grants were still missing.

### Options Considered

- model service accounts as local users with special email addresses
- keep service accounts out of MVP and require all integrations to use human-owned API keys
- add first-class service-account principals alongside users and groups

### Decision And Rationale

Add service accounts as tenant-local non-human principals. API keys are now owned by exactly one user or service account, authenticated principals include `principalType`, `principalId`, `userId`, and `serviceAccountId`, and document-level grants can target `service-account` principals directly.

This preserves a single bearer-key enforcement path across API, CLI, MCP, and web while avoiding fake users, unclear audit attribution, and group-membership semantics that do not fit automation clients. Full orchestration remains future work, but the identity boundary now supports agent-native clients.

### Consequences

- Service accounts can be created, listed, updated, and disabled through API, SDK, CLI, MCP, and web operations controls.
- Service-owned API keys authenticate as `service-account` principals and stop working when the owning service account is disabled.
- Service-account activity can be recorded separately through `actor_service_account_id` in audit, retrieval, and feedback records.
- Service accounts do not inherit group memberships; restricted access uses direct service-account grants or admin role.
- Future OIDC client credentials, SCIM, hosted tenant administration, and richer service-account policy controls can build on the same principal model.

### Follow-Ups / Review

Review before adding OIDC client credentials, SCIM-managed application identities, service-account deletion/recovery, per-service key quotas, secret-manager-backed key storage, or full managed orchestration execution.

## 0032: Start Telemetry Analytics As A Recent-Window Operational Summary

### Context

The product needs admins to observe query, retrieval, export, feedback, and administrative activity before provider-backed orchestration exists. The system already records retrieval events, audit events, managed-query feedback, and governed asset state, but only raw lists were exposed.

### Options Considered

- defer analytics until a dedicated warehouse or dashboard exists
- add aggregate SQL tables and scheduled rollups now
- compose a recent-window summary from existing repository list methods

### Decision And Rationale

Add an admin-only `/telemetry/summary` route that composes recent retrieval events, audit events, managed-query feedback records, and current governed asset state into a schema-validated operational summary. Expose the same summary through SDK, CLI, MCP, and the web Operations panel.

This gives self-hosted SMB admins immediate visibility into retrieval volume, denied results, redaction application, audit outcomes, feedback quality scores, and asset distribution without introducing a second analytics persistence path before the product needs it.

### Consequences

- The first summary is bounded by the repository list limit and defaults to 200 records per stream.
- It is useful for recent operational inspection, not long-range trend analysis or billing-grade reporting.
- API, CLI, MCP, and web share the same summary contract.
- Advanced analytics, retention controls, scheduled rollups, dashboards, and hosted telemetry policy remain future work.

### Follow-Ups / Review

Review when adding configurable telemetry retention, hosted analytics, cost reporting, scheduled eval history, provider routing optimization, or high-volume deployments that outgrow recent-window summaries.

## 0033: Add Configurable Telemetry Retention With Dry-Run Purge

### Context

ForgetBase stores operational retrieval telemetry, audit events, and managed-query feedback. These records are useful for quality, compliance, and debugging, but they can contain redacted user queries, actor attribution, feedback notes, and other operational metadata. SMB operators need a practical retention control before the hosted analytics layer exists.

### Options Considered

- keep retention as a runbook-only database maintenance task
- add fixed hard-coded retention defaults with no admin override
- add tenant retention policy records and admin purge controls across the existing API, SDK, CLI, MCP, and web surfaces

### Decision And Rationale

Add tenant-scoped telemetry retention policy records with defaults of 30 days for retrieval events, 365 days for audit events, and 90 days for managed-query feedback. Admins can read/update retention and preview or execute purge operations through API, SDK, CLI, MCP, and the operational web UI. A `null` retention value means retain that stream indefinitely.

Purge defaults to dry-run so operators can review the deletion counts before executing. Retention updates and purge requests are audited.

This gives self-hosted SMB operators a clear privacy and storage control without introducing a separate analytics warehouse, job scheduler, or hosted policy engine before the product needs it.

### Consequences

- Retention is per tenant and per telemetry stream rather than a single global switch.
- Audit retention defaults longer than retrieval and feedback because audit history is more important for security investigations.
- Dry-run purge reduces accidental deletion risk but does not replace database backups or formal legal-hold workflows.
- The purge path is manually triggered for now; scheduled purge jobs, export/delete requests, legal hold, and hosted retention policy remain future work.

### Follow-Ups / Review

Review when adding scheduled jobs, hosted analytics, legal hold, tenant data export/delete workflows, provider prompt/response telemetry, or compliance-ready retention reporting.

## 0034: Run Scheduled Retention In The Worker As Opt-In Maintenance

### Context

Manual telemetry retention controls are now available across admin surfaces, but production operators should not need to remember to run purge commands forever. The project already has a worker process for background jobs, and scheduled retention should reuse the same tenant retention policy as manual purge.

### Options Considered

- keep retention purge manual only
- run retention purge inside the API process
- add a separate scheduler service now
- run retention purge in the worker with explicit opt-in scheduling

### Decision And Rationale

Run scheduled telemetry retention maintenance in the worker. The worker can execute a one-off `--retention-once` command or schedule maintenance in the long-running process when `FORGETBASE_RETENTION_PURGE_ENABLED=true`.

Automated maintenance remains dry-run by default through `FORGETBASE_RETENTION_PURGE_DRY_RUN=true`. Operators must explicitly disable dry-run or pass `--execute` for deletion.

This keeps background work out of the API request path, avoids adding a new scheduler dependency before the MVP needs one, and preserves the same retention policy and purge implementation used by API, CLI, MCP, and web controls.

### Consequences

- Self-hosted deployments get an automated path without adopting Redis, cron containers, or an external scheduler.
- The default Compose service exposes the env knobs but does not schedule destructive retention.
- Worker logs report aggregate counts only, not raw telemetry payloads.
- This is suitable for SMB scale; high-volume hosted deployments may still need durable job state, locks, retries, and scheduled job observability.

### Follow-Ups / Review

Review when adding hosted operations, multi-worker deployments, distributed job locking, legal hold, export/delete workflows, or compliance reporting.

## 0035: Add External Auth Provider Config Before OIDC Login Flow

### Context

The product direction is local users first, pluggable auth second, then Microsoft Entra ID/OIDC. Local users, groups, service accounts, and API keys are now operable across API, CLI, MCP, and web. The next enterprise-readiness step is to define where external identity provider configuration lives without prematurely building the full browser redirect, token exchange, account linking, and group sync flow.

### Options Considered

- defer all OIDC/Entra work until implementing the full login flow
- add OIDC login directly in the API before configuration and admin operations are stable
- add admin-managed external auth provider config records first

### Decision And Rationale

Add tenant-scoped external auth provider configuration records for generic OIDC and Microsoft Entra ID. Records store issuer URL, client ID, client secret env var name, redirect URI, scopes, claim mappings, allowed domains, default role, auto-provisioning intent, group sync intent, PKCE requirement, priority, and non-secret metadata.

Expose the config through API, SDK, CLI, MCP, and the operational web UI. Reject secret-like metadata keys and do not store client secret values.

This creates a stable pluggable-auth boundary while preserving the current local-user and bearer-key enforcement path. It lets operators and future hosted deployments prepare provider metadata without introducing a half-finished security-critical login path.

### Consequences

- OIDC/Entra configuration is now backup/restore covered and auditable.
- Later decisions added authorization-code flow, token validation, account linking, group sync execution, current-key logout, an HttpOnly session-cookie foundation, signed CSRF protection for cookie-authenticated unsafe browser requests, login-session inventory, idle timeout, and one-time refresh-token rotation. MFA policy remains future work.
- Client secrets are referenced by env var name only; self-hosted deployments must provide the value through environment variables or a future secret-manager adapter.
- Existing user/group/service-account permission checks remain unchanged.

### Follow-Ups / Review

Review when adding Entra tenant validation, JWKS caching, SCIM, richer group lifecycle policy, account-linking changes, refresh-token lifecycle, hosted secret storage, or stronger browser session isolation.

## 0036: Implement First OIDC Login Slice Through Signed State And API-Key Issuance

### Context

External auth provider configuration exists for generic OIDC and Microsoft Entra ID, but until now it only stored metadata. The product direction calls for local users first, then pluggable auth, with API keys remaining the common enforcement layer for API, CLI, MCP, and web surfaces.

### Options Considered

- keep OIDC as configuration only until a full session-cookie web auth system exists
- add server-side OIDC sessions and callback state storage immediately
- add a first authorization-code login slice that uses signed stateless state, PKCE, ID-token validation, and existing API-key issuance

### Decision And Rationale

Implement a first OIDC login slice over the existing provider config and user/API-key model. The API generates an authorization URL with signed state, nonce, and PKCE verifier. The callback verifies the signed state, nonce, PKCE verifier, issuer, audience, and ID-token signature through `jose` remote JWKS validation before issuing a short-lived scoped API key.

The signed state uses `FORGETBASE_OIDC_STATE_SECRET`; provider client secrets are still read only from configured environment variables and are not stored in database config records. Users are found by tenant/email. Unknown users require `autoProvisionUsers`; disabled users are denied. The first slice supports web, API, CLI, SDK, and MCP entry points while keeping bearer API keys as the runtime authorization mechanism.

### Consequences

- Self-hosted operators can use OIDC/Entra login without adopting a hosted auth service.
- The implementation avoids storing raw client secrets, ID tokens, state, nonce, or PKCE verifier in the database.
- Existing permission checks, API-key revocation, telemetry, and audit paths remain the enforcement layer.
- Exact issuer validation works best with tenant-specific Entra issuer URLs rather than `/common`.

### Follow-Ups / Review

Review when adding external group sync, stricter account-linking policy, session cookies, refresh tokens, hosted secret storage, SCIM, multi-tenant Entra issuer handling, or MFA policy reporting.

## 0037: Bind OIDC Accounts By Issuer/Subject And Sync Group Claims Into Local Grants

### Context

The first OIDC login slice resolved users by tenant/email. That was enough to prove signed state, PKCE, token validation, and API-key issuance, but it left two enterprise-readiness gaps: stable external identity binding and usable directory group authorization. The existing local group principal model already enforces document-level grants across API, CLI, MCP, web, search, managed query, and export paths.

### Options Considered

- keep OIDC lookup by email only until SCIM is implemented
- replace local groups with an external-directory-only authorization model
- bind OIDC users by provider, issuer, and subject, then sync configured group claims into the existing group model

### Decision And Rationale

Store optional external provider, issuer, and subject bindings on users. OIDC callback lookup now resolves by external identity first. If no binding exists, an existing email user can be linked according to an admin-configured `accountLinkingMode`: `disabled`, `verified-email`, or `email`. The default is `verified-email`, which requires the ID token `email_verified` claim before linking an existing user.

Store optional external provider/id bindings on groups and source metadata on memberships. When `groupSyncEnabled` and `groupClaim` are configured, OIDC login reads string or string-array group claims, creates or updates external groups, adds external memberships, and removes stale external memberships for the same user/provider. Manual local memberships are preserved. Group sync runs before the login API key is issued so authenticated principals immediately include synced group IDs.

This keeps the product on the existing API-key and permission-grant enforcement path while making OIDC/Entra useful for SMB teams before full SCIM or hosted identity operations exist.

### Consequences

- External identity is stable across email changes at the provider, provided issuer and subject remain stable.
- The default account-linking policy avoids trusting unverified email claims.
- External group sync is login-time and claim-based; it does not yet cover off-cycle deprovisioning, SCIM push, nested group expansion, group display-name lookup, or admin mapping rules.
- Existing local groups and manual memberships remain usable and are not overwritten by OIDC sync.
- Hosted deployments still need stronger identity operations around tenant-specific Entra issuer validation, session-cookie/refresh-token lifecycle, MFA reporting, and deprovisioning windows.

### Follow-Ups / Review

Review when adding SCIM, Entra Graph group metadata, nested group handling, external group mapping rules, off-cycle deprovisioning, session cookies, refresh tokens, hosted secret storage, or MFA policy reporting.

## 0038: Add Provider-Routed Managed Query With Deterministic Fallback

### Context

The project goal calls for an admin-controlled agent query layer that can eventually optimize model choice, answer quality, caching, evals, and action execution. The core already has permission-filtered retrieval, deterministic managed query responses, feedback, eval scaffolding, and admin-managed provider configuration that stores only env var names for secrets. The next valuable increment is to prove controlled provider execution without introducing the full orchestration layer.

### Options Considered

- keep provider config as stubs until full orchestration, caching, and eval automation are designed
- replace deterministic managed query with direct model calls
- add a provider-routed mode to the existing managed-query contract, with deterministic retrieval as fallback

### Decision And Rationale

Add `provider-routed` mode to `/agent/query` while preserving `deterministic-retrieval` as the default. Provider-routed mode runs the same permission-filtered retrieval path first, then selects an enabled provider config by explicit provider or priority. It reads the provider secret from the configured environment variable, sends only permitted retrieval context to the model provider, returns generation metadata, and falls back to the deterministic answer when provider config, env vars, permitted context, or provider execution are unavailable.

The first runtime uses direct adapters for OpenAI Responses, Anthropic Messages, and OpenRouter-style chat completions. CLI, MCP, SDK, OpenAPI, and the operational web UI all use the same managed-query contract. When auth is configured, provider-routed mode requires an authenticated principal and audits generation attempts with provider/model/status/latency/result-count metadata. Raw prompts, raw model responses, and provider secrets are not stored in retrieval telemetry or audit events.

This keeps provider execution behind the governed retrieval and audit layer instead of letting client harnesses call models with unfiltered context. It also gives open-core users a useful end-to-end model path while keeping full orchestration, semantic caching, LLM-as-judge automation, and action execution as explicit later work.

### Consequences

- Provider-backed answers now exist for the managed-query path, but deterministic fallback remains the reliability baseline.
- Operators must configure provider env vars in the deployment environment; provider config records still do not contain raw secrets.
- The first routing policy is intentionally simple: explicit provider override or enabled-provider priority.
- Generation audit metadata supports quality and operations review without storing prompt/response transcripts.
- Provider usage metadata and cost estimates are handled by decision `0039`, readiness/quota controls by decision `0040`, provider fallback by decision `0041`, and response caching by decision `0042`.

### Follow-Ups / Review

Review when adding retries, semantic caching, policy-driven model fallback, per-provider quotas, configurable prompt templates, LLM-as-judge evals, action execution, hosted secret storage, or provider data-retention policy controls.

## 0039: Track Provider Generation Usage Without Storing Provider Transcripts

### Context

Provider-routed managed query now calls OpenAI, Anthropic, or OpenRouter-style providers behind the permission-filtered retrieval layer. Admins need visibility into generation outcomes, token usage, and rough cost impact, but the security model should still avoid storing raw prompts, raw model responses, or provider secrets.

### Options Considered

- add a dedicated provider-generation telemetry table immediately
- store full prompt/response transcripts for later analytics and evals
- extend the existing generation response and audit metadata with normalized usage fields, then aggregate those fields in `/telemetry/summary`

### Decision And Rationale

Add a normalized `usage` object to managed-query generation metadata: input tokens, output tokens, total tokens, and optional estimated USD cost. Provider adapters extract token counts from provider responses when available. Admins can configure non-secret model cost hints through provider metadata (`inputCostPerMillionTokens` and `outputCostPerMillionTokens`) so the API can estimate cost without storing billing credentials or provider secrets.

Store usage metadata on the existing `agent.query.generate` audit event and aggregate provider generation counts, status/provider/model breakdowns, token totals, estimated cost, and latency in `/telemetry/summary`. Expose the fields through API schema, SDK types, CLI JSON output, MCP JSON output, and compact web summary/readout fields.

This gives SMB admins immediate operational visibility while keeping the first provider path simple and aligned with the current retention model. Audit retention already governs generation metadata. Raw prompts and raw model outputs remain out of persisted telemetry.

### Consequences

- Usage observability is available without adding a new database table or retention stream.
- Cost is an estimate, not authoritative billing; it depends on admin-provided per-million-token rates or runtime-provided estimates.
- Providers that omit usage data return null usage fields rather than failing the query.
- Detailed provider health checks, retries, quotas, budgets, and billing reconciliation remain future work.

### Follow-Ups / Review

Review when adding semantic caching, budget enforcement, per-provider quotas, billing reconciliation, hosted secret storage, prompt/response retention controls, or LLM-as-judge eval automation.

## 0040: Add Provider Readiness And Preflight Quota Guardrails Before Full Orchestration

### Context

Provider-routed managed query has a working first execution path and usage telemetry, but admins still need a way to see whether configured providers are usable and to prevent oversized or obviously too-expensive requests before they leave the system. Full orchestration, semantic caching, retries, budgets, and model-quality routing remain larger Phase 7 work.

### Options Considered

- wait for the full orchestration layer before adding health and quota controls
- add a separate provider-generation table and budget engine immediately
- add additive readiness and preflight controls on the existing provider config and audit paths

### Decision And Rationale

Add `/admin/model-providers/health` through API, SDK, CLI, MCP, and web. It reports each built-in provider as ready, disabled, not configured, or not ready, including configured model, env var name, env var presence, and readiness reasons without exposing secret values.

Add optional provider metadata caps for `maxEstimatedInputTokensPerQuery`, `maxEstimatedTotalTokensPerQuery`, and `maxEstimatedCostUsdPerQuery`. Provider-routed managed query estimates prompt tokens deterministically, combines that with configured max output tokens and optional cost rates, and skips external provider execution with deterministic fallback when a cap is exceeded. The generation audit metadata records the preflight estimate and skip reason, but still does not store raw prompts or model responses.

This gives SMB operators useful safety controls now without introducing a premature orchestration or billing subsystem.

### Consequences

- Provider readiness is visible across admin surfaces without leaking provider API keys.
- Quota caps are conservative preflight estimates, not provider billing truth.
- Cost caps only work when admins configure cost-rate metadata.
- The first quota controls are per provider config and per query; they are not tenant budgets, user budgets, retries, or fallback chains.
- Audit retention governs preflight estimate metadata because it lives on `agent.query.generate` events.

### Follow-Ups / Review

Review when adding provider retries, semantic caching, tenant/user budgets, billing reconciliation, hosted secret storage, prompt/response retention controls, LLM-as-judge eval automation, or full orchestration policy.

## 0041: Add Priority Provider Fallback Without Full Routing Policy

### Context

Provider-routed managed query can call configured providers and enforce readiness/quota preflight, but a single missing env var or provider runtime failure still caused deterministic fallback even when another enabled provider was configured. The larger managed orchestration layer is still future work, but SMB operators need basic resilience now.

### Options Considered

- keep one-provider selection until the full orchestration layer exists
- make every provider request fall back automatically, including explicitly pinned providers
- add priority fallback only when the request does not pin a provider

### Decision And Rationale

When `/agent/query` runs in `provider-routed` mode without a requested provider, try enabled provider configs by ascending priority until one completes. Each candidate still uses the same permission-filtered context, env-var secret lookup, readiness checks, quota preflight, provider adapter, and deterministic fallback posture. Safe attempt metadata records provider, model, status, reason, and latency in the response and audit event; it does not store prompts, model responses, API keys, or provider request bodies.

When a request explicitly specifies `provider`, keep routing strict to that provider. A pinned provider is treated as caller intent, useful for debugging, controlled evals, or provider-specific verification. If it fails or is skipped, the deterministic answer remains the fallback.

This improves resilience without prematurely introducing routing policy DSLs, model quality scoring, caching, retries, or budget allocation.

### Consequences

- Self-hosted teams can configure primary and fallback providers with existing priority fields.
- Provider attempts are visible enough for operations review without exposing sensitive request/response material.
- Explicit provider requests remain predictable and testable.
- Fallback still happens within a single request and does not retry the same provider.
- Provider routing remains simple; it does not yet account for cost budgets, model quality, latency targets, per-user policy, cache hits, or LLM-as-judge outcomes.

### Follow-Ups / Review

Review when adding retries, semantic caching, policy-driven routing, tenant/user budgets, model quality scoring, LLM-as-judge eval automation, hosted secret storage, or action execution.

## 0042: Add Permission-Scoped Managed Query Response Caching

### Context

Provider-routed managed query now supports direct provider execution, usage telemetry, preflight quota checks, and priority fallback. The product goal also calls for an admin-controlled query layer that can reduce repeated provider calls and improve response consistency. Full orchestration, semantic cache policy, eval-driven routing, and tenant budget management remain future work.

### Options Considered

- wait for the full orchestration layer before caching
- cache raw prompts and full provider responses for maximum replay/debug value
- cache generated answer text with normalized generation metadata under a permission-scoped hash key

### Decision And Rationale

Add a persistent `managed_query_cache` table and cache provider-routed generated answers only after the request has performed fresh retrieval and permission filtering. The cache key is a SHA-256 hash over tenant, principal, provider/model, surface, limit, normalized query hash, and the fresh allowed-context signature. Cache entries store the answer text, normalized generation metadata, safe hashes, TTL, and hit counts; they do not store raw query text, prompts, provider request bodies, provider API keys, or audit-only metadata.

Caching is enabled when the repository exists, the request does not opt out, the provider config does not set `cacheEnabled: false`, and the query does not trigger direct-identifier redaction. `cacheTtlSeconds` defaults to one hour and can be set in provider config metadata. Cache status is returned in `/agent/query`, recorded on the safe `agent.query.generate` audit metadata, and aggregated in `/telemetry/summary`.

This gives self-hosted SMB teams practical cost and consistency benefits while keeping the key invalidation rule simple: every request must re-run permission-filtered retrieval first, and changed content or changed access produces a different context/principal hash.

### Consequences

- Cache hits avoid repeated provider calls for identical permissioned context.
- Generated answer text is now persisted briefly when caching is enabled; audit and retrieval telemetry still do not store it.
- Direct-identifier queries bypass caching to reduce accidental PII persistence.
- Cache invalidation is hash/TTL based, not a separate invalidation queue.
- Provider-routed deterministic fallback responses are not cached.
- This is not yet semantic caching, quality-based routing, tenant budgeting, or provider replay/debug logging.

### Follow-Ups / Review

Review when adding semantic caching, prompt/response retention policy, cache purge/admin inspection, tenant/user budgets, eval-driven cache acceptance, action execution, hosted analytics, or legal-hold/data-export controls.

## 0043: Add Safe Managed Query Cache Lifecycle Controls

### Context

Decision `0042` introduced a short-lived managed-query response cache that can persist generated answer text. Cache reads ignore expired entries, but production operators still need a way to inspect cache metadata and remove expired rows without exposing cached answer content in broad admin views.

### Options Considered

- leave expired rows for a later worker cleanup job
- expose full cached answers in the admin cache list
- expose safe cache metadata and add dry-run expired-row purge

### Decision And Rationale

Add admin-only cache list and purge controls across API, SDK, CLI, MCP, and the operational web UI. Cache listing returns cache key, query/principal/context hashes, provider/model, generation metadata, metadata, expiry, hit count, and timestamps; it does not return cached answer text. Purge deletes only rows whose `expires_at` is at or before the selected cutoff and defaults to dry-run. Purge actions write audit events with dry-run flag, cutoff, and deleted count only.

This closes the first lifecycle gap for the cache without creating a prompt/response review UI or broader retention policy subsystem before the product has clearer operator requirements.

### Consequences

- Operators can verify cache activity and remove expired rows.
- Cached answer bodies remain out of broad list/readout surfaces.
- Purge is TTL-based and explicit; scheduled cleanup is handled by the worker decision below.
- This does not yet support per-entry deletion, answer inspection, legal hold, or cache analytics beyond recent-window telemetry.

### Follow-Ups / Review

Review when adding per-entry deletion, cache answer inspection, prompt/response retention policy, legal hold, tenant data export/delete, hosted analytics, or semantic cache policy.

## 0044: Schedule Managed Query Cache Cleanup In Worker

### Context

Decision `0042` added short-lived provider response caching, and decision `0043` added safe manual cache metadata and expired-row purge controls. Manual controls are useful for inspection, but production operators should not need to remember to remove expired generated-answer rows indefinitely.

### Options Considered

- leave expired cache rows for manual admin purge only
- run cache cleanup inside the API process
- run cache cleanup in the worker with explicit opt-in scheduling
- add a queue or scheduler dependency now

### Decision And Rationale

Run scheduled expired managed-query cache cleanup in the worker. The worker can execute a one-off `--cache-purge-once` command or schedule maintenance in the long-running process when `FORGETBASE_CACHE_PURGE_ENABLED=true`. Cleanup is dry-run by default for both one-off and scheduled operation; operators must explicitly pass `--execute` or set `FORGETBASE_CACHE_PURGE_DRY_RUN=false` after reviewing counts.

This keeps destructive cleanup out of the API request path, reuses the existing worker deployment, avoids a scheduler dependency before the MVP needs one, and preserves the existing cache safety rule: broad surfaces expose only tenant IDs and counts, not cached answer bodies.

### Consequences

- Expired generated-answer cache rows can be cleaned up automatically after operators validate dry-run counts.
- Docker Compose exposes cache cleanup env knobs but keeps scheduling disabled and dry-run by default.
- The cleanup job is TTL-based and tenant-count oriented; it is not legal hold, per-entry deletion, cache review, semantic cache management, or prompt/response retention policy.
- Multi-worker deployments may run duplicate cleanup attempts until distributed job locking is introduced; the operation is idempotent because it only deletes already-expired rows.

### Follow-Ups / Review

Review when adding hosted operations, multi-worker job locking, legal hold, tenant data export/delete, prompt/response retention policy, cache analytics, or semantic cache policy.

## 0045: Treat Logout As Current API Key Revocation

### Context

Local password login and OIDC login issue short-lived scoped API keys instead of server-side sessions. The web UI previously cleared its local key on sign-out-like flows, but the server-side bearer key remained active until expiry or admin revocation.

### Options Considered

- leave logout as a client-local storage clear only
- add a session table and cookie/logout model now
- add current-key revocation on top of the existing API-key auth model

### Decision And Rationale

Expose `/auth/logout` as current bearer-key revocation. Any authenticated principal can revoke only its own `apiKeyId`; admins still use existing API-key management routes for other keys. SDK and CLI expose logout as a thin client call, and the web UI calls logout before clearing local auth state.

This closes the practical logout gap without adding a parallel session system before refresh-token, fuller cookie-session, and hosted identity requirements are settled.

### Consequences

- Logout invalidates local and OIDC login keys immediately.
- Service-account keys can also self-revoke if a client intentionally calls logout with that key.
- Web sign-out clears volatile admin data and one-time secrets from state after attempting revocation.
- MCP does not expose a convenience logout tool in this slice to avoid accidental revocation of a connector's configured credential; admins can still revoke explicit keys by ID.
- Later decisions added session cookies and signed CSRF protection. Refresh tokens and hosted identity lifecycle remain future work.

### Follow-Ups / Review

Review when adding session cookies, refresh tokens, OAuth app grants, MCP connector auth UX, tenant-wide session revocation, or hosted identity policy controls.

## 0046: Add Tenant Service Account Policy Controls

### Context

Service accounts are the most likely principal type for unattended agent harnesses, MCP connectors, CI jobs, and automation. The core already supports service-account API keys and direct restricted-asset grants, but it lacked tenant-level controls for service-account sprawl, long-lived service-owned keys, and excessive active keys per automation principal.

### Options Considered

- leave service-account lifecycle entirely manual until hosted enterprise identity policy exists
- add a broad enterprise policy engine now
- add narrow tenant policy fields for service-account count, active service-owned key count, and default service-key expiry

### Decision And Rationale

Add a tenant-scoped `service_account_policies` table and expose admin controls across API, SDK, CLI, MCP, OpenAPI, and the operational web UI. The default policy allows 50 service accounts per tenant, five active API keys per service account, and applies a 90-day expiry to service-owned API keys when the caller does not set an explicit expiry.

The policy fields can be set to `null` to remove a limit or default expiry for self-hosted deployments that need it. Policy updates are audited. Service-account creation and service-owned API-key creation return conflict errors when the current tenant policy is exceeded.

This closes a pragmatic SMB hardening gap without prematurely adding a full identity-governance engine, hosted billing/quota subsystem, or complex approval workflows.

### Consequences

- Service principals now have sensible default sprawl and key-lifetime controls.
- Existing user-owned API-key behavior is unchanged.
- Policy enforcement is synchronous in the repository layer, so API, CLI, SDK, MCP, and web routes share the same behavior.
- The active-key limit counts unrevoked keys whose expiry is absent or still in the future.
- This is not yet per-role policy, per-surface key policy, automated rotation, SCIM, hosted identity lifecycle, or tenant budget management.

### Follow-Ups / Review

Review when adding hosted identity policy, SCIM/off-cycle deprovisioning, automated key rotation reminders, per-surface service-account scopes, service-account approval workflows, tenant budgets, or enterprise compliance exports.

## 0047: Add Tenant Managed Query Cache Policy

### Context

Permission-scoped response caching can persist generated answer text for a short TTL. Existing controls let callers opt out per request and let provider configs disable caching or set `cacheTtlSeconds`, but there was no tenant-level admin policy for generated-answer persistence. This left a gap for SMB operators who need one place to disable generated-answer caching or cap TTLs without editing each provider.

### Options Considered

- leave cache controls on request/provider metadata only
- build a broad prompt/response retention and legal-hold subsystem now
- add a narrow tenant managed-query cache policy for enablement and max TTL

### Decision And Rationale

Add a tenant-scoped `managed_query_cache_policies` table and expose admin controls across API, SDK, CLI, MCP, OpenAPI, and the operational web UI. The default policy enables caching with a 3600-second max TTL cap. Admins can disable generated-answer caching entirely or set `maxCacheTtlSeconds` to `null` to remove the tenant cap while provider TTL validation remains bounded to 86400 seconds.

Provider-routed cache reads and writes now require an enabled tenant policy, a cache-enabled provider config, a request that has not opted out, and a query that did not trigger direct-identifier redaction. Policy updates are audited with actor attribution. Backup/restore verification includes the policy table.

This closes the immediate generated-answer persistence governance gap without prematurely adding answer inspection, per-entry legal hold, semantic cache governance, or hosted data-retention workflows.

### Consequences

- Self-hosted admins can disable generated-answer caching centrally.
- Provider-specific TTLs cannot exceed the tenant cap unless the admin explicitly clears that cap.
- Cache policy is enforced in the shared API path, so CLI, MCP, SDK, and web clients inherit the same behavior.
- Existing cache metadata listing remains safe and does not expose cached answer text.
- This is not yet prompt/response retention policy, cache answer review, per-entry deletion, legal hold, tenant export/delete, semantic caching, or quality-based cache acceptance.

### Follow-Ups / Review

Review when adding prompt/response retention policy, per-entry deletion, legal hold, tenant data export/delete, semantic cache policy, eval-driven cache acceptance, hosted analytics, or full orchestration budgets.

## 0048: Add Targeted Managed Query Cache Entry Deletion

### Context

Generated-answer cache entries can persist answer text until TTL expiry. Decisions 0043 and 0047 added safe cache metadata listing, expired-row purge, and tenant policy controls, but admins still had no way to remove one problematic cache entry before expiry without purging unrelated expired rows or disabling caching globally.

### Options Considered

- wait for a full prompt/response retention, review, and legal-hold subsystem
- expose cached answer inspection and deletion in admin surfaces
- add admin-only deletion by cache key while continuing to hide cached answer text

### Decision And Rationale

Add targeted cache-entry deletion by cache key across the repository, API, SDK, CLI, MCP, OpenAPI, and operational web UI. The delete response returns the same safe metadata shape as cache listing and omits cached answer text. Delete operations are tenant-scoped, require admin auth, return `404` for absent entries, and record an audit event with provider/model/expiry/hit-count metadata rather than answer content.

This closes the incident-response gap for short-lived generated-answer caching without adding broad prompt/response retention, cache answer review, or legal-hold workflows before the core governance model is ready.

### Consequences

- Admins can remove a single generated-answer cache entry before TTL expiry.
- Cache-entry deletion does not expose answer text in API, CLI, MCP, web, or audit outputs.
- Deletion uses exact cache keys from safe metadata listing; semantic or prompt-based cache search remains future work.
- Expired-row purge remains separate and dry-run by default.
- This is not yet prompt/response retention policy, answer inspection, legal hold, tenant data export/delete, semantic cache governance, or eval-driven cache acceptance.

### Follow-Ups / Review

Review when adding prompt/response retention policy, cache answer review, legal hold, tenant export/delete, semantic cache policy, quality-based cache acceptance, or hosted analytics.

## 0049: Add Managed Query Prompt And Response Retention Policy

### Context

Provider-routed managed queries already avoid storing raw provider prompts, provider request bodies, provider API keys, and generated answer text in audit metadata. The cache path can store generated answers for a short TTL, and cache policy plus per-entry deletion now govern that persistence. The remaining gap is explicit tenant control over prompt/response capture posture before any future transcript table, answer review workflow, or legal-hold subsystem is introduced.

### Options Considered

- continue relying on implicit no-raw-prompt/no-raw-response behavior
- add raw or redacted transcript storage now
- add a narrow tenant policy that defaults capture off and supports metadata-only hashes

### Decision And Rationale

Add a tenant-scoped `managed_query_retention_policies` table and expose admin controls across API, SDK, CLI, MCP, OpenAPI, and the operational web UI. Defaults set prompt capture and response capture to `disabled`, with a 30-day metadata retention marker. Admins can switch either side to `metadata-only`, which records prompt/response hashes in provider-generation audit metadata while still keeping raw prompt and response bodies out of audit and telemetry records.

This makes the PII/retention posture explicit and testable without prematurely introducing raw transcript storage, answer inspection, legal hold, tenant export/delete workflows, or redacted transcript review UI.

### Consequences

- Admins can see and configure the managed-query prompt/response capture posture before enabling richer orchestration.
- Provider-generation audit events record the policy decision and optional hashes, never raw prompt or response text.
- The policy is separate from generated-answer cache policy; cache persistence remains governed by cache policy, cache TTL, and targeted deletion.
- `metadataRetentionDays` is a policy marker for transcript metadata posture; actual audit-event deletion still follows telemetry/audit retention until a dedicated transcript store exists.
- This is not yet raw transcript storage, redacted transcript review, legal hold, tenant data export/delete, or prompt/response purge automation.

### Follow-Ups / Review

Review when adding transcript tables, redacted answer review, legal hold, tenant export/delete, hosted analytics, semantic cache governance, or LLM-as-judge evaluation records.

## 0050: Add Tenant Secret Reference Policy For Provider And OIDC Config

### Context

Provider and external auth configs already avoid storing provider API keys or OIDC client secrets. They store only env-var names such as `OPENAI_API_KEY` or `ENTRA_CLIENT_SECRET`, and runtime code reads the actual secret from deployment environment variables. That still left a smaller governance gap: an admin could accidentally configure unrelated process env vars such as `PATH`, `HOME`, or other broad runtime values as secret references.

### Options Considered

- keep accepting any syntactically valid env-var name
- require a full secret-manager integration now
- add tenant policy for allowed env-var prefixes and exact env-var names

### Decision And Rationale

Add a tenant-scoped `secret_reference_policies` table and expose admin controls across API, SDK, CLI, MCP, OpenAPI, and the operational web UI. The default policy allows common ForgetBase, OpenAI, Anthropic, OpenRouter, Entra, and OIDC prefixes while rejecting unrelated env vars. Admins can replace allowed prefixes, add exact env-var names, or explicitly allow all valid env-var names for unusual self-hosted deployments.

Provider config `apiKeyEnvVar` and auth provider config `clientSecretEnvVar` writes are checked against the tenant policy before the config is saved. Policy updates are audited with actor attribution. Backup/restore verification includes the policy table.

This improves the existing env-var-only secret posture without prematurely adding hosted secret storage, secret rotation workflows, or a mandatory external secret-manager dependency.

### Consequences

- Accidental references to broad runtime env vars are rejected by default.
- Existing documented examples using `OPENAI_API_KEY`, `ANTHROPIC_*`, `OPENROUTER_*`, `ENTRA_*`, `OIDC_*`, and `FORGETBASE_*` remain supported.
- Self-hosted deployments with custom naming can add exact names or prefixes before saving provider/auth-provider config.
- The policy governs env-var names only; it does not store, validate, rotate, encrypt, mount, or broker secret values.
- This is not yet a hosted secret manager, secret-file adapter, secret health scanner, automated rotation workflow, or per-provider credential vault.

### Follow-Ups / Review

Review when adding mounted secret files, external secret-manager adapters, hosted secret storage, provider credential rotation reminders, SCIM/off-cycle deprovisioning, deployment hardening, or managed orchestration credentials.

## 0051: Add Metadata-Only Asset Review Queue And Review Completion

### Context

The registry already stores lifecycle state, status, and next review date, and validation can report stale reviews. Operators still needed a supported way to see governance work and mark a current asset review complete without editing the database or creating an unrelated content version.

### Options Considered

- rely on validation reports only
- add a full multi-step workflow engine now
- add a narrow review queue plus metadata-only review completion

### Decision And Rationale

Add a maintainer/admin review queue across API, SDK, CLI, MCP, OpenAPI, and the operational web UI. The queue returns assets that are stale, not approved, not active, or explicitly included for a governance sweep. Add a review-complete operation that updates status, next review date, and optional source reference without creating a new asset version.

Review completion records an `asset.review` audit event and reindexes retrieval chunks for the asset, because status changes can affect public/search/export eligibility. The route requires a write-capable maintainer/admin key when auth is enabled.

This closes the practical stale-review operations gap while preserving the larger decision about multi-step approvals, assignments, scheduled releases, and review evidence.

### Consequences

- Maintainers/admins can run a review queue through API, CLI, MCP, and web without direct database access.
- Review completion is a governance metadata transition, not a content change, so it does not create a content version.
- Audit records capture stable ID, current version ID, status, review date, source reference, and change note, but not full asset content.
- The queue is deterministic and tenant-scoped; it is not an assignment system, SLA engine, approval chain, or legal sign-off record.

### Follow-Ups / Review

Review when adding assigned reviewers, multi-step approvals, scheduled publish/unpublish, review evidence attachments, notification workflows, or compliance export reports.

## 0052: Add API Key Rotation-Due Reporting

### Context

Service-account API keys are the credential path most likely to be used by unattended agent harnesses, MCP connectors, CI jobs, and integrations. Decision 0046 added service-account policy limits and default expiry, and decision 0020 added staged rotation, but admins still needed a supported way to find keys that are expired, near expiry, or missing expiry metadata before a rotation incident.

### Options Considered

- rely on manual API-key list inspection
- create a separate reminders table and notification workflow now
- derive a rotation-due report from existing API-key records

### Decision And Rationale

Add an admin-only API-key rotation-due report derived from existing `api_keys` records and expose it through API, SDK, CLI, MCP, OpenAPI, and the operational web UI. The report focuses on service-account keys by default and classifies keys as `expired`, `due-soon`, or `missing-expiry` within an admin-selected window. Admins can opt into including user-owned keys or revoked keys.

This closes a pragmatic SMB credential-hygiene gap without adding scheduler state, notification delivery, or a separate reminders model before the hosted operations layer exists. The report returns the same safe API-key record shape as list operations, including secret previews but never raw secrets.

### Consequences

- Admins can find service-owned keys that need rotation without direct database access.
- CLI, MCP, SDK, API, and web clients share the same tenant-scoped report behavior.
- Rotation-due reporting is read-only and does not itself audit an event; actual rotate/revoke actions continue to produce audit evidence.
- This is not yet automated notification, enforced rotation, per-surface key policy, hosted secret-manager rotation, or SCIM/off-cycle deprovisioning.

### Follow-Ups / Review

Review when adding scheduled admin notifications, hosted identity lifecycle, secret-manager adapters, enforced key-age policy, per-surface service-account scopes, or compliance exports.

## 0053: Add Dry-Run Worker API Key Rotation Reminders

### Context

Decision 0052 exposed a safe report for service-account API keys that are expired, near expiry, or missing expiry metadata. Operators still needed a repeatable worker path that can preview reminder volume and create tenant-scoped operational evidence without building notification delivery ahead of the hosted operations layer.

### Options Considered

- add email/Slack/admin notification delivery now
- add a separate reminder table and deduplication model now
- reuse the rotation-due report in worker maintenance and write audit reminder events only when executed

### Decision And Rationale

Add dry-run-first worker maintenance for service-account API-key rotation reminders. The job can run once through `--api-key-rotation-reminders-once` or on an opt-in worker schedule. Dry-run reports tenant and reminder counts. Execution records one `auth.api_key.rotation_reminder` audit event per tenant with key IDs, owner type, rotation state, reason, and days until expiry.

Compose defaults keep the scheduler disabled and dry-run. Reminder audit metadata intentionally omits raw API-key secrets and secret previews, so audit evidence can be reviewed without expanding the secret exposure surface.

### Consequences

- Operators can preview reminder volume before creating audit evidence.
- Self-hosted deployments can schedule credential-hygiene reminders through the existing worker and audit surfaces.
- The implementation avoids notification delivery, notification preferences, hosted scheduler state, and a new reminders table until those surfaces have clear product requirements.
- Decision 0054 adds a pragmatic audit-event dedupe window so repeated executed runs skip matching tenant/key-state evidence by default.
- This is not yet external notification delivery, enforced rotation, per-surface key policy, hosted secret-manager rotation, job locking for multi-worker deployments, or reminder deduplication.

### Follow-Ups / Review

Review when adding email/Slack/webhook notifications, hosted scheduler controls, multi-worker job locking, richer notification delivery state, secret-manager adapters, enforced key-age policy, SCIM/off-cycle deprovisioning, or compliance exports.

## 0054: Dedupe API Key Rotation Reminder Audit Evidence

### Context

Decision 0053 added worker-executed API-key rotation reminders that write one tenant-scoped audit event for service-account keys due for rotation. That created useful evidence, but repeated executed worker runs could create duplicate reminder audit events for the same tenant and key-state set before any key state had changed.

### Options Considered

- accept duplicate audit evidence until external notification delivery exists
- add a separate reminder delivery table now
- dedupe against recent successful reminder audit events using a key-state fingerprint

### Decision And Rationale

Add a configurable dedupe window to API-key rotation reminder execution. The worker computes a stable fingerprint from the tenant's due API key IDs and rotation states. Before writing an `auth.api_key.rotation_reminder` audit event, it checks recent successful reminder audit events for the same tenant and skips the write when the fingerprint already exists inside the window.

The default window is 24 hours through `FORGETBASE_API_KEY_ROTATION_REMINDERS_DEDUPE_WINDOW_HOURS` and `--dedupe-window-hours`. Operators can set the value to `0` to intentionally record duplicate evidence. Dry-run and execute logs include `skippedDuplicateCount` so operators can see whether dedupe affected the run.

This uses existing audit events as the operational evidence store and avoids adding notification-delivery state before email/Slack/webhook requirements are settled.

### Consequences

- Scheduled reminder jobs can run without creating repeated identical audit evidence inside the default window.
- New due keys or state changes, such as `due-soon` becoming `expired`, produce a different fingerprint and can still create fresh audit evidence.
- No raw secrets or secret previews are added to the fingerprint or audit metadata.
- The dedupe check is pragmatic and bounded to the most recent 200 tenant audit events; very noisy tenants can still need a future delivery table or indexed query path.
- This is not yet external notification delivery, delivery preferences, reminder acknowledgement, escalation policy, multi-worker job locking, or a full reminder lifecycle table.

### Follow-Ups / Review

Review when adding email/Slack/webhook notifications, hosted scheduler controls, multi-worker job locking, reminder acknowledgement/escalation, compliance export reports, or higher-volume audit querying.

## 0055: Add HttpOnly Browser Session Cookie Foundation

### Context

The operational web UI previously used the same login secret returned to API clients and persisted it in browser `localStorage`. That kept implementation simple, but it left a JavaScript-readable bearer-equivalent credential in the browser. The project still needs a fuller hosted identity/session design later, but SMB self-hosted deployments need a safer browser default now.

### Options Considered

- keep web login backed by `localStorage` bearer secrets
- add a full refresh-token/session table and lifecycle now
- set an `HttpOnly` browser cookie over the existing short-lived login key

### Decision And Rationale

Add an `HttpOnly`, `SameSite=Lax` browser session cookie named `forgetbase_session` on password and OIDC login. The cookie stores the same short-lived login key that the API already issues, so authentication, scope checks, expiry, revocation, and audit behavior continue to flow through the existing API-key path. Authorization headers remain preferred when present, preserving CLI, MCP, SDK, and direct API client behavior.

The web UI now sends credentialed requests, uses the cookie after password/OIDC login, clears JavaScript-readable login-key storage, and keeps manual API-key entry available for operator workflows. Logout clears the cookie and revokes the current key. The API reflects request origins for credentialed CORS instead of using wildcard CORS when an `Origin` header is present.

This closes the immediate browser-secret exposure gap without adding hosted identity state, refresh-token rotation, device/session management, or revocation lists before those requirements are settled.

### Consequences

- Browser login no longer requires persisting login secrets in `localStorage`.
- The cookie is bearer-equivalent until the short-lived login key expires or is revoked, so it must be served over HTTPS with `FORGETBASE_SESSION_COOKIE_SECURE=true` outside local HTTP development.
- API, CLI, MCP, and SDK clients can continue using bearer keys with no protocol change.
- The implementation remains intentionally below a full enterprise session lifecycle.

### Follow-Ups / Review

Review when adding refresh-token rotation, per-device session lists, idle timeout, stronger browser isolation requirements, MFA policy reporting, hosted identity hardening, or SCIM-driven deprovisioning.

## 0056: Restrict Credentialed Browser CORS To Allowed Origins

### Context

Decision 0055 moved the operational web UI from JavaScript-readable login secrets to an `HttpOnly` cookie over the existing short-lived key. The first implementation reflected any browser `Origin` for credentialed CORS so local browser development worked without extra configuration. That was too broad for a cookie-backed production deployment.

### Options Considered

- keep reflecting every browser origin for credentialed requests
- disable credentialed browser CORS and require same-origin reverse proxy only
- add a deployment-configured exact origin allowlist

### Decision And Rationale

Add an exact-origin allowlist for credentialed browser CORS. The API reads `FORGETBASE_CORS_ALLOWED_ORIGINS` as a comma-separated list and defaults to local development origins `http://127.0.0.1:5175` and `http://localhost:5175`. Allowed origins receive `Access-Control-Allow-Origin` plus `Access-Control-Allow-Credentials`; unlisted browser preflight requests fail with `origin_not_allowed`. Originless API, CLI, SDK, and MCP requests keep working without credentialed CORS.

This keeps the open-source Docker Compose path easy locally while making production browser-cookie deployments explicit about which web origins may send credentialed requests.

### Consequences

- Self-hosted operators must set the allowlist when exposing the web UI at a public DNS/TLS origin.
- A stale or missing production origin blocks browser login and web operations until the env var is corrected.
- Direct bearer clients are unaffected because they do not rely on browser CORS.
- Decision 0057 adds signed CSRF tokens for cookie-authenticated unsafe methods. This is still not a same-origin deployment mandate, hosted tenant-domain policy, or refresh-token/session lifecycle.

### Follow-Ups / Review

Review when adding same-origin reverse-proxy deployment templates, hosted tenant domains, refresh-token/session lifecycle, stronger subdomain isolation, or per-tenant web origins.

## 0057: Require Signed CSRF Tokens For Cookie-Authenticated Unsafe Browser Requests

### Context

Decisions 0055 and 0056 moved the operational web UI to an `HttpOnly` session cookie over a short-lived key and restricted credentialed CORS to configured origins. That reduced browser secret exposure and broad origin risk, but unsafe browser requests still needed an explicit CSRF defense before the cookie-backed UI could be considered a production-credible SMB default.

### Options Considered

- rely on `SameSite=Lax` and the CORS origin allowlist only
- require same-origin reverse proxy deployment before supporting browser cookies
- add a signed double-submit CSRF token for cookie-authenticated unsafe methods

### Decision And Rationale

Add a signed double-submit CSRF token for browser session-cookie authentication. Password and OIDC login now set the existing `forgetbase_session` `HttpOnly` cookie plus a readable `forgetbase_csrf` cookie. For unsafe methods, requests authenticated by the session cookie must echo the CSRF cookie value in `x-forgetbase-csrf`; missing, mismatched, malformed, or wrongly signed values fail with `csrf_required` before the action runs.

The CSRF token is signed with the short-lived session key, so a client cannot satisfy the check by inventing an unrelated token. Authorization bearer headers still take precedence over cookies and do not require CSRF headers, preserving CLI, MCP, SDK, service-account, and manual API clients.

### Consequences

- The bundled web UI can keep cookie-backed login while protecting POST, PUT, PATCH, and DELETE operations from missing-token CSRF attempts.
- Custom browser clients using cookies must read `forgetbase_csrf` and send it as `x-forgetbase-csrf` for unsafe requests.
- Bearer-token clients are unaffected and remain the explicit non-browser auth protocol.
- This does not add a full refresh-token/session table, per-device sessions, idle-timeout state, same-origin reverse-proxy templates, or tenant-specific browser origin policy.

### Follow-Ups / Review

Review when adding full refresh-token/session lifecycle, per-device session management, same-origin deployment templates, hosted tenant domains, stronger subdomain isolation requirements, or action-execution approval flows.

## 0058: Add A Same-Origin Docker Compose Browser Proxy Overlay

### Context

Decisions 0055, 0056, and 0057 made browser login safer by moving short-lived login keys into an `HttpOnly` cookie, restricting credentialed split-origin browser CORS, and requiring a signed CSRF token for unsafe cookie-authenticated requests. The default local Compose shape still exposed the web UI and API on separate origins (`5175` and `3000`), which is useful for development but not the cleanest SMB deployment default for cookie-backed browser operations.

### Options Considered

- keep only the split-origin Compose deployment and rely on CORS configuration
- require all deployments to run same-origin and remove the local split-origin path
- add an optional same-origin reverse-proxy overlay while keeping local split-origin development

### Decision And Rationale

Add a Docker Compose overlay, `compose.same-origin.yaml`, with an Nginx proxy that serves the web UI at `/` and routes `/api/*` to the API service. The bundled web UI now defaults to `/api` outside the existing local `127.0.0.1:5175`/`localhost:5175` preview and preserves the split-origin `http://127.0.0.1:3000` default for local development.

This gives self-hosted SMB operators a clearer browser-cookie deployment shape without forcing all contributors to run through a proxy while developing. It also keeps CLI, MCP, SDK, and direct API clients unchanged because the API can still be addressed directly or through the proxied `/api` base URL.

### Consequences

- Browser-cookie deployments have a recommended same-origin path that reduces reliance on credentialed CORS for the bundled UI.
- Split-origin local development continues to work with the existing Compose web preview and CORS allowlist.
- Operators exposing the same-origin proxy over HTTPS must still set `FORGETBASE_SESSION_COOKIE_SECURE=true` on the API.
- This is not a hosted tenant-domain policy, TLS automation layer, refresh-token/session lifecycle, or full ingress story.

### Follow-Ups / Review

Review when adding production TLS examples, hosted tenant domains, stronger subdomain isolation, refresh-token/session lifecycle, per-tenant web origins, or Kubernetes/managed-ingress deployment templates.

## 0059: Support Mounted Secret Files For Configured Provider Secrets

### Context

Provider and OIDC configuration records intentionally store only env-var names, not API keys or client secrets. That protects the database and admin surfaces from secret values, but Docker Compose and future Kubernetes deployments often provide secrets as mounted files rather than direct environment variable values.

### Options Considered

- keep direct environment variables only
- store secret file paths in provider/auth-provider config records
- support a derived `<ENV_VAR>_FILE` runtime fallback for configured env-var names

### Decision And Rationale

Support mounted secret files through a derived env-var convention. Provider and auth-provider config records still reference only the base env var name, such as `OPENAI_API_KEY` or `ENTRA_CLIENT_SECRET`. At runtime, the API first reads that env var directly. If it is unset, the API checks `<ENV_VAR>_FILE`, requires an absolute path, reads the secret from that file, strips trailing newlines, and treats empty or unreadable files as unavailable secrets.

This keeps the no-secret-values-in-config boundary intact, lets self-hosted operators use Docker secrets or similar mounts, and avoids designing a hosted secret-manager abstraction before provider-secret ownership, rotation, and hosted operational boundaries are settled.

### Consequences

- Provider-routed managed queries can use direct env vars or mounted secret files without changing provider config records.
- OIDC token exchange can use direct env vars or mounted secret files for configured client secrets.
- Provider readiness treats file-backed secrets as configured only when the file resolves successfully; secret values and file contents are never returned.
- The configured base env-var name must still satisfy tenant secret-reference policy.
- This is not an external secret-manager adapter, secret rotation workflow, hosted secret store, or secret-file path policy surface.

### Follow-Ups / Review

Review when adding hosted secret-manager adapters, secret rotation automation, secret reference auditing beyond config changes, Kubernetes deployment templates, or operator-managed secret inventories.

## 0060: Cap Interactive Login Session Lifetimes Server-Side

### Context

Password and OIDC login issue short-lived API keys that can be used directly by CLI/MCP/SDK clients and are also stored in the browser `HttpOnly` session cookie for the bundled web UI. The request schema allowed clients to ask for a longer expiry window than the intended default browser-session posture, and relying on clients to choose the right value is weak for an SMB production default.

### Options Considered

- keep trusting client-requested login expiry up to the schema maximum
- add a full refresh-token/session table with per-device session records immediately
- cap login-created key lifetime with deployment configuration while leaving admin-created API keys as the long-lived credential path

### Decision And Rationale

Cap password/OIDC login-created API keys with a server-side max session age. The API reads `FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS`, defaults to 43200 seconds, and requires a whole-second value between 60 and 2592000. Password and OIDC login use the lesser of the client-requested expiry and the server cap when creating the login key. The `forgetbase_session` and `forgetbase_csrf` cookies derive their `Max-Age` from that same effective expiry.

This keeps interactive session lifetime centrally controlled, preserves the existing short-lived key implementation, and keeps longer-lived automation credentials on the admin-created user/service-account API-key path where listing, rotation reporting, service-account policy, and revocation controls already exist.

### Consequences

- Browser session cookies and their underlying login keys cannot outlive the configured interactive-login cap.
- CLI/MCP/SDK login responses still receive the raw login key once, but that key is capped by the same policy.
- Operators can shorten or lengthen the interactive login window without changing code, within a bounded range.
- Long-lived automation should use admin-created API keys or service-account keys instead of login-created keys.
- This is not a full refresh-token table, per-device session list, idle-timeout implementation, MFA policy, or SCIM-driven deprovisioning layer.

### Follow-Ups / Review

Review when adding refresh-token rotation, idle timeout, per-device session management, remembered-device policy, hosted identity controls, MFA policy reporting, or SCIM deprovisioning.

## 0061: Add Login Session Records For Browser Cookie Auth

### Context

Password and OIDC login already issued short-lived API keys and stored those keys in `HttpOnly` browser cookies for the bundled web UI. That kept secrets out of `localStorage`, but any valid API key could still be placed in the session cookie and treated as a browser session. Operators also lacked a first-class inventory of browser login sessions separate from the broader API-key list.

### Options Considered

- keep cookie auth as direct API-key authentication only
- build a full refresh-token/session lifecycle immediately
- add database-backed login-session records tied to login-created API keys, with inventory and revocation, while leaving refresh-token rotation for later

### Decision And Rationale

Add a `login_sessions` table for password/OIDC login-created browser sessions. Login creates a short-lived API key and a linked login-session record. Cookie authentication now requires both the key and an active, unexpired, unrevoked login-session record. Bearer authentication stays API-key based and does not require a login-session record.

Expose login-session list/revoke controls through API, SDK, CLI, MCP, and the operational web UI. Users can list/revoke their own sessions; admins can list/revoke tenant sessions. Revoking a login session also revokes its underlying login key and clears cookies when the revoked session is the caller's current browser session.

This gives SMB operators session inventory and emergency revocation without prematurely introducing refresh tokens, rotating session secrets, device trust, or hosted identity policy complexity.

### Consequences

- Browser cookies can no longer authenticate arbitrary admin-created user keys or service-account keys.
- Session inventory is optimized independently from general API-key inventory while reusing API-key hashing, expiry, and revocation.
- Revoking the login-created API key also revokes any linked login session.
- Backup/restore verification includes the new session table.
- This is not a full refresh-token lifecycle, idle-timeout layer, remembered-device system, MFA policy surface, or SCIM deprovisioning workflow.

### Follow-Ups / Review

Review when adding refresh-token rotation, user-facing device labels, remembered-device policy, hosted identity controls, MFA policy reporting, SCIM deprovisioning, or richer session telemetry.

## 0062: Enforce Rolling Idle Timeout For Browser Login Sessions

### Context

Decision 0061 added login-session records and cookie-authentication checks, but active browser sessions still remained valid until the absolute login-key expiry unless an operator manually revoked them. SMB deployments need a practical idle-session control before the full refresh-token and remembered-device lifecycle exists.

### Options Considered

- rely only on absolute login-key expiry
- build refresh-token rotation, device records, and idle timeout together
- add configurable idle-timeout enforcement using the existing `login_sessions.last_seen_at` field

### Decision And Rationale

Add rolling idle-timeout enforcement to cookie-backed browser login sessions. Cookie-authenticated requests require an active login-session row whose `last_seen_at`, or `created_at` before first use, is inside the configured idle window. Successful cookie authentication updates `last_seen_at`.

The API reads `FORGETBASE_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS`. Compose defaults it to 14400 seconds, or 4 hours. A value of `0` disables idle-timeout enforcement, and non-zero values must be whole seconds between 60 and 2592000. Bearer API keys remain governed by key expiry and revocation, not login-session idle timeout.

This uses the existing session table and keeps the security improvement narrowly scoped without prematurely introducing refresh tokens, rotating session secrets, device labels, or remembered-device policy.

### Consequences

- Idle browser sessions stop authenticating even if the underlying login key and cookie have not reached absolute expiry.
- Active browser sessions roll forward through `last_seen_at` updates, bounded by the absolute login-key expiry.
- CLI, MCP, SDK, and direct API bearer flows remain unchanged.
- Operators can disable idle timeout with `0`, but production runbooks recommend keeping it enabled.
- This is not refresh-token rotation, device/session labeling, remembered-device policy, MFA enforcement, or SCIM-driven deprovisioning.

### Follow-Ups / Review

Review when adding refresh-token rotation, user-facing device labels, remembered-device policy, hosted identity controls, MFA policy reporting, SCIM deprovisioning, or richer session telemetry and analytics.

## 0063: Rotate One-Time Refresh Tokens For Browser Login Sessions

### Context

Decisions 0061 and 0062 gave browser login sessions database-backed inventory, revocation, and rolling idle-timeout enforcement. Browser sessions still depended on the short-lived login key in the `forgetbase_session` cookie, so a user had to complete password/OIDC login again when that key expired. SMB deployments need a practical refresh path that keeps raw access keys out of JavaScript without jumping straight to remembered-device policy, MFA enforcement, or hosted identity lifecycle complexity.

### Options Considered

- keep short-lived browser login keys only and require full re-login after expiry
- add a separate opaque session system beside API keys
- add hash-only one-time refresh tokens tied to existing `login_sessions`, rotating the login-created API key and refresh token together

### Decision And Rationale

Add `login_session_refresh_tokens` for browser login sessions. Password and OIDC login create a hash-only refresh-token row and set an `HttpOnly`, `SameSite=Lax` `forgetbase_refresh` cookie. `POST /auth/session/refresh` accepts only that cookie, rejects missing, reused, revoked, expired, disabled-user, or idle-expired refresh attempts, marks the old refresh token used, creates a new short-lived login API key, moves the existing `login_sessions` row to that key, revokes the old login key, creates the next refresh token, and sets fresh HttpOnly cookies.

The API reads `FORGETBASE_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS`. Compose defaults it to 604800 seconds, or 7 days. A value of `0` disables refresh-token issuance, and non-zero values must be whole seconds between 60 and 2592000. Refresh responses return safe key/session metadata only; the new raw login key is set only in the HttpOnly session cookie.

This keeps the browser session model anchored to the existing API-key and login-session controls while closing the practical re-login gap. It avoids creating a parallel auth system and keeps bearer API, CLI, SDK, and MCP behavior unchanged.

### Consequences

- Refresh tokens are stored only as hashes and are one-time credentials.
- Refresh rotation revokes the previous login-created API key, so old session cookies and old bearer copies of that login key stop authenticating.
- Login-session revocation, logout, and API-key revocation revoke linked refresh tokens.
- Rolling idle timeout applies to refresh attempts, so refresh cannot revive an idle-expired browser session.
- Backup/restore verification includes the refresh-token table.
- This is not remembered-device policy, MFA enforcement/reporting, absolute session lifetime policy, SCIM deprovisioning, or hosted tenant-domain isolation.

### Follow-Ups / Review

Review when adding user-facing device labels, remembered-device policy, MFA policy reporting, absolute session lifetime controls, hosted identity controls, SCIM deprovisioning, or richer session telemetry and analytics.

## 0064: Add Absolute Lifetime For Browser Login Sessions

### Context

Decision 0063 added one-time refresh-token rotation for browser login sessions. That made browser sessions practical without exposing refreshed raw login keys to JavaScript, but the session could continue rotating as long as idle timeout, refresh-token lifetime, user status, and revocation checks allowed it. SMB deployments need a hard upper bound from login time so a browser session cannot be refreshed indefinitely.

### Options Considered

- rely on refresh-token max age and rolling idle timeout only
- make all login-created API keys stop authenticating as bearer credentials after a browser-session absolute cap
- store an absolute browser-session expiry on `login_sessions` and enforce it only in cookie auth and refresh paths

### Decision And Rationale

Add nullable `login_sessions.absolute_expires_at`, set on password/OIDC login from `FORGETBASE_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS`. Compose defaults this to 2592000 seconds, or 30 days. A value of `0` disables the absolute cap, and non-zero values must be whole seconds between 60 and 31536000.

Cookie authentication and refresh require the login session to be before `absolute_expires_at` when one is set. Login-created access-key expiry, refresh-token expiry, and refreshed cookie max ages are capped to the absolute expiry. Bearer API-key authentication remains governed by key expiry and revocation, matching the existing boundary that browser-session policy does not silently change CLI, MCP, SDK, or direct API behavior.

This gives operators a hard browser-session ceiling without adding remembered-device policy, MFA reporting, or hosted IdP lifecycle complexity in the same lane.

### Consequences

- Browser sessions cannot be refreshed beyond the configured absolute lifetime.
- Existing login sessions are backfilled to at least their current expiry and otherwise 30 days from creation during migration.
- Refresh tokens and refreshed login keys are capped by the stored absolute expiry.
- Bearer API-key flows remain separate from browser-session absolute lifetime enforcement.
- Disabling the cap with `0` is possible for compatibility, but production runbooks recommend keeping it enabled.
- This is not remembered-device policy, MFA enforcement/reporting, SCIM deprovisioning, or hosted tenant-domain isolation.

### Follow-Ups / Review

Review when adding user-facing device labels, remembered-device policy, MFA policy reporting, tenant-wide session revocation, hosted identity controls, SCIM deprovisioning, or richer session telemetry and analytics.

## 0065: Add Device Labels To Browser Login Sessions Without Trust Semantics

### Context

Decisions 0061 through 0064 established database-backed browser login sessions with inventory, revocation, rolling idle timeout, refresh-token rotation, and absolute lifetime enforcement. Session lists were still hard to use operationally because users and admins saw only IDs, source, key IDs, and timestamps. SMB operators need enough safe metadata to identify which browser or CLI-originated login session to revoke without introducing remembered-device trust, MFA bypass, or new authorization rules.

### Options Considered

- keep session inventory ID-only until remembered-device policy is designed
- store rich device fingerprints, IP addresses, and persistent trusted-device records
- store a nullable caller-provided device label plus bounded client user-agent metadata on `login_sessions`

### Decision And Rationale

Add nullable `login_sessions.device_label` and `login_sessions.client_user_agent`. Password and OIDC login accept an optional `deviceLabel`, CLI login defaults to a CLI-oriented label, and the web UI sends a browser-oriented label. The API records the first request user-agent value, truncated to a bounded length, and returns these fields through the existing safe login-session list, refresh, and revoke responses.

The fields are inventory metadata only. Cookie authentication, refresh, revocation, bearer authentication, CSRF enforcement, idle timeout, and absolute lifetime checks do not trust or branch on the device label or user-agent value.

### Consequences

- Users and admins can distinguish sessions before revoking them.
- Existing clients remain compatible because both fields are nullable and optional at login.
- The web UI can show labels and bounded client metadata in the existing Operations session list.
- Session refresh preserves the metadata on the same `login_sessions` row.
- This is not remembered-device trust, MFA enforcement/reporting, client fingerprinting, IP risk scoring, or SCIM deprovisioning.

### Follow-Ups / Review

Review when adding remembered-device trust policy, MFA policy reporting, tenant-wide session revocation, hosted identity controls, SCIM deprovisioning, or richer session telemetry and analytics.

## 0066: Add A Docker Compose TLS Overlay Without Certificate Automation

### Context

Decision 0058 added a same-origin Docker Compose proxy so browser login could use one public origin with API traffic under `/api`. Browser-cookie production deployments still needed a concrete HTTPS path because secure cookies require the browser-facing origin to be HTTPS and the API to emit the `Secure` cookie attribute.

### Options Considered

- document only an external TLS/load-balancer requirement
- add a Compose TLS overlay that terminates HTTPS with operator-supplied cert/key files
- build ACME automation, hosted tenant domains, or managed ingress now

### Decision And Rationale

Add `compose.tls.yaml`, `infra/docker/nginx.tls.conf`, and a local certificate helper for self-signed smoke tests. The TLS overlay composes with the base services and `compose.same-origin.yaml`, serves the web UI over HTTPS, routes `/api/*` to the API service, sets `FORGETBASE_SESSION_COOKIE_SECURE=true` for the API service, and expects mounted certificate files at `infra/docker/tls/tls.crt` and `infra/docker/tls/tls.key`.

The helper script creates localhost-only self-signed certs in an ignored runtime directory. Production operators must replace those files with real certificates or terminate TLS at an external edge while still setting secure-cookie mode on the API.

This makes the OSS Docker Compose path independently testable over HTTPS without prematurely taking on certificate lifecycle automation, hosted tenant-domain policy, or Kubernetes ingress design.

### Consequences

- Self-hosted SMB operators have a repeatable same-origin HTTPS deployment example.
- Local TLS smoke tests can run without committing certificate material.
- The API emits `Secure` browser cookies when the TLS overlay is used.
- The HTTP proxy listener remains available for local redirect/testing and must be bound privately or fronted by an edge/firewall if operators do not want plain HTTP exposed.
- This is not ACME automation, managed ingress, hosted tenant-domain isolation, certificate rotation policy, or external secret-manager integration.

### Follow-Ups / Review

Review when adding ACME automation, hosted service domains, Kubernetes/managed-ingress deployment templates, tenant-domain isolation, certificate rotation guidance, or production deployment packaging.

## 0067: Broaden Deterministic PII Redaction Before Full Classification

### Context

Decision 0014 established deterministic redaction before storing retrieval telemetry query text. Managed-query feedback later reused the same redaction posture. The first implementation covered API-key-like secrets, emails, payment-card-like values, and phone-number-like values, but common operator queries and pasted prompts can also include bearer/JWT tokens, OAuth callback parameters, government-ID-like values, and IP addresses.

### Options Considered

- leave the first deterministic rule set unchanged until full PII classification exists
- add model-based or external PII classification now
- broaden the deterministic rule set for high-signal direct identifiers while keeping the current metadata shape

### Decision And Rationale

Broaden the shared deterministic `redactText` rules to cover bearer tokens, JWTs, URL secret parameters such as `code`, `token`, `access_token`, `api_key`, `secret`, and `password`, government-ID-like `000-00-0000` values, and IPv4 addresses. Keep the existing redaction metadata shape with explicit finding kinds and counts, so retrieval telemetry, managed-query feedback, cache bypass, and telemetry summary behavior continue to work without schema changes.

This improves the default privacy posture for SMB self-hosting while keeping the implementation auditable, deterministic, and dependency-free. It avoids pretending the system can classify names, postal addresses, arbitrary national IDs, or context-dependent sensitive text without a richer policy and review workflow.

### Consequences

- Persisted retrieval telemetry queries and managed-query feedback query/notes text redact more direct identifiers by default.
- Provider-routed managed-query cache bypass now applies to the expanded redaction cases because it already checks the shared redaction result.
- Admin-visible redaction metadata may include new finding kinds such as `jwt`, `bearer-token`, `url-secret`, `government-id`, and `ip-address`.
- Deterministic rules can still miss PII, over-redact edge cases, or fail on country-specific identifiers outside the current patterns.
- This is not tenant-configurable redaction policy, model-based PII classification, redacted transcript review, legal hold, or data subject export/delete.

### Follow-Ups / Review

Review when adding tenant-specific rule policy, provider prompt/response transcript storage, redacted transcript review, data subject workflows, country-specific identifier packs, or hosted compliance controls.

## 0068: Add Tenant-Configurable PII Redaction Policy Before Full PII Classification

### Context

Decision 0067 broadened deterministic direct-identifier rules, but the rule set was still hard-coded. The end-to-end goal calls for PII handling to be configurable, and SMB operators need a way to tune stored telemetry/feedback redaction and generated-answer cache bypass without waiting for a full classifier, transcript review workflow, or hosted compliance layer.

### Options Considered

- keep deterministic redaction hard-coded until full PII classification exists
- add model-based or external PII classification now
- add tenant policy for deterministic redaction enablement and active rule kinds

### Decision And Rationale

Add tenant-scoped `pii_redaction_policies` with a safe default: redaction enabled and all deterministic rule kinds active. Admins can read/update the policy through API, SDK, CLI, MCP, and the operational web UI. Retrieval telemetry query storage, managed-query feedback query/notes storage, and provider-routed cache bypass all use the same policy.

This gives operators practical control over false positives, unusual deployments, or tighter rule subsets while keeping the default privacy posture conservative. It is deterministic, auditable, dependency-free, and small enough for the self-hosted SMB core.

### Consequences

- Redaction remains enabled by default for all current deterministic rule kinds.
- Admins can disable redaction or limit active rule kinds, and those changes are audited.
- Generated-answer cache bypass follows the same active PII policy, so cache behavior is consistent with persisted telemetry/feedback redaction.
- Backup/restore verification now includes the policy table.
- Disabling or narrowing redaction can intentionally allow more raw query/feedback text to be stored and cached.
- This is not model-based PII classification, country-specific identifier packs, redacted transcript review, legal hold, or data subject export/delete.

### Follow-Ups / Review

Review when adding richer PII detection, country-specific identifier packs, raw prompt/response transcript retention, redacted transcript review, legal hold, data subject workflows, hosted compliance controls, or external policy engines.

## 0069: Add Signed Webhook Delivery For Rotation Reminders Without A Reminder Lifecycle Table

### Context

Decision 0053 added dry-run-first API-key rotation reminder audit events, and Decision 0054 added audit-event dedupe. That gave self-hosted operators evidence, but they still had to inspect logs or audit events manually. The end-to-end goal calls for external notification delivery, but a full notification lifecycle with preferences, acknowledgements, escalation, retries, and hosted scheduler state is larger than the current SMB core needs.

### Options Considered

- keep reminders audit-only until email/Slack/product notification preferences are designed
- add a full reminder delivery table with retry, acknowledgement, and escalation state now
- add opt-in signed webhook delivery for executed, non-duplicate reminder reports

### Decision And Rationale

Add opt-in webhook delivery to worker API-key rotation reminder maintenance. Dry-runs never deliver. Executed reminder runs write audit evidence first, then POST one reduced tenant reminder payload per non-duplicate report when `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL` or `--notification-webhook-url` is configured.

Payloads include tenant ID, reminder counts, key IDs, key names, owner IDs, scopes, expiry metadata, rotation state, reason, and days until expiry. They intentionally omit raw API-key secrets and secret previews. Operators can set `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET` to add an HMAC SHA-256 signature header over the exact JSON body; the signing secret is read only from process environment, not CLI arguments or database records.

This closes the pragmatic external-notification gap for SMB self-hosting while keeping delivery dependency-free and dry-run-first. It also avoids adding durable delivery state before there are clear requirements for hosted notification UX, acknowledgement, and escalation.

### Consequences

- Operators can route credential-hygiene reminders into existing systems such as Slack bridges, ticketing intake, or monitoring webhooks.
- Dry-run and dedupe semantics stay consistent with audit evidence; duplicate-skipped reports do not re-notify.
- Worker logs include notification delivery counts, but the system does not yet persist webhook delivery receipts or retry state.
- Failed webhook delivery does not roll back the reminder audit event; the failure is logged and counted in the maintenance result.
- This is not email delivery, Slack-native integration, notification preferences, acknowledgement, escalation, retry queues, multi-worker job locking, or a full reminder lifecycle table.

### Follow-Ups / Review

Review when adding hosted operations, per-tenant notification preferences, Slack/email channels, retry queues, acknowledgements, escalation policy, multi-worker job locking, compliance notification exports, or a durable reminders table.

## 0070: Add Tenant Managed-Query Policy Before Full Orchestration

### Context

The project goal calls for an admin-controlled agent query layer that improves factual citation accuracy, policy compliance, consistency, and response effectiveness before full managed orchestration exists. The system already had deterministic retrieval, provider-routed generation, provider fallback, quota preflight, cache controls, prompt/response retention posture, feedback, and deterministic evals. What was missing was a tenant-level policy that could constrain mode selection and prevent provider calls when retrieval quality was too weak.

### Options Considered

- leave mode and provider execution fully request-controlled until the full orchestration layer exists
- build full quality-based routing, retries, LLM-as-judge scoring, and semantic cache acceptance now
- add a small tenant managed-query policy for default mode, allowed modes, minimum citation count, and grounded-context requirements

### Decision And Rationale

Add `managed_query_policies` with defaults that preserve current behavior while adding a citation quality floor: default mode is `deterministic-retrieval`, allowed modes are `deterministic-retrieval` and `provider-routed`, minimum citation count is `1`, and grounded-context enforcement is off by default.

`/agent/query` reads this policy before provider authentication and retrieval execution. Requests for disabled modes are coerced to the tenant default with a warning. Provider-routed execution is skipped when the citation floor or grounded-context requirement is not met, returning deterministic fallback with policy warnings instead of sending low-grounding context to a provider. Admins can read/update the policy through API, SDK, CLI, MCP, and the operational web UI, and changes are audited.

This gives SMB operators immediate control over the most important quality guardrails without pretending the system has full orchestration intelligence, LLM-as-judge scoring, semantic routing, or action execution.

### Consequences

- Provider calls can be blocked by deterministic retrieval quality gates before external execution.
- Public or anonymous requests can be safely coerced away from disabled provider mode instead of failing provider auth when provider-routed mode is not allowed.
- Audit metadata for provider-routed attempts includes safe policy fields and any provider skip reason.
- Clients may receive an effective `mode` different from the requested mode and should inspect warnings.
- Backup/restore verification includes the new policy table.
- This is not quality-based model routing, semantic caching, LLM-as-judge automation, retries, budgets, raw transcript review, or task/action execution.

### Follow-Ups / Review

Review when adding policy-driven provider selection, LLM-as-judge eval automation, semantic cache acceptance, provider retry policy, per-user budgets, action execution, or hosted orchestration controls.

## 0071: Add Deterministic Eval Quality Gates Before Eval Automation

### Context

The product optimizes for factual citation accuracy, policy compliance, task completion quality, consistency, and outcome acceptance. The existing deterministic eval runner could verify groundedness, citation count, and expected stable-ID coverage per case, but operators could not express release gates such as "all policy-compliance evals must pass" or make the CLI fail a quality check without post-processing JSON.

### Options Considered

- keep evals as informational JSON reports until scheduled eval management exists
- build full eval history, dashboards, LLM-as-judge scoring, and provider replay now
- add deterministic overall and tag-level pass-rate thresholds to the existing eval contract

### Decision And Rationale

Add `minimumPassRate` and `tagMinimumPassRates` to `/agent/evals/run`. Eval reports now include the overall pass rate, tag breakdowns, and threshold results. `ok` represents the configured deterministic quality gate: by default it remains strict at 100% pass rate, while operators can deliberately lower an overall gate or require 100% for specific tags such as `citation-accuracy`, `policy-compliance`, or `task-completion-quality`.

The CLI exposes the same controls and can return a non-zero exit code with `--fail-on-threshold true`, which makes the demo corpus usable as a practical quality gate in CI or release checks without adding a new persistence model. MCP and the web demo eval runner use the same contract.

This gives self-hosted teams an immediate quality-control loop over the agent-native corpus while keeping semantic judging, scheduled eval history, and provider replay as future orchestration work.

### Consequences

- Demo evals can now gate citation accuracy, policy compliance, and task-completion tags deterministically.
- CLI users can fail automation when thresholds are missed without writing custom JSON parsing.
- Eval reports are larger because they include pass-rate and tag-threshold metadata.
- Missing threshold tags fail explicitly with a "No eval cases matched this threshold" reason.
- This is not LLM-as-judge scoring, semantic answer-quality scoring, scheduled eval history, eval dashboards, provider transcript replay, or hosted eval management.

### Follow-Ups / Review

Review when adding eval run persistence, scheduled eval jobs, semantic/LLM-as-judge scoring, provider replay, quality dashboards, release-gate CI workflow wiring, or eval-driven provider/cache policy.

## 0072: Add Disabled-By-Default Action Execution Foundation Before External Adapters

### Context

The end-to-end goal requires the CMS to act as an agent-native instruction and operations layer, not only a human-readable knowledge base. Agents eventually need controlled task execution through APIs, CLI, MCP, and harnesses. The system already had permission-filtered retrieval, managed query, provider routing, caching, feedback, eval gates, and tenant policies. What was still missing was a governed action-request lifecycle that could prove admin controls, audit evidence, and default-deny behavior before introducing side-effecting adapters.

### Options Considered

- leave all action execution future until full orchestration exists
- add direct external action execution now for HTTP, MCP, Git, documents, and local commands
- add a disabled-by-default action policy and durable request/decision lifecycle, with only a side-effect-free internal action executable

### Decision And Rationale

Add `action_execution_policies` and `agent_action_requests`. Tenant policy defaults to disabled, no allowed action types, approval required, dry-run default enabled, and kill switch off. Authenticated callers can submit action requests, but every request is evaluated against policy and persisted as blocked, dry-run, approval-required, or executed. Admins can read/update policy, list action requests, and approve or deny approval-required requests through API, SDK, CLI, MCP, and the operational web UI. Policy changes, action requests, and decisions are audited.

Only `create-task-record` can execute today, and it records an internal task marker result with `externalSideEffects: false`. External action types are schema-supported for policy planning, but approving them does not run external side effects until dedicated adapters, sandboxing, scopes, and multi-step approvals exist.

This gives SMB operators a real governance foundation and gives agent harnesses a current action-request interface without implying the system is ready to mutate external systems safely.

### Consequences

- Action execution remains off unless an admin explicitly enables policy and allowed action types.
- Blocked action attempts are still durable records and audit evidence.
- Approval workflow is intentionally single-step and admin-only for now.
- The first executable action is side-effect-free outside ForgetBase.
- External adapters for HTTP, MCP tools, Git repositories, document connectors, and local commands remain future work.
- Backup/restore verification includes the new policy and request tables.

### Follow-Ups / Review

Review when adding action scopes, multi-step approval workflows, adapter sandboxing, dry-run previews, idempotency keys, external connector credentials, execution queues, retry policy, notification routing, or hosted orchestration controls.

## 0073: Invalidate Tenant Generated-Answer Cache On Governed Source Changes

### Context

Provider-routed managed query can cache generated answers behind permission-scoped, context-hashed cache keys. The context hash prevents many stale hits after retrieval context changes, but the Phase 7 exit criteria require cached answers to invalidate when source assets change. Operators also need audit evidence that content mutations clear generated-answer cache state rather than relying only on cache-key drift.

### Options Considered

- rely only on context-hash changes and TTL expiry
- track exact cache-entry dependencies by asset, version, and chunk
- invalidate all generated-answer cache entries for the tenant after governed asset source mutations

### Decision And Rationale

Add `invalidateTenant` to the managed-query cache repository. Successful asset create, content update, review-complete, publish, and restore operations now reindex retrieval chunks, then delete all generated-answer cache entries for the affected tenant. Asset audit metadata records `managedQueryCacheInvalidatedCount`.

Tenant-wide invalidation is conservative and simple. It favors correctness, citation accuracy, and policy compliance over cache hit rate, which matches the product priority for SMB operators. It avoids building a dependency graph before the cache volume, hosted analytics model, and semantic-cache requirements are clear.

### Consequences

- Generated answers are not reused after governed source content or visibility changes inside a tenant.
- Source mutation audit events show how many generated-answer cache rows were invalidated.
- Cache hit rate may drop after broad content updates because the invalidation is tenant-wide.
- The repository exposes dry-run support for invalidation, but asset mutations execute invalidation immediately.
- This is not fine-grained asset/chunk cache dependency tracking, semantic cache invalidation, legal hold, or cache replay/debug tooling.

### Follow-Ups / Review

Review when adding high-volume hosted tenants, semantic caching, exact cache dependency indexes, cache answer review, eval-driven cache acceptance, or per-asset invalidation controls.

## 0074: Gate Docker Compose API And Worker Startup On A One-Shot Migration Service

### Context

The first production-release goal requires Docker Compose deployment to work on a clean machine and migrations to be repeatable. The project already had an explicit `pnpm db:migrate` command, but the base Compose topology only waited for Postgres health before starting API and worker processes. On a fresh database, that left an avoidable startup race where application services could query tables before migrations had created them.

### Options Considered

- keep migrations as a manual operator step before every first deploy and update
- run migrations inside API and worker process startup
- add a one-shot Compose `migrate` service and make API/worker depend on successful completion

### Decision And Rationale

Add a `migrate` service to `compose.yaml` using the same Node workspace image and `pnpm db:migrate`. The service waits for healthy Postgres, runs all unapplied SQL migrations, exits with `restart: "no"`, and gates API/worker startup through `service_completed_successfully`. The migration runner remains idempotent through `schema_migrations`.

This keeps database schema changes explicit and observable without coupling migration side effects to every API or worker process start. It also makes the normal self-hosted Compose path safer for clean installs and updates while preserving the manual migration command for local host-run API/worker workflows.

### Consequences

- `docker compose up -d postgres migrate api worker web` is now the documented base startup path.
- `docker compose up -d postgres api worker web` also starts the migration dependency unless operators use `--no-deps`.
- API and worker containers do not start until migrations complete successfully.
- A failed migration leaves API/worker stopped rather than running against a partial or missing schema.
- Host ports are configurable with `FORGETBASE_POSTGRES_PORT`, `FORGETBASE_API_PORT`, and `FORGETBASE_WEB_PORT` so clean-start verification can run beside another local stack.
- This does not replace managed migration orchestration for hosted deployments, blue/green releases, online migration safety, backup-before-migration policy, or Kubernetes jobs.

### Follow-Ups / Review

Review when adding hosted deployment automation, Kubernetes manifests, online/expand-contract migration policy, pre-migration backups, release channels, or multi-instance API/worker rollouts.

## 0075: Add Bounded Provider Retries To Provider-Routed Managed Query

### Context

Provider-routed managed query already uses permission-filtered retrieval, quota preflight, provider readiness checks, deterministic fallback, and priority-ordered fallback across enabled providers when no provider is pinned. A single transient provider failure, timeout, or empty response still caused immediate failure for that provider. For SMB operators, this weakens response/action effectiveness and creates avoidable deterministic fallbacks even when a short retry would likely recover.

### Options Considered

- keep provider execution single-attempt and rely only on priority fallback or deterministic fallback
- add a global retry policy for all tenants and providers
- add bounded retry controls to model provider config metadata
- build provider-specific retry taxonomies for HTTP status codes, rate limits, and provider error bodies now

### Decision And Rationale

Add bounded retry controls to model provider config metadata: `maxRetries` and `retryBackoffMs`. Defaults remain conservative with zero retries unless an admin opts in. Runtime clamps retries to `0..3` and backoff to `0..10000` milliseconds. Failed provider calls and empty responses are recorded as failed generation attempts, retried within the same provider, and then either complete, move to the next provider when no provider was pinned, or fall back deterministically.

This improves reliability without introducing a new policy table or pretending we have mature provider-specific retry semantics. It also keeps audit metadata useful: every retry appears in the existing generation attempt list without storing prompts, provider request bodies, or secrets.

### Consequences

- Provider retries are opt-in per provider config and disabled by default.
- Retry attempt history is visible in managed-query responses and `agent.query.generate` audit metadata.
- A pinned provider uses its own retry budget before deterministic fallback.
- Unpinned provider routing uses each provider's retry budget before trying the next enabled provider.
- Retry configuration is available through API, CLI, MCP metadata, and web provider controls.
- This is not provider-specific HTTP status retry classification, adaptive backoff, circuit breaking, budget-aware retry suppression, queue-based replay, hosted provider health scoring, or quality-based routing.

### Follow-Ups / Review

Review when adding provider-specific error taxonomies, retry-after handling, circuit breakers, tenant/provider budgets, hosted routing analytics, LLM-as-judge replay, or quality-based model routing policy.

## 0076: Persist Deterministic Managed Query Eval Run History

### Context

Deterministic managed-query evals can gate citation accuracy, policy compliance, task-completion quality, and other operator-defined tags. Before this decision, `/agent/evals/run` returned a structured report and wrote audit evidence, but there was no first-class run-history surface for admins, CLI checks, MCP clients, or future quality analytics.

### Options Considered

- keep eval reports ephemeral and rely only on audit metadata
- store full raw eval transcripts, provider prompts, and generated outputs for debugging
- persist structured eval run reports with normalized summary fields and no raw provider transcript storage

### Decision And Rationale

Add `managed_query_eval_runs` with tenant, actor references, summary fields, the structured deterministic eval report JSON, safe metadata, and creation time. `/agent/evals/run` continues returning the same report while recording a run when the repository is available, and `/agent/evals/runs` lists recent tenant runs for admins. SDK, CLI, MCP, OpenAPI, the operational web UI, repository tests, and backup/restore verification expose the same history.

This keeps quality-gate evidence queryable without turning evals into a raw transcript store. Summary columns make common reporting cheap, while the report JSON preserves case-level pass/fail, citations counts, expected stable-ID coverage, tag thresholds, and warnings for later analytics.

### Consequences

- Eval runs have durable history beyond audit events.
- Audit metadata links `agent.eval.run` events to the stored eval run ID when persistence is available.
- Backup/restore verification includes the new eval-run table.
- The stored report includes stable IDs and case-level quality fields, so operators should treat it as operational quality data and apply tenant/admin access controls. Stored eval case query text is redacted by the tenant PII policy as of decision 0078.
- This is not LLM-as-judge automation, raw prompt/response retention, provider transcript review, long-range analytics warehousing, semantic eval scoring, or hosted quality-routing policy.

### Follow-Ups / Review

Review when adding LLM-as-judge evals, provider-routed eval replay, quality-based model routing, prompt/response retention review, hosted analytics retention, or semantic retrieval benchmarks.

## 0077: Expose Transparent Weighted Lexical Retrieval Ranking

### Context

The retrieval layer already stores vector-ready chunks, but the implemented search path is still Postgres full-text search. The product needs stronger search foundations for agents before adding provider embeddings or a separate search service. Operators and agent clients also need to understand why a chunk was selected, especially when managed-query answers depend on the returned context.

### Options Considered

- keep returning only a single opaque numeric rank
- add provider embeddings and semantic search immediately
- introduce a separate search service now
- expose a stable weighted lexical ranking breakdown while preserving the current Postgres retrieval path

### Decision And Rationale

Add `ranking` metadata to every search result using strategy `lexical-weighted-v1`. The final rank is computed from the Postgres lexical rank, a source-kind weight, and an exact-phrase boost. Agent-instruction chunks receive a small source-kind bias over asset summaries and human documents when lexical relevance is otherwise similar. Retrieval telemetry records the ranking strategy and top candidate/allowed scores.

This improves ranking transparency and nudges the system toward agent-first content without requiring model-provider embeddings, extra services, or new tenant policy. It also creates a contract where future semantic or hybrid scores can be added deliberately instead of replacing an opaque number.

### Consequences

- Search, managed query, evals, CLI, MCP, SDK, and web responses now include ranking breakdowns through the shared search result contract.
- Agent-instruction chunks are preferred over equal human-document matches, matching the agent-native product direction.
- Retrieval telemetry contains safe ranking summary metadata.
- The current strategy remains lexical and self-hostable.
- This is not embedding generation, semantic vector retrieval, cross-encoder reranking, query expansion, search-service federation, admin-tunable ranking policy, or eval-driven ranking optimization.

### Follow-Ups / Review

Review when adding embedding generation, hybrid lexical/vector scoring, semantic cache policy, retrieval-quality evals, admin ranking controls, per-tenant search profiles, cross-encoder reranking, or a hosted search service.

## 0078: Redact Stored Deterministic Eval Run Queries

### Context

Decision 0076 added durable deterministic managed-query eval run history. The live `/agent/evals/run` response needs to echo submitted eval case queries so callers can correlate the report with their own request. Persisted run history has a different risk profile: eval cases can contain pasted user prompts, direct identifiers, or operational details that should not be stored raw when the tenant PII policy would redact the same text in telemetry or feedback.

### Options Considered

- keep stored eval reports identical to live responses
- stop storing case-level eval report details
- apply the tenant PII redaction policy only to stored eval report query text
- add a separate eval-specific redaction policy now

### Decision And Rationale

Apply the existing tenant PII redaction policy to eval case query text before persisting `managed_query_eval_runs.report`. Keep the live eval response unchanged. Store compact `evalReportRedaction` metadata with whether redaction applied, aggregate finding kinds/counts, and query count.

This keeps eval run history useful for quality analytics while making its stored query-text posture consistent with retrieval telemetry, managed-query feedback, and generated-answer cache bypass. Reusing the tenant policy avoids a second control surface before there is evidence that evals need a distinct redaction policy.

### Consequences

- `/agent/evals/run` responses still include the submitted eval queries.
- `/agent/evals/runs` returns stored reports whose result query fields have been redacted according to the tenant policy active at run time.
- Eval-run metadata records redaction application without storing raw matched values.
- Admins can intentionally disable or narrow eval-run query redaction by changing the same PII policy used for telemetry and feedback.
- This is not full PII classification, raw transcript review, field-level legal hold, data subject export/delete, or an eval-specific redaction policy.

### Follow-Ups / Review

Review when adding model-based PII classification, eval case management UI, provider-routed eval replay, LLM-as-judge scoring, hosted analytics retention, or data subject workflows.

## 0079: Summarize Eval Run Trends Without a Warehouse

### Context

Deterministic eval run history now stores quality-gate evidence with redacted case queries. Admins can list individual runs, but they still need a quick operational answer to whether recent runs are passing, which tags are weak, and whether threshold gates are consistently holding. The current product does not yet need a long-range analytics warehouse, scheduled eval jobs, or LLM-as-judge replay to answer those near-term questions.

### Options Considered

- keep only raw eval-run listing and require users to post-process JSON
- build a separate eval analytics table now
- add a read-only summary over recent `managed_query_eval_runs`
- wait for hosted analytics and quality-based routing policy

### Decision And Rationale

Add `/agent/evals/summary` plus SDK, CLI, MCP, OpenAPI, and web UI support. The summary reads recent persisted eval runs, applies optional `since`, `until`, and `limit` filters, and returns latest pass rate, average pass rate, threshold pass/fail counts, total case counts, mode counts, tag aggregates, and compact recent run cards.

This gives SMB admins immediate quality trend visibility while preserving the existing eval-run table as the source of truth. It avoids introducing a second persistence path before scheduled eval management, hosted analytics retention, or quality-based model routing exist.

### Consequences

- Admins can inspect recent eval trends through API, SDK, CLI, MCP, and the operational web UI.
- Summary results are bounded by the requested recent-run limit and are not a complete historical warehouse.
- Tag aggregates use the stored deterministic report fields and inherit the stored report's PII redaction posture.
- The summary can later feed release dashboards or quality-based routing, but it does not itself select models or execute eval schedules.
- This is not LLM-as-judge scoring, provider-routed eval replay, semantic eval scoring, scheduled eval management, alerting, hosted analytics retention, or long-range warehouse reporting.

### Follow-Ups / Review

Review when adding scheduled eval runs, LLM-as-judge scoring, provider-routed eval replay, quality-based model routing, alerting, hosted analytics retention, or tenant export/delete workflows.

## 0080: Require Dedicated Action Execution Scope

### Context

Decision 0063 added disabled-by-default tenant action execution policy, durable action requests, admin approval/denial, and a side-effect-free internal `create-task-record` action. That protected action behavior with tenant policy, but `/agent/actions/execute` still accepted any authenticated principal before evaluating policy. ForgetBase needs least-privilege automation credentials that can request governed tasks without granting full admin access.

### Options Considered

- keep action requests available to any authenticated principal
- require only admin keys for all action requests
- add a dedicated action-request scope while keeping admin as a wildcard
- wait for full orchestration, sandboxing, and external connectors before narrowing access

### Decision And Rationale

Add `agent:execute` as a first-class API-key scope. `/agent/actions/execute` now requires `admin` or `agent:execute` before parsing and storing an action request. Unscoped authenticated principals receive `access_denied`, and the denied attempt is audited without creating an action request. Admin remains a wildcard for existing operator workflows. API, SDK schema, CLI, MCP, and web key-creation surfaces can issue the scope.

This is the smallest least-privilege boundary needed before external action adapters exist. It lets teams create task-execution service accounts without handing those agents tenant administration privileges, while preserving the existing tenant policy, approval, dry-run, and kill-switch gates.

### Consequences

- Service accounts and users can be granted action-request capability independently from content read/write or admin permissions.
- Existing admin keys continue to work because `admin` is still treated as a wildcard scope.
- Unscoped authenticated attempts are auditable but do not pollute durable action-request history.
- Tenant action policy and approval requirements still decide whether scoped requests are blocked, dry-run, approval-required, or executed.
- This is not external action adapter sandboxing, connector credential management, multi-step approvals, per-action execution scopes, action budget policy, or full orchestration authorization.

### Follow-Ups / Review

Review when adding external side-effecting action adapters, connector credential vaulting, multi-step approval chains, per-action scopes, user delegation, policy-based budgets, or hosted orchestration controls.

## 0081: Schedule Deterministic Eval Runs Through Worker Policy

### Context

ForgetBase now has deterministic eval cases, persisted run history, redacted stored eval reports, and recent-run analytics. The product priorities put factual citation accuracy, policy compliance, task completion quality, consistency, and response/action effectiveness ahead of cost and convenience. Manual eval runs are useful, but they do not give SMB operators a repeatable maintenance loop before full managed orchestration exists.

### Options Considered

- keep deterministic evals manual until the hosted orchestration layer exists
- run evals from an external cron that calls `/agent/evals/run` with an admin API key
- add an admin schedule policy with inline deterministic eval input and an opt-in worker executor
- build a full eval-case asset manager, alerting system, and LLM-as-judge service now

### Decision And Rationale

Add `managed_query_eval_schedule_policies` as a tenant-scoped admin policy with disabled-by-default scheduling, interval minutes, inline deterministic eval input, last-run fields, status, error, and update actor references. Expose the policy through API, SDK, CLI, MCP, and a compact operational web control.

The worker can preview due policies or execute them through `--managed-query-evals-once --execute`; long-running scheduling is opt-in through `FORGETBASE_MANAGED_QUERY_EVALS_ENABLED=true` and remains dry-run by default. Execution searches the tenant retrieval corpus as system maintenance, records scheduled retrieval telemetry, persists redacted eval-run history, updates schedule status, and writes safe audit metadata without raw query text.

This avoids storing a standing admin API key for cron, gives operators repeatable quality evidence, and keeps orchestration simple enough for the current self-hosted SMB target. It also creates the quality-control hook future routing and cache policy can read without needing LLM-as-judge automation today.

### Consequences

- Admins can schedule the same deterministic quality gates used by CLI and CI.
- Schedule policy stores replayable eval input inline, including raw eval case query text. Operators should use sanitized synthetic or approved prompts.
- Stored eval-run reports still redact query text with the tenant PII policy active at run time.
- Scheduled-run audit metadata stores counts, thresholds, status, and eval-run IDs, not raw queries.
- The worker does not need a human admin API key to execute due schedules.
- The first implementation does not include distributed job locks, alert delivery, eval-case asset lifecycle management, provider-routed eval replay, or LLM-as-judge scoring.

### Follow-Ups / Review

Review when adding multi-worker deployments, hosted alerting, eval-case authoring workflows, LLM-as-judge scoring, provider replay, quality-based model routing, release dashboards, or tenant export/delete workflows for eval policy data.

## 0082: Serialize SQL Migrations With a Postgres Advisory Lock

### Context

Docker Compose uses a one-shot `migrate` service to gate API and worker startup, but host-run workers, tests, and maintenance commands can still call `runMigrations` directly. During verification, a clean temporary database run exposed a race where two test files started migrations at the same time and both attempted catalog-changing SQL, causing a duplicate Postgres type error.

### Options Considered

- rely only on the Compose migration gate
- make every migration file fully race-tolerant
- require tests and host-run commands to pre-run migrations serially
- hold a Postgres advisory lock for the migration runner

### Decision And Rationale

`runMigrations` now takes one database connection, acquires a session-level Postgres advisory lock, creates `schema_migrations`, checks each file, applies unapplied SQL inside transactions, records the migration ID, and releases the lock when the full pass completes.

This keeps SQL migrations explicit while making direct runner use safer in tests, local host workflows, worker maintenance commands, and future multi-process starts. It also avoids forcing every migration to be rewritten around Postgres catalog race edge cases.

### Consequences

- Concurrent migration runners wait instead of racing on empty-database catalog changes.
- A second runner skips files applied by the first runner after the lock is released.
- Compose remains simpler because the one-shot migration gate is still the normal production path.
- Migration lock scope is database-local and does not coordinate across different databases.
- This is not a full online migration framework, expand-contract policy, or distributed deploy lock manager.

### Follow-Ups / Review

Review when adding zero-downtime hosted migrations, multi-instance rollout orchestration, Kubernetes jobs, online backfills, or tenant-by-tenant migration controls.

## 0083: Rate-Limit Scoped Action Requests Before Durable Storage

### Context

The architecture and security model require action execution controls to include rate limits. Decision 0080 added least-privilege `agent:execute` credentials, and the action execution foundation already had tenant policy, approval, dry-run mode, audit evidence, and a kill switch. The remaining gap was a flood guard for scoped agents before external side-effecting adapters exist.

### Options Considered

- defer rate limits until external action adapters are implemented
- store over-limit requests as durable blocked action requests
- add a tenant-wide hourly request cap before durable request storage
- add per-principal, per-action-type, and budget-aware policy now

### Decision And Rationale

Add `maxRequestsPerHour` to tenant action execution policy, defaulting to 60 and bounded from 1 to 10000. `/agent/actions/execute` now checks the tenant's one-hour recent request count after authentication/scope validation and policy read, but before durable action request creation. Over-limit requests return `429 action_rate_limit_exceeded` and write a denied `agent.action.execute_request` audit event with safe count/window metadata; no action request row is created.

Expose the setting through API schema, OpenAPI response documentation, SDK/DB schema, CLI, MCP, and the operational web UI.

This protects the approval queue and action request table with a small deterministic control that matches the current SMB self-hosted target. It avoids prematurely building a full hosted budget/routing policy engine before there are external action adapters or enough usage data to justify finer-grained budgets.

### Consequences

- Scoped action credentials cannot flood durable action request history beyond the tenant hourly cap.
- Rate-limit denials remain auditable without creating queue entries that admins would need to triage.
- The cap is tenant-wide, not per principal, group, action type, surface, or provider route.
- Enforcement uses repository-backed recent request counts, not a distributed token bucket or cross-region rate-limit service.
- Admins can tune the cap, but richer budget policy and quality-aware orchestration remain separate future work.

### Follow-Ups / Review

Review when adding external side-effecting action adapters, connector-specific execution budgets, per-principal automation limits, multi-worker hosted deployments, burst semantics, notification/approval queues, or full quality/cost/action outcome orchestration.

## 0084: Make Lexical Retrieval Ranking Tenant-Tunable

### Context

Decision 0076 made search ranking transparent with `lexical-weighted-v1`, but the source-kind weights and exact-phrase boost were static. Phase 4 still needed an admin ranking policy so agent-first teams can tune instruction-versus-human-content precedence before embeddings, semantic reranking, or quality-based orchestration are available.

### Options Considered

- keep weights static until embeddings and semantic retrieval exist
- let clients pass per-request ranking weights
- add a tenant admin ranking policy for the existing lexical formula
- build semantic, hybrid, or eval-optimized ranking now

### Decision And Rationale

Add tenant-scoped `retrieval_ranking_policies` with defaults matching the prior static behavior: agent-instruction weight `1.2`, asset-summary weight `1.1`, human-document weight `1.0`, and exact-phrase boost `0.25`. Retrieval repositories read the tenant policy during search and continue returning the same transparent `lexical-weighted-v1` metadata shape.

Expose the policy through API, SDK, CLI, MCP, OpenAPI, and the operational web UI. Updates are admin-only, audited, actor-attributed, and included in backup/restore verification. Clients cannot pass per-request weights because ranking policy should remain an operator-governed tenant control rather than an untrusted request knob.

This gives SMB operators a practical tuning surface for agent-native instruction repositories while preserving the current self-hosted Postgres full-text path and avoiding premature orchestration complexity.

### Consequences

- Admins can tune instruction, summary, human-document, and exact-phrase weighting without changing application code.
- Default behavior remains compatible with the previous static lexical ranking.
- Search clients see the same `lexical-weighted-v1` ranking metadata and do not need a new result contract.
- Ranking updates are auditable configuration changes and survive backup/restore.
- This is not vector embedding generation, semantic retrieval, cross-encoder reranking, query expansion, search-service federation, per-request ranking overrides, eval-driven auto-tuning, or quality-based model orchestration.

### Follow-Ups / Review

Review when adding embedding generation, hybrid/vector search, retrieval eval optimization, semantic reranking, query expansion, hosted analytics-driven tuning, or full managed orchestration policy.

## 0085: Deduplicate Retried Action Requests With Scoped Idempotency Keys

### Context

Action execution now has disabled-by-default tenant policy, a dedicated `agent:execute` scope, approval and denial audit evidence, and tenant hourly request caps. Before external side-effecting adapters exist, agent harnesses still need a retry-safe request contract. Without idempotency, a client retry after a timeout can create duplicate durable action requests, consume the tenant hourly cap again, and eventually create duplicate external side effects once adapters are added.

### Options Considered

- require clients to avoid retries for action requests
- dedupe by comparing request payloads
- add optional scoped idempotency keys to `/agent/actions/execute`
- wait until external action adapters exist

### Decision And Rationale

Add optional `idempotencyKey` to action execution requests. The key is bounded to 200 characters, stored on `agent_action_requests`, and uniquely scoped by tenant plus requesting user or service account. `/agent/actions/execute` checks for an existing request with the same scoped key after authentication/scope validation but before rate-limit counting and policy evaluation. A replay returns the original action request with HTTP `200`, does not create a duplicate durable request, and does not consume the hourly cap again.

Replay audit evidence uses reason `action_request_idempotent_replay` and stores a SHA-256 hash of the key rather than the raw key. New action request audit metadata also stores only the hash when a key is present. CLI, MCP, OpenAPI, SDK schema parsing, and the operational web UI expose the key.

This gives agent harnesses a production-shaped retry contract now while the only executable action remains side-effect-free. It also keeps future external adapters from inheriting an unsafe duplicate-request behavior.

### Consequences

- Agent clients can safely retry action submissions with a stable key.
- Duplicate retries return the first stored request, including its original status and policy snapshot.
- Replays do not consume the tenant hourly action request cap.
- Idempotency is scoped to the requester identity, reducing accidental cross-client request disclosure.
- Raw idempotency keys are stored in the action request row because they are part of the request contract; audit metadata uses only hashes.
- This is not distributed exactly-once execution, external adapter idempotency propagation, execution queue dedupe, multi-step approval, connector credential governance, or side-effect rollback.

### Follow-Ups / Review

Review when adding external side-effecting action adapters, connector-specific idempotency propagation, execution queues, retries, rollback/compensation, per-action approval chains, or hosted orchestration controls.

## 0086: Expire Pending Action Approvals Before Execution

### Context

Action execution now has disabled-by-default tenant policy, `agent:execute` scoped request credentials, tenant hourly request caps, scoped idempotency keys, durable requests, and admin approval/denial. The next risk before external side-effecting adapters is stale human approval: a pending action could be approved much later, after source context, user intent, policy, or operational conditions have changed.

### Options Considered

- leave pending action requests valid indefinitely
- require admins to manually deny stale requests
- add a configurable approval-expiry window enforced on approval attempts
- add a full approval workflow engine with background expiry, assignments, and notifications now

### Decision And Rationale

Add `approvalExpiresInMinutes` to tenant action execution policy, defaulting to 1440 minutes and bounded from 1 to 10080. New `approval-required` action requests store a computed `approvalExpiresAt` deadline based on the active policy snapshot. `/agent/actions/{actionRequestId}/decision` allows denial of pending requests, but approval after `approvalExpiresAt` marks the request `expired`, returns `409 action_request_approval_expired`, records denied audit evidence with the deadline, and does not execute the action.

Expose the policy and deadline through API schema, DB repositories, OpenAPI, SDK parsing, CLI, MCP, and the operational web UI. Existing pending requests are backfilled to expire 1440 minutes after creation during migration.

This closes the immediate stale-approval execution gap without introducing an approval workflow engine before external adapters, notifications, assignments, or connector credentials exist.

### Consequences

- Pending action approvals have a deterministic execution deadline.
- Stale approval attempts are auditable and leave the durable request in `expired` status.
- Denial remains available for pending requests because denial creates no side effects.
- Expiry is enforced when an approval decision is attempted; there is no background job that proactively marks all old pending requests expired.
- The expiry window is tenant-wide, not per action type, actor, sensitivity, group, or connector.
- This is not multi-step approval, assigned reviewers, notification routing, sandbox execution, connector credential policy, external side-effect rollback, or hosted orchestration.

### Follow-Ups / Review

Review when adding external side-effecting action adapters, per-action approval chains, notification routing, approval assignments, background expiry maintenance, connector sandboxing, or hosted orchestration controls.

## 0087: Run Action Approval Expiry As Dry-Run-First Worker Maintenance

### Context

Decision 0086 added `approvalExpiresAt` to approval-required action requests and blocks stale approval attempts. That protects the execution path, but stale requests can remain in the approval queue until an admin tries to approve them. Before external side-effecting adapters exist, the system should keep the durable queue accurate without requiring manual clicks or introducing a workflow engine.

### Options Considered

- leave expired approvals visible until a human attempts approval
- mark expired approvals synchronously on every list request
- add dry-run-first worker maintenance for expired approvals
- build notification routing, assignments, and multi-step approval workflows now

### Decision And Rationale

Add repository support for listing `approval-required` action requests whose `approvalExpiresAt` is in the past, and add worker maintenance exposed as `--action-approval-expiry-once`. The job defaults to dry-run, reports tenant/candidate/expired counts, and accepts `--execute` to mark stale requests `expired`. Executed runs record `agent.action.approval_expiry` audit evidence with action type, expiry deadline, execution timestamp, and `externalSideEffects: false`.

The long-running worker can schedule the same job through `FORGETBASE_ACTION_APPROVAL_EXPIRY_ENABLED=true`; Compose defaults keep scheduling disabled and dry-run enabled. `FORGETBASE_ACTION_APPROVAL_EXPIRY_LIMIT` bounds each pass.

This keeps approval queues operationally accurate while preserving the project's dry-run-first maintenance posture. It avoids hiding mutations behind read paths and avoids notification/workflow complexity before external adapters exist.

### Consequences

- Operators can preview stale approval counts before mutating request state.
- Executed maintenance closes stale pending requests without executing actions.
- Expiry evidence is auditable separately from human approve/deny decisions.
- The job is bounded by a simple limit and does not implement retries, distributed locks, assignment queues, or notification delivery.
- This is not multi-step approval, escalation, external side-effect rollback, connector sandboxing, or hosted workflow orchestration.

### Follow-Ups / Review

Review when adding notification routing, assigned approvers, multi-step approval chains, distributed worker coordination, external action adapters, connector sandboxing, or hosted orchestration controls.

## 0088: Broaden API-Key Redaction To Common Provider And Integration Tokens

### Context

The default tenant PII redaction policy already applies before stored retrieval telemetry, managed-query feedback text, stored eval-run report queries, and generated-answer cache-bypass decisions. It treats `api-key` as one deterministic rule kind, but the first rule focused on OpenAI-style `sk-` values and ForgetBase API keys. In practice, agent operators often paste cloud access key IDs, GitHub tokens, Google API keys, and chat-ops tokens into prompts, bug reports, or retrieval queries while debugging tool access.

### Options Considered

- leave non-OpenAI token prefixes to future model-based classification
- add separate rule kinds for every provider or integration token family
- broaden the existing `api-key` rule with high-signal token prefixes
- redact any long alphanumeric token-looking string

### Decision And Rationale

Broaden the existing `api-key` deterministic rule to cover common high-signal provider, cloud, repository, and chat-ops token prefixes: OpenAI/Anthropic/OpenRouter-style `sk-`, ForgetBase `fbase_`, GitHub classic and fine-grained tokens, Google API keys, AWS access key IDs, and Slack token prefixes.

Keep these under the existing `api-key` rule kind instead of adding many new enum values. Admins already understand `api-key` as a secret-token category, and existing tenant policies continue to work without schema, API, MCP, CLI, or web control churn.

Do not add broad "any long token" redaction because false positives would harm operational telemetry and make it harder to debug search behavior.

### Consequences

- Stored telemetry and feedback now redact more common pasted integration tokens by default.
- Redaction metadata remains compact with `kind: "api-key"` rather than provider-specific labels.
- Existing policies that disable `api-key` still intentionally allow these token shapes through.
- This is deterministic token-prefix matching, not full secret scanning, country-specific PII classification, or model-based sensitive-data detection.

### Follow-Ups / Review

Review when adding country-specific identifier packs, user-configurable regex rules, redacted transcript review, model-based classification, or hosted data-loss-prevention integrations.

## 0089: Redact Action Request Payloads Before Durable Storage

### Context

The action execution foundation stores durable action requests so admins can inspect, approve, deny, retry, and audit agent-initiated work. At this stage only the internal `create-task-record` action can execute without external side effects, but request payloads and metadata may already contain pasted tool arguments, URLs, callback codes, repository tokens, or provider keys while operators experiment with agent harnesses.

Decision 0088 broadened deterministic secret-token redaction for telemetry and feedback, but action request payloads are not telemetry. Leaving them unredacted would create a parallel durable store where accidental secrets could persist.

### Options Considered

- leave action request payloads raw until external adapters exist
- reject any action request whose payload matches the PII redaction policy
- redact action request payload and metadata string fields before durable storage
- add connector-specific secret vaulting and credential references now

### Decision And Rationale

Apply the active tenant PII redaction policy to string values in action request `payload` and `metadata` before creating the durable action request. Store the redacted JSON in the action request row and add compact `actionRequestRedaction` metadata when redaction occurred, including aggregate finding kinds/counts, redacted string count, and source counts for payload versus metadata. Include the same safe summary in request audit metadata.

This keeps action inspection useful while reducing accidental secret persistence. It also keeps the same admin-controlled rule policy used by retrieval telemetry, feedback, eval report queries, and cache bypass decisions.

Do not reject matching requests by default because the current action foundation is still disabled-by-default, approval-gated, and mostly used for dry-run/admin review. Rejection can become an admin policy later when external side-effecting adapters and connector credential governance exist.

### Consequences

- Stored action requests and action-list responses no longer expose common secret-token shapes submitted in payload or metadata string fields.
- Admins still see that redaction occurred and which configured rule kinds matched.
- Policies that disable a rule kind intentionally stop redacting that kind in action requests too.
- This is storage redaction, not execution-time credential handling, connector secret vaulting, payload schema validation, sandboxing, or side-effect rollback.

### Follow-Ups / Review

Review when adding external action adapters, connector credential references, per-action payload schemas, rejection policies for sensitive payloads, redacted transcript review, sandbox execution, or hosted data-loss-prevention integrations.

## 0090: Use Railway For Private Alpha Deployment Preparation

### Context

The project needs a private hosted target while UI improvements continue, but it should not be publicly accessible yet. The existing OSS deployment baseline is Docker Compose with Postgres, API, worker, web, and same-origin proxy overlays. The app requires Postgres with the `vector` extension available for migrations.

### Options Considered

- keep deployment local-only until public alpha
- use Railway as a private container PaaS staging target
- use Render for the first private hosted target
- use Vercel with separate managed services
- use a VPS/Coolify-style Compose host

### Decision And Rationale

Use Railway for the first private alpha deployment preparation. Create a private Railway project with `pgvector`, `api`, `worker`, and `web` services, but do not configure public domains. Run `pgvector/pgvector:pg17` with a persistent Railway volume and set `PGDATA` to a subdirectory inside the volume so Postgres does not initialize directly in the mount root.

Keep app services source-disconnected until the Railway-specific Dockerfiles are committed or a deliberate local `railway up` deployment is requested. This avoids deploying stale GitHub code while still preparing the service and variable layout.

### Consequences

- The private alpha target can validate the container/PaaS path without exposing a public URL.
- Railway private networking is the intended service-to-service path for `DATABASE_URL`.
- App services are ready for local or GitHub-triggered deployment after the deployment Dockerfiles are in the chosen branch.
- Public exposure still requires a separate approval step to add a same-origin proxy or public domain, configure HTTPS, set secure-cookie mode, and run leakage checks.
- Railway is the private alpha target, not yet the committed long-term hosted-service architecture.

### Follow-Ups / Review

Review before generating any Railway public domain, adding a custom domain, enabling browser cookie login over HTTPS, importing non-demo content, or choosing the production hosted-service platform.

## 0091: Support OKF As A Versioned Agent Export Projection

### Context

Google Cloud introduced Open Knowledge Format (OKF) v0.1 as a draft, vendor-neutral Markdown and YAML frontmatter format for agent-readable knowledge bundles. ForgetBase already exposes permission-filtered AI export packages through API, SDK, CLI, and MCP, but the package shape was JSON-only.

### Options Considered

- ignore OKF until it stabilizes
- replace the JSON AI package with OKF
- add OKF as a versioned generated projection beside the existing JSON package
- store OKF Markdown as the canonical content model

### Decision And Rationale

Add OKF as a versioned generated export projection. Keep ForgetBase governed assets and asset versions as canonical, then generate OKF bundles with explicit `okfVersion`, source asset version metadata, source content hashes, and a projection hash.

This keeps the product agent-native and interoperable without turning the core into a Markdown CMS or breaking existing JSON-package consumers.

### Consequences

- `/exports/ai-package` accepts `format=json|okf` and `okfVersion=0.1`.
- OKF generation is enabled by default as an export format, but export permission filtering remains mandatory.
- Existing generated OKF artifacts must be treated as immutable versioned projections; regenerate from canonical asset versions instead of editing generated Markdown in place.
- Support for future OKF versions should be added side-by-side unless the official spec change is fully backward-compatible.

### Follow-Ups / Review

Review when OKF publishes a new minor or major version, when adding persisted export artifacts/object storage, when generating tar/zip bundles, or when downstream consumers require an OKF version other than `0.1`.

## 0092: Add Deterministic Hash-Vector Retrieval Before Provider Embeddings

### Context

The schema and database already included a `vector(1536)` chunk embedding column, and the MVP scope called for `pgvector` retrieval. The implemented retrieval path was still lexical-only. Adding provider-quality embeddings now would require provider selection, cost controls, privacy review, reindex jobs, and failure policy.

### Options Considered

- leave the alpha as lexical-only with vector-ready storage
- add external embedding provider generation immediately
- add deterministic local hash embeddings and opt-in vector/hybrid strategies
- add a separate search service

### Decision And Rationale

Add deterministic local hash embeddings during chunk indexing and expose opt-in `strategy=vector` and `strategy=hybrid` search modes beside the default lexical mode. Store the vectors in the existing `pgvector` column and return transparent ranking metadata as `vector-hash-v1` or `hybrid-hash-lexical-v1`.

This makes the self-hosted core's vector path functional and testable without sending corpus text to an external provider or pretending to provide high-quality semantic retrieval.

### Consequences

- Existing search behavior remains lexical by default.
- Reindexing assets backfills deterministic hash embeddings for existing chunks.
- API, SDK, CLI, and MCP clients can request lexical, vector, or hybrid retrieval.
- Hash-vector ranking is deterministic and local, but it is not provider-quality semantic embedding search.
- Retrieval ranking policy still tunes lexical source-kind weights and exact-phrase boost; vector weighting is intentionally fixed until semantic retrieval policy is designed.

### Follow-Ups / Review

Review when adding provider embeddings, embedding model selection, vector reindex migration jobs, semantic reranking, eval-driven search optimization, per-tenant retrieval profiles, or a hosted search service.

## 0093: Keep Public Prototype Setup Paths Closed

### Context

The private alpha can be exposed through a same-origin proxy for live prototype review, but setup endpoints and local build artifacts must not become public or leak into remote build contexts. The API had an optional global authentication gate, and malformed boolean env values previously fell back to defaults.

### Options Considered

- rely only on app-route permissions
- make invalid boolean env values fail startup
- block bootstrap at the public proxy
- keep maintainer-specific Railway details in public docs

### Decision And Rationale

Fail startup on invalid boolean env values, require explicit `FORGETBASE_REQUIRE_AUTHENTICATION=true` for public prototypes, and block `/api/auth/bootstrap` at the Railway proxy. Keep live Railway project IDs, personal workspace names, and prototype domains in maintainer-only files, with a sanitized public Railway template for reusable guidance.

Also keep local private artifacts out of Docker/Railway build contexts through `.dockerignore`.

### Consequences

- Public prototype misconfiguration fails loudly instead of silently opening unauthenticated routes.
- The same-origin proxy no longer forwards bootstrap setup requests.
- Public docs describe the deployment pattern without publishing live target identifiers.
- Local backups, TLS keys, maintainer notes, browser artifacts, and assistant artifacts are excluded from remote build contexts.

### Follow-Ups / Review

Review before changing the public prototype domain, enabling a hosted onboarding flow, adding setup tokens, or documenting a production hosted-service deployment path.

## 0094: Add OpenAI-Compatible Provider Embeddings With Vector-Space Metadata

### Context

The alpha retrieval path had deterministic hash vectors in `pgvector`, but provider-quality semantic embeddings were still a documented gap. Adding semantic embeddings without tracking provider/model metadata would risk comparing vectors from incompatible spaces, especially when API and worker processes are configured differently or chunks were indexed before a provider change.

CLI and MCP surfaces also had broad command/tool coverage but no executable contract tests proving their option parsing, request forwarding, surface headers, or MCP tool payload shape.

### Options Considered

- keep provider embeddings deferred until per-tenant retrieval profiles exist
- store only provider vectors in the existing `embedding` column without metadata
- add a separate embedding table keyed by provider/model
- add provider metadata on chunk rows and filter vector comparisons by matching provider/model/dimensions
- test CLI/MCP by starting a real API server
- test CLI/MCP through in-process fetch and MCP in-memory transports

### Decision And Rationale

Add an embedding provider abstraction with deterministic local hash as the default and an OpenAI-compatible provider selected by environment variables. Keep provider secrets in deployment env only, referenced through `FORGETBASE_EMBEDDINGS_API_KEY_ENV_VAR`; do not store embedding provider secrets in the database.

Add `embedding_provider`, `embedding_model`, and `embedding_dimensions` to `asset_chunks`. Indexing writes those fields, and vector/hybrid search only compares query vectors with chunks that match the active provider, model, and dimensions. Local hash results keep `vector-hash-v1` / `hybrid-hash-lexical-v1`; provider embeddings return `vector-provider-v1` / `hybrid-provider-lexical-v1`.

Add initial CLI and MCP contract tests that exercise command/tool contracts without a live API: CLI tests stub `fetch`, and MCP tests use the SDK in-memory transport plus a stubbed SDK fetch.

### Consequences

- Self-hosted installs still work without provider keys.
- Provider embeddings require API and worker processes to share embedding env configuration and require reindexing to populate provider vectors.
- Vector-only search returns no rows when active query embeddings do not match indexed chunk metadata; hybrid search can still return lexical matches.
- The current schema remains fixed at `vector(1536)`, so provider dimensions must be `1536`.
- CLI/MCP contract automation now covers the high-risk command/tool paths but not every long-tail command.

### Follow-Ups / Review

Review when adding per-tenant embedding profiles, additional embedding providers, variable vector dimensions, background reindex jobs, semantic reranking, eval-driven search optimization, hosted secret-manager adapters, or exhaustive CLI/MCP contract coverage.
