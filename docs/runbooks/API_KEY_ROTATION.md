# API Key Rotation Runbook

## Purpose

Rotate scoped API keys without exposing raw secret values through list, audit, or telemetry surfaces.

Use staged rotation for normal operations. Use immediate revocation only when the old key is suspected to be compromised or the caller can safely redeploy consumers at the same time.

## Prerequisites

- Docker Compose API is running, or another API deployment is reachable.
- You have an admin API key for the tenant.
- You know the API key ID to rotate. Use `auth api-key-list` to find it.

## Find Keys Due For Rotation

List service-account keys that are expired, close to expiry, or missing expiry metadata:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-rotation-due --due-within-days 30
```

The report returns key IDs, owner type, secret preview, expiry status, and reason. It does not return raw secrets. By default it focuses on service-account keys because those are used by unattended integrations and agent harnesses; add `--include-user-keys true` for a broader audit.

For scheduled operations, preview the worker reminder counts before creating audit evidence:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --api-key-rotation-reminders-once --due-within-days 30 --dedupe-window-hours 24
```

After reviewing counts, execute reminders to write one audit event per tenant with due service-account keys:

```bash
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --api-key-rotation-reminders-once --due-within-days 30 --dedupe-window-hours 24 --execute
```

Reminder audit metadata includes key IDs, owner type, rotation state, reason, days until expiry, and a key-state fingerprint used for duplicate detection. It does not include raw secrets or secret previews. The default 24-hour dedupe window skips matching tenant/key-state evidence already recorded inside the window; use `--dedupe-window-hours 0` only when duplicate reminder evidence is intentional.

To deliver external reminders, configure a webhook URL after the dry-run count looks right:

```bash
export FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_URL="https://ops.example.test/forgetbase/key-rotation"
export FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET="<high-entropy-shared-secret>"
DATABASE_URL=postgres://forgetbase:forgetbase_dev@127.0.0.1:5432/forgetbase npx -y pnpm@11.7.0 --filter @forgetbase/worker start -- --api-key-rotation-reminders-once --due-within-days 30 --dedupe-window-hours 24 --execute
```

Dry-run reminders never call the webhook. Executed reminders call it once per tenant report after audit evidence is written, unless duplicate evidence is skipped by the dedupe window. Webhook payloads include tenant ID, reminder counts, key IDs, key names, owner IDs, scopes, expiry metadata, rotation state, reason, and days until expiry. They do not include raw secrets or secret previews. When `FORGETBASE_API_KEY_ROTATION_REMINDERS_WEBHOOK_SIGNING_SECRET` is set, requests include `x-forgetbase-signature: sha256=<hex>` over the exact JSON body and `x-forgetbase-delivery-id` for receiver-side dedupe.

## Staged Rotation

Create a replacement key from the old key. The replacement inherits the old key's user, scopes, and expiry.

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-rotate --api-key-id <old-api-key-id> --name <replacement-name>
```

The command returns the replacement secret once. Store it in the consuming system's secret store, not in repo files, shell startup files, logs, tickets, or chat.

Verify the replacement key before revoking the old key:

```bash
FORGETBASE_API_KEY="$REPLACEMENT_FORGETBASE_API_KEY" npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth me
```

Update consumers to use the replacement key. After the deployment is confirmed healthy, revoke the old key:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-revoke --api-key-id <old-api-key-id>
```

Confirm the old key no longer authenticates:

```bash
FORGETBASE_API_KEY="$OLD_FORGETBASE_API_KEY" npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth me
```

The final command should fail with `401`.

## Immediate Rotation And Revocation

Use this only when the old key should be disabled in the same operation:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- auth api-key-rotate --api-key-id <old-api-key-id> --name <replacement-name> --revoke-old
```

This creates a replacement key and revokes the old key before the response is returned.

## Audit Evidence

Rotation records `auth.api_key.rotate`.

Manual revocation records `auth.api_key.revoke`.

Worker reminder execution records `auth.api_key.rotation_reminder`.

Audit metadata includes key IDs, user ID, secret previews, and whether the old key was revoked. It does not include raw secret values.

## Failure Handling

- `401`: the admin key is missing, invalid, expired, or revoked.
- `403`: the caller is authenticated but is not an admin.
- `404`: the target API key ID does not exist in the caller's tenant or is already revoked.

If replacement deployment fails during staged rotation, keep the old key active until consumers are restored. Revoke the replacement key if it was exposed or is no longer needed.
