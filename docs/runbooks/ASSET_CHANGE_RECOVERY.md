# Asset Change Recovery

Use this runbook when a successful content command reports pending processing, search has not caught up, or readiness reports indexing lag. It describes the PostgreSQL deployment with migration `039_asset_change_outbox` and the matching API and worker release.

## What A Successful Save Means

A canonical asset change, its durable reconciliation work, and its `asset.commit` audit event commit in the same database transaction. The API can attempt indexing immediately, and the worker retries unfinished work. A later indexing or cache failure does not undo the content save.

Asset command responses include `processing.index` (`ready`, `pending`, or `unavailable`) and `processing.reconciliation` (`complete` or `pending`), with matching `x-forgetbase-index-state` and `x-forgetbase-reconciliation` headers. `pending` means follow-up work was deferred or another claim may own it. Do not submit the content command again just to retry indexing. `unavailable` means the API has no retrieval repository; investigate deployment configuration.

The worker indexes the permission-aware published projection. It clears the asset's chunks when that projection is unavailable, then invalidates the tenant's managed-query cache. Draft content must remain excluded from ordinary consumers. Current authorization and publication checks apply even while an old index exists.

Work is coalesced per tenant and asset. Every later canonical change advances its generation. Index writes, clearing, and acknowledgment check the generation and lease, so an older worker cannot erase newer work or restore stale chunks. Migration 039 queues existing content for reconciliation without inventing historical audit events.

The durable `asset.commit` event records a canonical row change with no attributed principal or raw content. Actor-specific API command audits are separate. Multiple row changes can produce several commit events with the same transaction ID; do not count them as distinct user commands. Reconciliation does not reconstruct a missing actor-specific command audit.

## Readiness And Worker Signals

Check `/ready` on the API, or `/api/ready` through the same-origin proxy:

| HTTP result | Meaning | Operator action |
| --- | --- | --- |
| `200`, `checks.indexing: "ok"` | No unfinished asset changes at the time of the check. | Verify the affected published content and access behavior. |
| `200`, `checks.indexing: "processing"` | Pending or leased work exists, none is in the failed state, and the oldest unfinished change is at most 15 minutes old. | Watch worker progress. This is not proof that the queue is drained. |
| `503`, `checks.indexing: "lagging"` | At least one failed row exists, or the oldest unfinished change is over 15 minutes old. | Investigate the worker and safe error codes below. Retries continue. |
| `503`, `checks.database: "unavailable"`, `checks.migrations: "unknown"` | A readiness dependency check threw an error. | Inspect the API readiness log; the cause may be database, migration, required scanner, or outbox access. This response alone does not identify the failing dependency. |

Indexing checks are omitted if no outbox is configured. That is not evidence of durable recovery. `/health` only establishes that the API is responding. Readiness aggregates all tenants and does not replace authenticated reader/agent checks.

Worker JSON records use `job: "asset-change-reconciliation"` and report:

- `claimed`, `completed`, `retryScheduled`, and `leaseLost` for that batch.
- `errors`, containing safe error-code counts without content or provider exception text.
- `health.pending`, `health.processing`, and `health.failed`, which are separate state counts. Their sum is the unfinished total.
- `health.oldestPendingAt` and `health.oldestPendingAgeMs`, which cover all unfinished states, including leased and failed work. They are `null` when the queue is empty.

`leaseLost` can occur when new work supersedes a claim or the lease expires. Check eventual convergence; do not delete a row to clear the signal.

| Safe code | Failing stage | Check |
| --- | --- | --- |
| `asset_lookup_failed` | Read the asset projection. | Database connectivity, applied migrations, and matching repository/runtime version. |
| `asset_index_failed` | Index published content or clear obsolete chunks. | Database/vector support and the configured embedding provider. A concurrent change can also invalidate a claim. |
| `asset_cache_invalidation_failed` | Invalidate the tenant query cache. | Database access and cache schema. |
| `asset_reconciliation_failed` | Complete reconciliation, or API follow-up work. | Matching generation/lease, database availability, and preceding API/worker logs. |
| `asset_outbox_unavailable` | Access the queue or initialize maintenance. | Worker database configuration, migrations, and connectivity. This is a process/job error, not a stored row code. |

## Retry And Recovery Procedure

1. Confirm the API and worker use the intended release and database. Keep existing authentication, publication, and required scanning controls enabled. Diagnose with safe counts and service status; do not dump environment variables, credentials, or document content into incident logs.
2. Confirm the worker is running and logs `asset-change-reconciliation`. Fix the failing dependency identified above. Startup processes up to 25 changes; the normal loop processes up to 25 every five seconds by default. A running process without these job records does not establish recovery.
3. Check worker configuration if the job is absent. `FORGETBASE_ASSET_CHANGES_ENABLED` defaults to `true`. `FORGETBASE_ASSET_CHANGES_INTERVAL_MS` defaults to `5000`; `FORGETBASE_ASSET_CHANGES_BATCH_SIZE` defaults to `25`, capped at `100` per scheduled invocation. These settings must reach the worker container environment; setting them only in the host shell does not override the source Compose service. The startup batch remains bounded at 25.
4. Allow retry backoff and active leases to expire. Failed attempts 1–7 wait 1, 2, 4, 8, 16, 32, and 64 seconds respectively. At attempt 8, work enters `failed` and continues retrying every five minutes. It is never permanently abandoned. The default lease is 60 seconds; a crashed worker's claim becomes available after its lease expires.
5. If a bounded manual pass is needed, use the matching running worker and a confirmed tenant ID. The following example uses the synthetic tenant `tenant_demo`:

   ```bash
   docker compose exec -T worker node /app/apps/worker/dist/index.js \
     --asset-change-once --tenant-id tenant_demo --limit 25
   ```

   This writes derived index/cache state and acknowledges queue work. It respects retry times and active leases; `claimed: 0` can mean work is delayed or already leased. Omitting `--tenant-id` processes eligible work across tenants. On Railway, run the same worker entrypoint through the deployment's approved execution route after confirming its release and database.
6. Confirm counts and oldest age improve across successive job records. A batch can exit successfully while reporting retries, so read its counters. With writers quiet, require zero unfinished work and `checks.indexing: "ok"`. Then verify the expected published version through the affected reader/search/agent surfaces and confirm revoked access stays denied.

There is no force-retry endpoint. Do not reset generations or leases, delete queue rows, or resave/publish content to hide a processing failure. Repeated manual passes cannot bypass backoff. If work still fails after its dependency is repaired, retain safe error counts and source identity for investigation.

## Backup And Restore

The queue and durable commit audits are part of the PostgreSQL backup. Stop the worker, API, and all other writers before creating the paired database/blob backup; a manual maintenance pass is also a writer. Preserve pending and failed rows during restore. Restored leases can delay recovery until they expire.

Follow the [backup and restore runbook](BACKUP_RESTORE.md) for integrity checks, isolated runtime verification, and rollback compatibility. The previous July deployment cannot safely serve the upgraded database once new draft writes resume.
