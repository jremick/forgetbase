# EXP Phase 0

Application source is fixed at the approved SHA. Images are built natively on EXP
from the pushed build commit. `images.conf` records immutable application image IDs
and third-party registry digests. CI copies under `ci/` are inactive.

Install shell scripts under `/mnt/cache/appdata/forgetbase/bin/`. Install env files
under `secrets/` as root:600, with `secrets/`, `backups/`, and `import/` root:700.
Env examples contain names only. Never create `tunnel.env` during Phase 0.

Install `/boot/config/forgetbase-fw.sh` before starting any workload.
Create the seven named bridges, then apply and verify the firewall.
Use `run-<service>.sh create` to create stopped containers.
`run-<service>.sh run` starts the service and must be used only when authorized.
Phase 0 starts Postgres, clamd and freshclam (four checks per day).
The backup joins only forgetbase-db and forgetbase-bk (172.30.54.2).
API, proxy, worker, migrate and backup remain stopped. Only the owner-role one-shot may run migrations.

The original pinned images were built from `d9b81da722b78aa2546679a1628128ea78415b42`,
whose application source is `845eb49483dd45f0639414b971cb30cdfb88a074`.
Later commits containing runtime scripts do not change that image provenance.

DNS-1a permits public DNS only for the six named sources through 1.1.1.1 and
1.0.0.1. The other containers cannot resolve public names. Both firewall scripts
and the shared watchdog check all seven explicit bridges. Missing bridges or
rules stop both tunnels and emit a host log and Unraid alert.

Install `cf-ips.sh` and `watchdog.sh` as `/boot/config/cf-ips.sh` and
`/boot/config/railway-exit-watchdog.sh`. Append `go-hook.sh` after the existing
management startup line. The hook validates the live Cloudflare IPv4 list at
boot and retains the last valid copy if fetching or validation fails. Both
backups have HTTPS access only to those ranges. Scoped OUTPUT drops prevent
host-originated new connections to both backup addresses: 172.30.40.5 on
br-myskills and 172.30.54.2 on br-fb-bk. Both canonical policies, fail-closed
startup checks and the shared watchdog require the MySkills backup drop.

The tunnel starts only through `bash /boot/config/forgetbase-fw.sh start`, after
firewall verification. Missing `tunnel.env` skips startup. It never auto-restarts.
No published ports, docker.sock, privileged mode, or host networking are used.

R2 and age recipients remain blank. Backup/restore scripts are unscheduled.
See `BACKUPS.md` for the separate later verification requirements.
GHCR/CI publishing is deferred until the account has the required workflow scope.

Freshclam uses a 1.5 GiB memory limit with `--memory 1536m --memory-swap 1536m`
and keeps `TestDatabases yes` and `Checks 4`. Run 12 passed the normal update
check and one full download with database load tests into disposable tmpfs,
sharing freshclam's network namespace. The full test peaked at about 697 MiB
with no OOM. If this limit OOMs, restore 3 GiB; do not lower it further.
Keep the configured Phase 0 memory sum at or below 14 GiB and host available
memory at or above 6 GiB.
The installed seven-bridge firewall remains active. Both database backup roles
exist. The backup contract is pending design (capacity), not a STOP 0 blocker.
The monitor is not configured; default push-from-host. Uploader candidates and
the host monitor wrapper remain local and are not adopted during Phase 0.
Keep backups, application containers, migrations and real tunnels stopped.
Main, daily and bytecode signatures are installed. Clamd keeps `Foreground yes`
and records EICAR detections in Docker logs; run 12 verified a FOUND line plus
healthy state. The direct INSTREAM path was used because the EXP API database
lacks the schema needed for startup and authenticated uploads. No API startup,
migration, clamd recreation or file/syslog fallback was needed. Clamd's scan
limits and hardening remain unchanged. Freshclam keeps its four-checks-per-day
schedule.

EXP Node runtimes require CA packages >= 20261020-r0 and use `--use-openssl-ca`
with `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt`. Keep the flag if adding
`NODE_OPTIONS` to an env file or run script. Runtime-stage builds check eMudhra
rejection and Resend TLS. Remove this workaround after the Node release with
nodejs/node#66871 ships and the pinned base is bumped. Railway production is
unchanged and needs separate approval.

The API/migrate and worker images were rebuilt for eMudhra fix 1 from
`5690cf2a256abbd0a617b707891cebe11f6d9203`. Their immutable IDs are in
`images.conf`; non-Node images retain the original pins.
