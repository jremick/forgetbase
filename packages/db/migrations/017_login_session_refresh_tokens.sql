CREATE TABLE IF NOT EXISTS login_session_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  login_session_id uuid NOT NULL REFERENCES login_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  rotated_to_id uuid REFERENCES login_session_refresh_tokens(id)
);

CREATE INDEX IF NOT EXISTS login_session_refresh_tokens_session_idx
  ON login_session_refresh_tokens (tenant_id, login_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS login_session_refresh_tokens_active_idx
  ON login_session_refresh_tokens (tenant_id, login_session_id, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;
