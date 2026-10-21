#!/bin/bash
set -euo pipefail
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-worker \
  --restart unless-stopped \
  --user 1000:1000 \
  --memory 512m \
  --network name=forgetbase-db,ip=172.30.51.3 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/worker.env \
  "${IMAGE_WORKER}"
