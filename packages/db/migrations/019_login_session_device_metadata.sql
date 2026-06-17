ALTER TABLE login_sessions
  ADD COLUMN IF NOT EXISTS device_label text,
  ADD COLUMN IF NOT EXISTS client_user_agent text;
