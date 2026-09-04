# Development

## Prerequisites

- Node.js
- npm
- Docker Desktop or a compatible Docker daemon for Compose checks

The repo pins pnpm in `package.json`. If `pnpm` is not installed globally, use `npx -y pnpm@11.7.0 ...`.

## Install

```bash
npx -y pnpm@11.7.0 install
```

The workspace explicitly allows the `esbuild` build script through `allowBuilds` in `pnpm-workspace.yaml`. This is required by Vite and keeps pnpm's build-script approval narrow.

## Verification

For a controlled deployed trial, use [Private Live UAT](PRIVATE_LIVE_UAT.md) in addition to the deterministic gates below. That workflow keeps the repository private and separates user-testing evidence from later public-release proof.

Use `npx -y pnpm@11.7.0 private-live:isolated-proof` for the local clean-stack proof. It creates a unique Compose project, runs Postgres-backed repository tests plus the seeded runtime and browser gates, records evidence under `work/private-live-proof/`, and removes its containers and volumes.

```bash
npx -y pnpm@11.7.0 public-beta:preflight
```

The preflight script is the local, non-Docker public beta gate. The broader local verification set is:

```bash
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 build
npx -y pnpm@11.7.0 web:bundle-budget
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 public-beta:check
npx -y pnpm@11.7.0 test:uat
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 security:check-deployment-defaults
docker compose config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
```

The deployment-default check inspects templates and resolved Compose configurations. It requires Docker Compose but does not require a running Docker daemon. It preserves local Compose bootstrap defaults, verifies the same-origin/TLS/Railway public template guardrails, and only enforces public-deployment env requirements when `FORGETBASE_PUBLIC_DEPLOYMENT=true`.

Run the Compose/API/export/leakage smoke gate against a running local stack after importing the demo corpus:

```bash
npx -y pnpm@11.7.0 smoke:compose
```

The smoke gate validates the base, same-origin, and TLS Compose configs, then checks `/health`, `/openapi.json`, JSON and OKF `demo-agent-pack` exports, and restricted leakage through the running API. It does not start or stop containers. If the API is not on `http://127.0.0.1:3000`, set `FORGETBASE_API_URL`. If export checks report 0 assets, import `corpus/demo/assets.json` into the running API first.

With Docker Compose API running, run the restricted leakage smoke check:

```bash
npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

With Docker Compose API running and `FORGETBASE_OIDC_STATE_SECRET` set for the API service, run the local fake-provider OIDC smoke check:

```bash
npx -y pnpm@11.7.0 auth:verify-oidc-login
```

Run the public-beta browser proof after the web build. Without `UAT_BASE_URL`, the command serves `apps/web/dist` locally and verifies the public entry at desktop and mobile widths:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/web build
npx -y pnpm@11.7.0 test:uat
```

For release proof, run against a same-origin app/API stack and require login:

```bash
UAT_BASE_URL=http://127.0.0.1:8080/ UAT_MODE=release UAT_EXPECT_ROLE=admin npx -y pnpm@11.7.0 test:uat
```

Set `UAT_EXPECT_ROLE=reader` with reader credentials to prove reader accounts are forced back to `#reader` and do not see the admin console handoff.

Before tagging or announcing public beta, create the release proof manifest from `docs/PUBLIC_BETA_RELEASE_PROOF.template.json` and validate it:

```bash
npx -y pnpm@11.7.0 release-proof:collect
npx -y pnpm@11.7.0 release-proof:check work/public-beta-proof/public-beta-release-proof.json
```

The collector writes a draft manifest from current repo facts and expected evidence paths. The manifest must still point to real screenshots, CI read-backs, stack-backed checks, GitHub security read-backs, known limitations, and support policy evidence before `release-proof:check` will pass. Run `npx -y pnpm@11.7.0 github:public-beta:check` after the repository settings are ready and include its JSON output in the manifest. These release checks intentionally stay out of default CI because they depend on a live demo URL, a seeded app/API stack, and GitHub repository settings.

## CI

The GitHub Actions workflow at `.github/workflows/ci.yml` runs on pushes to `main` and pull requests.

It uses official GitHub actions pinned to immutable commit SHAs, installs with the repo-pinned `pnpm@11.7.0`, then runs deterministic, secret-free beta gates: typecheck with unused-code enforcement, build, `web:bundle-budget`, `public-beta:check`, static public browser UAT with screenshot artifact upload, strict demo corpus validation, static Compose config parsing for the base, same-origin, and TLS overlays, `openapi:check`, `claims:lint`, `contracts:check`, `security:check-deployment-defaults`, and the test suite against a digest-pinned `pgvector/pgvector:pg17` Postgres service through `TEST_DATABASE_URL`.

The separate `.github/workflows/private-live-proof.yml` workflow runs on pushes to `main` or manual dispatch. It owns an isolated Compose project and runs `private-live:isolated-proof`, then uploads the non-secret proof bundle for 14 days. It does not run for pull requests and does not publish or deploy the repository.

The older API, CLI, SDK, and MCP contract is documented in [ForgetBase Private Beta Contract](BETA_PRIVATE_CONTRACT.md). That contract is narrower than the full route surface; broader admin/provider/telemetry/action routes remain preview unless a later contract update moves them into scope.

Default CI intentionally does not run `auth:verify-oidc-login`, real-provider smoke checks, or authenticated UAT against the externally deployed live instance. The isolated private-live workflow covers the disposable local-stack smoke, restricted-leakage, backup/restore, and authenticated reader/admin paths without using customer data or provider secrets; exact deployed-commit proof and human UAT remain release gates.

## API Smoke Check

```bash
PORT=3100 node apps/api/dist/index.js
curl --silent --show-error --fail http://127.0.0.1:3100/health
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- health --api-url http://127.0.0.1:3100
```

Stop the API process after the check.

## Registry And Corpus Smoke Check

When the Docker Compose API/worker services start through `compose.yaml`, the one-shot `migrate` service runs first and gates API/worker startup. If you start only Postgres through Compose and run API or worker directly on the host, run migrations manually:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:${FORGETBASE_POSTGRES_PORT:-5432}/forgetbase npx -y pnpm@11.7.0 db:migrate
```

The migration runner holds a Postgres advisory lock while it creates `schema_migrations` and applies files. Concurrent host-run API, worker, test, or CLI processes should wait and then skip already-applied migrations instead of racing catalog changes.

Bootstrap the first local admin user and API key:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth bootstrap --email admin@example.test --display-name "Admin" --password local-dev-password
```

The bootstrap command returns the API key secret once. Set `FORGETBASE_API_KEY` for CLI commands; this avoids printing the raw key through package-manager script echo. The CLI also supports `--api-key ...` for controlled one-off use.

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- corpus import --api-url http://127.0.0.1:3000 --file corpus/demo/assets.json
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets list --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets get guardrail.pii-redaction --api-url http://127.0.0.1:3000
curl --silent --show-error --fail http://127.0.0.1:3000/assets
```

Public demo assets are readable without a key only after they are both `active` and `approved`. Draft or reviewing public-demo assets require an authenticated key until an admin or maintainer publishes them. Non-public assets require a scoped key and a matching grant unless the key belongs to an admin user.

Validate a corpus before import:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16
```

Validation errors fail the command. Stale review dates and consistency risks are reported as warnings by default; add `--fail-on-warnings` when you want a strict gate.

Create a new version, publish an asset, and restore an older version:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets update <stable-id> --file update.json
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets version <stable-id> --version-number 1
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets review-queue --as-of 2026-06-16
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets review <stable-id> --review-due-at 2027-06-30 --change-note "Review current guidance"
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets publish <stable-id> --review-due-at 2027-06-30 --change-note "Approve release"
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets restore <stable-id> --version-number 1
```

Version inspection returns historical instruction/document content without changing the current asset pointer. Review queue listing returns stale, not approved, or not active assets for maintainers/admins. Update, review, and publish each create an immutable governed snapshot; restore moves the current pointer to an existing snapshot. All four operations write audit events and reindex retrieval chunks for the asset.

## Auth And Permission Smoke Check

Use the admin key from bootstrap:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth me
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth login --email admin@example.test --password "$FORGETBASE_PASSWORD" --device-label "CLI on work laptop"
FORGETBASE_API_KEY="$FORGETBASE_LOGIN_API_KEY" npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth sessions
FORGETBASE_API_KEY="$FORGETBASE_LOGIN_API_KEY" npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth session-revoke --session-id <login-session-id>
FORGETBASE_API_KEY="$FORGETBASE_LOGIN_API_KEY" npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth logout
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth user-create --email reader@example.test --display-name "Reader" --role reader
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth user-list
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth user-update --user-id <reader-user-id> --display-name "Reader" --status active
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth service-account-create --slug automation --name "Automation" --role reader
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth service-account-list
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth service-account-update --service-account-id <service-account-id> --status active
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin service-account-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin service-account-policy-set --max-service-accounts 50 --max-active-api-keys 5 --default-key-expires-in-days 90
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth group-create --slug ai-readers --name "AI Readers"
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth group-member-add --group-id <group-id> --user-id <reader-user-id>
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth group-members --group-id <group-id>
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth group-member-remove --group-id <group-id> --user-id <reader-user-id>
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth group-delete --group-id <group-id>
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-create --user-id <reader-user-id> --name reader --scopes asset:read --allowed-surfaces web,api
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-create --service-account-id <service-account-id> --name automation --scopes agent:execute --allowed-surfaces mcp,api
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-list
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-rotation-due --due-within-days 30
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-rotate --api-key-id <old-api-key-id> --name reader-rotated
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-revoke --api-key-id <old-api-key-id>
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- audit events --limit 100
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth grant --stable-id <restricted-stable-id> --principal-type group --principal-id <group-id> --surfaces cli,mcp
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth grant --stable-id <restricted-stable-id> --principal-type service-account --principal-id <service-account-id> --surfaces api,mcp
```

API keys carry an `allowedSurfaces` binding. The server honors a bearer client's `x-forgetbase-surface` assertion only when that surface is bound to the authenticated key, then intersects it with the asset and permission-grant surfaces. Use `--allowed-surfaces` when creating a narrower automation key; bootstrap and interactive login keys retain all supported surfaces for first-run CLI/MCP compatibility. Rotation preserves the old key's allowed surfaces.

Local password login issues a short-lived scoped API key; by default the key expires after 12 hours and scopes are derived from the user's role. `FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS` caps password/OIDC login-created keys and matching browser cookies to a deployment-configured maximum, defaulting to 43200 seconds. Values must be whole seconds between 60 and 2592000. Password and OIDC login also create a database login-session record, store optional device-label and bounded client user-agent inventory metadata, store an absolute browser-session expiry when enabled, create a hash-only one-time refresh-token row, and set an `HttpOnly`, `SameSite=Lax` browser session cookie over that short-lived key plus an `HttpOnly`, `SameSite=Lax` refresh cookie and a readable signed CSRF cookie. The operational web UI uses the cookies and removes JavaScript-readable login-key storage, while CLI, MCP, SDK, and direct API clients keep using bearer keys. Cookie authentication requires both a valid login key and an active, absolute-unexpired login-session record, so admin-created and service-account keys cannot be used as browser session cookies. Cookie-authenticated requests update `lastSeenAt` and enforce `FORGETBASE_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS`; Compose defaults to 14400 seconds, and `0` disables idle-timeout enforcement. `FORGETBASE_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS` controls hard browser-session lifetime from login time; Compose defaults to 2592000 seconds, and `0` disables the absolute cap. `FORGETBASE_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS` controls refresh-cookie lifetime; Compose defaults to 604800 seconds, and `0` disables refresh-token issuance. `POST /auth/session/refresh` uses the refresh cookie to rotate the refresh token, revoke the old login key, update the login session to a new short-lived key capped by the absolute expiry, preserve the session label/client metadata, and set fresh HttpOnly cookies without returning the new raw login key in the JSON body. Unsafe browser requests authenticated by the session cookie must echo the CSRF cookie in `x-forgetbase-csrf`; bearer clients do not need this header. Users can list and revoke their own login sessions with `auth sessions` and `auth session-revoke`; admins can list and revoke tenant sessions. Session lists expose device labels and client user-agent metadata but no raw secrets. Revoking a login session revokes its underlying login key and refresh tokens, and clears cookies when it is the current session. Logout clears the browser cookies and revokes the current session/key and refresh tokens. Set `FORGETBASE_SESSION_COOKIE_SECURE=true` on the API when serving the web UI over HTTPS; leave it unset for local HTTP development. Set `FORGETBASE_CORS_ALLOWED_ORIGINS` to the comma-separated web origins allowed to send credentialed browser requests; local Compose defaults to `http://127.0.0.1:5175,http://localhost:5175`. Admins can create, list, update, and disable users and service accounts, configure service-account policy, create/delete groups, add/remove users from groups, and grant restricted asset access to a user, group, or service-account principal. The service-account policy defaults to 50 service accounts per tenant, five active API keys per service account, and a 90-day default expiry for service-owned keys that do not pass an explicit expiry. Use `unlimited`, `none`, or `null` with the matching policy command flag to clear a limit or default expiry. For longer-lived automation credentials, create user-owned or service-owned API keys through admin APIs rather than raising the interactive login session cap. Group deletion removes local memberships and group-based permission grants. User updates can change display name, role, status, or reset a password; disabled users immediately fail password login, cookie authentication, refresh, and API-key authentication. Disabled service accounts immediately fail API-key authentication. API key create and rotation responses return the raw secret once; list, rotation-due, session, refresh, and web readouts include previews and timestamps, not raw secrets. Rotation-due reporting lists service-owned keys that are expired, near expiry, or missing expiry by default; pass `--include-user-keys true` when auditing human-owned keys too. Worker rotation reminder maintenance uses the same report, defaults to dry-run, records tenant-scoped reminder audit events only when executed, skips duplicate tenant/key-state evidence inside the configured dedupe window, and can deliver non-duplicate executed reports to an optional signed webhook without raw secrets or secret previews. Rotation creates a replacement from the old key's owner, scopes, and expiry; add `--revoke-old` only when you want the old key disabled in the same operation. Revoked keys immediately fail authentication. Login, refresh, logout, login-session revocation, user creation/update, service-account creation/update, service-account policy updates, group creation/member addition/member removal/deletion, permission grants, key creation, rotation, and revocation are recorded in audit events.

See [API Key Rotation Runbook](runbooks/API_KEY_ROTATION.md) for staged and emergency rotation procedures.

Run the live Postgres integration test with:

```bash
TEST_DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 test
```

## Search And Retrieval Smoke Check

Rebuild the retrieval index for existing assets:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --once
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --retention-once
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --cache-purge-once
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --api-key-rotation-reminders-once --due-within-days 14 --dedupe-window-hours 24
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --managed-query-evals-once
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --action-approval-expiry-once
```

Search public demo assets:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- search --query "PII redaction" --limit 3 --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- search --query "PII redaction" --limit 3 --strategy hybrid --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent query --query "PII redaction" --limit 3 --api-url http://127.0.0.1:3000
curl --silent --show-error --fail "http://127.0.0.1:3000/search?query=PII%20redaction&limit=3"
curl --silent --show-error --fail "http://127.0.0.1:3000/search?query=PII%20redaction&limit=3&strategy=vector"
```

Search results include `ranking.strategy`, lexical rank, source-kind weight, exact-phrase boost, optional vector similarity, optional vector weight, optional embedding provider/model/dimensions, and final score. The default `lexical` strategy returns `lexical-weighted-v1`. `vector` returns `vector-hash-v1` with local hash embeddings or `vector-provider-v1` with provider embeddings. `hybrid` returns `hybrid-hash-lexical-v1` with local hash embeddings or `hybrid-provider-lexical-v1` with provider embeddings. Admins can tune tenant source-kind weights and exact-phrase boost through the retrieval ranking policy.

By default, vector modes use deterministic local hash embeddings stored in `pgvector`. To use OpenAI-compatible semantic embeddings, configure the same env vars on the API and worker, then reindex assets with the worker:

```bash
FORGETBASE_EMBEDDINGS_PROVIDER=openai
FORGETBASE_EMBEDDINGS_API_KEY_ENV_VAR=OPENAI_API_KEY
FORGETBASE_EMBEDDINGS_MODEL=text-embedding-3-small
FORGETBASE_EMBEDDINGS_BASE_URL=https://api.openai.com/v1
FORGETBASE_EMBEDDINGS_DIMENSIONS=1536
FORGETBASE_EMBEDDINGS_TIMEOUT_MS=30000
```

`FORGETBASE_EMBEDDINGS_API_KEY_ENV_VAR` stores the name of the env var that contains the provider secret; do not put the secret value in config or docs. Provider/model/dimension metadata is stored on each chunk, and vector/hybrid search only compares query vectors with chunks from the same embedding space. If the API uses provider embeddings before the worker has reindexed chunks with the same provider/model, vector-only searches will return no matches and hybrid searches will fall back to lexical matches with zero vector similarity for old chunks.

Search returns citation-bearing chunks. Restricted chunks are filtered unless the request has an authorized scoped API key and matching grant.

The managed query command calls `/agent/query`. By default it returns a deterministic answer draft assembled from permission-filtered retrieval results, citations, grounding checks, and warnings. Authenticated clients can opt into provider-routed mode after an admin enables provider config and the deployment exposes the referenced provider secret env var:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent query --query "PII redaction" --mode provider-routed --provider openai --cache true
```

Provider-routed mode sends only permission-filtered retrieval context to providers and falls back to the deterministic answer when config, env vars, permitted context, quota preflight, or generation fail. If `--provider` is supplied, routing is strict to that provider. If `--provider` is omitted, enabled provider configs are tried by ascending priority until one completes, and the response/audit metadata includes safe attempt status fields. Provider usage metadata returns input/output/total tokens when the provider reports them. Optional provider config metadata keys `inputCostPerMillionTokens` and `outputCostPerMillionTokens` enable an estimated USD cost field; leave them unset if you do not want local cost estimation.

Provider-routed responses use the managed-query cache when a cache repository is available, the tenant cache policy is enabled, the request does not pass `--cache false`, the provider config does not set `cacheEnabled: false`, and the query does not trigger telemetry redaction. Cache keys are hashes of the tenant, principal, provider/model, normalized query, surface, limit, and fresh permission-filtered context signature. Cached entries store the generated answer and normalized generation metadata until the provider `cacheTtlSeconds` expires, capped by the tenant cache policy's `maxCacheTtlSeconds` default of 3600 seconds. Set the tenant max TTL to `null` to remove the tenant cap while keeping provider TTL validation. Prompts, provider request bodies, provider API keys, and raw query text are not stored in the cache record. Asset create, content update, review-complete, publish, and restore operations invalidate tenant generated-answer cache entries after retrieval reindexing, so source changes force provider-routed answers to regenerate.

Provider config metadata also supports bounded retry controls. `maxRetries` defaults to `0` and is clamped from `0` to `3`; `retryBackoffMs` defaults to `250` and is clamped from `0` to `10000`. Failed provider calls and empty responses are recorded as failed generation attempts, then retried before provider-priority fallback or deterministic fallback. Retry attempts are stored as safe attempt metadata only; prompts, provider request bodies, and provider secrets are still not stored.

Managed-query feedback can be submitted against a telemetry event ID and listed by admins:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent feedback --telemetry-event-id retrieval_1 --query "PII redaction" --outcome accepted --factual-citation-accuracy 5
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent feedback-list
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- telemetry summary
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin retrieval-ranking-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin retrieval-ranking-policy-set --agent-instruction-weight 1.2 --asset-summary-weight 1.1 --human-document-weight 1 --exact-phrase-boost 0.25
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-policy-set --default-mode deterministic-retrieval --allowed-modes deterministic-retrieval,provider-routed --minimum-citation-count 1 --require-grounded false
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-cache
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-cache-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-cache-policy-set --cache-enabled true --max-cache-ttl-seconds 3600
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-cache-delete --cache-key <cache-key>
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-cache-purge
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-cache-purge --execute
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-retention-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-retention-policy-set --prompt-capture-mode metadata-only --response-capture-mode metadata-only --metadata-retention-days 30
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin action-execution-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin action-execution-policy-set --enabled true --allowed-action-types create-task-record --require-approval true --dry-run-default false --kill-switch false --max-requests-per-hour 60 --approval-expires-in-minutes 1440
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent action-execute --action-type create-task-record --title "Create review task" --idempotency-key review-task-2026-06-17 --dry-run false # requires admin or agent:execute
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent action-list
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent action-decision --action-request-id <action-request-id> --decision approve --reason "Approved for internal task tracking"
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin secret-reference-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin secret-reference-policy-set --allowed-prefixes FORGETBASE_,OPENAI_,ANTHROPIC_,OPENROUTER_,ENTRA_,OIDC_ --allowed-env-vars CUSTOM_PROVIDER_SECRET --allow-unlisted false
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin pii-redaction-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin pii-redaction-policy-set --redaction-enabled true --enabled-rule-kinds api-key,bearer-token,credit-card,email,government-id,ip-address,jwt,phone,url-secret
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- telemetry retention
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- telemetry retention-set --retrieval-event-days 30 --audit-event-days 365 --feedback-days 90
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- telemetry purge
```

Managed-query eval cases run deterministic checks for groundedness, minimum citation count, expected stable IDs, and optional overall/tag pass-rate thresholds. Use `--fail-on-threshold true` for CI-style quality gates:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent eval --file corpus/demo/evals.json --minimum-pass-rate 1 --tag-minimum-pass-rates citation-accuracy=1,policy-compliance=1,task-completion-quality=1 --fail-on-threshold true
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent eval-runs --limit 10
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent eval-summary --limit 20
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-eval-schedule-policy
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin managed-query-eval-schedule-policy-set --enabled true --interval-minutes 1440 --file corpus/demo/evals.json
```

Successful and failing eval reports are persisted to `managed_query_eval_runs` when a database-backed or in-memory eval-run repository is available. The table stores normalized summary fields plus the structured deterministic report, not provider prompts, provider request bodies, or raw generated-answer transcripts. Stored eval report query text uses the tenant PII redaction policy, and `agent eval-summary` reads recent run history to summarize pass rates, thresholds, modes, tags, and recent run cards.

The admin eval schedule policy stores replayable deterministic eval input inline so the worker can run due quality gates without a human admin API key. Use sanitized synthetic or approved eval prompts in the schedule policy; run history still redacts stored report query text with the tenant PII policy. The schedule is disabled by default and can be previewed with `--managed-query-evals-once`; add `--execute` only after reviewing due counts.

Admin provider configuration can be managed without storing provider secrets. Store the actual provider secret in the deployment environment and reference only the env var name. The API first reads that env var directly; if it is unset, it reads an absolute mounted-secret path from the derived `<ENV_VAR>_FILE` env var, such as `OPENAI_API_KEY_FILE=/run/secrets/openai_api_key`. The tenant secret-reference policy defaults to allow common ForgetBase, OpenAI, Anthropic, OpenRouter, Entra, and OIDC prefixes while rejecting unrelated env vars such as `PATH`; admins can add exact env-var names, change allowed prefixes, or explicitly allow all valid env-var names for unusual self-hosted deployments.

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin model-provider-set --provider openai --enabled true --api-key-env-var OPENAI_API_KEY --default-model gpt-5.1 --models gpt-5.1 --max-output-tokens 700 --temperature 0.2 --timeout-ms 20000 --max-retries 1 --retry-backoff-ms 250 --input-cost-per-million-tokens 2 --output-cost-per-million-tokens 8 --max-estimated-total-tokens-per-query 3000 --max-estimated-cost-usd-per-query 0.05 --cache-enabled true --cache-ttl-seconds 3600
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin model-providers
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin model-provider-health
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin auth-provider-set --provider microsoft-entra --issuer-url https://login.microsoftonline.com/<tenant-id>/v2.0 --client-id forgetbase --client-secret-env-var ENTRA_CLIENT_SECRET --redirect-uri http://localhost:5175/ --group-claim groups --group-sync-enabled true --account-linking-mode verified-email --auto-provision-users true --allowed-domains example.com
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin auth-providers
```

External auth provider config stores metadata and the client secret env var name only. Store actual client secrets in deployment environment variables, mounted secret files referenced by `<ENV_VAR>_FILE`, or a future secret manager, not in config metadata. Model provider `apiKeyEnvVar` and auth provider `clientSecretEnvVar` writes are rejected when the env-var name is not allowed by tenant secret-reference policy.

OIDC login requires a state-signing secret in the API environment:

```bash
export FORGETBASE_OIDC_STATE_SECRET="$(openssl rand -base64 32)"
```

Start and complete an OIDC login from the CLI:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth oidc-start --provider microsoft-entra --tenant-id tenant_demo --redirect-uri http://localhost:5175/
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth oidc-callback --provider microsoft-entra --tenant-id tenant_demo --code <authorization-code> --state <signed-state> --nonce <nonce> --code-verifier <code-verifier>
```

The callback validates signed state, nonce, PKCE verifier, issuer, audience, and ID-token signature before issuing a short-lived scoped API key. Users are resolved by external issuer/subject first. Existing active email users can be linked according to `accountLinkingMode`; the default `verified-email` requires an `email_verified` claim. Unknown users require `autoProvisionUsers`. If `groupSyncEnabled` and `groupClaim` are configured, login syncs external groups before the key is issued.

To verify the OIDC path without external provider credentials, use the local fake-provider smoke check:

```bash
npx -y pnpm@11.7.0 auth:verify-oidc-login
```

Stored retrieval telemetry, managed-query feedback text, and action request payload/metadata string fields redact common direct identifiers in persisted fields by default. Current deterministic rules cover API-key-like secrets, including common provider, cloud, repository, and chat-ops token prefixes, bearer/JWT tokens, URL secret parameters, email addresses, payment-card-like numbers, government-ID-like values, IP addresses, and phone-number-like values. Admins can disable redaction or select a subset of rule kinds through the tenant PII redaction policy; the same policy controls whether provider-routed generated-answer caching bypasses direct-identifier queries. Live search and managed-query responses still echo the user's query so clients can correlate the response they just received.

Telemetry purge defaults to dry-run. Add `--execute` only after reviewing the preview counts. Use `forever`, `none`, or `null` for a retention stream that should not be purged by policy.

```bash
curl --silent --show-error --fail "http://127.0.0.1:3000/search?query=PII%20redaction%20for%20jane%40example.test%20from%20203.0.113.42%20with%20code%3Dabcdef123456&limit=3"
```

## OpenAPI And Export Smoke Check

With Docker Compose API running:

```bash
npx -y pnpm@11.7.0 smoke:compose
curl --silent --show-error --fail http://127.0.0.1:3000/openapi.json
curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack"
curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1"
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- exports ai-package --package demo-agent-pack --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- exports ai-package --package demo-agent-pack --format okf --okf-version 0.1 --output-dir work/okf-demo-agent-pack --api-url http://127.0.0.1:3000
```

The public demo export is available without an API key. Non-public export assets require a key with permission for the `export` action on the `export` surface. OKF support is enabled by default as a versioned export format; see [OKF Exports](OKF_EXPORTS.md) for spec-update and regeneration rules.

Run the restricted leakage verifier before release or after permission/export changes:

```bash
npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

## Web UI Smoke Check

With Docker Compose API and web running, open:

```text
http://127.0.0.1:5175/
```

For local split-origin Vite checks, the login form defaults to `http://127.0.0.1:3000`, `tenant_demo`, `admin@example.test`, and the temporary local password `local-dev-password` on `localhost:5173` / `127.0.0.1:5173`. This prefill is only for disposable local UI review and is not used by the same-origin proxy, preview, or deployed builds.

For a production-like same-origin browser smoke check, start the proxy overlay and open:

```bash
docker compose -f compose.yaml -f compose.same-origin.yaml up -d proxy
curl --silent --show-error --fail http://127.0.0.1:8080/api/health
```

```text
http://127.0.0.1:8080/
```

For an HTTPS same-origin smoke check with local self-signed certificates:

```bash
bash scripts/generate-local-tls-certs.sh
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml up -d proxy
curl --insecure --silent --show-error --fail https://127.0.0.1:8443/api/health
```

```text
https://127.0.0.1:8443/
```

The UI defaults to `http://127.0.0.1:3000` on the local `5175` preview and to `/api` through the same-origin proxy. The UI should show API status, password/OIDC cookie-backed login controls, a sign-out control, manual API key entry, visible assets, asset detail, downloadable page attachments with inspection state, release controls, current-versus-selected version previews, citation-backed search results, a compact managed-query runner, and the public `demo-agent-pack` export summary. With an admin key, manual API key, or CSRF-protected browser session, the Operations panel can also upload/delete inspected attachments, preview attachment storage drift and run a deeper dry-run integrity check, compare 7/30/90-day search quality, page activity, content health, and daily trends, load a review queue, mark selected assets reviewed, load retrieval telemetry and audit events, create/list/update/disable users and service accounts, configure service-account policy, configure retrieval ranking weights, configure managed-query mode/citation/grounding policy, configure managed-query cache policy, configure managed-query prompt/response retention posture, configure eval schedule policy, configure action execution policy including the tenant hourly request cap and approval-expiry window, request internal action records with optional idempotency keys using admin or `agent:execute`, approve/deny pending non-expired action requests, configure secret-reference policy, inspect and delete cache metadata, create/list/delete groups, add/list/remove group members, list/create/rotate/revoke user-owned or service-owned API keys, list/revoke browser login sessions, inspect managed-query feedback, run deterministic demo evals, and manage provider/auth-provider configuration including OIDC account-linking and group-sync settings.

## Worker Smoke Check

```bash
node apps/worker/dist/index.js --once
node apps/worker/dist/index.js --retention-once
node apps/worker/dist/index.js --cache-purge-once
node apps/worker/dist/index.js --api-key-rotation-reminders-once --due-within-days 14 --dedupe-window-hours 24
node apps/worker/dist/index.js --api-key-rotation-reminders-once --due-within-days 14 --dedupe-window-hours 24 --notification-webhook-url https://ops.example.test/forgetbase/key-rotation --execute
node apps/worker/dist/index.js --managed-query-evals-once
node apps/worker/dist/index.js --managed-query-evals-once --execute
node apps/worker/dist/index.js --action-approval-expiry-once
node apps/worker/dist/index.js --action-approval-expiry-once --execute
```

Retention maintenance uses the stored tenant policy and defaults to dry-run. Add `--execute` for one-off deletion after reviewing counts. For the long-running worker, scheduled retention is disabled by default; set `FORGETBASE_RETENTION_PURGE_ENABLED=true` to schedule it, keep `FORGETBASE_RETENTION_PURGE_DRY_RUN=true` for previews, and set `FORGETBASE_RETENTION_PURGE_INTERVAL_MS` to control the interval.

Managed-query cache cleanup removes expired cache rows only and defaults to dry-run. Add `--execute` to `--cache-purge-once` after reviewing counts. For the long-running worker, scheduled cache cleanup is disabled by default; set `FORGETBASE_CACHE_PURGE_ENABLED=true` to schedule it, keep `FORGETBASE_CACHE_PURGE_DRY_RUN=true` for previews, and set `FORGETBASE_CACHE_PURGE_INTERVAL_MS` to control the interval.

API-key rotation reminder maintenance reports service-account keys that are expired, close to expiry, or missing expiry metadata. It defaults to dry-run and exposes tenant counts, reminder counts, audit-event counts, duplicate-skip counts, and notification-delivery counts in the worker log. Add `--execute` to `--api-key-rotation-reminders-once` after reviewing counts; execution records one audit event per tenant with key IDs, owner type, state, and days until expiry, but no raw secrets or secret previews. The default `--dedupe-window-hours 24` skips matching tenant/key-state evidence already audited inside the window; set it to `0` only for deliberate duplicate evidence. Set `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL` or pass `--notification-webhook-url` to deliver executed reminders to a webhook after audit evidence is written; dry-runs and duplicate-skipped reminders do not call the webhook. Put the optional HMAC secret in `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET`, not on the command line, and use `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_TIMEOUT_MS` or `--notification-webhook-timeout-ms` to adjust the default 5000ms timeout. For the long-running worker, scheduled reminders are disabled by default; set `FORGETBASE_API_KEY_ROTATION_REMINDERS_ENABLED=true` to schedule them, keep `FORGETBASE_API_KEY_ROTATION_REMINDERS_DRY_RUN=true` for previews, set `FORGETBASE_API_KEY_ROTATION_REMINDERS_DUE_WITHIN_DAYS`, set `FORGETBASE_API_KEY_ROTATION_REMINDERS_DEDUPE_WINDOW_HOURS`, and set `FORGETBASE_API_KEY_ROTATION_REMINDERS_INTERVAL_MS`.

Managed-query eval schedule maintenance runs due tenant schedule policies and defaults to dry-run. Add `--execute` after reviewing due counts. Execution searches the tenant corpus directly as system maintenance, records scheduled retrieval telemetry, writes redacted eval-run history, updates the schedule policy last-run fields, and records `agent.eval.scheduled_run` audit evidence without raw query text. For the long-running worker, scheduled eval execution is disabled by default; set `FORGETBASE_MANAGED_QUERY_EVALS_ENABLED=true` to schedule it, keep `FORGETBASE_MANAGED_QUERY_EVALS_DRY_RUN=true` for previews, set `FORGETBASE_MANAGED_QUERY_EVALS_LIMIT`, and set `FORGETBASE_MANAGED_QUERY_EVALS_INTERVAL_MS`.

Action approval expiry maintenance finds `approval-required` action requests whose `approvalExpiresAt` is in the past and defaults to dry-run. Add `--execute` after reviewing candidate counts. Execution marks each stale request `expired`, records `agent.action.approval_expiry` audit evidence without executing the action, and leaves non-expired pending requests untouched. For the long-running worker, scheduled action approval expiry is disabled by default; set `FORGETBASE_ACTION_APPROVAL_EXPIRY_ENABLED=true` to schedule it, keep `FORGETBASE_ACTION_APPROVAL_EXPIRY_DRY_RUN=true` for previews, set `FORGETBASE_ACTION_APPROVAL_EXPIRY_LIMIT`, and set `FORGETBASE_ACTION_APPROVAL_EXPIRY_INTERVAL_MS`.

## Attachment Safety Configuration

Docker Compose requires its internal ClamAV service with `FORGETBASE_ATTACHMENT_SCAN_REQUIRED=true`, `FORGETBASE_ATTACHMENT_CLAMD_HOST=clamav`, port `3310`, and a 15-second default scan timeout. Do not expose the ClamD port outside the Compose network. A deployment that requires scanning is not ready and does not accept uploads when the scanner is unavailable.

The self-hosted defaults limit one attachment to 10 MiB, one tenant to 1 GiB or 1,000 non-deleted files, and one uploader to 256 MiB or 250 non-deleted files. `FORGETBASE_ATTACHMENT_UPLOADS_PER_MINUTE=30` and `FORGETBASE_ATTACHMENT_MAX_CONCURRENT_UPLOADS=4` bound one API process. Adjust `FORGETBASE_ATTACHMENT_MAX_BYTES`, `FORGETBASE_ATTACHMENT_TENANT_MAX_BYTES`, `FORGETBASE_ATTACHMENT_TENANT_MAX_FILES`, `FORGETBASE_ATTACHMENT_PRINCIPAL_MAX_BYTES`, and `FORGETBASE_ATTACHMENT_PRINCIPAL_MAX_FILES` only after sizing storage and memory. These counters are suitable for the single-API Compose prototype; multi-instance deployment needs shared rate limiting and transactional quota reservation.

`FORGETBASE_ATTACHMENT_RECONCILIATION_ENABLED=true` schedules a global storage check in Compose. It defaults to dry-run through `FORGETBASE_ATTACHMENT_RECONCILIATION_DRY_RUN=true` and runs hourly through `FORGETBASE_ATTACHMENT_RECONCILIATION_INTERVAL_MS=3600000`. Review bounded reports and take a verified backup before enabling execution. The admin API uses tenant-scoped reconciliation and does not expose global storage or orphan totals.

## Backup And Restore Smoke Check

With Docker Compose running, preview reconciliation, stop both writers, create one coordinated set, then verify it:

```bash
curl --silent --show-error --fail -X POST http://127.0.0.1:3000/admin/attachments/reconcile \
  -H "authorization: Bearer $FORGETBASE_API_KEY" \
  -H 'content-type: application/json' -d '{"dryRun":true,"verifyContent":true}'
docker compose stop api worker
backup_json="$(npx -y pnpm@11.7.0 backup:set)"
backup_path="$(node -e 'const fs=require("node:fs"); console.log(JSON.parse(fs.readFileSync(0,"utf8")).backupSet)' <<<"$backup_json")"
npx -y pnpm@11.7.0 backup:set:verify -- "$backup_path"
docker compose up -d migrate clamav api worker web
```

Operational runbooks:

- [Docker Compose Deploy Runbook](runbooks/DEPLOY_DOCKER_COMPOSE.md)
- [Backup And Restore Runbook](runbooks/BACKUP_RESTORE.md)
- [Rollback Runbook](runbooks/ROLLBACK.md)
- [API Key Rotation Runbook](runbooks/API_KEY_ROTATION.md)
- [Restricted Leakage Investigation Runbook](runbooks/RESTRICTED_LEAKAGE_INVESTIGATION.md)
- [Railway Private Alpha Template](runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md)

The backup-set verifier checks both manifest digests, rejects unsafe archive entries, restores into a temporary `forgetbase_restore_set_*` database, and proves the restored database and blob archive form one exact attachment recovery point without overwriting live state. See [Backup And Restore Runbook](runbooks/BACKUP_RESTORE.md) and [Rollback Runbook](runbooks/ROLLBACK.md).

## MCP Smoke Check

```bash
FORGETBASE_API_URL=http://127.0.0.1:3000 FORGETBASE_API_KEY="$FORGETBASE_API_KEY" npx -y pnpm@11.7.0 --filter @forgetbase/mcp-server exec node --input-type=module - <<'NODE'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', 'pnpm@11.7.0', '--filter', '@forgetbase/mcp-server', 'start'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    FORGETBASE_API_URL: 'http://127.0.0.1:3000',
    FORGETBASE_API_KEY: process.env.FORGETBASE_API_KEY ?? ''
  }
});
const client = new Client({ name: 'forgetbase-smoke', version: '0.1.0' });
await client.connect(transport);
const tools = await client.listTools();
const exportResult = await client.callTool({
  name: 'generate_ai_export',
  arguments: { packageName: 'demo-agent-pack' }
});
console.log(JSON.stringify({
  tools: tools.tools.map((tool) => tool.name),
  exportPreview: JSON.parse(exportResult.content.find((item) => item.type === 'text')?.text ?? '{}').assetCount
}, null, 2));
await client.close();
NODE
```

Expected tools:

- `list_asset_types`
- `list_assets`
- `get_asset`
- `get_asset_version`
- `list_assets_needing_review`
- `review_asset`
- `search_assets`
- `managed_query`
- `submit_managed_query_feedback`
- `list_managed_query_feedback`
- `list_managed_query_eval_runs`
- `summarize_managed_query_eval_runs`
- `get_managed_query_eval_schedule_policy`
- `update_managed_query_eval_schedule_policy`
- `list_managed_query_cache`
- `get_managed_query_cache_policy`
- `update_managed_query_cache_policy`
- `delete_managed_query_cache_entry`
- `purge_managed_query_cache`
- `get_managed_query_retention_policy`
- `update_managed_query_retention_policy`
- `get_telemetry_summary`
- `get_telemetry_retention_policy`
- `update_telemetry_retention_policy`
- `purge_telemetry_retention`
- `run_managed_query_eval`
- `list_model_provider_configs`
- `upsert_model_provider_config`
- `list_auth_provider_configs`
- `upsert_auth_provider_config`
- `create_user`
- `list_users`
- `update_user`
- `create_service_account`
- `list_service_accounts`
- `update_service_account`
- `get_service_account_policy`
- `update_service_account_policy`
- `create_api_key`
- `list_api_keys`
- `rotate_api_key`
- `revoke_api_key`
- `create_group`
- `list_groups`
- `add_group_member`
- `remove_group_member`
- `list_group_members`
- `delete_group`
- `publish_asset`
- `validate_assets`
- `generate_ai_export`
- `validate_context_access`

## Docker Compose

Validate configuration:

```bash
docker compose config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

Build and start once a Docker daemon is running:

```bash
docker compose build migrate api worker web
docker compose up -d postgres migrate api worker web
docker compose -f compose.yaml -f compose.same-origin.yaml up -d proxy
docker compose ps
curl --silent --show-error --fail http://127.0.0.1:3000/health
curl --silent --show-error --fail http://127.0.0.1:5175/ | head
curl --silent --show-error --fail http://127.0.0.1:8080/api/health
curl --silent --show-error --fail http://127.0.0.1:8080/ | head
bash scripts/generate-local-tls-certs.sh
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml up -d proxy
curl --head --silent --show-error --fail http://127.0.0.1:8080/api/health
curl --insecure --silent --show-error --fail https://127.0.0.1:8443/api/health
curl --insecure --silent --show-error --fail https://127.0.0.1:8443/ | head
```

After the stack is running and the demo corpus is imported, run the runtime smoke gate:

```bash
npx -y pnpm@11.7.0 smoke:compose
```

The Compose web preview is exposed on `http://127.0.0.1:5175/` to avoid colliding with local Vite development ports. The API and Postgres defaults are `http://127.0.0.1:3000` and local port `5432`. Override `FORGETBASE_WEB_PORT`, `FORGETBASE_API_PORT`, or `FORGETBASE_POSTGRES_PORT` when running a second clean Compose project beside an existing stack. The same-origin proxy overlay is exposed on `http://127.0.0.1:8080/` and routes API calls under `/api`. After the TLS overlay is active, the 8080 listener redirects to HTTPS and the browser entry point is `https://127.0.0.1:8443/`. The TLS overlay sets secure browser-cookie mode on the API and expects `infra/docker/tls/tls.crt` plus `infra/docker/tls/tls.key`; the helper script creates local self-signed files that are ignored by git.

Stop the stack when finished:

```bash
docker compose down
```
