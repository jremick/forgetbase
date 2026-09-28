# Managed updates verification

The managed updater is an opt-in feature for a synthetic Linux Docker Compose installation. Public release/feed publication and production activation remain separate operations.

The repeatable integration drill is `scripts/verify-managed-updates.ts`. Run it with Node 26.10.0, pnpm 11.7.0, Docker Compose and Linux `flock` on an isolated host after building the workspace. It creates its own registry, signed manifests, images, database and attachment volumes; it does not use production data. Its evidence directory records runtime versions, image digests, update phases, failure results and cleanup. Review the script's arguments before execution.

The drill covers direct API and worker fencing, signed-feed rejection, exact image identity, Docker failures, updater process restart, manual restore consent, recovery artifact integrity and post-write rollback protection. A separate physical-host database and attachment restore establishes off-host recovery; a second stack on the same Docker engine alone does not.

Focused regression suites cover signature/receipt tampering, direct deployment-owner email filtering, job admission/cancellation, interrupted ledger recovery, and migration checksum/target validation. Direct email filtering does not establish independent host authority. Existing public API/SDK/CLI/MCP contracts remain required.

## Evidence status

The feature remains a draft. Review demonstrated that ordinary account-management permissions can impersonate an allowlisted deployment owner, and configurable secret references can select the feature's updater transport credential. The host mutation authority model must be resolved and verified before merge or activation. The checks below do not close that authorization gap. Do not treat the archived prototype's historical results as evidence for this implementation.

Verification on 28 September 2026:

- Commit `72b98a11ae3ff61c20a400ad71be33603926fda5` passed 683 tests across 59 files with real PostgreSQL. The 58 public API/SDK/CLI/MCP contract checks, typecheck/build, OpenAPI coverage, web bundle/UI/claims checks and 55 deployment-default checks also passed. Subsequent focused suites passed 88 tests and three Linux process-lock tests; the forced-GC lock regression was reproduced before repair.
- The complete signed-image Docker drill passed on product commit `8ceb540c140cd01578be4aafbbd78e5ab2b307ce`, using Node 26.10.0, pnpm 11.7.0 and Linux AMD64 Docker Compose on a separate Windows host. Ten baseline/candidate images were built in a disposable private registry, with their immutable digests included in signed manifests. The drill verified rejected signatures/keys/registries/mutable references, scheduling/cancellation, direct candidate API and worker fencing, injected Docker failure with automatic recovery, exact target version/schema, explicit manual restore, interrupted-job reconciliation and preservation of accepted writes after reopening. Forced garbage collection remained enabled. A child Docker command retained the host lock after its updater parent was killed.
- Harness commit `9b3faf9aea604c0336bc790b4b0ec229517b754f` strengthened two assertions. A bounded follow-up against the same product images rejected a copied dump beside a valid manifest specifically because its path was not canonical, and verified the exact bytes in an independent restored attachment volume. Product Docker build inputs were unchanged between these commits; this was a focused follow-up, not another full image drill.
- The final drill's recovery set was transferred to a physically separate Mac and restored into native PostgreSQL 17.11 ARM64 with pgvector 0.8.5. Verification matched all 35 migration IDs/checksums, 20 synthetic assets and their instruction/document content, the original canary, absence of candidate-only writes, and exact attachment bytes and metadata. The source backup manifest SHA-256 was `ae4731099dbd2c6244c89dd58c79617ae1ffce4aa29d58e4d9c707e94d841957`. The temporary native database was stopped afterward.
- Rendered browser checks exercised the owner Updates page, signed release/preflight display, future scheduling and cancellation before execution, recovery-point-specific data-loss consent, ordinary-admin navigation/direct-route rejection, and updater disconnect/reconnect. Browser visibility checks do not establish resistance to the impersonation paths above.
- GitHub Verify and CodeQL passed on `9b3faf9aea604c0336bc790b4b0ec229517b754f`. Later documentation-only commits do not change the product inputs above; required CI must still be checked on the PR's current head before merge.

Earlier failed attempts are retained in private evidence. One exposed the repaired Node 26 lock-file lifetime failure; another exposed a repaired fixture-helper path error before an update mutation. Neither is counted as a successful full drill.

A separate copy issue remains: the passing managed-rollback-mode preflight check currently says that the selected supported mode cannot be applied. Its result is correct, but the detail text needs correction. No production instance, public release feed or public image registry was activated by these tests.

## Supported boundary

The host updater requires Linux, Node 26, Bash, Docker Compose and util-linux `flock`, with state on a local filesystem. Application containers do not receive the Docker socket. A native Windows/macOS updater, Linux ARM64 runtime, real host power-loss survival, and production rollout are not established by Linux AMD64 process-restart tests.
