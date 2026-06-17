CREATE TABLE IF NOT EXISTS managed_query_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  actor_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  ok boolean NOT NULL,
  mode text NOT NULL CHECK (mode IN ('deterministic-retrieval', 'provider-routed')),
  checked_at timestamptz NOT NULL,
  case_count integer NOT NULL CHECK (case_count >= 0),
  passed_count integer NOT NULL CHECK (passed_count >= 0),
  failed_count integer NOT NULL CHECK (failed_count >= 0),
  pass_rate double precision NOT NULL CHECK (pass_rate >= 0 AND pass_rate <= 1),
  minimum_pass_rate double precision NOT NULL CHECK (minimum_pass_rate >= 0 AND minimum_pass_rate <= 1),
  threshold_passed boolean NOT NULL,
  report jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS managed_query_eval_runs_tenant_created_idx
  ON managed_query_eval_runs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS managed_query_eval_runs_tenant_ok_idx
  ON managed_query_eval_runs (tenant_id, ok, created_at DESC);
