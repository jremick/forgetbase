ALTER TABLE action_execution_policies
  ADD COLUMN IF NOT EXISTS approval_expires_in_minutes integer NOT NULL DEFAULT 1440 CHECK (
    approval_expires_in_minutes BETWEEN 1 AND 10080
  );

ALTER TABLE agent_action_requests
  ADD COLUMN IF NOT EXISTS approval_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_action_requests_status_check_v2'
  ) THEN
    ALTER TABLE agent_action_requests
      DROP CONSTRAINT IF EXISTS agent_action_requests_status_check;

    ALTER TABLE agent_action_requests
      ADD CONSTRAINT agent_action_requests_status_check_v2
      CHECK (
        status IN (
          'blocked',
          'dry-run',
          'approval-required',
          'approved',
          'denied',
          'executed',
          'expired'
        )
      );
  END IF;
END $$;

UPDATE agent_action_requests
SET approval_expires_at = created_at + make_interval(mins => 1440)
WHERE status = 'approval-required'
  AND approval_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS agent_action_requests_tenant_approval_expiry_idx
  ON agent_action_requests (tenant_id, approval_expires_at)
  WHERE status = 'approval-required' AND approval_expires_at IS NOT NULL;
