# Railway Private Alpha Template

This template describes a private Railway-style staging target for operators who want to test the containerized services before public exposure. It intentionally avoids live project IDs, workspace names, personal domains, or mutation commands tied to a maintainer account.

## Intended Shape

- Services: `pgvector`, `api`, `worker`, `web`; add `proxy` only when an explicit public prototype is approved.
- Public access: expose only the same-origin `proxy` service. Do not expose `api` or `web` directly.
- Database image: `pgvector/pgvector:pg17`.
- Database volume: mount at `/var/lib/postgresql/data` and set `PGDATA=/var/lib/postgresql/data/pgdata`.
- Service networking: app services should use Railway private networking for `DATABASE_URL`.

## Required API Safety Settings

For any public prototype entrypoint, set the API service to require authentication:

```text
AGENTIC_CMS_REQUIRE_AUTHENTICATION=true
AGENTIC_CMS_SESSION_COOKIE_SECURE=true
AGENTIC_CMS_CORS_ALLOWED_ORIGINS=https://<approved-origin>
```

Do not publish a public domain until these are configured and verified. Invalid boolean environment values fail startup, so fix configuration rather than relying on defaults.

If you expose the Vite preview service directly for a private test, set its host allowlist through:

```text
AGENTIC_CMS_WEB_ALLOWED_HOSTS=<approved-host>[,<approved-host>]
```

The preferred public prototype path is still the same-origin `proxy` service, not direct public access to `web`.

## Deployment Boundary

Before using a local build-context deploy command, confirm `.dockerignore` excludes local-only artifacts such as:

- `.claude/`
- `.codex/`
- `.maintainer/`
- `.playwright-mcp/`
- `backups/`
- `infra/docker/tls/*` except `.gitkeep`
- `.env` and `.env.*`

Prefer deploying from a clean tracked checkout or a connected repository source after reviewing the files that will be included in the build context.

## Private Verification

Use read-only service status, logs, deployment lists, and private-network shell checks first:

```bash
railway service status --environment <environment>
railway deployment list --service api --environment <environment> --json
railway logs --service api --lines 100
curl --silent --show-error --fail http://api.railway.internal:3000/health
```

## Public Prototype Verification

When a public same-origin proxy is explicitly approved:

```bash
railway domain list --service proxy --environment <environment> --json
railway domain list --service api --environment <environment> --json
railway domain list --service web --environment <environment> --json
curl --silent --show-error --fail https://<approved-origin>/api/health
curl --silent --show-error --include https://<approved-origin>/api/assets
curl --silent --show-error --include 'https://<approved-origin>/api/search?q=PII'
```

Expected:

- `proxy` is the only public service.
- `api` and `web` have no public domains.
- `/api/health` returns `200`.
- Protected data routes return `401 {"error":"authentication_required"}` without a valid session or bearer token.

Use only the synthetic corpus unless a separate public/private content-boundary review explicitly approves different data.
