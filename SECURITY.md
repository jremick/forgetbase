# Security Policy

## Supported Versions

ForgetBase is pre-release software. Public beta builds are intended for inspection and trial use, not production workloads with sensitive data.

Security fixes target the latest published beta. Older beta tags are historical snapshots and do not receive separate backports.

## Reporting A Vulnerability

Do not open a public issue for a suspected vulnerability.

Use [Report a vulnerability](https://github.com/jremick/forgetbase/security/advisories/new) to send a private report to the maintainer. This channel is enabled when the repository is published. If GitHub cannot accept your report, open an issue asking only for a private contact method; include no vulnerability details or sensitive data.

Please include:

- affected commit, branch, or tag
- affected surface: API, CLI, MCP, web UI, worker, Docker Compose, or docs
- reproduction steps
- expected impact
- whether credentials, tenant data, or restricted content are involved

## Current Security Posture

The current beta candidate includes local users, service accounts, API keys, OIDC configuration, permission-filtered retrieval, redaction controls, retention controls, backup/restore verification, restricted leakage verification, and disabled-by-default action execution.

The following are not yet stable security promises:

- compliance certification process
- MFA or remembered-device enforcement
- SCIM lifecycle management
- hosted secret-manager adapters
- external side-effecting action adapters
- full data-loss prevention or model-based personal-data classification
