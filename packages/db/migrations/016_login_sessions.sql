CREATE TABLE IF NOT EXISTS login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id uuid NOT NULL UNIQUE REFERENCES api_keys(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('password', 'oidc')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS login_sessions_tenant_user_idx ON login_sessions (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_sessions_active_idx ON login_sessions (tenant_id, api_key_id)
  WHERE revoked_at IS NULL;
