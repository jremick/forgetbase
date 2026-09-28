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

The request routes require an authenticated tenant admin whose normalized email is in the exact `FORGETBASE_SYSTEM_UPDATE_OWNER_EMAILS` allowlist. This filter grants discovery and request access; it is not host authority. Existing tenant account-management permissions can impersonate an allowlisted principal. Every update and manual restore therefore needs a separate approval from the host operator through the protected host CLI.

The operator chooses one of three outcomes:

1. Leave the current release installed.
2. Request the verified release for a later time. The browser converts the operator's local selection to UTC for the job ledger.
3. Request the verified release without a maintenance schedule.

Every request starts in `awaiting-approval` and occupies the single active-operation slot. The request credential cannot approve it. The host operator inspects the immutable request and approves or denies its exact digest using the host CLI. The approval binds the installation, job, complete request, source identity, signed manifest digest and key, schedule, expiry, and automatic recovery option. A manual restore instead binds the selected recovery metadata, verified receipt digest and exact data-loss timestamp. Changes require a new request and approval.

Immediate requests expire 24 hours after submission; scheduled requests expire one hour after the chosen time. These deadlines are fixed when the request is created. Approval does not extend them. The operator can cancel an unstarted request; denial and expiry are terminal outcomes. An approved schedule can execute unattended at its chosen time while its approval remains valid. No release is applied merely because it is available.

The existing request endpoints still return HTTP `202`; that means the request was recorded, not that execution began. Job responses add nullable approval metadata and the phases `awaiting-approval`, `denied` and `expired`. Clients with exhaustive phase switches must handle these values. Host-approved future work uses `scheduled` with an approved decision and no consumption timestamp until it starts. Historical jobs can have null approval metadata; they do not gain execution authority through this compatibility default.

Status reports `hostApprovalRequired: true` for this host-approval implementation. The API checks this capability before submitting an update or restore request; an older updater without it remains available for discovery but must be upgraded before requests can run. Checking the response after submission would be too late for an older service that executes immediately.

Immutable approval descriptors are limited to 256 KiB. A larger signed release can be discovered within the feed's 2 MiB limit, but its update request is rejected with a size error; the descriptor is never truncated. New requests retain the newest 200 jobs, and status returns the newest 50. This count limit can remove older `needs-attention` details; preserve important incident evidence separately. The additional 4 MiB ledger limit removes the oldest completed, failed, rolled-back, cancelled, denied or expired jobs when needed. That size pruning preserves pending work, recovery points and remaining `needs-attention` jobs. Neither history limit deletes the separate approval decision or consumption records. If retained records cannot fit, the write fails closed and new requests can be unavailable until the host operator resolves the retained state. Control responses are bounded to 5 MiB.

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

The requester must explicitly confirm the selected version. Before any installation change, the host updater checks the protected approval, re-verifies the current signed release and source identity, and durably consumes the approval with the job claim. The update state machine then:

1. Repeats preflight immediately before mutation.
2. Pulls only digest-pinned candidate images and confirms the candidate migration plan matches the signed migration IDs.
3. Enters maintenance and stops writers.
4. Creates a coordinated database, attachment, and configuration recovery point and restore-verifies it.
5. Resumes the current release automatically if recovery creation fails before a verified point exists.
6. Runs the candidate migration once.
7. Starts only the candidate API and web. Its immutable container environment denies all API requests except health/readiness before authentication or telemetry. Startup migration and attachment maintenance are disabled; the worker remains stopped and independently rejects database work while fenced.
8. Verifies readiness, the API write fence, and immutable API/web build identities against the signed version, source revision and schema target.
9. Durably records that writes may reopen, then persists the opened release environment and identity before recreating API/worker and reopening the proxy. Any failure after that durable boundary requires manual recovery; automatic database restore is forbidden.

Job state and recovery metadata live outside Postgres. Ledger and release control files use atomic replacement and filesystem synchronization. A browser page reconnects after the API returns and reads the durable ledger without resubmitting a mutation.

The Linux updater holds a kernel file lock on local state before reading the ledger or listening. Child commands inherit that lock so an orphaned restore command keeps a replacement controller from running concurrently. Startup can preserve a valid unstarted request or approved schedule whose approval has not been consumed. It marks uncertain or consumed interrupted jobs `needs-attention`, with their last phase and recovery guidance. Legacy queued jobs without a bound approval cannot execute. It never repeats an uncertain migration, restore or write reopening automatically. The next manual recovery needs a new approval and stops and removes only the owned migration container before restoring. A corrupt ledger fails closed; the operator must inspect the running release and recovery point before acting.

Automatic rollback is available before writes reopen. If a failure occurs in that window, the updater restores the verified recovery point according to the signed rollback mode:

- `application`: restore the previous image and configuration set without restoring Postgres. This is valid only for a compatible migration declaration.
- `database-restore`: keep writers stopped, restore the database and attachment backup set plus prior configuration, then restart the previous services.
- `unavailable` or `platform-managed`: reject the release for a managed self-hosted installation.

Manual rollback requests remain available from the Updates page. Every manual recovery-set restore can discard database writes and attachment changes made after the selected recovery point, including after failed or interrupted jobs. The UI binds explicit data-loss confirmation to one selected recovery point and its exact timestamp. The host operator must separately approve that exact recovery request. Recovery artifacts are verified before maintenance and again before destructive restore.

### Phase 5: Hardening And Operations

The update boundary fails closed:

- unknown signing keys, bad signatures, revoked releases, redirects, insecure remote feeds, unsupported registries, mutable image tags, and image/digest mismatches are rejected
- source and hosted installations cannot invoke managed host mutation
- weak or missing updater bearer tokens are rejected
- the API-to-updater token grants request/status access, never host approval
- configurable model and OIDC secret references cannot select the reserved updater token or its file-backed variants, even under a permissive tenant policy
- approval files, installation identity and CLI remain outside application-container mounts; no HTTP approval endpoint exists
- an approval is consumed once before host mutation; changed, expired, cross-installation or replayed approvals fail closed
- only one mutating update or rollback job can be active
- requests awaiting approval and unstarted approved schedules can be canceled; a mutating job cannot be canceled as if no change occurred
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
| Decide | Keep requests pending until exact host approval | Request now or later, inspect on the host, approve or deny, or defer |
| Protect | Run preflight and create a restore-verified database, attachment, and configuration recovery point | Resolve blocking checks and preserve external backups |
| Execute | Stage, migrate, health-check, and reopen in ordered phases | Keep the host updater supervised and reachable only on the trusted host path |
| Recover | Perform approved automatic recovery before writes reopen and retain manual recovery points | Confirm data loss and approve each manual recovery on the host |

## Installation Modes

### Managed Docker Compose

Update discovery, preflight, update and recovery requests are available in the app. Host CLI approval is required for execution. Use [Managed Docker Compose Installation](runbooks/INSTALL_MANAGED_COMPOSE.md).

### Source Checkout

The system can report its source identity and, when an advisory updater is configured, inspect release information. Apply and rollback fail closed. The operator continues to use Git, local build commands, and the existing [Rollback Runbook](runbooks/ROLLBACK.md).

### Hosted

The system reports platform-managed maintenance. Self-hosted controls are absent. The hosting platform owns rollout, rollback, and maintenance communication.

## Migration Classes

- `application-only`: no database changes. The target schema must equal the installed schema and the migration list must be empty.
- `additive`: older application code can continue to use the migrated database. Application rollback is allowed if the manifest declares it.
- `destructive`: old code is not assumed compatible. A coordinated database and attachment recovery point is required and rollback restores it.

The updater compares the complete candidate migration plan with the declared migration IDs and schema target in the signed manifest before maintenance starts, then repeats those checks under the migration lock. It validates all applied checksums before executing any pending SQL and rejects a signed candidate that omits applied history. An additive application rollback retains the migrated schema. Retrying that signed release may skip a declared migration only when its recorded checksum matches the candidate bytes; undeclared pending migrations still fail closed. Historical rows with NULL checksums adopt the current SQL as a future drift baseline; this cannot prove the bytes originally applied.

## Recovery Retention

The default retention count is three recovery points. A protected point is not deleted automatically. Retention includes the database dump, attachment archive, backup-set manifest, configuration snapshot, release identity, image references, and schema identity.

External backups remain necessary. In-app recovery is a fast operational path, not a replacement for off-host backup policy or restore drills.

## Acceptance Criteria

A managed update capability is ready for a release only when:

- signature and tamper tests pass
- source and hosted mutation attempts fail closed
- request-token holders and impersonated allowlisted admins cannot cause host mutation without exact host approval
- approval binding, expiry, replay, concurrent claim and interrupted-consumption checks pass
- a real managed Compose configuration validates with digest-pinned images
- a clean update reaches the exact target health identity
- injected failures before writes reopen produce the declared rollback result
- destructive migration recovery is restore-tested as a coordinated Postgres and attachment set
- the web flow is checked in a browser for availability, notes, preflight, confirmation, progress, history, and rollback warnings
- OpenAPI, type, unit, integration, security, and repository contract gates pass

Release publication, tag creation, registry push, deployment, feed mutation, and installation activation are separate owner-authorized actions.

See [Versioning And Upgrades Verification](VERSIONING_UPGRADES_VERIFICATION.md) for the current evidence and limits.
