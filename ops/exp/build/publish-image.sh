#!/usr/bin/env bash
set -euo pipefail

component="${1:?usage: publish-image.sh api|worker|proxy|backup}"
case "$component" in api|worker|proxy|backup) ;; *) exit 2 ;; esac
: "${GITHUB_SHA:?}" "${FORGETBASE_SOURCE_REVISION:?}" "${GITHUB_STEP_SUMMARY:?}"
: "${GITHUB_SERVER_URL:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_RUN_ID:?}"
image="ghcr.io/jremick/forgetbase-exp-${component}:${GITHUB_SHA}"
output="image-artifact"
mkdir -p "$output"
docker push "$image"
image_ref="$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")"
image_id="$(docker image inspect --format '{{.Id}}' "$image")"
[[ "$image_ref" =~ ^ghcr.io/jremick/forgetbase-exp-${component}@sha256:[0-9a-f]{64}$ ]]
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]]
docker save --output "$output/image.tar" "$image"
tar_sha256="$(sha256sum "$output/image.tar" | cut -d ' ' -f 1)"
printf '%s  image.tar\n' "$tar_sha256" > "$output/image.tar.sha256"
export component image image_ref image_id tar_sha256
python3 - <<'PY'
import json
import os
from pathlib import Path

metadata = {
    "component": os.environ["component"],
    "source_revision": os.environ["FORGETBASE_SOURCE_REVISION"],
    "build_revision": os.environ["GITHUB_SHA"],
    "release_version": os.environ["FORGETBASE_RELEASE_VERSION"],
    "platform": "linux/amd64",
    "tag": os.environ["image"],
    "image_ref": os.environ["image_ref"],
    "digest": os.environ["image_ref"].split("@", 1)[1],
    "image_id": os.environ["image_id"],
    "tar_file": "image.tar",
    "tar_sha256": os.environ["tar_sha256"],
    "run_url": f'{os.environ["GITHUB_SERVER_URL"]}/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
}
Path("image-artifact/metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
    summary.write(f'### forgetbase {metadata["component"]}\n\n')
    for key, value in metadata.items():
        summary.write(f"- {key}: `{value}`\n")
PY
