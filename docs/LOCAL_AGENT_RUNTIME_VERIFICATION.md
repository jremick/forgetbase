# Local Agent Runtime Verification

Date: 2026-09-28

This is verification of the private-pilot feature source. It does not authorize deployment, internal-content activation, installation on participant devices, or package publication. All proof content is synthetic. The supported native proof target is macOS arm64 with Node.js 26.10.0 and pnpm 11.7.0. Linux Secret Service and Windows runtime support are not established by this evidence.

## Repeatable checks

Use a disposable PostgreSQL 17 server with pgvector. `TEST_DATABASE_URL` must permit creating and dropping test databases. The HTTP end-to-end suite creates its own isolated database and removes it afterward.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm exec vitest run scripts/local-runtime.e2e.test.ts
pnpm test
pnpm contracts:check
pnpm web:bundle-budget
pnpm public-beta:check
pnpm openapi:check
pnpm claims:lint
pnpm security:check-deployment-defaults
pnpm --filter @forgetbase/cli bundle
```

Run the native proof from a terminal on macOS, after building the web app and CLI bundle:

```sh
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  LOCAL_RUNTIME_PROOF_OUTPUT=/tmp/forgetbase-native-proof.json \
  pnpm exec tsx scripts/prove-local-runtime-native.ts
```

Open the printed loopback origin in the browser. Sign in with the synthetic fixture identity and password defined in the script; do not save the password. Press Enter in the terminal after login. The bundled CLI opens the browser approval page. Confirm the displayed synthetic device and loopback destination, then approve it. The script verifies Keychain persistence, full/unchanged sync, separate-process SQLite reads, all four MCP tools, and 1,000 offline MCP queries. It deletes its synthetic database, profile, and Keychain item and writes a JSON result. Close the test browser tabs afterward. `LOCAL_RUNTIME_PROOF_PORT` can select another unused local port.

## Recorded source and native results

- Local suite without a database: 572 passed, 76 database-dependent checks skipped.
- Real PostgreSQL repository plus HTTP runtime suite: 83 passed, zero skipped. The runtime scenario enrolls a reader, traverses 106 authorized records over multiple signed pages, excludes draft-only and restricted assets, rotates credentials, rejects replay and general API access, preserves published content during draft edits, applies publication and removal deltas, and rejects revoked devices. Separate cases verify oversized-record 413, snapshot currentness, and browser/device refresh separation.
- macOS arm64, Node v26.10.0, native Keychain, actual standalone bundle and MCP stdio: passed. Browser approval and the consumed loopback callback were observed in Comet. The request token was removed from the displayed approval URL.
- Offline MCP: 1,000 queries, each returning the exact allowed stable ID. Median 25.5 ms, p95 57.9 ms, maximum 194.0 ms. This small synthetic corpus proves the native transport and offline path; it is not a production-scale ranking benchmark.
- Native cleanup: the task Keychain item was absent after local-only disconnect. Server-side revocation is verified separately by the PostgreSQL HTTP suite.

An initial full suite over the LAN database tunnel hit existing five-second and sixty-second test timeouts. A recovered session-expiry test also assumed the runner and database clocks matched; it now makes expiry deterministic against the database clock. The targeted PostgreSQL rerun uses a 60-second default timeout and passed. The CI Verify job remains the full-suite gate with a co-located database and includes browser UAT. Use the feature PR's current-head check results for that gate.

## Security regression evidence

Failing controls were recorded before repairs for these material paths:

| Failure | Required behavior |
|---|---|
| Usage-only database updates invalidate their own snapshot | Ignore only usage-only changes; retain serialization of content and authorization mutations |
| Oversized authorized record returns 500 | Return a bounded 413 refusal without issuing a lease |
| Draft title/body replaces the published version | Synchronize the immutable published version intersected with current restrictions |
| Browser refresh accepts a local-device refresh token | Reject without consuming or extending the device credential |
| In-memory role/grant changes escape snapshot currentness | Reject stale issuance |
| Guidance combines records across a permission contraction | Reject the whole aggregate |
| Failed activation advances Keychain counters and prevents recovery | Block old reads; permit a verified full rebuild at or above the saved counters |
| Automatic stale-lock reclamation admits competing writers | Refuse an existing lock until the operator stops all profile writers |
| Initial offline failure needlessly invalidates a valid lease | Preserve only an already-valid lease before any refresh response |
| HTTP 200 refresh body failure looks like an offline connection | Keep the profile blocked because rotation is uncertain |
| Read begins before expiry and finishes after asynchronous checks | Check the current clock again before returning search, source, or guidance |

Independent reviews covered the server/database and local-consumer boundaries. They found the above issues; repairs and regression controls are in the feature. These reviews do not establish live device posture, signer custody, backup protection, or an internal-content go decision. Those remain in the [private-pilot runbook](runbooks/LOCAL_AGENT_RUNTIME_PRIVATE_PILOT.md).
