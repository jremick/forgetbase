# Shadcn Migration Thread Dispatch Index

Status: active
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

## Replaced / Closed Threads

| Agent | Reason |
|---|---|
| `019edf6a-8590-7721-a7b6-7d095540b22b` | Failed immediately because the Claude UI/UX role expected `PERPLEXITY_API_KEY`; replaced with local-doc-only design/spec worker `019edf6b-366a-7393-ae85-5d5ce7872ae6`. |

## Dependency Order

1. Foundation components landed in commit `fa6e719`.
2. UX spec and codebase map are available before route cluster workers begin.
3. Public/auth entry can migrate before authenticated shell as long as it only touches the unauthenticated branch.
4. Authenticated shell/navigation should land before broad route conversion.
5. Shared form/table/card/tabs compositions should land before Read/Work/Distribute/Operate route clusters.
6. Final CSS cleanup must wait until all route clusters stop using the bespoke selectors.

## Integration Checkpoints

- 2026-06-19: Public/auth entry and composition wrappers integrated after adding `tslib` as a direct web dependency for the Radix dialog/scroll-lock bundle path.
- 2026-06-19: Verification passed: `npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck`, `npx -y pnpm@11.7.0 --filter @agentic-cms/web test`, `npx -y pnpm@11.7.0 --filter @agentic-cms/web build`, `npx -y pnpm@11.7.0 claims:lint`, and `git diff --check`.
- 2026-06-19: Browser verification passed against `http://127.0.0.1:4173/`: initial public page showed no username/email, password, API URL, API key, tenant ID, or SSO provider controls; login dialog showed only blank username/email and password fields; desktop and 390px mobile had no horizontal overflow; browser console had zero warnings/errors.
- Screenshot artifacts: `work/shadcn-migration/public-login-desktop.png`, `work/shadcn-migration/public-login-mobile.png`.

## Manager-Owned Decisions

- Use shadcn core first; ReUI only for richer data-grid/filter patterns if shadcn core compositions are insufficient.
- Preserve existing colors and logo only. The old bespoke component CSS is not a design system to preserve.
- Keep hash routing for this migration unless a later worker proves a router change is necessary and low-risk.
- Do not duplicate the `request<T>` auth/security path.
- Keep public-reader gating exactly centralized around `public-demo`, `active`, and `approved`.
- Keep live deployment out of scope until local migration passes final QA; when deploying, redeploy the public `proxy` after `web`.
