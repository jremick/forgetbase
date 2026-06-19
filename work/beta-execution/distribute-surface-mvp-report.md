# Distribute Surface MVP Report

Status: implemented; manager runtime refresh unblocked OKF UAT
Date: 2026-06-19
Lane: Distribute Surface MVP
Source checkpoint: `work/beta-execution/integration-checkpoint-2.md`

## Summary

Implemented a top-level `Distribute` surface in the operational web UI using the existing hash-route pattern.

The new route ID is:

```text
#distribute
```

The legacy route ID remains:

```text
#exports
```

`#exports` now renders the same Distribute package-builder surface, is labeled as a legacy alias in the nav, and shows an in-page notice that `#distribute` is the first-class route.

## Files Inspected

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/design/README.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `work/beta-execution/integration-checkpoint-2.md`
- `work/beta-execution/app-ia-screen-specs.md`
- `work/beta-execution/positioning-landing-spec.md`
- `work/beta-execution/demo-spine-15-minute-path.md`
- `work/beta-execution/web-utility-extraction-report.md`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/lib/asset-ui.ts`
- `apps/web/package.json`
- `apps/api/src/server.ts`
- `packages/schema/src/index.ts`
- `packages/cli/src/index.ts`
- `packages/mcp-server/src/server.ts`

## Files Changed

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `work/beta-execution/distribute-surface-mvp-report.md`

## Route And Navigation Changes

- Added `distribute` to the hash-route allowlist.
- Added a top-level `Distribute` nav group with folder label `Agent Distribution` and glyph `DS`.
- Added `Package builder` as the first-class leaf route for `#distribute`.
- Kept `#exports` as `Legacy exports`, an alias leaf under Distribute rather than a separate Operate workflow.
- Removed Exports from the Operate nav leaf list and changed the Operate summary link to route to `distribute`.

## Package Builder Behavior

The Distribute route now includes a beta package builder for `demo-agent-pack` with:

- package name input
- format select: `json` or `okf`
- OKF version select: `0.1`, disabled unless `okf` is selected
- generate action backed by the existing `/exports/ai-package` endpoint
- loading state on generate
- explicit error state through the existing global error panel
- local/session-only language; no package-history persistence is claimed

Endpoint used by the UI:

```text
/exports/ai-package?package=<package>&format=<json|okf>[&okfVersion=0.1]
```

The generate action now verifies that the returned package shape matches the selected format. If the UI asks for OKF but receives the JSON package shape, it shows:

```text
Expected OKF export package, but the API returned the JSON package shape.
```

## Safe Result View

The result view shows only safe package metadata:

- package name
- format
- asset count
- denied count
- generated time
- tenant ID
- OKF version, source package hash, projection hash, and root index path when the response is OKF-shaped
- included stable IDs for permitted JSON package assets with type, status, and sensitivity

It does not preview instruction bodies, human document bodies, OKF file contents, or restricted denied assets.

## Command Snippets Added

API:

```bash
curl --silent --show-error --fail \
  -H "authorization: Bearer $AGENTIC_CMS_API_KEY" \
  -H "x-agentic-cms-surface: api" \
  "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack&format=json"
```

CLI:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- exports ai-package --package demo-agent-pack --format json \
  --output export.json \
  --api-url http://127.0.0.1:3000
```

MCP:

```json
{
  "tool": "generate_ai_export",
  "arguments": {
    "packageName": "demo-agent-pack",
    "format": "json",
    "okfVersion": "0.1"
  }
}
```

OKF:

```text
GET /exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1
```

The snippets update live when the package name or selected format changes.

## Verification

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
```

Result: passed.

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
```

Result: passed, 2 test files and 12 tests.

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
```

Result: passed.

Rendered Browser checks:

- Started Vite dev server; actual URL was `http://localhost:5173/`.
- Signed into local UI with prefilled local demo credentials against `http://127.0.0.1:3000`.
- Verified `http://localhost:5173/#distribute` renders authenticated Distribute nav, package builder, JSON/OKF controls, generate action, and consumer examples.
- Verified JSON generate succeeds and shows safe metadata plus included stable IDs without content preview.
- Verified `http://localhost:5173/#exports` renders the same Distribute surface and body text contains the legacy alias notice.
- Verified desktop Browser console warnings/errors: none relevant, 0 returned.
- Verified mobile viewport `390x844` renders Distribute, package builder, generate action, and consumer examples without framework overlay or console warnings/errors.

## Runtime Caveat

The already-running local API at `http://127.0.0.1:3000` returned the JSON package shape for:

```text
/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1
```

The source code in `apps/api/src/server.ts` supports OKF generation, so this appears to be a stale or incompatible running API process rather than a web UI issue. The UI now detects that mismatch and shows an explicit error instead of presenting the result as OKF.

Manager integration update: after this report, the manager rebuilt and restarted only the Compose `migrate` and `api` services from the current worktree while preserving the existing Postgres container/volume. The refreshed API now returns the OKF response shape and `npx -y pnpm@11.7.0 smoke:compose` passes end to end.

## Screenshot And UAT Readiness

Landing screenshots can proceed for:

- top-level Distribute nav and route
- package builder controls
- JSON package success state
- command examples
- mobile stacked layout

Before capturing an OKF success screenshot, restart the API from the current source or run the current Compose stack, then verify:

```bash
curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1"
```

Expected OKF evidence:

- `format: "okf"`
- `okfVersion: "0.1"`
- `sourcePackageHash`
- `projectionHash`
- `rootIndexPath: "index.md"`

## Open Loops

- Browser UAT for OKF success should be rerun against the refreshed API before final landing screenshots are selected.
- No package-history persistence was added.
- No backend routes, auth behavior, router dependency, shadcn/ReUI install, landing page, or broad route extraction was added.

## Next Safe Action

Capture the `#distribute` OKF success screenshot and run the landing/browser UAT lane against the refreshed API.
