#!/usr/bin/env bash
set -euo pipefail

db_service="${AGENTIC_CMS_DB_SERVICE:-postgres}"
db_name="${AGENTIC_CMS_DB_NAME:-agentic_cms}"
db_user="${AGENTIC_CMS_DB_USER:-agentic_cms}"
backup_dir="${AGENTIC_CMS_BACKUP_DIR:-backups}"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
output_path="${1:-${backup_dir}/agentic-cms-${timestamp}.dump}"
tmp_path="${output_path}.tmp"

mkdir -p "$(dirname "${output_path}")"

docker compose exec -T "${db_service}" pg_dump \
  -U "${db_user}" \
  -d "${db_name}" \
  --format=custom \
  --no-owner \
  --no-acl \
  > "${tmp_path}"

docker compose exec -T "${db_service}" pg_restore --list < "${tmp_path}" > /dev/null

mv "${tmp_path}" "${output_path}"

printf '{"backupPath":"%s","database":"%s","service":"%s"}\n' "${output_path}" "${db_name}" "${db_service}"
