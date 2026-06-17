# Rollback Runbook

This runbook covers pragmatic SMB rollback for the Docker Compose deployment path.

## Application Rollback

1. Identify the last known-good git revision or container image tag.
2. Stop write-heavy services:

```bash
docker compose stop api worker
```

3. Check out or deploy the known-good application version.
4. Rebuild and restart:

```bash
docker compose build migrate api worker web
docker compose up -d migrate api worker web
```

5. Verify:

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/health
npx -y pnpm@11.7.0 typecheck
```

## Database Rollback

Schema migrations are forward-only at this stage. Use database restore for rollback.

1. Stop writers:

```bash
docker compose stop api worker
```

2. Restore the selected backup:

```bash
AGENTIC_CMS_RESTORE_CONFIRM=agentic_cms npx -y pnpm@11.7.0 db:restore -- backups/<selected>.dump agentic_cms
```

3. Restart services and verify:

```bash
docker compose up -d migrate api worker web
curl --silent --show-error --fail http://127.0.0.1:3000/health
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- search --query "PII redaction" --limit 3 --api-url http://127.0.0.1:3000
```

## Content Rollback

Asset-version rollback is available for governed assets.

1. Inspect the asset versions and preview the target version:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets get <stable-id>
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets version <stable-id> --version-number 1
```

You can also inspect and restore versions from the web UI with an admin key.

2. Restore the desired version:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets restore <stable-id> --version-number 1
```

3. Verify search reflects the restored content:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- search --query "<restored content phrase>"
```

Required future work:

- richer visual diff view
- multi-step rollback approval
- scheduled publish/archive controls
