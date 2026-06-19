# Docker Compose Deploy Runbook

This runbook covers the pragmatic SMB self-hosting path for one Docker Compose deployment.

## Scope

- Postgres is the system of record.
- API, worker, and web are deployed from the local repo or a checked-out release tag.
- Secrets are supplied through the deployment environment or mounted secret files, not committed files.
- Hosted multi-tenant operations, object storage, external secret managers, and OIDC login are future deployment paths.

## Prerequisites

- Docker Desktop or a compatible Docker daemon.
- Node.js with `npx` available.
- A checked-out ForgetBase revision or release tag.
- A target DNS/TLS/proxy layer if exposing beyond localhost, or real certificate and key files mounted into the Compose TLS overlay.
- `FORGETBASE_OIDC_STATE_SECRET` set to a high-entropy random value if OIDC login is enabled.
- `FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS` set to the intended maximum password/OIDC login lifetime. The Compose default is `43200`, or 12 hours.
- `FORGETBASE_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS` set to the intended rolling idle timeout for cookie-backed browser sessions. The Compose default is `14400`, or 4 hours. Use `0` only when explicitly disabling idle timeout.
- `FORGETBASE_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS` set to the intended hard browser-session lifetime from login time. The Compose default is `2592000`, or 30 days. Use `0` only when explicitly disabling the absolute cap.
- `FORGETBASE_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS` set to the intended browser refresh-token lifetime. The Compose default is `604800`, or 7 days. Use `0` only when explicitly disabling refresh-token issuance.
- Prefer the same-origin proxy overlay for browser login, with the web UI and API exposed through one public origin and API calls routed under `/api`.
- Use HTTPS for any non-local browser deployment. Either terminate TLS in front of Compose and set `FORGETBASE_SESSION_COOKIE_SECURE=true` on the API, or use `compose.tls.yaml`, which sets secure-cookie mode for the API service.
- `FORGETBASE_CORS_ALLOWED_ORIGINS` set to the exact public web origin list, such as `https://cms.example.com`, if browser login is intentionally exposed as a split-origin deployment.
- Custom browser clients using cookie auth must echo the `forgetbase_csrf` cookie in `x-forgetbase-csrf` for unsafe requests. The bundled web UI handles this automatically.
- Environment variables for any configured model/auth provider client secrets. Provider config records should reference env var names only; the API can also read mounted secret files through derived env vars such as `OPENAI_API_KEY_FILE=/run/secrets/openai_api_key`.

## First Deploy

Install workspace dependencies and validate the compose file:

```bash
npx -y pnpm@11.7.0 install
npx -y pnpm@11.7.0 build
docker compose config --quiet
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

The build step creates the workspace `dist/` outputs used by host-run CLI and worker commands later in this runbook. The Docker services also build inside their images, but the local CLI commands need the host workspace built first when starting from a fresh clone.

The deployment-default check is safe to run before first boot. With no public-deployment flag it verifies the repository templates and keeps the local direct API/bootstrap path usable. Before exposing a Compose deployment beyond localhost, run it in public mode with the intended entrypoint and public browser origins. For example, a Compose TLS deployment should make the direct service ports private while exposing only the HTTPS proxy:

```bash
FORGETBASE_PUBLIC_DEPLOYMENT=true \
FORGETBASE_PUBLIC_ENTRYPOINT=compose-tls \
FORGETBASE_REQUIRE_AUTHENTICATION=true \
FORGETBASE_SESSION_COOKIE_SECURE=true \
FORGETBASE_CORS_ALLOWED_ORIGINS=https://cms.example.com \
FORGETBASE_API_PORT=127.0.0.1:3000 \
FORGETBASE_WEB_PORT=127.0.0.1:5175 \
FORGETBASE_POSTGRES_PORT=127.0.0.1:5432 \
FORGETBASE_PROXY_PORT=127.0.0.1:8080 \
FORGETBASE_HTTPS_PORT=443 \
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

Start Postgres, API, worker, and web:

```bash
docker compose up -d postgres migrate api worker web
docker compose ps
```

The one-shot `migrate` service waits for healthy Postgres, runs `pnpm db:migrate`, exits successfully, and gates API/worker startup through `service_completed_successfully`. This is the normal first-run and update path; rerunning Compose skips already-applied migrations through `schema_migrations`.

For the recommended browser-cookie deployment shape, add the same-origin proxy overlay:

```bash
docker compose -f compose.yaml -f compose.same-origin.yaml up -d proxy
```

For a local HTTPS smoke check, generate self-signed certificates and add the TLS overlay:

```bash
bash scripts/generate-local-tls-certs.sh
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml up -d proxy
```

Local generated certificates are written under `infra/docker/tls/` and ignored by git. Replace them with certificates from your DNS/TLS process before exposing the deployment beyond localhost.

Bootstrap the first admin. Store the returned API key secret in your password manager or deployment secret store. It is returned only once.

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth bootstrap --email admin@example.test --display-name "Admin"
```

Import the demo corpus only when you want the open-source sample content:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- corpus import --api-url http://127.0.0.1:3000 --file corpus/demo/assets.json
```

Run a one-off retrieval index pass after importing or restoring content:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --once
```

## Health Checks

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/health
curl --silent --show-error --fail http://127.0.0.1:5175/
curl --silent --show-error --fail http://127.0.0.1:8080/api/health
curl --silent --show-error --fail http://127.0.0.1:8080/
```

If the TLS overlay is active, the 8080 listener redirects to HTTPS:

```bash
curl --head --silent --show-error --fail http://127.0.0.1:8080/api/health
curl --insecure --silent --show-error --fail https://127.0.0.1:8443/api/health
curl --insecure --silent --show-error --fail https://127.0.0.1:8443/
```

Then run authenticated and permission checks:

```bash
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth me --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- search --api-url http://127.0.0.1:3000 --query "PII redaction" --limit 3
```

For a restricted-access smoke check, run:

```bash
npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

If OIDC login is enabled, run:

```bash
npx -y pnpm@11.7.0 auth:verify-oidc-login
```

## Mounted Provider And OIDC Secrets

Provider and auth-provider config records store only the base env var name, such as `OPENAI_API_KEY` or `ENTRA_CLIENT_SECRET`. At runtime the API reads that env var directly. If it is unset, the API checks the derived `<ENV_VAR>_FILE` env var and reads the secret from the absolute path it names.

Example:

```bash
export OPENAI_API_KEY_FILE=/run/secrets/openai_api_key
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- admin model-provider-set --provider openai --enabled true --api-key-env-var OPENAI_API_KEY --default-model gpt-5.1
```

Use this for Docker secrets, Kubernetes-style mounts, or local mounted secret files. Do not commit the secret file, the secret value, or ad hoc `.env` files with secret values. The configured base env var name must still pass tenant secret-reference policy; the `_FILE` companion is deployment-local plumbing and is not stored in the config record.

## Same-Origin Browser Proxy

Use the same-origin overlay when exposing cookie-backed browser login through a public URL. It places Nginx in front of the existing `web` and `api` services, serves the UI at `/`, and routes API traffic from `/api/*` to the API service. The bundled web UI defaults to `/api` in this shape.

```bash
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml up -d postgres migrate api worker web proxy
curl --silent --show-error --fail http://127.0.0.1:8080/
curl --silent --show-error --fail http://127.0.0.1:8080/api/health
```

For HTTPS through Compose, place certificate files at `infra/docker/tls/tls.crt` and `infra/docker/tls/tls.key`, then include the TLS overlay:

```bash
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml up -d postgres migrate api worker web proxy
curl --insecure --silent --show-error --fail https://127.0.0.1:8443/
curl --insecure --silent --show-error --fail https://127.0.0.1:8443/api/health
```

The helper below creates a local self-signed certificate for localhost testing only. Browsers will warn on the self-signed certificate; use `127.0.0.1` for local smoke checks and replace the files before public exposure.

```bash
bash scripts/generate-local-tls-certs.sh
```

For production, replace the local self-signed files with real certificates, set `FORGETBASE_HTTPS_PORT=443` when binding the TLS listener directly, and set `FORGETBASE_CORS_ALLOWED_ORIGINS` to the exact public browser origins when using split-origin browser clients. The TLS overlay also keeps an HTTP listener for redirects; bind `FORGETBASE_PROXY_PORT` to a private interface or front it with your edge/firewall if you do not want plain HTTP exposed. CLI, MCP, SDK, and direct API clients may continue to use the API origin directly or use the proxied API base URL such as `https://cms.example.com/api`.

For production behind an external reverse proxy or load balancer, TLS can terminate at the edge instead of inside Compose. In that shape, still use the same-origin `/api` routing contract, set `FORGETBASE_SESSION_COOKIE_SECURE=true` on the API, forward standard `X-Forwarded-*` headers, and use the public proxy origin as the browser entry point.

For an external TLS edge, use `FORGETBASE_PUBLIC_ENTRYPOINT=external-tls-proxy` in `security:check-deployment-defaults` and bind `FORGETBASE_PROXY_PORT` to localhost or another private interface. The base API, web, and Postgres port variables should also be explicitly localhost-bound in public Compose checks; bare port values are local-development convenience, not a public deployment posture.

Keep `FORGETBASE_LOGIN_SESSION_MAX_AGE_SECONDS`, `FORGETBASE_LOGIN_SESSION_IDLE_TIMEOUT_SECONDS`, `FORGETBASE_LOGIN_SESSION_ABSOLUTE_MAX_AGE_SECONDS`, and `FORGETBASE_LOGIN_REFRESH_TOKEN_MAX_AGE_SECONDS` at the shortest operationally acceptable values. Browser cookie authentication requires an active `login_sessions` row created by password/OIDC login; refresh uses hash-only one-time tokens stored in `login_session_refresh_tokens` and cannot extend beyond `login_sessions.absolute_expires_at` when configured; admin-created user keys and service-account keys remain bearer credentials only. Use admin-created user or service-account API keys, not the login endpoint, for longer-lived automation credentials.

## Update Deploy

Before updating, create and verify a backup:

```bash
npx -y pnpm@11.7.0 db:backup
npx -y pnpm@11.7.0 db:verify-backup-restore
```

Check out the new revision or pull the release artifact, then rebuild and restart:

```bash
docker compose build migrate api worker web
docker compose up -d postgres migrate api worker web
docker compose -f compose.yaml -f compose.same-origin.yaml up -d proxy
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml up -d proxy
```

Run smoke checks:

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/health
npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

If you run only Postgres through Compose and start the API or worker directly on the host, run migrations manually before starting those local processes:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:${FORGETBASE_POSTGRES_PORT:-5432}/forgetbase npx -y pnpm@11.7.0 db:migrate
```

If OIDC login is enabled, also run:

```bash
npx -y pnpm@11.7.0 auth:verify-oidc-login
```

## Retention And Cache Maintenance

Scheduled telemetry retention is disabled by default and dry-run by default when enabled.

Preview a manual purge:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- telemetry purge
```

Execute only after reviewing the preview:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- telemetry purge --execute
```

Scheduled managed-query cache cleanup is also disabled by default and dry-run by default when enabled. Preview a worker cleanup run:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --cache-purge-once
```

Execute only after reviewing the preview counts:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --cache-purge-once --execute
```

API-key rotation reminders are disabled and dry-run by default. If you enable scheduled reminders, preview counts first, then set `FORGETBASE_API_KEY_ROTATION_REMINDERS_DRY_RUN=false` only after the output is acceptable. Optional webhook delivery is controlled by `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL`; keep the HMAC secret in `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET`, not in command history or repo files. Dry-runs and duplicate-skipped reports do not call the webhook.

Action approval expiry maintenance is also disabled and dry-run by default. Preview stale pending approvals before enabling execution:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --action-approval-expiry-once
```

Execute only after reviewing the candidate counts:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --action-approval-expiry-once --execute
```

For scheduled operation, set `FORGETBASE_ACTION_APPROVAL_EXPIRY_ENABLED=true`, keep `FORGETBASE_ACTION_APPROVAL_EXPIRY_DRY_RUN=true` until previews are acceptable, and tune `FORGETBASE_ACTION_APPROVAL_EXPIRY_LIMIT` plus `FORGETBASE_ACTION_APPROVAL_EXPIRY_INTERVAL_MS`. Executed maintenance marks stale `approval-required` action requests `expired`, records `agent.action.approval_expiry` audit evidence, and does not execute the requested action.

## Rollback

Use [Rollback Runbook](ROLLBACK.md) for application, database, and content rollback.

Use [Backup And Restore Runbook](BACKUP_RESTORE.md) before destructive database changes.

Use [API Key Rotation Runbook](API_KEY_ROTATION.md) if a deployment exposed an API key or operator key.
