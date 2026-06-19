#!/usr/bin/env bash
set -euo pipefail

db_service="${FORGETBASE_DB_SERVICE:-postgres}"
db_name="${FORGETBASE_DB_NAME:-forgetbase}"
db_user="${FORGETBASE_DB_USER:-forgetbase}"
backup_dir="${FORGETBASE_BACKUP_DIR:-backups}"
timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
output_path="${1:-${backup_dir}/forgetbase-${timestamp}.dump}"
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
