#!/bin/bash
set -euo pipefail
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-pgvector \
  --restart unless-stopped \
  --user 999:999 \
  --memory 1g \
  --network name=forgetbase-db,ip=172.30.51.2 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/pgvector.env \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/postgres,dst=/var/lib/postgresql/data \
  --tmpfs /var/run/postgresql:uid=999,gid=999,mode=0700,size=16m \
  "${IMAGE_POSTGRES}" postgres -c password_encryption=scram-sha-256
