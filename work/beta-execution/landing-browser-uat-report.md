# Landing And Browser UAT Report

Status: accepted by manager after worker implementation plus manager-side browser readback
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`
Worker thread: `019edef1-2c6b-7943-ac3e-664480bc120c`

## Summary

The landing/browser UAT lane is accepted.

The web app now has a claim-safe unauthenticated ForgetBase entry surface that presents the beta wedge as a self-hostable governed instruction and context registry for AI agents. It keeps the existing local login/API-key/SSO entry behavior and queues the `#distribute` route for the demo path instead of introducing a router rewrite.

Browser UAT passed on the CORS-safe local review origin:

```text
http://127.0.0.1:5175/
```

The refreshed API target was:

```text
http://127.0.0.1:3000
```

## Files Inspected

- `work/beta-execution/integration-checkpoint-3.md`
- `work/beta-execution/positioning-landing-spec.md`
- `work/beta-execution/demo-spine-15-minute-path.md`
- `work/beta-execution/app-ia-screen-specs.md`
- `work/beta-execution/distribute-surface-mvp-report.md`
- `work/beta-execution/runtime-smoke-leakage-report.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/design/README.md`
- `README.md`
- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/local-dev-auth.ts`

## Files Changed

- `apps/web/index.html`
  - Updated the browser title and metadata to the ForgetBase governed-instructions story.
- `apps/web/src/App.tsx`
  - Added a proof-first unauthenticated public entry state.
  - Preserved the existing auth/session flow and local disposable login defaults.
  - Queues `#distribute` from the public CTA so the post-login route lands on the package builder.
- `apps/web/src/styles.css`
  - Added responsive public-entry, product-proof, beta-boundary, and auth-entry styles.
  - Preserved the operational app shell for authenticated users.
- `work/beta-execution/screenshots/`
  - Added public-safe browser UAT screenshot evidence.
- `work/beta-execution/landing-browser-uat-report.md`
  - Added this report.

## Copy And Claim Decisions

Accepted public category language:

- "Governed instructions for AI agents, self-hosted."
- "permissioned source of truth"
- "API, CLI, MCP, JSON, and OKF exports"
- "self-hostable beta core"
- "synthetic demo corpus"

Explicitly avoided:

- production-ready claims
- hosted-service maturity claims
- enterprise SSO/SCIM completion
- full managed-agent orchestration
- broad enterprise-search parity
- full stable API-surface claims

The public boundary panel states that ForgetBase is not claiming hosted-service maturity, enterprise SSO/SCIM completion, full managed-agent orchestration, broad enterprise search parity, or certification-level compliance.

## Browser UAT Evidence

Browser path: in-app Browser plugin, no Playwright fallback.

Desktop viewport: default browser viewport, observed as `1280x720`.

Mobile viewport: explicit `390x844`, reset after testing.

### Page Identity And Render Health

| Check | Result | Evidence |
|---|---|---|
| Public landing URL | Pass | `http://127.0.0.1:5175/` |
| Page title | Pass | `ForgetBase | Governed Instructions for AI Agents` |
| Not blank | Pass | Body contained the public hero, proof scene, and sign-in panel. |
| Framework overlay | Pass | No Vite/Webpack/framework overlay found. |
| Console health | Pass | `tab.dev.logs({ levels: ["error", "warn"], limit: 50 })` returned `[]`. |
| Desktop screenshot | Pass | `work/beta-execution/screenshots/manager-landing-public-desktop.png` |
| Mobile screenshot | Pass | `work/beta-execution/screenshots/manager-landing-mobile.png` |

Manager desktop public landing assertion:

```json
{
  "url": "http://127.0.0.1:5175/",
  "title": "ForgetBase | Governed Instructions for AI Agents",
  "hasLanding": true,
  "hasProofScene": true,
  "hasLogin": true,
  "hasFrameworkOverlay": false
}
```

Manager mobile public landing assertion:

```json
{
  "url": "http://127.0.0.1:5175/",
  "width": 390,
  "height": 844,
  "bodyScrollWidth": 390,
  "hasLanding": true,
  "hasProofScene": true,
  "hasLogin": true,
  "hasFrameworkOverlay": false
}
```

### Interaction Path

Path tested:

```text
public landing -> View the demo path -> #distribute queued -> local demo sign-in -> authenticated #distribute -> JSON package -> OKF package
```

Local disposable credentials used:

```text
tenant_demo
admin@example.test
local-dev-password
```

Authenticated Distribute assertion:

```json
{
  "url": "http://127.0.0.1:5175/#distribute",
  "hasActiveDistribute": true,
  "hasDistribute": true,
  "hasPackageBuilder": true,
  "hasGeneratePackage": true,
  "hasSafeCopy": true,
  "hasFrameworkOverlay": false
}
```

JSON package UI assertion:

```json
{
  "hasJsonResult": true,
  "hasAssetCount4": true,
  "hasDenied0": true,
  "hasIncludedStableIds": true,
  "hasSafeCopy": true,
  "includesObviousBodyPreview": false
}
```

OKF package UI assertion:

```json
{
  "hasOkfResult": true,
  "hasOkfVersion": true,
  "hasSourceHash": true,
  "hasProjectionHash": true,
  "hasRootIndex": true,
  "hasAssetCount4": true,
  "hasDenied0": true,
  "hasSafeCopy": true,
  "includesObviousBodyPreview": false
}
```

Mobile Distribute assertion:

```json
{
  "url": "http://127.0.0.1:5175/#distribute",
  "width": 390,
  "height": 844,
  "bodyScrollWidth": 390,
  "hasActiveDistribute": true,
  "hasPackageBuilder": true,
  "hasGeneratePackage": true,
  "hasSafeCopy": true,
  "hasFrameworkOverlay": false
}
```

### Read And Work Surface Evidence

The worker also captured browser evidence for:

- Read: `work/beta-execution/screenshots/read-library-desktop.png`
- Work: `work/beta-execution/screenshots/work-review-desktop.png`

These support the 15-minute value path, but the manager acceptance for this lane is specifically tied to landing, local sign-in, Distribute, JSON/OKF package generation, responsive render health, and safe package preview behavior.

## Screenshot Evidence

Manager-side screenshots:

- `work/beta-execution/screenshots/manager-landing-public-desktop.png`
- `work/beta-execution/screenshots/manager-distribute-authenticated-desktop.png`
- `work/beta-execution/screenshots/manager-distribute-json-success-desktop.png`
- `work/beta-execution/screenshots/manager-distribute-okf-success-desktop.png`
- `work/beta-execution/screenshots/manager-landing-mobile.png`
- `work/beta-execution/screenshots/manager-distribute-mobile.png`

Worker-side screenshots retained:

- `work/beta-execution/screenshots/landing-desktop-5175.png`
- `work/beta-execution/screenshots/distribute-authenticated-desktop.png`
- `work/beta-execution/screenshots/distribute-json-success-desktop.png`
- `work/beta-execution/screenshots/distribute-okf-success-desktop.png`
- `work/beta-execution/screenshots/read-library-desktop.png`
- `work/beta-execution/screenshots/work-review-desktop.png`
- `work/beta-execution/screenshots/landing-mobile.png`
- `work/beta-execution/screenshots/distribute-mobile.png`

## Commands Run

Worker-reported commands:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 smoke:compose
```

Manager rerun commands:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
```

All listed manager rerun commands passed.

## Runtime And API Evidence

`smoke:compose` passed against `http://127.0.0.1:3000` and included:

- Docker CLI and Compose CLI available.
- Base, same-origin, and TLS Compose config parsing.
- API `/health`.
- API `/openapi.json`.
- JSON `demo-agent-pack` export.
- OKF `demo-agent-pack` export.
- `security:verify-restricted-leakage`.

Representative `smoke:compose` export evidence:

```json
{
  "packageName": "demo-agent-pack",
  "assetCount": 4,
  "deniedCount": 0,
  "okfVersion": "0.1",
  "fileCount": 7
}
```

Representative restricted-leakage evidence:

```json
{
  "anonymousSearchResults": 0,
  "readerSearchResults": 0,
  "readerExportAssetCount": 0,
  "readerExportDeniedCount": 1,
  "readerOkfExportFileCount": 3,
  "readerOkfExportDeniedCount": 1
}
```

## Accepted Caveats

- Browser UAT is manual evidence, not committed automated Playwright coverage.
- The manager did not use this lane to implement package history, persistence, new backend routes, or a route-module refactor.
- The public landing surface is intentionally modest and proof-led; it is not a full marketing site.
- The manager verified Read/Work/Distribute evidence, but not every beta exit surface from `docs/BETA_RELEASE_PLAN.md` in-browser during this lane.
- `http://localhost:5173/` was observed by the worker as the wrong local review origin because the API CORS defaults did not allow that host/port combination. The accepted review origin is `http://127.0.0.1:5175/`, which matches the local split-origin defaults in `apps/web/src/local-dev-auth.ts`.

## Readiness Judgment

This lane unlocks final beta readiness review for the visible product proof path.

It does not by itself satisfy the full beta exit bar because the remaining release review still needs to account for fresh-clone timed quickstart evidence, backup/restore release evidence, fake/real provider or identity gates where applicable, and whether browser UAT should remain manual or become automated before a public beta claim.
