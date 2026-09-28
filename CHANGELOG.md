# Changelog

Published tags are immutable. Beta releases support self-hosted trials with synthetic data; they do not promise stable APIs or production support.

## 0.1.0-beta.8 - 2026-09-28

- Add admin controls for logo text and PNG, JPEG or WebP images, shared by login, reader and admin screens. Saves are tenant-scoped and audited; admins can restore the defaults.
- Add report-only governed import planning through API, SDK, CLI and MCP, preserving the governed-v1 content hash contract. Reviewing assets remain eligible for planning.
- Include the private-pilot local agent runtime with browser device approval, OS credential storage, signed content sync, leased SQLite retrieval and read-only local MCP tools. Internal-content activation remains disabled by default.
- Include the managed Compose update and recovery trial workflow. Each update or restore requires a separate, exact, one-use host CLI approval; hosted deployments do not activate a privileged updater.
- Update the pinned pnpm setup Action to 6.1.0.

Upgrade applies migrations 040–043 for local sync and 044 for branding. Migration checksums are now recorded and checked. Back up the database and attachment files together before upgrading. Local-runtime platform limits and managed-update trial limits remain in their verification records; this release does not publish a signed update feed or a managed image bundle.

## 0.1.0-beta.7 - 2026-09-28

- Move current development, CI and container builds to Node.js 26.10.0, update Nginx to 1.31.0, and refresh the pinned checkout, setup-node and pnpm Actions.

- Add a searchable, sortable content library and source-preserving rich Markdown editing with a separate Source mode for unsupported syntax.
- Use the shared Markdown renderer for reader pages, content details, and authoring previews.
- Restore canonical navigation URLs and exercise the governed Versions tab in release browser checks.
- Preserve excessive Markdown nesting as escaped source and prevent successful saves from reopening the unsaved-changes dialog.
- Verify rich-editor lifecycle behavior and exact draft and published content in the isolated browser proof.
- Update Vitest to 4.1.11 and the MCP SDK's Hono dependency to 4.13.5 to address the reported dependency advisories.

No database migrations change from beta.5. Beta.6 identified an intermediate deployment and was not published as a GitHub release; beta.7 is the next public release. Local-agent runtime, managed upgrades and import planning remain outside this release.

## 0.1.0-beta.5 - 2026-09-05

- Reject redirects on credential-bearing SDK, model, embedding, OIDC and worker requests.
- Validate the configured OIDC issuer, endpoint transport, required token claims and response size.
- Exclude query strings, credentials and exception details from API responses and proxy logs.
- Reject unsafe requests from disallowed browser origins before session mutation.
- Inspect Office ZIP metadata with bounded decompression and reject concealed macros or malformed archives.
- Reject binary request bodies outside the attachment-upload route before parsing or authentication.
- Patch the Node image OpenSSL packages, use the smaller Nginx image without the flagged optional-module libraries, and refresh the PostgreSQL 17 image.
- Configure isolated browser tests with their selected origin ports.

Provider and API URLs must identify their final endpoint. OIDC requires the exact issuer and HTTPS outside loopback development. Office uploads reject encrypted, ZIP64 and unsupported archives. No database migration or JavaScript dependency change is required. Container OS packages change; see the [container security record](docs/CONTAINER_SECURITY_2026-09-05.md) for remaining vendor advisories. See the [security review](docs/SECURITY_REVIEW_2026-09-05.md) for findings, regression evidence and limits.

## 0.1.0-beta.4 - 2026-09-05

- Update installation, compatibility, support and security-reporting instructions for public trials.
- Require the intended source commit's latest CI result during release checks and collection.
- Verify the actual `main` protection and GitHub security settings before declaring public readiness.
- Complete disclosure review and public promotion as separate gates from the operational release.
- Limit requests before authentication and parsing, keep browser bearer credentials in tab memory, and harden Markdown exports.

The [published release](https://github.com/jremick/forgetbase/releases/tag/v0.1.0-beta.4) includes CI, hosted browser, source identity and recovery evidence.

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
