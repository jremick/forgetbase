# Rollback Runbook

This runbook covers pragmatic SMB rollback for the Docker Compose deployment path.

## Managed Installation Rollback

For a managed Docker Compose install, use **Admin > Updates** first. Select a verified recovery point, review its timestamp and rollback mode, then confirm. A recovery-set restore replaces both Postgres and attachment blobs and can discard all changes after the selected recovery point. It requires explicit data-loss confirmation.

If the app UI or API is unavailable, keep the updater state directory and release bundle intact. The host updater ledger, `current-release.env`, recovery sets, and configuration snapshots are outside Postgres. Use the database and attachment paths from that ledger with the procedures below. Keep writers stopped until both parts are restored and verified. Do not delete the failed candidate environment until recovery is verified.

Automatic rollback applies only before the candidate reopens writes. After writes reopen, treat rollback as a new operator decision because the previous database snapshot can be stale.

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
FORGETBASE_RESTORE_CONFIRM=forgetbase npx -y pnpm@11.7.0 db:restore -- backups/<selected>.dump forgetbase
```

3. Restart services and verify:

```bash
docker compose up -d migrate api worker web
curl --silent --show-error --fail http://127.0.0.1:3000/health
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- search --query "PII redaction" --limit 3 --api-url http://127.0.0.1:3000
```

## Content Rollback

Asset-version rollback is available for governed assets.

1. Inspect the asset versions and preview the target version:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets get <stable-id>
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets version <stable-id> --version-number 1
```

You can also inspect and restore versions from the web UI with an admin key.

2. Restore the desired version:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets restore <stable-id> --version-number 1
```

3. Verify search reflects the restored content:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- search --query "<restored content phrase>"
```

Required future work:

- richer visual diff view
- multi-step rollback approval
- scheduled publish/archive controls
- a dedicated offline updater recovery CLI over the same state ledger
