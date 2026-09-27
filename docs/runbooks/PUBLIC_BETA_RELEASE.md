# Public Beta Release Runbook

Use this runbook for the final promotion from public beta candidate to public beta release.

The public candidate tag is `v0.1.0-beta.5`. Tags `v0.1.0-beta.1` through `v0.1.0-beta.3` are historical private-beta snapshots. Preserve their tags, source identity and release assets.

## Scope

- The release is for the self-hosted core and synthetic demo corpus only.
- The public reader UI is the main product surface.
- The admin console is for managing content, access, exports, users, and system settings.
- No private, customer, employee, or regulated data should be imported.
- Do not make the repository public, tag a release, or announce public beta until the owner explicitly approves that action.
- Complete the controlled live-testing phase in [Private Live UAT](../PRIVATE_LIVE_UAT.md) before considering public promotion.

## Release Inputs

Record these before running the final gates:

- release commit SHA
- intended release tag
- public HTTPS demo URL
- GitHub Actions CI run URL for the release commit
- release tenant ID used by both authenticated UAT accounts
- admin UAT account for the demo
- reader UAT account for the demo
- support contact path
- security reporting path
- completed disclosure review from [Publication](../PUBLICATION.md)

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

Then confirm the deployment uses the release commit, imports only the synthetic demo corpus, and exposes the reader-first UI at the root URL. The release proof collector checks the root HTML for the current knowledge-base metadata and rejects stale builds that still advertise the older agent-instruction positioning.

## Browser UAT

Run authenticated release-mode UAT against the public HTTPS demo, once as an admin and once as a regular reader:

```bash
PUBLIC_BETA_LIVE_DEMO_URL=https://demo.example.com \
UAT_BASE_URL=https://demo.example.com/ \
UAT_MODE=release \
UAT_EXPECT_ROLE=admin \
UAT_TENANT_ID="$PUBLIC_BETA_RELEASE_UAT_TENANT_ID" \
UAT_EMAIL="$PUBLIC_BETA_RELEASE_ADMIN_EMAIL" \
UAT_PASSWORD="$PUBLIC_BETA_UAT_PASSWORD" \
UAT_OUTPUT_DIR=work/public-beta-proof/release-admin \
npx -y pnpm@11.7.0 test:uat
```

```bash
PUBLIC_BETA_LIVE_DEMO_URL=https://demo.example.com \
UAT_BASE_URL=https://demo.example.com/ \
UAT_MODE=release \
UAT_EXPECT_ROLE=reader \
UAT_TENANT_ID="$PUBLIC_BETA_RELEASE_UAT_TENANT_ID" \
UAT_EMAIL="$PUBLIC_BETA_RELEASE_READER_EMAIL" \
UAT_PASSWORD="$PUBLIC_BETA_UAT_PASSWORD" \
UAT_OUTPUT_DIR=work/public-beta-proof/release-reader \
npx -y pnpm@11.7.0 test:uat
```

The screenshots must show:

- public login entry
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

The UAT report must also prove the selected page has a real article body and that reader search returns readable result snippets with Open page actions.

Stop if the reader can trigger admin actions, if restricted content appears for the reader, if reader search is only a page-title filter, or if mobile screenshots show clipped text or horizontal overflow.

## Stack Safety Gates

Run these against the seeded release stack:

```bash
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
```

`smoke:compose` already exercises the leakage verifier. The explicit second command is intentional here because the release proof records a standalone restricted-leakage result.

For a public deployment, also run the deployment-default check with the real public entrypoint and browser origin:

```bash
FORGETBASE_PUBLIC_DEPLOYMENT=true \
FORGETBASE_PUBLIC_ENTRYPOINT=external-tls-proxy \
FORGETBASE_REQUIRE_AUTHENTICATION=true \
FORGETBASE_SESSION_COOKIE_SECURE=true \
FORGETBASE_CORS_ALLOWED_ORIGINS="$PUBLIC_BETA_LIVE_DEMO_URL" \
FORGETBASE_POSTGRES_PORT=127.0.0.1:5432 \
FORGETBASE_API_PORT=127.0.0.1:3000 \
FORGETBASE_WEB_PORT=127.0.0.1:5175 \
FORGETBASE_PROXY_PORT=127.0.0.1:8080 \
npx -y pnpm@11.7.0 security:check-deployment-defaults
```

## GitHub Release Settings

Prepare the settings before publication. On GitHub Free, branch protection and private vulnerability reporting may be unavailable for private repositories. After the disclosure and source checks pass and the owner authorizes publication, change visibility and immediately apply and read back these settings:

- repository visibility is public
- Apache-2.0 license is detected
- issues are enabled
- wiki and discussions are disabled unless intentionally opened
- security policy is present
- private vulnerability reporting is enabled
- default branch is `main`
- `main` requires the real `Verify` CI check with up-to-date branches
- pull requests and conversation resolution are required; zero outside approvals are required for the solo-maintainer workflow
- branch protection applies to administrators; force pushes and deletion are blocked
- secret scanning and push protection are enabled
- CodeQL default setup is configured for JavaScript/TypeScript and GitHub Actions
- repo description and topics match the reader-first product scope

Run:

```bash
npx -y pnpm@11.7.0 github:public-beta:check
```

Stop if this command fails.

The check verifies that the local release commit is the remote `main` commit and that its latest push-triggered CI run passed. An older successful run or an unrelated ruleset is not sufficient. This runbook uses classic branch protection; changing to rulesets requires an equivalent verified policy and an updated checker.

## Release Proof

Collect and validate the proof manifest after the live demo, UAT reports, stack gates, CI, and GitHub read-back are ready:

```bash
PUBLIC_BETA_LIVE_DEMO_URL=https://demo.example.com \
PUBLIC_BETA_TAG=v0.1.0-beta.5 \
npx -y pnpm@11.7.0 release-proof:collect

npx -y pnpm@11.7.0 release-proof:check work/public-beta-proof/public-beta-release-proof.json
```

The proof check must pass before tagging or announcing public beta. A failing release proof is a release blocker, not a warning.

## Tag And Announce

Only after the proof check passes:

```bash
git tag -a v0.1.0-beta.5 -m "ForgetBase v0.1.0-beta.5"
git push origin v0.1.0-beta.5
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
- The documented branch protection or GitHub security settings cannot be verified.
- Restricted content appears in reader search, ask, or export output.
- The UI has obvious mobile overflow, clipped text, or admin actions visible to regular readers.
- Any release note or README claim goes beyond the documented public beta scope.
