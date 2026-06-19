# ForgetBase Beta Release Research Brief

Run date: 2026-06-19
Evidence mode: Web-augmented
Audience: Founder/product-builder deciding remaining beta build plan, UI/UX direction, public website narrative, and release sequencing.

## Product Context

ForgetBase, also referred to in older repo documents as Agentic CMS, is an open-core, Apache 2.0, self-hostable agent-native instruction management platform. The intended category is an instruction control plane for agentic systems, not a conventional CMS or wiki.

The system manages governed AI instructions, policies, guardrails, playbooks, tool guidance, reusable skills, SOPs, templates, learning assets, evaluation cases, and linked human-readable documents as versioned assets. Primary consumers are agents, AI tools, APIs, CLIs, MCP clients, ChatGPT, Claude, Codex, and Claude Code-style harnesses. The web UI is an operational surface for browsing, approval, debugging, and fallback reading.

## Current Repo Grounding

The current repo already has substantial alpha-core functionality: governed assets, versioning, local users, service accounts, groups, scoped API keys, permission-aware retrieval, lexical/vector/hybrid search, REST/OpenAPI, CLI, MCP, worker, operational web UI, AI export packages, OKF v0.1 export projection, telemetry, redaction, retention, provider-routed managed-query foundation, deterministic evals, disabled-by-default action-request governance, Docker Compose, leakage verification, and runbooks.

The current known gap is not only backend functionality. The user has explicitly stated that the UI/UX is severely lacking and needs substantial improvement, and the public value proposition/landing page needs to be much clearer and more marketable.

## Decision To Support

Produce a fully specified remaining build plan for a proper beta release with:

1. high-quality business-grade app UI/UX;
2. an excellent public landing page and product story;
3. strong, specific value proposition aligned to the real feature set;
4. practical release sequencing that avoids overclaiming production, hosted-service, or full managed-agent orchestration readiness.

## Working Thesis For Challenge

ForgetBase should not compete head-on as a broad enterprise search or wiki product. The beta should target AI-heavy teams that need a governed source of truth for agent instructions and reusable context across API, CLI, MCP, exports, and human review. The differentiating promise is:

> Governed context for agents: version, permission, test, export, and observe the instructions your AI systems rely on.

## Candidate Beta Release Shape

- Beta 0: Positioning, landing page narrative, design system, and demo journey.
- Beta 1: Business-grade app shell and governed reading room.
- Beta 2: Agent context distribution through API, CLI, MCP, and OKF export workflows.
- Beta 3: Trust console for permissions, leakage checks, evals, telemetry, redaction, and audit.
- Beta 4: Self-hosted beta hardening: Docker Compose, backup/restore, public docs, examples, and onboarding.

## Constraints

- Keep public examples synthetic.
- Do not claim production readiness, hosted-service maturity, enterprise identity completion, or full managed-agent orchestration until evidence exists.
- Keep OKF as a generated export projection, not the canonical source of truth.
- Preserve the product framing as an agent-native instruction control plane.
- The web app should be operational and business-grade, not a decorative marketing dashboard.
