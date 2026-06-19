# Restricted Leakage Investigation Runbook

Use this runbook when restricted, confidential, or secret content may have appeared in an unauthorized API, CLI, MCP, search, managed-query, export, or web response.

## Immediate Containment

1. Preserve evidence before changing data when possible.
2. Revoke or rotate any API key suspected of unauthorized access:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-revoke --api-key-id <api-key-id>
```

3. If a content asset is suspected, remove broad exposure by updating sensitivity, status, lifecycle state, allowed surfaces, allowed exports, or grants. Use the web UI or an authenticated asset update payload.
4. Stop export consumers or agent harnesses that may cache the leaked package/context.
5. If the issue may be deployment-wide, stop API and worker writes while preserving Postgres:

```bash
docker compose stop api worker
```

## Evidence Collection

Collect the smallest evidence set that answers what leaked, to whom, through which surface, and whether it is still reproducible.

List recent audit events:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- audit events --limit 100
```

Review retrieval and managed-query activity:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- telemetry summary
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- agent feedback-list
```

Generate the affected export package with the suspected caller role or key, then inspect whether the asset appears:

```bash
FORGETBASE_API_KEY="$SUSPECTED_CALLER_KEY" npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- exports ai-package --package <package-name>
```

Run the restricted leakage verifier against the current API:

```bash
npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

Use a non-default API URL when investigating another deployment:

```bash
FORGETBASE_API_URL=https://cms.example.com npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

The verifier creates a throwaway tenant, creates a restricted fixture asset, proves admin search can find it, and proves anonymous search, ungranted reader search, and broad reader export do not receive it. It prints fixture IDs and counts only; it does not print generated secrets.

## Root Cause Checks

Check these categories before closing the incident:

- Asset metadata: sensitivity, lifecycle state, approval status, allowed surfaces, and allowed export package names.
- Grants: direct user grants, group grants, service-account grants, and stale group memberships.
- API key state: owner, scopes, revoked status, expiry, and whether a key belongs to a service account used by an agent.
- Export package: package name, allowed exports, denied count, and any downstream cached copy.
- Retrieval index: whether the current asset version was reindexed after publish, restore, or update.
- Telemetry and feedback: redacted query text, denied counts, accepted/rejected outcomes, and suspicious spikes.
- Deployment drift: the running API image/revision, migrations applied, and whether web/worker/API versions match.

## Recovery

1. Fix the root cause.
2. Rebuild and restart services if code or image drift was involved:

```bash
docker compose build migrate api worker web
docker compose up -d migrate api worker web
```

3. Reindex if asset content, publish state, or restore state changed:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --once
```

4. Rotate affected keys if access boundaries were uncertain.
5. Re-run the verifier and affected user search/export paths.

## Closure Criteria

- The suspected unauthorized caller can no longer retrieve the asset through API, CLI, MCP, web, managed-query, or export.
- `security:verify-restricted-leakage` passes against the deployment.
- Audit evidence shows containment actions such as key revocation, permission changes, asset update/publish/restore, or export regeneration.
- Any downstream cached export package or agent context has been invalidated.
- A follow-up issue exists for any missing product control discovered during the investigation.
