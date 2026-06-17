CREATE TABLE IF NOT EXISTS asset_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_id uuid REFERENCES asset_versions(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_id text,
  chunk_index integer NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  citation jsonb NOT NULL,
  embedding vector(1536),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, source_kind, source_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS retrieval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  surface text NOT NULL,
  query text NOT NULL,
  result_count integer NOT NULL,
  denied_count integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_chunks_tenant_asset_idx ON asset_chunks (tenant_id, asset_id);
CREATE INDEX IF NOT EXISTS asset_chunks_search_idx ON asset_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS asset_chunks_embedding_idx ON asset_chunks USING ivfflat (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS retrieval_events_tenant_created_idx ON retrieval_events (tenant_id, created_at DESC);
