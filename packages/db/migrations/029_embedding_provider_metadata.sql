ALTER TABLE asset_chunks
  ADD COLUMN IF NOT EXISTS embedding_provider text,
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_dimensions integer;

UPDATE asset_chunks
SET
  embedding_provider = coalesce(embedding_provider, 'local-hash'),
  embedding_model = coalesce(embedding_model, 'hash-embedding-v1'),
  embedding_dimensions = coalesce(embedding_dimensions, 1536);

ALTER TABLE asset_chunks
  ALTER COLUMN embedding_provider SET DEFAULT 'local-hash',
  ALTER COLUMN embedding_model SET DEFAULT 'hash-embedding-v1',
  ALTER COLUMN embedding_dimensions SET DEFAULT 1536,
  ALTER COLUMN embedding_provider SET NOT NULL,
  ALTER COLUMN embedding_model SET NOT NULL,
  ALTER COLUMN embedding_dimensions SET NOT NULL;

CREATE INDEX IF NOT EXISTS asset_chunks_embedding_metadata_idx
  ON asset_chunks (tenant_id, embedding_provider, embedding_model, embedding_dimensions)
  WHERE embedding IS NOT NULL;
