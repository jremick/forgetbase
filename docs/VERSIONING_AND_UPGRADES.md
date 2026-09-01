# Versioning And Upgrades

## Purpose

This document defines how ForgetBase identifies releases, informs an operator, applies a managed update, and recovers from failure. It covers the self-hosted system boundary and the in-app operator experience.

The first supported self-update target is a managed Docker Compose installation. Source checkouts remain operator-managed. Hosted installations remain platform-managed.

## Delivery Phases 1-5

### Phase 1: Release Identity And Policy

Every running installation reports one product identity:

- semantic product version
- source revision
- build timestamp
- release channel: `stable`, `beta`, or `nightly`
- installation mode: `managed`, `source`, or `hosted`
- database schema version
- updater version and protocol version

Every managed release has a signed manifest. The manifest is the release contract. It includes:

- exact digest-pinned images for API, web, worker, migration, and proxy components
- supported source versions and minimum updater version
- target schema and exact migration IDs
- migration compatibility and rollback mode
- estimated downtime and update risk
- required recovery components
- structured operator-facing release notes
- revocation state

ForgetBase uses semantic versions for product ordering. Release channels do not cross automatically. A channel change is an explicit operator configuration change.

### Phase 2: Managed Packaging And Installation

The managed distribution contains the Compose definition, updater service source, backup and restore helpers, public runbooks, signed release manifest, and a complete SHA-256 bundle receipt.

The installer verifies the receipt, verifies the Ed25519 manifest signature against an explicitly configured public key, validates every image registry and digest, and creates the initial release identity outside the application database. It refuses to overwrite existing managed state.

The host updater runs under the operating-system account that owns the Compose project. The API container does not receive the Docker socket or unrestricted host access.

### Phase 3: Discovery And Operator Choice

The updater periodically checks the configured HTTPS feed. An operator can also request a check from the Updates page.

The page shows:

- installed and available versions
- current channel and installation mode
- signed-manifest key identity and feed state
- summary, highlights, security changes, breaking changes, configuration changes, and known issues
- risk, expected downtime, migration compatibility, and rollback mode

Only a deployment owner can see and use update controls. A deployment owner must be an authenticated tenant admin whose normalized email is in the exact `FORGETBASE_SYSTEM_UPDATE_OWNER_EMAILS` allowlist. Tenant admin status alone does not grant host update authority.

The operator chooses one of three outcomes:

1. Leave the current release installed.
2. Schedule the verified release for a later time. The browser converts the operator's local selection to UTC for the job ledger.
3. Apply the verified release now.

No release is applied merely because it is available. ForgetBase does not enable unattended application by default.

### Phase 4: Update, Recovery, And Rollback

Before acceptance, the updater runs a non-mutating preflight. Blocking checks include:

- installation mode and updater compatibility
- current health
- supported upgrade path
- Docker and Compose availability
- managed configuration validity and drift
- available disk space
- writable recovery storage
- required attachment snapshot capability

The operator must explicitly confirm the selected version. The update state machine then:

1. Repeats preflight immediately before mutation.
2. Creates and verifies a recovery point.
3. Pulls only digest-pinned candidate images.
4. Confirms the candidate migration plan matches the signed migration IDs.
5. Enters maintenance and stops writers.
6. Runs the candidate migration once.
7. Starts candidate services without reopening the public proxy.
8. Verifies API health and exact candidate version, then verifies the web service.
9. Reopens the proxy and commits the new release identity.

Job state and recovery metadata live outside Postgres. A browser page that remains open reconnects after the API returns and resumes from the durable job ledger.

Automatic rollback is available before writes reopen. If a failure occurs in that window, the updater restores the verified recovery point according to the signed rollback mode:

- `application`: restore the previous image and configuration set without restoring Postgres. This is valid only for a compatible migration declaration.
- `database-restore`: stop writers, restore the database backup and prior configuration, then restart the previous services.
- `unavailable` or `platform-managed`: reject the release for a managed self-hosted installation.

Manual rollback remains available from the Updates page. A database restore can discard writes made after the selected recovery point. The UI shows that timestamp and requires explicit data-loss confirmation.

### Phase 5: Hardening And Operations

The update boundary fails closed:

- unknown signing keys, bad signatures, revoked releases, redirects, insecure remote feeds, unsupported registries, mutable image tags, and image/digest mismatches are rejected
- source and hosted installations cannot invoke managed host mutation
- weak or missing updater bearer tokens are rejected
- API requests never expose the updater token
- only one mutating update or rollback job can be active
- queued work can be canceled; a mutating job cannot be canceled as if no change occurred
- migrations use an advisory lock, an exact signed pending set, and stored checksums
- applied migration checksum drift stops execution
- command execution uses argument arrays without a shell, bounded output, timeouts, and path-containment checks
- recovery points are retained independently of application database health
- a minimum updater version blocks incompatible product updates

Updater replacement itself is not performed by the application container. A release that requires a newer updater is blocked until the host updater is upgraded through the managed bundle and host service manager. This preserves the privilege boundary and prevents an application release from replacing its own control plane.

## System And User Responsibilities

| Concern | ForgetBase system | Deployment owner |
| --- | --- | --- |
| Detect | Fetch and verify the channel manifest | Choose the feed and channel |
| Explain | Present structured notes, risk, downtime, compatibility, and recovery mode | Review impact and known issues |
| Decide | Never auto-apply by default | Apply now, schedule, or defer |
| Protect | Run preflight and create a verified recovery point | Resolve blocking checks and preserve external backups |
| Execute | Stage, migrate, health-check, and reopen in ordered phases | Keep the host updater supervised and reachable only on the trusted host path |
| Recover | Auto-rollback before writes reopen and retain manual recovery points | Confirm any rollback that can discard later writes |

## Installation Modes

### Managed Docker Compose

Full update discovery, preflight, scheduling, apply, recovery, and rollback are available. Use [Managed Docker Compose Installation](runbooks/INSTALL_MANAGED_COMPOSE.md).

### Source Checkout

The system can report its source identity and, when an advisory updater is configured, inspect release information. Apply and rollback fail closed. The operator continues to use Git, local build commands, and the existing [Rollback Runbook](runbooks/ROLLBACK.md).

### Hosted

The system reports platform-managed maintenance. Self-hosted controls are absent. The hosting platform owns rollout, rollback, and maintenance communication.

## Migration Classes

- `application-only`: no database changes. The target schema must equal the installed schema and the migration list must be empty.
- `additive`: older application code can continue to use the migrated database. Application rollback is allowed if the manifest declares it.
- `destructive`: old code is not assumed compatible. A database recovery point is required and rollback restores it.

The updater trusts neither filenames nor local migration discovery alone. It compares the candidate migration plan with the exact IDs in the signed manifest before maintenance starts.

## Recovery Retention

The default retention count is three recovery points. A protected point is not deleted automatically. Retention includes the database dump, configuration snapshot, release identity, image references, schema identity, and attachment snapshot reference when configured.

External backups remain necessary. In-app recovery is a fast operational path, not a replacement for off-host backup policy or restore drills.

## Acceptance Criteria

A managed update capability is ready for a release only when:

- signature and tamper tests pass
- source and hosted mutation attempts fail closed
- unauthorized admins cannot call the update control API
- a real managed Compose configuration validates with digest-pinned images
- a clean update reaches the exact target health identity
- injected failures before writes reopen produce the declared rollback result
- destructive migration recovery is restore-tested with Postgres
- the web flow is checked in a browser for availability, notes, preflight, confirmation, progress, history, and rollback warnings
- OpenAPI, type, unit, integration, security, and repository contract gates pass

Release publication, tag creation, registry push, deployment, feed mutation, and installation activation are separate owner-authorized actions.

The current branch verification record is in [Versioning And Upgrades Verification](VERSIONING_UPGRADES_VERIFICATION.md).
