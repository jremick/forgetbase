CREATE TABLE IF NOT EXISTS secret_reference_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  allowed_env_var_prefixes text[] NOT NULL DEFAULT ARRAY[
    'FORGETBASE_',
    'OPENAI_',
    'ANTHROPIC_',
    'OPENROUTER_',
    'ENTRA_',
    'OIDC_'
  ],
  allowed_env_vars text[] NOT NULL DEFAULT '{}',
  allow_unlisted_env_vars boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
