# Author, publish, consume, and revoke governed guidance

Use this workflow to keep an agent instruction and its human explanation under one asset's review, publication, and access policy. The instruction and Markdown document remain separate records. They share a stable asset ID and version, so API, CLI, MCP, and the reader can refer to the same approved release.

The supported instruction editor is a JSON file submitted through the CLI or SDK. The browser editor currently authors Markdown pages. A new browser instruction editor is not required for this workflow.

## Prepare the client

Run commands from the repository root with its supported Node and pnpm versions. Install and build the workspace first. Supply `FORGETBASE_API_KEY` through the operator's approved secret mechanism. The examples use an administrator account; maintainers need `asset:read` and `asset:write` scopes plus read and write grants on each existing target asset and request surface.

```sh
export FORGETBASE_API_URL="https://your-forgetbase.example/api"
fb() { pnpm --filter @forgetbase/cli start -- "$@"; }
fb auth me
```

The public proxy uses an `/api` base path. A direct local API uses `http://127.0.0.1:3000`. Use the user ID returned by `auth me` as `ownerId` below. Keys must allow the `cli` surface for these commands.

## Create a draft with both forms of guidance

Save this as `asset.json`, replacing the owner ID. `stableId` is the durable reference used by readers and tools.

```json
{
  "stableId": "playbook.release-checklist",
  "type": "playbook",
  "ownerId": "replace-with-your-user-id",
  "title": "Release checklist",
  "summary": "Checks required before promoting a release.",
  "lifecycleState": "draft",
  "status": "draft",
  "sensitivity": "internal",
  "audience": ["release-operators"],
  "reviewDueAt": "2027-12-31",
  "sourceKind": "manual",
  "allowedSurfaces": ["api", "cli", "mcp", "web", "export"],
  "allowedExports": ["release-operations"],
  "instruction": {
    "instructionKind": "playbook",
    "targetAgents": ["release-agent"],
    "body": "Before promotion, verify the release checklist and record the recovery checkpoint.",
    "constraints": ["Stop if a required check fails."],
    "failureModes": ["Promoting an unverified release."],
    "escalation": "Ask the release owner to resolve a failed check."
  },
  "humanDocument": {
    "format": "markdown",
    "body": "# Release checklist\n\nBefore promotion, verify the release checklist and record the recovery checkpoint. Stop if a required check fails."
  }
}
```

```sh
fb validate --file asset.json
fb assets create --file asset.json
fb assets get playbook.release-checklist --preview
fb assets list --preview
```

The preview includes the editing head and version history. Ordinary `assets get`, list, search, managed query, reader, and exports exclude a never-published draft. Preview requires both current target read and write permission; a read grant alone is insufficient.

For this co-versioned workflow, omit `humanDocument.linkedInstructionIds`. That optional field contains database record IDs and does not currently provide verified, stable links across version changes. The asset ID and shared version provide the supported relationship between its instruction and human document.

## Review and publish

```sh
fb assets review playbook.release-checklist --review-due-at 2027-12-31 --change-note "Reviewed release guidance"
fb assets publish playbook.release-checklist --change-note "Publish reviewed release guidance"
fb assets get playbook.release-checklist
fb search --query "recovery checkpoint"
fb agent query --query "What must happen before release promotion?" --mode deterministic-retrieval
```

Review records approval metadata; it does not publish. Publish creates the approved version and advances `publishedVersionId`. Ordinary detail exposes that version as `currentVersionId`, returns only its version entry, and uses its title, source, metadata, instruction, and document. Search and managed-query citations identify that published version and the instruction or human-document source.

The `deterministic-retrieval` query mode does not call a model provider. It verifies retrieval and citations, not the quality of a model-generated answer.

Grant readers access on the surfaces they use. As an administrator, replace the reader ID in this example:

```sh
fb auth grant --stable-id playbook.release-checklist --principal-type user --principal-id replace-with-reader-id --action read --surfaces api,cli,mcp,web
```

An asset's surface policy, the key's allowed surfaces, scopes, and grants all apply. Export needs a separate `export` action grant and the named package in `allowedExports`.

## Edit without changing approved guidance

Save the changed content as `update.json`:

```json
{
  "lifecycleState": "draft",
  "status": "draft",
  "changeNote": "Require a tested recovery checkpoint",
  "instruction": {
    "instructionKind": "playbook",
    "targetAgents": ["release-agent"],
    "body": "Before promotion, verify the release checklist and confirm the recovery checkpoint passed a restore test.",
    "constraints": ["Stop if a required check or restore test fails."]
  },
  "humanDocument": {
    "format": "markdown",
    "body": "# Release checklist\n\nVerify the release checklist and confirm the recovery checkpoint passed a restore test before promotion."
  }
}
```

```sh
fb assets update playbook.release-checklist --file update.json
fb assets get playbook.release-checklist --preview
fb assets get playbook.release-checklist
fb assets review playbook.release-checklist --review-due-at 2027-12-31
fb assets publish playbook.release-checklist
```

The two reads differ until publication. The preview shows the edit; ordinary reads and retrieval retain the previous approved version. Supplying `status: approved` in an update still does not publish it. Update fields within a supplied `instruction` or `humanDocument` replace that object; include every field you intend to retain. An omitted object is copied from the editing head.

For concurrent editing, pass the editing head's `currentVersionId` from an authorized preview as `expectedVersionId` in update JSON or SDK input. The CLI also accepts `--expected-version-id` on update, review, publish, and restore. Capture a fresh preview before each operation; review and publish each create a new version. The Admin UI captures the version when editing starts and sends it on saves and lifecycle actions.

```sh
fb assets get playbook.release-checklist --preview
fb assets update playbook.release-checklist --file update.json --expected-version-id replace-with-preview-current-version-id
```

If that head has changed, the API returns `409 asset_version_conflict` without modifying content or creating another version. An exact retry after a successful commit also returns 409 with the old precondition, so it cannot duplicate the mutation. Fetch the current preview and compare before deciding what to submit; do not blindly replace the expected version and replay a stale edit. The precondition is optional for compatibility, so older clients that omit it do not receive this concurrency protection.

Tightening sensitivity or allowed surfaces immediately restricts published access. An unpublished change cannot widen the approved version's sensitivity or allowed surfaces, exports, and actions. Setting lifecycle to `deprecated`, `archived`, or `restricted` withdraws publication.

Restore copies historical content into a new draft and preserves current access restrictions. Review and publish the restored draft before consumers receive it:

```sh
fb assets version playbook.release-checklist --version-number 1
fb assets restore playbook.release-checklist --version-number 1 --change-note "Prepare earlier guidance for review"
fb assets get playbook.release-checklist --preview
fb assets publish playbook.release-checklist
```

Version-history reads require the same permission as preview. Restoring an archived asset does not silently republish it.

## Import a small corpus

`corpus import` accepts one asset object, a JSON array of assets, or `{ "assets": [...] }`:

```sh
fb validate --file corpus.json
fb corpus import --file corpus.json
```

Import creates missing assets and skips existing assets visible in the authorized preview. This makes a retry recognize existing drafts. It does not update, merge, delete, or roll back a partially imported corpus. Unauthorized existing targets fail access checks. Use the explicit update/review/publish commands to change existing content.

The input's initial publication state matters: `active` plus `approved` creates an immediately published asset for already-reviewed imports. Use `draft` plus `draft` for content that still needs review. Keep approved production import policy separate from the synthetic demo corpus.

## SDK, MCP, and revocation

SDK clients use the same workflow methods: `createAsset`, `updateAsset`, `reviewAsset`, `publishAsset`, and `restoreAssetVersion`. `getAsset(stableId)` and `listAssets()` are ordinary reads; pass `{ preview: true }` for authorized editing. The MCP `get_asset`, `search_assets`, and `managed_query` tools consume the published version. Historical MCP `get_asset_version` requires preview capability. MCP currently has review/publish tools; create and update instruction JSON through the CLI or SDK.

Use the SDK grant inventory to revoke the exact grant. With an authenticated administrator `client`:

```ts
const page = await client.listAssetPermissionGrants("playbook.release-checklist");
// Select the intended grant by principal, action, and surface; use nextCursor for later pages.
await client.revokeAssetPermissionGrant("playbook.release-checklist", selectedGrant.id);
```

Verify with the same reader credentials after revocation: detail must deny access and search/managed-query context must exclude the asset. Review other user, group, and service-account grants if access remains: removing one grant does not remove another valid grant. Export grants are independent of read grants.

## Verification

`scripts/governed-workflow.test.ts` runs the CLI against an ephemeral local HTTP API and connects a real MCP client over the SDK's in-memory transport. It covers paired instruction/document authoring, draft import retries, review before publish, citation version consistency, retained published content during edits, explicit promotion, and grant revocation using the already-connected clients. Its corpus, identities, and credentials are synthetic. It does not contact Railway or a model provider.

The browser authoring UAT also checks that ordinary reads exclude the new draft after create and review, then expose the authored document after publish. The rendered run remains a separate release check.
