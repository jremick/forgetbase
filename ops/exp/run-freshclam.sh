#!/bin/bash
set -euo pipefail
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-freshclam \
  --restart unless-stopped \
  --user 1000:1000 \
  --memory 256m \
  --network name=forgetbase-fc,ip=172.30.52.2 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/freshclam.env \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/signatures,dst=/var/lib/clamav \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/config/freshclam.conf,dst=/etc/clamav/freshclam.conf,readonly \
  --tmpfs /run/clamav:uid=1000,gid=1000,mode=0700,size=16m \
  --health-cmd 'test -s /var/lib/clamav/daily.cvd -o -s /var/lib/clamav/daily.cld' \
  --health-start-period 10m \
  --health-interval 60s \
  --entrypoint /usr/bin/freshclam \
  "${IMAGE_CLAMAV}" --daemon --foreground=true --config-file=/etc/clamav/freshclam.conf
