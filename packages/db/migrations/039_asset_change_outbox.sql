CREATE TABLE IF NOT EXISTS asset_change_outbox (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Keep deletion work until tenant cache invalidation has completed.
  asset_id uuid NOT NULL,
  stable_id text NOT NULL,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text CHECK (last_error_code IN (
    'asset_lookup_failed', 'asset_index_failed', 'asset_cache_invalidation_failed', 'asset_reconciliation_failed'
  )),
  queued_at timestamptz NOT NULL DEFAULT now(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, asset_id),
  CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR
    (state <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS asset_change_outbox_due_idx ON asset_change_outbox (available_at, queued_at);

CREATE OR REPLACE FUNCTION enqueue_canonical_asset_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed assets%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed := OLD;
    -- Tenant deletion already cascades its chunks, cache, queue, and audit.
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) THEN
      RETURN OLD;
    END IF;
  ELSE
    changed := NEW;
  END IF;

  -- Asset creation first inserts an empty head, then its complete version.
  IF changed.current_version_id IS NULL THEN
    RETURN changed;
  END IF;
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(OLD) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'updated_at') THEN
    RETURN NEW;
  END IF;

  INSERT INTO asset_change_outbox (tenant_id, asset_id, stable_id)
  VALUES (changed.tenant_id, changed.id, changed.stable_id)
  ON CONFLICT (tenant_id, asset_id) DO UPDATE SET
    stable_id = EXCLUDED.stable_id,
    generation = asset_change_outbox.generation + 1,
    state = 'pending', attempts = 0, available_at = clock_timestamp(),
    lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL,
    changed_at = clock_timestamp();

  -- This records a committed canonical row change, not an attributed command.
  -- Actor-specific command audits remain separate. No content enters this event.
  INSERT INTO audit_events (tenant_id, action, target_type, target_id, outcome, metadata)
  VALUES (changed.tenant_id, 'asset.commit', 'asset', changed.id::text, 'success', jsonb_build_object(
    'source', 'asset-row-trigger',
    'operation', lower(TG_OP),
    'transactionId', txid_current()::text,
    'currentVersionId', changed.current_version_id,
    'publishedVersionId', changed.published_version_id
  ));
  RETURN changed;
END $$;

DROP TRIGGER IF EXISTS canonical_asset_change_outbox ON assets;
CREATE TRIGGER canonical_asset_change_outbox
  AFTER INSERT OR UPDATE OR DELETE ON assets
  FOR EACH ROW EXECUTE FUNCTION enqueue_canonical_asset_change();

-- Existing content must be reconciled against the new published projection.
-- This is migration work, so it does not fabricate historical commit audits.
INSERT INTO asset_change_outbox (tenant_id, asset_id, stable_id)
SELECT tenant_id, id, stable_id FROM assets WHERE current_version_id IS NOT NULL
ON CONFLICT (tenant_id, asset_id) DO NOTHING;
