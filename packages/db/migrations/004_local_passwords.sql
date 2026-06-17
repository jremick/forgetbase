ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE INDEX IF NOT EXISTS users_tenant_email_idx ON users (tenant_id, email);
