#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

backup_root="${FORGETBASE_BACKUP_DIR:-backups}"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
output_dir="${1:-${backup_root}/forgetbase-set-${timestamp}}"
parent_dir="$(dirname "${output_dir}")"
db_service="${FORGETBASE_DB_SERVICE:-postgres}"
db_name="${FORGETBASE_DB_NAME:-forgetbase}"
db_user="${FORGETBASE_DB_USER:-forgetbase}"

if [[ -e "${output_dir}" ]]; then
  echo "Backup set already exists: ${output_dir}" >&2
  exit 2
fi

running_services="$(docker compose ps --status running --services)"
if printf '%s\n' "${running_services}" | grep -Eq '^(api|worker)$'; then
  echo "Refusing an inconsistent backup set while api or worker is running. Stop both writers first." >&2
  exit 2
fi

mkdir -p "${parent_dir}"
work_dir="$(mktemp -d "${parent_dir}/.forgetbase-set.XXXXXX")"
cleanup() {
  if [[ -d "${work_dir}" ]]; then
    rm -rf "${work_dir}"
  fi
}
trap cleanup EXIT

database_path="${work_dir}/database.dump"
attachments_path="${work_dir}/attachments.tar"
bash scripts/backup-postgres.sh "${database_path}" > /dev/null
bash scripts/backup-attachments.sh "${attachments_path}" > /dev/null

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

file_size() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

database_sha256="$(sha256_file "${database_path}")"
attachments_sha256="$(sha256_file "${attachments_path}")"
database_bytes="$(file_size "${database_path}")"
attachments_bytes="$(file_size "${attachments_path}")"
attachment_counts="$(docker compose exec -T "${db_service}" psql -U "${db_user}" -d "${db_name}" -t -A -F '|' -c \
  "SELECT count(*), count(*) FILTER (WHERE lifecycle_state = 'active') FROM attachments;")"
attachment_count="${attachment_counts%%|*}"
active_attachment_count="${attachment_counts##*|}"
created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

node - "${created_at}" "${database_sha256}" "${database_bytes}" "${attachments_sha256}" \
  "${attachments_bytes}" "${attachment_count}" "${active_attachment_count}" > "${work_dir}/manifest.json" <<'NODE'
const [createdAt, databaseSha256, databaseBytes, attachmentsSha256, attachmentsBytes, attachmentCount, activeAttachmentCount] = process.argv.slice(2);
process.stdout.write(`${JSON.stringify({
  format: "forgetbase-backup-set-v1",
  createdAt,
  consistency: "writers-stopped",
  files: {
    database: { path: "database.dump", sha256: databaseSha256, bytes: Number(databaseBytes) },
    attachments: { path: "attachments.tar", sha256: attachmentsSha256, bytes: Number(attachmentsBytes) }
  },
  attachments: {
    metadataCount: Number(attachmentCount),
    activeCount: Number(activeAttachmentCount)
  }
}, null, 2)}\n`);
NODE

mv "${work_dir}" "${output_dir}"
trap - EXIT
printf '{"backupSet":"%s","manifest":"%s"}\n' "${output_dir}" "${output_dir}/manifest.json"
