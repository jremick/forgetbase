-- A draft head must never replace the version served to ordinary consumers.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS published_version_id uuid;

-- Earlier snapshots were sometimes reconstructed from current metadata, so do
-- not infer historical approval. Only the currently approved head is migrated.
UPDATE assets
SET published_version_id = current_version_id
WHERE published_version_id IS NULL
  AND lifecycle_state = 'active'
  AND status = 'approved';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_published_asset_version_fkey'
      AND conrelid = 'assets'::regclass
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT assets_published_asset_version_fkey
      FOREIGN KEY (id, published_version_id)
      REFERENCES asset_versions(asset_id, id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assets_tenant_published_version_idx
  ON assets (tenant_id, published_version_id)
  WHERE published_version_id IS NOT NULL;
