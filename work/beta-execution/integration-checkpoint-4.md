# ForgetBase Beta Integration Checkpoint 4

Status: third implementation wave accepted; superseded by private beta release readiness record
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Purpose

This checkpoint integrates the third implementation wave, records manager-side verification, and closes the current manager execution program. It does not claim production readiness, hosted-service maturity, enterprise identity completion, full managed-agent orchestration, broad enterprise-search parity, or full API stability.

Later release-gate execution supersedes the final readiness section below. Use `work/beta-execution/private-beta-release-readiness.md` for the current private beta release decision.

## Worker Artifacts Reviewed

| Lane | Artifact | Manager status | Notes |
|---|---|---|---|
| Landing + Browser UAT | `work/beta-execution/landing-browser-uat-report.md` | Accepted after manager-authored missing report and browser readback | Adds proof-led public entry, responsive styles, desktop/mobile screenshots, and rendered `#distribute` JSON/OKF proof. |
| CI Gate Wiring | `work/beta-execution/ci-gate-wiring-report.md` | Accepted | Adds deterministic CI gates for typecheck, build, strict corpus validation, static Compose config parsing, OpenAPI drift, claims lint, focused beta contracts, and tests. |
| Secure Default Option C | `work/beta-execution/secure-default-option-c-report.md` | Accepted | Adds contextual `security:check-deployment-defaults` without breaking local OSS bootstrap. |

## Manager Verification

The manager reran these checks after third-wave integration:

```bash
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 security:check-deployment-defaults
AGENTIC_CMS_PUBLIC_DEPLOYMENT=true AGENTIC_CMS_REQUIRE_AUTHENTICATION=true AGENTIC_CMS_SESSION_COOKIE_SECURE=true AGENTIC_CMS_PUBLIC_ENTRYPOINT=railway-proxy AGENTIC_CMS_CORS_ALLOWED_ORIGINS=https://cms.example.com npx -y pnpm@11.7.0 security:check-deployment-defaults
npx -y pnpm@11.7.0 --filter @agentic-cms/web typecheck
npx -y pnpm@11.7.0 --filter @agentic-cms/web test
npx -y pnpm@11.7.0 --filter @agentic-cms/web build
npx -y pnpm@11.7.0 contracts:check
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
```

Results:

- OpenAPI drift passed: 82 documented routes matched 84 server routes with 2 explicit meta-route exceptions.
- Claims lint passed: 28 public copy/source files scanned with 8 claim rules.
- Default local deployment security check passed with 14 checks.
- Public Railway-style deployment security check passed with 18 checks.
- Web typecheck passed.
- Web Vitest passed: 2 files, 12 tests.
- Web build passed.
- `contracts:check` passed targeted builds, OpenAPI check, 4 contract test files, and 11 tests.
- `smoke:compose` passed Compose config, running API health, OpenAPI, JSON export, OKF export, and restricted leakage verification.
- Full `pnpm test` passed: 10 files passed, 1 skipped; 118 tests passed, 28 skipped.
- Strict demo corpus validation passed: 9 assets, 0 errors, 0 warnings, 0 stale assets.
- Base, same-origin, and TLS Compose config parsing passed.

## Browser UAT Evidence

Browser path: in-app Browser plugin, no fallback.

Accepted review URL:

```text
http://127.0.0.1:5175/
```

API target:

```text
http://127.0.0.1:3000
```

Manager evidence:

- Public desktop landing rendered with correct title, proof scene, sign-in panel, no framework overlay, and no console warnings/errors.
- Public mobile landing rendered at `390x844` with `bodyScrollWidth: 390`, no framework overlay, and no console warnings/errors.
- Local demo sign-in succeeded from the queued `#distribute` path.
- Authenticated `#distribute` rendered with package builder and safe metadata-only copy.
- JSON package generation succeeded with 4 assets, 0 denied, included stable IDs, safe copy, and no obvious body preview.
- OKF package generation succeeded with OKF 0.1, source hash, projection hash, `index.md` root, 4 assets, 0 denied, safe copy, and no obvious body preview.
- Mobile `#distribute` rendered at `390x844` with no horizontal overflow and no console warnings/errors.

Primary screenshots:

- `work/beta-execution/screenshots/manager-landing-public-desktop.png`
- `work/beta-execution/screenshots/manager-distribute-authenticated-desktop.png`
- `work/beta-execution/screenshots/manager-distribute-json-success-desktop.png`
- `work/beta-execution/screenshots/manager-distribute-okf-success-desktop.png`
- `work/beta-execution/screenshots/manager-landing-mobile.png`
- `work/beta-execution/screenshots/manager-distribute-mobile.png`

Supporting worker screenshots:

- `work/beta-execution/screenshots/read-library-desktop.png`
- `work/beta-execution/screenshots/work-review-desktop.png`

## Release Gate Evidence

`smoke:compose` included restricted leakage verification. Representative result:

```json
{
  "anonymousSearchResults": 0,
  "readerSearchResults": 0,
  "adminSearchIncludesFixture": true,
  "readerExportAssetCount": 0,
  "readerExportDeniedCount": 1,
  "readerOkfExportFileCount": 3,
  "readerOkfExportDeniedCount": 1
}
```

`smoke:compose` also proved the active demo package exports:

```json
{
  "packageName": "demo-agent-pack",
  "assetCount": 4,
  "deniedCount": 0,
  "okfVersion": "0.1",
  "fileCount": 7
}
```

## Closeout Hygiene

Closeout check run:

```text
Codex closeout security-secrets helper against this repository.
```

Result: non-blocking local hygiene finding.

The helper reported:

- ignored generated TLS key path under `infra/docker/tls/`
- `docs/BETA_RELEASE_PLAN.md`
- `work/model-council/forgetbase-beta-20260619/source-register.md`

Manager triage:

- generated TLS key material under `infra/docker/tls/` is ignored by `.gitignore`; it is local generated TLS state for Compose smoke and is not tracked.
- The two Markdown hits are false positives from public URLs containing token-like substrings; no secret values were printed.
- No tracked secret was identified by this triage. Do not commit ignored TLS files.

## Manager Decisions

### D-20260619-018 - Third Implementation Wave Is Accepted

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: Landing/browser UAT, CI gate wiring, secure-default Option C
- `Decision`: Accept all third-wave lanes as complete for the current manager program.
- `Why`: Each lane produced or was given a durable report, stayed within outcome boundaries, preserved public-safe synthetic content, avoided unsupported maturity claims, and passed manager-side verification.
- `Follow-ups`: Use this checkpoint as the source for final readiness review and any branch/PR preparation.

### D-20260619-019 - Browser UAT Evidence Is Accepted As Manual Release Proof

- `Date`: 2026-06-19
- `Status`: Accepted with caveat
- `Owner`: Manager thread
- `Scope`: Landing page, Distribute flow, mobile/desktop proof
- `Decision`: Accept the in-app Browser evidence and screenshots as the current release proof for visible product quality and the 15-minute proof path.
- `Why`: The flow exercised real app state, real local auth, the refreshed API, JSON and OKF package generation, console health, and mobile layout. It is stronger than static screenshots or source-only checks.
- `Caveat`: This is manual evidence, not committed automated UAT.
- `Follow-ups`: Add automated browser UAT when the app shell is decomposed enough to make selectors and setup durable.

### D-20260619-020 - CI Gates Cover Static Confidence, Runtime Gates Stay Release/Manual

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: CI and release gates
- `Decision`: Treat the updated GitHub Actions workflow as the default deterministic gate set, and keep `smoke:compose`, restricted leakage standalone runs, backup/restore, fake/real provider auth, and browser UAT out of unconditional CI until wrappers own setup and teardown.
- `Why`: This prevents brittle CI state while still making the high-signal static and contract gates enforceable.
- `Follow-ups`: Add isolated runtime wrappers before requiring these gates in default CI.

### D-20260619-021 - Secure Default Option C Is Beta-Satisfied

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: Deployment security posture
- `Decision`: Satisfy Option C through contextual deployment checks and docs, not a global auth-default flip.
- `Why`: Local OSS bootstrap remains useful, while public deployment posture now has deterministic checks for auth, secure cookies, approved HTTPS CORS origins, proxy entrypoint, and private direct service binds.
- `Follow-ups`: A future setup-token or installer flow can support stronger global defaults without harming first-run usability.

### D-20260619-022 - Current State Is Beta-Reviewable, Not Beta-Claim-Complete

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: Public readiness and release claim
- `Decision`: The project is now ready for a final human/release-manager beta readiness review, but the repo should not yet claim a completed public beta release without resolving or explicitly accepting the remaining release gaps below.
- `Why`: Visible proof, Distribute, contracts, static gates, runtime smoke, leakage, and deployment posture are now materially improved and verified. However, some beta exit criteria still require either fresh-clone timed proof, release-owner deferral, or broader automation.

## Final Readiness Status

### Ready To Claim Internally

- The beta execution program has been split, dispatched, integrated, and recorded.
- First-wave specs and three implementation waves are complete.
- Distribute is the canonical beta screenshot/proof surface.
- Public landing copy is claim-safe and proof-led.
- JSON and OKF package generation work in the browser against the refreshed local API.
- OpenAPI, claims, contracts, strict corpus, web checks, full tests, Compose config parsing, runtime smoke, restricted leakage, and contextual deployment security checks passed locally.

### Not Yet Safe To Claim Publicly Without Explicit Release Approval

- Fresh-clone 15-minute quickstart has not been timed from a clean clone in this manager pass.
- Browser UAT is manual evidence, not automated CI/UAT coverage.
- Backup/restore was not rerun in this manager pass.
- Fake-provider OIDC and real-provider smoke checks were not rerun in this manager pass.
- Hosted-service readiness, enterprise identity, SCIM, support/SLA, billing, managed backups, and production operations remain out of scope.
- Broader API/admin/MCP surfaces remain outside the focused beta contract freeze.

## No Hard Blockers

No hard blocker required Pushover notification.

The remaining items are release-owner approval or follow-up execution items, not blockers that prevented the manager program from completing its coordination, integration, and verification objective.

## Next Safe Action

Prepare a review branch or PR containing the current beta artifacts and patches, then run hosted GitHub Actions plus any release-owner manual gates selected for the beta claim:

- fresh-clone timed quickstart
- backup/restore
- fake-provider OIDC
- optional real-provider smoke with approved secrets/cost limits
- final public-copy/readme pass
