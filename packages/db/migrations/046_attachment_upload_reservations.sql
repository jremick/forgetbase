ALTER TABLE attachments
  DROP CONSTRAINT attachments_lifecycle_state_check,
  DROP CONSTRAINT attachments_lifecycle_timestamps_check;

ALTER TABLE attachments
  ADD CONSTRAINT attachments_lifecycle_state_check
    CHECK (lifecycle_state IN ('pending', 'active', 'deleting', 'deleted')),
  ADD CONSTRAINT attachments_lifecycle_timestamps_check
    CHECK (
      (lifecycle_state IN ('pending', 'active') AND deletion_requested_at IS NULL AND deleted_at IS NULL)
      OR (lifecycle_state = 'deleting' AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL)
      OR (lifecycle_state = 'deleted' AND deletion_requested_at IS NOT NULL AND deleted_at IS NOT NULL)
    );
