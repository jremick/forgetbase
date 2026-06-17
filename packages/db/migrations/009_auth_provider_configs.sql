CREATE TABLE IF NOT EXISTS auth_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('oidc', 'microsoft-entra')),
  enabled boolean NOT NULL DEFAULT false,
  display_name text,
  issuer_url text NOT NULL,
  client_id text NOT NULL,
  client_secret_env_var text,
  redirect_uri text,
  scopes text[] NOT NULL DEFAULT ARRAY['openid', 'profile', 'email'],
  email_claim text NOT NULL DEFAULT 'email',
  display_name_claim text NOT NULL DEFAULT 'name',
  group_claim text,
  role_claim text,
  default_role text NOT NULL DEFAULT 'reader' CHECK (default_role IN ('admin', 'maintainer', 'reader')),
  auto_provision_users boolean NOT NULL DEFAULT false,
  group_sync_enabled boolean NOT NULL DEFAULT false,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  pkce_required boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS auth_provider_configs_tenant_enabled_idx
  ON auth_provider_configs (tenant_id, enabled, priority);
