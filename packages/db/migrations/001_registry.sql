CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'open-core',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, slug, name)
VALUES ('tenant_demo', 'demo', 'Demo Tenant')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stable_id text NOT NULL,
  type text NOT NULL,
  owner_id text NOT NULL,
  title text NOT NULL,
  summary text,
  lifecycle_state text NOT NULL,
  sensitivity text NOT NULL,
  audience text[] NOT NULL,
  status text NOT NULL,
  review_due_at date NOT NULL,
  source_kind text,
  source_ref text,
  allowed_surfaces text[] NOT NULL,
  allowed_exports text[] NOT NULL DEFAULT '{}',
  allowed_actions text[] NOT NULL DEFAULT '{}',
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stable_id)
);

CREATE TABLE IF NOT EXISTS asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_note text,
  UNIQUE (asset_id, version_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assets_current_version_id_fkey'
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT assets_current_version_id_fkey
      FOREIGN KEY (current_version_id)
      REFERENCES asset_versions(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS instruction_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES asset_versions(id) ON DELETE CASCADE,
  instruction_kind text NOT NULL,
  target_agents text[] NOT NULL DEFAULT '{}',
  body text NOT NULL,
  input_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints_list text[] NOT NULL DEFAULT '{}',
  examples text[] NOT NULL DEFAULT '{}',
  failure_modes text[] NOT NULL DEFAULT '{}',
  escalation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS human_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES asset_versions(id) ON DELETE CASCADE,
  format text NOT NULL,
  body text NOT NULL,
  render_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  linked_instruction_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_tenant_type_idx ON assets (tenant_id, type);
CREATE INDEX IF NOT EXISTS assets_tenant_lifecycle_idx ON assets (tenant_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS assets_tenant_sensitivity_idx ON assets (tenant_id, sensitivity);
CREATE INDEX IF NOT EXISTS asset_versions_asset_idx ON asset_versions (asset_id, version_number DESC);
CREATE INDEX IF NOT EXISTS instruction_objects_asset_idx ON instruction_objects (asset_id);
CREATE INDEX IF NOT EXISTS human_documents_asset_idx ON human_documents (asset_id);
