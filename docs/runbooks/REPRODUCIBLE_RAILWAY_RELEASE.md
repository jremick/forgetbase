# Reproducible Railway release

Use the existing personal project and its approved HTTPS origin. Repository
publication follows the separate [public release gates](PUBLIC_BETA_RELEASE.md).
This procedure releases the single-instance core; it does
not activate the managed-upgrade or local-agent candidate branches.

## Release inputs

Record the exact project, environment, service and volume IDs, previous
deployment IDs, approved origin, release version, source commit, CI results and
recovery manifest in the private operator record. Do not copy credentials or raw
production data into Git or release assets.

Use Node 22.23.2 and pnpm 11.7.0. Required checks are the frozen install,
production dependency audit, typecheck, build, PostgreSQL tests, deployment
defaults, contracts and rendered authenticated reader/admin UAT. CI must be green
for the commit being released. The isolated Compose proof also verifies paired
database and attachment recovery.

Prepare artifacts from the clean release commit:

```bash
pnpm release:prepare 0.1.0-beta.5 work/releases/0.1.0-beta.5
```

The command produces a Git source archive, `release-manifest.json` and
`SHA256SUMS`. It excludes untracked, ignored and local operator files, and refuses
a dirty checkout. Repeating it for the same commit and version produces identical
archive and manifest bytes. Extract the verified source archive into a new
directory for deployment. Do not upload a development directory with secrets,
backups or other agents' work.

Every Railway application build requires the manifest's three `buildVariables`:

- `FORGETBASE_SOURCE_REVISION`: full Git commit hash.
- `FORGETBASE_SOURCE_DATE_EPOCH`: source commit time in seconds.
- `FORGETBASE_RELEASE_VERSION`: immutable release version.

Set these on `api`, `worker`, `web` and `proxy` with `--skip-deploys`, then deploy
the same extracted archive. The Dockerfiles pin the Node and NGINX base images by
digest and install the frozen pnpm lockfile. Each build embeds the same source,
lockfile and schema identity. Container build timestamps and Railway image
digests may differ between builds; the source archive and release identity are
the reproducibility contract.

## Existing project configuration

Keep only `proxy` publicly exposed. The API, worker, database and scanner use
private networking. Preserve the current API port and set the proxy's
`FORGETBASE_API_UPSTREAM_PORT` to that same port.

| Service | Build or image | Required operation |
| --- | --- | --- |
| api | `infra/docker/railway-api.Dockerfile` | One replica; `/ready` healthcheck; persistent attachment volume |
| worker | `infra/docker/railway-worker.Dockerfile` | Continuous process; asset-change reconciliation enabled |
| web | `infra/docker/railway-web.Dockerfile` | Private compatibility service using the same source |
| proxy | `infra/docker/railway-proxy.Dockerfile` | Approved HTTPS origin; `/api/ready` healthcheck |
| clamav | Same pinned ClamAV image as `compose.yaml` | Private port 3310; signature volume at `/var/lib/clamav` |
| pgvector | Existing database | Existing volume and credentials preserved |

The API requires these additional settings, alongside its existing database,
authentication, session and origin configuration:

```text
FORGETBASE_REQUIRE_AUTHENTICATION=true
FORGETBASE_SESSION_COOKIE_SECURE=true
FORGETBASE_REQUIRE_RELEASE_IDENTITY=true
FORGETBASE_ATTACHMENT_STORAGE_ROOT=/var/lib/forgetbase/attachments
FORGETBASE_ATTACHMENT_SCAN_REQUIRED=true
FORGETBASE_ATTACHMENT_CLAMD_HOST=clamav.railway.internal
FORGETBASE_ATTACHMENT_CLAMD_PORT=3310
FORGETBASE_ATTACHMENT_RECONCILIATION_ENABLED=true
FORGETBASE_ATTACHMENT_RECONCILIATION_DRY_RUN=true
RAILWAY_RUN_UID=0
```

Railway mounts volumes as root. `scripts/start-railway-api.mjs` initializes only
the declared attachment directory, clears supplementary groups, and drops to
UID/GID 1000 before loading database or API code. The image defaults to `USER
node`; the Railway UID override is only for that initialization. Verify the
running API process is UID 1000. A volume restored from backup must preserve the
same owner and permissions. Do not recursively change ownership of unrelated
paths.

Use the repository's default upload and tenant quotas unless a separately
reviewed capacity change requires different limits. The API has one replica;
the filesystem quota implementation is not a multi-replica reservation system.
Do not expose the scanner publicly or disable scanning to make readiness pass.

The API's general request limit defaults to 1,000 requests/minute per socket IP.
Forwarded IP headers remain untrusted, so public traffic shares the proxy bucket.
Readiness has an independent 60-request/minute limit. Retain these defaults for
this beta and record any later capacity adjustment. See the bounded configuration
in [Development](../DEVELOPMENT.md#request-limits-and-browser-credentials).

## Backup and deployment sequence

1. Restore the pre-release database into an isolated target. Apply the candidate
   migrations there and compare canonical rows, published visibility, grants and
   query behavior. Never use the live database as a test target.
2. Stop all API and worker writers for the final recovery point. A local Compose
   stop check says nothing about Railway. Verify live process/deployment state
   and account for any other database writers. Capture the database and attachment
   volume as one recovery set, with hashes and a manifest. A deployment predating
   attachment support has no attachment data; record that verified condition.
3. Deploy the API and worker from the verified archive, then deploy web and proxy
   from that same archive. Use explicit `--project`, `--environment` and
   `--service` selectors with `railway up --detach --json`. Capture each returned
   deployment ID and wait for its successful state. The API runs migrations under
   the repository migration lock before it accepts requests.
4. Require matching identity from `/api/health`, `/release.json`, and the worker's
   `/app/build-info.json`. Check the source SHA, release, lockfile hash and schema
   head, not only HTTP 200. Confirm scanner readiness, empty or progressing outbox,
   healthy worker loop, secure session cookies and denied unauthenticated reads.
5. Run authenticated synthetic authoring, review, publish, draft edit, reader
   retrieval, citation and revocation checks. Inspect desktop/mobile screenshots.
   Do not call a paid answer provider for this release proof. Remove only the
   identifiable synthetic fixtures created for the check.
6. Capture and verify the post-release database/blob recovery set. Publish the
   source archive, manifest, checksums and concise verification record on the
   prerelease after its disclosure review. Preserve all prior immutable tags and release assets.

## Rollback boundary

The July deployment does not understand the published-version pointer. Once this
release accepts a draft edit, switching back to that image can expose the draft.
It is therefore not a safe application-only rollback target. Before writers
reopen, a failed rollout may restore the matched pre-release recovery set and
previous deployment configuration. After writers reopen, prefer a forward fix or
a previously verified image that supports migrations 038 and 039. Restoring an
older database after that point is a separate data-loss decision.

Use [Asset-change recovery](ASSET_CHANGE_RECOVERY.md) for index lag and
[Backup and restore](BACKUP_RESTORE.md) for coordinated recovery. Do not delete
canonical content or the durable outbox to make health checks green.

Operational references: [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles),
[Railway volumes](https://docs.railway.com/volumes), and
[NGINX security advisories](https://nginx.org/en/security_advisories.html).
