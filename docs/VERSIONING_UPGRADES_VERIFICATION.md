# Managed updates verification

The managed updater is an opt-in feature for a synthetic Linux Docker Compose installation. Public release/feed publication and production activation remain separate operations.

The repeatable integration drill is `scripts/verify-managed-updates.ts`. Run it with Node 26.10.0, pnpm 11.7.0, Docker Compose and Linux `flock` on an isolated host after building the workspace. It creates its own registry, signed manifests, images, database and attachment volumes; it does not use production data. Its evidence directory records runtime versions, image digests, update phases, failure results and cleanup. Review the script's arguments before execution.

The drill covers direct API and worker fencing, signed-feed rejection, exact image identity, Docker failures, updater process restart, manual restore consent, recovery artifact integrity and post-write rollback protection. A separate physical-host database and attachment restore establishes off-host recovery; a second stack on the same Docker engine alone does not.

Focused regression suites cover signature/receipt tampering, restricted deployment-owner authorization, job admission/cancellation, interrupted ledger recovery, and migration checksum/target validation. Existing public API/SDK/CLI/MCP contracts remain required.

## Evidence status

The feature remains a draft. Host mutation authorization is under review, and the complete update/recovery drill must pass before activation. Do not treat the archived prototype's historical results as evidence for this implementation.

The initial candidate tree `149e57d61bf5198ea82354262a5e4cfe754cba4c` passed 672 tests with PostgreSQL, the 58 public contract checks, and GitHub Verify on commit `fa6e283eef45d636b410d9a00c333f1e6f8c3301`. Subsequent review repairs require their own final evidence; those earlier checks do not establish the final branch state.

The third isolated Linux AMD64 drill verified signed-feed rejection, owner/non-owner transport checks, scheduling/cancellation, and direct candidate API/worker write fences. It then exposed a Node 26 lock-file handle lifetime failure. That drill did not complete successfully.

A verified recovery set from that drill was transferred from the Windows-hosted Docker engine to a separate Mac and restored into native PostgreSQL 17.11 ARM64 with pgvector 0.8.5. Verification matched 35 migration IDs/checksums, 20 synthetic assets and their instruction/document content, the original canary, and the exact attachment bytes and metadata. The source backup manifest SHA-256 was `e8e0dda88b55e51ace82c2237ef1f6aa58ac0910268ddb0d8fbb656ef0d931d3`. The temporary native database was stopped after verification. This establishes recovery of that backup point, independently of the incomplete update drill.

Final commit, complete drill, rendered UI evidence, and current CI/review results remain required before merge.

## Supported boundary

The host updater requires Linux, Node 26, Bash, Docker Compose and util-linux `flock`, with state on a local filesystem. Application containers do not receive the Docker socket. A native Windows/macOS updater, Linux ARM64 runtime, real host power-loss survival, and production rollout are not established by Linux AMD64 process-restart tests.
