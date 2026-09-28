ALTER TABLE login_sessions
  DROP CONSTRAINT IF EXISTS login_sessions_source_check;

ALTER TABLE login_sessions
  ADD CONSTRAINT login_sessions_source_check
  CHECK (source IN ('password', 'oidc', 'local-device')) NOT VALID;

ALTER TABLE login_sessions
  VALIDATE CONSTRAINT login_sessions_source_check;

ALTER TABLE login_sessions
  ADD COLUMN IF NOT EXISTS local_device_enrollment_id text;

ALTER TABLE login_sessions
  DROP CONSTRAINT IF EXISTS login_sessions_local_device_enrollment_check;

ALTER TABLE login_sessions
  ADD CONSTRAINT login_sessions_local_device_enrollment_check
  CHECK (
    (source = 'local-device' AND local_device_enrollment_id IS NOT NULL)
    OR (source <> 'local-device' AND local_device_enrollment_id IS NULL)
  ) NOT VALID;

ALTER TABLE login_sessions
  VALIDATE CONSTRAINT login_sessions_local_device_enrollment_check;

CREATE UNIQUE INDEX IF NOT EXISTS login_sessions_local_device_enrollment_unique
  ON login_sessions (local_device_enrollment_id)
  WHERE local_device_enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS login_sessions_local_devices_idx
  ON login_sessions (tenant_id, user_id, created_at DESC)
  WHERE source = 'local-device';
