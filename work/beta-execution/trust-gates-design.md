# Beta Trust Gates Design

Status: implementation-ready design
Last updated: 2026-06-19
Owner: trust gates implementation lane

## Goal

Make the beta trust claims enforceable before public beta: restricted leakage, OpenAPI drift, public-copy claims, Docker Compose smoke, backup/restore, and secure default authentication.

This is a design artifact only. It does not wire CI, add scripts, or change runtime behavior.

## Success Criteria

- Default CI can run without real provider, OIDC, paid service, or external identity credentials.
- Release gates separate cheap deterministic checks from slower Docker/runtime checks and manual/secret-gated checks.
- Every beta trust claim has a named command, expected evidence, failure behavior, and fallback.
- Public copy remains no stronger and no weaker than `docs/REMAINING_FUNCTIONAL_GAPS.md` allows.
- A later implementer can add scripts and workflow steps without re-deciding scope.

## Gate Matrix

| Command name | Purpose | Owner | Local prerequisites | CI/release placement | Expected runtime | Failure behavior | Manual fallback |
|---|---|---|---|---|---:|---|---|
| `pnpm typecheck` | Prove TypeScript contracts still compile. | Core engineering | Node 22, repo install | Default PR/push CI, before all release gates | 1-3 min | Block merge/release. Fix compile errors before trust gates are meaningful. | None. This is not deferrable. |
| `pnpm build` | Build API, web, CLI, MCP, worker artifacts used by runtime gates. | Core engineering | Node 22, repo install | Default PR/push CI, before leakage/OpenAPI/Compose runtime gates | 2-5 min | Block merge/release. Runtime checks must run against compiled artifacts where possible. | None. This is not deferrable. |
| `pnpm test` | Existing Postgres-backed and unit behavior coverage, including public-demo and auth tests. | Core engineering | Node 22, Postgres service in CI via `TEST_DATABASE_URL` | Default PR/push CI | 3-8 min | Block merge/release. | If CI DB is unavailable, rerun locally with documented `TEST_DATABASE_URL`; do not tag until green. |
| `pnpm --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings` | Enforce synthetic corpus metadata, stale review, surface consistency, and restricted public export validation. | Demo/corpus owner | Repo install | Default PR/push CI | <1 min | Block merge/release. Warnings are failures because demo corpus is public proof. | None for default corpus. |
| `docker compose config --quiet` | Validate base Compose syntax and interpolation. | Release engineering | Docker Compose CLI | Default PR/push CI if Docker available; otherwise release gate | <1 min | Block release; block PR if run in CI. | Run locally and attach command output to release checklist if hosted CI Docker is unavailable. |
| `docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet` | Validate same-origin proxy overlay used for browser-cookie self-hosting. | Release engineering | Docker Compose CLI | Default PR/push CI if Docker available; otherwise release gate | <1 min | Block release; block PR if run in CI. | Run locally and attach command output. |
| `docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet` | Validate HTTPS same-origin overlay and secure-cookie env wiring. | Release engineering | Docker Compose CLI; cert files not required for config parse | Default PR/push CI if Docker available; otherwise release gate | <1 min | Block release; block PR if run in CI. | Run locally and attach command output. |
| `pnpm openapi:check` | Detect drift between server contract and committed/versioned OpenAPI artifact. | API contract owner | Node 22, build complete | Default PR/push CI after build | <1 min | Block merge/release when route or schema changes are not reflected in the OpenAPI artifact. | If intentionally changing API, regenerate/update the artifact and include contract note in PR. |
| `pnpm claims:lint` | Block public-copy overclaims and risky category drift. | Product/release owner | Node 22; no network | Default PR/push CI for public docs and landing copy; release gate for tags | <1 min | Block merge/release with file, line, phrase, and suggested safer wording. | Product owner may approve a narrow inline allowlist with reason and expiry date. |
| `pnpm security:verify-restricted-leakage` | Prove restricted fixture does not leak into anonymous search, ungranted reader search, JSON export, or OKF export while admin search still works. | Security/retrieval owner | Built API reachable at `FORGETBASE_API_URL`; disposable DB/tenant; no real provider secrets | Default CI once script can start its own ephemeral API or CI boots API; release gate until then | 1-3 min after API is healthy | Block merge/release. Treat failures as possible data exposure until investigated. | Run against local Compose or staging with `FORGETBASE_API_URL=<origin>` and attach JSON output; follow restricted leakage runbook. |
| `pnpm smoke:compose` | Boot canonical Compose stack, bootstrap disposable admin, import corpus, run multiple retrieval requests, validate exports, and prove same-origin proxy health. | Release engineering | Docker daemon, free ports or override env ports, no external credentials | Docker-capable PR/push CI if runtime is stable; otherwise required release gate | 5-12 min | Block release. In PR CI, block if flake rate is controlled; otherwise quarantine as required pre-tag gate until stable. | Run locally from a clean clone and attach summarized evidence plus `docker compose ps`. |
| `pnpm db:verify-backup-restore` | Prove Postgres backup can restore into temporary DB and core table counts match. | Ops/release owner | Docker Compose Postgres running; enough disk for temporary dump; `docker compose exec` works | Manual/required release gate; optional scheduled CI, not default PR | 1-5 min depending DB size | Block tag/release. Count mismatch means recovery is not proven. | Run during release candidate checklist; if too slow, document DB size, timing, and latest passing evidence. |
| `pnpm auth:verify-oidc-login` | Prove OIDC flow with local fake provider and no real Entra credentials. | Auth owner | API with `FORGETBASE_OIDC_STATE_SECRET` and local fake provider script support | Optional default CI once stable; release gate for auth-sensitive changes | 1-3 min | Block auth-sensitive release if failing. Do not require for every PR until flake-free. | Manual local run with generated state secret. Real Entra remains separate. |
| `pnpm provider:smoke` | Secret-gated real provider managed-query/eval path. | Provider/runtime owner | Approved provider secret, budget/quota limit, explicit opt-in | Manual/secret-gated release gate only | 1-3 min | Blocks claims about real-provider beta proof, not core OSS beta if explicitly deferred. | Record as deferred unless manager approves provider cost/secrets. |
| `pnpm test:uat` | Browser UAT for canonical demo path after UI lane lands. | UI/release owner | Playwright/browser dependencies, running app | Release gate after UI work lands; not a prerequisite for this design | 5-15 min | Block beta readiness claim. | Manual browser walkthrough with screenshots until automation exists. |

## Default CI Versus Release Gates

Default PR/push CI should include only checks that are deterministic, secret-free, and reasonably fast:

```bash
pnpm typecheck
pnpm build
pnpm --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
pnpm test
docker compose config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
pnpm openapi:check
pnpm claims:lint
```

Add `pnpm security:verify-restricted-leakage` to default CI once the implementation either starts an ephemeral built API itself or the workflow starts the built API against the existing Postgres service. Until then, it is a release-blocking gate because the current script requires a running API.

Required release gates before beta tag:

```bash
pnpm security:verify-restricted-leakage
pnpm smoke:compose
pnpm db:verify-backup-restore
pnpm auth:verify-oidc-login
```

Manual or secret-gated release gates:

```bash
pnpm provider:smoke
pnpm test:uat
```

`provider:smoke` requires manager approval for real provider secrets and cost/quota limits. `test:uat` is deferred until the canonical UI walkthrough exists.

## Restricted Leakage Gate

Existing command:

```bash
pnpm security:verify-restricted-leakage
```

Current scope already creates a throwaway tenant and restricted fixture, then verifies:

- anonymous search returns no restricted fixture,
- ungranted reader search returns no restricted fixture,
- admin search can find the restricted fixture,
- broad reader JSON export excludes the fixture and reports denial,
- broad reader OKF export excludes both restricted stable ID and restricted token and reports denial.

Implementation notes:

- Keep the gate pointed at compiled/running API behavior, not raw TypeScript source.
- Make `FORGETBASE_API_URL` the only required runtime input.
- For CI, prefer a wrapper that starts `node apps/api/dist/index.js` against the CI Postgres service, waits on `/health`, runs the verifier, then stops the process.
- If global auth defaults change, do not weaken this verifier by reopening `/auth/bootstrap` publicly. Instead, add an explicit test-mode setup route only inside the verifier harness, or let the wrapper provision the disposable tenant through an authenticated seed path.

Acceptance evidence:

- JSON output includes `ok: true`, `tenantId`, `stableId`, zero anonymous/reader results, admin fixture inclusion, JSON denied count, and OKF denied count.
- No fixture token appears in unauthorized JSON or OKF output.

Failure behavior:

- Treat any unauthorized match as a release-blocking suspected leakage incident.
- Stop public-copy/release work until the restricted leakage investigation runbook has an owner and outcome.

## OpenAPI Drift Strategy

### Minimal Path Now

Add `pnpm openapi:check` with a small script that:

1. Imports the built `buildOpenApiDocument()` function after `pnpm build`.
2. Serializes it deterministically.
3. Compares it to a committed artifact, preferably `docs/openapi.json`.
4. Fails with a concise diff when output changed.

Proposed commands:

```bash
pnpm openapi:generate
pnpm openapi:check
```

`openapi:generate` updates `docs/openapi.json`. `openapi:check` regenerates into a temp file and compares.

This minimal gate catches changes to the hand-authored OpenAPI document. It does not prove every Fastify route is present, but it prevents silent artifact drift and is cheap enough for default CI.

### Route Coverage Add-On

Add a second lightweight check when practical:

- introspect Fastify routes after registering the server,
- normalize method/path pairs,
- compare against OpenAPI `paths`,
- allow explicit ignores for `/openapi.json`, health internals, or implementation-only routes.

This catches server routes added without OpenAPI entries even while the OpenAPI document remains hand-authored.

### Stronger Generated-Contract Path Later

After beta contract freeze, move toward generated or schema-derived OpenAPI:

- route definitions declare request/response schemas in one place,
- OpenAPI is generated from those definitions,
- SDK/CLI/MCP contract tests consume the generated artifact,
- breaking changes require a contract-change note and version/freeze decision.

Do not add a generator dependency until the API owner health-checks maintenance, OpenAPI 3.1 support, Fastify compatibility, schema reuse with the current Zod/shared-schema stack, and CI output stability.

## Claims Linter Proposal

Proposed command:

```bash
pnpm claims:lint
```

Default scan targets:

- `README.md`
- `docs/**/*.md`
- public landing/page copy once it exists
- `apps/web/src/**/*.{ts,tsx}` for user-visible copy
- `CHANGELOG.md`, release notes, and GitHub release body templates

Default exclusions:

- `docs/REMAINING_FUNCTIONAL_GAPS.md` when it is explicitly naming forbidden claims as warnings,
- `work/model-council/**` research artifacts,
- generated files,
- dependency directories.

Required rule shape:

| Rule | Blocked risky phrase or pattern | Safer allowed wording |
|---|---|---|
| Production readiness | `production-ready`, `prod ready`, `production grade`, `battle-tested`, `mission critical` | `public-alpha candidate`, `beta candidate`, `self-hosted core`, `production path still being hardened` |
| Hosted service maturity | `hosted-service-ready`, `managed hosted service`, `SaaS-ready`, `multi-tenant hosted` | `self-hostable core`, `hosted service later`, `hosted-service work deferred` |
| Enterprise identity completeness | `enterprise SSO complete`, `SCIM`, `MFA enforced`, `complete Entra`, `full identity lifecycle` | `local users`, `OIDC configuration foundation`, `SCIM and advanced identity hardening deferred` |
| Full orchestration | `full agent orchestration`, `managed-agent orchestration`, `autonomous task execution`, `connector execution platform` | `disabled-by-default action governance`, `managed orchestration future phase` |
| Broad enterprise search parity | `enterprise search`, `search everything`, `Glean replacement`, `Rovo replacement`, `knowledge base for all company content` | `governed instruction and context registry`, `permission-aware retrieval for agent assets` |
| Observability overclaim | `complete observability`, `full tracing`, `analytics warehouse`, `SOC-ready audit` | `telemetry and audit foundations`, `recent-window admin summary`, `advanced analytics deferred` |
| API stability overclaim | `stable API`, `backward compatible`, `GA contract`, `versioned public API` | `beta contract freeze pending`, `routes may change before beta` |
| Unqualified control-plane claim | `control plane` without nearby agent/instruction/context qualifier in public copy | `instruction control plane`, `agent context control plane`, or use public bridge terms like `headless CMS for AI agents` |

Implementation approach:

- Start with a local Node script and a JSON/YAML rule file in `scripts/claims-lint-rules.json`.
- Report file, line, matched phrase, rule ID, and suggested safer wording.
- Support inline exceptions only with a reason and expiry, for example `claims-lint-disable-next-line rule-id -- reason; expires YYYY-MM-DD`.
- Fail on expired exceptions.
- Keep rules deterministic. Do not use an LLM in CI.

Acceptance checks:

- A fixture file containing forbidden phrases fails.
- A fixture file using allowed beta wording passes.
- The linter does not fail `docs/REMAINING_FUNCTIONAL_GAPS.md` for documenting the forbidden terms.

## Compose Smoke Scope

Proposed command:

```bash
pnpm smoke:compose
```

Minimum useful flow:

1. Create a unique Compose project name and non-default ports to avoid local collisions.
2. Run `docker compose -p "$PROJECT" -f compose.yaml -f compose.same-origin.yaml up --build -d postgres migrate api worker web proxy`.
3. Wait for direct API health:

   ```bash
   curl --silent --show-error --fail http://127.0.0.1:${API_PORT}/health
   ```

4. Wait for same-origin proxy health:

   ```bash
   curl --silent --show-error --fail http://127.0.0.1:${PROXY_PORT}/api/health
   ```

5. Bootstrap disposable admin without printing the API key; extract it into a temp file/env var.
6. Import `corpus/demo/assets.json`.
7. Run the worker once if the import path does not already index all imported assets.
8. Prove more than one search request:

   ```bash
   curl --silent --show-error --fail "http://127.0.0.1:${API_PORT}/search?query=PII%20redaction&limit=3"
   curl --silent --show-error --fail "http://127.0.0.1:${API_PORT}/search?query=retention&limit=3&strategy=hybrid"
   curl --silent --show-error --fail "http://127.0.0.1:${PROXY_PORT}/api/search?query=PII%20redaction&limit=3"
   ```

9. Assert each search response has expected shape: `results` array, ranking metadata where present, and no 5xx.
10. Fetch OpenAPI through direct API:

    ```bash
    curl --silent --show-error --fail http://127.0.0.1:${API_PORT}/openapi.json
    ```

11. Fetch public JSON and OKF exports:

    ```bash
    curl --silent --show-error --fail "http://127.0.0.1:${API_PORT}/exports/ai-package?package=demo-agent-pack"
    curl --silent --show-error --fail "http://127.0.0.1:${API_PORT}/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1"
    ```

12. Fetch the web shell through same-origin proxy:

    ```bash
    curl --silent --show-error --fail http://127.0.0.1:${PROXY_PORT}/ | head
    ```

13. Run `docker compose ps` and write a compact JSON evidence summary.
14. Always run `docker compose -p "$PROJECT" down -v` in cleanup unless `KEEP_FORGETBASE_COMPOSE_SMOKE=1`.

TLS overlay extension:

```bash
bash scripts/generate-local-tls-certs.sh
docker compose -p "$PROJECT" -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml up -d proxy
curl --insecure --silent --show-error --fail https://127.0.0.1:${HTTPS_PORT}/api/health
```

Keep TLS as release-gate scope initially. Default PR CI can start with HTTP same-origin because HTTPS adds cert state and port contention.

Acceptance evidence:

- direct API `/health` passes,
- same-origin `/api/health` passes,
- at least two direct search requests pass,
- at least one same-origin proxied search passes,
- JSON and OKF public export fetches pass,
- web shell responds through proxy,
- cleanup succeeds.

Currently impossible or too slow for default CI:

- real provider-routed smoke without secrets and cost approval,
- real Microsoft Entra/OIDC tenant verification,
- browser UAT until the canonical beta UI flow exists,
- backup/restore on large realistic databases as a per-PR gate,
- full semantic OpenAPI generation without adding and health-checking a generator dependency.

## Backup/Restore Gate

Existing command:

```bash
pnpm db:verify-backup-restore
```

Placement:

- required before beta tag or release candidate,
- optional scheduled CI against a small synthetic DB,
- not default PR CI until runtime is proven fast and non-flaky.

Acceptance evidence:

- command exits zero,
- JSON output includes `backupPath`, temporary `restoredDatabase`, and matching core table counts,
- temporary restore DB is dropped by cleanup,
- backup dump is removed unless explicitly retained.

Known boundary:

- Current verification proves Postgres table coverage and basic restore integrity by count comparison.
- It does not prove object storage, attachments, generated export artifact persistence, or semantic business correctness. Those remain deferred until those storage surfaces exist.

## Secure-Default `requireAuthentication` Decision Brief

Current implementation:

- `FORGETBASE_REQUIRE_AUTHENTICATION` defaults to `false`.
- Invalid boolean values fail startup.
- When `requireAuthentication` is `true`, unauthenticated `/auth/bootstrap` is blocked with `401 authentication_required`.
- Public prototype guidance requires explicit `FORGETBASE_REQUIRE_AUTHENTICATION=true` and proxy-level bootstrap blocking.

### Option A: Keep Default `false`, Warn Loudly

Behavior:

- Local OSS quickstart remains simple.
- Public/demo reads still rely on asset-level `public-demo` + `active` + `approved` rules.
- Operators must opt into global auth for public prototypes/deployments.

Pros:

- Best first-run experience.
- Does not break existing bootstrap and demo flows.
- Fits local disposable Compose development.

Cons:

- Public exposure is easier to misconfigure.
- Secure posture depends on docs/runbooks and claims discipline.
- Beta trust story is weaker unless warnings and gates are strong.

### Option B: Default `true` Everywhere

Behavior:

- API blocks all non-public auth paths unless authenticated.
- Bootstrap cannot run anonymously unless a separate first-run setup mechanism exists.

Pros:

- Safer public default.
- Strong trust story.

Cons:

- Breaks current quickstart and restricted-leakage setup path.
- Requires a first-run admin setup token, local-only bootstrap bypass, or separate installer flow before implementation.
- Higher risk of shipping a confusing self-hosted beta.

### Option C: Contextual Default

Behavior:

- Local development/Compose can allow bootstrap by default.
- Public/proxy/deployment templates default to requiring auth and blocking bootstrap exposure.
- Startup warns or fails when risky public-ish env is detected without explicit auth posture.

Possible implementation:

- Keep app default `false` for local direct API unless explicitly set.
- Set `FORGETBASE_REQUIRE_AUTHENTICATION=true` in public prototype and deployment templates.
- Add startup warning when `HOST=0.0.0.0` and `FORGETBASE_REQUIRE_AUTHENTICATION` is unset.
- Add release gate that asserts public template/proxy paths block `/api/auth/bootstrap`.
- Consider a future `FORGETBASE_BOOTSTRAP_SETUP_TOKEN` before making global default `true`.

Pros:

- Preserves clean local OSS bootstrap.
- Moves public deployment posture toward secure-by-default.
- Avoids requiring real OIDC/provider credentials.

Cons:

- More nuanced than a single default.
- Requires clear docs and tests to prevent ambiguity.

### Recommendation

Recommend Option C for beta, with manager approval required before implementation.

Do not flip the API global default to `true` until there is a tested first-run setup-token or installer path. For beta, make public/deployment templates secure by default, add startup warnings for ambiguous public binds, keep local Compose fast to bootstrap, and make the release gate prove `/api/auth/bootstrap` is not reachable through the public same-origin/prototype path.

Decision acceptance checks:

- Local quickstart still works without real provider/OIDC credentials.
- Public deployment template requires auth and blocks bootstrap exposure.
- `security:verify-restricted-leakage` still runs without weakening public auth.
- Docs clearly distinguish local development, self-hosted private LAN, and public prototype exposure.
- Manager explicitly accepts the local-first versus public-secure tradeoff before code changes.

## Deferred And Manual Gates

| Gate | Why deferred/manual | Required evidence before claiming beta |
|---|---|---|
| Real provider smoke | Requires provider secret, cost/quota limit, and manager approval. | Manual command output with provider, model, quota cap, and redacted response metadata. |
| Real Entra/OIDC tenant verification | Requires external tenant configuration and credentials. | Manual release note or deferred statement; fake-provider OIDC can run without real credentials. |
| Browser UAT | Depends on canonical UI route/demo implementation. | Playwright report or manual screenshot walkthrough until automated. |
| Large-data backup/restore | Too slow and storage-dependent for default PR CI. | Small DB gate before tag; larger restore evidence when realistic corpus/storage exists. |
| Generated OpenAPI contract | Requires dependency choice and route/schema refactor. | Minimal hand-authored artifact drift gate now; generated-contract plan later. |

## Files Read

- `AGENTS.md` instructions supplied in delegation context
- `work/beta-execution/manager-execution-map.md`
- `docs/BETA_RELEASE_PLAN.md`
- `docs/REMAINING_FUNCTIONAL_GAPS.md`
- `docs/DEVELOPMENT.md`
- `docs/MVP_SCOPE.md`
- `README.md`
- `docs/END_TO_END_GOAL.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/DECISIONS.md`
- `.github/workflows/ci.yml`
- `package.json`
- `compose.yaml`
- `compose.same-origin.yaml`
- `compose.tls.yaml`
- `infra/docker/nginx.same-origin.conf`
- `infra/docker/nginx.tls.conf`
- `scripts/verify-restricted-leakage.sh`
- `scripts/verify-backup-restore.sh`
- `apps/api/src/openapi.ts`
- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`

## Proposed Commands By Placement

Default CI:

```bash
pnpm typecheck
pnpm build
pnpm --filter @forgetbase/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-16 --fail-on-warnings
pnpm test
docker compose config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml config --quiet
docker compose -f compose.yaml -f compose.same-origin.yaml -f compose.tls.yaml config --quiet
pnpm openapi:check
pnpm claims:lint
```

Default CI after small harness work:

```bash
pnpm security:verify-restricted-leakage
```

Required release gate:

```bash
pnpm smoke:compose
pnpm db:verify-backup-restore
pnpm auth:verify-oidc-login
```

Manual/secret-gated release gate:

```bash
pnpm provider:smoke
pnpm test:uat
```

## Next Implementation Slice

1. Add `openapi:generate` and `openapi:check` around a committed `docs/openapi.json` artifact.
2. Add `claims:lint` with deterministic rules and fixtures.
3. Add a `smoke:compose` script that writes compact JSON evidence and always cleans up.
4. Add a CI wrapper for `security:verify-restricted-leakage` that starts the built API against the existing CI Postgres service.
5. Ask manager to approve the secure-default Option C before changing auth defaults or deployment templates.
