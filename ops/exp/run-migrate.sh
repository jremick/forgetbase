#!/bin/bash
set -euo pipefail
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-migrate \
  --restart no \
  --user 1000:1000 \
  --memory 768m \
  --network name=forgetbase-db,ip=172.30.51.6 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/migrate.env \
  "${IMAGE_API}" node --use-openssl-ca packages/db/dist/migrate.js
