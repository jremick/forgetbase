# Implementation Plan

## Phase 0: Planning Scaffold

Goal: create durable project context before implementation.

Deliverables:

- README
- local project instructions
- product goal
- architecture direction
- decision log
- MVP scope
- security model
- synthetic corpus plan
- source review note
- end-to-end goal
- technical specification
- roadmap

Validation:

- docs exist and are internally linked
- no private source content copied
- repo status is clear

## Phase 1: Technical Architecture Specification

Goal: turn the current architecture direction into build-ready technical design.

Deliverables:

- domain model
- API surface sketch
- permission model detail
- MCP tool contract
- CLI command plan
- telemetry event schema
- deployment topology
- storage/search/provider adapter interfaces
- first code milestone exit criteria

Validation:

- schema supports MVP acceptance checks
- restricted export rule has explicit test path
- orchestration layer can be added without schema rewrite

## Phase 2: Core Scaffold

Goal: create the application skeleton without implementing all behavior.

Likely structure:

- `apps/api`
- `apps/web`
- `apps/worker`
- `packages/cli`
- `packages/mcp-server`
- `packages/sdk`
- `packages/schema`
- `packages/validation`
- `corpus/demo`
- `infra/docker`

Validation:

- package manager and runtime selected
- services start locally
- typecheck/lint/test commands exist
- Docker Compose starts dependency containers

## Phase 3: Registry And Validation

Goal: implement governed asset storage and validation.

Deliverables:

- asset schema
- versioning
- metadata validation
- lifecycle states
- import/export fixtures
- synthetic corpus seed

Validation:

- invalid metadata fails
- version history is preserved
- demo corpus imports repeatably

## Phase 4: Permissioned Retrieval

Goal: implement search and retrieval with permission checks.

Deliverables:

- chunking
- Postgres full-text search
- vector search
- citation references
- permission filtering
- restricted export leakage tests

Validation:

- authorized users see expected results
- unauthorized users do not see restricted results
- exports exclude restricted assets unless explicitly scoped

## Phase 5: Delivery Surfaces

Goal: expose the core through API, CLI, MCP, and web.

Deliverables:

- REST/OpenAPI endpoints
- CLI commands
- MCP tools
- operational web UI
- AI export bundle

Validation:

- CLI can validate, import, search, and export
- MCP client can search and fetch with citations
- web UI can browse, inspect, and publish
- OpenAPI spec matches implementation

## Phase 6: Telemetry And Operations

Goal: make the system observable and operable for SMB use.

Deliverables:

- telemetry schema
- PII redaction hooks
- audit events
- backup/restore runbook
- rollback runbook
- deployment runbook

Validation:

- telemetry records expected events
- sensitive text can be redacted
- content rollback works
- backup and restore are tested on sample data

## Phase 7: Managed Agent Layer

Goal: add admin-controlled answer and action orchestration.

Deliverables:

- provider adapter hardening and health checks
- model routing policy rules
- prompt/harness templates
- permission-scoped response cache foundation
- eval checks
- action execution framework
- approval policies
- quality dashboards

Validation:

- factual citation checks run on eval cases
- policy compliance checks run on restricted scenarios
- actions require correct admin enablement and approvals
- cached answers remain source-aware and invalidated on content change
