# EXP Phase 0

Application source is fixed at the approved SHA. Images are built natively on EXP
from the pushed build commit. `images.conf` records immutable application image IDs
and third-party registry digests. CI copies under `ci/` are inactive.

Install shell scripts under `/mnt/cache/appdata/forgetbase/bin/`. Install env files
under `secrets/` as root:600, with `secrets/`, `backups/`, and `import/` root:700.
Env examples contain names only. Never create `tunnel.env` during Phase 0.

Install `/boot/config/forgetbase-fw.sh` and verify its rules before creating networks.
Use `run-<service>.sh create` to create stopped containers.
`run-<service>.sh run` starts the service and must be used only when authorized.
Phase 0 starts Postgres and the clamd container. API, proxy, worker, migrate and
backup remain stopped. Only the owner-role one-shot may run migrations.

The pinned images were built from `d9b81da722b78aa2546679a1628128ea78415b42`,
whose application source is `845eb49483dd45f0639414b971cb30cdfb88a074`.
Later commits containing runtime scripts do not change that image provenance.

DNS-1 remains open: Docker forwards external DNS to the host's LAN resolvers,
which the approved firewall blocks. Freshclam was stopped and retained under
amendment A6. The clamd wrapper waits for signatures, so the container is running
but the scanner is unavailable and its health check fails. Keep freshclam
stopped until the DNS design decision is approved; do not add DNS exceptions.

The tunnel starts only through `bash /boot/config/forgetbase-fw.sh start`, after
firewall verification. Missing `tunnel.env` skips startup. It never auto-restarts.
No published ports, docker.sock, privileged mode, or host networking are used.

R2 and age recipients remain blank. Backup/restore scripts are unscheduled.
See `BACKUPS.md` for the separate later verification requirements.
GHCR/CI publishing is deferred until the account has the required workflow scope.
