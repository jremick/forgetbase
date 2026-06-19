# ForgetBase Beta Thread Dispatch Index

Status: private self-hosted beta release readiness recorded
Last updated: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

This index records the live worker dispatch state for the ForgetBase beta execution program. The static execution map and exact worker prompts are in `work/beta-execution/manager-execution-map.md`.

## First-Wave Workers

| Lane | Thread ID | Expected artifact | Status | Manager action when complete |
|---|---|---|---|---|
| Market Validation / Competitor Gap | `019edeca-9538-7aa2-a15a-a214c6f13118` | `work/beta-execution/market-validation-gap.md` | complete, accepted in Checkpoint 1 | Use for claim language, ICP risk, and git/Markdown validation tests. |
| Positioning + Landing Page | `019edeca-c75e-72a0-b1f7-d2256934f47b` | `work/beta-execution/positioning-landing-spec.md` | complete, accepted in Checkpoint 1 | Use for landing implementation after product screenshots exist. |
| Demo Spine + 15-Minute Value Path | `019edeca-f7a5-7f03-b397-6bfef5e0bade` | `work/beta-execution/demo-spine-15-minute-path.md` | complete, accepted in Checkpoint 1 | Requires corpus proof implementation before smoke/landing screenshots. |
| App IA + Screen Specs | `019edecb-40e8-7062-8b69-a0824b2b61b0` | `work/beta-execution/app-ia-screen-specs.md` | complete, accepted in Checkpoint 1 | Use for Distribute route/package-builder implementation after web utility extraction. |
| Trust Gates Design | `019edecb-7d47-7c40-88ba-13f4c00d54cb` | `work/beta-execution/trust-gates-design.md` | complete, accepted in Checkpoint 1 | Option C secure-default posture accepted by manager; implementation held until deterministic gates begin landing. |
| API/CLI/MCP Contract Audit | `019edecb-af8f-7702-a10f-08aec3c81d53` | `work/beta-execution/api-cli-mcp-contract-audit.md` | complete, accepted in Checkpoint 1 | Freeze canonical beta value path first; broad admin/ops surface remains preview. |
| Codebase Refactor Readiness | `019edecb-e27a-76f0-98f9-bff5f609052c` | `work/beta-execution/codebase-refactor-readiness.md` | complete, accepted in Checkpoint 1 | First web slice is pure helper extraction with tests. |

## Integration Checkpoint

`work/beta-execution/integration-checkpoint-1.md` records accepted first-wave manager decisions and the first implementation wave.

`work/beta-execution/integration-checkpoint-2.md` records first implementation acceptance and the next implementation wave.

`work/beta-execution/integration-checkpoint-3.md` records second implementation acceptance, manager-side runtime refresh evidence, and the third implementation wave.

`work/beta-execution/integration-checkpoint-4.md` records third implementation acceptance, landing/browser UAT evidence, CI/security gate evidence, and closeout hygiene.

`work/beta-execution/private-beta-release-readiness.md` is the current release-readiness record for the private self-hosted beta decision.

## First Implementation Wave

| Lane | Thread ID | Expected artifact | Status | Manager action when complete |
|---|---|---|---|---|
| Demo Corpus And Eval Proof | `019eded9-b1aa-7972-b9c9-4920f290f10f` | `work/beta-execution/demo-corpus-proof-report.md` | complete, accepted in Checkpoint 2 | Unlock runtime smoke/leakage implementation. |
| Deterministic Trust Gates | `019eded9-f9a5-7cd1-a263-df1af7805a2a` | `work/beta-execution/trust-gates-implementation-report.md` | complete, accepted in Checkpoint 2 | Unlock runtime gate and contract-freeze implementation. |
| Web Utility Extraction | `019ededa-318f-7f83-841f-394a9e235717` | `work/beta-execution/web-utility-extraction-report.md` | complete, accepted in Checkpoint 2 | Unlock Distribute route/package-builder MVP. |

## Second Implementation Wave

| Lane | Thread ID | Expected artifact | Status | Manager action when complete |
|---|---|---|---|---|
| Runtime Smoke And Leakage Gate | `019edee2-d5b3-73d1-8660-bf2432baf1b3` | `work/beta-execution/runtime-smoke-leakage-report.md` | complete, accepted in Checkpoint 3 after manager API refresh | Use `smoke:compose` as the runtime gate; add CI/policy wiring in a later lane. |
| Distribute Surface MVP | `019edee3-29bf-71f0-822e-ea83ba4cb07e` | `work/beta-execution/distribute-surface-mvp-report.md` | complete, accepted in Checkpoint 3 | Use `#distribute` for landing screenshots and browser UAT; rerun OKF UI success against refreshed API. |
| Contract Freeze Tests | `019edee3-7417-7d21-8858-75b2910c659f` | `work/beta-execution/contract-freeze-tests-report.md` | complete, accepted in Checkpoint 3 | Consider CI wiring with static gates after browser UAT/landing proof. |

## Third Implementation Wave

| Lane | Thread ID | Expected artifact | Status | Manager action when complete |
|---|---|---|---|---|
| Landing + Browser UAT | `019edef1-2c6b-7943-ac3e-664480bc120c` | `work/beta-execution/landing-browser-uat-report.md` | complete, accepted in Checkpoint 4 after manager report/readback | Use `http://127.0.0.1:5175/` and `#distribute` screenshots as the current visible proof path. |
| CI Gate Wiring | `019edef1-8632-7833-a213-09e5b436ed47` | `work/beta-execution/ci-gate-wiring-report.md` | complete, accepted in Checkpoint 4 | Use deterministic CI gates for static proof; keep runtime gates release/manual until isolated wrappers exist. |
| Secure Default Option C | `019edef1-ec0c-7b72-9820-35c85aece1da` | `work/beta-execution/secure-default-option-c-report.md` | complete, accepted in Checkpoint 4 | Use `security:check-deployment-defaults` for contextual public deployment posture checks. |

## Manager Checkpoint Rules

Final beta readiness review is recorded in `work/beta-execution/private-beta-release-readiness.md`.

Backup/restore release-gate policy wiring remains eligible after CI gate wiring if it does not conflict with secure-default work.

`work/beta-execution/integration-checkpoint-2.md` reconciles:

- corpus proof versus runtime leakage/export checks
- deterministic static gates versus runtime gate needs
- web helper extraction versus Distribute UI readiness
- canonical contract freeze versus broad API/MCP surface maturity
- landing-page timing versus honest product screenshot evidence

## Completion Evidence For Manager Objective

The manager setup and first three implementation waves are complete. Current evidence shows:

- `work/beta-execution/manager-execution-map.md` exists and includes exact first-wave worker goals.
- First-wave worker threads exist and are accepted.
- First implementation wave threads exist, landed reports, and are accepted.
- `work/beta-execution/integration-checkpoint-1.md`, `work/beta-execution/integration-checkpoint-2.md`, and `work/beta-execution/integration-checkpoint-3.md` record manager decisions and dependency sequencing.
- `work/beta-execution/integration-checkpoint-4.md` records third implementation closeout and is superseded by `work/beta-execution/private-beta-release-readiness.md` for the current release decision.
- `work/beta-execution/private-beta-release-readiness.md` records passed hosted CI, local runtime gates, fresh-clone timed proof, backup/restore, fake OIDC, security review outcomes, and remaining deferrals.
- This dispatch index records actual worker thread IDs, expected artifacts, and manager actions for active waves.
