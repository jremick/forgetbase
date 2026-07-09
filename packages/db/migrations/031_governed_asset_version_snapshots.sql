ALTER TABLE asset_versions
  ADD COLUMN IF NOT EXISTS asset_snapshot jsonb;

UPDATE asset_versions
SET asset_snapshot = jsonb_build_object(
  'stableId', assets.stable_id,
  'type', assets.type,
  'ownerId', assets.owner_id,
  'title', assets.title,
  'summary', assets.summary,
  'lifecycleState', assets.lifecycle_state,
  'sensitivity', assets.sensitivity,
  'audience', to_jsonb(assets.audience),
  'status', assets.status,
  'reviewDueAt', to_char(assets.review_due_at, 'YYYY-MM-DD'),
  'sourceKind', assets.source_kind,
  'sourceRef', assets.source_ref,
  'allowedSurfaces', to_jsonb(assets.allowed_surfaces),
  'allowedExports', to_jsonb(assets.allowed_exports),
  'allowedActions', to_jsonb(assets.allowed_actions),
  'metadata', asset_versions.metadata
)
FROM assets
WHERE asset_versions.asset_id = assets.id
  AND asset_versions.asset_snapshot IS NULL;

ALTER TABLE asset_versions
  ALTER COLUMN asset_snapshot SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asset_versions_asset_snapshot_object_check'
      AND conrelid = 'asset_versions'::regclass
  ) THEN
    ALTER TABLE asset_versions
      ADD CONSTRAINT asset_versions_asset_snapshot_object_check
      CHECK (jsonb_typeof(asset_snapshot) = 'object');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asset_versions_asset_id_id_unique'
      AND conrelid = 'asset_versions'::regclass
  ) THEN
    ALTER TABLE asset_versions
      ADD CONSTRAINT asset_versions_asset_id_id_unique UNIQUE (asset_id, id);
  END IF;
END $$;

UPDATE asset_chunks
SET version_id = assets.current_version_id
FROM assets
WHERE asset_chunks.asset_id = assets.id
  AND asset_chunks.version_id IS NULL
  AND assets.current_version_id IS NOT NULL;

DELETE FROM asset_chunks
WHERE version_id IS NULL;

ALTER TABLE asset_chunks
  ALTER COLUMN version_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asset_chunks_asset_version_fkey'
      AND conrelid = 'asset_chunks'::regclass
  ) THEN
    ALTER TABLE asset_chunks
      ADD CONSTRAINT asset_chunks_asset_version_fkey
      FOREIGN KEY (asset_id, version_id)
      REFERENCES asset_versions(asset_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS asset_chunks_tenant_asset_version_idx
  ON asset_chunks (tenant_id, asset_id, version_id);
