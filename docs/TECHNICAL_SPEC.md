# Technical Specification

## Summary

Agentic CMS should be implemented as a TypeScript monorepo with containerized services, Postgres as the system of record, shared domain/schema packages, and first-class API, CLI, MCP, worker, and web surfaces.

The MVP should keep orchestration interfaces present but inactive. The core build target is a permission-aware registry and retrieval platform.

## Recommended Stack

### Language And Runtime

- TypeScript
- Node.js LTS
- pnpm workspaces

Reasoning: TypeScript is the best fit for a shared API, CLI, MCP server, web UI, and SDK surface. It reduces cross-language schema drift and keeps contributor onboarding practical.

### Monorepo Tooling

- pnpm workspaces first
- add Turborepo or Nx only when build orchestration becomes painful

Reasoning: early simplicity matters. A plain workspace is enough until there are enough packages to justify task caching and graph tooling.

### API

Recommended direction:

- a long-running Node HTTP service
- OpenAPI generated from source contracts
- shared request/response schemas

Implementation candidates:

- Fastify for a pragmatic API-first server
- Hono if edge portability becomes more important
- NestJS only if the project needs heavier opinionated structure

Recommendation: Fastify-style API service unless a later framework review changes it.

Current implementation note: Phase 5 serves a hand-authored `/openapi.json` contract from the Fastify API. It should be replaced or backed by generated OpenAPI once route/schema generation is introduced, but the endpoint now gives API, CLI, MCP, and hosted-service consumers a stable contract target.

### Web UI

Recommended direction:

- React-based operational UI
- dense admin workflows over marketing/docs presentation
- API-backed application, not a static-only site

Implementation candidates:

- Vite React admin app
- Next.js only if server-rendered app routing or hosted web integration becomes valuable

Recommendation: Vite React for MVP operational UI.

### Database

- Postgres
- `pgvector`
- Postgres full-text search
- row and application-level permission enforcement

Recommendation: Postgres remains the system of record through MVP and first production.

### ORM / Migrations

Implementation candidates:

- Drizzle for explicit TypeScript schema and migrations
- Prisma for stronger ecosystem and generated client ergonomics

Recommendation: Drizzle for explicit schema control unless developer experience proves too slow.

Current implementation note: Phase 2 starts with explicit SQL migrations plus `pg` behind a repository interface. The migration runner holds a Postgres advisory lock across the full migration pass so concurrent host-run processes serialize schema setup and skip already-applied files. Drizzle remains a revisit candidate once asset versioning, permissions, and search schema churn settles.

### Queue / Worker

MVP:

- simple database-backed jobs or lightweight Redis-backed queue

Later:

- BullMQ or equivalent if Redis is already part of the deployment

Recommendation: start with a simple worker abstraction and choose the queue during code scaffold.

Current implementation note: the worker reindexes retrieval chunks on `--once`, can run telemetry retention maintenance through `--retention-once`, can run expired managed-query cache cleanup through `--cache-purge-once`, can run service-account API-key rotation reminder maintenance through `--api-key-rotation-reminders-once`, can run due deterministic managed-query eval schedules through `--managed-query-evals-once`, and can run expired action approval maintenance through `--action-approval-expiry-once`. Long-running workers can schedule retention maintenance with `AGENTIC_CMS_RETENTION_PURGE_ENABLED=true`, cache cleanup with `AGENTIC_CMS_CACHE_PURGE_ENABLED=true`, API-key rotation reminders with `AGENTIC_CMS_API_KEY_ROTATION_REMINDERS_ENABLED=true`, deterministic eval schedules with `AGENTIC_CMS_MANAGED_QUERY_EVALS_ENABLED=true`, and action approval expiry with `AGENTIC_CMS_ACTION_APPROVAL_EXPIRY_ENABLED=true`; all maintenance jobs remain dry-run unless the matching dry-run env var is set to `false`. Reminder execution dedupes matching tenant/key-state audit evidence for 24 hours by default; set `AGENTIC_CMS_API_KEY_ROTATION_REMINDERS_DEDUPE_WINDOW_HOURS=0` only when duplicate audit events are intentionally needed. Executed, non-duplicate reminder reports can optionally POST a reduced tenant reminder payload to `AGENTIC_CMS_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL`; dry-runs never deliver, payloads omit raw secrets and secret previews, and `AGENTIC_CMS_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET` adds an HMAC SHA-256 signature header without storing the signing secret. Executed action approval expiry maintenance marks stale pending approvals `expired`, records `agent.action.approval_expiry` audit evidence, and does not execute actions.

### Object Storage

- local filesystem adapter for development
- S3-compatible adapter for production

Current implementation note: Phase 6 backup/restore covers Postgres only. Future object storage adapters must add their own backup and restore expectations.

### Model Providers

Provider adapter interface:

- OpenAI
- Anthropic
- OpenRouter-style router

MVP starts with provider configuration, a narrow provider-backed managed-query path, response caching, action-request governance, and telemetry/audit metadata. Full orchestration, semantic caching, LLM-as-judge automation, and external side-effecting action adapters belong to later managed-agent work.

Current implementation note: Phase 7 starts with `/agent/query` modes for `deterministic-retrieval` and `provider-routed`. Both modes use the existing permission-filtered retrieval path, record retrieval telemetry, and return citations, grounding checks, denied-result counts, warnings, generation metadata, and cache status. `/admin/managed-query-policy` lets admins set the tenant default mode, allowed modes, minimum citation count, and whether grounded retrieval context is required. Requests for disabled modes are coerced to the tenant default with a warning, and provider generation is skipped when the citation floor or grounded-context policy is not met. Provider-routed mode requires authentication when auth is configured, reads provider secrets only from configured env vars or derived mounted secret-file env companions, sends only permitted retrieval context to providers, audits generation attempts, and falls back to deterministic answers when provider config, env vars, permitted context, quota preflight, policy gates, or generation fail. Provider config metadata can set bounded `maxRetries` and `retryBackoffMs`; retry attempts are recorded in generation metadata and audit events, with zero retries by default. If a request specifies `provider`, routing is strict to that enabled provider. If a request omits `provider`, the API tries enabled provider configs by ascending priority until one completes, recording safe attempt metadata without prompts, provider request bodies, or secrets. Provider-generation audit metadata also records the tenant managed-query policy and retention decision: prompt/response capture defaults to disabled, and `metadata-only` mode stores hashes rather than raw prompt or response bodies. Provider responses can contribute normalized input/output/total token usage; optional admin metadata `inputCostPerMillionTokens` and `outputCostPerMillionTokens` lets the system estimate USD cost without storing provider billing credentials. Optional metadata caps `maxEstimatedInputTokensPerQuery`, `maxEstimatedTotalTokensPerQuery`, and `maxEstimatedCostUsdPerQuery` let the API skip provider calls before external execution when estimated prompt size or max cost exceeds admin limits. The managed-query cache stores generated answer text and normalized generation metadata behind hashed tenant/principal/query/context/provider keys for a short TTL, bypasses queries that match the active tenant PII redaction policy, and can be disabled per request, provider config, or tenant cache policy. The tenant cache policy defaults to enabled with a 3600-second max TTL cap; admins can disable caching or set the max TTL to `null` to remove the tenant cap while provider TTL validation remains bounded. Admin cache policy, list, targeted-delete, and purge routes expose policy state plus safe cache metadata, hit counts, hashes, expiry, and generation metadata without cached answer text; purge defaults to dry-run. Successful governed asset create, content update, review-complete, publish, and restore operations reindex retrieval chunks and invalidate all generated-answer cache entries for the tenant, recording the invalidated count in the asset audit metadata. The worker can also purge expired cache rows through a dry-run-first one-off command or opt-in schedule. `/admin/model-providers/health` reports built-in provider readiness, missing config, missing model, missing env var name, direct env var or file-backed secret availability, and resolution errors without exposing secret values or file contents. `/telemetry/summary` aggregates provider generation counts, status, cache status, provider/model breakdowns, token totals, estimated cost, and latency from audit metadata. `/agent/query/feedback` records outcome acceptance and quality scores against a managed-query telemetry event. `/agent/evals/run` runs deterministic eval cases for groundedness, minimum citation count, expected stable-ID coverage, overall pass-rate thresholds, and tag-specific pass-rate thresholds, then persists structured run history in `managed_query_eval_runs` when available. Stored eval-run reports redact eval case query text with the tenant PII policy and record redaction metadata; the live eval response still includes the submitted query for caller-side correlation. `/agent/evals/runs` lists recent eval runs for admins, with normalized summary fields plus the structured redacted report and without provider prompts, provider request bodies, or raw generated-answer transcripts. `/agent/evals/summary` summarizes recent eval-run trends from the same history, including latest pass rate, average pass rate, threshold counts, mode counts, tag aggregates, and recent run cards. `/admin/managed-query-eval-schedule-policy` stores an admin-managed disabled-by-default eval schedule with replayable deterministic eval input, interval, last run ID, last status, and update actor references; the worker can dry-run or execute due schedules without requiring a human admin API key. Schedule execution records retrieval telemetry as a scheduled eval, stores redacted eval-run history, updates policy last-run status, and writes audit evidence without raw query text in audit metadata. `/admin/model-providers` stores admin-managed provider configuration for OpenAI, Anthropic, and OpenRouter-style routing, but only references secret env var names. `/admin/secret-reference-policy` controls which deployment env-var names provider and auth-provider configs may reference; defaults allow common Agentic CMS/provider/OIDC prefixes while rejecting unrelated env vars. `/admin/pii-redaction-policy` controls whether deterministic redaction is enabled and which rule kinds apply to retrieval telemetry, managed-query feedback, stored eval-run report queries, and generated-answer cache bypass. The operational web UI exposes a compact managed-query runner with provider attempt and cache readouts plus admin controls for feedback, demo eval runs with threshold and summary readouts and recent run history, eval schedule policy, managed-query policy, provider config, provider health, quota caps, retry controls, cache policy, prompt/response retention posture, secret-reference policy, PII redaction policy, cache deletion/purge, and provider-generation summary fields.

Current action implementation note: `/admin/action-execution-policy` stores tenant action governance with safe defaults: disabled, no allowed action types, approval required, dry-run default enabled, a 60-request hourly tenant cap, a 1440-minute approval-expiry window, and kill switch off. `/agent/actions/execute` requires an `admin` key or the dedicated `agent:execute` scope. Requests may include an optional `idempotencyKey`; when the same user or service-account principal retries with the same key, the API returns the original durable action request with `200` before rate-limit counting or policy re-evaluation, and records replay audit evidence with a key hash rather than the raw key. New requests check the tenant hourly request cap before durable storage, evaluate the policy, redact string fields in action request `payload` and `metadata` with the tenant PII redaction policy, and write a durable action request for blocked, dry-run, approval-required, or executed outcomes. Redaction adds compact `actionRequestRedaction` metadata with aggregate finding kinds and counts when anything changed. Approval-required requests store `approvalExpiresAt` from the tenant policy. Approval attempts after that deadline mark the request `expired`, return `409 action_request_approval_expired`, and do not execute the action. The worker can also dry-run or execute expired approval maintenance, marking stale pending requests `expired` with audit evidence. Unscoped authenticated callers and rate-limited scoped callers are denied before a request is stored; rate-limit denials return `429 action_rate_limit_exceeded` and record audit evidence. The only executable action type today is the internal `create-task-record` request, which records a side-effect-free task marker result. External action types such as `http-openapi`, `mcp-tool`, `git-repo`, `document-connector`, and `local-command` can be represented in policy and requests, but they do not execute external side effects until adapters, sandboxing, connector credential governance, and richer approval workflows are implemented. `/agent/actions` lists recent requests for admins, and `/agent/actions/{actionRequestId}/decision` approves or denies non-expired requests awaiting approval. Action policy changes, execution requests, idempotent replays, denials, rate-limit refusals, approval expiries, and decisions are audited.

### Export Packages

Current implementation note: Phase 5 exposes `/exports/ai-package` plus SDK, CLI, and MCP wrappers. The default package is JSON, permission-filtered, citation-bearing, and optimized for agent connectors rather than human page rendering. The same route also supports `format=okf&okfVersion=0.1`, generating a versioned Open Knowledge Format projection with deterministic Markdown files, root `okf_version`, source asset version metadata, source content hashes, and a projection hash. OKF is enabled by default as an export format, but Agentic CMS asset versions remain canonical and export permission filtering remains mandatory before OKF generation.

### PII Redaction

Current implementation note: Phase 6 adds tenant-scoped deterministic PII redaction policy before storing retrieval telemetry query text, managed-query feedback query/notes text, and deterministic eval-run report query text. The default policy enables all deterministic rules, covering API-key-like secrets, including common provider, cloud, repository, and chat-ops token prefixes, bearer/JWT tokens, URL secret parameters, email addresses, payment-card-like numbers, government-ID-like values, IP addresses, and phone-number-like values. Admins can disable redaction or choose a subset of rule kinds through API, SDK, CLI, MCP, and web controls. Provider-routed generated-answer caching uses the same policy to bypass caching when the submitted query would be redacted. This is not a complete PII classifier; country-specific identifier packs, model-based classification, and redacted transcript review belong to later hardening work.

### Telemetry Retention

Current implementation note: Phase 6 adds tenant-scoped telemetry retention policy records with defaults of 30 days for retrieval events, 365 days for audit events, and 90 days for managed-query feedback. Admins can read/update the policy and preview or execute purges through API, SDK, CLI, MCP, and the operational web UI. The worker can also run the same policy as an opt-in scheduled maintenance job. A `null` retention value means retain that stream indefinitely.

## Repository Layout

Proposed first implementation layout:

```text
apps/
  api/
  web/
  worker/
packages/
  cli/
  mcp-server/
  sdk/
  schema/
  validation/
  config/
  db/
  telemetry/
  auth/
  retrieval/
corpus/
  demo/
infra/
  docker/
docs/
  runbooks/
  adr/
```

## Domain Model

### Tenant

Present from day one, even though OSS core is single-tenant.

Fields:

- id
- slug
- name
- plan
- created_at
- updated_at

### User

Fields:

- id
- tenant_id
- email
- display_name
- password_hash
- auth_provider
- status
- created_at
- updated_at

Current implementation note: Phase 3 stores users with tenant, email, display name, role, status, optional password hash, auth provider, and optional external provider/issuer/subject binding. Admins can create, list, update, and disable users through API, SDK, CLI, MCP, and web operations controls. User updates can change display name, role, status, or reset a password. Password login verifies local active users and issues a server-capped short-lived scoped API key; the cap defaults to 12 hours and is deployment-configurable through `AGENTIC_CMS_LOGIN_SESSION_MAX_AGE_SECONDS`. OIDC login first resolves users by external issuer/subject, then optionally links an existing email user according to the provider account-linking mode, or auto-provisions a new external user when enabled, and uses the same server-side login-session cap. Password and OIDC login also create a `login_sessions` record tied to the login-created API key, optional `device_label` and bounded `client_user_agent` inventory metadata, a stored `absolute_expires_at` browser-session ceiling when enabled, plus a hash-only one-time refresh-token row. Browser login sets an `HttpOnly`, `SameSite=Lax` session cookie over the short-lived key, an `HttpOnly`, `SameSite=Lax` refresh cookie, and a readable signed CSRF cookie with a matching session max age; cookie authentication now requires both a valid login key and an active, unexpired, unrevoked, absolute-unexpired login-session record. Cookie-authenticated requests update `login_sessions.last_seen_at` and enforce `AGENTIC_CMS_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS`, which defaults to 14400 seconds in Compose and can be set to `0` to disable idle-timeout enforcement. `AGENTIC_CMS_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS` controls the hard browser-session lifetime, defaults to 2592000 seconds in Compose, and can be set to `0` to disable the absolute cap. `POST /auth/session/refresh` rotates the one-time refresh token, revokes the old login key, updates the login session to a new short-lived key capped by `absolute_expires_at`, preserves the session inventory metadata, sets fresh HttpOnly cookies capped by the same ceiling, and returns only safe session/key metadata. `AGENTIC_CMS_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS` controls the refresh-cookie lifetime, defaults to 604800 seconds in Compose, and can be set to `0` to disable refresh-token issuance. Bearer headers remain the active authorization path for CLI, MCP, SDK, and direct API clients and do not require a login-session record, refresh token, idle-timeout check, or absolute-session check. Cookie-authenticated unsafe browser requests must echo the CSRF cookie in `x-agentic-cms-csrf`; bearer clients do not use the CSRF header. The bundled web UI defaults to `/api` behind the same-origin reverse-proxy overlay, supports an HTTPS Compose overlay with `AGENTIC_CMS_SESSION_COOKIE_SECURE=true`, and defaults to `http://127.0.0.1:3000` on the local `5175` preview. Credentialed split-origin browser requests require an exact origin match from `AGENTIC_CMS_CORS_ALLOWED_ORIGINS`; the default local allowlist is `http://127.0.0.1:5175,http://localhost:5175`, while the TLS overlay defaults to local `https://127.0.0.1:8443` and `https://localhost:8443` origins unless an operator sets the public origin list. Users can list and revoke their own login sessions with device labels; admins can list and revoke tenant login sessions. Login-session revocation revokes the underlying login key and refresh tokens, clears cookies when revoking the current session, and is audited. Device labels and user-agent metadata are not used for authorization or remembered-device trust. Logout clears the browser cookies and revokes the current login session/key and refresh tokens. Disabled users fail password, OIDC, cookie, refresh, and API-key authentication.

### External Auth Provider Config

Current implementation note: Phase 3 adds admin-managed external auth provider configuration for generic OIDC and Microsoft Entra ID. Records store issuer URL, client ID, client secret env var name, redirect URI, scopes, claim mappings, allowed domains, provisioning defaults, account-linking mode, group sync settings, and priority. They do not store client secret values, and the referenced client-secret env var must satisfy tenant secret-reference policy. At runtime the API reads the configured env var directly or, when unset, reads an absolute file path from the derived `<ENV_VAR>_FILE` env var for mounted secret deployments. The config is exposed through API, SDK, CLI, MCP, and the operational web UI. OIDC authorization-code login uses signed state, PKCE, discovery, token exchange, JWKS ID-token validation, issuer/audience/nonce checks, allowed-domain checks, configurable email/account linking, optional auto-provisioning, claim-based group sync, and server-capped login API-key issuance. Browser login sets the same HttpOnly session, refresh-token, CSRF cookie, and nullable session device-label metadata foundation as password login. SCIM, richer Entra group mapping, remembered-device trust policy, and MFA policy reporting remain future work.

### Service Account

Fields:

- id
- tenant_id
- slug
- name
- description
- role
- status
- created_at
- updated_at

Current implementation note: service accounts are tenant-local non-human principals. Admins can create, list, update, and disable service accounts through API, SDK, CLI, MCP, and web operations controls. Tenant service-account policy is also admin-configurable across API, SDK, CLI, MCP, and web: defaults allow 50 service accounts per tenant, five active API keys per service account, and a 90-day default expiry for service-owned keys that do not set an explicit expiry. Limits can be set to `null` for self-hosted deployments that intentionally want no cap. API keys can be issued directly to a service account, authenticated principals identify `principalType: service-account`, and disabled service accounts immediately fail bearer-key authentication. Admins can report service-owned API keys that are expired, nearing expiry, or missing an expiry through API, SDK, CLI, MCP, and web controls, and the worker can turn the same report into dry-run-first reminder audit events without raw secrets or secret previews. Reminder execution dedupes matching tenant/key-state audit evidence for a configurable window and can optionally deliver the same safe reminder projection to a signed webhook after audit evidence is written. Service accounts do not inherit group memberships; restricted asset access uses direct service-account permission grants or admin role.

### Group

Fields:

- id
- tenant_id
- slug
- name
- description

Current implementation note: local groups can be created, listed, and deleted through admin API, SDK, CLI, MCP, and web operations controls. Admins can add or remove local users from groups, and authenticated principals include group IDs so document-level group grants are enforced by the same read/search/export permission checks as user grants. OIDC/Entra group claim sync creates external groups with provider/id bindings and external memberships, removes stale external memberships for the same provider on login, and preserves manual local memberships. Deleting a local group removes its memberships and group-based permission grants; SCIM and richer external group lifecycle policy remain future work.

### API Key

Fields:

- id
- tenant_id
- user_id or service_account_id
- name
- hashed_secret
- scopes
- expires_at
- last_used_at
- revoked_at

Current implementation note: API key secrets are generated once, stored as hashes, and authenticated through bearer tokens or, for browser login only, the `agentic_cms_session` HttpOnly cookie. Authorization headers take precedence when both are present. Cookie authentication is limited to password/OIDC login-created keys that still have an active `login_sessions` row; admin-created user keys, service-account keys, revoked sessions, expired sessions, sessions idle beyond the configured idle timeout, and sessions past their stored absolute expiry do not authenticate as browser cookies. Browser refresh tokens are generated separately, stored only as hashes in `login_session_refresh_tokens`, set only in an HttpOnly cookie, capped by the stored absolute expiry, and rotated on every successful refresh. Cookie-authenticated unsafe methods require the signed `agentic_cms_csrf` cookie value to be echoed in `x-agentic-cms-csrf`; bearer clients are unaffected. Each key is owned by exactly one local user or service account. Scopes currently include `admin`, `asset:read`, `asset:write`, `permission:write`, and `agent:execute`; `admin` remains a wildcard, while `agent:execute` permits scoped action-request submission without granting admin control. Admins can create, list, rotate, revoke, and report rotation-due key records through API, SDK, CLI, MCP, and web operations controls. Users can list/revoke their own login sessions, and admins can list/revoke tenant login sessions through API, SDK, CLI, MCP, and web operations controls. Login-session lists expose nullable device labels and bounded client user-agent metadata, not raw secrets. Create and rotate responses return the raw secret once; password/OIDC login responses still include the raw secret for non-browser clients, but their expiry is capped by server login-session policy and the web UI relies on the cookie while clearing JavaScript-readable login-key storage. Refresh responses set the new raw login key only in the HttpOnly session cookie and return safe key/session metadata. List, rotation-due reports, session lists, and web readouts keep only safe records and previews. Revoked keys stop authenticating immediately and revocation is audited.

### Asset

Base governed object.

Fields:

- id
- tenant_id
- stable_id
- type
- owner_id
- title
- summary
- lifecycle_state
- sensitivity
- audience
- status
- review_due_at
- source_kind
- source_ref
- allowed_surfaces
- allowed_exports
- allowed_actions
- current_version_id
- created_at
- updated_at

### Asset Version

Fields:

- id
- asset_id
- version_number
- content_hash
- metadata
- created_by
- created_at
- change_note

Current implementation note: asset updates create a new version and active instruction/document content is scoped to `current_version_id`. Authenticated users can fetch a version snapshot to inspect historical instruction/document content without changing the current pointer. Maintainers/admins can list a review queue of assets that are stale, not approved, not active, or explicitly included for governance sweeps. Marking an asset reviewed updates status, next review date, and optional source reference without creating a new content version, records an audit event through the API, and reindexes retrieval chunks. Publishing an asset sets `lifecycle_state` to `active` and `status` to `approved` without creating a new content version, records an audit event through the API, and reindexes retrieval chunks. Public anonymous read/search/export only exposes `public-demo` assets after this published state is true. Restoring a version moves the current pointer back to an existing version, records an audit event through the API, and reindexes retrieval chunks for that asset.

### Instruction Object

Agent-optimized content.

Fields:

- id
- asset_id
- instruction_kind
- target_agent
- input_contract
- output_contract
- constraints
- examples
- failure_modes
- escalation

### Human Document

Human-readable projection.

Fields:

- id
- asset_id
- format
- body
- render_options
- linked_instruction_ids

### Chunk

Searchable unit.

Fields:

- id
- asset_id
- tenant_id
- version_id
- source_kind
- source_id
- chunk_index
- title
- body
- citation
- search_vector
- embedding

Current implementation note: Phase 4 stores chunks in Postgres with generated full-text vectors, citation JSON, and deterministic hash embeddings in a `vector(1536)` column. The default retrieval path is permission-filtered Postgres full-text search with `lexical-weighted-v1` ranking metadata. Callers can also request `strategy=vector` for `vector-hash-v1` ranking or `strategy=hybrid` for `hybrid-hash-lexical-v1` ranking through API, SDK, CLI, and MCP. The vector modes use local deterministic token hashing so the self-hosted core has a pgvector-backed path without calling an external embedding provider. Ranking combines lexical rank, tenant-configurable source-kind weighting that defaults to favoring agent-instruction chunks over equal human-document matches, exact-phrase boost, and vector similarity where requested. `/admin/retrieval-ranking-policy` exposes the lexical weights through API, SDK, CLI, MCP, OpenAPI, and the operational web UI; changes are audited and default to the original `1.2` agent-instruction, `1.1` asset-summary, `1.0` human-document, and `0.25` exact-phrase boost behavior. Provider-quality embedding generation, semantic reranking, retrieval eval optimization, and search-service federation are pending.

### Permission Grant

Fields:

- id
- tenant_id
- subject_type
- subject_id
- object_type
- object_id
- permission
- condition
- created_at

### Telemetry Event

Fields:

- id
- tenant_id
- event_type
- actor_id
- client_surface
- request_id
- asset_ids
- chunk_ids
- provider
- model
- latency_ms
- token_counts
- cost_estimate
- pii_state
- metadata
- created_at

### Audit Event

Fields:

- id
- tenant_id
- actor_id
- action
- object_type
- object_id
- before_hash
- after_hash
- ip_hash
- user_agent_hash
- created_at

## API Surface

MVP REST groups:

- `/health`
- `/auth`
- `/auth/oidc/authorize`
- `/auth/oidc/callback`
- `/auth/service-accounts`
- `/auth/groups`
- `/users`
- `/groups`
- `/api-keys`
- `/assets`
- `/assets/review-queue`
- `/assets/{id}/versions`
- `/assets/{id}/versions/{versionNumber}`
- `/assets/{id}/versions/by-id/{versionId}`
- `/assets/{id}/review`
- `/assets/{id}/publish`
- `/instructions`
- `/documents`
- `/search`
- `/agent/query`
- `/agent/query/feedback`
- `/agent/evals/runs`
- `/agent/evals/summary`
- `/agent/evals/run`
- `/admin/model-providers`
- `/admin/model-providers/health`
- `/admin/model-providers/{provider}`
- `/admin/auth-providers`
- `/admin/auth-providers/{provider}`
- `/admin/secret-reference-policy`
- `/admin/pii-redaction-policy`
- `/admin/telemetry-retention`
- `/admin/telemetry-retention/purge`
- `/retrieval`
- `/exports`
- `/validation`
- `/telemetry`
- `/audit`
- `/admin/settings`

OpenAPI must be generated or validated in CI once implementation starts.

## CLI Surface

Initial commands:

- `agentic-cms login`
- `agentic-cms auth logout`
- `agentic-cms auth sessions`
- `agentic-cms auth session-revoke`
- `agentic-cms auth oidc-start`
- `agentic-cms auth oidc-callback`
- `agentic-cms health`
- `agentic-cms validate`
- `agentic-cms import`
- `agentic-cms search`
- `agentic-cms agent query`
- `agentic-cms agent feedback`
- `agentic-cms agent feedback-list`
- `agentic-cms agent eval`
- `agentic-cms agent eval-runs`
- `agentic-cms agent eval-summary`
- `agentic-cms agent action-execute`
- `agentic-cms agent action-list`
- `agentic-cms agent action-decision`
- `agentic-cms admin model-providers`
- `agentic-cms admin model-provider-health`
- `agentic-cms admin model-provider-set`
- `agentic-cms admin auth-providers`
- `agentic-cms admin auth-provider-set`
- `agentic-cms admin secret-reference-policy`
- `agentic-cms admin secret-reference-policy-set`
- `agentic-cms admin action-execution-policy`
- `agentic-cms admin action-execution-policy-set`

Current action policy CLI note: `agentic-cms admin action-execution-policy-set` accepts `--max-requests-per-hour` to tune the tenant-scoped request cap before durable action requests are stored and `--approval-expires-in-minutes` to bound how long pending approvals can execute. `agentic-cms agent action-execute` accepts `--idempotency-key` so agent harness retries can return the original request instead of creating duplicates or consuming the hourly cap again.
- `agentic-cms admin pii-redaction-policy`
- `agentic-cms admin pii-redaction-policy-set`
- `agentic-cms admin managed-query-cache`
- `agentic-cms admin managed-query-cache-policy`
- `agentic-cms admin managed-query-cache-policy-set`
- `agentic-cms admin managed-query-cache-delete`
- `agentic-cms admin managed-query-cache-purge`
- `agentic-cms admin managed-query-retention-policy`
- `agentic-cms admin managed-query-retention-policy-set`
- `agentic-cms assets review-queue`
- `agentic-cms assets review`
- `agentic-cms fetch`
- `agentic-cms export`
- `agentic-cms users`
- `agentic-cms keys`
- `agentic-cms telemetry`
- `agentic-cms telemetry retention`
- `agentic-cms telemetry retention-set`
- `agentic-cms telemetry purge`

The CLI should be a thin API client, not a second implementation of business logic.

## MCP Surface

Initial tools:

- `search_instructions`
- `fetch_instruction`
- `fetch_document`
- `list_asset_types`
- `list_allowed_actions`
- `explain_citation`
- `validate_context_access`
- `list_assets_needing_review`
- `review_asset`
- `managed_query`
- `submit_managed_query_feedback`
- `list_managed_query_feedback`
- `list_managed_query_eval_runs`
- `summarize_managed_query_eval_runs`
- `run_managed_query_eval`
- `get_action_execution_policy`
- `update_action_execution_policy`
- `execute_agent_action`
- `list_agent_actions`
- `decide_agent_action`
- `list_model_provider_configs`
- `upsert_model_provider_config`
- `list_auth_provider_configs`
- `upsert_auth_provider_config`
- `get_telemetry_retention_policy`
- `update_telemetry_retention_policy`
- `purge_telemetry_retention`
- `list_managed_query_cache`
- `get_managed_query_cache_policy`
- `update_managed_query_cache_policy`
- `delete_managed_query_cache_entry`
- `purge_managed_query_cache`
- `get_managed_query_retention_policy`
- `update_managed_query_retention_policy`
- `get_secret_reference_policy`
- `update_secret_reference_policy`

Later tools:

- `ask_managed_agent`
- `request_policy_exception`

MCP tools must enforce the same auth and permissions as API and CLI.

Current implementation note: MCP exposes review queue and review-complete tools for governance workflows, `managed_query` as the deterministic precursor to `ask_managed_agent`, plus feedback tools for outcome acceptance and quality scoring, `run_managed_query_eval`, `list_managed_query_eval_runs`, and `summarize_managed_query_eval_runs` for deterministic eval cases, pass-rate gates, recent run history, and lightweight trend analytics, action policy/request/decision tools for disabled-by-default action governance, provider config tools for admin-managed routing metadata, login-session list/revoke tools for browser session inventory, API-key rotation-due reporting for service-account credential hygiene, safe cache policy/list/delete/purge tools for generated-answer cache operations, managed-query retention policy tools for prompt/response capture posture, and secret-reference policy tools for provider/OIDC env-var guardrails.

## Retrieval Flow

1. Client authenticates.
2. Query is normalized.
3. Candidate lexical and vector matches are found.
4. Permission filter removes unauthorized assets and chunks.
5. Surface filter removes content not allowed for the requesting client.
6. Results are ranked.
7. Citations and stable references are attached.
8. Retrieval telemetry is recorded.
9. Response is returned to API, CLI, MCP, web, or export job.

## Export Flow

1. Admin or CLI requests export profile.
2. Export scope is resolved.
3. Permission and allowed-export rules are applied.
4. Restricted leakage checks run.
5. Package is generated with manifest, assets, chunks, metadata, and checksums.
6. Export event is audited.

## Validation Rules

MVP validators:

- required metadata
- stable ID uniqueness
- lifecycle state validity
- review date presence
- sensitivity and audience presence
- broken internal references
- allowed surface consistency
- restricted export leakage
- orphaned chunks
- instruction/document link integrity

Current implementation note: Phase 6 exposes deterministic asset validation through the shared validation package, API, SDK, CLI, and MCP. It validates asset create payloads, duplicate stable IDs, stale review dates, selected internal stable-ID references in metadata, export-surface consistency, retrieval/export eligibility, and public package leakage for non-public assets. Missing required metadata and restricted public-export leakage are errors; stale review dates and consistency risks are warnings unless the CLI is run with `--fail-on-warnings`.

## Telemetry Rules

Default MVP telemetry should store:

- actor/client identifiers
- query hash and optionally redacted query text
- result asset IDs
- result chunk IDs
- latency
- client surface
- validation/export events

Full prompt, response, and transcript storage should be configurable and disabled or redacted by default.

Current implementation note: `/telemetry/retrieval-events` exposes admin-only raw retrieval events after the configured PII redaction policy has been applied to stored query text. `/telemetry/summary` adds an admin-only recent-window operational summary over existing retrieval events, audit events, managed-query feedback, cache status, and governed asset state. The first summary is bounded by the repository list limit, defaults to 200 records per stream, and is exposed through API, SDK, CLI, MCP, and the operational web UI. `/admin/telemetry-retention` exposes tenant retention defaults/overrides, and `/admin/telemetry-retention/purge` previews by default before an admin executes deletion. `/admin/managed-query-retention/policy` exposes prompt/response capture posture for provider-routed generation; defaults disable capture, while `metadata-only` records hashes in audit metadata without raw prompt/response text. `/admin/secret-reference-policy` exposes env-var reference allowlists for provider and OIDC secret references, without storing secret values. `/admin/pii-redaction-policy` exposes deterministic telemetry/feedback/cache-bypass redaction controls. Admin managed-query cache policy/list/targeted-delete/purge controls expose tenant cache enablement, max TTL cap, safe metadata, cache-key deletion, and dry-run expired-row cleanup, while the worker can run scheduled expired-cache cleanup with dry-run-first defaults. These controls are intentionally not a long-range warehouse, raw transcript store, secret manager, or advanced analytics dashboard.

## First Code Milestone Exit Criteria

Implementation can move beyond scaffold when:

- workspace installs
- typecheck passes
- tests run
- API health endpoint responds
- database migration creates baseline tables
- Docker Compose starts Postgres, runs the one-shot migration gate, then starts app services
- CLI health command reaches API
- MCP server exposes placeholder capability list
- schema package is imported by API, CLI, MCP, and tests
