# Backup And Restore Runbook

This runbook covers the Docker Compose self-hosting path.

## Scope

- Postgres is the system of record.
- Backups use `pg_dump --format=custom`.
- Restore verification restores into a temporary database first and compares core table counts.
- Uploaded files and future object storage adapters are not implemented yet; this runbook only covers Postgres.

## Create A Backup

```bash
npx -y pnpm@11.7.0 db:backup
```

By default this writes to `backups/forgetbase-<timestamp>.dump`. The `backups/` directory is gitignored.

To choose a path:

```bash
npx -y pnpm@11.7.0 db:backup -- backups/manual.dump
```

## Verify Backup Restore Safety

Run a non-destructive restore test:

```bash
npx -y pnpm@11.7.0 db:verify-backup-restore
```

The verifier:

- creates a fresh custom-format backup
- restores it into a temporary `forgetbase_restore_*` database
- compares counts for core registry, auth, audit, retrieval, and migration tables
- drops the temporary database

Set `KEEP_FORGETBASE_BACKUP=1` only when you need to inspect the temporary dump after verification.

## Restore To A Temporary Database

```bash
npx -y pnpm@11.7.0 db:restore -- backups/manual.dump forgetbase_restore_manual
```

Temporary restore targets must start with `forgetbase_restore_` unless explicitly confirmed.

## Restore The Main Database

Stop API and worker writes first:

```bash
docker compose stop api worker
```

Restore with an explicit confirmation:

```bash
FORGETBASE_RESTORE_CONFIRM=forgetbase npx -y pnpm@11.7.0 db:restore -- backups/manual.dump forgetbase
```

Restart services:

```bash
docker compose up -d migrate api worker web
```

Smoke-check after restore:

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/health
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets list --api-url http://127.0.0.1:3000
```
