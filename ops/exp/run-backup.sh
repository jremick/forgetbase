#!/bin/bash
set -euo pipefail
source "$(dirname -- "$0")/run-common.sh"
exec "${COMMAND[@]}" "${COMMON[@]}" \
  --name forgetbase-backup \
  --restart no \
  --user 1000:1000 \
  --memory 128m \
  --network name=forgetbase-db,ip=172.30.51.5 \
  --env-file /mnt/cache/appdata/forgetbase/secrets/backup.env \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/bin/backup.sh,dst=/opt/exp/backup.sh,readonly \
  --mount type=bind,src=/mnt/cache/appdata/forgetbase/attachments,dst=/attachments,readonly \
  "${IMAGE_BACKUP}"
