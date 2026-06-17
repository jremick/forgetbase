CREATE TABLE IF NOT EXISTS retrieval_ranking_policies (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  agent_instruction_weight numeric NOT NULL DEFAULT 1.2 CHECK (
    agent_instruction_weight > 0 AND agent_instruction_weight <= 10
  ),
  asset_summary_weight numeric NOT NULL DEFAULT 1.1 CHECK (
    asset_summary_weight > 0 AND asset_summary_weight <= 10
  ),
  human_document_weight numeric NOT NULL DEFAULT 1 CHECK (
    human_document_weight > 0 AND human_document_weight <= 10
  ),
  exact_phrase_boost numeric NOT NULL DEFAULT 0.25 CHECK (
    exact_phrase_boost >= 0 AND exact_phrase_boost <= 10
  ),
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  updated_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
