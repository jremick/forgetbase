# UI, UX, and IA implementation — 5 September 2026

The 18 findings from the UI, UX, and IA review have been implemented in the isolated worktree on branch `codex/ui-ux-ia-improvements`.

- Worktree: `/Users/jarel/.codex/worktrees/forgetbase-ui-ux-ia-improvements`
- Base: `origin/main` at `5611aa38c9b10ec91f1ad4b4080d272e419c32ce`
- Review source: `/Users/jarel/Documents/agentic-cms/docs/reviews/2026-09-05-ui-ux-ia-review`
- Delivery state: local, uncommitted changes. No push, pull request, release, or deployment.
- The original checkout at `/Users/jarel/Documents/forgetbase` remains clean on `feat/versioning-upgrades` at `c7a36b86ca26095dd0cf05aff428fe6dc3ea881c`.

## Changes and evidence

| Finding | Result | Verification |
| --- | --- | --- |
| F01 — retention safety | Saved retention values load before editing or purging is enabled. Loading, failure, and retry states preserve the last values and disable writes until a successful read. | Real saved values of 17/180/45 loaded. An injected read failure disabled fields, save, preview, and purge. Retry restored the saved values. |
| F02 — unsaved drafts | Shared navigation protection covers route changes, page changes, browser history, cancel, and unload. Users can continue, discard, or save before leaving. Saving disables edits in flight; errors retain text. | Continue editing preserved text. Save and leave created a real draft and reached the requested destination. Back was blocked while dirty. Validation and injected 409 failures retained the text and URL. A successful save clears the pending guard. |
| F03 — reader deep links | The requested page remains authoritative during collection loading and browser history changes. Page links use real URLs. | Deep-link reload, page selection, and Back navigation retained the selected page. Missing IDs stayed in the URL instead of selecting another page. |
| F04 — empty filters | Filters and Clear remain available when no rows match. | A no-match query displayed 0 of 53 with all filters visible; Clear restored the collection. |
| F05 — shared controls | Select, checkbox, and button variants have explicit styles, including focus, selected, disabled, and confirmation states. | The rendered select menu was opaque with visible options. Final unsaved-dialog controls each measured 40 px high. |
| F06 — publication clarity | Page detail identifies the published version separately from the current draft. Restoring creates a draft and explains the publication boundary. | Saving draft v2 left readers on v1. Restoring v1 created draft v3 while the publication strip still identified v1. Confirming Publish created published v4, which the reader displayed. Database publication tests also passed. |
| F07 — complete review queue | The API and SDK support offset pagination, totals, and the next offset. Approved drafts remain in the queue as “Ready to publish.” | Loaded 25 of 33, then all 33 synthetic queue items. Marking a draft reviewed kept it visible as ready to publish. Real PostgreSQL and API pagination tests passed. |
| F08 — page grants | Page access supports user/group lookup or explicit IDs, grant creation, revoke confirmation, refresh, pagination, and recovery from failed reads. | A web read grant created through the UI changed the synthetic reader's API result from denied to 200. Revoking through the UI returned it to 403. API tests cover user/group and scoped-directory cases. |
| F09 — skip navigation | Skip to content focuses the main landmark without replacing the route hash. | Enter preserved the account/admin route and focused `main`. |
| F10 — responsive workspace | Content columns respond to available main-panel width, including a resized navigation sidebar. | No document overflow at 1440, 1180, 1024, 921, 768, 390, or 320 px with 420 px navigation on desktop. |
| F11 — reader states | Loading, empty, failed, and unavailable states have distinct copy and recovery actions. Successful page selection moves focus to the page heading. | An 8-second response delay showed “Loading page…”; completion focused `reader-page-title`. A failed collection read showed Retry pages. Retry recovered the list; unavailable-page recovery opened a permitted page. |
| F12 — page context | Page and tab context is carried by the URL. Content, Access, Agent instruction, Versions, Activity, and Raw metadata are object-level tabs. | Browser history returned to the selected page's Versions tab. Metadata, files, and release controls appear in their relevant tabs. Global detail/compare destinations were removed. |
| F13 — reader settings return | Account settings include a visible return to pages. Technical identity and scope details are secondary. | The account return link preserved the page ID; technical details were collapsed. |
| F14 — safe Markdown | Reader and authoring preview render ordered lists, nested lists, and fenced code while retaining escaping and safe-link handling. | DOM and screenshots confirmed numbered items, nested bullets, and preserved code line breaks. Markdown regression tests passed. |
| F15 — primary contrast | The primary button palette uses a darker teal. | White on the primary background measures 5.03:1; hover and pressed states exceed that ratio. |
| F16 — capability-based navigation | A shared capability map controls routes, navigation, and actions. The server remains the authority for each operation. | Capability matrix tests passed. The limited maintainer saw content/review tools without System; a direct System URL showed an access explanation and recovery actions. |
| F17 — keyboard resizing | Reader navigation supports Arrow keys, Home, and End with separator values and orientation. | Home set 240 px and End set 420 px through the keyboard. |
| F18 — task hierarchy | Reading starts with the page; mobile selection and outline are compact. Authoring prioritizes title, summary, body, and preview, with governance fields under Page settings. | Mobile reader body began about 401 px from the document top. Editor body widths were 553 px at 1440, 706 px at 1024, and 328 px at 390. With 420 px navigation at 1024, the editor used its full 526 px available width. |

## Validation

All commands used the repository's existing dependency versions. Installation used the offline cache and frozen lockfile; dependencies and the lockfile were not changed.

| Check | Result |
| --- | --- |
| Workspace type checking | All nine workspace projects passed. |
| Workspace build | Passed. The final web build also passed after the last UI change. |
| Full Vitest suite with `TEST_DATABASE_URL` | **45 files, 467 tests passed; no skips.** |
| `contracts:check` | Builds and OpenAPI checks passed; 58 contract tests passed. |
| `openapi:check` | 90 documented routes matched 92 server routes with two explicit meta-route exceptions. |
| `web:bundle-budget` | Passed without changing the budgets. Initial reader: 633.84 kB raw / 181.47 kB gzip. Lazy admin graph: 227.80 / 58.81 kB. All JavaScript: 884.24 / 247.79 kB. |
| `public-beta:check` | Passed. Static checks were updated for the shared router and focusable main landmark. |
| `claims:lint` | Passed. |
| `security:check-deployment-defaults` | 36 checks passed. |
| `git diff --check` | Passed. |

The required bundle limit led to removing the obsolete reader/account renderer from `AdminSurface`. `App` already owns those surfaces. Fresh loss of administration capability now hands control back to the reader through `App`. Retained authentication, request, authoring, grant, review, and retention behavior was checked during the removal.

The browser walkthrough used the Codex in-app browser, a production web build, the real API, and a dedicated PostgreSQL container. All accounts, content, grants, and failures were synthetic. The API used local-hash embeddings and an isolated attachment directory. No external model provider was called.

## Local evidence

Screenshots and measurements are in the worktree's ignored `work/ui-runtime/evidence` directory. They remain local review artifacts.

- [Desktop reader](../../work/ui-runtime/evidence/final-reader-desktop.png)
- [Mobile reader](../../work/ui-runtime/evidence/final-reader-mobile.png)
- [Editor at 1024 px with wide navigation](../../work/ui-runtime/evidence/final-authoring-1024-wide-nav.png)
- [Mobile editor](../../work/ui-runtime/evidence/final-authoring-390.png)
- [Unsaved-page confirmation](../../work/ui-runtime/evidence/final-unsaved-dialog.png)
- [Preserved text after a version conflict](../../work/ui-runtime/evidence/final-save-conflict.png)
- [Restore-as-draft confirmation](../../work/ui-runtime/evidence/final-restore-confirmation.png)
- [Failed reader request](../../work/ui-runtime/evidence/final-reader-read-failure.png)
- [Restricted maintainer route](../../work/ui-runtime/evidence/final-maintainer-route-denied.png)
- [Retention read failure](../../work/ui-runtime/evidence/retention-failed-read.png)
- [Loaded retention values](../../work/ui-runtime/evidence/retention-loaded.png)
- [Complete review queue](../../work/ui-runtime/evidence/review-queue-complete.png)
- [Content width measurements](../../work/ui-runtime/evidence/admin-widths.json)
- [Editor width measurements](../../work/ui-runtime/evidence/editor-widths.json)

## Verification limits

The repository's separate Playwright UAT launcher was not run; rendered checks used the permitted Codex browser. Native tab-close/reload confirmation, a full assistive-technology audit, and separate Safari/Firefox engines were not exercised. The unload handler is implemented; in-app and browser-history draft protection were exercised. These checks are local implementation evidence, not deployment or release verification.

The temporary API, web preview, and dedicated database were stopped after verification. The worktree, source changes, local runtime helpers, and evidence remain available.
