# ForgetBase Positioning And Landing Spec

Status: implementation handoff
Last updated: 2026-06-19
Owner: positioning worker
Intended consumer: later landing-page implementation worker

## Purpose

Create a claim-safe beta landing page for ForgetBase that sells product proof, not generic AI mood. The page must show the product, the agent-consumer path, and the governed-context failure mode that appears when teams outgrow scattered git, Markdown, prompt snippets, wiki pages, and local tool configs.

This is a spec only. It does not implement the landing page.

## Source Boundary

Public copy may use factual claims already supported by the current repo docs, with careful beta framing. Claims that describe the intended beta experience but are not yet fully implemented or gated must be labeled as beta ambitions in implementation notes and avoided as unqualified public claims.

Use these claim labels while implementing:

| Label | Meaning | Public-copy treatment |
|---|---|---|
| `supported` | Current repo docs describe the capability as implemented or included in MVP scope. | Can be used plainly if not overstated. |
| `beta-proof-required` | The beta plan says this must be proven before beta readiness. | Use as a section promise only when attached to a demo path or "beta is proving" language. |
| `deferred` | Gaps docs explicitly say this is not complete. | Do not claim. Use only in scope-boundary copy. |
| `ambition` | Desired future direction without current proof. | Keep out of hero and primary claims. |

## Primary Positioning

ForgetBase is a self-hostable instruction and context registry for AI agents.

It gives AI platform teams one governed place to version, permission, review, validate, and distribute the prompts, policies, playbooks, skills, SOPs, eval cases, and context packages their agents retrieve through API, CLI, MCP, and export packages.

Shorter public statement:

> ForgetBase is a permissioned, audited source of truth for the instructions your agents run on.

Category bridge:

- Use "governed instructions for AI agents" as the page-level plain-English category.
- Use "instruction control plane" in technical sections and metadata where context exists.
- Bridge to known categories with "headless CMS for AI agents", "prompt and context registry", "agent context gateway", and "MCP-native instruction distribution layer".
- Do not lead with "AI knowledge base" or "enterprise search".

## Tagline Options

Preferred:

1. Governed instructions for AI agents, self-hosted.
2. Version, permission, and distribute the context your agents depend on.
3. A permissioned source of truth for agent instructions.

Secondary:

4. Replace scattered prompt files with reviewed, permission-aware agent context.
5. Ship agent context through API, CLI, MCP, and exports.
6. Keep agent instructions reviewable before they run.

Avoid as taglines:

- Enterprise search for AI.
- Production-ready agent control plane.
- Complete agent observability.
- Full orchestration for every agent.
- Hosted AI knowledge platform.

## Product Descriptions

### Short

ForgetBase is a self-hostable registry for governed agent instructions, policies, playbooks, and context packages.

### Medium

ForgetBase gives AI teams one governed source of truth for the instructions their agents use. Version assets, review changes, enforce permission-aware retrieval, and distribute approved context through API, CLI, MCP, JSON, and OKF export packages.

### Long

ForgetBase is an open-core, self-hostable instruction control plane for agentic systems. It manages prompts, policies, guardrails, tool guidance, playbooks, SOPs, reusable skills, eval cases, and human-readable pages as governed assets with stable IDs, lifecycle state, sensitivity, review metadata, version history, allowed surfaces, citations, and permission-aware retrieval. The web UI is an operational surface for review, debugging, and fallback reading; API, CLI, MCP, and export packages are first-class consumers.

## Respectful Git/Markdown Problem Framing

Use this framing:

> Git and Markdown are still excellent authoring and review tools. The failure starts when those files become runtime infrastructure: multiple agents, MCP clients, CLIs, exports, and local harnesses need the same reviewed instruction, but each consumer has a different copy, permission boundary, version, and audit trail.

Then explain the delta:

- Git proves file history, not whether a particular agent was allowed to retrieve a section.
- Markdown is easy to write, but it does not enforce export eligibility, restricted-content filtering, or consumer-specific delivery.
- Local prompt files work for one operator, but they do not show who approved a change before it reached API, CLI, MCP, or an export package.
- ForgetBase should complement git workflows where teams still want file-based authoring; the product value is governed retrieval and distribution, not insulting the source format.

Do not use language like "stop using Markdown", "git is broken", "wikis are obsolete", or "your docs are chaos".

## Landing Page Structure

### 1. First Viewport: Product Proof

Eyebrow:

> Self-hostable beta core

Headline:

> Governed instructions for AI agents, self-hosted.

Subhead:

> ForgetBase gives teams a permissioned source of truth for the prompts, policies, playbooks, skills, SOPs, eval cases, and context packages their agents retrieve through API, CLI, MCP, JSON, and OKF exports.

Primary CTA:

> Run locally

Secondary CTA:

> View the demo path

Trust strip copy:

- Apache 2.0 core
- Docker Compose quickstart
- API, CLI, MCP, and export surfaces
- Synthetic demo corpus

Hero visual requirement:

- Show a real browser-rendered app state or composed product scene using real app/demo UI, not an abstract illustration.
- Left side: asset reader or review/diff screen for an approved agent instruction with lifecycle, sensitivity, review state, source/version, and allowed surfaces visible.
- Right side: terminal or code panel showing an MCP, CLI, API, or export consumer fetching the approved instruction.
- Bottom or inline proof: restricted or omitted item state, such as "restricted asset excluded from public export" or "permission-filtered results returned".
- The scene must make the agent-consumer path obvious in the first viewport without requiring explanatory body text.

Implementation note:

- If the final Distribute route is not available yet, use the current browser-rendered export summary, asset detail, search results, or review/version UI plus a real CLI/API/export command panel. Label screenshots honestly if any state is staged from the synthetic demo.

### 2. Problem: When Instructions Become Runtime Infrastructure

Section headline:

> Agent instructions are moving faster than the places teams store them.

Body copy:

> Teams start with Markdown files, wiki pages, prompt snippets, and local tool configs because they are fast and familiar. That works until agents, MCP clients, CLIs, exports, and internal assistants all need the same context with different permissions, review states, and delivery formats.

Proof bullets:

- Which version did the agent retrieve?
- Was restricted context filtered before export?
- Was the instruction approved before it reached MCP or the CLI?
- Can an operator explain why a result was allowed, denied, or omitted?

### 3. Workflow: Govern, Review, Distribute

Section headline:

> One governed path from draft to agent consumer.

Step copy:

1. Create or import a governed asset with stable ID, owner, lifecycle, sensitivity, review date, source, and allowed surfaces.
2. Review a version diff and publish only the state that should reach downstream consumers.
3. Validate metadata, stale-review state, links, search eligibility, and restricted export behavior.
4. Retrieve or package the approved state through API, CLI, MCP, JSON, or OKF.
5. Inspect citations, retrieval telemetry, export evidence, and audit events.

Visual requirement:

- Use a horizontal or vertical process lane with concrete UI screenshots, command snippets, or payload previews.
- Avoid decorative icons without evidence. Each step should have one app state, command, or payload reference.

### 4. Trust Model: Permission-Aware Before Context Leaves

Section headline:

> The trust boundary sits before the agent sees context.

Body copy:

> ForgetBase is designed around permission-aware retrieval, export eligibility, citations, lifecycle state, audit evidence, and redaction-aware telemetry. The beta story should prove restricted content is excluded before it reaches broad-reader search, MCP responses, exports, or unauthorized API results.

Feature copy:

- Permission-aware retrieval for web, API, CLI, MCP, and export surfaces.
- Stable IDs, citations, version metadata, and source references.
- Review queue, publish, restore, and version inspection workflows.
- Restricted leakage verifier for search/export boundaries.
- Redaction hooks before stored retrieval telemetry and managed-query feedback.
- Disabled-by-default action governance for future side-effecting workflows.

Claim constraint:

- Say "designed around", "includes foundations for", or "beta proves" where checks are not yet wired as release gates.
- Do not say "complete observability", "certified compliance", or "prevents all leaks".

### 5. Built For Agents First, Readable By Humans

Section headline:

> The web UI is the console. Agents are the consumers.

Body copy:

> Human-readable pages matter, but ForgetBase is not primarily a wiki. The core product is the governed asset model and the delivery surfaces agents can consume directly: API, CLI, MCP, JSON packages, and OKF projections generated from canonical assets.

Proof bullets:

- Agent-first instruction and policy assets.
- Linked human-readable pages for fallback reading.
- MCP and CLI retrieval alongside REST/OpenAPI.
- JSON and OKF export projections with permission filtering.
- Operational UI for review, debugging, access, telemetry, and release decisions.

### 6. Self-Hosted Open Core

Section headline:

> Run the core yourself before trusting it with real instructions.

Body copy:

> The beta path starts with a self-hostable Apache 2.0 core, Docker Compose, Postgres, a synthetic demo corpus, and local checks that can be run before private content enters the system.

Proof bullets:

- Docker Compose local stack.
- Postgres system of record with pgvector support.
- Synthetic demo corpus for public examples.
- Local validation and restricted-leakage checks.
- Backup/restore helpers and runbooks are present, with stronger release gating still planned.

CTA:

> Start the local demo

### 7. Clear Beta Boundary

Section headline:

> Built in public boundaries, not inflated claims.

Body copy:

> ForgetBase beta should be evaluated as a self-hostable core for governed agent instructions and context packages. It is not a production hosted service, full enterprise identity suite, broad enterprise-search replacement, or managed-agent orchestration platform.

Scope cards:

- In scope now: governed assets, local auth/API keys, permission-aware retrieval, REST/OpenAPI, CLI, MCP, web operations, JSON/OKF export packages, validation, telemetry/audit foundations, Docker Compose, synthetic demo corpus.
- Proving before beta claim: 15-minute value path, business-grade app IA, first-class Distribute surface, CI/release gates, browser UAT, API/CLI/MCP contract checks, landing screenshots from real product state.
- Not claimed: hosted-service maturity, SCIM, enterprise SSO completion, full managed orchestration, complete observability, broad enterprise-search parity, certification-level compliance.

### 8. Final CTA

Headline:

> Prove what your agents are allowed to know.

Body copy:

> Run the local demo, publish an approved instruction, retrieve it through a machine consumer, and verify that restricted context stays out of the wrong package.

Primary CTA:

> Run locally

Secondary CTA:

> Read beta scope

## Hero And Screenshot Requirements

The landing implementation must capture or compose visuals from actual app/demo states. Mockups can be used only when explicitly labeled as design mockups in implementation notes, not as live product proof.

Required shots:

| Shot | Source state | Must show | Why |
|---|---|---|---|
| Hero composite | Browser-rendered app plus terminal/code panel | Approved instruction asset, trust/provenance rail or review state, allowed surfaces, MCP/CLI/API/export fetch | Proves first viewport product plus agent-consumer path. |
| Review proof | Review queue or version diff | Current versus selected version, approval/review action, lifecycle status | Makes governance visible. |
| Retrieval proof | Search or managed-query result | Citation-bearing result, permission/filtering context, denied or omitted state if available | Shows retrieval is not a generic docs page. |
| Distribution proof | Export summary, CLI export, API export, MCP fetch, or future Distribute screen | JSON or OKF package, package hash/version metadata where available, omitted restricted item | Shows how agents receive context. |
| Operations proof | Telemetry/audit/redaction/restricted leakage verifier output | Redacted telemetry or audit evidence without secrets | Supports trust claims without overclaiming observability. |

Visual constraints:

- Use the existing Quiet Control Plane direction: restrained, high-density, provenance-forward.
- Use the ForgetBase brand mark and palette from `docs/design/forgetbase-brand` if a mark is needed. Prefer the selected dissolve mark or the cleaner notch fallback.
- No abstract AI gradients, glowing blobs, generic neural-network art, or decorative dashboards as primary proof.
- Do not hide the product behind a dark blur, tiny screenshot, or marketing illustration.
- Maintain readable text at desktop and mobile widths.
- The first viewport must hint at the next section on common desktop and mobile viewports.

## Claims Allowlist

These phrases are acceptable when used with the stated guardrails:

| Claim | Guardrail | Source basis |
|---|---|---|
| "self-hostable" | Use for the open-source core and Docker Compose path, not a hosted service. | `README.md`, `docs/END_TO_END_GOAL.md`, `docs/MVP_SCOPE.md`, `docs/BETA_RELEASE_PLAN.md` |
| "open-core" | Pair with Apache 2.0 core; do not define paid boundaries. | `README.md`, `docs/END_TO_END_GOAL.md` |
| "Apache 2.0 core" | Safe if license remains unchanged. | `README.md`, project instructions |
| "governed assets" | Safe for instructions, policies, playbooks, skills, SOPs, eval cases, templates, and human-readable pages. | `docs/MVP_SCOPE.md`, `docs/PRODUCT_GOAL.md` |
| "permission-aware retrieval" | Safe as a core/MVP capability; avoid "prevents all unauthorized access". | `docs/MVP_SCOPE.md`, `docs/REMAINING_FUNCTIONAL_GAPS.md` |
| "API, CLI, MCP, and export surfaces" | Safe; route/contract stability must be beta-gated before stability claims. | `README.md`, `docs/MVP_SCOPE.md` |
| "JSON and OKF export projections" | Safe when described as generated projections from canonical assets. | `docs/DECISIONS.md`, `docs/DEVELOPMENT.md` |
| "redaction-aware telemetry" | Safe for deterministic redaction hooks/foundations; avoid "complete PII protection". | `docs/MVP_SCOPE.md`, `docs/TECHNICAL_SPEC.md`, `docs/DEVELOPMENT.md` |
| "restricted leakage verifier" | Safe as existing verifier/check; do not imply it is already a CI release gate unless implemented. | `docs/REMAINING_FUNCTIONAL_GAPS.md`, `docs/BETA_RELEASE_PLAN.md` |
| "Docker Compose quickstart" | Safe if linked to current local run commands. | `README.md`, `docs/DEVELOPMENT.md` |

## Claims Blocklist

Do not use these as public claims:

| Blocked phrase | Reason | Safer alternative |
|---|---|---|
| "production-ready" | Gaps doc explicitly forbids this boundary. | "private/public-alpha candidate" or "beta core", depending page context. |
| "hosted service" as current product | Hosted provisioning, billing, backups, retention defaults, and support posture are deferred. | "hosted service is a later path" or omit. |
| "enterprise SSO" or "SCIM" | Real Entra verification and SCIM are deferred. | "local users, API keys, and OIDC configuration foundations". |
| "complete observability" | Advanced analytics and long-range dashboards are deferred. | "telemetry and audit foundations". |
| "full agent orchestration" | Managed orchestration and external side-effect adapters are future work. | "governed context delivery for agent systems". |
| "enterprise search replacement" | Competitors own broad search/connector volume; not beta ICP. | "instruction and context registry for agents". |
| "prevents leaks" | Absolute security claim. | "tests restricted export/search boundaries" or "permission-aware before retrieval/export". |
| "stable API compatibility" | Contract freeze/checks are not complete yet. | "API/CLI/MCP surfaces with beta contract checks planned". |
| "provider-quality semantic search by default" | Local hash-vector is deterministic; provider embeddings are opt-in and require configuration. | "lexical, deterministic local vector, hybrid, and opt-in provider-vector retrieval". |
| "LLM-judged eval platform" | LLM-as-judge automation is deferred. | "deterministic eval foundations". |

## SEO And Social Metadata

SEO title:

> ForgetBase | Governed Instructions for AI Agents

Meta description:

> Self-host a governed registry for agent instructions, policies, playbooks, and context packages with API, CLI, MCP, and export delivery.

Open Graph title:

> ForgetBase: Governed Instructions for AI Agents

Open Graph description:

> A self-hostable beta core for versioning, permissioning, reviewing, and distributing the context your agents retrieve.

Social card headline:

> Prove what your agents are allowed to know.

Social card supporting text:

> Govern, review, and distribute agent context through API, CLI, MCP, JSON, and OKF.

Social card visual:

- Use the hero product/consumer composite, cropped to keep the app state and terminal/code panel legible.
- Do not use a standalone logo, abstract gradient, or decorative AI background.

## Implementation Acceptance Checks

Before implementing or merging the landing page:

- First viewport shows the product UI and an agent-consumer path.
- Hero visual is based on browser-rendered app/demo state or explicitly labeled staged demo state.
- Page explains the git/Markdown failure mode respectfully.
- Page includes concrete local run/demo CTA, not a vague "contact sales" primary path.
- Page distinguishes supported claims, beta-proof-required claims, and deferred capabilities.
- No public copy claims production readiness, hosted-service maturity, SCIM/enterprise SSO completion, full managed-agent orchestration, complete observability, broad enterprise-search parity, stable API compatibility, or certification-level compliance.
- Public examples and screenshots use synthetic/demo data only.
- Metadata avoids inflated category claims.
- Mobile and desktop views keep screenshot text and CTAs readable.
- Claims lint, when added, should fail on the blocklist phrases above unless they appear in an explicit "not claimed" boundary section.

## Files Read

Primary source files:

- `work/beta-execution/manager-execution-map.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `docs/MVP_SCOPE.md`
- `docs/design/README.md`
- `work/model-council/forgetbase-beta-20260619/source-register.md`
- `work/model-council/forgetbase-beta-20260619/stage1/gemini-contrarian.md`
- `work/model-council/forgetbase-beta-20260619/stage1/claude-contrarian.md`

Additional grounding files inspected:

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/PRODUCT_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT.md`
- `docs/design/forgetbase-brand/README.md`
- `docs/design/forgetbase-design-system/index.html` via targeted search
- `docs/design/forgetbase-main-page-mockups/index.html` via targeted search
- `docs/design/forgetbase-main-page-mockups/styles.css` via targeted search

Commands run:

- `git status --short`
- `wc -l` for the named source files and grounding docs
- `sed -n` for the named source files and selected grounding sections
- `rg -n` for grounding claims and design direction

## Final Claim Safety Check

| Risky phrase | Risk | Safer public alternative |
|---|---|---|
| Production-ready instruction control plane | Overstates release status and violates gaps doc. | Self-hostable beta core for governed agent instructions. |
| Hosted agent platform | Hosted-service maturity is deferred. | Open-core self-hostable registry, with hosted service later. |
| Enterprise SSO and SCIM for agent teams | SCIM and real enterprise identity hardening are deferred. | Local users, API keys, browser sessions, and OIDC configuration foundations. |
| Full observability for every agent action | Advanced analytics and complete observability are deferred. | Telemetry and audit foundations for retrieval, exports, admin actions, and managed-query events. |
| Complete managed-agent orchestration | Full orchestration and side-effect adapters are future work. | Governed context delivery for agent systems. |
| Enterprise search for all company knowledge | Wrong category and not beta scope. | Instruction and context registry for AI agents. |
| Prevents restricted data leaks | Absolute security guarantee. | Permission-aware retrieval plus restricted export/search leakage checks. |
| Stable API, CLI, and MCP contracts | Beta contract freeze/checks are not complete yet. | API, CLI, and MCP surfaces with beta contract checks planned. |
| Provider-quality semantic search out of the box | Default vector path is deterministic local hash; provider embeddings are opt-in. | Lexical, deterministic local vector, hybrid, and configurable provider-vector retrieval. |
| LLM-judged evaluation platform | LLM-as-judge automation is deferred. | Deterministic eval foundations and beta quality gates. |
| Replace git and Markdown | Insults incumbent workflows and misstates value. | Complements git/Markdown when runtime consumers need permissions, review state, and audited distribution. |
| Zero-trust agent runtime | Unsupported broad security category. | Permission-aware context registry with explicit beta boundaries. |

## Open Questions For Later Workers

- Which exact demo spine screenshots should become canonical after `work/beta-execution/demo-spine-15-minute-path.md` lands?
- Should the landing page link to a public beta scope page, README section, or generated docs page once the release boundary is finalized?
- Should "instruction control plane" appear in the hero subhead or only below the fold after user testing with the target ICP?

## Next Safe Action

Wait for the demo spine and app IA outputs, then implement the landing page with screenshots or staged demo scenes that match those specs. Do not build around abstract brand art while the proof path is still being finalized.
