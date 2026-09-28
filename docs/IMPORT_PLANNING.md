# Report-only import planning

Operators and agents can compare a declared source snapshot with ForgetBase's current editing versions before deciding what to change. Planning returns classifications. It does not create assets, versions, grants, publications, index jobs, or connected-source changes. Normal API authentication bookkeeping can still update key/session usage.

Use the same workflow through `POST /imports/plan`, SDK `planImport`, CLI `corpus plan`, or MCP `plan_import`. The reader UI does not expose this operator workflow. Existing `corpus import` remains create-or-skip and does not consume a plan.

## Try the synthetic example

With an API running and a maintainer or admin key in `FORGETBASE_API_KEY`:

```bash
node packages/cli/dist/index.js corpus plan \
  --api-url http://127.0.0.1:3000 \
  --file corpus/demo/import-plan.json \
  --fail-on-conflicts
```

The example proposes one new draft in tenant `tenant_demo`. Its owner and source content are synthetic. Planning it requires no provider or connected source. Change the tenant and map owners deliberately for another installation.

The CLI prints a JSON report. By default, any successfully returned report exits 0, including an incomplete report. `--fail-on-conflicts` exits 1 if classification is incomplete or contains conflicts. Invalid input, authentication, permission, and transport failures exit nonzero through the normal CLI error path. `--file` is required; planning never falls back to an import corpus.

An SDK caller uses `await client.planImport(input)`. An MCP caller invokes `plan_import` with `{ "input": input }`; the tool declares read-only, non-destructive and idempotent behavior. API callers send the same JSON input to `/imports/plan`. The OpenAPI document describes the complete request and report schemas.

## Input and provenance

The input has three fields:

- `tenantId`: must match the authenticated principal; defaults to `tenant_demo`.
- `snapshot`: manifest version `3`, source identity, capture time, source revision, correlation and snapshot IDs, completeness and continuation declarations, source records, and source access descriptors.
- `candidates`: up to 200 mappings, each with a source ID, source content SHA-256, effective-access descriptor, and typed governed snapshot containing asset metadata plus instruction/document bodies.

The [example input](../corpus/demo/import-plan.json) shows all required fields. The schema package exports `ImportPlanRequest` and `importPlanRequestSchema` from `@forgetbase/schema/import-planner`.

Source records describe the caller's snapshot. The planner does not connect to or independently authenticate a source system. `sourceContentSha256` binds records to candidates; ForgetBase computes candidate governed hashes itself. A source descriptor identifies `system`, `rootId`, `scopeId`, and `sourceRefPrefix`. Use `deriveImportSourceScopeId` from the same schema subpath to derive its deterministic scope ID. Do not reuse a scope ID across different roots or reference prefixes.

Each candidate's asset snapshot must have:

- `sourceKind` equal to the declared source system;
- `sourceRef` equal to its record's provenance path, within the source reference prefix and without surrounding whitespace;
- `metadata.importSource` containing exactly `system`, `rootId`, `scopeId`, `sourceScopeId`, and `sourceId`, matching the declared identity.

This metadata convention identifies existing imported targets, whose `sourceKind` must also match the stored source system. Targets with a colliding stable ID or source reference but a different or missing identity are not silently adopted. Source scope alone never establishes permission. To classify a previously mapped source as missing, include its candidate and exact persisted provenance alongside a complete source snapshot that omits that source ID. Omission never proposes deletion.

Access descriptors include lifecycle, publication/review state, sensitivity, audience, allowed surfaces/exports/actions, and effective grants. Snapshot-backed fields must agree with the actual candidate content. Unknown access remains unproven. Source access and proposed grants are declarations; the server resolves existing target grants itself. Planning does not approve a source-to-target access policy.

The API rejects caller-supplied candidate hashes, verified flags, mapping manifests, target manifests, and target revision assertions. The low-level schema planner is a local classification library; its checksums are consistency checks, not signatures or authorization credentials.

## Permissions and consistent reads

The caller must be authenticated as a maintainer or admin with both `asset:read` and `asset:write` scopes. The API key and all candidates must allow the requested surface. Every relevant existing target must allow the caller both read and write access on that surface. An inaccessible target denies the entire request with a generic 403 response; it cannot become a false `would-create` result.

The API reads current editing heads, including drafts, rather than the published reader projection. It scans relevant scope targets and identity collisions before permission filtering. It checks the tenant content revision before and after capture, reads each complete grant inventory twice, and rechecks access and principal identity. A detected concurrent change returns 409; retry the same request. This is an optimistic point-in-time report, not a transaction reservation or an apply precondition.

The HTTP body uses the API's 1 MiB limit. Metadata nesting is limited to 32 levels and total JSON values to 100,000. Planning scans at most 5,000 tenant assets, returns at most 200 relevant targets, and reads at most 2,000 effective grant entries per target. Exceeding the target budget returns 409 instead of classifying a partial inventory. Reduce the source scope or use a smaller installation; the API does not paginate a plan.

## Reports and failures

Each source and existing target receives a terminal classification: `would-create`, `would-update-version`, `would-noop`, `would-source-missing`, `conflict`, or `excluded`. An existing matched asset normally contributes two rows and two counts: one source and one target. Proposed creates and updates remain draft/review proposals.

Reports contain identity references, hashes, revisions, reasons, counts and `planDigest`. They omit content bodies, titles and grant principals. IDs and hashes can still be sensitive; store reports under the same access boundary as the source and target corpus. Responses use `Cache-Control: no-store`.

`classificationComplete` means every declared identity was classified without unresolved issues or truncated evidence. If any issue remains, the planner removes every `would-*` conclusion and retains conflicts/exclusions for review. Every report sets `executable: false` and `safeToApply: false`; no report is accepted by an apply endpoint.

The same input and unchanged relevant target state produce the same report and digest. A new capture time, correlation ID, source revision, target version, or target grant changes the evidence and can change the digest. Target manifest capture markers are deterministic and are not a server wall-clock timestamp.

Failure responses:

| Status | Meaning |
| --- | --- |
| 400 | Invalid schema, provenance, declared identity, or JSON complexity. |
| 401 | Missing, invalid, expired or revoked authentication. |
| 403 | Wrong tenant, role, scope, surface, or target permission. |
| 409 | Target state changed during capture, or a target inventory budget was exceeded. |
| 413 | Request exceeds the API body limit. |
| 503 | Registry or authentication service is unavailable. |

Semantic duplicates, conflicting mappings, incomplete source snapshots and unproven access return a 200 report with incomplete classification, rather than an executable proposal. Unexpected server failures use the API's sanitized error handler.

## Compatibility and verification

The persisted `governed-v1` hash algorithm is unchanged: it sorts object entries using the existing locale comparison, reconstructs objects, and uses `JSON.stringify`. JSON numeric-index ordering remains part of that byte contract, including nested metadata. Import manifest/report hashes use the separate `import-json-v1` canonicalizer. Neither contract is a substitute for authorization.

Run the repeatable consumer proof with synthetic data:

```bash
FORGETBASE_IMPORT_PLAN_EVIDENCE=work/import-plan-proof.json \
  pnpm exec vitest run scripts/import-planner-workflow.test.ts
```

Set `TEST_DATABASE_URL` to an isolated test database to exercise the PostgreSQL adapter too. The command writes `.memory.json` and, when enabled, `.postgres.json` evidence beside the requested output path. The proof covers API, SDK, CLI and MCP agreement; drafts; numeric metadata; creates, updates and no-ops; missing sources; conflicts and duplicates; invalid input; restricted and revoked access; concurrent target/grant changes; repeated digests; and unchanged governed state. It never imports a private corpus or invokes a model provider.

This additive feature needs no database migration. Reverting its code removes planning without changing stored assets or hashes. Deployment and release verification remain separate gates.
