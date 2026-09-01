DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assets_tenant_id_id_unique'
      AND conrelid = 'assets'::regclass
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT assets_tenant_id_id_unique UNIQUE (tenant_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  filename text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL,
  content_sha256 text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  lifecycle_state text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  uploaded_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  deletion_requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  deletion_requested_by_service_account_id uuid REFERENCES service_accounts(id) ON DELETE SET NULL,
  deletion_requested_by_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_tenant_asset_fkey
    FOREIGN KEY (tenant_id, asset_id)
    REFERENCES assets(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT attachments_filename_length_check
    CHECK (char_length(filename) BETWEEN 1 AND 255),
  CONSTRAINT attachments_filename_safe_check
    CHECK (filename !~ '[\\/]' AND filename !~ '[[:cntrl:]]'),
  CONSTRAINT attachments_media_type_length_check
    CHECK (char_length(media_type) BETWEEN 1 AND 255),
  CONSTRAINT attachments_media_type_format_check
    CHECK (media_type ~ '^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$'),
  CONSTRAINT attachments_size_bytes_check
    CHECK (size_bytes >= 0),
  CONSTRAINT attachments_content_sha256_check
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT attachments_storage_key_check
    CHECK (
      storage_key ~ '^[0-9a-f]{2}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
  CONSTRAINT attachments_lifecycle_state_check
    CHECK (lifecycle_state IN ('active', 'deleting', 'deleted')),
  CONSTRAINT attachments_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT attachments_lifecycle_timestamps_check
    CHECK (
      (lifecycle_state = 'active' AND deletion_requested_at IS NULL AND deleted_at IS NULL)
      OR (lifecycle_state = 'deleting' AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL)
      OR (lifecycle_state = 'deleted' AND deletion_requested_at IS NOT NULL AND deleted_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS attachments_tenant_asset_state_created_idx
  ON attachments (tenant_id, asset_id, lifecycle_state, created_at DESC);

CREATE INDEX IF NOT EXISTS attachments_tenant_state_updated_idx
  ON attachments (tenant_id, lifecycle_state, updated_at DESC);
