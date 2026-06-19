# MVP Scope

## MVP Purpose

The MVP proves the open-source core of an agent-native instruction management platform. It should not attempt to ship the full managed orchestration layer.

## Included

### Registry

- governed asset model
- stable IDs
- version history
- lifecycle states: draft, active, deprecated, archived, restricted
- owner, audience, sensitivity, status, review date, source, and allowed surfaces
- separate human document and agent instruction primitives

### Auth And Access

- local users
- service accounts
- service-account policy limits and default service-key expiry
- API keys
- database-backed browser login-session inventory, device labels, revocation, and idle-timeout enforcement
- groups or roles
- document-level permissions
- admin-configurable env-var secret-reference policy for provider and OIDC config
- extension points for section, chunk, instruction, export, tool, and action permissions

### Retrieval

- chunking pipeline
- Postgres full-text search
- deterministic local hash-vector search through `pgvector`, plus opt-in OpenAI-compatible provider semantic embeddings with provider/model/dimension metadata
- permission-aware result filtering
- citations and stable references
- restricted export safety checks

### Delivery Surfaces

- REST/OpenAPI
- CLI
- MCP server
- operational web UI
- AI export package
- OKF v0.1 export projection enabled by default as a permission-filtered agent package format

### Validation

- required metadata validation
- broken internal reference/link checks
- stale review checks
- restricted export leakage checks
- search index eligibility checks

### Telemetry

- query events
- retrieval events
- API/CLI/MCP surface
- user/client identity
- latency
- model/provider placeholder fields
- managed-query cache status fields
- feedback placeholder fields
- PII redaction hooks
- recent-window admin summary across retrieval, audit, feedback, and asset state
- configurable retention policy with dry-run purge
- configurable generated-answer cache policy
- configurable managed-query prompt/response capture posture, disabled by default
- opt-in scheduled expired-cache cleanup

### Demo Corpus

- synthetic open-source corpus for AI-native users
- no private source content
- enough breadth to test policies, tools, skills, playbooks, templates, and docs

## Excluded From MVP

- full managed model orchestration
- automatic model routing
- advanced eval dashboard
- task execution by default
- remembered-device trust policy, MFA reporting, SCIM, and enterprise IdP hardening
- multi-tenant hosted service
- Kubernetes deployment
- long-range analytics warehouse and complex dashboards
- certification-level compliance process

## Acceptance Checks

The MVP is acceptable when:

- a maintainer can create and publish an instruction object and linked human doc
- an API client can search and fetch permission-appropriate results
- the CLI can validate, import, search, and export
- the MCP server can search and fetch instructions with citations
- restricted content is excluded from unauthorized API, CLI, MCP, and export results
- metadata validation fails on missing owner, status, audience, sensitivity, review date, or stable ID
- stale content can be reported by repeatable command
- stale, draft, or reviewing assets can be listed and marked reviewed by maintainers/admins without direct database access
- the AI export package contains stable IDs, titles, hierarchy, audience, status, sensitivity, and URLs or source references
- the OKF export package declares `okfVersion`, source asset version metadata, source content hashes, and a projection hash
- telemetry captures operational events without storing unmitigated PII by default
- provider prompt/response capture defaults to disabled or metadata-only rather than raw transcript storage
- provider and OIDC config can reference only env-var names allowed by tenant secret-reference policy
- admins can preview and execute telemetry retention purges without direct database access
- admins can set tenant service-account limits and default expiry for service-owned keys
- users can list/revoke their own browser login sessions with device labels and admins can revoke tenant sessions
- cookie-backed browser sessions enforce configurable idle timeout while bearer API keys remain governed by key expiry and revocation
- Docker Compose can start the stack locally
- Docker Compose can serve the browser UI and API through a same-origin proxy for cookie-backed web use
- backup and restore are documented at least at runbook level

## Demo Walkthrough

The MVP demo should show:

1. Admin creates users, service accounts, and API keys.
2. Maintainer imports synthetic corpus.
3. Validator flags metadata and link issues.
4. Maintainer publishes corrected assets.
5. User searches from web UI.
6. Agent searches through MCP.
7. CLI exports an AI connector package.
8. Restricted asset is blocked from broad export.
9. Telemetry shows retrieval and surface usage.
