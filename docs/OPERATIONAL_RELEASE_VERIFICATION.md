# Operational release verification

Date: 2026-09-05
Release line: private `0.1.0-beta.3` candidate
Source baseline: `d002642ea84b4697f8f097e55f71254fc458375d`

The immutable source SHA, final CI links, deployment IDs and hosted readback belong
to the release's `release-manifest.json` and `release-verification.json` assets.
This document records the implementation checks and acceptance procedure without
claiming a future deployment passed. Follow [the release plan](OPERATIONAL_RELEASE_PLAN.md)
and [the Railway runbook](runbooks/REPRODUCIBLE_RAILWAY_RELEASE.md).

## Implementation evidence

| Check | Observed result |
| --- | --- |
| Supported toolchain | Node 22.23.2, pnpm 11.7.0, frozen lockfile |
| Build and typecheck | All workspace packages pass |
| Full tests | 414 tests pass across 38 files, including dedicated PostgreSQL integration |
| Machine-consumer contracts | 58 API/SDK/CLI/MCP contract tests pass; 90 documented routes match 92 server routes with two declared metadata exceptions |
| Dependency audit | No known production dependency vulnerabilities at verification time |
| Deployment defaults | 41 checks pass for the authenticated HTTPS Railway proxy configuration |
| Browser source and claims gates | Pass |
| Bundle limits | Reader 622.27 kB raw / 178.85 kB gzip; initial admin increment 241.26 / 60.10; all JavaScript 874.17 / 242.07; existing limits retained |
| Synthetic corpus | 20 assets, no validation errors or warnings at the documented fixed as-of date |
| Source artifacts | Tests reproduce source archive and manifest bytes for the same commit; dirty checkout and invalid build-identity inputs are rejected |
| Isolated full-stack proof | Fresh Compose stack passes clean attachment lifecycle, EICAR rejection, restricted leakage checks, coordinated database/blob restoration, 143 admin browser checks and 85 reader checks; desktop/mobile screenshots inspected; isolated stack removed |

The tests specifically cover target/scope/surface authorization, atomic creator
grants, individual grant revocation, private drafts and history, publication
retention, attachment mutation fencing, stale-edit conflicts, more than 200
assets, denied leading search results, complete/paged exports, changes between
export pages, provider/index failures after commit, leased outbox work, recovery,
and publication or permission changes while retrieval is in flight.

The governed workflow test uses a real ephemeral HTTP API, CLI commands, SDK
requests and an MCP client. Instruction and human-document citations must identify
the same published version. Provider-routed test cases use synthetic adapters;
these results do not demonstrate paid model quality or external identity-provider
compatibility.

## Existing Railway data compatibility

A custom-format backup of the existing deployment was restored into an isolated
PostgreSQL target. Applying `033_attachments`, `038_published_versions` and
`039_asset_change_outbox` preserved every existing row and column value across all
32 original tables. The migrated data retained 20 editing heads and 19 published
assets. The remaining head was not inferred to be approved.

The restored runtime then demonstrated:

- all 20 queued changes converged using the local embedding implementation;
- anonymous reads were denied;
- ordinary and preview inventories matched the published and editing counts;
- a reader was denied, granted access, and denied again after revocation using
  the same client key;
- no index chunk cited a superseded publication;
- API readiness reported a healthy index after convergence.

Only the isolated restoration received test identities and grants. The backup,
raw data and credentials stay in the private operator directory. The final
stopped-writer database/blob recovery point and hosted browser checks are separate
release gates, recorded in the final verification asset.

## Supported boundaries

This release supports a single API replica and filesystem attachment storage.
Attachments are asset-level resources: publish the current version before adding
or deleting them. Structured instructions are authored with the CLI/SDK JSON
workflow; the browser editor authors Markdown pages.

Clients should supply `expectedVersionId` for every edit, review, publish and
restore. The browser does so. Older clients omitting this optional field retain
compatibility but do not receive stale-edit protection.

Search `deniedCount` counts retrieved candidates rejected by the final visibility
check. Ineligible assets excluded before ranking do not become candidates or
reveal restricted-corpus hit counts. Exports report `complete` and `nextCursor`;
a content revision change requires restarting the whole paged export. Grants are
checked on every request.

Managed-upgrade, local-agent and import-planner worktrees remain separate
candidates. This release does not activate them or claim full orchestration,
hosted multi-tenancy, enterprise identity, or external model evaluation.

## Release completion record

The final private release must attach evidence of green CI, isolated full-stack
proof, matching API/web/worker source identity, authenticated desktop/mobile UAT,
denied protected routes, scanner and storage checks, queue health, preserved live
data and a matched recovery set. The previous July image cannot safely serve new
drafts after writers reopen; use the rollback boundary in the Railway runbook.
