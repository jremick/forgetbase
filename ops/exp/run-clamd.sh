#!/bin/bash
set -euo pipefail
EXP_TMP_SIZE=512m
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-clamd \
  --restart unless-stopped \
  --user 1000:1000 \
  --memory 3g \
  --network name=forgetbase-scan,ip=172.30.53.2 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/clamd.env \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/signatures,dst=/var/lib/clamav,readonly \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/config/clamd.conf,dst=/etc/clamav/clamd.conf,readonly \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/bin/start-clamd.sh,dst=/opt/exp/start-clamd.sh,readonly \
  --tmpfs /run/clamav:uid=1000,gid=1000,mode=0700,size=16m \
  --entrypoint /bin/sh \
  "${IMAGE_CLAMAV}" /opt/exp/start-clamd.sh
