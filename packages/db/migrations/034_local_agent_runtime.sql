ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS api_keys_allowed_surfaces_nonempty;

ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_allowed_surfaces_nonempty
  CHECK (
    cardinality(allowed_surfaces) > 0
    AND allowed_surfaces <@ ARRAY['api', 'cli', 'mcp', 'web', 'export', 'local-cache']::text[]
  ) NOT VALID;

ALTER TABLE api_keys
  VALIDATE CONSTRAINT api_keys_allowed_surfaces_nonempty;

CREATE TABLE IF NOT EXISTS local_sync_principal_state (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  principal_type text NOT NULL,
  principal_id text NOT NULL,
  entitlement_hash text NOT NULL,
  record_set_hash text NOT NULL,
  authorization_epoch bigint NOT NULL DEFAULT 1,
  content_generation bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, principal_type, principal_id),
  CONSTRAINT local_sync_principal_type_check
    CHECK (principal_type IN ('user', 'service-account')),
  CONSTRAINT local_sync_entitlement_hash_check
    CHECK (entitlement_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT local_sync_record_set_hash_check
    CHECK (record_set_hash ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT local_sync_authorization_epoch_check
    CHECK (authorization_epoch > 0),
  CONSTRAINT local_sync_content_generation_check
    CHECK (content_generation > 0)
);

CREATE INDEX IF NOT EXISTS local_sync_principal_state_updated_idx
  ON local_sync_principal_state (tenant_id, updated_at DESC);
