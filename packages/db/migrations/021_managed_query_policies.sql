CREATE TABLE IF NOT EXISTS managed_query_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  default_mode text NOT NULL DEFAULT 'deterministic-retrieval' CHECK (
    default_mode IN ('deterministic-retrieval', 'provider-routed')
  ),
  allowed_modes text[] NOT NULL DEFAULT ARRAY['deterministic-retrieval', 'provider-routed'],
  minimum_citation_count integer NOT NULL DEFAULT 1 CHECK (
    minimum_citation_count BETWEEN 0 AND 10
  ),
  require_grounded boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (default_mode = ANY(allowed_modes)),
  CHECK (allowed_modes <@ ARRAY['deterministic-retrieval', 'provider-routed']),
  CHECK (cardinality(allowed_modes) >= 1)
);
