CREATE TABLE IF NOT EXISTS managed_query_cache_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  cache_enabled boolean NOT NULL DEFAULT true,
  max_cache_ttl_seconds integer CHECK (
    max_cache_ttl_seconds IS NULL OR max_cache_ttl_seconds BETWEEN 1 AND 86400
  ),
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
