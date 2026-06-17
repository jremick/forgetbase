ALTER TABLE agent_action_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_action_requests_idempotency_key_length'
  ) THEN
    ALTER TABLE agent_action_requests
      ADD CONSTRAINT agent_action_requests_idempotency_key_length
      CHECK (
        idempotency_key IS NULL OR
        char_length(idempotency_key) BETWEEN 1 AND 200
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agent_action_requests_tenant_user_idempotency_idx
  ON agent_action_requests (tenant_id, requested_by_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND requested_by_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_action_requests_tenant_service_idempotency_idx
  ON agent_action_requests (tenant_id, requested_by_service_account_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND requested_by_service_account_id IS NOT NULL;
