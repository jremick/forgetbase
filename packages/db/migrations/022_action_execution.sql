CREATE TABLE IF NOT EXISTS action_execution_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  allowed_action_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  require_approval boolean NOT NULL DEFAULT true,
  dry_run_default boolean NOT NULL DEFAULT true,
  kill_switch boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    allowed_action_types <@ ARRAY[
      'create-task-record',
      'http-openapi',
      'mcp-tool',
      'git-repo',
      'document-connector',
      'local-command'
    ]
  )
);

CREATE TABLE IF NOT EXISTS agent_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (
    action_type IN (
      'create-task-record',
      'http-openapi',
      'mcp-tool',
      'git-repo',
      'document-connector',
      'local-command'
    )
  ),
  title text NOT NULL,
  description text,
  target text,
  status text NOT NULL CHECK (
    status IN (
      'blocked',
      'dry-run',
      'approval-required',
      'approved',
      'denied',
      'executed'
    )
  ),
  dry_run boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  requested_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  decided_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  executed_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_action_requests_tenant_created_idx
  ON agent_action_requests (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_action_requests_tenant_status_idx
  ON agent_action_requests (tenant_id, status, created_at DESC);
