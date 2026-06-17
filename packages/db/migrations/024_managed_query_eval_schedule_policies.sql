CREATE TABLE IF NOT EXISTS managed_query_eval_schedule_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 1440 CHECK (interval_minutes BETWEEN 1 AND 43200),
  eval_input jsonb,
  last_run_at timestamptz,
  last_eval_run_id uuid REFERENCES managed_query_eval_runs(id) ON DELETE SET NULL,
  last_status text NOT NULL DEFAULT 'not-run' CHECK (last_status IN ('not-run', 'passed', 'failed', 'error')),
  last_error text,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (enabled = false OR eval_input IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS managed_query_eval_schedule_due_idx
  ON managed_query_eval_schedule_policies (enabled, last_run_at, tenant_id);
