CREATE TABLE IF NOT EXISTS managed_query_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'openrouter')),
  model text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('provider-routed')),
  query_hash text NOT NULL,
  surface text NOT NULL,
  principal_hash text NOT NULL,
  context_hash text NOT NULL,
  answer text NOT NULL,
  generation jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz,
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  UNIQUE (tenant_id, cache_key)
);

CREATE INDEX IF NOT EXISTS managed_query_cache_tenant_expires_idx
  ON managed_query_cache (tenant_id, expires_at);

CREATE INDEX IF NOT EXISTS managed_query_cache_provider_idx
  ON managed_query_cache (tenant_id, provider, model);
