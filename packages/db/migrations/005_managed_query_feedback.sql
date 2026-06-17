CREATE TABLE IF NOT EXISTS managed_query_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  telemetry_event_id text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  query text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'needs-review')),
  factual_citation_accuracy integer CHECK (factual_citation_accuracy BETWEEN 1 AND 5),
  policy_compliance integer CHECK (policy_compliance BETWEEN 1 AND 5),
  task_completion_quality integer CHECK (task_completion_quality BETWEEN 1 AND 5),
  consistency integer CHECK (consistency BETWEEN 1 AND 5),
  response_effectiveness integer CHECK (response_effectiveness BETWEEN 1 AND 5),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS managed_query_feedback_tenant_created_idx
  ON managed_query_feedback (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS managed_query_feedback_telemetry_event_idx
  ON managed_query_feedback (telemetry_event_id);
