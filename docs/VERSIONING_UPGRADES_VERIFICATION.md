# Managed updates verification

The managed updater is an opt-in feature for a synthetic Linux Docker Compose installation. Public release/feed publication and production activation remain separate operations.

The repeatable integration drill is `scripts/verify-managed-updates.ts`. Run it with Node 26.10.0, pnpm 11.7.0, Docker Compose and Linux `flock` on an isolated host after building the workspace. It creates its own registry, signed manifests, images, database and attachment volumes; it does not use production data. Its evidence directory records runtime versions, image digests, update phases, failure results and cleanup. Review the script's arguments before execution.

The drill covers direct API and worker fencing, signed-feed rejection, exact image identity, Docker failures, updater process restart, manual restore consent, recovery artifact integrity and post-write rollback protection. A separate physical-host database and attachment restore establishes off-host recovery; a second stack on the same Docker engine alone does not.

Focused regression suites cover signature/receipt tampering, restricted deployment-owner authorization, job admission/cancellation, interrupted ledger recovery, and migration checksum/target validation. Existing public API/SDK/CLI/MCP contracts remain required.

## Evidence status

Feature completion evidence is being collected against the candidate commit. Do not treat the archived prototype's historical results as evidence for this implementation. Record the final tested commit and results here before merge.

## Supported boundary

The host updater requires Linux, Node 26, Bash, Docker Compose and util-linux `flock`, with state on a local filesystem. Application containers do not receive the Docker socket. A native Windows/macOS updater, Linux ARM64 runtime, real host power-loss survival, and production rollout are not established by Linux AMD64 process-restart tests.
