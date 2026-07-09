# End-To-End Goal

## Goal Statement

Build ForgetBase as an Apache 2.0 open-core, self-hostable, SMB-ready knowledge system for people and AI tools, with an instruction control plane as its governed core.

The system must let AI teams and individual power users manage governed AI instructions, policies, guardrails, playbooks, tool guidance, reusable skills, SOPs, templates, evaluation cases, and human-readable documents as versioned assets. Agents and AI tools must be able to retrieve and apply those assets directly through API, CLI, MCP, ChatGPT-compatible, Claude-compatible, Codex-compatible, and Claude Code-compatible surfaces. People must be able to browse, read, search, ask, and inspect sources through a reader UI, while admins inspect, approve, publish, debug, and control access through a separate operational UI.

## Production Outcome

A production SMB deployment is successful when an organization can:

1. Install the system with Docker Compose.
2. Create local users, groups, roles, and API keys.
3. Import or author a governed instruction corpus.
4. Publish agent instructions and linked human documents.
5. Search and retrieve permission-appropriate content through web, API, CLI, and MCP.
6. Exclude restricted content from unauthorized searches, responses, and exports.
7. Export connector-ready knowledge packages with stable IDs and metadata.
8. Observe query, retrieval, export, and admin activity through telemetry and audit events.
9. Mitigate PII exposure through configurable redaction and retention controls.
10. Back up, restore, and roll back content and deployments.
11. Extend the system later with managed model orchestration and task execution without rewriting the core registry.

## MVP Outcome

The MVP proves the open-source core:

- governed asset registry
- local auth and API keys
- permission-aware retrieval
- REST/OpenAPI
- CLI
- MCP server
- reader web UI and separate operational admin UI
- synthetic demo corpus
- validation and restricted export tests
- telemetry and audit foundations
- Docker Compose install

The MVP does not need to generate managed AI answers. It must expose the surfaces and telemetry needed for the managed agent layer to be added cleanly.

## Quality Bar

The system optimizes for:

- factual citation accuracy
- policy compliance
- task completion quality
- response/action consistency
- outcome acceptance

Cost and user satisfaction matter, but they are secondary to correctness, governance, and effective work completion.

## Non-Negotiable Acceptance Criteria

- Every governed asset has a stable ID, type, owner, lifecycle state, sensitivity, audience, status, review date, version, and allowed surfaces.
- Human documents and agent instructions are separate but linkable primitives.
- Retrieval is permission-aware before context reaches an agent, export, or model.
- Restricted assets cannot leak into broad-reader search, exports, MCP responses, or unauthorized API results.
- API, CLI, MCP, and web surfaces share the same permission and retrieval logic.
- Telemetry supports query, retrieval, export, managed-query feedback, answer/action placeholder, and audit events.
- PII handling is configurable and defaults toward safer retention.
- The project can run self-hosted without a hosted service dependency.
- The architecture leaves a clean path for OpenAI, Anthropic, and OpenRouter-style orchestration.

## End State For First Production Release

First production release means:

- Docker Compose deployment works on a clean machine.
- Database migrations are repeatable.
- Seeded demo corpus imports successfully.
- Admin can create users and API keys.
- Maintainer can publish and roll back assets.
- User can search through web UI.
- Agent can search and fetch through MCP.
- CLI can validate, import, search, export, and run health checks.
- Unauthorized access to restricted content is denied and tested.
- Telemetry and audit events can be inspected.
- Backup and restore are documented and tested on sample data.
- Runbooks exist for deploy, rollback, key rotation, and restricted leakage investigation.

## First Implementation Objective

Create the core application scaffold and domain model without building the full product at once.

The first code milestone should prove:

- monorepo workspace
- shared schema package
- API health route
- database migration baseline
- Docker Compose for Postgres and app services
- test command
- lint/typecheck command
- placeholder CLI and MCP packages wired to shared types
