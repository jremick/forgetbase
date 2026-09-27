ALTER TABLE local_sync_principal_state
  ADD COLUMN IF NOT EXISTS record_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS previous_record_set_hash text,
  ADD COLUMN IF NOT EXISTS previous_record_descriptors jsonb;

ALTER TABLE local_sync_principal_state
  DROP CONSTRAINT IF EXISTS local_sync_previous_record_set_hash_check;

ALTER TABLE local_sync_principal_state
  ADD CONSTRAINT local_sync_previous_record_set_hash_check
  CHECK (
    previous_record_set_hash IS NULL
    OR previous_record_set_hash ~ '^sha256:[0-9a-f]{64}$'
  ) NOT VALID;

ALTER TABLE local_sync_principal_state
  VALIDATE CONSTRAINT local_sync_previous_record_set_hash_check;

ALTER TABLE local_sync_principal_state
  DROP CONSTRAINT IF EXISTS local_sync_record_descriptors_array_check;

ALTER TABLE local_sync_principal_state
  ADD CONSTRAINT local_sync_record_descriptors_array_check
  CHECK (
    jsonb_typeof(record_descriptors) = 'array'
    AND (previous_record_descriptors IS NULL OR jsonb_typeof(previous_record_descriptors) = 'array')
  ) NOT VALID;

ALTER TABLE local_sync_principal_state
  VALIDATE CONSTRAINT local_sync_record_descriptors_array_check;
