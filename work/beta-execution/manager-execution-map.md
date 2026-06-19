# ForgetBase Beta Manager Execution Map

Status: manager handoff artifact
Last updated: 2026-06-19
Owner: manager thread `019edec7-6e44-7da1-b7aa-b3868bdd8625`

## Goal

Coordinate beta execution across fresh worker threads by outcome boundary, with clear source of truth, acceptance checks, stop rules, and integration checkpoints. This artifact is a restart point for the beta program, not a product implementation spec by itself.

## Source Of Truth

Workers must read these before changing project files:

- `docs/BETA_RELEASE_PLAN.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `docs/DEVELOPMENT.md`
- `docs/MVP_SCOPE.md`
- `docs/design/README.md`
- `work/model-council/forgetbase-beta-20260619/source-register.md`
- `work/model-council/forgetbase-beta-20260619/stage1/gemini-contrarian.md`
- `work/model-council/forgetbase-beta-20260619/stage1/claude-contrarian.md`

Useful grounding docs:

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`

## Non-Negotiables

- ForgetBase is an open-core, Apache 2.0, self-hostable, agent-native instruction management platform / instruction control plane.
- Public story should bridge to known categories: headless CMS for AI agents, prompt/context registry, agent context gateway, MCP-native distribution layer.
- Do not position it as generic enterprise search, a production hosted service, enterprise SSO/SCIM complete, or full managed-agent orchestration.
- The web UI is an operational surface. API, CLI, MCP, exports, and AI harnesses are primary consumers.
- Public examples must stay synthetic. Do not commit private exports, secrets, raw telemetry, customer/staff/company content, or local runtime state.
- OKF is a generated export projection from canonical ForgetBase assets, not the internal source of truth.
- Existing dirty worktree changes are not owned by workers unless their goal explicitly names them.

## Current Readiness Thesis

The repo already has substantial alpha-core backend capability. The beta blocker is visible product quality and proof:

- first-run 15-minute value path
- business-grade four-surface app IA
- first-class Distribute surface
- trust/provenance UX
- landing page with real product proof
- CI/release gates for leakage, OpenAPI drift, Compose smoke, backup/restore, and claims
- API/CLI/MCP contract checks and beta freeze

## First-Wave Lanes

| Lane | Can start now | Primary output | Blocks |
|---|---:|---|---|
| Market Validation / Competitor Gap | yes | Research memo and risk-ranked market tests | Landing claims, beta ICP confidence |
| Positioning + Landing Page | yes | Claim-safe landing copy, page structure, screenshot requirements | Landing implementation |
| Demo Spine + 15-Minute Value Path | yes | Walkthrough spec, synthetic corpus expansion plan, screenshot shot list | UI UAT, landing screenshots, Compose smoke |
| App IA + Screen Specs | yes | Read/Work/Distribute/Operate route map, screen specs, component inventory | Heavy UI implementation |
| Trust Gates Design | yes | Gate spec and implementation plan for CI/release checks | Gate implementation |
| API/CLI/MCP Contract Audit | yes | Contract freeze proposal and smoke coverage map | Beta contract implementation |
| Codebase Refactor Readiness | yes, read-only by default | App decomposition plan and low-risk migration sequence | Heavy UI implementation |

## Wait Lanes

| Lane | Wait for | Reason |
|---|---|---|
| Heavy UI implementation | App IA + Screen Specs, Demo Spine, API/CLI/MCP contract audit | Prevent building a polished shell around the wrong workflow or unstable distribution contract. |
| Landing implementation | Positioning + Landing Page and screenshot requirements | Landing page must use real product proof and claim-safe copy. |
| Gate implementation | Trust Gates Design | Avoid partially wired scripts with unclear release semantics. |
| Final beta readiness review | Implementation and gates landed | Review must evaluate actual evidence, not planned checks. |

## Dependency Order

1. Research and spec workers run in parallel: Market, Positioning, Demo Spine, App IA, Trust Gates, API/CLI/MCP, Refactor Readiness.
2. Manager synthesizes outputs into `work/beta-execution/integration-checkpoint-1.md`.
3. Manager selects implementation lanes:
   - UI foundation and Distribute MVP
   - Demo corpus/walkthrough and Compose smoke
   - Claims/OpenAPI/leakage/backup gates
   - Contract test hardening
   - Landing page
4. Implementation workers produce small, reviewable patches with verification evidence.
5. Manager runs integration checks and records `work/beta-execution/beta-readiness-status.md`.

## Integration Checkpoints

### Checkpoint 1: Spec Alignment

Required before heavy UI or landing implementation:

- No contradictions between landing claims, gaps doc, and beta plan.
- Demo spine identifies exact UI/API/CLI/MCP steps and screenshot moments.
- App IA defines Distribute as a top-level surface and names the MVP package-builder flow.
- API/CLI/MCP audit identifies current beta contract gaps and smoke tests.
- Trust gate design names script commands, CI placement, local prerequisites, failure behavior, and manual fallback.

### Checkpoint 2: Implementation Cut

Required before combining UI/gate/demo work:

- UI tasks are split by route/workflow, not by editing `App.tsx` wholesale.
- Demo corpus changes are synthetic and validated with `--fail-on-warnings`.
- Gate scripts can be run locally without leaking secrets or requiring private systems.
- Landing screenshots come from browser-rendered app state, not static mockups unless marked as mockups.

### Checkpoint 3: Beta Evidence

Required before claiming beta readiness:

- Fresh clone quickstart reaches visible governed-context value in 15 minutes.
- Browser UAT covers login, library, asset reader, search, managed query, review/diff, distribute/export, policy/provider/telemetry, and no-access states.
- API/CLI/MCP beta contract is documented and checked.
- Restricted leakage verifier passes for JSON and OKF/export surfaces.
- Typecheck, tests, build, Compose config, OpenAPI drift, claims lint, Compose smoke, backup/restore, and browser UAT pass or have explicit documented deferrals.
- Public copy avoids production-ready, hosted-service-ready, enterprise-identity-complete, full-orchestration, and broad enterprise-search claims.

## Worker Prompt 1: Market Validation / Competitor Gap

```text
/goal
Objective:
Evaluate the market and competitor risk for ForgetBase beta, especially whether git/Markdown instruction management and adjacent paid products weaken the "permissioned, audited source of truth for agent instructions" wedge. Produce a claim-safe research memo with concrete buyer-risk tests, not implementation changes.

Repo:
This repository checkout.

Source of truth:
- docs/BETA_RELEASE_PLAN.md
- docs/REMAINING_FUNCTIONAL_GAPS.md
- docs/MVP_SCOPE.md
- work/model-council/forgetbase-beta-20260619/source-register.md
- work/model-council/forgetbase-beta-20260619/stage1/gemini-contrarian.md
- work/model-council/forgetbase-beta-20260619/stage1/claude-contrarian.md

Must produce:
- work/beta-execution/market-validation-gap.md
- A competitor/category map covering at minimum git/Markdown/AGENTS.md/CLAUDE.md/llms.txt, MCP registries, Onyx, Langfuse, LangSmith, Portkey, Humanloop, Braintrust, PromptLayer, Agenta, Helicone, Glean, Rovo, Guru, Slite, Stack Internal, Dust, Copilot Studio, and Gemini Enterprise.
- A ranked list of 5-10 falsifiable beta validation questions.
- A short recommendation on the safest public category language and the biggest demand risk.
- Source links for any new live research.

Do not do:
- Do not edit product code.
- Do not invent customer evidence.
- Do not position ForgetBase as production-ready, hosted-service-ready, enterprise-search parity, or full orchestration.
- Do not use private/customer/company source material.

Done when:
- The memo distinguishes direct competitors, adjacent tools, and free alternatives.
- It explains why git/Markdown is or is not enough for the target ICP.
- It names the minimum evidence needed before heavier marketing spend.

Stop and ask if:
- You need paid/private analyst content.
- You find evidence that materially contradicts the beta plan positioning.

Verification evidence:
- List exact files read.
- List searches performed and links used.
- State whether any claims are inference versus sourced fact.
```

## Worker Prompt 2: Positioning + Landing Page

```text
/goal
Objective:
Create claim-safe ForgetBase beta positioning and landing page structure that sells proof, not vibes. The output should be ready for a later implementation worker, including copy blocks, visual requirements, metadata, and acceptance checks.

Repo:
This repository checkout.

Source of truth:
- docs/BETA_RELEASE_PLAN.md
- docs/REMAINING_FUNCTIONAL_GAPS.md
- docs/MVP_SCOPE.md
- docs/design/README.md
- work/model-council/forgetbase-beta-20260619/source-register.md
- work/model-council/forgetbase-beta-20260619/stage1/gemini-contrarian.md
- work/model-council/forgetbase-beta-20260619/stage1/claude-contrarian.md

Must produce:
- work/beta-execution/positioning-landing-spec.md
- Primary positioning statement, tagline options, short/medium/long product descriptions.
- Landing page section-by-section copy skeleton.
- Hero screenshot/composed-product-scene requirements tied to actual app/demo states.
- Claims allowlist and claims blocklist for public copy.
- SEO title/meta description and social-card text.

Do not do:
- Do not implement the landing page.
- Do not use abstract AI-gradient visuals as the primary proof.
- Do not claim production readiness, hosted-service maturity, SCIM/enterprise SSO completion, full managed-agent orchestration, complete observability, or broad enterprise-search parity.
- Do not change docs outside the requested output unless you first identify a small correction and explain it.

Done when:
- The first viewport shows the product and the agent-consumer path.
- The copy explains the git/Markdown failure mode without insulting users who still prefer git.
- Every public claim can be traced to the source docs or is clearly marked as a beta ambition.

Stop and ask if:
- You need a brand direction decision not already present in docs/design.
- You find the name ForgetBase unusable for the proposed story.

Verification evidence:
- List files read.
- Include a final "claim safety check" table mapping risky phrases to safer alternatives.
```

## Worker Prompt 3: Demo Spine + 15-Minute Value Path

```text
/goal
Objective:
Design the beta demo spine that gets a fresh user to visible governed-context value in 15 minutes, ending in both product UI evidence and a downstream API/CLI/MCP/OKF consumer fetch. Produce a walkthrough and synthetic corpus expansion plan; implement only if the needed changes are narrow and clearly scoped.

Repo:
This repository checkout.

Source of truth:
- docs/BETA_RELEASE_PLAN.md
- docs/DEVELOPMENT.md
- docs/MVP_SCOPE.md
- docs/REMAINING_FUNCTIONAL_GAPS.md
- corpus/demo/assets.json
- corpus/demo/evals.json

Must produce:
- work/beta-execution/demo-spine-15-minute-path.md
- Exact walkthrough steps from fresh clone through Compose, bootstrap/login, import/create, review/publish, search, MCP/API/CLI fetch, OKF/JSON export, restricted-block proof, telemetry/audit read-back.
- Synthetic corpus gap analysis covering public-demo, internal, restricted, policy, skill/playbook, eval, export-eligible, and export-blocked examples.
- Screenshot shot list for landing page and browser UAT.
- Candidate commands for future `smoke:compose` and `test:uat`.

Do not do:
- Do not import private or customer content.
- Do not print or persist raw secrets.
- Do not silently loosen auth or permission checks for demo convenience.
- Do not make broad UI changes.

Done when:
- A later implementer can follow the walkthrough and know exactly what evidence to capture.
- Corpus changes needed for the full story are listed as minimal synthetic additions.
- Restricted leakage proof is part of the path, not an optional appendix.

Stop and ask if:
- The current demo corpus cannot support the story without a large rewrite.
- A needed command requires real provider credentials or external identity credentials.

Verification evidence:
- List exact commands you ran, or state that this pass was spec-only.
- If you inspect the app/browser, include the URL and screenshot paths.
```

## Worker Prompt 4: App IA + Screen Specs

```text
/goal
Objective:
Specify the business-grade ForgetBase app IA and beta-critical screens before heavy UI implementation. Focus on Read, Work, Distribute, Operate; trust/provenance UX; and the package builder. Produce screen specs and a component inventory aligned with the existing design package and React app.

Repo:
This repository checkout.

Source of truth:
- docs/BETA_RELEASE_PLAN.md
- docs/design/README.md
- docs/REMAINING_FUNCTIONAL_GAPS.md
- docs/MVP_SCOPE.md
- apps/web/src/App.tsx
- apps/web/src/styles.css
- apps/web/src/components/
- docs/design/forgetbase-design-system/index.html
- docs/design/forgetbase-main-page-mockups/index.html

Must produce:
- work/beta-execution/app-ia-screen-specs.md
- Route map for Read, Work, Distribute, Operate.
- Screen specs for command/search, asset reader with trust rail, review/version diff, distribution package builder, trust console, first-run/empty/restricted/error states.
- Component inventory using existing local primitives first, shadcn core second, ReUI only where justified.
- Data/API needs and acceptance checks per screen.
- Accessibility and mobile requirements for beta.

Do not do:
- Do not implement the heavy UI.
- Do not bulk install shadcn/ReUI components.
- Do not replace app architecture wholesale.
- Do not add leaf icons to sub-page nav by default; current design rule is iconless leaves unless explicitly configured.

Done when:
- Distribute is a top-level surface with an MVP package-builder flow.
- Trust/provenance is a composite, progressive-disclosure model rather than a wall of badges.
- The spec identifies which existing UI surfaces can be reused and which need new route modules.

Stop and ask if:
- Existing dirty work in `apps/web` makes the current UI state ambiguous enough that implementation would be risky.
- The spec needs a product decision about which beta workflow wins over another.

Verification evidence:
- List files inspected.
- Include a route/screen acceptance matrix.
- Note any mismatch between design docs and live app.
```

## Worker Prompt 5: Trust Gates Design

```text
/goal
Objective:
Design the beta trust and release gates: restricted leakage CI, OpenAPI drift, claims linter, Compose smoke, backup/restore gate, and secure-default auth decision. Produce an implementation-ready gate plan with failure behavior and acceptance checks.

Repo:
This repository checkout.

Source of truth:
- docs/BETA_RELEASE_PLAN.md
- docs/REMAINING_FUNCTIONAL_GAPS.md
- docs/DEVELOPMENT.md
- docs/MVP_SCOPE.md
- .github/workflows/
- package.json
- compose.yaml
- compose.same-origin.yaml
- compose.tls.yaml

Must produce:
- work/beta-execution/trust-gates-design.md
- Gate matrix with command name, purpose, owner, local prerequisites, CI/release placement, expected runtime, failure behavior, and manual fallback.
- Secure-default `requireAuthentication` decision brief with options and recommendation.
- Claims linter rule proposal covering public copy and risky phrases.
- OpenAPI drift strategy with a minimal path now and a stronger generated-contract path later.
- Compose smoke scope that proves more than one search request and validates same-origin health.

Do not do:
- Do not wire CI or scripts unless the change is tiny and obviously correct.
- Do not add dependencies without health-checking them and explaining why the repo needs them.
- Do not make public claims stricter or looser than `docs/REMAINING_FUNCTIONAL_GAPS.md` allows.
- Do not require real provider/OIDC credentials for default CI.

Done when:
- A later implementer knows exactly which scripts/checks to add and what evidence they should produce.
- The plan separates default CI gates from manual/secret-gated release gates.
- It identifies any checks that are currently impossible or too slow for CI.

Stop and ask if:
- The auth default decision has product/security tradeoffs the manager must approve.
- A gate would require external paid services or secrets.

Verification evidence:
- List files read.
- Include proposed commands and where each command should run.
- Include explicit deferred/manual gates.
```

## Worker Prompt 6: API/CLI/MCP Contract Audit

```text
/goal
Objective:
Audit the current machine-consumer surfaces for beta readiness and propose a contract freeze/check strategy for API, CLI, MCP, SDK/export, OpenAPI, and OKF/JSON packages.

Repo:
This repository checkout.

Source of truth:
- docs/BETA_RELEASE_PLAN.md
- docs/DEVELOPMENT.md
- docs/MVP_SCOPE.md
- docs/REMAINING_FUNCTIONAL_GAPS.md
- docs/OKF_EXPORTS.md
- apps/api/src/server.ts
- packages/cli/src/
- packages/mcp-server/src/
- packages/sdk/src/
- packages/schema/src/

Must produce:
- work/beta-execution/api-cli-mcp-contract-audit.md
- Inventory of beta-critical API routes, CLI commands, MCP tools, SDK/export shapes, OpenAPI paths, and OKF/JSON package fields.
- Gap analysis for drift, missing tests, naming instability, and compatibility risk.
- Proposed beta contract freeze document outline.
- Smoke/contract test plan for the canonical beta value path.

Do not do:
- Do not rename routes, commands, packages, or tools.
- Do not change schemas unless a tiny obvious typo is blocking audit.
- Do not treat OKF as canonical storage; it is an export projection.
- Do not claim stable API compatibility until checks exist.

Done when:
- The audit names which surfaces are beta-critical versus long-tail.
- It identifies the minimum tests needed before a beta freeze.
- It flags any public docs that already overstate contract stability.

Stop and ask if:
- You find a contract mismatch that would break current demo or public docs.
- You need to choose between incompatible API/CLI/MCP naming conventions.

Verification evidence:
- List files inspected.
- Include exact existing tests/scripts found.
- State which checks were run or why this was read-only.
```

## Worker Prompt 7: Codebase Refactor Readiness

```text
/goal
Objective:
Prepare a low-risk refactor readiness plan for the current web app, especially decomposing `apps/web/src/App.tsx` and introducing route modules/hooks needed for beta UI work. This is a planning/audit lane, not a broad refactor.

Repo:
This repository checkout.

Source of truth:
- docs/BETA_RELEASE_PLAN.md
- docs/design/README.md
- docs/REMAINING_FUNCTIONAL_GAPS.md
- apps/web/src/App.tsx
- apps/web/src/styles.css
- apps/web/src/components/
- apps/web/package.json
- apps/web/vite.config.ts

Must produce:
- work/beta-execution/codebase-refactor-readiness.md
- Current `App.tsx` responsibility map.
- Proposed extraction order with small PR-sized steps.
- Shared hook/module candidates and risk notes.
- Test strategy for preserving behavior during refactor.
- Boundaries for what should wait until App IA and Demo Spine outputs exist.

Do not do:
- Do not perform the broad decomposition in this lane.
- Do not rewrite styling or introduce a new design system.
- Do not revert or overwrite dirty worktree changes.
- Do not bulk install components.

Done when:
- A later UI worker can start with a narrow first extraction and know the rollback path.
- The plan identifies high-risk state/data coupling and browser-auth constraints.
- It protects public-reader gating and permission-aware UI behavior.

Stop and ask if:
- The current app has uncommitted changes that make ownership unclear for files you would need to touch.
- You find a bug that should be fixed before any refactor begins.

Verification evidence:
- List files inspected.
- Include metrics you used, such as line count, hook count, major state groups, or route branches.
- State whether any tests were run.
```

## Manager Review Checklist For Worker Outputs

- Output file exists under `work/beta-execution/`.
- Worker lists files read and any commands run.
- Worker output separates fact, inference, recommendation, and open questions.
- Worker respects public content boundary and claim boundaries.
- Worker does not modify broad code unless its prompt explicitly allowed a tiny unblocker.
- Worker identifies dependencies for downstream implementation lanes.

## Next Safe Action

Create or dispatch the first-wave worker threads with the prompts above. Once the first outputs return, synthesize them into `work/beta-execution/integration-checkpoint-1.md` before approving heavy implementation.
