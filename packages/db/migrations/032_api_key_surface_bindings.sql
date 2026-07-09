ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS allowed_surfaces text[] NOT NULL
  DEFAULT ARRAY['api', 'cli', 'mcp', 'web', 'export']::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'api_keys_allowed_surfaces_nonempty'
      AND conrelid = 'api_keys'::regclass
  ) THEN
    ALTER TABLE api_keys
      ADD CONSTRAINT api_keys_allowed_surfaces_nonempty
      CHECK (
        cardinality(allowed_surfaces) > 0
        AND allowed_surfaces <@ ARRAY['api', 'cli', 'mcp', 'web', 'export']::text[]
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE api_keys
  VALIDATE CONSTRAINT api_keys_allowed_surfaces_nonempty;
