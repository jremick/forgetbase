# ForgetBase Beta Release Plan

Status: planning artifact
Last updated: 2026-06-19
Audience: product, design, engineering, and release planning

## Executive Decision

ForgetBase should ship beta as a self-hostable, agent-native source of truth for governed instructions and context packages. The most marketable wedge is not "AI knowledge base" or broad enterprise search. It is:

> A permissioned, audited source of truth for the instructions your agents run on.

Use "instruction control plane" as the internal category, but bridge the public story through categories buyers already understand:

- Headless CMS for AI agents.
- Prompt and context registry.
- Agent context gateway.
- MCP-native instruction distribution layer.

The immediate beta blocker is not backend feature count. The repo already has substantial alpha-core capability. The blocker is that the product does not yet make the value obvious, lovable, safe-looking, and verifiable in the first 15 minutes. Beta should therefore be scoped around visible product quality, proof-driven onboarding, distribution UX, secure defaults, and claim enforcement.

## Method And Evidence

This plan synthesizes:

- Local repo grounding: `README.md`, `docs/END_TO_END_GOAL.md`, `docs/TECHNICAL_SPEC.md`, `docs/DECISIONS.md`, `docs/MVP_SCOPE.md`, `docs/DEVELOPMENT.md`, `docs/REMAINING_FUNCTIONAL_GAPS.md`, `docs/ROADMAP.md`, `docs/design/README.md`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`, and API/security surfaces.
- Web research source pack: analyst, UX, security, standards, and vendor sources recorded in `work/model-council/forgetbase-beta-20260619/source-register.md`.
- Three Codex subagent passes: market/value synthesis, UI/UX best-practice research, and codebase trace.
- Gemini CLI contrarian pass: `work/model-council/forgetbase-beta-20260619/stage1/gemini-contrarian.md`.
- Claude Code contrarian pass: `work/model-council/forgetbase-beta-20260619/stage1/claude-contrarian.md`.

The strict gateway-backed model-council route was not fully available because the local model gateway route lacked usable auth in this session. The council still used the two explicit delegate routes requested: Gemini CLI and Claude Code delegate, plus the parent Codex synthesis and subagents.

## Market Verdict

The market timing is real, but buyers are skeptical. AI adoption and agent experiments are widespread, while governance, trust, cost, and unclear business value are major blockers. Gartner warns many agentic AI projects will be cancelled because value and risk controls are not clear. McKinsey and Deloitte report broad AI adoption but still-immature governance, trust, and agent controls.

That creates a credible opening for ForgetBase, but only if the product is framed around a concrete failure mode:

> Teams have scattered agent instructions across git repos, prompt snippets, wiki pages, tools, exports, and local harnesses. They cannot reliably prove what an agent was allowed to know, which version it used, whether restricted context leaked, or whether a change was reviewed before it reached MCP/API/CLI consumers.

If that pain is not named, ForgetBase looks like a nicer database around Markdown files. That is not enough.

## Positioning

### Primary Positioning

ForgetBase is the governed instruction and context registry for AI agents.

It gives teams one self-hostable place to version, permission, review, test, and distribute the instructions, policies, playbooks, skills, SOPs, eval cases, and reusable context packages their agents rely on.

### Public Tagline Candidates

Use claims that the product can prove:

- "A permissioned, audited source of truth for the instructions your agents run on."
- "Governed instructions for AI agents, self-hosted."
- "Version, permission, and distribute the context your agents depend on."
- "Replace scattered prompt files with reviewed, permission-aware agent context."

Avoid these as primary claims until stronger evidence exists:

- "Enterprise search."
- "AI knowledge base."
- "Full agent orchestration."
- "Production-ready agent control plane."
- "Complete observability."
- "LLM-judged evaluation platform."

### ICP

Primary:

- AI platform and enablement teams that support multiple internal agent surfaces.
- Developer productivity and platform teams responsible for agent harnesses, MCP servers, CLI workflows, or internal assistants.
- Security-sensitive teams that need self-hosting, auditability, permission-aware retrieval, and leakage checks.
- Consultancies and systems integrators building repeatable agent stacks for clients.

Secondary:

- AI-heavy SMBs that have outgrown prompt files and wiki pages.
- Open-source/self-hosting power users who value Docker Compose, Apache 2.0, and transparent boundaries.

Not the beta ICP:

- Generic knowledge-base buyers.
- General employee intranet/search buyers.
- Microsoft-only or Atlassian-only organizations that already accept suite-native agents.
- Nontechnical content teams that primarily need a human wiki.
- Pure LLMOps buyers looking first for traces, model observability, and prompt experiments.

## Competitive Frame

Do not compete head-on against Glean, Rovo, Notion, Guru, Slite, Writer, Microsoft Copilot Studio, Google Gemini Enterprise, Dust, or Onyx as a generic "read everything" enterprise search product. Those products own connector volume, broad search, and suite distribution.

ForgetBase should differentiate on:

- Agent-first assets, not human wiki pages retrofitted for agents.
- API/CLI/MCP delivery as first-class product surfaces.
- Permission-aware retrieval and export eligibility.
- Reviewable version lifecycle and restore/diff workflows.
- Deterministic leakage and validation checks.
- Self-hostable Apache 2.0 core.
- Explicit public boundary on what is and is not beta-ready.

The most dangerous alternatives are not only large vendor products. They are also cheap or free workflows:

- `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `llms.txt`, local prompt files, and git review.
- MCP registries and client-local tool definitions.
- LLMOps/prompt-management tools such as LangSmith, Langfuse, Portkey, Humanloop, Braintrust, PromptLayer, Agenta, and Helicone.
- Open-source AI search/agent platforms such as Onyx.

The beta story must explain why git/Markdown is no longer enough: permissions, leakage checks, auditability across consumers, MCP/API distribution, and visible lifecycle state.

## Product Promise

Beta should prove this end-to-end:

1. A team can create or import a governed instruction asset.
2. The asset has owner, lifecycle, sensitivity, review state, allowed surfaces, and version history.
3. Another user can review a diff and approve it.
4. API/CLI/MCP consumers retrieve only the approved, permission-eligible state.
5. Restricted content does not leak into unauthorized retrieval or exports.
6. The UI shows why a result is trusted, current, and allowed.
7. The landing page demonstrates the same path with real screenshots and copy that does not overclaim.

## App UX Target

The current UI should be treated as an alpha operator console. It has useful surfaces, but the implementation is not beta-grade: `App.tsx` is still a very large monolithic component with many local states, and the product's differentiating distribution and trust capabilities are hard to perceive.

Beta UX should feel like a quiet operational console for technical teams, not a consumer wiki and not a decorative AI dashboard.

### Information Architecture

Use four primary surfaces:

1. Read
   - Library
   - Asset reader
   - Search
   - Managed query
   - Public/demo reader where allowed

2. Work
   - Review queue
   - Version diff
   - Draft/update workflow
   - Publish and restore
   - Bulk triage

3. Distribute
   - MCP setup
   - CLI commands
   - API keys and scoped consumers
   - OKF and JSON export packages
   - Package preview
   - Export history and hashes
   - Consumer-specific eligibility

4. Operate
   - Access
   - Policies
   - Providers
   - Telemetry
   - Redaction and retention
   - Evals and leakage checks
   - Action approvals
   - Backup/restore and health state

The key correction: Distribute must become a first-class surface. It is the clearest difference between ForgetBase and a wiki.

### Core Screens

#### Command And Search

- Global command/search input in the app shell.
- Search filters for asset type, lifecycle, sensitivity, surface eligibility, owner, and freshness.
- Results should show title, asset kind, lifecycle, source/version, trust state, and why the current principal can or cannot use the item.
- Managed-query results should separate answer, cited evidence, denied/restricted evidence, and diagnostics.

#### Asset Reader

Use a split-pane layout:

- Left: navigation, related assets, search results, or collection tree.
- Center: asset content, structured sections, rendered instruction object, and linked human-readable page.
- Right: trust/provenance rail.

The right rail should include:

- Lifecycle and publish status.
- Sensitivity and permission reason.
- Owner/reviewer and review due date.
- Last approved version and current draft state.
- Source version/hash.
- Allowed consumers and export eligibility.
- Last leakage check.
- Last validation/eval result.
- Recent retrieval/export events.

Do not show eight separate green badges by default. Use one composite trust-state indicator, with progressive disclosure.

#### Review And Version Diff

- Code-review style diff for instruction fields, policy changes, and human-readable pages.
- Clear actions: approve, request changes, publish, restore, archive.
- Before publish, show checks that will gate release: metadata validation, restricted leakage, required evals, export eligibility, and affected consumers.

#### Distribution Package Builder

This is beta-critical.

Flow:

1. Select consumer: MCP client, CLI, API key, OKF export, JSON package, or demo bundle.
2. Select scope: assets, collections, lifecycle state, sensitivity band, tenant/group/principal.
3. Preview exact payload and omitted/restricted items.
4. Run required leakage/eligibility checks.
5. Generate install command/config snippet.
6. Save export package with hash, version, creator, and consumer.
7. Show retrieval/export history.

Acceptance:

- A user can create a scoped MCP/API/OKF package without leaving the UI.
- The UI displays what is included, what is excluded, and why.
- A downstream agent can retrieve the approved package or asset through the documented route.

#### Trust Console

This should not be a raw admin dump. It should answer:

- Are restricted assets leaking?
- Which instructions are stale or unreviewed?
- Which exports are active?
- Which consumers used which versions?
- Which evals or validators are blocking publish?
- Are provider, redaction, retention, and cache settings healthy?

### Visual Direction

- Restraint, density, and trust over spectacle.
- Use real product screenshots and command/config snippets.
- Make diff/version and trust-state the signature visual language.
- Avoid one-note blue SaaS styling. Keep the Quiet Control Plane direction, but add domain-specific contrast through status states, mono/code panels, lifecycle markers, and structured preview panes.
- Keep cards for repeated items and modals only. Avoid card-in-card dashboards.
- Make empty, loading, no-access, restricted, and error states feel intentional.
- Meet WCAG AA contrast. Fix the success/good-state badge contrast before beta.
- Add `prefers-reduced-motion`, mobile navigation polish, and explicit dark-mode decision if the tokens imply dark mode.

## Landing Page Spec

The landing page should sell proof, not vibes.

### Above The Fold

Headline:

> Governed instructions for AI agents, self-hosted.

Subhead:

> ForgetBase gives teams a permissioned, audited source of truth for the prompts, policies, playbooks, skills, SOPs, and context packages their agents retrieve through API, CLI, MCP, and exports.

Primary CTA:

- "Run locally"

Secondary CTA:

- "View demo"

Hero visual:

- Real product screenshot or composed product scene.
- Left: asset review/diff or trust rail.
- Right: MCP/CLI/API consumer fetching the approved instruction.
- Include a small leakage/permission check result, not a generic metrics dashboard.

### Page Sections

1. Problem
   - "Your agent instructions are scattered across repos, wikis, prompts, and local tool configs."
   - Name the incumbent: git/Markdown is good until permissions, exports, audit, and many consumers become hard.

2. Core workflow
   - Create/import a governed asset.
   - Review and approve a version.
   - Run validation/leakage checks.
   - Distribute through MCP/API/CLI/OKF.
   - Observe retrieval/export evidence.

3. Trust model
   - Permission-aware retrieval.
   - Citation/provenance.
   - Lifecycle/review state.
   - Redaction-before-telemetry.
   - Restricted export leakage tests.
   - Disabled-by-default action governance.

4. Built for agents and teams
   - Agent-first assets.
   - Human-readable pages as a linked surface.
   - APIs and MCP as primary consumers.
   - Web UI as operational surface.

5. Self-hosted open core
   - Apache 2.0 core.
   - Docker Compose quickstart.
   - Synthetic demo corpus.
   - Clear beta boundaries.

6. Scope boundary
   - Not a production hosted service yet.
   - Not enterprise SSO/SCIM complete yet.
   - Not full managed-agent orchestration.
   - API/MCP routes freeze at beta gate.

### Landing Acceptance Checks

- First viewport shows the product, not an abstract gradient or generic AI visual.
- Claims match `docs/REMAINING_FUNCTIONAL_GAPS.md`.
- Mobile and desktop screenshots pass visual review.
- Page includes a concrete local quickstart and a real demo path.
- SEO metadata and social cards describe the product without overclaiming.

## Release Plan

### Phase A: Alpha Exit Gates And Claims Enforcement

Goal: make the existing honesty discipline enforceable.

Build:

- Add deterministic CI gates for strict demo corpus validation, static Compose config parsing, OpenAPI drift, public-copy claims, and focused API/CLI/SDK/MCP contract checks.
- Keep restricted leakage verification as a release gate until CI starts and stops an isolated built API against a disposable database.
- Keep Docker Compose runtime smoke as a release gate until CI owns an isolated stack lifecycle with port isolation, evidence capture, and cleanup.
- Add a public-copy claims linter with allowlisted terms.
- Add backup/restore verification to tag/release workflow or document why it remains manual.
- Add the contextual secure-default deployment check for public/proxy exposure without breaking local Compose bootstrap.

Acceptance:

- CI passes strict demo corpus validation, base/same-origin/TLS Compose config parsing, OpenAPI drift, claims lint, focused beta contracts, typecheck, test, and build.
- `security:verify-restricted-leakage` runs as a release gate until it has an isolated CI wrapper.
- `smoke:compose` proves the running API/export/leakage path as a release gate until it has an isolated CI stack.
- OpenAPI drift fails when server routes change without docs/schema update.
- Claims linter blocks unapproved "production-ready", "hosted", "SCIM", "enterprise SSO", "full orchestration", and unqualified "control plane" claims in public copy.
- `security:check-deployment-defaults` passes in local template mode and fails public-deployment checks that omit required auth, secure cookies, approved HTTPS origins, proxy entrypoint, or private direct service binds.

### Phase B: Proof-Driven Demo Spine

Goal: make the 15-minute value path real.

Build:

- Expand synthetic corpus beyond the current toy shape to exercise:
  - public-demo content,
  - internal content,
  - restricted content,
  - policy asset,
  - skill/playbook asset,
  - eval cases,
  - export-eligible and export-blocked examples.
- Add a scripted walkthrough:
  - start Compose,
  - create/login,
  - create or import governed instruction,
  - review/publish,
  - search,
  - MCP/API/CLI fetch,
  - OKF/JSON export,
  - restricted-block proof,
  - telemetry/audit read-back.
- Replace ad hoc key extraction in onboarding with a first-class flow or helper command.

Acceptance:

- Fresh clone can reach visible governed-context value in 15 minutes.
- Demo ends in product UI and a downstream consumer fetch, not raw JSON only.
- Restricted asset leakage check passes during the walkthrough.
- The walkthrough produces screenshots suitable for the landing page.

### Phase C: Business-Grade App UI

Goal: make the existing backend value visible and usable.

Build:

- Split `apps/web/src/App.tsx` into route modules and shared hooks.
- Normalize UI primitives: button, badge, input, select, tabs, table/list, modal, drawer, toast, tooltip, copy button, command bar, status indicator, code block, diff view.
- Build real four-surface IA: Read, Work, Distribute, Operate.
- Add global command/search.
- Build asset reader split pane and trust rail.
- Build review/diff workflow.
- Build distribution package builder.
- Build first-run, empty, restricted, loading, and error states.
- Fix contrast and accessibility issues.
- Add Playwright UAT for the canonical demo path.

Acceptance:

- No critical beta route depends on the old operations dump as the primary UX.
- Distribute is visible in top-level IA and has a usable package-builder path.
- Playwright can complete the canonical walkthrough through the browser.
- Screenshots show a credible business-grade console on desktop and mobile.
- UI copy uses product language from this plan.

### Phase D: Real-Provider And Contract Proof

Goal: prove that machine consumers can depend on beta interfaces.

Build:

- Secret-gated smoke test for at least one real provider route.
- Contract freeze for beta API routes, CLI commands, MCP tool names, and export package shapes.
- Versioned OpenAPI artifact and CLI/MCP compatibility checks.
- Document supported and unsupported provider behavior.
- Add migration notes for expected breaking changes after beta.

Acceptance:

- One real-provider managed-query or eval path is recorded as passing in a controlled CI/manual release gate.
- API/CLI/MCP beta contract is documented.
- OpenAPI drift remains green.
- CLI and MCP smoke tests cover the beta value path.

### Phase E: Self-Hosted Beta Hardening

Goal: make beta credible for synthetic and cautious real-team trials.

Build:

- Secure default review and first-run warnings.
- Backup/restore release gate.
- API key rotation path and documentation.
- Telemetry retention/redaction read-back.
- Export persistence decision: object storage, database persistence, or explicit ephemeral boundary.
- Docker Compose hardening and same-origin/TLS config validation.
- Public beta checklist.

Acceptance:

- `docker compose config --quiet` passes for canonical configs.
- Backup/restore verification passes on tag or release gate.
- API key rotation is documented and tested.
- Telemetry/redaction/retention behavior can be inspected from UI or CLI.
- Export artifact persistence boundary is explicit.
- Public README and landing page stay within beta claims.

## Beta Exit Criteria

Beta can be claimed only when these are true:

- Fresh clone quickstart reaches visible value in 15 minutes.
- The synthetic corpus tells the full story: permissions, review, retrieval, export, leakage, telemetry.
- Browser UAT covers login, library, asset reader, search, managed query, review/diff, distribute/export, policy/provider/telemetry views, and no-access states.
- API/CLI/MCP beta contract is documented in `docs/BETA_PRIVATE_CONTRACT.md` and checked.
- Restricted leakage verifier passes for JSON and OKF/export surfaces.
- CI/static gates pass: typecheck, build, strict demo corpus validation, static Compose config parsing, OpenAPI drift, claims lint, focused beta contracts, and tests.
- Release/manual gates pass or are explicitly deferred with owner approval: restricted leakage, `smoke:compose`, backup/restore, browser UAT, fake-provider OIDC, and any secret-gated real-provider smoke.
- No private data, secrets, raw telemetry, or private source exports are present.
- Public copy does not claim production readiness, hosted-service maturity, full enterprise identity, full orchestration, or broad enterprise-search parity.

## Verification Commands

Baseline local checks:

```bash
npx -y pnpm@11.7.0 install
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 build
docker compose config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
```

Product-specific checks:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
```

New beta gates to add:

```bash
npx -y pnpm@11.7.0 openapi:check
npx -y pnpm@11.7.0 smoke:compose
npx -y pnpm@11.7.0 claims:lint
npx -y pnpm@11.7.0 test:uat
```

Names for the new scripts can change, but the gates should not stay informal.

## Priority Backlog

### P0: Must Happen Before Beta Claim

- CI gate for restricted leakage verification.
- Compose smoke script that runs the full demo spine.
- OpenAPI drift check.
- Claims linter for public copy.
- Secure-default decision for authentication.
- App IA with visible Distribute surface.
- Distribution package builder MVP.
- First-run guided path.
- Browser UAT for canonical walkthrough.
- Landing page with real screenshots and constrained claims.

### P1: Strong Beta Quality

- App decomposition and shared data hooks.
- Trust rail and composite trust-state indicator.
- Review/diff polish.
- API/CLI/MCP contract freeze.
- Real-provider smoke gate.
- Export persistence decision.
- Backup/restore release gate.
- Accessibility pass.

### P2: Useful But Not Beta-Blocking

- Richer dashboarding.
- Multi-provider comparison.
- Advanced analytics.
- Hosted service path.
- Enterprise OIDC/SCIM.
- Full managed-agent orchestration.
- Kubernetes deployment path.

## Risks And Open Questions

- Demand is still the existential unknown. The research pack has analyst and vendor evidence, but not enough primary evidence that the target ICP will pay for this instead of using git/Markdown.
- Open-core boundary is still undefined. The self-hosted core must feel trustworthy before any paid boundary is introduced.
- "ForgetBase" may fight the retention/source-of-truth value prop. The name can still work, but landing copy must immediately explain the product.
- Real-provider validation is not yet a strong public claim until it is recorded in a release gate.
- Export persistence is a material architecture/product decision. Ephemeral exports are acceptable only if clearly documented.
- If the UI polish work is treated as a thin skin over the monolith, beta will still feel alpha-grade.

## Source Links

- Gartner: https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027
- McKinsey State of AI: https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai
- McKinsey State of AI Trust: https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/tech-forward/state-of-ai-trust-in-2026-shifting-to-the-agentic-era
- Deloitte agentic AI guardrails: https://www.deloitte.com/us/en/insights/topics/emerging-technologies/ai-agents-scaling-faster.html
- Menlo Ventures enterprise AI: https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/
- Glean: https://www.glean.com/
- Atlassian Rovo: https://www.atlassian.com/software/rovo
- Google Gemini Enterprise docs: https://docs.cloud.google.com/gemini/enterprise/docs
- Microsoft Copilot Studio SharePoint knowledge: https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-add-sharepoint
- Guru: https://www.getguru.com/
- Stack Internal: https://stackoverflow.co/internal/
- Onyx: https://onyx.app/
- MCP docs: https://modelcontextprotocol.io/docs/getting-started/intro
- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- NIST AI RMF Generative AI Profile: https://www.nist.gov/publications/artificial-intelligence-ris%6B-management-framework-generative-artificial-intelligence
- Nielsen Norman Group Explainable AI: https://www.nngroup.com/articles/explainable-ai/
