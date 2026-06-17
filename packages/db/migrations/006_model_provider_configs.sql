CREATE TABLE IF NOT EXISTS model_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'openrouter')),
  enabled boolean NOT NULL DEFAULT false,
  display_name text,
  base_url text,
  api_key_env_var text,
  default_model text,
  available_models text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS model_provider_configs_tenant_enabled_idx
  ON model_provider_configs (tenant_id, enabled, priority);
