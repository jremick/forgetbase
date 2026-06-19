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
| Target UX spec | `019edf6b-366a-7393-ae85-5d5ce7872ae6` | Running | `work/shadcn-migration/shadcn-target-ux-spec.md` |
| Shadcn foundation components | `019edf6a-c66a-7e72-ac4e-908d2397dab4` | Running | `components.json`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/components/ui/**`, optional `apps/web/src/hooks/**`, token-only CSS |

## Replaced / Closed Threads

| Agent | Reason |
|---|---|
| `019edf6a-8590-7721-a7b6-7d095540b22b` | Failed immediately because the Claude UI/UX role expected `PERPLEXITY_API_KEY`; replaced with local-doc-only design/spec worker `019edf6b-366a-7393-ae85-5d5ce7872ae6`. |

## Dependency Order

1. Foundation components must land before public/auth and shell migrations.
2. UX spec and codebase map must be available before route cluster workers begin.
3. Public/auth entry can migrate before authenticated shell as long as it only touches the unauthenticated branch.
4. Authenticated shell/navigation should land before broad route conversion.
5. Shared form/table/card/tabs compositions should land before Read/Work/Distribute/Operate route clusters.
6. Final CSS cleanup must wait until all route clusters stop using the bespoke selectors.

## Manager-Owned Decisions

- Use shadcn core first; ReUI only for richer data-grid/filter patterns if shadcn core compositions are insufficient.
- Preserve existing colors and logo only. The old bespoke component CSS is not a design system to preserve.
- Keep hash routing for this migration unless a later worker proves a router change is necessary and low-risk.
- Do not duplicate the `request<T>` auth/security path.
- Keep public-reader gating exactly centralized around `public-demo`, `active`, and `approved`.
- Keep live deployment out of scope until local migration passes final QA; when deploying, redeploy the public `proxy` after `web`.
