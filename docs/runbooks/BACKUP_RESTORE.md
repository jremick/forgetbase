# Backup And Restore Runbook

This runbook covers the Docker Compose self-hosting path. Run commands from the checkout for the selected release, with the same Compose project and overrides used by that installation. Examples use the default database and user, `forgetbase`.

## Scope

- Postgres is the system of record for content versions, publication pointers, permissions, audit events, pending asset reconciliation, and attachment metadata.
- The `attachment-data` Compose volume stores local attachment bytes separately from Postgres.
- Backups use `pg_dump --format=custom`.
- The preferred backup set contains the Postgres dump, attachment archive, and checksum manifest from one stopped-write window.
- Restore verification uses a temporary database and directory, then matches each non-deleted metadata record to exactly one blob by storage key, size, and SHA-256.
- Future object-store adapters must provide an equivalent versioned bucket backup and content-hash verification path.

For the existing Railway deployment, use the deployment-specific procedure and record its service/volume readbacks in the release evidence. Local Compose helper success does not verify Railway backups or stopped writers. The same requirements apply: one database/blob recovery point, source and schema identity, isolated restore, and access checks. See the [Railway deployment template](DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md) and [operational release plan](../OPERATIONAL_RELEASE_PLAN.md).

## Preflight

Run the tenant-admin attachment reconciliation route in dry-run mode with `verifyContent: true`. Resolve missing blobs, integrity mismatches, and stale deletes before backup. Tenant-admin reports do not expose global storage totals or orphan counts. Review the scheduled global operator reconciliation report before enabling its execute mode. Reconciliation responses contain counts, not storage keys.

Record the source revision and image digests for API, worker, web, and proxy; the applied migration IDs; the selected database and attachment volume; and the recovery-point time. Record the expected published/draft versions and allowed/denied test principals for the synthetic runtime checks below. Store this evidence with the protected backup record. The helper manifest does not contain source or schema identity. Keep backups, credentials, and raw content outside Git.

## Create A Coordinated Backup Set

Stop all writers, including other replicas, host processes, imports, maintenance commands, and direct database clients. The helper only refuses running services named `api` or `worker` in the selected Compose project; it cannot detect those other writers. Keep them stopped until both artifacts and the manifest are complete. Use a new output directory for each set:

```bash
docker compose stop api worker
npx -y pnpm@11.7.0 backup:set -- backups/manual-set
```

The output directory contains `database.dump`, `attachments.tar`, and `manifest.json`. The manifest records the stopped-writer consistency mode, file digests and sizes, creation time, and attachment counts. Keep all three files together. Attachment metadata does not make a missing blob recoverable.

For a recovery point made after migrations 038 and 039, capture the aggregate SQL checks in the restore section while all writers remain stopped. Compare them with the restored database before runtime jobs begin changing queue and audit counts.

Verify the set before restarting writers. Use the already selected release images:

```bash
npx -y pnpm@11.7.0 backup:set:verify -- backups/manual-set
docker compose up --no-build -d migrate clamav api worker web
```

The verifier rejects checksum changes, unsafe archive paths, links and special entries, missing or changed referenced blobs, and extra orphan blobs. It restores only to temporary state and removes it afterward. Its `verified: true` result proves these restore and integrity checks; it does not test application startup, publication behavior, permissions, or queue recovery. Complete the isolated runtime drill below before claiming recovery readiness.

Encrypt backup sets at rest, copy them off the application host, restrict access, define retention, and test recovery on an operator-approved schedule. These are deployment responsibilities; the repository helper does not provide encryption, remote retention, or key management.

## Component Helpers

Individual database and attachment helpers remain available for investigation and manual restore:

```bash
npx -y pnpm@11.7.0 db:backup
npx -y pnpm@11.7.0 attachments:backup
npx -y pnpm@11.7.0 db:verify-backup-restore
npx -y pnpm@11.7.0 attachments:verify-backup-restore
```

Do not combine independently timed component backups as a claimed recovery point.

## Restore To A Temporary Database

Choose an unused target name. The helper drops and recreates the named database, including an existing temporary target:

```bash
bash scripts/restore-postgres.sh backups/manual-set/database.dump forgetbase_restore_manual
```

Temporary restore targets must start with `forgetbase_restore_` unless explicitly confirmed. This restores the database only. Do not point the production API or attachment volume at this drill target.

## Restore A Coordinated Set

First verify the chosen set with `backup:set:verify`. Confirm the recovery target, compatible release images, and expected data-loss window. Preserve a separate incident backup before replacing current data when possible. Stop every writer and keep the public entrypoint unavailable during recovery:

```bash
docker compose stop api worker
```

The following commands replace the main database and the entire configured attachment storage root. Run both against the intended recovery environment, using the same verified set:

```bash
FORGETBASE_RESTORE_CONFIRM=forgetbase \
  bash scripts/restore-postgres.sh backups/manual-set/database.dump forgetbase
FORGETBASE_ATTACHMENT_RESTORE_CONFIRM=attachments \
  bash scripts/restore-attachments.sh backups/manual-set/attachments.tar
```

The attachment restore accepts only regular files and directories in the opaque `xx/uuid` storage-key layout. It rejects links, special entries, absolute paths, traversal, and unrelated archive paths before replacing the storage root. A dump from a different time is not a valid substitute for the paired database.

Before starting services, compare the restored schema and aggregate counts against the recovery-point record. For a backup made after migrations 038 and 039, run these read-only checks on the restored database:

```sql
SELECT id FROM schema_migrations ORDER BY id;
SELECT
  (SELECT count(*) FROM assets) AS assets,
  (SELECT count(*) FROM asset_versions) AS versions,
  (SELECT count(*) FROM permission_grants) AS grants,
  (SELECT count(*) FROM audit_events) AS audit_events,
  (SELECT count(*) FROM asset_change_outbox) AS unfinished_changes;
SELECT count(*) AS invalid_published_references
FROM assets a
LEFT JOIN asset_versions v ON v.asset_id = a.id AND v.id = a.published_version_id
WHERE a.published_version_id IS NOT NULL AND v.id IS NULL;
SELECT state, count(*) FROM asset_change_outbox GROUP BY state ORDER BY state;
```

Expect `invalid_published_references = 0`. A nonzero queue count is recoverable work, not evidence of a bad backup. The database contains the publication pointers and queue; do not discard either to make counts or readiness look healthy. The older `db:verify-backup-restore` helper's table-count comparison does not cover this queue or prove publication semantics.

Start the compatible release while retaining the entrypoint maintenance restriction:

```bash
docker compose up --no-build -d migrate clamav api worker web
```

## Verify The Restored Runtime

Run the full drill in an isolated environment with its own database and attachment storage before relying on a backup for recovery. Use the recorded release images and deployment settings; keep outbound notifications and unrelated scheduled jobs disabled there. Repeat these checks on the recovered installation before reopening user access:

```bash
curl --silent --show-error --fail http://127.0.0.1:3000/health
curl --silent --show-error --include http://127.0.0.1:3000/ready
```

- Confirm runtime source identity against the chosen release, successful migrations, required scanner readiness, and a running worker.
- Follow [asset change recovery](ASSET_CHANGE_RECOVERY.md). Let restored leases expire and retries complete. Require `indexing: "ok"` and zero unfinished changes for the quiescent drill; `processing` alone does not prove convergence.
- With existing test credentials, verify a synthetic published asset through the reader, API, CLI, and MCP. Each ordinary consumer must return the expected published version. An authorized editor can inspect its newer draft without exposing that draft to ordinary consumers.
- Verify a denied principal and a revoked test credential remain denied, including search, export, and attachment access. Compare with the authorization state at the recovery point. Reconcile any later revocations before reopening access.
- Download a known synthetic attachment and compare its bytes with the metadata SHA-256 value.
- In the isolated drill, save and publish a synthetic change, then confirm the expected consumer version and queue completion. Record timings, results, artifact digests, and remaining limits with the release evidence.

The integrity verifier deletes its temporary database and directory. Use a separately restored environment for these runtime checks. A table-count match or successful `/health` response alone is insufficient.

## Deployment Rollback Boundary

Restarting or redeploying the same source and compatible images preserves publication and queue semantics. A different rollback candidate must also understand `published_version_id` and durable asset reconciliation. Additive SQL compatibility does not establish safe application behavior.

The previous July deployment reads the current content head and does not understand publication pointers. **It is not a safe code-only fallback after new draft writes resume:** it can serve an unapproved draft as current content. Do not reopen user access on that deployment against the upgraded database.

Before writers reopen after an upgrade, a return to the previous deployment requires its exact artifacts and the paired pre-upgrade database/blob backup, with proof that no later writes must be retained. After writers resume, restoring that earlier checkpoint loses later content and can reinstate revoked access. Stop writers, preserve the incident state, and obtain an explicit recovery decision covering retained changes and revocations before any database rollback. Prefer fixing forward on the compatible release when possible.
