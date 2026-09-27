#!/usr/bin/env bash
set -euo pipefail

attachment_service="${FORGETBASE_ATTACHMENT_SERVICE:-api}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/forgetbase-attachment-backup.XXXXXX")"
backup_path="${work_dir}/attachments.tar"
restored_dir="${work_dir}/restored"
source_manifest="${work_dir}/source.sha256"
restored_manifest="${work_dir}/restored.sha256"

cleanup() {
  if [[ "${KEEP_FORGETBASE_ATTACHMENT_BACKUP:-}" != "1" ]]; then
    rm -rf "${work_dir}"
  fi
}
trap cleanup EXIT

docker compose run --rm --no-deps -T "${attachment_service}" sh -euc '
  storage_root="${FORGETBASE_ATTACHMENT_STORAGE_ROOT:?attachment storage root is required}"
  case "${storage_root}" in
    /*) ;;
    *) echo "Attachment storage root must be absolute" >&2; exit 2 ;;
  esac
  if [ "${storage_root}" = "/" ]; then
    echo "Refusing to inspect the filesystem root" >&2
    exit 2
  fi
  mkdir -p "${storage_root}"
  cd "${storage_root}"
  find . -type f -exec sha256sum {} \; | LC_ALL=C sort
' > "${source_manifest}"

bash scripts/backup-attachments.sh "${backup_path}" > /dev/null

if tar -tf "${backup_path}" | awk '
  {
    path = $0
    sub(/^\.\//, "", path)
    if (path == "" || path ~ /^[0-9a-f]{2}\/?$/ || path ~ /^[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) next
    unsafe = 1
  }
  END { exit unsafe ? 0 : 1 }
'; then
  echo "Attachment backup verification failed: unsafe archive path" >&2
  exit 1
fi

if tar -tvf "${backup_path}" | awk '
  substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { unsafe = 1 }
  END { exit unsafe ? 0 : 1 }
'; then
  echo "Attachment backup verification failed: link or special archive entry" >&2
  exit 1
fi

mkdir -p "${restored_dir}"
tar -xpf "${backup_path}" -C "${restored_dir}"
(
  cd "${restored_dir}"
  find . -type f -exec shasum -a 256 {} \; | LC_ALL=C sort
) > "${restored_manifest}"

if ! cmp -s "${source_manifest}" "${restored_manifest}"; then
  echo "Attachment backup verification failed: file manifest mismatch" >&2
  exit 1
fi

file_count="$(wc -l < "${source_manifest}" | tr -d ' ')"
printf '{"backupPath":"%s","fileCount":%s,"verified":true}\n' "${backup_path}" "${file_count}"
