# Public Beta Goal

Status: active implementation target
Date: 2026-06-29

## Goal

Ship ForgetBase as a public beta that a technical team can try as a small company knowledge base.

People should be able to browse, read, search, and ask questions from human-friendly pages. Admins should be able to manage content, reviews, access, users, exports, and system settings in a clearly separate admin area.

Public beta means useful, polished, and verifiably safe for trial use. It does not mean production support, long-term API stability, hosted-service readiness, or advanced sign-in controls.

Supported trial paths, volatile surfaces, and support boundaries are defined in [Public Beta Compatibility](PUBLIC_BETA_COMPATIBILITY.md).
The final promotion sequence is defined in [Public Beta Release Runbook](runbooks/PUBLIC_BETA_RELEASE.md).

## Product Promise

ForgetBase is a knowledge base for people and AI tools.

Write and organize company knowledge once. People can read it. AI tools can use it safely.

## Required User Experience

- The reading UI is the default product experience.
- Pages are comfortable enough to replace a basic Confluence-style company knowledge base.
- The admin console is separate from reading.
- Regular readers do not see admin-only actions.
- The UI uses plain words: Pages, Search, Ask, Sources, Review, Publish, Access, Admin, Exports, Settings.
- Technical terms are kept out of the main UI unless an admin needs them.
- Demo content is synthetic and realistic enough to show browsing, reading, search, review, permissions, and exports.

## Reader Experience

A reader can:

- browse collections and pages
- read a clean page with good typography
- use search to find knowledge
- ask a question and see sources
- see owner, update date, and review state in plain language
- open related pages and source references
- use the UI on desktop and mobile without clipped text or horizontal overflow

## Admin Experience

An admin can:

- review and publish pages
- manage access, users, groups, and API keys
- configure providers and auth
- view activity, audit events, and system health
- generate safe export packages
- see restricted-content warnings without exposing restricted content to readers

## Verification Gates

Run these from a clean checkout before public beta:

```bash
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 public-beta:preflight
```

`public-beta:preflight` is the local, non-Docker gate. It runs typecheck, build, public UI checks, browser UAT, OpenAPI checks, contract checks, claims lint, deployment-default checks, demo corpus validation, and `git diff --check`.

The broader release-readiness check set is:

```bash
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 build
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 public-beta:check
npx -y pnpm@11.7.0 test:uat
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
npx -y pnpm@11.7.0 security:check-deployment-defaults
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
git diff --check
```

Run the stack-backed release gates after starting a same-origin app/API stack and importing the demo corpus:

```bash
UAT_BASE_URL=http://127.0.0.1:8080/ UAT_MODE=release UAT_EXPECT_ROLE=admin npx -y pnpm@11.7.0 test:uat
UAT_BASE_URL=http://127.0.0.1:8080/ UAT_MODE=release UAT_EXPECT_ROLE=reader UAT_EMAIL=<reader-email> UAT_PASSWORD=<reader-password> npx -y pnpm@11.7.0 test:uat
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
npx -y pnpm@11.7.0 github:public-beta:check
```

Before tagging or announcing public beta, copy `docs/PUBLIC_BETA_RELEASE_PROOF.template.json` to the proof bundle directory, replace every placeholder with real evidence, and run:

```bash
npx -y pnpm@11.7.0 release-proof:collect
npx -y pnpm@11.7.0 release-proof:check work/public-beta-proof/public-beta-release-proof.json
```

`release-proof:collect` writes a draft manifest with the current commit, available CI/GitHub read-backs, expected screenshot paths, and support-surface file links. It marks release UAT as failed until `PUBLIC_BETA_LIVE_DEMO_URL` is a real public HTTPS URL and the authenticated UAT reports were captured from that URL. It does not prove release readiness by itself; `release-proof:check` must pass after the stack-backed evidence is added.

## Browser Proof

Capture screenshots or recordings for:

- public reader home
- page browse tree
- page read view
- search results
- ask with sources
- no-access or restricted-content state
- login gate
- admin overview
- reviews
- policies
- access management
- approvals
- exports
- mobile reader view

The default browser proof command checks the public entry, desktop/mobile layout, page title, plain-language copy, action path, banned public jargon, console health, and screenshots against the built web bundle. CI runs this command and uploads the screenshots as the `public-beta-uat` artifact.

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/web build
npx -y pnpm@11.7.0 test:uat
```

The stricter release mode should run against a same-origin app/API stack with a real login:

```bash
UAT_BASE_URL=http://127.0.0.1:8080/ UAT_MODE=release UAT_EXPECT_ROLE=admin npx -y pnpm@11.7.0 test:uat
```

Browser checks must confirm:

- no horizontal overflow on mobile
- no clipped text inside buttons, cards, or tables
- public readers cannot trigger admin actions
- protected API routes return `authentication_required`
- restricted content does not appear in reader search, ask, or export output

## Release Proof Bundle

Before public beta, record:

- commit SHA
- CI run URL and status
- live demo URL
- live demo root and `/api/health` read-backs
- clean-checkout verification summary
- browser screenshot bundle
- restricted leakage result
- backup/restore result
- known limitations
- beta compatibility scope
- public beta compatibility read-back
- issue, pull request, and support surface read-back
- GitHub private vulnerability reporting status
- GitHub repo visibility, license, topics, README, and release text read-back
- `github:public-beta:check` JSON output

The release proof bundle is a JSON manifest plus referenced screenshots/log summaries. It must pass `release-proof:check`; the check rejects placeholder values, missing screenshots, localhost live-demo URLs, missing live demo root or health read-backs, missing required gates, missing compatibility evidence, stale reader/admin UAT, and missing GitHub/security read-back evidence.

## Done

ForgetBase is ready for public beta when the live demo reflects the tagged build, the reader UI is good enough to evaluate as a basic company knowledge base, admin features are separated and protected, all release gates pass, and the proof bundle shows the claims are true.
