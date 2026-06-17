CREATE TABLE IF NOT EXISTS managed_query_retention_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  prompt_capture_mode text NOT NULL DEFAULT 'disabled' CHECK (
    prompt_capture_mode IN ('disabled', 'metadata-only')
  ),
  response_capture_mode text NOT NULL DEFAULT 'disabled' CHECK (
    response_capture_mode IN ('disabled', 'metadata-only')
  ),
  metadata_retention_days integer CHECK (
    metadata_retention_days IS NULL OR metadata_retention_days BETWEEN 1 AND 3650
  ),
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
