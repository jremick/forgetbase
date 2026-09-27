# Managed Docker Compose Installation

This runbook defines the installation boundary required for UI-driven ForgetBase updates.

## Boundary

- Managed releases use `compose.managed.yaml` and digest-pinned images from a signed release manifest.
- The host-level updater runs as the same operating-system user that owns the ForgetBase Docker Compose project.
- The API and web containers do not receive the Docker socket.
- Source-checkout installs can check for updates, but they cannot apply them through the UI.
- Hosted installs report platform-managed maintenance and do not expose self-hosted update controls.

## Supported Host

The updater is a Linux host process. It requires Node 26.10.0, pnpm 11.7.0, Docker with Compose, Bash, and util-linux `flock`. Keep its state on a local filesystem; shared NFS/SMB state is unsupported. A Linux runner on Docker Desktop can exercise the synthetic proof. Native macOS and Windows updater services are not supported by the current evidence.

The service takes an OS lock before reading or changing managed state. Child commands retain the lock across controller death until they exit. On restart, an interrupted active job becomes **needs attention** and is not replayed automatically. Review the recovery point and current services before choosing recovery. A database restore always requires the recovery timestamp and explicit data-loss confirmation.

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

Obtain the installer source and its pinned dependencies through an independently trusted channel. Configure the release public key from an independently authenticated maintainer channel. A key packaged alongside an unknown download is not a trust anchor. Never run the installer, package scripts, or dependency installation from an unverified bundle: an attacker could replace that verifier before it checks its own signature.

Extract the bundle into a new directory owned by the deployment operator. The parent directories, extracted tree, public key, trusted installer checkout, and state directory must not be writable by application containers or untrusted users. Keep the original bundle immutable after verification. Signature checks authenticate bytes at verification time; they cannot protect files subsequently replaced by someone who can write the host tree.

From the independently trusted installer checkout, initialize a new state directory:

```bash
cd /srv/forgetbase-trusted-installer
npx --yes --package node@26.10.0 --package pnpm@11.7.0 -c 'pnpm install --frozen-lockfile'
npx --yes --package node@26.10.0 --package pnpm@11.7.0 -c 'pnpm release:managed-install -- \
  --bundle /opt/forgetbase/releases/0.2.0 \
  --manifest forgetbase-0.2.0.json \
  --public-key-file /etc/forgetbase/release-signing-key.pub \
  --key-id forgetbase-release-2026 \
  --allowed-registries ghcr.io/jremick/forgetbase/ \
  --state-dir /var/lib/forgetbase/updater'
```

The trusted command first verifies `bundle-receipt.sig.json` against the canonical `bundle-receipt.json` payload with the configured Ed25519 key. It then checks exact coverage of every regular bundle file except those two receipt metadata files, rejects duplicate/traversal paths and symbolic links, and compares every SHA-256 hash. The selected manifest and every selected Compose file must be covered. The manifest must verify with the same trusted key, and all image references must use approved repository boundaries and exact digests.

Only after these checks does the installer create `current-release.env`, `identity.json`, and the Compose drift receipt with mode `0600`. It fails if managed state already exists. It does not start containers, replace data, or create secrets. Unsigned prototype receipts are intentionally rejected; rebuild and sign them through the trusted release process below.

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

Build the updater in a separate runtime copy of the verified bundle. Dependency installation and compilation add files, so keep them out of the immutable original used for receipt verification and Compose operations:

```bash
mkdir -p /opt/forgetbase/updater-runtime
cp -a /opt/forgetbase/releases/0.2.0 /opt/forgetbase/updater-runtime/0.2.0
cd /opt/forgetbase/updater-runtime/0.2.0
npx --yes --package node@26.10.0 --package pnpm@11.7.0 -c 'pnpm install --frozen-lockfile'
npx --yes --package node@26.10.0 --package pnpm@11.7.0 -c 'pnpm --filter @forgetbase/updater-service... build'
npx --yes --package node@26.10.0 --package pnpm@11.7.0 -c 'pnpm --filter @forgetbase/updater-service start'
```

Set `FORGETBASE_UPDATE_BUNDLE_DIR=/opt/forgetbase/releases/0.2.0` to the original verified bundle. Protect the runtime copy and its dependencies with the same host ownership boundary.

Production installs should supervise this process with the Linux host service manager. Bind only to the Docker bridge address or use a TLS/Unix-socket proxy that the API container can reach. Do not bind port `3010` to an untrusted interface or expose it publicly.

The service environment must include the verified values from `current-release.env` plus the updater, feed, registry, token, bundle, state, and deployment settings above. The default managed Compose file is `compose.managed.yaml`.

## Produce A Signed Bundle

Release maintainers run this workflow in trusted source with a reviewed unsigned manifest and digest-pinned image references. Keep the Ed25519 private key outside the repository, bundle, and installation host. The commands require the key path and key identity explicitly; they do not discover credentials or use a signing service.

```bash
npx --yes --package node@26.10.0 --package pnpm@11.7.0 -c 'pnpm exec tsx scripts/generate-release-manifest.ts \
  --input /secure/release/manifest-input.json \
  --output /secure/release/forgetbase-0.2.0.json \
  --private-key-file /secure/signing/release-key.pem \
  --key-id forgetbase-release-2026'
npx --yes --package node@26.10.0 --package pnpm@11.7.0 -c 'pnpm release:managed-bundle -- \
  --manifest /secure/release/forgetbase-0.2.0.json \
  --output /secure/release/bundle-0.2.0 \
  --private-key-file /secure/signing/release-key.pem \
  --key-id forgetbase-release-2026'
```

The builder verifies that the same key signed the release manifest, refuses an existing output directory, rejects source symlinks, and signs the canonical complete receipt. Identical source, manifest, key, and key identity produce identical receipt and signature bytes. Publish the two receipt files with the whole bundle; do not regenerate a receipt on the installation host. Key rotation requires an explicit operator change to trusted configuration.

Feed downloads are limited to 2 MiB, use HTTPS without redirects, and require Ed25519 signatures. Image policy accepts an exact repository or slash-delimited namespace prefix; `ghcr.io/jremick/forgetbase` cannot authorize `ghcr.io/jremick/forgetbase-evil`. URLs, shell/environment expressions, whitespace/control characters, and malformed OCI references are rejected.

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
- restore-verified database and attachment recovery sets
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

Then confirm `/health`, `/ready`, `/system/version`, the Updates page, and an off-host database-plus-attachment restore drill according to the release risk tier.
