# EXP encrypted backups and restore tests

These scripts are prepared for later use. **No backup or restore is scheduled
or run in Phase 0.** R2 is not enabled, and its configuration and recipient stay
blank. Neither script starts containers or needs Docker access.

## Backup prerequisites and environment

Before enabling backups, the coordinator must create `forgetbase-backups`, apply a
35-day bucket lock and lifecycle expiry, and verify that the backup token cannot
delete a locked object. Use a dedicated bucket-scoped Object Read & Write token
only in this app's `backup.env`. Keep the separate age private key in Jarel's
password manager. EXP receives only this app's public recipient. Do not reuse the
other app's recipient or token, and do not include `AUTH_SECRET` in backups.

The container runs as `999:999` with PostgreSQL 17 client tools, Bash, age,
rclone, tar, sha256sum, curl, and standard shell tools. Inject environment values
with the root:600 Docker env file; never pass credentials as command arguments.
The backup environment contract is:

| Name | Required purpose or non-secret value |
|---|---|
| `PGHOST` | `forgetbase-pgvector` |
| `PGPORT` | `5432` |
| `PGDATABASE` | `forgetbase` |
| `PGUSER` | `forgetbase_app` |
| `PGPASSWORD` | Runtime DML-role password; env only |
| `AGE_RECIPIENT` | This app's native `age1…` public recipient |
| `R2_BACKUP_BUCKET` | `forgetbase-backups` |
| `RCLONE_CONFIG_R2_TYPE` | `s3` |
| `RCLONE_CONFIG_R2_PROVIDER` | `Cloudflare` |
| `RCLONE_CONFIG_R2_ACCESS_KEY_ID` | Dedicated backup token access key |
| `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | Dedicated backup token secret |
| `RCLONE_CONFIG_R2_ENDPOINT` | HTTPS account endpoint on `r2.cloudflarestorage.com` |
| `BACKUP_R2_PROTECTION_CONFIRMED` | `35-day-lock-and-lifecycle`, only after live verification |

The protection field is an operator assertion, not a live bucket-policy check.
The script fixes environment authentication off, region to `auto`, and bucket
creation/check off. It refuses a different source DB or bucket. Keep all R2
credentials out of API, worker, proxy, and migrate environments.

The fixed Phase 0 network membership puts `forgetbase-backup` only on the
internal `forgetbase-db` network. It therefore has **no permitted route to R2**.
The firewall's 443 allowlist does not create a route through an internal Docker
network. This script does not change networks or firewall rules. Do not schedule
it until a later, separately approved design resolves connectivity and proves
containment again.

Mount the app's attachments at `/attachments:ro`. Before setting
`BACKUP_WRITERS_STOPPED=true`, the later orchestration must verify both API and
worker are stopped and no other process writes attachments or the database.
Keep them stopped until this backup finishes. This preserves the relationship
between the DB snapshot and attachment archive; the flag alone is not proof.
The script encrypts `tar -C /attachments -cf - .` as `attachments.tar.age`.

## Data flow, integrity, and retention

`pg_dump --format=custom` streams directly into age, then `rclone rcat`. Dump
plaintext is never written to a file. Only ciphertext hashes and completion
metadata use the container's `/tmp` tmpfs. The script does not access `/backups`,
so that host directory can remain root:root mode 700. There are no local dump
artifacts to relax permissions for or clean up.

Each run gets a unique `daily/<UTC timestamp>-<random suffix>/` prefix. The
script hashes the outgoing ciphertext and compares a full remote readback.
Only after every object passes does it upload `complete.sha256`. Use recovery
points with that marker only. A failure can leave incomplete encrypted objects;
the script never deletes remote objects or retries the whole non-seekable stream.
Sunday UTC also copies the encrypted set into `weekly/`, with its completion
marker written last. A weekly copy failure is reported even if the daily set is
already complete.

Keep the latest 7 daily and 4 weekly recovery points for selection. A 35-day lock
means daily objects cannot physically expire after 7 days. Configure lifecycle
expiry at no less than 35 days for both prefixes, and accept those additional
locked daily objects. Lifecycle management is coordinator-owned and deferred.
There is no delete, purge, sync, retention-cleanup, or bucket-creation command in
these scripts.

## Monthly restore test

Run `restore-test.sh` only inside a separately authorized, disposable recovery
environment. Before calling it:

1. Provision an isolated PostgreSQL 17 instance named `forgetbase-restore-postgres`
   and a fresh database named `forgetbase_restore_test_<suffix>`; use only lowercase
   letters, digits, and underscores in the suffix. Create a dedicated
   `forgetbase_restore` role that can restore into that database. Do not connect this
   environment to production networks or use production DB credentials.
2. Download one completed backup and its marker through the separate approved
   backup-read path. Mount ciphertext read-only at
   `/restore-input/database.dump.age`. Set `RESTORE_DATABASE_FILE` to that exact
   path and `RESTORE_DATABASE_SHA256` to the marker's database ciphertext hash.
3. Bring the private key from the password manager into a temporary tmpfs outside
   the source repo, then expose it through a read-only tmpfs mount at
   `/run/restore-key/identity.txt`, mode 400 or 600 and readable by the test user.
   Set `RESTORE_AGE_IDENTITY_FILE` to that exact path. Do not persist the identity
   on EXP. The script checks the mount type and mode; the operator must remove
   the temporary key mount after the test, including on failure.
4. Supply the disposable `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and
   `PGPASSWORD` through ephemeral environment injection. Set
   `RESTORE_TEST_CONFIRM=forgetbase-disposable-only` and `RESTORE_EXPECTED_ROWS` to at
   least two exact `table=count` pairs separated by commas. Use independently
   recorded counts from this recovery point, covering identity and content
   tables; do not derive expected counts from the restored target.
5. Supply `RESTORE_READY_URL=http://forgetbase-restore-api:<port>/ready`. Arrange to
   start the isolated API against the restored test DB after restoration. Disable
   migrations, mail, workers, external providers, and production integrations.
   The script polls the direct API endpoint for HTTP 200 for up to about
   150 seconds. It does not start the API or follow redirects.

Also provide `RESTORE_ATTACHMENTS_FILE=/restore-input/attachments.tar.age` and
`RESTORE_ATTACHMENTS_SHA256` from the same completed backup's marker. The script
checks ciphertext integrity, decrypts, and checks the tar can be read. It does
not extract attachment plaintext. Full recovery validation must additionally
restore attachments into a disposable tmpfs-backed application volume, compare
all referenced attachment sizes and hashes with the restored DB, and exercise
attachment download and scanning. That orchestration is deferred; a successful
script run alone does not prove attachment recovery. Pre-create `vector` and
`pgcrypto` in the test database with the disposable instance's superuser.

The script first verifies ciphertext hashes and archive readability. It refuses
production hostnames, other destination names, a nonempty application schema,
and malformed table-count expectations. It restores in one transaction with
no owner or ACL replay, then checks all expected row counts and API readiness.
The database itself necessarily contains restored plaintext; dump files do not.
Use disposable encrypted or tmpfs storage and destroy the test DB and volumes
when done. The script does not drop databases or manage infrastructure.

A passing run prints a short result. The later operator must record its output
as the repeatable test artifact, include attachment/artifact checks where
applicable, and send the monitoring success signal only after all checks pass.
Monitoring configuration and notification are deferred. A passed DB/readiness
check alone does not prove object-storage recovery or application feature flows.

## Failure handling and Phase 0 evidence

Missing configuration stops before any DB read. Failed dump/encryption/upload,
ciphertext mismatch, invalid destination, nonempty target, restore failure,
row-count mismatch, or failed readiness returns nonzero with a generic stage
message. Raw tool errors are suppressed to avoid leaking connection secrets or
application data. Inspect failures only through an approved redacted diagnostic
path. Re-run a backup only as a new recovery point; never treat an incomplete
prefix as complete.

Phase 0 validation is limited to Bash syntax and isolated missing-configuration
behavior. End-to-end upload, restore, attachment recovery, lifecycle/lock proof,
and monitoring remain unverified and must pass before scheduling.

Protocol references: [rclone streaming uploads](https://rclone.org/commands/rclone_rcat/),
[rclone S3 configuration](https://rclone.org/s3/),
[PostgreSQL pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html),
and [age](https://github.com/FiloSottile/age).
