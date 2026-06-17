CREATE TABLE IF NOT EXISTS service_account_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_service_accounts integer CHECK (
    max_service_accounts IS NULL OR max_service_accounts BETWEEN 1 AND 10000
  ),
  max_active_api_keys_per_service_account integer CHECK (
    max_active_api_keys_per_service_account IS NULL OR max_active_api_keys_per_service_account BETWEEN 1 AND 1000
  ),
  default_api_key_expires_in_days integer CHECK (
    default_api_key_expires_in_days IS NULL OR default_api_key_expires_in_days BETWEEN 1 AND 3650
  ),
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
