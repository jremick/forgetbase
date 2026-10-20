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

The pinned images were built from `d9b81da722b78aa2546679a1628128ea78415b42`,
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
backups have HTTPS access only to those ranges. A scoped OUTPUT drop prevents
host-originated new connections to the ForgetBase backup address.

The tunnel starts only through `bash /boot/config/forgetbase-fw.sh start`, after
firewall verification. Missing `tunnel.env` skips startup. It never auto-restarts.
No published ports, docker.sock, privileged mode, or host networking are used.

R2 and age recipients remain blank. Backup/restore scripts are unscheduled.
See `BACKUPS.md` for the separate later verification requirements.
GHCR/CI publishing is deferred until the account has the required workflow scope.

Run 9 is stopped: freshclam's database load test exhausted its 256 MiB memory
limit. Freshclam is stopped; clamd still awaits signatures. The installed
seven-bridge firewall remains active. Both database backup roles exist, but
adoption of the revised backup uploader and host monitor wrapper is pending.
Keep backups, application containers, migrations and real tunnels stopped.
The complete watchdog and containment rerun has not passed this run.
