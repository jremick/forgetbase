# ForgetBase Beta Integration Checkpoint 1

Status: first-wave worker synthesis complete
Date: 2026-06-19
Manager thread: `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Purpose

This checkpoint integrates the first-wave beta planning workers and makes the manager decisions needed to continue without asking for minor reviews. It is the handoff from research/specification into focused implementation.

## Worker Artifacts Reviewed

| Lane | Artifact | Manager status | Notes |
|---|---|---|---|
| Market Validation / Competitor Gap | `work/beta-execution/market-validation-gap.md` | Accepted | Strongest wedge remains governed instruction/context registry. Biggest risk is file-based workflows being good enough. |
| Positioning + Landing Page | `work/beta-execution/positioning-landing-spec.md` | Accepted | Copy is claim-safe and proof-led. Canonical screenshots depend on demo/UI implementation. |
| Demo Spine + 15-Minute Value Path | `work/beta-execution/demo-spine-15-minute-path.md` | Accepted with prerequisite | Current corpus cannot prove restricted/internal story; minimal synthetic additions are required. |
| App IA + Screen Specs | `work/beta-execution/app-ia-screen-specs.md` | Accepted | Distribute becomes a top-level surface. Package history/persistence stays deferred for beta unless cheap evidence appears. |
| Trust Gates Design | `work/beta-execution/trust-gates-design.md` | Accepted with manager decision | Option C secure-default posture is accepted for beta planning. |
| API/CLI/MCP Contract Audit | `work/beta-execution/api-cli-mcp-contract-audit.md` | Accepted | Freeze a small canonical value-path contract first; keep broader admin/ops surface preview. |
| Codebase Refactor Readiness | `work/beta-execution/codebase-refactor-readiness.md` | Accepted | First web implementation should start with pure asset UI helper extraction and tests before route movement. |

## Manager Decisions

### D-20260619-001 - Beta Category Language

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: Beta positioning, landing copy, claims lint, README/public docs
- `Decision`: Use "self-hostable governed instruction and context registry for AI agents" as the safest public category. Use "instruction control plane" in technical/contextual sections, not as an unsupported hero claim.
- `Why`: Market validation found credible demand only when buyers have multi-surface, permissioned, audited agent-context distribution pain. Broad enterprise-search, LLMOps, hosted-service, and full-orchestration claims are unsafe.
- `Alternatives`: Lead with enterprise search, AI knowledge base, LLMOps platform, or full agent orchestration. Rejected as overbroad or unsupported.
- `Follow-ups`: Claims linter should enforce blocklist. Landing page should use the accepted language.
- `Accounted for`: Positioning worker, market worker, this checkpoint.
- `Memory routing`: None.

### D-20260619-002 - Git/Markdown Import Is Not A P0 Beta Blocker

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Manager thread
- `Scope`: Beta implementation sequencing
- `Decision`: Do not add a git/Markdown import or mirror path before the first beta proof implementation. Treat it as a validation question and likely P1/P2 integration path.
- `Why`: File-based workflows are the biggest market alternative, but adding sync/import before proving the governed distribution demo risks widening scope. The beta can respectfully position ForgetBase as complementary to git/Markdown while validating whether import/sync is required.
- `Alternatives`: Make git/Markdown import P0; avoid mentioning file-based alternatives. Rejected because P0 import is too broad and silence weakens the public story.
- `Follow-ups`: Market validation should test authoring preference. Landing/docs can explain the complement story without promising import/sync.
- `Accounted for`: Market worker open question resolved here.
- `Memory routing`: None.

### D-20260619-003 - Demo Corpus Must Add Minimal Internal/Restricted Proof

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Demo/corpus implementation worker
- `Scope`: `corpus/demo/assets.json`, `corpus/demo/evals.json`, demo walkthrough, leakage proof
- `Decision`: Add the smallest synthetic corpus expansion needed to prove internal/restricted/export-blocked behavior before attempting Compose smoke or landing screenshots.
- `Why`: Current corpus has five `public-demo` assets only. It can prove alpha import/review/export, but not the beta trust story.
- `Alternatives`: Use existing corpus only; rewrite corpus broadly. Rejected because existing corpus is insufficient, while broad rewrite increases risk and review burden.
- `Follow-ups`: Implement new synthetic assets/evals, validate with `--fail-on-warnings`, and keep restricted proof terms deterministic.
- `Accounted for`: Demo-spine worker and next implementation wave.
- `Memory routing`: None.

### D-20260619-004 - Distribute Is Top-Level, Package History Deferred

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: UI implementation worker
- `Scope`: Web IA, beta Distribute route, package builder
- `Decision`: Make Distribute a top-level app surface for beta. Build a demo-scope package-builder MVP on existing `/exports/ai-package` JSON/OKF routes. Defer first-class package-history persistence unless an existing audit/export record path makes it cheap.
- `Why`: Distribute is the clearest product differentiation. Existing backend export routes are enough to show a credible package-builder path, while package-history persistence is a separate product/API decision.
- `Alternatives`: Keep exports under Operate; build full saved-package persistence first. Rejected because buried distribution hides the wedge, and persistence blocks visible value.
- `Follow-ups`: UI should show generated-for-session state when persistence is absent and avoid restricted-content preview leakage.
- `Accounted for`: App IA worker and next UI wave.
- `Memory routing`: None.

### D-20260619-005 - Keep Hash Routing For Beta

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: UI implementation worker
- `Scope`: Web app routing/refactor
- `Decision`: Keep the current hash-route strategy for beta implementation slices. Do not introduce a router during the first Distribute/refactor work.
- `Why`: The current app already uses hash route IDs, and the beta blocker is visible product value, not URL architecture. Router migration would amplify a dirty, monolithic app refactor.
- `Alternatives`: Introduce a formal router now. Rejected as unnecessary coupling risk.
- `Follow-ups`: Route modules can still be extracted behind the existing route IDs.
- `Accounted for`: App IA and refactor readiness synthesis.
- `Memory routing`: None.

### D-20260619-006 - Secure Default Uses Contextual Option C

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Security/release implementation worker
- `Scope`: Auth default posture, deployment templates, warnings, release gates
- `Decision`: Accept Option C for beta. Keep local direct API/Compose bootstrap workable, make public/deployment templates secure by default, add warnings for ambiguous public binds, and gate public proxy/template bootstrap exposure.
- `Why`: Flipping global `requireAuthentication` to true would break first-run setup without a setup-token/installer path. Keeping everything default-open weakens the trust story. Contextual defaults preserve OSS quickstart while improving public deployment posture.
- `Alternatives`: Keep default false with warnings only; set true everywhere. Both are weaker for beta for opposite reasons.
- `Follow-ups`: Implement only after deterministic gates begin landing. Do not weaken bootstrap or leakage checks.
- `Accounted for`: Trust gates design accepted by manager.
- `Memory routing`: None.

### D-20260619-007 - Freeze Canonical Machine-Consumer Path First

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Contract implementation worker
- `Scope`: API, CLI, SDK, MCP, JSON export, OKF export
- `Decision`: Freeze and test the canonical beta value path first. Keep the broad admin/ops surface preview until contract coverage exists.
- `Why`: The server has 84 route/method pairs and MCP has 72 tools. Freezing everything would overstate maturity and delay the beta proof. The canonical path already covers auth/bootstrap, corpus import, validate, review/publish, search, managed query, JSON/OKF export, MCP fetch/search/export, and telemetry/audit read-back.
- `Alternatives`: Freeze all routes/tools now; freeze nothing. Rejected because both are misaligned with beta risk.
- `Follow-ups`: Add `openapi:check`, SDK/CLI/MCP contract tests, and export fixture tests for the canonical path.
- `Accounted for`: API/CLI/MCP audit synthesis.
- `Memory routing`: None.

### D-20260619-008 - Web Refactor Starts With Pure Helpers

- `Date`: 2026-06-19
- `Status`: Accepted
- `Owner`: Web implementation worker
- `Scope`: `apps/web/src/App.tsx` decomposition
- `Decision`: Before moving routes or auth/request logic, extract and test pure asset UI helpers, especially public-reader gating and library/review filter helpers.
- `Why`: `App.tsx` is 5,094 lines with 74 `useState` calls and 79 `request<T>` calls. The lowest-risk first step reduces coupling and makes permission-sensitive UI logic testable.
- `Alternatives`: Start by moving route JSX or request/auth hooks. Rejected because those touch high-risk browser-session and CSRF behavior.
- `Follow-ups`: Add focused Vitest coverage, then extract nav/route constants and request boundary in later slices.
- `Accounted for`: Refactor readiness synthesis.
- `Memory routing`: None.

## Integration Synthesis

### Positioning And Landing

Use the accepted category language and proof-led landing spec. Do not implement the landing page until there are browser-rendered product states for:

- asset reader or review/diff with trust/provenance
- Distribute/package-builder or export evidence
- terminal/code panel showing API/CLI/MCP/OKF fetch
- restricted/omitted proof

Landing implementation remains blocked until the demo corpus and at least a first Distribute UI slice exist.

### Demo Spine

The demo spine is directionally complete, but full beta proof requires corpus additions first. The next work should add minimal synthetic assets/evals, then validate the corpus. After that, the walkthrough can become `smoke:compose`.

### App IA And UI

The UI can proceed in two ordered slices:

1. Pure helper extraction and tests from `App.tsx`.
2. Top-level Distribute route and demo package-builder flow backed by existing JSON/OKF export endpoints.

Do not begin broad route-module decomposition, package-history persistence, trust-console buildout, or Playwright UAT until these slices land.

### Trust Gates And Contracts

Start with deterministic, secret-free gates:

1. `openapi:check`
2. `claims:lint`
3. beta-critical contract tests/fixtures

Then move to runtime gates after corpus proof and harness support:

1. `security:verify-restricted-leakage` CI wrapper
2. `smoke:compose`
3. `db:verify-backup-restore`
4. `test:uat`

Real provider and real Entra/OIDC remain manual/secret-gated and do not block OSS beta unless public copy claims that proof.

### Refactor

The refactor plan is accepted, but it is a means to support UI delivery, not an independent cleanup project. Each refactor slice must preserve:

- public reader eligibility: `public-demo` + `active` + `approved`
- cookie/bearer auth behavior
- CSRF behavior for unsafe cookie-backed requests
- session refresh/logout behavior
- search/managed-query feedback telemetry handoff

## Next Implementation Wave

Dispatch these lanes now:

| Lane | Outcome | File boundaries | Can run in parallel |
|---|---|---|---|
| Demo Corpus And Eval Proof | Add minimal synthetic internal/restricted/export-blocked corpus examples and evals; validate strict corpus. | `corpus/demo/assets.json`, `corpus/demo/evals.json`, optional docs/work evidence only | yes |
| Deterministic Trust Gates | Add `openapi:check`, `claims:lint`, fixtures, package scripts, and soften current "stable contract target" wording if needed. | scripts/tests/package scripts/OpenAPI docs only | yes |
| Web Utility Extraction | Extract pure asset UI helpers from `App.tsx` and add focused tests, no route/auth/request movement. | `apps/web/src/App.tsx`, `apps/web/src/lib/asset-ui.ts`, tests | yes |

Hold these lanes until the first three land:

- Distribute route/package-builder MVP
- Compose smoke implementation
- Browser UAT
- Landing page implementation
- secure-default Option C runtime/template changes
- broader API/CLI/MCP contract coverage

## Review Standard For Next Workers

The manager will accept or correct worker outputs using these checks:

- Does the change move the beta proof state forward?
- Is the change bounded to the lane's file ownership?
- Does it preserve public content and secret boundaries?
- Does it avoid overclaiming production, hosted, enterprise identity, full orchestration, or stable contract maturity?
- Does verification cover the actual behavior touched?

## Current Blocker State

No hard blockers. No Pushover notification sent.

Pushover readiness was checked on 2026-06-19: credentials are available from Keychain and the helper reports `readyToSend: true`. This enables blocker notifications later if needed.
