ALTER TABLE login_sessions
  ADD COLUMN IF NOT EXISTS absolute_expires_at timestamptz;

UPDATE login_sessions
SET absolute_expires_at = GREATEST(expires_at, created_at + interval '30 days')
WHERE absolute_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS login_sessions_absolute_expiry_idx
  ON login_sessions (tenant_id, absolute_expires_at)
  WHERE revoked_at IS NULL AND absolute_expires_at IS NOT NULL;
