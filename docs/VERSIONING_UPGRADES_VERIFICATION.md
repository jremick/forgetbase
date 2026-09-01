# Versioning And Upgrades Verification

Date: 2026-09-02  
Branch: `feat/versioning-upgrades`  
Risk tier: Tier 3, because the feature controls host processes, container supply chain, migrations, persistent data, and restore paths.

## Result

Phases 1-5 are implemented and ready for controlled managed-install UAT. This is not release or production proof. No tag, release, image push, feed publication, deployment, or live installation change was performed.

## Implemented Evidence

### Phase 1: Identity And Release Contract

- Shared product identity, signed manifest, channel, migration, preflight, job, status, and recovery schemas compile across the workspace.
- Ed25519 signature verification accepts canonical signed content and rejects tampering.
- Semantic version, upgrade-from, channel, minimum-updater, registry, digest, revocation, and rollback compatibility checks have unit coverage.

### Phase 2: Distribution And Installation

- A temporary Ed25519 release key signed the manifest template successfully.
- The managed bundle contained 35 receipted files.
- The installer verified the full receipt and signed manifest, then created managed identity and release environment files with mode `0600`.
- A deliberate change to a receipted runbook caused installation to fail with a bundle receipt mismatch.
- `docker compose config --quiet` passed for `compose.managed.yaml` with the verified release environment and required deployment settings.
- Docker Buildx checks passed without warnings for API, web, proxy, and migration targets in `infra/docker/release.Dockerfile`.

### Phase 3: Discovery And Choice

- Browser UAT showed the deployment owner an `Updates available` sidebar badge on first admin entry.
- The Updates page rendered installed identity, channel, schema, updater version, manifest key, feed state, structured notes, risk, downtime, migration mode, rollback mode, and recovery coverage.
- The page exposed manual check, preflight, local-time scheduling input, automatic rollback choice, and exact-version confirmation.

### Phase 4: Execution And Recovery

- Manager tests covered successful ordered execution, automatic application rollback on migration failure, manual database-restore confirmation, source-install fail-closed behavior, scheduled-release signature revalidation, and the post-write-boundary rollback shield.
- Browser UAT showed that the action stayed disabled until preflight and explicit confirmation passed, then rendered durable job progress, cancel eligibility, reconnect guidance, and verified recovery history.
- Recovery data remains outside Postgres and the managed executor uses the existing backup and restore helpers.

### Phase 5: Hardening

- A dedicated Postgres 17 plus pgvector test container ran 71 database tests, including exact pending migration sets and applied checksum drift rejection.
- The updater bearer token minimum, timing-safe comparison, explicit plaintext-transport override, loopback default, no-Docker-socket application boundary, direct argument execution, timeouts, bounded output, path containment, recovery retention, and configuration drift checks are enforced.
- The deployment security gate passed 39 checks, including the new managed-install invariants.

## Final Automated Checks

- `pnpm typecheck`: passed across 11 workspace projects.
- `pnpm test`: 245 passed; 37 environment-gated tests skipped. The skipped Postgres group was run separately and passed as noted above.
- `pnpm web:bundle-budget`: passed at 860.01 kB raw and 236.64 kB gzip for all JavaScript.
- `pnpm openapi:check`: 90 documented routes matched 92 server routes plus two explicit meta-route exceptions.
- `pnpm security:check-deployment-defaults`: 39 checks passed.
- `pnpm claims:lint`: passed across 94 public copy and source files.
- `pnpm public-beta:check`: passed.
- `pnpm test:uat`: passed and wrote its existing public-beta evidence under `work/public-beta-uat`.
- `git diff --check`: passed.
- Rendered Updates browser UAT: passed with no console warnings or errors.

## Proof Still Required Before Release Or Production Use

- Build and push real release images, then read back their registry digests.
- Publish a signed channel feed through an approved release workflow and test revocation and key rotation against the deployed endpoint.
- Run a full update against an isolated managed Compose installation using those exact images.
- Inject failures in the real Docker execution path at backup, migration, candidate health, and rollback phases.
- Perform an off-host database and attachment restore drill.
- Install and restart the updater through the target host service manager, including the minimum-updater compatibility path.
- Run controlled UAT on each supported host platform and document Docker bridge or TLS transport configuration.

These items require release artifacts or live installation mutation and remain outside the authorized branch-only implementation scope.
