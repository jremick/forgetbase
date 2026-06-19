# OKF Exports

ForgetBase supports Open Knowledge Format (OKF) as a generated agent package projection. The canonical source of truth remains the governed ForgetBase asset and asset version records.

## Supported Spec Version

- Current supported OKF version: `0.1`
- Status: draft
- Official spec source: `https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md`
- Last checked: `2026-06-18`

OKF support is enabled by default as an export format. Operators can request it through API, CLI, SDK, or MCP without enabling a feature flag.

## Generate

API:

```bash
curl --silent --show-error --fail "http://127.0.0.1:3000/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1"
```

CLI JSON wrapper:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- exports ai-package --package demo-agent-pack --format okf --okf-version 0.1
```

CLI Markdown bundle files:

```bash
npx -y pnpm@11.7.0 --filter @forgetbase/cli start -- exports ai-package --package demo-agent-pack --format okf --output-dir work/okf-demo-agent-pack
```

## Versioning Model

Every OKF package includes:

- `okfVersion`
- official spec source and check date
- `sourcePackageHash`
- `projectionHash`
- one `index.md` with root `okf_version`
- one `manifest.md` with update guidance
- one `log.md`
- one concept file per exported governed asset

Every concept file includes source asset metadata in YAML frontmatter:

- `stable_id`
- `asset_id`
- `source_version_id`
- `source_version_number`
- `source_content_hash`
- `allowed_surfaces`
- `allowed_exports`

Existing generated bundles should be treated as immutable release artifacts. Do not rewrite a distributed OKF bundle in place when the source asset version or OKF spec version changes. Generate a new bundle and compare `projectionHash` plus file diffs.

## Update Process

Before adding support for a newer OKF version:

1. Check the official GoogleCloudPlatform `knowledge-catalog/okf/SPEC.md` on `main`.
2. Check repository tags or release notes if Google starts publishing version tags.
3. Compare conformance criteria, required frontmatter fields, reserved filenames, and version declaration rules.
4. Add the new version beside existing support unless the change is purely backward-compatible.
5. Keep `0.1` generation available while existing downstream consumers or stored bundles depend on it.
6. Add fixture tests for the new version and an upgrade/regeneration note in this file.

When regenerating existing OKF content:

1. Start from canonical ForgetBase asset versions, not from prior generated Markdown.
2. Generate the target OKF version into a new output directory or artifact key.
3. Compare the old and new `manifest.md`, concept frontmatter, `source_content_hash`, and `projectionHash`.
4. Review restricted-export leakage before distribution.
5. Publish or distribute the new bundle only after the diff is expected.

## Boundary

OKF is a portable agent knowledge format, not the internal persistence model. ForgetBase permissions, review state, sensitivity, stable IDs, and source versions remain authoritative.
