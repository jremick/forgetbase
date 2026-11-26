-- Bootstrap is installation-scoped. The completion record deliberately has no
-- foreign keys so deleting tenant-local records cannot reopen bootstrap.
CREATE TABLE IF NOT EXISTS installation_bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  tenant_id text NOT NULL,
  admin_user_id uuid NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Legacy bootstrap recorded its user's UUID in target_id, which survives
-- deletion of the user even though actor_user_id is cleared by its FK.
INSERT INTO installation_bootstrap_state (singleton, tenant_id, admin_user_id, completed_at)
SELECT true, tenant_id, COALESCE(actor_user_id, target_id::uuid), created_at
FROM audit_events
WHERE action = 'auth.bootstrap' AND target_type = 'user' AND outcome = 'success'
ORDER BY created_at, id
LIMIT 1
ON CONFLICT (singleton) DO NOTHING;

-- Retention may already have purged the audit event on a legacy installation.
INSERT INTO installation_bootstrap_state (singleton, tenant_id, admin_user_id, completed_at)
SELECT true, tenant_id, id, created_at
FROM users
WHERE NOT EXISTS (SELECT 1 FROM installation_bootstrap_state)
ORDER BY created_at, id
LIMIT 1
ON CONFLICT (singleton) DO NOTHING;
