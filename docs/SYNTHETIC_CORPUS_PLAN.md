# Synthetic Corpus Plan

## Purpose

The public demo corpus should prove the breadth of the product without copying private source content.

The corpus targets AI-native users common in public AI communities: power users, AI team leads, consultants, developers, and SMB admins who manage reusable instructions, tools, and agent workflows.

## Personas

### AI Team Lead

Needs governed guidance, policy, approved tools, reporting, and quality controls for staff-facing AI adoption.

### Individual Power User

Needs a personal instruction library for Codex, Claude Code, ChatGPT, local scripts, reusable skills, and project harnesses.

### SMB Admin

Needs local users, approved tools, usage rules, telemetry, and deployment controls without enterprise complexity.

### Consultant

Needs repeatable playbooks, templates, and client-ready operating patterns.

### Developer

Needs API, CLI, MCP, tool instructions, coding-agent guidance, and action-execution boundaries.

## Corpus Sections

### Start Here

- what this instruction hub is
- how agents should use it
- how humans should use it
- trust and citation rules

### Policies And Guardrails

- acceptable AI use policy
- customer-data handling policy
- tool approval policy
- incident response guide
- restricted content handling

### Tool Registry

- approved tools
- conditional tools
- under-review tools
- blocked tools
- spend and usage control guidance

### Agent Instructions

- system instruction examples
- project harness instruction
- code review instruction
- research synthesis instruction
- support-response instruction
- escalation instruction

### Skills And Playbooks

- prompt improvement skill
- task decomposition skill
- evidence-backed answer skill
- agent handoff playbook
- human-agent team design playbook
- decision-rights playbook

### MCP And Connectors

- connect ChatGPT
- connect Claude
- connect Claude Code
- connect Codex
- connect custom MCP client
- known issues and workarounds

### Templates

- AI funding request template
- tool review template
- pattern capture template
- incident report template
- eval case template
- policy exception template

### Measurement And Observability

- adoption metrics
- query quality review
- citation accuracy review
- task outcome acceptance
- stale content report
- telemetry policy

### Gateway And Orchestration Patterns

- LLM gateway pattern
- routing policy
- cache policy
- model fallback policy
- action approval policy
- quality gate pattern

## Required Object Types

The synthetic corpus should include:

- policy
- guideline
- guardrail
- playbook
- skill
- SOP
- tool instruction
- template
- reference
- human document
- agent instruction
- eval case
- telemetry policy

## Minimum Demo Size

MVP demo corpus target:

- 50-75 total assets
- 20-30 agent instruction objects
- 15-20 human documents
- 8-12 policies or guardrails
- 8-12 templates/playbooks
- 5-8 eval cases
- 5 restricted permission-test fixtures outside the default public demo import

## Synthetic Content Rules

- Do not copy private source content.
- Use fictional organization names.
- Keep the default OSS demo import at `public-demo` sensitivity.
- Put restricted examples in dedicated permission/leakage fixtures rather than the default public corpus.
- Use fake tools or public generic tool names where appropriate.
- Avoid real customer, staff, vendor contract, or internal policy details.
- Include intentionally imperfect examples for validators and evals.
