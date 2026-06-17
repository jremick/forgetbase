CREATE TABLE IF NOT EXISTS service_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  role text NOT NULL DEFAULT 'reader',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS service_account_id uuid REFERENCES service_accounts(id) ON DELETE CASCADE;

ALTER TABLE api_keys
  ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'api_keys_single_principal_check'
  ) THEN
    ALTER TABLE api_keys
      ADD CONSTRAINT api_keys_single_principal_check
      CHECK (
        (user_id IS NOT NULL AND service_account_id IS NULL) OR
        (user_id IS NULL AND service_account_id IS NOT NULL)
      );
  END IF;
END $$;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL;

ALTER TABLE retrieval_events
  ADD COLUMN IF NOT EXISTS actor_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL;

ALTER TABLE managed_query_feedback
  ADD COLUMN IF NOT EXISTS actor_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS service_accounts_tenant_status_idx ON service_accounts (tenant_id, status);
CREATE INDEX IF NOT EXISTS api_keys_service_account_idx ON api_keys (service_account_id);
