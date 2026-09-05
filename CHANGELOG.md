# Changelog

Published tags are immutable. Beta releases support self-hosted trials with synthetic data; they do not promise stable APIs or production support.

## Unreleased - 0.1.0-beta.4 public candidate

- Update installation, compatibility, support and security-reporting instructions for public trials.
- Require the intended source commit's latest CI result during release checks and collection.
- Verify the actual `main` protection and GitHub security settings before declaring public readiness.
- Complete disclosure review and public promotion as separate gates from the operational release.

## 0.1.0-beta.3 - 2026-09-05

- Separate private drafts from immutable published versions across reader, API, CLI, SDK and MCP paths.
- Enforce lifecycle and grant authorization, individual revocation, and optional stale-edit conflict checks.
- Return complete permission-aware collections, search results and paged exports.
- Persist content and indexing work together, with recoverable worker processing and readiness reporting.
- Add governed attachments, persistent scanned storage and bounded operational analytics.
- Produce reproducible source archives, embedded release identity, checksums and deployment/recovery evidence.

This was a private operational release. Its [release assets](https://github.com/jremick/forgetbase/releases/tag/v0.1.0-beta.3) record 414 tests, 58 machine-consumer contract checks, 228 authenticated browser checks, and verified recovery. One API replica and filesystem attachments remain the supported deployment boundary.

## 0.1.0-beta.2 - 2026-09-01

### Added

- Browser-based Markdown page creation and editing with hierarchy, ownership, review dates, audience, sensitivity, validation, and the existing draft-review-publish lifecycle.
- Reader search results grouped by page so the strongest matching excerpt is shown once, with the total matching-chunk count retained as context.
- Knowledge-base registry with stable page IDs, publishing state, separate AI instructions, and human-readable documents.
- Local users, service accounts, groups, scoped API keys, password login, OIDC configuration, and permission-filtered reads.
- REST/OpenAPI, CLI, MCP, worker, and operational web UI surfaces.
- Postgres-backed retrieval chunks, permission-aware search, citations, managed query, provider-routed generation, deterministic fallback, and eval scaffolding.
- Synthetic demo corpus, validation gates, restricted leakage verifier, backup/restore verifier, and Docker Compose runbooks.
- Redaction, retention, cache, audit, provider, action execution, and session hardening foundations.

### Changed

- Removed an invalid root Docker Dependabot update target while retaining updates for the actual Railway Dockerfiles under `infra/docker`.
- Fixed the Railway same-origin proxy template to target the API service on Railway's injected runtime port, with a configurable `FORGETBASE_API_UPSTREAM_PORT` default of `8080`.

### Release Boundary

- Published as a private prerelease after controlled live UAT.
- This historical snapshot does not carry the later beta.3 publication and attachment guarantees.

### Not Yet Included

- npm package publishing workflow.
- Full quality-based orchestration.
- External side-effecting action adapters.
- Hosted service packaging.
- SCIM, MFA enforcement, remembered-device trust policy, and compliance certification process.

## 0.1.0-beta.1 - 2026-06-19

Private beta readiness snapshot at tag `v0.1.0-beta.1`. It was not a public beta release and must not be reused for the next candidate.
