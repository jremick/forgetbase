# ForgetBase Project Instructions

Version: 0.1.2
Last updated: 2026-07-10

## Project Purpose

This project is an open-core, Apache 2.0 knowledge system for people and AI tools. Its governed, agent-native data and retrieval layer is the product core; its reader-facing knowledge base is the primary human experience.

The product manages AI instructions, policies, guardrails, playbooks, tool guidance, reusable skills, SOPs, templates, learning assets, and human-readable pages as governed assets. Agents, AI tools, harnesses, APIs, CLIs, and MCP clients consume the governed machine surface. People browse, search, ask, and read through the knowledge-base UI; admins use its separate operational surface for governance and access control.

## Current Work Mode

- Keep changes surgical and traceable to the current implementation lane.
- Keep the governed core agent-native while treating the reader UI as a first-class product surface and the admin UI as a separate operational surface.
- Use isolated synthetic content for controlled live UAT. Test execution does not authorize a deployment, repository visibility change, release, tag or announcement; those actions require explicit owner approval.
- Keep public examples synthetic and reusable.

## Public Content Boundary

Private source systems can inform product categories and validation breadth, but this repo must use a synthetic/demo corpus for public examples.

Do not commit:

- private source exports
- private customer, staff, or company content
- credentials, tokens, API keys, auth dumps, or raw telemetry
- local runtime state

If private source context is needed, keep notes maintainer-only and outside the public release candidate.

## Architecture Defaults

- Open-core product with a useful self-hostable core.
- Apache 2.0 license unless a later decision changes it.
- Single-tenant OSS core first, with `tenant_id` in the data model from day one.
- Local users first, pluggable auth second, Microsoft Entra ID/OIDC next.
- Docker Compose is the canonical OSS deployment target.
- The hosted service should run the same containerized services.
- Kubernetes is a later enterprise deployment target, not an MVP dependency.
- Human-readable pages and agent-optimized instruction objects are separate primitives.
- Permissions default to document level but must support finer-grained section, chunk, instruction, tool, export, and action controls.

## Quality Bar

Before claiming a milestone is done, provide evidence for the relevant checks:

- metadata validation
- permission-aware retrieval
- restricted export leakage tests
- API/CLI/MCP compatibility
- search behavior
- telemetry capture and redaction path
- rollback path
- cost and operational assumptions
- security boundary review

## Documentation Map

- `docs/PRODUCT_GOAL.md`: product thesis, users, outcomes, and non-goals.
- `docs/END_TO_END_GOAL.md`: explicit production and MVP goal.
- `docs/ARCHITECTURE.md`: target architecture and deployment options.
- `docs/TECHNICAL_SPEC.md`: buildable technical specification.
- `docs/DECISIONS.md`: current decisions, tradeoffs, and review triggers.
- `docs/MVP_SCOPE.md`: minimum useful release and acceptance checks.
- `docs/BETA_PRIVATE_CONTRACT.md`: private beta frozen machine-consumer surface and preview boundaries.
- `docs/PRIVATE_LIVE_UAT.md`: controlled live user-testing charter, evidence, and stop rules.
- `docs/SECURITY_MODEL.md`: security posture, auth, permissions, telemetry, and PII handling.
- `docs/DEVELOPMENT.md`: install, verification, and smoke-test commands.
- `docs/SYNTHETIC_CORPUS_PLAN.md`: public demo corpus design.
- `docs/IMPLEMENTATION_PLAN.md`: phased build path and verification loop.
- `docs/ROADMAP.md`: delivery phases and exit criteria.

## Next Safe Action

When resuming, start by reading `README.md`, `docs/END_TO_END_GOAL.md`, `docs/TECHNICAL_SPEC.md`, `docs/DECISIONS.md`, `docs/MVP_SCOPE.md`, and `docs/DEVELOPMENT.md`. Then confirm the active implementation lane before changing code.
