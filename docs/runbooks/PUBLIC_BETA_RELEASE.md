# Public Beta Release Runbook

Use this runbook for the final promotion from public beta candidate to public beta release.

## Scope

- The release is for the self-hosted core and synthetic demo corpus only.
- The public reader UI is the main product surface.
- The admin console is for managing content, access, exports, users, and system settings.
- No private, customer, employee, or regulated data should be imported.
- Do not make the repository public, tag a release, or announce public beta until the owner explicitly approves that action.

## Release Inputs

Record these before running the final gates:

- release commit SHA
- intended release tag
- public HTTPS demo URL
- GitHub Actions CI run URL for the release commit
- admin UAT account for the demo
- reader UAT account for the demo
- support contact path
- security reporting path

Do not store account passwords, API keys, or provider secrets in the proof bundle.

## Candidate Checks

Start from a clean checkout of the release commit:

```bash
git status --short --branch
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 public-beta:preflight
npx -y pnpm@11.7.0 test
```

Stop if the working tree is dirty after these commands, except for ignored files under `work/`.

## Demo Deployment

Deploy the release commit to the intended public HTTPS demo URL. Use the same-origin browser shape unless there is a clear reason not to.

Minimum deployment checks:

```bash
curl --silent --show-error --fail "$PUBLIC_BETA_LIVE_DEMO_URL/"
curl --silent --show-error --fail "$PUBLIC_BETA_LIVE_DEMO_URL/api/health"
```

Then confirm the deployment uses the release commit, imports only the synthetic demo corpus, and exposes the reader UI at the root URL.

## Browser UAT

Run authenticated release-mode UAT against the public HTTPS demo, once as an admin and once as a regular reader:

```bash
PUBLIC_BETA_LIVE_DEMO_URL=https://demo.example.com \
UAT_BASE_URL=https://demo.example.com/ \
UAT_MODE=release \
UAT_EXPECT_ROLE=admin \
UAT_EMAIL="$PUBLIC_BETA_RELEASE_ADMIN_EMAIL" \
UAT_PASSWORD="$PUBLIC_BETA_UAT_PASSWORD" \
npx -y pnpm@11.7.0 test:uat
```

```bash
PUBLIC_BETA_LIVE_DEMO_URL=https://demo.example.com \
UAT_BASE_URL=https://demo.example.com/ \
UAT_MODE=release \
UAT_EXPECT_ROLE=reader \
UAT_EMAIL="$PUBLIC_BETA_RELEASE_READER_EMAIL" \
UAT_PASSWORD="$PUBLIC_BETA_UAT_PASSWORD" \
npx -y pnpm@11.7.0 test:uat
```

The screenshots must show:

- reader home
- page list
- clean page reading view
- search results
- ask with sources
- restricted or no-access state
- login gate
- admin overview
- reviews
- policies
- access management
- approvals
- exports
- mobile reader view

Stop if the reader can trigger admin actions, if restricted content appears for the reader, or if mobile screenshots show clipped text or horizontal overflow.

## Stack Safety Gates

Run these against the seeded release stack:

```bash
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
```

For a public deployment, also run the deployment-default check with the real public entrypoint and browser origin:

```bash
FORGETBASE_PUBLIC_DEPLOYMENT=true \
FORGETBASE_PUBLIC_ENTRYPOINT=external-tls-proxy \
FORGETBASE_REQUIRE_AUTHENTICATION=true \
FORGETBASE_SESSION_COOKIE_SECURE=true \
FORGETBASE_CORS_ALLOWED_ORIGINS="$PUBLIC_BETA_LIVE_DEMO_URL" \
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

## GitHub Release Settings

After explicit owner approval to make the repository public, confirm these settings:

- repository visibility is public
- Apache-2.0 license is detected
- issues are enabled
- wiki and discussions are disabled unless intentionally opened
- security policy is present
- private vulnerability reporting is enabled
- default branch is `main`
- default branch requires CI through branch protection or rulesets
- repo description and topics match the reader-first product scope

Run:

```bash
npx -y pnpm@11.7.0 github:public-beta:check
```

Stop if this command fails.

## Release Proof

Collect and validate the proof manifest after the live demo, UAT reports, stack gates, CI, and GitHub read-back are ready:

```bash
PUBLIC_BETA_LIVE_DEMO_URL=https://demo.example.com \
PUBLIC_BETA_TAG=v0.1.0-beta.1 \
npx -y pnpm@11.7.0 release-proof:collect

npx -y pnpm@11.7.0 release-proof:check work/public-beta-proof/public-beta-release-proof.json
```

The proof check must pass before tagging or announcing public beta. A failing release proof is a release blocker, not a warning.

## Tag And Announce

Only after the proof check passes:

```bash
git tag -a v0.1.0-beta.1 -m "ForgetBase v0.1.0-beta.1"
git push origin v0.1.0-beta.1
```

Create the GitHub release from the tag. Keep the release notes plain:

- what ForgetBase is
- how to try the self-hosted beta
- what is included
- what is not included
- where to report bugs
- where to report suspected vulnerabilities

Do not claim production readiness, hosted-service readiness, stable API compatibility, or support for private/customer corpus imports.

## Stop Rules

Stop the release if any of these are true:

- CI for the release commit is not passing.
- The release proof manifest does not pass.
- The live demo is not public HTTPS.
- The live demo does not reflect the release commit.
- Reader/admin UAT evidence is missing or stale.
- Private vulnerability reporting is not enabled after public visibility.
- Branch protection or a ruleset cannot require CI on `main`.
- Restricted content appears in reader search, ask, or export output.
- The UI has obvious mobile overflow, clipped text, or admin actions visible to regular readers.
- Any release note or README claim goes beyond the documented public beta scope.
