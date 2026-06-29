# Public Beta Compatibility

Status: public beta target
Date: 2026-06-29

This document defines what public beta users can reasonably expect from ForgetBase. It is not a stable compatibility promise.

## Supported Trial Path

The public beta supports a self-hosted trial using:

- macOS or Linux development host
- Node.js 22
- pnpm 11.7.0
- Docker Compose v2
- Postgres 17 with `pgvector`
- Chromium-based browser for the web UI and UAT proof
- the synthetic demo corpus in `corpus/demo/assets.json`

The intended first-run path is Docker Compose plus the same-origin proxy at `http://127.0.0.1:8080/`.

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
- support for private/customer corpus imports

## Data And Migration Expectations

Public beta data should be treated as trial data.

- Back up Postgres before pulling new code or changing deployment shape.
- Run migrations through the documented Docker Compose or `db:migrate` path.
- Run `db:verify-backup-restore` before relying on a beta deployment.
- Do not assume beta database schema compatibility across unreleased commits.
- Do not import private, customer, employee, or regulated data into beta trials.

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

Use GitHub private vulnerability reporting for suspected vulnerabilities once it is enabled. Until then, use the maintainer's private project channel.

## Release Proof

A public beta release is not complete until the release proof manifest passes:

```bash
npx -y pnpm@11.7.0 release-proof:check work/public-beta-proof/public-beta-release-proof.json
```

That proof must include CI, browser screenshots, authenticated reader/admin UAT, restricted leakage, backup/restore, live demo, and GitHub security/settings read-backs.
