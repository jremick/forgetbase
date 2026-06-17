CREATE TABLE IF NOT EXISTS pii_redaction_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  redaction_enabled boolean NOT NULL DEFAULT true,
  enabled_rule_kinds text[] NOT NULL DEFAULT ARRAY[
    'api-key',
    'bearer-token',
    'credit-card',
    'email',
    'government-id',
    'ip-address',
    'jwt',
    'phone',
    'url-secret'
  ],
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
