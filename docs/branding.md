# Admin branding

## Approved scope and failure checks

Admins can change the logo text and image in Settings. The saved branding appears
on the login, reader, and admin headers and in the browser tab. Save persists both fields together;
Cancel restores the last saved values; Restore defaults stages the ForgetBase
defaults until Save is pressed. Theme colours do not change.

Before implementation, these are the material failure paths to verify:

- A reader, maintainer, anonymous caller, or browser request without CSRF protection changes branding.
- An admin changes another tenant's branding by supplying a tenant ID.
- An image has an unsupported type, disguised content, invalid dimensions, malformed container, or exceeds the size limit.
- A failed save clears valid settings, or an audit failure leaves an unaudited change.
- A reload or API restart loses the saved settings.
- The login screen needs authentication to retrieve branding, or exposes admin metadata.
- A late request replaces a new tenant's branding with an old tenant's result.
- Preview edits change live headers before Save, Cancel retains edits, or Reset removes values before Save.
- A wide logo is stretched, long text overflows, or a broken image leaves an unusable header.
- The tab title or favicon stays stale after save, reload, image replacement, tenant change or restore defaults.
- A draft changes the tab before Save, the favicon has the wrong media type, or a custom title is interpreted as markup.

The primary automated check is `scripts/verify-branding.ts`: real HTTP requests
against the API and a disposable PostgreSQL database, including process-level
repository reconstruction. Existing tests do not cover this new contract. The
browser walkthrough covers actual upload, preview, save, cancel, reset, keyboard
operation and desktop/mobile headers; API checks alone cannot prove those flows.

## Use

Open **Admin → System → Settings → Branding**. Enter logo text and choose an image.
Review the preview, then select **Save**. Each field can change independently.
**Use default image** keeps the text. **Restore defaults** stages both defaults;
select **Save** to apply them. **Cancel** restores the last saved settings.

The browser title uses the saved logo text followed by
` | Knowledge Base for People and AI Tools`. The favicon uses the saved image;
**Use default image** restores the built-in favicon while keeping the title.
Changes apply to the current tab after Save. Reload other open tabs to receive
them. Browser metadata follows the same tenant context as the page, and uses the
ForgetBase defaults while branding loads or if it cannot be read. The static HTML
and social-sharing metadata keep the product defaults.

Logo text is 1–64 characters. Images must be static PNG, JPEG or WebP, no larger
than 256 KiB and 2048 pixels on either side. SVG, remote image URLs and animated
images are not supported. The API checks the encoded size, signature, container
and dimensions. The browser also decodes the selected file before previewing it.
An image that fails to render falls back to the built-in logo. Wide images keep
their aspect ratio within the existing logo slot; long header text is truncated
with the full value available as its title.

Settings are tenant-scoped. The login screen uses the same tenant context as its
existing login form (default `tenant_demo`); authenticated screens use the signed-in
principal's tenant. The logo and text are public, including before login. The
branding API does not expose audit actors, timestamps or private tenant settings.

## API and persistence

- `GET /branding?tenantId=tenant_demo` returns `{ displayName, logoDataUrl }` without authentication.
- `GET /admin/branding` returns those fields for the authenticated admin's tenant.
- `PUT /admin/branding` replaces both fields. It requires the admin role and scope;
  cookie sessions also require the existing CSRF protection. A supplied tenant ID
  is rejected. API clients can use the same route with an admin bearer key.

Example request body for restoring defaults:

```json
{ "displayName": "ForgetBase", "logoDataUrl": null }
```

Custom images use a `data:image/png;base64,...`, `data:image/jpeg;base64,...` or
`data:image/webp;base64,...` value. No server-side URL fetching is performed.
Responses use `Cache-Control: no-store`. Saving updates all headers in the current
browser session; other open sessions receive changes on their next page reload.

Migration `044_branding.sql` adds `tenant_branding`. The bounded logo bytes are
stored with the settings in PostgreSQL, so existing database backups include
branding without a new volume. Each successful save writes an
`admin.branding.update` audit event in the same transaction. The audit stores the
text and a custom-image flag, never the image bytes. Failed audit writes roll
back the setting. Restore defaults is the user-facing rollback; older application
versions ignore the additive table and keep their built-in branding.

## Repeat the checks

Use a disposable PostgreSQL database with pgvector available. This script applies
migrations, creates synthetic tenants, temporarily installs an audit-failure
trigger, exercises the HTTP API, restarts the API, then deletes its synthetic
tenants. Never point it at a live database.

```sh
pnpm build
TEST_DATABASE_URL=<disposable-database-url> pnpm exec tsx scripts/verify-branding.ts
```

The report is `work/branding-proof/api-report.json`. Use the synthetic wide-logo
files under `scripts/fixtures/branding` for browser verification. On desktop and
mobile, upload a logo, preview it without changing the header, cancel, save,
reload, stage a reset, cancel it, and save a reset with the keyboard. Check a
failed upload, navigation with unsaved edits, login and reader headers, and a
reader account without admin controls. Capture screenshots and record results.

When running the existing `test:uat` command against a branded installation, set
`UAT_EXPECT_BRAND_NAME` to the saved logo text. The default expectation remains
`ForgetBase` for fresh installations.
