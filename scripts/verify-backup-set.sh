#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/verify-backup-set.sh <backup-set-directory>" >&2
  exit 2
fi

backup_set="$1"
manifest_path="${backup_set}/manifest.json"
database_path="${backup_set}/database.dump"
attachments_path="${backup_set}/attachments.tar"
db_service="${FORGETBASE_DB_SERVICE:-postgres}"
db_user="${FORGETBASE_DB_USER:-forgetbase}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/forgetbase-backup-set.XXXXXX")"
restored_dir="${work_dir}/attachments"
target_db="forgetbase_restore_set_$$_$(date -u +"%H%M%S")"

cleanup() {
  docker compose exec -T "${db_service}" psql -U "${db_user}" -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target_db}' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS ${target_db};" > /dev/null 2>&1 || true
  rm -rf "${work_dir}"
}
trap cleanup EXIT

for path in "${manifest_path}" "${database_path}" "${attachments_path}"; do
  if [[ ! -f "${path}" ]]; then
    echo "Backup set file missing: ${path}" >&2
    exit 2
  fi
done

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

database_sha256="$(sha256_file "${database_path}")"
attachments_sha256="$(sha256_file "${attachments_path}")"
node - "${manifest_path}" "${database_sha256}" "${attachments_sha256}" <<'NODE'
const fs = require("node:fs");
const [manifestPath, databaseSha256, attachmentsSha256] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.format !== "forgetbase-backup-set-v1" || manifest.consistency !== "writers-stopped") {
  throw new Error("Unsupported or inconsistent backup-set manifest");
}
if (manifest.files?.database?.sha256 !== databaseSha256 || manifest.files?.attachments?.sha256 !== attachmentsSha256) {
  throw new Error("Backup-set checksum mismatch");
}
NODE

if tar -tf "${attachments_path}" | awk '
  {
    path = $0
    sub(/^\.\//, "", path)
    if (path == "" || path ~ /^[0-9a-f]{2}\/?$/ || path ~ /^[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) next
    unsafe = 1
  }
  END { exit unsafe ? 0 : 1 }
'; then
  echo "Attachment archive contains an unsafe path" >&2
  exit 2
fi
if tar -tvf "${attachments_path}" | awk '
  substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { unsafe = 1 }
  END { exit unsafe ? 0 : 1 }
'; then
  echo "Attachment archive contains a link or special entry" >&2
  exit 2
fi

mkdir -p "${restored_dir}"
tar -xpf "${attachments_path}" -C "${restored_dir}"
bash scripts/restore-postgres.sh "${database_path}" "${target_db}" > /dev/null

records_path="${work_dir}/attachment-records.tsv"
docker compose exec -T "${db_service}" psql -U "${db_user}" -d "${target_db}" -t -A -F $'\t' -c \
  "SELECT storage_key, content_sha256, size_bytes FROM attachments WHERE lifecycle_state <> 'deleted' ORDER BY storage_key;" \
  > "${records_path}"

verified_count=0
while IFS=$'\t' read -r storage_key expected_sha256 expected_bytes; do
  [[ -z "${storage_key}" ]] && continue
  if [[ ! "${storage_key}" =~ ^[0-9a-f]{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    echo "Restored database contains an unsafe attachment storage key" >&2
    exit 1
  fi
  restored_path="${restored_dir}/${storage_key}"
  if [[ ! -f "${restored_path}" ]]; then
    echo "Backup set is missing a referenced attachment blob" >&2
    exit 1
  fi
  actual_sha256="$(sha256_file "${restored_path}")"
  actual_bytes="$(wc -c < "${restored_path}" | tr -d ' ')"
  if [[ "${actual_sha256}" != "${expected_sha256}" || "${actual_bytes}" != "${expected_bytes}" ]]; then
    echo "Backup set attachment integrity mismatch" >&2
    exit 1
  fi
  verified_count="$((verified_count + 1))"
done < "${records_path}"

archive_file_count="$(find "${restored_dir}" -type f | wc -l | tr -d ' ')"
if [[ "${archive_file_count}" != "${verified_count}" ]]; then
  echo "Backup set contains orphaned attachment blobs" >&2
  exit 1
fi

printf '{"backupSet":"%s","restoredDatabase":"%s","verifiedAttachmentCount":%s,"verified":true}\n' \
  "${backup_set}" "${target_db}" "${verified_count}"
