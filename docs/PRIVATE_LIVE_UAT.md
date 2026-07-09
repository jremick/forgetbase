# Private Live UAT

Use this charter to test a release candidate with local, invited users on a controlled live deployment before any public beta promotion.

## Boundary

- Keep the GitHub repository private.
- Do not create or push a release tag, create a GitHub release, publish packages, or announce public beta.
- Use only the synthetic demo corpus or explicitly approved non-sensitive test content.
- Give testers individual reader or admin accounts; do not share credentials or store them in screenshots, reports, or the repo.
- Treat the deployment as disposable trial infrastructure, not production.

The current candidate line is `0.1.0-beta.2`. The existing `v0.1.0-beta.1` tag is historical private-beta evidence and must not be moved or reused.

## Entry Gates

Before inviting testers, record the exact candidate commit and require:

```bash
git status --short --branch
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 public-beta:preflight
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 security:check-deployment-defaults
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
```

Against a seeded same-origin stack, also require:

```bash
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 db:verify-backup-restore
```

`smoke:compose` includes the restricted-content leakage verifier. Run `security:verify-restricted-leakage` separately only when a standalone leakage report is required.

The isolated local proof command owns a unique Compose project, selects loopback ports, runs the Postgres-backed repository suite, imports only the synthetic corpus, runs smoke/leakage, backup/restore, and authenticated admin/reader browser UAT, writes evidence under `work/private-live-proof/`, then removes its containers and volumes:

```bash
npx -y pnpm@11.7.0 private-live:isolated-proof
```

It requires a clean worktree by default. `PRIVATE_LIVE_REQUIRE_CLEAN=0` permits implementation-only validation but records that the evidence is not a clean candidate. `KEEP_PRIVATE_LIVE_STACK=1` retains the isolated stack only for deliberate debugging; otherwise cleanup runs on success and failure.

Deploy that exact commit to a private HTTPS instance. Record a deployment identifier, timestamp, root read-back, `/api/health` read-back, backup location, and rollback target without recording secrets.

## Test Roles

Use at least one account for each role:

- Reader: browses, reads, searches, asks, follows sources, and encounters a no-access state.
- Admin: completes the reader tasks, then reviews, publishes, restores, manages access, inspects activity and health, and creates a safe export.
- Observer: records task outcome, hesitation, errors, severity, viewport, browser, and deployment identifier without coaching unless the tester is blocked.

Run the reader and admin automation once before the moderated sessions:

```bash
UAT_BASE_URL=https://private.example.test/ UAT_MODE=release UAT_EXPECT_ROLE=admin UAT_TENANT_ID="$UAT_TENANT_ID" UAT_EMAIL="$UAT_ADMIN_EMAIL" UAT_PASSWORD="$UAT_ADMIN_PASSWORD" UAT_OUTPUT_DIR=work/private-live-proof/release-admin npx -y pnpm@11.7.0 test:uat
UAT_BASE_URL=https://private.example.test/ UAT_MODE=release UAT_EXPECT_ROLE=reader UAT_TENANT_ID="$UAT_TENANT_ID" UAT_EMAIL="$UAT_READER_EMAIL" UAT_PASSWORD="$UAT_READER_PASSWORD" UAT_OUTPUT_DIR=work/private-live-proof/release-reader npx -y pnpm@11.7.0 test:uat
```

## Moderated Tasks

Ask the tester to work without step-by-step instructions:

1. Sign in and explain what the product is for from the first screen.
2. Find a page by browsing, then find a different page by search.
3. Ask a question, inspect the answer sources, and open one cited page.
4. Explain the selected page's owner, update date, and review state.
5. Try to find content their account cannot access and describe the result.
6. Repeat the reader flow at a 390 px mobile viewport or on a phone.
7. For admins only: review and publish a test change, confirm the pending state, restore the previous version, adjust access, and create an export.
8. Sign out and confirm protected content is no longer visible.

Do not count a task as successful only because the tester eventually completed it. Record incorrect turns, confusing labels, accidental admin exposure, unclear state, slow feedback, and assistance required.

## Evidence Record

For every session, capture a small structured note outside tracked source files containing:

- candidate commit and deployment identifier
- date, role, browser, device, and viewport
- task result: completed, completed with help, failed, or blocked
- observed behavior and expected behavior
- screenshot or recording reference with secrets and personal data removed
- severity and proposed disposition
- tester comments paraphrased unless they approve a direct quote

Classify findings:

- P0: data exposure, privilege bypass, destructive corruption, or unavailable service; stop testing and roll back.
- P1: core reader/admin task cannot complete, restricted data appears, backup/restore fails, or mobile UI is unusable; stop expansion and fix before more testers.
- P2: material confusion, accessibility failure, poor recovery, or inconsistent state; fix or explicitly accept before public beta.
- P3: polish, wording, or low-frequency friction; triage into the beta backlog.

## Exit Gates

Private live UAT is complete only when:

- the deployed commit is exact and reproducible
- automated admin and reader UAT pass on desktop and mobile
- restricted leakage and backup/restore gates pass against the candidate stack
- at least one reader and one admin complete the moderated tasks
- no open P0 or P1 findings remain
- every P2 is fixed or has an explicit owner-approved disposition
- rollback has been rehearsed or demonstrated with evidence
- the known-limitations list reflects the tested build

Passing this charter permits preparation of the public release proof. It does not authorize changing repository visibility, tagging, releasing, publishing packages, or announcing public beta.

## Stop Rules

Stop testing, preserve non-sensitive evidence, and roll back when restricted content leaks, permissions fail open, data is corrupted, backup/restore fails, authentication cannot be recovered safely, or the deployed commit cannot be identified. Keep the repo private and return to the implementation gates before resuming.
