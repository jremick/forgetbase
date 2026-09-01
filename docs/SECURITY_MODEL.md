# Security Model

## Security Posture

Design for SOC 2-ready architecture while operating initially at pragmatic SMB security.

This means the system should include the controls that would make future audit readiness possible, without forcing certification process into the MVP.

## Trust Boundaries

### Users

Humans authenticate through local users first, then pluggable auth, then OIDC/Entra.

Current implementation: local users can have optional password hashes. Admins can create, list, update, and disable users without password hashes being returned. Password login verifies a local active user and issues a server-capped short-lived scoped API key. OIDC/Microsoft Entra login uses configured provider metadata, signed state, PKCE, discovery, token exchange, JWKS ID-token validation, issuer/audience/nonce checks, allowed-domain checks, external issuer/subject binding, configurable email account linking, optional auto-provisioning, and claim-based group sync before issuing the same server-capped login key. The cap defaults to 12 hours, can be configured with `FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS`, and applies to both the login key expiry and browser session-cookie max age. Password and OIDC login also create a database `login_sessions` record tied to the login-created API key plus a hash-only one-time refresh-token row. Login-session records may include a caller-provided device label and a bounded client user-agent string for inventory and revocation decisions; those fields are not authorization inputs. Browser login sets an `HttpOnly`, `SameSite=Lax` session cookie containing the short-lived key, an `HttpOnly`, `SameSite=Lax` refresh cookie, and a readable signed CSRF cookie, so the operational web UI does not need to persist login secrets in `localStorage`. Cookie authentication requires both a valid login key and an active login-session record; each successful cookie-authenticated request updates `last_seen_at` and enforces the configured rolling idle timeout plus the stored absolute browser-session expiry. `POST /auth/session/refresh` accepts the refresh cookie, rejects reused/revoked/expired/idle/absolute-expired tokens, marks the old refresh token used, revokes the old login key, updates the login session to a new short-lived key capped by the absolute expiry, and returns only safe key/session records while setting new HttpOnly cookies. Bearer authorization headers take precedence over the cookie and do not require login-session records, idle-timeout checks, absolute-session checks, refresh-token checks, or CSRF headers for API, CLI, MCP, and manual operator flows. Credentialed browser requests are allowed only from configured CORS origins. Cookie-authenticated unsafe browser requests must echo the signed CSRF cookie in `x-forgetbase-csrf`; missing or mismatched tokens fail before the action runs. Users can list and revoke their own login sessions; admins can list and revoke tenant login sessions. Login-session revocation revokes the underlying login key and refresh tokens, clears cookies when revoking the current session, and is audited. Logout clears the browser cookies and revokes the current session/key and refresh tokens. Disabled users fail password login, OIDC login, cookie authentication, refresh, and bearer-key authentication. Client secret values are read from deployment environment variables or mounted secret files referenced by derived `_FILE` env vars, and are not stored in provider config records. Tenant secret-reference policy controls which env-var names auth provider configs may reference.

### Service Accounts

Service accounts are tenant-local non-human principals for integrations, automation, MCP clients, and agent harnesses. Admins can create, list, update, and disable service accounts. Admins can also set tenant policy for maximum service-account count, maximum active API keys per service account, default expiry for service-owned keys, rotation-due reporting for expired, near-expiry, or missing-expiry service keys, and dry-run-first deduped worker rotation reminder maintenance with optional signed webhook delivery. API keys can be issued directly to service accounts, and authenticated service-account principals carry `principalType: service-account`, a `serviceAccountId`, role, scopes, and no group memberships. Disabled service accounts immediately fail bearer-key authentication.

### Groups

Groups are tenant-local authorization principals for shared access. Admins can create/delete groups, add/remove local users from groups, sync configured OIDC/Entra group claims into external groups, and grant assets to group principals. Authenticated principals include group IDs so permission checks can authorize either a direct user grant or a group grant. Login-time external group sync removes stale external memberships for that provider while preserving manual local memberships. Deleting a local group removes its memberships and group-based permission grants.

### API Clients

CLI, MCP, and integrations authenticate through scoped API keys or future OAuth/OIDC flows.

Current implementation: API keys are returned once at bootstrap, local login, OIDC login, creation, or rotation, stored only as hashes, listed only as records with secret previews, and can be created, listed, rotated, revoked, or reported as rotation-due by admins. Each key is owned by exactly one user or service account. Interactive login keys are capped by server-side session policy before they are created; longer-lived human or automation keys must be created through the admin API-key path instead of the login endpoint. Browser session cookies reuse the short-lived login key but keep it out of JavaScript-readable storage; unsafe cookie-authenticated browser requests require the signed double-submit CSRF token. Browser refresh tokens are stored only as hashes, sent only through an HttpOnly cookie, rotated on use, and capped by the stored login-session absolute expiry when one is configured; refresh responses do not return the new raw login key in the JSON body. Browser cookie authentication additionally requires a database login-session row, so arbitrary admin-created or service-account API keys cannot be dropped into the session cookie and used as browser sessions. Login-session records support inventory, device labels, bounded user-agent metadata, revocation, rolling idle-timeout enforcement, absolute browser-session lifetime, and one-time refresh-token rotation, but they are not yet a remembered-device trust or MFA enforcement layer. Rotation-due reporting returns safe key records only and focuses on service-account keys by default. Worker reminder maintenance can dry-run the same service-account report or execute tenant-scoped `auth.api_key.rotation_reminder` audit events with key IDs, owner type, state, and days until expiry, but no raw secrets or secret previews. Executed reminders skip matching tenant/key-state audit evidence inside the configured dedupe window. Rotation creates a replacement from the old key's owner, scopes, and expiry, with optional same-operation revocation. Login, refresh, logout, login-session revocation, key creation, rotation, and revocation are audited, and revoked keys no longer authenticate. External auth provider config changes are admin-only and audited; client secret values are not stored.

API-key records also bind the surfaces a bearer may assert. A caller-provided `x-forgetbase-surface` is accepted only when the authenticated key permits that surface, and access still requires the asset and permission grant to permit it. Export routes derive the `export` surface server-side. Key rotation preserves the binding; administrators can create narrower API, CLI, MCP, web, or export keys for automation.

### Agents

Agents are treated as clients acting on behalf of a user, group, or service account. They must not bypass retrieval permissions.

### Model Providers

OpenAI, Anthropic, and OpenRouter-style providers are external processors. Provider requests must go through configurable redaction, logging, and retention controls.

Current implementation: provider-routed managed queries first run permission-filtered retrieval, then send only the permitted query context to selected enabled providers. Provider API keys are read from configured deployment environment variables or mounted secret files referenced by derived `_FILE` env vars, and are not stored in provider config records, logs, telemetry, or audit metadata. Tenant secret-reference policy controls which env-var names model provider configs may reference; defaults allow common ForgetBase, OpenAI, Anthropic, OpenRouter, Entra, and OIDC prefixes while rejecting unrelated env vars. Provider readiness checks report configured provider, model, env var name, and whether a direct or file-backed secret resolves, but never expose secret values or file contents. Provider-routed mode requires an authenticated principal when auth is configured. Requests that pin a provider remain strict to that provider; requests that omit a provider can try enabled providers by priority until one completes. Optional admin quota caps can skip provider calls before external execution when estimated input tokens, total tokens, or max cost exceeds configured limits. Generation attempts record provider/model/status/latency/result-count, normalized token/cost-estimate metadata, safe fallback-attempt metadata, cache status, and quota preflight estimates, not raw prompts, provider request bodies, or API keys, and fall back to deterministic retrieval answers on missing config, missing env vars, unreadable secret files, no permitted context, quota preflight refusal, or provider failure.

### Action Tools

Actions are disabled by default. When enabled, each action has explicit scopes, approval rules, rate limits, audit logging, and kill switches.

Current implementation: tenant action execution policy defaults to disabled, allows no action types, requires approval, defaults requests to dry-run, caps scoped requests at 60 per tenant hour, sets approval expiry to 1440 minutes, and includes a kill switch. Admins can update policy through API, SDK, CLI, MCP, and the operational web UI. Authenticated principals with `admin` or `agent:execute` can request actions. Optional idempotency keys are scoped to the requesting user or service account; a retry with the same key returns the original action request before the hourly cap or policy evaluation, and audit metadata stores a hash of the key rather than the raw key. New requests are checked against the tenant hourly cap, evaluated against tenant policy, and stored as `blocked`, `dry-run`, `approval-required`, or `executed`; action request payload and metadata string fields are redacted with the tenant PII redaction policy before durable storage, and stored metadata records aggregate redaction findings. Approval-required requests include an `approvalExpiresAt` deadline. Approval attempts after the deadline mark the request `expired`, return a conflict response, and do not execute. The worker can also preview or execute expired approval maintenance; execution marks stale pending requests `expired`, records `agent.action.approval_expiry`, and does not execute actions. Unscoped authenticated principals and over-limit scoped principals are denied before a request is stored. Admins can list requests and approve or deny non-expired requests awaiting approval. The only executable action today is the internal `create-task-record` result, which records no external side effects. External action types are representable for policy planning but do not execute until adapters, sandboxing, connector credential governance, and richer approval workflows are added.

## Permission Model

Default enforcement is document level. Current implementation supports user, group, and service-account principals for document-level grants.

The model must support future lower-level controls:

- section
- chunk
- instruction object
- attachment
- tool
- action
- export package
- agent surface

Every retrieval path must check permissions before returning results or sending context to a model.

Attachment access inherits the parent asset boundary. Listing and downloading first resolve and authorize the parent stable ID, then require an active attachment linked to that exact asset and tenant. Upload and deletion require an authenticated maintainer/admin principal, `asset:write`, a writable parent asset, and a surface allowed by both the principal and parent asset. Upload display metadata uses dedicated headers instead of URL query parameters. Storage keys never appear in API responses or reconciliation reports. Before publication, uploads must pass extension/media/signature consistency, structural checks for supported formats, macro rejection for OpenXML, tenant/uploader quotas, an IP rate limit, bounded concurrency, and the configured malware scanner. Scanner failure is an availability failure, not an acceptance path, when scanning is required. ClamD remains on the internal Compose network because its TCP protocol has no authentication. Downloads are never rendered inline; required clean-scan state plus size/hash verification fail closed before bytes are returned. Atomic local publication never replaces an existing key. Attachment upload, download, deletion, denied writes, scan failures, storage failures, metadata-write cleanup, reconciliation, and integrity failures produce bounded audit evidence without file content or storage paths.

## Data Sensitivity

Every governed asset should declare sensitivity:

- public-demo
- internal
- restricted
- confidential
- secret

The open-source demo corpus must use `public-demo` only. Anonymous public access still requires the asset to be both `active` and `approved`; draft or reviewing public-demo assets are treated as private until published.

## Telemetry And PII

Telemetry may include:

- search queries
- prompts
- retrieved chunks
- model responses
- user identity
- costs
- latency
- cache hits
- feedback
- transcripts

Because these fields can contain PII, the system must support:

- configurable telemetry capture levels
- PII detection and redaction pipeline
- retention policies
- per-field storage controls
- admin access controls
- export/delete path for operational data
- no raw secret logging

Default MVP behavior should prefer operational metadata and redacted text over full raw transcripts.

Current implementation: retrieval telemetry stores query text after applying the tenant PII redaction policy, with redaction metadata indicating whether redaction was applied and which rule kinds matched. Managed-query feedback query/notes text uses the same policy. Deterministic managed-query eval run history stores the submitted eval report with eval case query text redacted by the same tenant PII policy, plus redaction metadata; it still includes expected stable IDs, pass/fail fields, citation counts, and warnings, and it does not store provider prompts, provider request bodies, API keys, or raw generated-answer transcripts. Live eval responses still include the submitted query so callers can correlate their own request. Admin-managed eval schedule policies store replayable eval input, including raw eval case query text, so operators should use sanitized synthetic or approved quality-gate prompts; scheduled eval run history still stores redacted report query text, and scheduled-run audit metadata records counts, thresholds, and status without raw queries. The default policy enables deterministic rules for API-key-like secrets, including common provider, cloud, repository, and chat-ops token prefixes, bearer/JWT tokens, URL secret parameters, email addresses, payment-card-like numbers, government-ID-like values, IP addresses, and phone-number-like values. Admins can disable redaction or select active rule kinds through API, SDK, CLI, MCP, and web controls, and changes are audited. Tenant managed-query policy lets admins control the default mode, allowed modes, minimum citation count, and whether grounded retrieval context is required before provider execution; disabled modes are coerced to the tenant default, and provider calls are skipped when citation or grounding policy is not met. Provider-routed managed-query audit metadata stores operational generation fields, token counts, optional USD cost estimates, fallback-attempt statuses, cache status, quota preflight estimates, and safe policy fields only; it does not store raw provider prompts, provider request bodies, API keys, or generated answer text. Tenant managed-query retention policy defaults prompt and response capture to disabled. Admins can set prompt or response capture to `metadata-only`, which stores hashes in generation audit metadata and still does not store raw prompt or response bodies. The managed-query cache can store generated answer text and normalized generation metadata for a short TTL, keyed by hashed tenant/principal/query/context/provider inputs; it bypasses caching when the submitted query matches the active PII redaction policy and can be disabled per request, provider config, or tenant cache policy. The tenant cache policy defaults to caching enabled with a 3600-second max TTL cap, and admins can disable generated-answer caching or set the max TTL cap to `null` through API, SDK, CLI, MCP, and web controls. Admin cache list surfaces expose cache metadata and hashes, not cached answer text. Admins can delete individual cache entries by cache key without exposing answer text, and expired-row purge defaults to dry-run. Admins can configure tenant retention policy for retrieval events, audit events, and managed-query feedback, then preview or execute purges. The worker can run the same retention policy, expired-cache cleanup, and deterministic eval schedule execution on a schedule, but scheduling is opt-in and dry-run by default. Live search and managed-query responses still include the submitted query and returned governed context.

## Audit Events

Record audit events for:

- login, login-session, and API key use
- API key rotation reminder execution
- service account creation and update
- service account policy update
- local user creation and update
- permission changes
- group creation and membership changes
- asset create/update/review/publish/archive
- export generation
- restricted access denial
- action enable/disable
- action execution request
- action approval or denial
- provider configuration changes
- provider-routed managed-query generation attempts
- external auth provider configuration changes
- secret-reference policy changes
- PII redaction policy changes
- telemetry retention changes

Current implementation: `auth.user.create`, `auth.user.update`, `auth.service_account.create`, `auth.service_account.update`, `auth.group.create`, `auth.group.member.add`, `auth.group.member.remove`, `auth.group.delete`, `auth.api_key.create`, `auth.api_key.rotate`, `auth.api_key.revoke`, `auth.api_key.rotation_reminder`, `auth.session.revoke`, `permission.grant`, `asset.review`, `asset.publish`, cache policy updates, targeted cache deletion, managed-query retention policy updates, managed-query eval schedule policy updates and scheduled runs, action execution policy updates, action execution requests, action approvals/denials/expiries, secret-reference policy updates, PII redaction policy updates, and telemetry retention updates/purge requests are audited. Public read/search/export gates require `public-demo` sensitivity plus `active` lifecycle state plus `approved` status. Review queue and review-complete routes require a write-capable maintainer/admin key when auth is enabled.

Admins can review recent audit events through the API, web Operations panel, CLI `audit events`, and MCP `list_audit_events` tool.

## Validation Boundary

Validation can process draft instructions and human documents before import. Local CLI validation runs offline. Server-side validation requires an authenticated writer/admin path when auth is enabled and records a validation audit event with counts, not raw payload content.

## Secrets

Never store provider keys, API tokens, or auth secrets in repo files.

For HTTPS deployments, set `FORGETBASE_SESSION_COOKIE_SECURE=true` on the API so browser session cookies include the `Secure` attribute. The `compose.tls.yaml` overlay sets this for the API service when using the bundled Nginx TLS listener. Leave it unset only for local HTTP development.

Set `FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS` to cap password/OIDC login-created keys and matching browser cookies. The default is 43200 seconds, or 12 hours. Values must be whole seconds between 60 and 2592000. Use admin-created API keys, service-account keys, and rotation policy for longer-lived automation credentials.

Set `FORGETBASE_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS` to control rolling idle timeout for cookie-backed browser sessions. Compose defaults to 14400 seconds, or 4 hours. Values must be `0` to disable the idle timeout or whole seconds between 60 and 2592000. The idle timeout applies only to cookie-backed login sessions; bearer API keys keep using key expiry and revocation.

Set `FORGETBASE_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS` to control the hard browser-session lifetime from password/OIDC login time. Compose defaults to 2592000 seconds, or 30 days. Values must be `0` to disable the absolute cap or whole seconds between 60 and 31536000. The cap applies only to login-session cookie auth and refresh; bearer API keys keep using key expiry and revocation.

Set `FORGETBASE_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS` to control browser refresh-token cookie lifetime. Compose defaults to 604800 seconds, or 7 days. Values must be `0` to disable refresh-token issuance or whole seconds between 60 and 2592000. Refresh is still bounded by login-session revocation, user status, one-time token rotation, and the rolling idle-timeout check when idle timeout is enabled.

Set `FORGETBASE_CORS_ALLOWED_ORIGINS` to a comma-separated list of exact web origins that may use credentialed browser requests, such as `https://cms.example.com`. The default Compose value allows only local development origins `http://127.0.0.1:5175` and `http://localhost:5175`. Originless API, CLI, SDK, and MCP calls are unaffected.

For browser-cookie deployments, prefer serving the bundled web UI and API through the same public origin and route API calls under `/api`. The `compose.same-origin.yaml` overlay provides this shape for Docker Compose by placing Nginx in front of the existing web and API services. Add `compose.tls.yaml` when the Compose proxy itself should terminate HTTPS with mounted certificate files. Local self-signed certs generated by `scripts/generate-local-tls-certs.sh` are for smoke tests only and are ignored by git; production deployments must use real certificates or a trusted external TLS edge. In same-origin mode browser requests are same-origin to the proxy; the CORS allowlist remains the control for intentional split-origin browser deployments.

Browser login also sets an `forgetbase_csrf` cookie. The operational web UI echoes that value in `x-forgetbase-csrf` for unsafe cookie-authenticated requests. Operators do not need to configure this token, but custom browser clients must implement the same header echo or use bearer authorization.

Self-hosted installs should support:

- environment variables
- mounted secret files
- future external secret manager adapters

Hosted service should support managed secret storage.

## Restricted Export Rule

Restricted assets must not appear in broad-reader exports, public demo packages, unauthenticated search indexes, or model context for unauthorized users.

Current implementation: `security:verify-restricted-leakage` creates a throwaway tenant and restricted fixture, then verifies anonymous search, ungranted reader search, and broad reader export do not return the restricted fixture while admin search can still find it.

## Incident And Rollback Expectations

Hardened deployments need:

- content rollback
- deployment rollback
- key rotation
- audit log review
- telemetry retention controls
- backup and restore
- restricted leakage investigation runbook

Current implementation: Docker Compose operators can create one stopped-writer backup-set directory containing a custom-format Postgres dump, attachment archive, and checksummed manifest. Non-destructive verification restores the database into a temporary target, safely extracts the archive, and proves every non-deleted attachment reference has exactly one matching blob with the expected size and SHA-256; extra blobs fail verification. Operators should run dry-run reconciliation before backup, stop API and worker writes, keep the set encrypted and off host, and restore its database and blob archive as one recovery point. Admin reconciliation is tenant-scoped and dry-run by default; it does not report global storage totals or classify other tenants' blobs as orphans. Admin execution can resolve only that tenant's stale deletion state. Scheduled Compose reconciliation is also dry-run by default; global operator execution can remove proven orphans only from a complete bounded inventory. Maintainers/admins can list stale or non-current review items, mark review metadata complete, and restore an asset to an existing version; review and restore events are audited and retrieval chunks are reindexed for the changed asset. Admins can inspect service-account keys due for rotation or run dry-run worker rotation reminder maintenance, then rotate API keys through staged replacement or immediate revocation, with audit evidence for `auth.api_key.rotation_reminder`, `auth.api_key.rotate`, and `auth.api_key.revoke`. Executed reminder maintenance can optionally send one webhook per tenant report after audit evidence is written; dry-runs and duplicate-skipped reports do not deliver, request signing secrets are read only from process environment, and payloads omit raw secrets and secret previews. Managed-query feedback submission requires authentication when auth is enabled, admin listing is restricted, and persisted feedback query/notes text uses the same tenant PII redaction policy as retrieval telemetry. Managed-query eval run listing is admin-oriented, retrieval ranking policy changes are admin-only and audited, eval schedule policy changes are admin-only and audited, scheduled eval execution writes audit evidence, and persisted run history plus schedule/ranking policy state are included in backup/restore verification. Action execution policy changes and action decisions are admin-only and audited; action requests require `admin` or `agent:execute`, redacted action request payload/metadata persists aggregate redaction evidence, idempotent replays are audited without duplicate request storage, expired approval attempts are audited and stored as `expired` without execution, dry-run worker expiry previews do not mutate requests, executed worker expiry records `agent.action.approval_expiry`, and unscoped denied attempts are audited without storing an action request. Telemetry retention policy changes, managed-query retention policy changes, secret-reference policy changes, PII redaction policy changes, purge requests, and targeted generated-answer cache deletions are admin-only and audited.

Runbooks now cover Docker Compose deployment with same-origin HTTP/HTTPS proxy options, backup/restore, rollback, API key rotation, and restricted leakage investigation.

Provider and auth-provider configuration records do not store provider API keys or OIDC client secrets. They may store only the deployment env var name that should contain the secret, such as `OPENAI_API_KEY` or `ENTRA_CLIENT_SECRET`. If that env var is unset, the API checks the derived `<ENV_VAR>_FILE` env var and reads the secret from the absolute path it names; this supports Docker/Kubernetes-style mounted secret files without storing file paths in config records. Tenant secret-reference policy can allow exact env-var names, allowed prefixes, or explicitly allow all valid env-var names for unusual self-hosted deployments. Metadata keys that look like secrets, tokens, passwords, or API keys are rejected by the admin API, except for explicitly allowed operational quota/cost/retry keys such as `maxOutputTokens`, `inputCostPerMillionTokens`, `outputCostPerMillionTokens`, `maxEstimatedInputTokensPerQuery`, `maxEstimatedTotalTokensPerQuery`, `maxEstimatedCostUsdPerQuery`, `cacheTtlSeconds`, `maxRetries`, and `retryBackoffMs`.
