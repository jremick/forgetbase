CREATE TABLE IF NOT EXISTS telemetry_retention_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  retrieval_event_retention_days integer CHECK (
    retrieval_event_retention_days IS NULL OR retrieval_event_retention_days BETWEEN 1 AND 3650
  ),
  audit_event_retention_days integer CHECK (
    audit_event_retention_days IS NULL OR audit_event_retention_days BETWEEN 1 AND 3650
  ),
  feedback_retention_days integer CHECK (
    feedback_retention_days IS NULL OR feedback_retention_days BETWEEN 1 AND 3650
  ),
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
