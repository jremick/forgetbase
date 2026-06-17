# Security Policy

## Supported Versions

Agentic CMS is pre-release software. Public alpha builds are intended for inspection and trial use, not production workloads with sensitive data.

Security fixes will target the latest alpha branch or tag once the first public alpha is created.

## Reporting A Vulnerability

Do not open a public issue for a suspected vulnerability.

For the public alpha, use GitHub private vulnerability reporting for this repository when it is available. Until public visibility and private reporting are enabled, report security concerns through the maintainer's private project channel.

Please include:

- affected commit, branch, or tag
- affected surface: API, CLI, MCP, web UI, worker, Docker Compose, or docs
- reproduction steps
- expected impact
- whether credentials, tenant data, or restricted content are involved

## Current Security Posture

The current alpha candidate includes local users, service accounts, API keys, OIDC configuration, permission-filtered retrieval, redaction controls, retention controls, backup/restore verification, restricted leakage verification, and disabled-by-default action execution.

The following are not yet stable security promises:

- certification-level compliance process
- MFA or remembered-device enforcement
- SCIM lifecycle management
- hosted secret-manager adapters
- external side-effecting action adapters
- full DLP or model-based PII classification
