#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/restore-postgres.sh <backup.dump> [target_database]" >&2
  exit 2
fi

backup_path="$1"
db_service="${FORGETBASE_DB_SERVICE:-postgres}"
source_db_name="${FORGETBASE_DB_NAME:-forgetbase}"
target_db="${2:-${source_db_name}}"
db_user="${FORGETBASE_DB_USER:-forgetbase}"

if [[ ! -f "${backup_path}" ]]; then
  echo "Backup file not found: ${backup_path}" >&2
  exit 2
fi

if [[ ! "${target_db}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Invalid target database name: ${target_db}" >&2
  exit 2
fi

if [[ "${target_db}" == "${source_db_name}" && "${FORGETBASE_RESTORE_CONFIRM:-}" != "${target_db}" ]]; then
  echo "Refusing to replace ${target_db}. Set FORGETBASE_RESTORE_CONFIRM=${target_db} to continue." >&2
  exit 2
fi

if [[ "${target_db}" != forgetbase_restore_* && "${target_db}" != "${source_db_name}" && "${FORGETBASE_RESTORE_CONFIRM:-}" != "${target_db}" ]]; then
  echo "Refusing to restore into non-temporary database ${target_db}. Set FORGETBASE_RESTORE_CONFIRM=${target_db} to continue." >&2
  exit 2
fi

docker compose exec -T "${db_service}" psql -U "${db_user}" -d postgres -v ON_ERROR_STOP=1 \
  -c "SET client_min_messages TO warning;" \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target_db}' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS ${target_db};" \
  -c "CREATE DATABASE ${target_db} OWNER ${db_user};" \
  > /dev/null

docker compose exec -T "${db_service}" pg_restore \
  -U "${db_user}" \
  -d "${target_db}" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  < "${backup_path}" \
  > /dev/null

printf '{"backupPath":"%s","restoredDatabase":"%s","service":"%s"}\n' "${backup_path}" "${target_db}" "${db_service}"
