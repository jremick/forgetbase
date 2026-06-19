# ForgetBase Private Beta Contract

Status: private beta compatibility target
Date: 2026-06-19
Contract ID: `forgetbase-private-beta-0.1`

This document defines the machine-consumer surface ForgetBase will preserve during the private beta unless a release note explicitly calls out a breaking change. It does not claim production readiness, hosted-service maturity, enterprise identity completion, full managed-agent orchestration, broad enterprise-search parity, or complete API stability.

## Scope

The private beta contract is intentionally narrow. It covers the self-hosted first-run path and the agent-consumer distribution path:

- bootstrap a local admin for a single tenant
- validate and import the synthetic demo corpus
- fetch a governed asset by stable ID
- search approved/visible assets with citations
- generate permission-filtered JSON agent packages
- generate OKF `0.1` export projections from the same canonical assets
- exercise the same fetch/search/export path through SDK, CLI, and MCP consumer surfaces

All examples and committed fixtures must remain synthetic.

## Compatibility Policy

Allowed during private beta:

- additive response fields
- additive enum values when existing values keep working
- additive CLI flags with existing defaults preserved
- additive MCP tools or optional tool arguments
- additive OpenAPI paths outside the frozen surface
- clearer error messages when status code and error code remain compatible

Requires a release note and beta-recipient notice:

- removing or renaming a frozen route, SDK method, CLI command, MCP tool, required field, or OKF file path
- changing a frozen field type
- changing default visibility, permission, export, or leakage behavior
- changing the meaning of `deniedCount`, `assetCount`, `sourcePackageHash`, `projectionHash`, or `rootIndexPath`

## Frozen REST Surface

| Method | Path | Purpose | Contract expectation |
|---|---|---|---|
| `GET` | `/health` | Local readiness check. | Returns JSON with service health. |
| `POST` | `/auth/bootstrap` | First local admin and first API key. | Creates the first admin only when the tenant has no users; returns the one-time API key secret once. |
| `POST` | `/validation/assets` | Validate synthetic corpus before import. | Returns validation report counts and issues. |
| `POST` | `/assets` | Import/create governed assets. | Accepts schema-valid synthetic assets and returns asset detail. |
| `GET` | `/assets/{stableId}` | Fetch one visible governed asset. | Honors permission and surface visibility rules. |
| `GET` | `/search` | Search visible governed assets. | Supports `query`, `limit`, and `strategy`; returns results with assets, ranking, and citations. |
| `GET` | `/exports/ai-package` | Generate JSON or OKF package. | Supports `package`, `format=json|okf`, `okfVersion=0.1`, and `limit`; filters restricted assets and reports denied counts. |
| `GET` | `/openapi.json` | Route inventory reference. | Includes the frozen paths above. |

Routes outside this table are preview surfaces for private beta unless another release note explicitly moves them into the frozen set.

## Frozen JSON Export Shape

The JSON export returned by `GET /exports/ai-package?package=demo-agent-pack&format=json` is frozen for these fields:

- `packageName`
- `generatedAt`
- `tenantId`
- `assetCount`
- `deniedCount`
- `assets[].stableId`
- `assets[].assetId`
- `assets[].type`
- `assets[].title`
- `assets[].summary`
- `assets[].audience`
- `assets[].status`
- `assets[].sensitivity`
- `assets[].lifecycleState`
- `assets[].sourceVersion.versionNumber`
- `assets[].sourceVersion.contentHash`
- `assets[].allowedSurfaces`
- `assets[].allowedExports`
- `assets[].instructions[]`
- `assets[].humanDocuments[]`
- `assets[].citations[]`

Restricted content that is not visible to the caller must not appear in exported asset bodies, citations, stable IDs, or OKF files. Denied items may be counted.

## Frozen OKF `0.1` Projection Shape

OKF is a generated export projection, not the internal source of truth.

The OKF export returned by `GET /exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1` is frozen for these fields:

- `format: "okf"`
- `okfVersion: "0.1"`
- `spec.name`
- `spec.version`
- `spec.status`
- `packageName`
- `generatedAt`
- `tenantId`
- `assetCount`
- `deniedCount`
- `sourcePackageHash`
- `projectionHash`
- `rootIndexPath: "index.md"`
- `files[].path`
- `files[].content`

Required OKF file paths:

- `index.md`
- `manifest.md`
- `log.md`
- one generated file per included asset under a type-specific folder such as `policies/`

The generated asset file content must include the source stable ID, source version number, allowed surfaces, allowed exports, citations, and approved instruction/document content visible to the caller.

## Frozen SDK Surface

The private beta SDK compatibility target covers:

- `new AgenticCmsClient({ baseUrl, apiKey, surface, fetchImpl })`
- `client.health()`
- `client.search({ query, limit, strategy })`
- `client.exportAiPackage(packageName, { format: "json" })`
- `client.exportAiPackage(packageName, { format: "okf", okfVersion: "0.1" })`

Other SDK methods remain preview unless listed here in a later contract update.

## Frozen CLI Surface

The private beta CLI compatibility target covers:

- `agentic-cms health --api-url ...`
- `agentic-cms auth bootstrap --email ... --display-name ... --tenant-id ... --password ... --api-url ...`
- `agentic-cms validate --file corpus/demo/assets.json --as-of ... --fail-on-warnings`
- `agentic-cms corpus import --file corpus/demo/assets.json --api-url ... --api-key ...`
- `agentic-cms assets get <stable-id> --api-url ... --api-key ...`
- `agentic-cms search --query ... --limit ... --strategy lexical|vector|hybrid --api-url ... --api-key ...`
- `agentic-cms exports ai-package --package demo-agent-pack --format json --api-url ... --api-key ...`
- `agentic-cms exports ai-package --package demo-agent-pack --format okf --okf-version 0.1 --api-url ... --api-key ...`

Other CLI commands remain preview unless listed here in a later contract update.

## Frozen MCP Surface

The private beta MCP compatibility target covers consumer-path tools:

- `list_asset_types`
- `get_asset`
- `search_assets`
- `generate_ai_export`
- `validate_context_access`

The frozen MCP behavior is limited to forwarding fetch/search/export/access-check calls to the API with `x-agentic-cms-surface: mcp`, preserving bearer authentication, and returning JSON text content suitable for machine clients.

## Error Envelope

Frozen REST failures return JSON with at least:

```json
{ "error": "machine_readable_code" }
```

Private beta clients should rely on HTTP status code plus the `error` field. Additional diagnostic fields may be added. CLI and MCP may display or return the same API error text, but only REST status code and JSON `error` values are frozen in this contract.

Representative frozen error expectations:

- `401` with `authentication_required` for protected routes without credentials when auth is required
- `403` with `access_denied` or `forbidden` for unauthorized visible-surface attempts
- `404` with `not_found` for missing or hidden assets
- `409` with `bootstrap_already_completed` when bootstrap is repeated for a tenant

## Preview Surfaces

The following are useful and may be exercised in private beta, but are not frozen by this contract:

- provider-routed managed query behavior and real-provider integrations
- hosted-service tenant provisioning
- advanced OIDC and external identity lifecycle behavior
- long-tail admin/provider/cache/telemetry/action policy routes
- action execution beyond disabled-by-default internal dry-run/request lifecycle
- broad MCP administrative tooling
- generated OpenAPI schema completeness beyond route inventory and beta-critical fixture tests

## Verification Gates

Before shipping a private beta build, run:

```bash
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 security:check-deployment-defaults
AGENTIC_CMS_PUBLIC_DEPLOYMENT=true AGENTIC_CMS_REQUIRE_AUTHENTICATION=true AGENTIC_CMS_SESSION_COOKIE_SECURE=true AGENTIC_CMS_PUBLIC_ENTRYPOINT=railway-proxy AGENTIC_CMS_CORS_ALLOWED_ORIGINS=https://cms.example.com npx -y pnpm@11.7.0 security:check-deployment-defaults
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
```

Run `npx -y pnpm@11.7.0 auth:verify-oidc-login` when OIDC is included in the private beta walkthrough or release note. Real-provider smoke remains secret-gated and must not be used as a public claim unless freshly recorded.
