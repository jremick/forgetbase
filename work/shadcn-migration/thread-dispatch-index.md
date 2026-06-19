# Shadcn Migration Thread Dispatch Index

Status: local QA passed; push/deploy in progress
Date: 2026-06-19
Manager branch: `codex/shadcn-ui-migration`

## Active Goal

Migrate ForgetBase web UI to a shadcn/ui-based interface while preserving only the existing color scheme and custom logo.

## Active Threads

| Lane | Agent | Status | Artifact / Owned Scope |
|---|---|---|---|
| Codebase migration map | `019edf6a-4a0f-75b1-87ca-390ff002be4a` | Complete | `work/shadcn-migration/codebase-migration-map.md` |
| Target UX spec | `019edf6b-366a-7393-ae85-5d5ce7872ae6` | Complete | `work/shadcn-migration/shadcn-target-ux-spec.md` |
| Shadcn foundation components | `019edf6a-c66a-7e72-ac4e-908d2397dab4` | Complete | `components.json`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/components/ui/**`, token-only CSS |
| Public/auth entry migration | `019edf76-6fd4-7e23-b8ee-833b21baebb6` | Complete | Unauthenticated render branch in `apps/web/src/App.tsx`; public-entry/auth-dialog CSS |
| App/domain composition components | `019edf76-ba84-7361-b191-7e76a63c38f2` | Complete | New files under `apps/web/src/components/app/**` and `apps/web/src/components/domain/**` |
| Route migration inventory | manager | Complete | `work/shadcn-migration/route-migration-inventory.md` |
| Wave 3 worker goals | manager | Prepared | `work/shadcn-migration/worker-goals-wave3.md` |
| Authenticated shell/nav/command | manager after closing `019edf8c-83f1-7cf0-8b13-0a53f9d115bf` | Complete | Authenticated topbar, nav, command dialog, connection panel, global shell alerts |
| Distribute route migration | manager-integrated patch from `019edfa0-0804-7dc2-b4bb-057f8344c8c2` | Complete | `#distribute` / `#exports` package builder, package result, consumer examples |
| Read/Search route migration | manager after closing `019edfa7-8461-7601-8346-836625256ea8` | Complete | `#library`, `#asset-read`, `#versions`, `#search` route cluster |
| Operate routes and dense forms | manager | Complete | `#operations`, `#review`, `#access`, `#providers`, `#policies`, `#telemetry`, `#approvals` shared surfaces and forms |

## Replaced / Closed Threads

| Agent | Reason |
|---|---|
| `019edf6a-8590-7721-a7b6-7d095540b22b` | Failed immediately because the Claude UI/UX role expected `PERPLEXITY_API_KEY`; replaced with local-doc-only design/spec worker `019edf6b-366a-7393-ae85-5d5ce7872ae6`. |
| `019edf8c-83f1-7cf0-8b13-0a53f9d115bf` | Did not return a status checkpoint or patch after interruption; manager closed it and completed the shell slice locally. |
| `019edfa0-0804-7dc2-b4bb-057f8344c8c2` | Produced a scoped Distribute patch but did not return a final handoff; manager verified and integrated the patch. |
| `019edfa7-8461-7601-8346-836625256ea8` | Did not return a status checkpoint or patch in the shared worktree; manager closed it and completed the Read/Search slice locally. |

## Dependency Order

1. Foundation components landed in commit `fa6e719`.
2. UX spec and codebase map are available before route cluster workers begin.
3. Public/auth entry can migrate before authenticated shell as long as it only touches the unauthenticated branch.
4. Authenticated shell/navigation should land before broad route conversion.
5. Shared form/table/card/tabs compositions should land before Read/Work/Distribute/Operate route clusters.
6. Route workers should use `work/shadcn-migration/route-migration-inventory.md` for ownership and stop conditions.
7. Final CSS cleanup must wait until all route clusters stop using the bespoke selectors.

## Integration Checkpoints

- 2026-06-19: Public/auth entry and composition wrappers integrated after adding `tslib` as a direct web dependency for the Radix dialog/scroll-lock bundle path.
- 2026-06-19: Verification passed: `npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck`, `npx -y pnpm@11.7.0 --filter @agentic-cms/web test`, `npx -y pnpm@11.7.0 --filter @agentic-cms/web build`, `npx -y pnpm@11.7.0 claims:lint`, and `git diff --check`.
- 2026-06-19: Browser verification passed against `http://127.0.0.1:4173/`: initial public page showed no username/email, password, API URL, API key, tenant ID, or SSO provider controls; login dialog showed only blank username/email and password fields; desktop and 390px mobile had no horizontal overflow; browser console had zero warnings/errors.
- Screenshot artifacts: `work/shadcn-migration/public-login-desktop.png`, `work/shadcn-migration/public-login-mobile.png`.
- 2026-06-19: `Button` and `Badge` primitives migrated off the legacy `.ui-*` CSS classes and now expose shadcn-style `data-slot` markers plus Tailwind/CVA variants. Verification passed: web typecheck, web tests, web build, and desktop/mobile browser assertions for public login blank values, removed auth controls, zero console warnings/errors, and no horizontal overflow.
- 2026-06-19: Added route/shell primitives for upcoming authenticated migration: `Command`, `AlertDialog`, `ToggleGroup`, `Collapsible`, and updated `Table`. Verification passed: web typecheck and web build.
- 2026-06-19: Authenticated shell/nav/command integration completed locally. Verification passed: web typecheck, web test, web build, `git diff --check`, real local login on `http://127.0.0.1:5175/`, command palette `Meta+K` navigation to `#distribute` and `#library`, identity dropdown render, desktop and 390px mobile no horizontal overflow, and zero fresh browser warnings/errors after command focus fix.
- Screenshot artifacts: `work/shadcn-migration/shell-desktop.png`, `work/shadcn-migration/shell-mobile.png`.
- 2026-06-19: Distribute route migrated to shadcn-style route composition with `MetricCard`, `SectionCard`, `FormField`, `Select`, `Input`, `DefinitionGrid`, `StatusAlert`, `EmptyState`, and `Textarea`. Verification passed: web typecheck, web test, web build, `git diff --check`, and owned-section grep found no raw `<input>`, `<select>`, raw `<button>`, `.metric`, `.workflow-panel`, `.export-summary`, or `.command-examples` in the Distribute block.
- Build note: the web production bundle crossed Vite's default 500 kB chunk warning after the shadcn/command migration; this is tracked as an optimization follow-up, not a functional gate failure.
- 2026-06-19: Read/Search route cluster migrated to shadcn-style composition with `MetricCard`, `DataTableShell`, `Toolbar`, `FormField`, `Input`, `Select`, `Checkbox`, `Table`, `Tabs`, `SectionCard`, `DefinitionGrid`, `TrustStateSummary`, `StatusAlert`, and `EmptyState`. Verification passed: web typecheck, web test including `asset-ui.test.ts`, web build, `git diff --check`, and owned-section grep found no raw form controls, raw table markup, `.metric`, `.asset-table`, `.table-scroll`, `.detail-pane`, `.workflow-panel`, `.content-block`, `.tab-bar`, `.metadata-grid`, `.state-pill`, or `.stable-id-chip` in the Read/Search block.
- 2026-06-19: Operate landing/actions, review queue, telemetry summary, and dense admin forms migrated off raw App-level controls and old route-layout selectors. Verification passed: web typecheck, web test, web build, `git diff --check`, no raw `<button>`, `<input>`, `<select>`, `<textarea>`, or `<table>` tags in `App.tsx`, and no old route selectors (`.metric`, `.workflow-panel`, `.content-block`, `.ops-pane`, `.detail-pane`, `.tab-bar`, `.library-filter-bar`, `.metadata-grid`, `.table-scroll`, `.asset-table`, `.export-summary`, `.operations-overview`, `.summary-link`, `.state-pill`, `.stable-id-chip`, `.ops-form`, `.provider-form`, `.button-row`, `.wide-field`) in `App.tsx` or `styles.css`.
- Implementation note: dense admin native select handlers use `components/ui/native-select.tsx`, a shadcn-token-styled compatibility wrapper, to avoid changing API-facing form semantics in the same migration.
- 2026-06-19: Final local rendered QA passed against `http://127.0.0.1:5175/`: desktop 1346x900 and mobile 390x844 route checks covered `#library`, `#search`, `#asset-read`, `#review`, `#versions`, `#distribute`, `#exports`, `#operations`, `#access`, `#providers`, `#policies`, `#telemetry`, and `#approvals` with zero page-level horizontal overflow and zero browser warnings/errors. The unauthenticated home page has no inline login form, and the login dialog opens with only blank username/email and password inputs.

## Manager-Owned Decisions

- Use shadcn core first; ReUI only for richer data-grid/filter patterns if shadcn core compositions are insufficient.
- Preserve existing colors and logo only. The old bespoke component CSS is not a design system to preserve.
- Keep hash routing for this migration unless a later worker proves a router change is necessary and low-risk.
- Do not duplicate the `request<T>` auth/security path.
- Keep public-reader gating exactly centralized around `public-demo`, `active`, and `approved`.
- Keep live deployment out of scope until local migration passes final QA; when deploying, redeploy the public `proxy` after `web`.
