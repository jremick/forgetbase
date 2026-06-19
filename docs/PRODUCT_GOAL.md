# Product Goal

## Working Goal

Build an open-core, Apache 2.0, agent-native instruction management platform for AI teams and power users.

The system manages policies, prompts, playbooks, guardrails, tool instructions, reusable skills, templates, SOPs, learning assets, and human-readable knowledge as governed assets. It exposes those assets securely through API, CLI, MCP, ChatGPT, Claude, Codex, Claude Code, and an operational web UI.

The production product must support permission-aware retrieval, admin-controlled agent response behavior, telemetry, search, governance workflow, evals, caching, rollback, task-execution controls, PII mitigation, and a human-readable knowledge hub.

## Product Category

ForgetBase is not primarily a wiki, intranet, or conventional CMS.

It is an instruction control plane for agentic systems:

- source of truth for instructions and policies
- retrieval layer for trusted context
- governance layer for content and agent behavior
- operational surface for AI teams
- fallback human reading surface

## Primary Users

### AI Team

Owns the governed instruction corpus, approves high-impact guidance, monitors usage, and tunes retrieval and response quality.

### Individual Power User

Runs the self-hosted core to manage personal or small-team instructions, agent skills, reusable prompts, playbooks, and tool guidance.

### SMB Admin

Manages users, auth, policy, approved tools, connectors, telemetry, and deployment operations.

### Maintainer Or Approver

Reviews and publishes governed assets, handles stale content, and rolls back bad releases.

### Agent Or AI Tool

Retrieves permission-appropriate instructions with stable IDs, citations, metadata, and execution guidance.

## Outcomes

The project succeeds when:

- agents can retrieve and apply trusted instructions directly
- human-readable content is available without becoming the core data model
- admins can control access, model behavior, retrieval boundaries, and action permissions
- AI teams can measure factual citation accuracy, policy compliance, consistency, task completion quality, and outcome acceptance
- restricted content does not leak into broader-reader search, exports, or responses
- the system can run self-hosted for individuals and SMBs while supporting a hosted open-core service later

## Non-Goals For MVP

- full enterprise wiki replacement
- rich real-time collaborative editing
- custom identity provider
- full managed agent orchestration
- complex analytics beyond operational telemetry
- certification-level compliance process
- proprietary content migration into the public repo

## First Hardened Deployment Definition

A hardened SMB deployment can:

- run from documented containers
- authenticate local users and API clients
- ingest a synthetic or customer-owned corpus
- enforce document-level permissions with finer-grained extension points
- expose API, CLI, MCP, and web surfaces
- validate metadata, links, stale content, search eligibility, and restricted exports
- capture telemetry with PII mitigation controls
- back up and restore state
- roll back bad content or deployments
- support later orchestration without reworking the core schema
