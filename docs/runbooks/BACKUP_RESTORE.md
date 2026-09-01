# Backup And Restore Runbook

This runbook covers the Docker Compose self-hosting path.

## Scope

- Postgres is the system of record for attachment metadata and governed content.
- The `attachment-data` Compose volume stores local attachment bytes separately from Postgres.
- Backups use `pg_dump --format=custom`.
- Restore verification restores into a temporary database first and compares core table counts.
- A complete attachment backup contains both the Postgres dump and an attachment archive from the same stopped-write window.
- Future object-store adapters must provide an equivalent versioned bucket backup and content-hash verification path.

## Create A Backup

```bash
npx -y pnpm@11.7.0 db:backup
```

By default this writes to `backups/forgetbase-<timestamp>.dump`. The `backups/` directory is gitignored.

Create the matching local attachment archive while API writes are stopped:

```bash
docker compose stop api worker
npx -y pnpm@11.7.0 db:backup
npx -y pnpm@11.7.0 attachments:backup
docker compose up -d migrate api worker web
```

Keep the database dump and attachment archive together. Attachment metadata does not make a missing blob recoverable.

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

Verify that the local attachment archive reproduces the storage file manifest and SHA-256 values:

```bash
npx -y pnpm@11.7.0 attachments:verify-backup-restore
```

This check extracts only to a temporary host directory. It does not replace the live attachment volume.

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

Restore the matching attachment archive before restarting the API:

```bash
FORGETBASE_ATTACHMENT_RESTORE_CONFIRM=attachments \
  npx -y pnpm@11.7.0 attachments:restore -- backups/manual-attachments.tar
```

The attachment restore accepts only regular files and directories in the opaque `xx/uuid` storage-key layout. It rejects links, special entries, absolute paths, traversal, and unrelated archive paths before it replaces the configured attachment storage root inside the dedicated Compose volume.

Restart services:

```bash
docker compose up -d migrate api worker web
```

Smoke-check after restore:

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/health
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets list --api-url http://127.0.0.1:3000
```

Download at least one known synthetic attachment after restore and compare its response bytes with the metadata SHA-256 value. A database count match alone does not prove blob integrity.
