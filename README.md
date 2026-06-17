# Agentic CMS

Agentic CMS is an open-core, agent-native instruction management platform for AI teams and power users.

The goal is to manage AI instructions, policies, playbooks, guardrails, tool guidance, reusable skills, templates, SOPs, learning assets, and human-readable knowledge as governed assets that agents can use directly. A website can display the content, but the system is designed first for API, CLI, MCP, ChatGPT, Claude, Codex, Claude Code, and other AI harnesses.

## Current Status

This repository is a private public-alpha candidate. The core self-hosted workflow is implemented and verified locally, but the repo should not be made public or tagged until the [alpha release checklist](docs/ALPHA_RELEASE_CHECKLIST.md) passes.

Expected alpha instability:

- API routes, CLI flags, MCP tool names, and package boundaries may change before beta.
- The operational web UI is intentionally secondary and may stay compact.
- Full quality-based orchestration, external side-effecting action adapters, connector credential governance, SCIM, hosted service features, and advanced analytics are future work.
- Current packages are private workspace packages; no npm publishing workflow is defined yet.

## Quick Start

Prerequisites: Node.js 22, Docker, and Docker Compose.

```bash
npx -y pnpm@11.7.0 install
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 build
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
docker compose -f compose.yaml -f compose.same-origin.yaml up --build -d postgres api worker web proxy
for attempt in $(seq 1 30); do
  curl --silent --show-error --fail http://127.0.0.1:3000/health && break
  if [ "$attempt" = "30" ]; then exit 1; fi
  sleep 1
done
```

Create a local admin key, import the demo corpus, and try a public search:

```bash
bootstrap_json="$(mktemp)"
curl --silent --show-error --fail \
  -H "content-type: application/json" \
  --data '{"tenantId":"tenant_demo","email":"admin@example.test","displayName":"Admin","keyName":"local-alpha-admin"}' \
  http://127.0.0.1:3000/auth/bootstrap > "$bootstrap_json"
export AGENTIC_CMS_API_KEY="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).secret)' "$bootstrap_json")"
rm "$bootstrap_json"

npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- corpus import --api-url http://127.0.0.1:3000 --file corpus/demo/assets.json
curl --silent --show-error --fail "http://127.0.0.1:3000/search?query=PII%20redaction&limit=3"
```

Open the split-origin web UI at `http://127.0.0.1:5175/` or the same-origin proxy at `http://127.0.0.1:8080/`.

## Product Thesis

Most knowledge hubs are built for humans first and then adapted for AI retrieval. Agentic CMS reverses that priority.

The primary product is an instruction control plane:

- agents retrieve current, governed instructions with stable IDs and citations
- admins control which assets can be searched, exported, answered from, or acted on
- AI teams can test, observe, and improve answer quality over time
- humans can still browse operational pages when direct reading is useful

## Initial Direction

The open-source core should prove:

- instruction and document schema
- local users, service accounts, and API keys
- permission-aware retrieval
- REST/OpenAPI
- CLI
- MCP server
- operational web UI
- synthetic/demo corpus
- validation for metadata, links, stale content, and restricted export leakage
- basic telemetry and PII mitigation hooks

The full managed agent orchestration layer is core to the architecture but not the first MVP milestone.

## Repository Status

This repository is currently past the initial scaffold and into the Phase 6 operations/security hardening foundation. It contains:

- the agent-native product goal
- architecture direction
- decision log
- MVP scope
- security model
- synthetic corpus plan
- implementation plan
- TypeScript monorepo scaffold
- shared schema package
- Postgres migration package
- Fastify API health and asset registry routes
- local password/OIDC login, server-capped short-lived scoped login keys, database-backed browser login-session inventory/revocation with device labels, client user-agent metadata, rolling idle timeout enforcement, HttpOnly browser session cookies, signed CSRF protection for cookie-authenticated unsafe browser requests, credentialed CORS origin allowlisting, current-key logout, permission grant, and audit event foundations
- admin API key list/rotate/revoke controls with audited rotation and revocation
- admin API key rotation-due reporting for expired, near-expiry, or missing-expiry service-account keys across API, CLI, MCP, and web
- local group creation/deletion and membership add/remove with group-based restricted asset grants
- admin user listing/update/disable plus operational user/service-account/service-account-policy/API-key controls across API, CLI, MCP, and web
- admin-managed external auth provider configuration plus OIDC/Microsoft Entra authorization-code login, account-linking policy, claim-based group sync, and tenant secret-reference policy controls, without storing client secrets
- Postgres full-text retrieval chunks with citation metadata, transparent weighted ranking metadata, admin-configurable tenant ranking weights, and vector-ready storage hooks
- managed query layer over permission-filtered retrieval, with deterministic answer fallback, provider-routed generation, bounded provider retries, priority fallback attempts, tenant-policy-capped permission-scoped response caching, citations, checks, usage metadata, provider quota preflight, and warnings
- managed query feedback records for outcome acceptance and quality scoring
- deterministic managed query eval cases, persisted run history, schedule policy, and opt-in worker execution for groundedness, citation count, expected source coverage, and overall/tag pass-rate quality gates
- admin managed-query policy for default/allowed modes, citation-floor enforcement, and grounded-context guardrails
- admin-managed model provider configuration, readiness checks, tenant secret-reference policy controls, mounted secret-file fallback, and first provider-backed managed-query execution for OpenAI, Anthropic, and OpenRouter-style routing with priority fallback, without storing provider secrets
- admin-configurable deterministic redaction of common direct identifiers, including common secret/token, email, payment-card-like, phone-number-like, government-ID-like, URL-secret-parameter, and IP-address values, before storing retrieval telemetry queries and managed-query feedback text or deciding provider-cache bypass
- admin telemetry analytics summary over recent retrieval, audit, provider generation usage, managed-query feedback, cache status, and governed asset state
- admin managed-query cache policy, metadata listing, targeted deletion, and expired-row purge controls
- admin managed-query prompt/response retention policy with disabled-by-default capture and metadata-only hash mode
- admin-configurable telemetry retention policy and dry-run/execute purge controls
- opt-in worker telemetry retention maintenance, dry-run by default
- opt-in worker managed-query cache cleanup, dry-run by default
- opt-in worker API-key rotation reminder maintenance, dry-run and deduped by default, with optional signed webhook delivery
- opt-in worker deterministic managed-query eval schedule maintenance, dry-run by default
- Docker Compose Postgres backup, restore, and non-destructive restore verification helpers
- Docker Compose deployment, rollback, backup/restore, key rotation, and restricted leakage investigation runbooks
- Docker Compose same-origin reverse-proxy overlays for serving the web UI and API through one browser origin over local HTTP or HTTPS with operator-supplied TLS certificates
- asset update and version restore operations with audit events and retrieval reindexing
- asset publish operations that make only `active` + `approved` `public-demo` assets anonymously readable
- asset review queue and review-complete operations for stale, draft, reviewing, or otherwise non-current governance items
- asset version snapshot inspection for rollback previews and current-versus-selected comparison
- deterministic asset/corpus validation for required metadata, stale reviews, internal references, surface consistency, and restricted public exports
- executable restricted leakage verifier for API/search/export permission gates
- GitHub Actions CI for typechecking, strict demo corpus validation, and Postgres-backed tests
- OpenAPI route for the current REST contract
- CLI health, capabilities, validation, auth, OIDC login/logout, login-session inventory/revocation, audit-event, admin provider-config/provider-health/auth-provider-config/secret-reference/PII-redaction/cache-policy/retrieval-ranking-policy/managed-query-retention/eval-schedule/action-execution-policy, asset, review-queue, version inspection, corpus import, search, managed query, managed-query feedback/eval/eval-history, action request/list/decision with tenant request-rate limits, idempotency keys, and approval-expiry controls, telemetry summary/retention, and AI export commands
- MCP permission-filtered asset list/fetch/version/search/review-queue/review/managed-query/feedback/eval/eval-history/eval-schedule/action-execution-policy/action-request/list/decision/OIDC-login/login-session/audit-event/provider-config/provider-health/auth-provider-config/secret-reference/PII-redaction/cache-policy/retrieval-ranking-policy/managed-query-retention/telemetry-retention/validate/export and publish tools
- worker indexing process plus opt-in scheduled telemetry retention, managed-query cache, deterministic eval schedule, and deduped API-key rotation reminder maintenance with optional signed webhook delivery
- operational web UI for password and OIDC cookie-backed login/logout through either the same-origin `/api` proxy overlay or an origin-allowlisted API with CSRF-protected unsafe browser requests, browsing assets, inspecting details, loading a review queue, marking assets reviewed, publishing, previewing version diffs, restoring versions, searching, running managed queries, generating export packages, and viewing audit/retrieval events, user/service-account/group/API-key/login-session operations, managed-query cache policy/metadata/deletion, retrieval ranking policy controls, action execution policy, approval-expiry, and scoped idempotent request controls, secret-reference and PII-redaction policy controls, managed-query feedback, deterministic eval reports and recent run history, and provider/auth-provider config plus provider health with an admin key or browser session
- Docker Compose configuration with a first-run migration gate and configurable local host ports
- synthetic demo corpus

The registry, auth, retrieval, validation, delivery-surface, and first operations foundations can create, list, fetch, update, inspect versions, list review-queue items, mark assets reviewed, publish, restore, validate, import, bootstrap users/API keys, log in local password or configured OIDC users, set HttpOnly browser session and refresh cookies plus signed CSRF cookies for web login, serve the browser UI and API through a same-origin `/api` proxy overlay over HTTP or HTTPS, start a clean Docker Compose deployment with migrations gated before API/worker startup, list and revoke database-backed browser login sessions with device labels and safe client metadata, enforce configurable rolling idle and absolute lifetime caps for cookie-backed browser sessions, rotate one-time browser refresh tokens without returning refreshed access secrets to JavaScript, revoke the current login key on logout, sync configured OIDC group claims into group grants, list/create/update/disable users and service accounts, configure tenant service-account limits and default service-key expiry, create/delete groups, add/remove group members, list/create/rotate/revoke user-owned or service-owned API keys, report service-account keys that are expired, near expiry, or missing expiry, run dry-run-first deduped worker rotation reminder maintenance with optional signed webhook delivery, grant document-level user, group, or service-account access, filter restricted reads/searches and managed queries, return citations, apply admin-configurable tenant retrieval ranking weights, record redacted retrieval telemetry according to tenant PII redaction policy with high-signal secret-token coverage, collect redacted managed-query outcome feedback, run deterministic managed-query evals with persisted run history plus overall and tag-level pass-rate gates, configure admin eval schedule policy, execute due eval schedules through the opt-in worker, enforce tenant managed-query mode/citation/grounding policy, store disabled-by-default tenant action execution policy and durable redacted action requests with tenant request-rate limits, configurable approval expiry, and approval/denial/retry audit evidence behind admin or `agent:execute` scoped request credentials, dedupe retried action submissions with scoped idempotency keys, run dry-run-first opt-in worker maintenance to mark expired pending approvals, inspect a recent-window telemetry analytics summary with provider generation usage and cache status, configure tenant telemetry retention and run manual or opt-in worker purge operations, configure tenant generated-answer cache policy, inspect managed-query cache metadata, delete individual cache entries by key, purge expired cache rows manually or through opt-in worker cleanup, invalidate tenant generated-answer cache entries after governed asset source changes, configure managed-query prompt/response retention posture with disabled or metadata-only capture, configure tenant PII redaction rule policy for telemetry/feedback/cache-bypass decisions, manage model provider and external auth provider configuration without storing secrets, restrict which deployment env vars those configs may reference, resolve configured provider/OIDC secrets from env vars or mounted secret-file companions, inspect provider readiness, run a provider-backed managed-query path over permission-filtered context with deterministic fallback, bounded provider retries, priority provider fallback, preflight quota caps, and tenant-policy-capped permission-scoped response caching, serve OpenAPI, generate permission-filtered AI export packages, verify Postgres backup/restore safety, and run the core checks in CI. Richer analytics dashboards, SCIM and advanced external group mapping, multi-step approval workflows, raw transcript retention/review, remembered-device trust policy, full quality-based orchestration/routing policy, hosted secret-manager adapters, ACME/managed ingress automation, notification delivery preferences/escalation, semantic caching, LLM-as-judge automation, connector credential governance, and external side-effecting action adapters are still future phases.

## Docs

- [Alpha Release Checklist](docs/ALPHA_RELEASE_CHECKLIST.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Product Goal](docs/PRODUCT_GOAL.md)
- [End-To-End Goal](docs/END_TO_END_GOAL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Technical Specification](docs/TECHNICAL_SPEC.md)
- [Decisions](docs/DECISIONS.md)
- [MVP Scope](docs/MVP_SCOPE.md)
- [Security Model](docs/SECURITY_MODEL.md)
- [Development](docs/DEVELOPMENT.md)
- [Synthetic Corpus Plan](docs/SYNTHETIC_CORPUS_PLAN.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Roadmap](docs/ROADMAP.md)
- [Backup And Restore Runbook](docs/runbooks/BACKUP_RESTORE.md)
- [Docker Compose Deploy Runbook](docs/runbooks/DEPLOY_DOCKER_COMPOSE.md)
- [Rollback Runbook](docs/runbooks/ROLLBACK.md)
- [API Key Rotation Runbook](docs/runbooks/API_KEY_ROTATION.md)
- [Restricted Leakage Investigation Runbook](docs/runbooks/RESTRICTED_LEAKAGE_INVESTIGATION.md)

## License

[Apache License 2.0](LICENSE).

The open-core boundary is still being refined, but the default position is that the self-hostable core should remain genuinely useful without a hosted service.

## Community And Support

- Use GitHub issues for reproducible bugs and concrete feature requests after the repo is public.
- Use the security policy for vulnerability reports.
- Public alpha support is best effort; compatibility guarantees start later.
