#!/usr/bin/env bash
set -euo pipefail

component="${1:?usage: build-image.sh api|worker|proxy|backup}"
case "$component" in api|worker|proxy|backup) ;; *) exit 2 ;; esac
: "${GITHUB_SHA:?}" "${FORGETBASE_SOURCE_REVISION:?}" "${FORGETBASE_RELEASE_VERSION:?}"

# Application files must still be the approved source revision.
git merge-base --is-ancestor "$FORGETBASE_SOURCE_REVISION" HEAD
git diff --exit-code "$FORGETBASE_SOURCE_REVISION" HEAD -- . \
  ':(exclude)ops/exp/**' ':(exclude).github/workflows/exp-images.yml'
image="ghcr.io/jremick/forgetbase-exp-${component}:${GITHUB_SHA}"
source_date_epoch="$(git show -s --format=%ct "$FORGETBASE_SOURCE_REVISION")"
docker build --platform linux/amd64 \
  --file "ops/exp/Dockerfile.${component}" --tag "$image" \
  --build-arg "FORGETBASE_SOURCE_REVISION=${FORGETBASE_SOURCE_REVISION}" \
  --build-arg "FORGETBASE_SOURCE_DATE_EPOCH=${source_date_epoch}" \
  --build-arg "FORGETBASE_RELEASE_VERSION=${FORGETBASE_RELEASE_VERSION}" .

common=(--rm --network none --cap-drop ALL --security-opt no-new-privileges
  --read-only --tmpfs /tmp:size=64m --pids-limit 256 --memory 512m --cpus 1)
case "$component" in
  api)
    docker run "${common[@]}" --entrypoint node "$image" --check apps/api/dist/index.js
    docker run "${common[@]}" --entrypoint node "$image" --check packages/db/dist/migrate.js
    ;;
  worker)
    docker run "${common[@]}" --entrypoint node "$image" --check apps/worker/dist/index.js
    ;;
  proxy)
    docker run "${common[@]}" \
      --tmpfs /etc/nginx/conf.d:uid=101,gid=101,mode=0700,size=1m \
      --tmpfs /var/cache/nginx:uid=101,gid=101,mode=0700,size=16m \
      "$image" nginx -t
    ;;
  backup)
    docker run "${common[@]}" --entrypoint bash "$image" -ceu \
      'test "$(id -u)" = 999; command -v pg_dump pg_restore psql age rclone bash tar curl sha256sum; pg_dump --version'
    ;;
esac
