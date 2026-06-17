# Alpha Release Checklist

Status: private public-alpha candidate, not public and not tagged.

Last reviewed: 2026-06-17

## Release Target

`v0.1.0-alpha.1` should be the first public alpha for technical readers who want to inspect, run, and dogfood the self-hosted open-source core.

The alpha should not claim production readiness, hosted-service readiness, stable API compatibility, or complete managed orchestration.

## Current Repository State

- GitHub repository: `jremick/agentic-cms`
- Visibility: private at last read-back on 2026-06-17
- Default branch: `main`
- Current GitHub description: `Agent-native instruction CMS and governed knowledge control plane for AI teams`
- GitHub license detection: Apache-2.0
- GitHub topics: `agentic-ai`, `ai-agents`, `cms`, `docker-compose`, `knowledge-management`, `mcp`, `openapi`, `postgres`, `retrieval`, `typescript`
- Latest GitHub release: none
- Local branch state: alpha-candidate implementation committed and pushed to `main`

Remaining GitHub gates before publication:

- Homepage: leave blank until a docs or demo URL exists
- Private vulnerability reporting: enable or confirm before public visibility

## Alpha Scope

Included:

- governed instruction and human-document registry
- local users, service accounts, groups, scoped API keys, and OIDC configuration
- permission-filtered retrieval, citations, managed query, provider-routed execution, and deterministic fallback
- REST/OpenAPI, CLI, MCP, worker, and operational web UI
- synthetic demo corpus
- validation, restricted leakage verification, backup/restore verification, telemetry, audit, redaction, retention, cache, and action-request foundations

Excluded:

- production support commitments
- stable API, CLI, MCP, or package compatibility
- npm publishing
- full quality-based orchestration
- external side-effecting action adapters
- connector credential governance beyond env-var and mounted-file references
- hosted service features
- SCIM, MFA enforcement, remembered-device trust policy, and certification-level compliance process
- semantic/vector retrieval beyond the current vector-ready storage foundation

## Required Before Public Alpha

- [x] Commit the current implementation to Git so GitHub can detect files, license, workflow, and docs.
- [ ] Confirm Apache-2.0 copyright holder and year for public release notes.
- [x] Run a fresh clone or clean-worktree quickstart smoke from the README. Use a unique `COMPOSE_PROJECT_NAME` when running beside another checkout so Docker volumes and containers do not collide.
- [x] Push to GitHub and read back CI status on `main`.
- [x] Read back GitHub license detection, description, topics, and visibility.
- [ ] Enable or confirm GitHub private vulnerability reporting before public visibility.
- [x] Move private-source review notes to maintainer-only storage outside the public release candidate.
- [ ] Decide whether to create only a tag or a GitHub prerelease for `v0.1.0-alpha.1`.
- [x] Repeat the tracked-file public-readiness scan immediately before release.

## Verification Gate

Run these before tagging:

```bash
npx -y pnpm@11.7.0 install --frozen-lockfile
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 build
npx -y pnpm@11.7.0 test
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
npx -y pnpm@11.7.0 security:verify-restricted-leakage
npx -y pnpm@11.7.0 db:verify-backup-restore
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
git diff --check
```

Run this hygiene scan over tracked release candidates after staging:

```bash
pattern='BEGIN (RSA|OPENSSH|PRIVATE) KEY|OPENAI''_API_KEY=|ANTHROPIC''_API_KEY=|OPENROUTER''_API_KEY=|ghp_''[A-Za-z0-9_]{20,}|github_pat_''[A-Za-z0-9_]{30,}|acms_''[A-Za-z0-9_]{24,}'
git grep -n -E "$pattern" -- .
```

Expected result: no matches except intentional test fixtures that construct fake values without storing real secrets.

## Release Decision

Current decision: do not publish or tag yet.

Reason: the implementation is committed, pushed, locally verified, fresh-clone smoke-tested, and CI-read-back, but the repo remains private until private vulnerability reporting and release-note ownership are confirmed and the tag-versus-prerelease decision is made.
