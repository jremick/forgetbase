ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE assets
SET metadata = asset_versions.metadata
FROM asset_versions
WHERE assets.current_version_id = asset_versions.id
  AND assets.metadata = '{}'::jsonb
  AND asset_versions.metadata <> '{}'::jsonb;
