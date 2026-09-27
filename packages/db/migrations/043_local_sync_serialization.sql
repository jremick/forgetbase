-- One mutation clock covers every authorization and governed-content row that
-- can affect a local projection. Snapshot builders lock this row before they
-- read, and final lease issuance holds the same lock through signing.
CREATE TABLE IF NOT EXISTS local_sync_serialization_state (
  singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO local_sync_serialization_state (singleton, revision)
VALUES (TRUE, 0)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION bump_local_sync_serialization_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Usage timestamps do not change a key's authorization. Manifest
    -- reauthentication must not invalidate the snapshot it is validating.
    IF TG_TABLE_NAME = 'api_keys' AND
      (to_jsonb(OLD) - 'last_used_at') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'last_used_at') THEN
      RETURN NULL;
    END IF;
    -- Successful session touches only extend activity. Moving activity back,
    -- changing expiry, rotating a key, or revoking a session still invalidates.
    IF TG_TABLE_NAME = 'login_sessions' AND
      (to_jsonb(NEW)->>'last_seen_at')::timestamptz >= COALESCE((to_jsonb(OLD)->>'last_seen_at')::timestamptz, (to_jsonb(OLD)->>'created_at')::timestamptz) AND
      (to_jsonb(OLD) - 'last_seen_at') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'last_seen_at') THEN
      RETURN NULL;
    END IF;
    IF to_jsonb(OLD) IS NOT DISTINCT FROM to_jsonb(NEW) THEN
      RETURN NULL;
    END IF;
  END IF;
  UPDATE local_sync_serialization_state
  SET revision = revision + 1,
      updated_at = now()
  WHERE singleton = TRUE;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'service_accounts',
    'api_keys',
    'login_sessions',
    'login_session_refresh_tokens',
    'groups',
    'group_memberships',
    'permission_grants',
    'assets',
    'asset_versions',
    'instruction_objects',
    'human_documents'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL
      THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_local_sync_serialization', table_name);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION bump_local_sync_serialization_revision()',
        table_name || '_local_sync_serialization',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
