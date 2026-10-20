#!/bin/bash
set -euo pipefail
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-proxy \
  --restart unless-stopped \
  --user 101:101 \
  --memory 64m \
  --network name=forgetbase-net,ip=172.30.50.3 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/proxy.env \
  --tmpfs /etc/nginx/conf.d:uid=101,gid=101,mode=0700,size=1m \
  --tmpfs /var/cache/nginx:uid=101,gid=101,mode=0700,size=16m \
  "${IMAGE_PROXY}"
