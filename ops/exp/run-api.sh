#!/bin/bash
set -euo pipefail
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-api \
  --restart unless-stopped \
  --user 1000:1000 \
  --memory 768m \
  --network name=forgetbase-net,ip=172.30.50.4 \
  --network name=forgetbase-db,ip=172.30.51.4 \
  --network name=forgetbase-scan,ip=172.30.53.4 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/api.env \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/attachments,dst=/var/lib/forgetbase/attachments \
  "${IMAGE_API}"
