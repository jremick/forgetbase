# Public Beta Compatibility

Status: public beta target
Date: 2026-09-30

This document defines what public beta users can reasonably expect from ForgetBase. It is not a stable compatibility promise.

## Supported Trial Path

The public beta supports a self-hosted trial using:

- macOS or Linux development host
- Node.js 26.10.0 for beta.7 onward and current `main`; historical beta.5 uses Node.js 22
- pnpm 11.7.0
- Docker Compose v2
- Postgres 17 with `pgvector`
- Chromium-based browser for the web UI and UAT proof

The intended first-run path is Docker Compose plus the same-origin proxy at `http://127.0.0.1:8080/`, with the synthetic demo corpus in `corpus/demo/assets.json`. Self-hosted trials may also use an organization's own or authorized customer content through the [governed authoring and import workflow](governed-workflow.md). The demo corpus is a first-run fixture, not a restriction on trial content.

## Product Surfaces

Expected to work for beta trials:

- reader UI for browsing and reading published pages
- admin console for content, reviews, access, exports, settings, and system health
- local password login and configured OIDC login
- permission-aware search and cited answers
- REST/OpenAPI, CLI, MCP server, and worker basics
- JSON and OKF export package generation
- restricted-content leakage verifier
- backup and restore verifier

Operational limits:

- One API replica with filesystem attachment storage.
- Requests share a bounded per-process socket-IP limit. Reverse-proxy users share
  the proxy's bucket; see [configuration and retry behavior](DEVELOPMENT.md#request-limits-and-browser-credentials).
- Local split-origin browser credentials last until page reload. Same-origin
  installations use HttpOnly session cookies; legacy stored bearer keys are cleared.
- Publish the current page version before adding or deleting attachments.
- Browser authoring edits Markdown; structured instructions use CLI or SDK JSON.
- Clients must send `expectedVersionId` to receive stale-edit protection. The browser does so.
- [Import planning](IMPORT_PLANNING.md) is report-only through API, SDK, CLI and MCP; it does not execute an import.
- The [local-agent runtime](LOCAL_AGENT_RUNTIME_VERIFICATION.md) is a private pilot. Native credential integration is verified on macOS arm64. Internal-content activation remains disabled by default; restricted and more sensitive content remain outside the pilot.
- [Managed updates](VERSIONING_AND_UPGRADES.md) require separate host CLI approval, with verification limited to isolated synthetic Linux AMD64 trials on newly initialized managed installations. Hosted deployments do not activate a privileged updater. A signed update feed and managed image bundle are separate from this source release.
- External identity providers and paid model quality have not been verified by the operational release evidence.

Still volatile:

- API routes and response shapes outside focused beta contract tests
- CLI flags and long-tail commands
- MCP tool names and long-tail tool contracts
- web UI layout and admin workflow details
- provider-routed generation behavior and fallback policy
- eval, telemetry, cache, retention, and action-request workflows
- Docker Compose deployment shape and public ingress templates

Not included in public beta:

- production support or service-level guarantees
- hosted service provisioning
- npm package publishing
- stable API compatibility
- SCIM, MFA enforcement, or remembered-device trust policy
- compliance certification

## Data And Migration Expectations

Self-hosted beta trials can include internal work and private/customer corpora that the operator is authorized to use. Operators remain responsible for deciding whether the deployment and configured services meet their organization's data handling requirements. Beta use does not establish compliance certification, guaranteed data safety, or production support.

- Configure authentication, asset sensitivity, grants, allowed surfaces, and exports for the intended users. Follow the [deployment runbook](runbooks/DEPLOY_DOCKER_COMPOSE.md) and [security model](SECURITY_MODEL.md); replace sample credentials before using work content.
- Review configured model providers, local caches, telemetry, retention, and backups for the content being used. The local-agent pilot and managed-update limits above still apply.
- Keep public demos, committed examples, automated test fixtures, and published release evidence synthetic. Keep private content out of the public repository, issues, and proof bundles.
- Back up Postgres before pulling new code or changing deployment shape.
- Back up attachment files with the database as a coordinated set; follow the [backup and restore runbook](runbooks/BACKUP_RESTORE.md).
- Run migrations through the documented Docker Compose or `db:migrate` path.
- Run `db:verify-backup-restore` before relying on a beta deployment.
- Do not assume beta database schema compatibility across unreleased commits.

The current corpus import creates missing assets and skips existing visible assets; it does not update, merge, delete, or roll back a partial import. Import planning is report-only. See the [governed workflow](governed-workflow.md#import-a-small-corpus) before importing work content.

## Support Boundaries

Use GitHub issues for:

- reproducible bugs
- focused feature requests
- documentation gaps
- demo corpus improvements with synthetic content only

Do not use GitHub issues for:

- suspected vulnerabilities
- private support requests
- private/customer corpus debugging
- production incident support
- secrets, raw logs with tokens, database dumps, or confidential content

Use [Report a vulnerability](https://github.com/jremick/forgetbase/security/advisories/new) for suspected vulnerabilities. See [the security policy](../SECURITY.md) for the reporting process and fallback.

## Release Proof

A public beta release is not complete until the release proof manifest passes:

```bash
npx -y pnpm@11.7.0 release-proof:check work/public-beta-proof/public-beta-release-proof.json
```

That proof must include CI, browser screenshots, authenticated reader/admin UAT, restricted leakage, backup/restore, live demo, and GitHub security/settings read-backs.
