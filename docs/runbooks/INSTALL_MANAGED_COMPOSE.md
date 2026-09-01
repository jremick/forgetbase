# Managed Docker Compose Installation

This runbook defines the installation boundary required for UI-driven ForgetBase updates.

## Boundary

- Managed releases use `compose.managed.yaml` and digest-pinned images from a signed release manifest.
- The host-level updater runs as the same operating-system user that owns the ForgetBase Docker Compose project.
- The API and web containers do not receive the Docker socket.
- Source-checkout installs can check for updates, but they cannot apply them through the UI.
- Hosted installs report platform-managed maintenance and do not expose self-hosted update controls.

## Required Configuration

Store deployment values outside the repository. The managed release environment requires:

- `FORGETBASE_POSTGRES_PASSWORD`
- `FORGETBASE_UPDATER_API_TOKEN`, with at least 32 random bytes
- `FORGETBASE_SYSTEM_UPDATE_OWNER_EMAILS`, as an exact comma-separated allowlist
- digest-pinned image variables from the verified release manifest
- `FORGETBASE_VERSION`, `FORGETBASE_SOURCE_REVISION`, `FORGETBASE_RELEASE_CHANNEL`, and `FORGETBASE_DATABASE_SCHEMA_VERSION`

The update public key is not secret. Configure the updater with `FORGETBASE_UPDATE_PUBLIC_KEY_ID` and `FORGETBASE_UPDATE_PUBLIC_KEY_FILE`.

Also configure:

- `FORGETBASE_UPDATE_FEED_URL`, using HTTPS
- `FORGETBASE_UPDATE_ALLOWED_REGISTRIES`, as the exact comma-separated image repository prefixes accepted by policy
- `FORGETBASE_UPDATE_BUNDLE_DIR`, as the immutable extracted release bundle
- `FORGETBASE_UPDATER_STATE_DIR`, as a durable host path outside the bundle and Postgres volume
- `FORGETBASE_UPDATES_ENABLED=true`
- `FORGETBASE_INSTALLATION_MODE=managed`

The default Compose bridge uses plain HTTP from the API container to `host.docker.internal` and sets `FORGETBASE_UPDATER_ALLOW_INSECURE_HTTP=true` explicitly. Treat this as a trusted single-host transport. For a separate host or untrusted network, use HTTPS and set the override to `false`.

Do not put the signing private key on an installation host.

## Verify And Initialize The First Release

Extract the release bundle into a new directory. Keep the signed manifest inside that directory. Install the pinned workspace dependencies, then initialize a new state directory:

```bash
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 release:managed-install -- \
  --bundle /opt/forgetbase/releases/0.2.0 \
  --manifest forgetbase-0.2.0.json \
  --public-key-file /etc/forgetbase/release-signing-key.pub \
  --key-id forgetbase-release-2026 \
  --allowed-registries ghcr.io/jremick/forgetbase/ \
  --state-dir /var/lib/forgetbase/updater
```

This command verifies every receipt entry, verifies the signed manifest, validates digest-pinned images, and creates `current-release.env` plus `identity.json` with mode `0600`. It fails if managed state already exists. It does not start containers, replace data, or create secrets.

Generate and store the updater token with the other deployment secrets. Use at least 32 random bytes. Give the API and host updater the same value without printing it into logs.

Start the initial Compose release with the verified environment file and deployment secrets available to the process:

```bash
docker compose \
  --project-name forgetbase \
  --env-file /var/lib/forgetbase/updater/current-release.env \
  -f /opt/forgetbase/releases/0.2.0/compose.managed.yaml \
  up -d
```

The Compose file maps `host.docker.internal` to the host gateway for Linux and Docker Desktop compatibility. Override `FORGETBASE_UPDATER_URL` when the updater uses another trusted host route.

## Host Updater

Build and start the updater from the installed release bundle:

```bash
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 --filter @forgetbase/updater-service... build
npx -y pnpm@11.7.0 --filter @forgetbase/updater-service start
```

Production installs should supervise this process with the host service manager. On Docker Desktop, prefer loopback. On Linux, bind only to the Docker bridge address or use a TLS/Unix-socket proxy that the API container can reach. Do not bind port `3010` to an untrusted interface or expose it publicly.

The service environment must include the verified values from `current-release.env` plus the updater, feed, registry, token, bundle, state, and deployment settings above. The default managed Compose file is `compose.managed.yaml`.

## In-App Flow

1. Sign in as an admin whose exact normalized email is in `FORGETBASE_SYSTEM_UPDATE_OWNER_EMAILS`.
2. Open **Admin > Updates**.
3. Select **Check for updates** and review the signature identity, release notes, risk, downtime, migration, and rollback mode.
4. Run preflight and resolve every blocking failure.
5. Choose apply now or a future UTC time, keep automatic rollback enabled unless a release-specific runbook says otherwise, and confirm the exact version.
6. Leave the page open or return later. Job state survives API and database restarts.
7. Verify the installed version and recovery point after completion.

An ordinary tenant admin who is not in the deployment-owner allowlist receives `403` and does not see the Updates navigation item.

## Recovery

The updater state directory is outside Postgres and contains:

- the update job ledger
- current and candidate release receipts
- verified database recovery points
- configuration snapshots without secret values
- image digests and schema identity

Keep the CLI and [rollback runbook](ROLLBACK.md) available. The UI is the primary update surface, but it is not the only recovery path.

Do not remove a prior release bundle or recovery directory until its retention window has passed and the new release has independent backup evidence.

## Verification

Before accepting an installation or upgrade, run the repository deployment-default gate and validate the exact Compose projection:

```bash
npx -y pnpm@11.7.0 security:check-deployment-defaults
docker compose \
  --project-name forgetbase \
  --env-file /var/lib/forgetbase/updater/current-release.env \
  -f /opt/forgetbase/current/compose.managed.yaml \
  config --quiet
```

Then confirm `/health`, `/ready`, `/system/version`, the Updates page, and an off-host restore drill according to the release risk tier.
