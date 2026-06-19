# Beta Demo Spine: 15-Minute Governed Context Path

Status: spec-only handoff artifact
Last updated: 2026-06-19
Owner: demo spine worker
Source thread: 019edec7-6e44-7da1-b7aa-b3868bdd8625

## Goal

Get a fresh technical evaluator from clone to visible governed-context value in 15 minutes.

The demo must end with both:

- product UI evidence that a governed asset is reviewed, published, searchable, export-aware, and auditable
- downstream consumer evidence through API, CLI, MCP, JSON export, and OKF export

The demo must also prove that restricted content is blocked during normal search/export, not as a later appendix.

## Constraints

- Use synthetic demo data only; public-demo, internal, and restricted examples must all be fictional and reusable.
- Do not require provider credentials, external OIDC, hosted identity, or private/customer content.
- Do not print or persist raw secrets. Capture bootstrap secrets into local shell variables or temp files only.
- Do not loosen auth, permission, lifecycle, or export checks for demo convenience.
- Keep OKF as a generated export projection from canonical assets.
- Treat the browser UI as operational evidence, while API, CLI, MCP, and export consumers remain first-class product surfaces.

## Current Corpus Readiness

Current `corpus/demo/assets.json` has five assets:

| Stable ID | Type | State | Sensitivity | Export |
|---|---|---|---|---|
| `policy.ai-acceptable-use` | policy | active / approved | public-demo | `demo-agent-pack` |
| `guardrail.pii-redaction` | guardrail | active / approved | public-demo | `demo-agent-pack` |
| `playbook.incident-triage` | playbook | draft / reviewing | public-demo | blocked |
| `skill.pr-review-agent` | skill | active / approved | public-demo | `demo-agent-pack` |
| `template.agent-task-brief` | template | active / approved | public-demo | `demo-agent-pack`, `public-demo` |

Current `corpus/demo/evals.json` has three deterministic eval cases covering privacy/citations, acceptable use policy, and task-brief retrieval.

This is enough for a partial alpha demo: import, review queue, publish a draft playbook, search, CLI/API/MCP fetch, JSON/OKF export, eval, telemetry, and audit read-back.

It is not enough for the beta story because every current asset is `public-demo`. The full story needs a small synthetic corpus expansion that adds internal and restricted assets, plus explicit export-blocked examples. This is a targeted addition, not a large rewrite.

## Minimal Synthetic Corpus Additions

Add the smallest set of synthetic examples that make the governed path visible:

| Gap | Minimal addition | Purpose | Suggested stable ID |
|---|---|---|---|
| Internal example | Active approved internal operational doc or instruction | Shows non-public but non-restricted access boundary | `sop.internal-agent-release` |
| Restricted example | Active approved restricted credential-handling or incident-escalation instruction | Proves unauthorized search, MCP, API, and export blocking | `policy.restricted-credential-handling` |
| Export-blocked approved example | Active approved public-demo asset with `export` omitted or package omitted | Shows export eligibility is separate from readability | `playbook.public-demo-no-export` |
| Restricted export-blocked example | Restricted asset with no public export package | Gives leakage verifier a concrete blocked target | `runbook.restricted-security-escalation` |
| Review/publish example | Draft/reviewing asset that becomes active/approved during demo | Lets UI show queue, review, publish, audit | Existing `playbook.incident-triage` can serve this |
| Policy asset | Already present | `policy.ai-acceptable-use` is sufficient | No addition needed |
| Skill/playbook asset | Already present | `skill.pr-review-agent` and `playbook.incident-triage` are sufficient | No addition needed |
| Eval cases | Add one restricted-boundary eval and one export-eligibility eval | Prevents beta evals from only testing public search | `eval.restricted-block-boundary`, `eval.export-eligibility` |

Suggested content rules:

- Keep every example synthetic, generic, and reusable.
- Include obvious search terms in restricted examples, such as `credential vault escalation`, so the block proof can query for them deterministically.
- Include explicit `allowedSurfaces` and `allowedExports` differences so UI and exports can explain why an asset is readable, blocked, or omitted.
- Do not invent private company systems, staff names, customers, real secrets, real incident data, or real telemetry.

## 15-Minute Walkthrough

This is the target walkthrough after the minimal corpus additions above land. Commands assume a fresh clone, Node.js 22, Docker, and Docker Compose.

### 0. Fresh Clone And Baseline

```bash
git clone https://github.com/jremick/agentic-cms.git
cd agentic-cms
npx -y pnpm@11.7.0 install
npx -y pnpm@11.7.0 typecheck
npx -y pnpm@11.7.0 build
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- validate --file corpus/demo/assets.json --as-of 2026-06-19 --fail-on-warnings
```

Evidence to capture:

- Terminal output showing install/build/validation success.
- Note the validated corpus asset count.

### 1. Start The Local Compose Stack

```bash
docker compose -f compose.yaml -f compose.same-origin.yaml up --build -d postgres api worker web proxy
for attempt in $(seq 1 30); do
  curl --silent --show-error --fail http://127.0.0.1:3000/health && break
  if [ "$attempt" = "30" ]; then exit 1; fi
  sleep 1
done
curl --silent --show-error --fail http://127.0.0.1:8080/api/health
```

Evidence to capture:

- `docker compose ps`
- API health at `http://127.0.0.1:3000/health`
- same-origin proxy health at `http://127.0.0.1:8080/api/health`

### 2. Bootstrap Without Printing The Admin Secret

```bash
bootstrap_json="$(mktemp)"
curl --silent --show-error --fail \
  -H "content-type: application/json" \
  --data '{"tenantId":"tenant_demo","email":"admin@example.test","displayName":"Admin","password":"local-dev-password","keyName":"local-beta-demo-admin"}' \
  http://127.0.0.1:3000/auth/bootstrap > "$bootstrap_json"
export AGENTIC_CMS_API_KEY="$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).secret)' "$bootstrap_json")"
rm "$bootstrap_json"
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- auth me --api-url http://127.0.0.1:3000
```

Evidence to capture:

- `auth me` principal metadata only.
- No screenshot or log should show the raw API key.

### 3. Import The Synthetic Corpus

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- corpus import --api-url http://127.0.0.1:3000 --file corpus/demo/assets.json
DATABASE_URL=postgres://agentic_cms:agentic_cms_dev@127.0.0.1:${AGENTIC_CMS_POSTGRES_PORT:-5432}/agentic_cms npx -y pnpm@11.7.0 --filter @agentic-cms/worker start -- --once
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets list --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets review-queue --as-of 2026-06-19 --api-url http://127.0.0.1:3000
```

Evidence to capture:

- Asset list includes public-demo, internal, restricted, export-eligible, and export-blocked assets.
- Review queue includes `playbook.incident-triage`.

### 4. Browser Login And First UI Evidence

Open:

```text
http://127.0.0.1:8080/
```

Log in with:

```text
Tenant: tenant_demo
Email: admin@example.test
Password: local-dev-password
```

Evidence to capture:

- Landing/app shell loaded through same-origin proxy.
- Login state shown without exposing any API key.
- Library or Read surface showing governed assets.
- Asset detail for `guardrail.pii-redaction` showing lifecycle, sensitivity, status, allowed surfaces, export package, and stable ID.

### 5. Review And Publish A Draft Asset

CLI path:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets review playbook.incident-triage --review-due-at 2027-06-30 --status approved --change-note "Approve synthetic beta walkthrough playbook" --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets publish playbook.incident-triage --review-due-at 2027-06-30 --change-note "Publish for beta demo" --api-url http://127.0.0.1:3000
DATABASE_URL=postgres://agentic_cms:agentic_cms_dev@127.0.0.1:${AGENTIC_CMS_POSTGRES_PORT:-5432}/agentic_cms npx -y pnpm@11.7.0 --filter @agentic-cms/worker start -- --once
```

UI path:

- Open Work or Review Queue.
- Select `playbook.incident-triage`.
- Mark reviewed, then publish.
- Confirm status changes from `draft` / `reviewing` to `active` / `approved`.

Evidence to capture:

- Review queue before and after publish.
- Asset reader or trust rail showing active/approved state.
- Audit events for `asset.review` and `asset.publish`.

### 6. Search And Managed Query

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- search --query "PII redaction" --limit 3 --strategy hybrid --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- agent query --query "What should an agent do before storing personal identifiers in telemetry?" --limit 3 --api-url http://127.0.0.1:3000
curl --silent --show-error --fail "http://127.0.0.1:3000/search?query=PII%20redaction&limit=3&strategy=hybrid"
```

Evidence to capture:

- CLI search result with citations and ranking strategy.
- Managed query response with citations and `telemetryEventId`.
- UI Search or Managed Query result showing cited governed context, not raw corpus JSON.

### 7. Downstream API, CLI, And MCP Fetch

API fetch:

```bash
curl --silent --show-error --fail \
  -H "authorization: Bearer $AGENTIC_CMS_API_KEY" \
  -H "x-agentic-cms-surface: api" \
  http://127.0.0.1:3000/assets/guardrail.pii-redaction
```

CLI fetch:

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- assets get guardrail.pii-redaction --api-url http://127.0.0.1:3000
```

MCP fetch:

```bash
AGENTIC_CMS_API_URL=http://127.0.0.1:3000 AGENTIC_CMS_API_KEY="$AGENTIC_CMS_API_KEY" npx -y pnpm@11.7.0 --filter @agentic-cms/mcp-server exec node --input-type=module - <<'NODE'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', 'pnpm@11.7.0', '--filter', '@agentic-cms/mcp-server', 'start'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    AGENTIC_CMS_API_URL: 'http://127.0.0.1:3000',
    AGENTIC_CMS_API_KEY: process.env.AGENTIC_CMS_API_KEY ?? ''
  }
});
const client = new Client({ name: 'forgetbase-beta-demo', version: '0.1.0' });
await client.connect(transport);
const asset = await client.callTool({
  name: 'get_asset',
  arguments: { stableId: 'guardrail.pii-redaction' }
});
const search = await client.callTool({
  name: 'search_assets',
  arguments: { query: 'PII redaction', limit: 3, strategy: 'hybrid' }
});
console.log(JSON.stringify({ asset, search }, null, 2));
await client.close();
NODE
```

Evidence to capture:

- Same stable ID retrieved through API, CLI, and MCP.
- MCP tool names in use: `get_asset`, `search_assets`.
- Results preserve permission-aware context and citations.

### 8. JSON And OKF Export

```bash
curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack" > work/demo-agent-pack.json
curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1" > work/demo-agent-pack-okf.json
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- exports ai-package --package demo-agent-pack --api-url http://127.0.0.1:3000 --output work/demo-agent-pack-cli.json
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- exports ai-package --package demo-agent-pack --format okf --okf-version 0.1 --api-url http://127.0.0.1:3000 --output-dir work/okf-demo-agent-pack
```

MCP export:

```bash
AGENTIC_CMS_API_URL=http://127.0.0.1:3000 AGENTIC_CMS_API_KEY="$AGENTIC_CMS_API_KEY" npx -y pnpm@11.7.0 --filter @agentic-cms/mcp-server exec node --input-type=module - <<'NODE'
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', 'pnpm@11.7.0', '--filter', '@agentic-cms/mcp-server', 'start'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    AGENTIC_CMS_API_URL: 'http://127.0.0.1:3000',
    AGENTIC_CMS_API_KEY: process.env.AGENTIC_CMS_API_KEY ?? ''
  }
});
const client = new Client({ name: 'forgetbase-export-demo', version: '0.1.0' });
await client.connect(transport);
const jsonExport = await client.callTool({
  name: 'generate_ai_export',
  arguments: { packageName: 'demo-agent-pack', format: 'json' }
});
const okfExport = await client.callTool({
  name: 'generate_ai_export',
  arguments: { packageName: 'demo-agent-pack', format: 'okf', okfVersion: '0.1' }
});
console.log(JSON.stringify({ jsonExport, okfExport }, null, 2));
await client.close();
NODE
```

Evidence to capture:

- JSON package has stable IDs, sensitivity, allowed surfaces, citations/source refs, and omitted/denied counts where applicable.
- OKF projection includes `okfVersion` / `okf_version`, source version metadata, content hashes, and projection hash.
- UI Distribute/export surface shows included and omitted assets when that screen exists.

### 9. Restricted-Block Proof

This step must run before the demo is considered successful.

Run the built-in leakage verifier:

```bash
npx -y pnpm@11.7.0 security:verify-restricted-leakage
```

Then run visible proof commands against the synthetic restricted asset added for beta:

```bash
curl --silent --show-error --fail "http://127.0.0.1:3000/search?query=credential%20vault%20escalation&limit=10" > work/public-restricted-search.json
node -e 'const fs=require("fs"); const body=fs.readFileSync("work/public-restricted-search.json","utf8"); if (body.includes("policy.restricted-credential-handling") || body.includes("runbook.restricted-security-escalation")) { throw new Error("restricted content leaked to public search"); } console.log("restricted public search blocked");'

curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack" > work/public-demo-agent-pack.json
node -e 'const fs=require("fs"); const body=fs.readFileSync("work/public-demo-agent-pack.json","utf8"); if (body.includes("policy.restricted-credential-handling") || body.includes("runbook.restricted-security-escalation")) { throw new Error("restricted content leaked to public JSON export"); } console.log("restricted JSON export blocked");'

curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1" > work/public-demo-agent-pack-okf.json
node -e 'const fs=require("fs"); const body=fs.readFileSync("work/public-demo-agent-pack-okf.json","utf8"); if (body.includes("policy.restricted-credential-handling") || body.includes("runbook.restricted-security-escalation")) { throw new Error("restricted content leaked to public OKF export"); } console.log("restricted OKF export blocked");'
```

Evidence to capture:

- Leakage verifier success.
- Public search block proof.
- Public JSON export block proof.
- Public OKF export block proof.
- UI no-access or omitted/restricted explanation if available.

### 10. Telemetry And Audit Read-Back

```bash
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- telemetry summary --api-url http://127.0.0.1:3000
npx -y pnpm@11.7.0 --filter @agentic-cms/cli start -- audit events --limit 50 --api-url http://127.0.0.1:3000
curl --silent --show-error --fail \
  -H "authorization: Bearer $AGENTIC_CMS_API_KEY" \
  http://127.0.0.1:3000/telemetry/retrieval-events?limit=20
curl --silent --show-error --fail \
  -H "authorization: Bearer $AGENTIC_CMS_API_KEY" \
  http://127.0.0.1:3000/audit/events?limit=50
```

Evidence to capture:

- Retrieval telemetry exists for search and managed query.
- Audit events include bootstrap/user/key activity, corpus import if audited, review, publish, export, and denied restricted attempts where applicable.
- No raw secret appears in telemetry or audit output.

### 11. Cleanup

```bash
unset AGENTIC_CMS_API_KEY
docker compose -f compose.yaml -f compose.same-origin.yaml down
```

## Screenshot Shot List

Capture screenshots from `http://127.0.0.1:8080/` unless the browser UAT intentionally uses the Vite preview at `http://127.0.0.1:5175/`.

### Landing Page Proof Shots

1. First viewport: product UI visible, not abstract art. Show governed asset plus downstream consumer/export proof.
2. Asset reader: `guardrail.pii-redaction` with stable ID, sensitivity, lifecycle, status, review date, allowed surfaces, export package, source/hash/version metadata.
3. Review workflow: `playbook.incident-triage` before publish with draft/reviewing state and required checks.
4. Published state: same playbook after review/publish.
5. Search/managed query: cited answer or result list with ranking/citation diagnostics.
6. Distribution package: JSON/OKF preview with included and omitted assets plus package hash/projection hash.
7. Restricted no-access: restricted asset omitted/blocked with a clear reason, not a blank failure.
8. Telemetry/audit: recent retrieval and audit read-back without raw secrets.

### Browser UAT Shots

1. Login screen through same-origin proxy.
2. Logged-in app shell and health state.
3. Library/search list with public-demo, internal, restricted, export-eligible, and export-blocked states visible to admin.
4. Asset detail trust/provenance rail.
5. Review queue before and after publish.
6. Search results for `PII redaction`.
7. Managed query result with citations and `telemetryEventId`.
8. Export/distribution view or current export summary.
9. Restricted/no-access state for a broad-reader/public context.
10. Operations telemetry summary and audit list.
11. Mobile viewport: shell navigation, asset reader/search, and no overlapping controls.

Suggested screenshot paths for later UAT automation:

```text
work/screenshots/beta-demo/01-login.png
work/screenshots/beta-demo/02-library.png
work/screenshots/beta-demo/03-asset-trust-rail.png
work/screenshots/beta-demo/04-review-queue.png
work/screenshots/beta-demo/05-published-playbook.png
work/screenshots/beta-demo/06-search-citations.png
work/screenshots/beta-demo/07-distribute-export.png
work/screenshots/beta-demo/08-restricted-blocked.png
work/screenshots/beta-demo/09-telemetry-audit.png
work/screenshots/beta-demo/10-mobile-library.png
```

## Candidate `smoke:compose` Command

Future script name:

```bash
npx -y pnpm@11.7.0 smoke:compose
```

Candidate behavior:

1. Install/build expectation is caller-owned; the script may run `pnpm build` when `--build` is passed.
2. Validate `corpus/demo/assets.json` with `--fail-on-warnings`.
3. Start `postgres api worker web proxy` through `compose.yaml` plus `compose.same-origin.yaml`.
4. Wait for `http://127.0.0.1:3000/health` and `http://127.0.0.1:8080/api/health`.
5. Bootstrap admin via API into a temp file and export the secret only in process memory.
6. Import corpus.
7. Run worker `--once`.
8. Review and publish the designated draft demo asset.
9. Run public search and authenticated search.
10. Fetch one stable ID through API and CLI.
11. Run MCP `get_asset`, `search_assets`, and `generate_ai_export`.
12. Generate JSON and OKF exports.
13. Run `security:verify-restricted-leakage`.
14. Run explicit public search/export restricted-content absence checks.
15. Read back telemetry summary, retrieval events, and audit events.
16. Write a compact JSON evidence report to `work/smoke-compose-report.json`.
17. Stop Compose unless `--keep-running` is passed.

Minimum pass conditions:

- Health checks pass.
- Import count is non-zero and matches expected demo corpus count.
- Review/publish target becomes active/approved.
- Public search returns permitted public-demo results.
- Restricted stable IDs do not appear in public search, JSON export, or OKF export.
- MCP can fetch/search/export.
- Telemetry and audit read-back return at least one event after demo actions.

## Candidate `test:uat` Command

Future script name:

```bash
npx -y pnpm@11.7.0 test:uat
```

Candidate behavior:

1. Require a running same-origin app at `UAT_BASE_URL`, defaulting to `http://127.0.0.1:8080/`.
2. Use the same temp-file bootstrap/key pattern as the smoke script.
3. Import corpus and publish the designated demo playbook if needed.
4. Drive the browser through:
   - login
   - library/read surface
   - asset reader
   - review queue
   - publish confirmation
   - search
   - managed query
   - export/distribute summary
   - restricted/no-access or omitted proof
   - telemetry/audit operations read-back
5. Save screenshots to `work/screenshots/beta-demo/`.
6. Fail on console errors, failed network responses, blank main content, visible secret-like strings, and obvious layout overlap at desktop and mobile viewports.

Minimum pass conditions:

- Browser can log in with cookie-backed same-origin flow.
- No raw API key is visible in the UI.
- Required screenshots are produced.
- Search and managed query show citations.
- Review/publish state change is visible.
- Restricted/no-access state is visible or omitted assets are clearly explained.
- Telemetry/audit screen loads recent events.

## Implementation Notes For Later Workers

- Current corpus can support the review/publish and public export story, but not restricted/internal proof. Add the minimal synthetic corpus assets before turning this into a passing smoke.
- The current UI may not yet have a first-class Distribute route. Until the app IA work lands, capture the existing export summary and CLI/MCP export evidence, then mark first-class package-builder UI as an open UI dependency.
- Keep `security:verify-restricted-leakage` in the walkthrough even after explicit node-based absence checks exist. The verifier is the release gate; the visible commands are demo evidence.
- If provider-routed managed query, real OIDC, or hosted deploy verification enters this path, stop and split it into a separate gated beta proof because it requires external credentials or identity setup.

## Verification Evidence For This Spec Pass

This pass was spec-only. I did not start Docker Compose, inspect the browser, import corpus, run the app, or take screenshots.

Commands run:

```text
read local maintainer ADHD helper skill instructions
search local maintainer Codex memory registry for agentic-cms, ForgetBase, OKF, demo spine, and restricted-leakage context
pwd && rg --files | rg '(^README\.md$|^docs/(BETA_RELEASE_PLAN|DEVELOPMENT|MVP_SCOPE|REMAINING_FUNCTIONAL_GAPS|END_TO_END_GOAL|TECHNICAL_SPEC|DECISIONS)\.md$|^work/beta-execution/manager-execution-map\.md$|^corpus/demo/(assets|evals)\.json$|AGENTS\.md$)'
git status --short
sed -n '1,240p' README.md
sed -n '1,260p' docs/END_TO_END_GOAL.md
sed -n '1,320p' docs/TECHNICAL_SPEC.md
sed -n '1,260p' docs/DECISIONS.md
sed -n '1,320p' docs/BETA_RELEASE_PLAN.md
sed -n '1,320p' docs/DEVELOPMENT.md
sed -n '1,320p' docs/MVP_SCOPE.md
sed -n '1,320p' docs/REMAINING_FUNCTIONAL_GAPS.md
sed -n '321,760p' docs/DEVELOPMENT.md
sed -n '321,760p' docs/BETA_RELEASE_PLAN.md
sed -n '1,320p' work/beta-execution/manager-execution-map.md
jq -r 'if type=="array" then "asset_count=\(.|length)", (.[].stableId // .[].stable_id // empty) else "top_keys=\(keys|join(","))" end' corpus/demo/assets.json
jq -r '.assets | "asset_count=\(length)", (map({stableId, type, title, lifecycleState, sensitivity, status, allowedSurfaces, allowedExports}) | .[]) | @json' corpus/demo/assets.json
jq -r 'if type=="array" then "eval_count=\(.|length)", (.[]|@json) elif has("cases") then "eval_count=\(.cases|length)", (.cases[]|@json) else "top_keys=\(keys|join(","))", . end' corpus/demo/evals.json
jq -r '.assets[] | select((.sensitivity|test("restricted|internal|confidential|secret";"i")) or ((.allowedExports // [])|length==0) or ((.allowedSurfaces // [])|index("export")|not)) | {stableId,type,title,sensitivity,status,lifecycleState,allowedSurfaces,allowedExports,summary} | @json' corpus/demo/assets.json
jq -r '.assets[] | select((.type|test("policy|skill|playbook|eval|instruction|document";"i")) or (.stableId|test("policy|skill|playbook|eval|guardrail|sop";"i"))) | {stableId,type,title,sensitivity,status,lifecycleState,allowedSurfaces,allowedExports} | @json' corpus/demo/assets.json
rg -n "get\('/assets|get\('/search|get\('/exports|post\('/auth/bootstrap|post\('/assets|publish|audit|telemetry|review" apps/api/src packages/cli/src packages/mcp-server/src | head -n 220
rg -n "program\.command|\.command\(" packages/cli/src/index.ts | head -n 220
rg -n "name: '|name: \"|server.tool|tool\(" packages/mcp-server/src/server.ts | head -n 220
find work/beta-execution -maxdepth 1 -type f -print | sort
sed -n '1320,1425p' packages/cli/src/index.ts
sed -n '1940,2055p' apps/api/src/server.ts && sed -n '2430,2505p' apps/api/src/server.ts && sed -n '3750,3815p' apps/api/src/server.ts
sed -n '1,115p' packages/mcp-server/src/server.ts && sed -n '1368,1445p' packages/mcp-server/src/server.ts
sed -n '1,220p' package.json
rg -n "server\.get\(\"/exports|server\.post\(\"/exports|exports/ai-package|generate_ai_export|search_assets|managed_query" apps/api/src/server.ts packages/mcp-server/src/server.ts packages/sdk/src packages/cli/src/index.ts
sed -n '120,190p' packages/mcp-server/src/server.ts
sed -n '1445,1488p' packages/mcp-server/src/server.ts
sed -n '2468,2504p' apps/api/src/server.ts
rg -n "function readSurface|const readSurface|readSurface" apps/api/src/server.ts packages/sdk/src/index.ts
sed -n '7808,7826p' apps/api/src/server.ts
sed -n '1,260p' work/beta-execution/demo-spine-15-minute-path.md
sed -n '261,620p' work/beta-execution/demo-spine-15-minute-path.md
sed -n '621,980p' work/beta-execution/demo-spine-15-minute-path.md
git status --short -- work/beta-execution/demo-spine-15-minute-path.md
sed -n '1,120p' packages/cli/src/index.ts
rg -n "api-url|AGENTIC_CMS_API_URL|baseUrl|readOption\(.*--api-url" packages/cli/src/index.ts packages/sdk/src/index.ts
rg -n "auth me|case \"me\"|telemetry summary|case \"summary\"|case \"search\"" packages/cli/src/index.ts
sed -n '1100,1120p' packages/cli/src/index.ts
sed -n '340,390p' packages/cli/src/index.ts
sed -n '850,885p' packages/cli/src/index.ts
```

No app/browser URL was inspected in this pass. No screenshots were created.
