# Backup And Restore Runbook

This runbook covers the Docker Compose self-hosting path.

## Scope

- Postgres is the system of record for attachment metadata and governed content.
- The `attachment-data` Compose volume stores local attachment bytes separately from Postgres.
- Backups use `pg_dump --format=custom`.
- The preferred backup set contains the Postgres dump, attachment archive, and checksum manifest from one stopped-write window.
- Restore verification uses a temporary database and directory, then matches each non-deleted metadata record to exactly one blob by storage key, size, and SHA-256.
- Future object-store adapters must provide an equivalent versioned bucket backup and content-hash verification path.

## Preflight

Run the tenant-admin attachment reconciliation route in dry-run mode with `verifyContent: true`. Resolve missing blobs, integrity mismatches, and stale deletes before backup. Tenant-admin reports do not expose global storage totals or orphan counts. Review the scheduled global operator reconciliation report before enabling its execute mode. Reconciliation responses contain counts, not storage keys.

## Create A Coordinated Backup Set

Stop both writers. The helper refuses to run while `api` or `worker` is running:

```bash
docker compose stop api worker
npx -y pnpm@11.7.0 backup:set -- backups/manual-set
```

The output directory contains `database.dump`, `attachments.tar`, and `manifest.json`. The manifest records the stopped-writer consistency mode, file digests and sizes, creation time, and attachment counts. Keep all three files together. Attachment metadata does not make a missing blob recoverable.

Verify the set before restarting writers:

```bash
npx -y pnpm@11.7.0 backup:set:verify -- backups/manual-set
docker compose up -d migrate clamav api worker web
```

The verifier rejects checksum changes, unsafe archive paths, links and special entries, missing or changed referenced blobs, and extra orphan blobs. It restores only to temporary state and removes it afterward.

Encrypt backup sets at rest, copy them off the application host, restrict access, define retention, and test recovery on an operator-approved schedule. These are deployment responsibilities; the repository helper does not provide encryption, remote retention, or key management.

## Legacy Component Helpers

Individual database and attachment helpers remain available for investigation and manual restore:

```bash
npx -y pnpm@11.7.0 db:backup
npx -y pnpm@11.7.0 attachments:backup
npx -y pnpm@11.7.0 db:verify-backup-restore
npx -y pnpm@11.7.0 attachments:verify-backup-restore
```

Do not combine independently timed component backups as a claimed recovery point.

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
docker compose up -d migrate clamav api worker web
```

Smoke-check after restore:

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/health
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- assets list --api-url http://127.0.0.1:3000
```

Download at least one known synthetic attachment after restore and compare its response bytes with the metadata SHA-256 value. A database count match alone does not prove blob integrity.
