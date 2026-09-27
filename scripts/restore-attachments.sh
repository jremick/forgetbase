#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/restore-attachments.sh <backup.tar>" >&2
  exit 2
fi

backup_path="$1"
attachment_service="${FORGETBASE_ATTACHMENT_SERVICE:-api}"

if [[ ! -f "${backup_path}" ]]; then
  echo "Attachment backup file not found: ${backup_path}" >&2
  exit 2
fi

if [[ "${FORGETBASE_ATTACHMENT_RESTORE_CONFIRM:-}" != "attachments" ]]; then
  echo "Refusing to replace attachment storage. Set FORGETBASE_ATTACHMENT_RESTORE_CONFIRM=attachments to continue." >&2
  exit 2
fi

if tar -tf "${backup_path}" | awk '
  {
    path = $0
    sub(/^\.\//, "", path)
    if (path == "" || path ~ /^[0-9a-f]{2}\/?$/ || path ~ /^[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) next
    unsafe = 1
  }
  END { exit unsafe ? 0 : 1 }
'; then
  echo "Attachment backup contains a path outside the opaque attachment-key layout" >&2
  exit 2
fi

if tar -tvf "${backup_path}" | awk '
  substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { unsafe = 1 }
  END { exit unsafe ? 0 : 1 }
'; then
  echo "Attachment backup contains a link or special archive entry" >&2
  exit 2
fi

docker compose run --rm --no-deps -T "${attachment_service}" sh -euc '
  storage_root="${FORGETBASE_ATTACHMENT_STORAGE_ROOT:?attachment storage root is required}"
  case "${storage_root}" in
    /*) ;;
    *) echo "Attachment storage root must be absolute" >&2; exit 2 ;;
  esac
  case "${storage_root}" in
    /|/app|/var|/var/lib|/var/lib/forgetbase)
      echo "Refusing unsafe attachment storage root: ${storage_root}" >&2
      exit 2
      ;;
  esac
  umask 077
  mkdir -p "${storage_root}"
  find "${storage_root}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  tar -xpf - -C "${storage_root}"
' < "${backup_path}"

printf '{"backupPath":"%s","restored":"attachments","service":"%s"}\n' "${backup_path}" "${attachment_service}"
