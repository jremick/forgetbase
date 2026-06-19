#!/usr/bin/env bash
set -euo pipefail

db_service="${FORGETBASE_DB_SERVICE:-postgres}"
source_db_name="${FORGETBASE_DB_NAME:-forgetbase}"
db_user="${FORGETBASE_DB_USER:-forgetbase}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/forgetbase-backup-restore.XXXXXX")"
target_db="forgetbase_restore_$$_$(date -u +"%H%M%S")"
backup_path="${work_dir}/forgetbase-verify.dump"

cleanup() {
  docker compose exec -T "${db_service}" psql -U "${db_user}" -d postgres -v ON_ERROR_STOP=1 \
    -c "SET client_min_messages TO warning;" \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${target_db}' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS ${target_db};" \
    > /dev/null 2>&1 || true

  if [[ "${KEEP_FORGETBASE_BACKUP:-}" != "1" ]]; then
    rm -rf "${work_dir}"
  fi
}
trap cleanup EXIT

count_sql="SELECT jsonb_build_object(
  'tenants', (SELECT count(*) FROM tenants),
  'assets', (SELECT count(*) FROM assets),
  'asset_versions', (SELECT count(*) FROM asset_versions),
  'instruction_objects', (SELECT count(*) FROM instruction_objects),
  'human_documents', (SELECT count(*) FROM human_documents),
  'users', (SELECT count(*) FROM users),
  'service_accounts', (SELECT count(*) FROM service_accounts),
  'service_account_policies', (SELECT count(*) FROM service_account_policies),
  'groups', (SELECT count(*) FROM groups),
  'group_memberships', (SELECT count(*) FROM group_memberships),
  'api_keys', (SELECT count(*) FROM api_keys),
  'login_sessions', (SELECT count(*) FROM login_sessions),
  'login_session_refresh_tokens', (SELECT count(*) FROM login_session_refresh_tokens),
  'permission_grants', (SELECT count(*) FROM permission_grants),
  'audit_events', (SELECT count(*) FROM audit_events),
  'asset_chunks', (SELECT count(*) FROM asset_chunks),
  'retrieval_events', (SELECT count(*) FROM retrieval_events),
  'retrieval_ranking_policies', (SELECT count(*) FROM retrieval_ranking_policies),
  'managed_query_feedback', (SELECT count(*) FROM managed_query_feedback),
  'managed_query_eval_runs', (SELECT count(*) FROM managed_query_eval_runs),
  'managed_query_eval_schedule_policies', (SELECT count(*) FROM managed_query_eval_schedule_policies),
  'managed_query_cache', (SELECT count(*) FROM managed_query_cache),
  'managed_query_policies', (SELECT count(*) FROM managed_query_policies),
  'managed_query_cache_policies', (SELECT count(*) FROM managed_query_cache_policies),
  'managed_query_retention_policies', (SELECT count(*) FROM managed_query_retention_policies),
  'action_execution_policies', (SELECT count(*) FROM action_execution_policies),
  'agent_action_requests', (SELECT count(*) FROM agent_action_requests),
  'secret_reference_policies', (SELECT count(*) FROM secret_reference_policies),
  'pii_redaction_policies', (SELECT count(*) FROM pii_redaction_policies),
  'telemetry_retention_policies', (SELECT count(*) FROM telemetry_retention_policies),
  'model_provider_configs', (SELECT count(*) FROM model_provider_configs),
  'auth_provider_configs', (SELECT count(*) FROM auth_provider_configs),
  'schema_migrations', (SELECT count(*) FROM schema_migrations)
)::text;"

bash scripts/backup-postgres.sh "${backup_path}" > /dev/null
source_counts="$(docker compose exec -T "${db_service}" psql -U "${db_user}" -d "${source_db_name}" -t -A -c "${count_sql}")"
bash scripts/restore-postgres.sh "${backup_path}" "${target_db}" > /dev/null
restored_counts="$(docker compose exec -T "${db_service}" psql -U "${db_user}" -d "${target_db}" -t -A -c "${count_sql}")"

if [[ "${source_counts}" != "${restored_counts}" ]]; then
  echo "Backup/restore verification failed: count mismatch" >&2
  echo "source=${source_counts}" >&2
  echo "restored=${restored_counts}" >&2
  exit 1
fi

printf '{"backupPath":"%s","restoredDatabase":"%s","counts":%s}\n' "${backup_path}" "${target_db}" "${restored_counts}"
