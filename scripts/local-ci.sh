#!/usr/bin/env bash
# Portable CI and release-check entrypoint. Usage and evidence contract: docs/LOCAL_CI.md.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
if ! command -v node >/dev/null 2>&1; then
  echo "local-ci: Node.js must be on PATH" >&2
  exit 2
fi
exec node "$root/scripts/local-ci.mjs" "$@"
