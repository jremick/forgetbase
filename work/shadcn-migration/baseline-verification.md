# Shadcn Migration Baseline Verification

Date: 2026-06-19
Branch: `codex/shadcn-ui-migration`
Baseline commit: `21d0da5628e8f20fab4ea704e932df504b60dd91`

## Commands

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/web test
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 --filter @forgetbase/web build
```

## Results

| Check | Result | Evidence |
|---|---:|---|
| Web tests | Pass | 2 test files, 11 tests passed |
| Claims lint | Pass | scanned 37 public copy/source files with 8 claim rules |
| Web build | Pass | Vite built `index-AB0OwXvJ.js` and `index-ZkvWrgup.css` |

## Notes

- This baseline is before integrating shadcn foundation components or screen migrations.
- The baseline bundle matches the live private deployment bundle from the previous login-entry deploy.
- Future failures should be compared against this baseline before assuming pre-existing breakage.
