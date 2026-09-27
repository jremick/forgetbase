#!/usr/bin/env bash
set -euo pipefail

attachment_service="${FORGETBASE_ATTACHMENT_SERVICE:-api}"
backup_dir="${FORGETBASE_BACKUP_DIR:-backups}"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
output_path="${1:-${backup_dir}/forgetbase-attachments-${timestamp}.tar}"
tmp_path="${output_path}.tmp"

mkdir -p "$(dirname "${output_path}")"

docker compose run --rm --no-deps -T "${attachment_service}" sh -euc '
  storage_root="${FORGETBASE_ATTACHMENT_STORAGE_ROOT:?attachment storage root is required}"
  case "${storage_root}" in
    /*) ;;
    *) echo "Attachment storage root must be absolute" >&2; exit 2 ;;
  esac
  if [ "${storage_root}" = "/" ]; then
    echo "Refusing to back up the filesystem root" >&2
    exit 2
  fi
  mkdir -p "${storage_root}"
  tar -C "${storage_root}" -cf - .
' > "${tmp_path}"

tar -tf "${tmp_path}" > /dev/null
mv "${tmp_path}" "${output_path}"

printf '{"backupPath":"%s","service":"%s"}\n' "${output_path}" "${attachment_service}"
