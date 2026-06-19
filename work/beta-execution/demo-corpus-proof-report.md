# Demo Corpus Proof Report

Date: 2026-06-19
Lane: Demo Corpus And Eval Proof
Status: corpus validation passed

## Summary

This pass adds the minimal synthetic corpus and eval coverage needed for the beta demo spine to prove internal, restricted, export-eligible, and export-blocked boundaries without private content or schema changes.

The demo spine can proceed to `smoke:compose` implementation from the corpus side. The next smoke worker still needs to verify runtime search, API, CLI, MCP, JSON export, and OKF export behavior against the new stable IDs.

## Stable IDs Added

| Stable ID | Type | Sensitivity | Surfaces | Exports | Why it exists |
|---|---|---|---|---|---|
| `sop.internal-agent-release` | `sop` | `internal` | `api`, `cli`, `mcp`, `web`, `export` | `internal-ops-pack` | Proves non-public internal assets can be readable/exportable only through non-public package semantics. |
| `policy.restricted-credential-handling` | `policy` | `restricted` | `api`, `cli`, `mcp`, `web` | none | Provides a deterministic restricted boundary for the proof term `credential vault escalation` without real credential material. |
| `playbook.public-demo-no-export` | `playbook` | `public-demo` | `api`, `cli`, `mcp`, `web` | none | Proves public-demo readability is separate from export eligibility; also gives public search a safe breadcrumb for the restricted proof phrase. |
| `runbook.restricted-security-escalation` | `sop` | `restricted` | `api`, `cli`, `mcp`, `web` | none | Provides restricted export-blocked behavior for search/export leakage checks using the same deterministic proof term. |

## Eval Cases Added

| Eval ID | Coverage | Expected stable IDs | Notes |
|---|---|---|---|
| `eval.restricted-block-boundary` | Restricted-boundary proof | `playbook.public-demo-no-export` | Uses metadata `forbiddenStableIds` for the two restricted IDs because the current eval schema cannot enforce forbidden result IDs. |
| `eval.export-eligibility` | Export eligibility proof | `playbook.public-demo-no-export` | Confirms the readable no-export asset is retrievable; export omission still belongs to export/leakage checks. |

Added tag thresholds:

- `restricted-boundary`: `1`
- `export-eligibility`: `1`

## Schema Boundary

The current managed-query eval schema supports:

- `expectedStableIds`
- `expectedGrounded`
- `requiredCitationCount`
- `tags`
- free-form `metadata`

It does not directly support negative assertions such as "these stable IDs must not appear" or export package membership assertions. I recorded those requirements in eval metadata and kept the enforceable checks for the later `smoke:compose` and `security:verify-restricted-leakage` paths.

## Files Inspected

- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `docs/MVP_SCOPE.md`
- `docs/DEVELOPMENT.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `work/beta-execution/integration-checkpoint-1.md`
- `work/beta-execution/demo-spine-15-minute-path.md`
- `corpus/demo/assets.json`
- `corpus/demo/evals.json`
- `packages/schema/src/index.ts`
- `packages/validation/src/index.ts`
- `packages/cli/src/index.ts`
- `apps/api/src/server.ts`
- Local maintainer ADHD helper skill instructions, path omitted from this release artifact.
- Local maintainer Codex memory registry, path omitted from this release artifact.

## Commands Run

```bash
git status --short
wc -l README.md docs/END_TO_END_GOAL.md docs/TECHNICAL_SPEC.md docs/DECISIONS.md docs/MVP_SCOPE.md docs/DEVELOPMENT.md work/beta-execution/integration-checkpoint-1.md work/beta-execution/demo-spine-15-minute-path.md docs/BETA_RELEASE_PLAN.md docs/REMAINING_FUNCTIONAL_GAPS.md corpus/demo/assets.json corpus/demo/evals.json packages/schema/src/index.ts
sed -n '1,220p' work/beta-execution/integration-checkpoint-1.md
sed -n '1,220p' work/beta-execution/demo-spine-15-minute-path.md
sed -n '220,537p' work/beta-execution/demo-spine-15-minute-path.md
sed -n '1,240p' packages/schema/src/index.ts
sed -n '270,305p' packages/schema/src/index.ts
sed -n '975,1008p' packages/schema/src/index.ts
sed -n '1,280p' corpus/demo/assets.json
sed -n '1,120p' corpus/demo/evals.json
sed -n '120,430p' packages/validation/src/index.ts
jq -e '.assets | length, map(.stableId)' corpus/demo/assets.json
jq -e '.cases | length, map(.id)' corpus/demo/evals.json
git diff -- corpus/demo/assets.json corpus/demo/evals.json
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-19 --fail-on-warnings
npx -y pnpm@11.7.0 --filter @forgetbase/schema exec tsx -e 'import { readFileSync } from "node:fs"; import { managedQueryEvalInputSchema } from "./src/index.ts"; const parsed = managedQueryEvalInputSchema.parse(JSON.parse(readFileSync("../../corpus/demo/evals.json", "utf8"))); console.log(JSON.stringify({ ok: true, caseCount: parsed.cases.length, tags: parsed.tagMinimumPassRates }, null, 2));'
git diff --check -- corpus/demo/assets.json corpus/demo/evals.json work/beta-execution/demo-corpus-proof-report.md
git status --short -- corpus/demo/assets.json corpus/demo/evals.json work/beta-execution/demo-corpus-proof-report.md
```

## Verification Results

Strict asset validation passed:

```json
{
  "ok": true,
  "asOf": "2026-06-19",
  "assetCount": 9,
  "errorCount": 0,
  "warningCount": 0,
  "staleCount": 0,
  "issues": []
}
```

Eval schema parse passed:

```json
{
  "ok": true,
  "caseCount": 5
}
```

## Open Follow-Ups

- Implement `smoke:compose` runtime proof for public search/export absence checks against `policy.restricted-credential-handling` and `runbook.restricted-security-escalation`.
- Keep `security:verify-restricted-leakage` as the authoritative runtime leakage gate.
- If evals need to enforce forbidden result IDs or export membership directly, extend the managed-query eval schema in a separate lane.
