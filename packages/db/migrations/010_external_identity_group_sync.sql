ALTER TABLE users
  ADD COLUMN IF NOT EXISTS external_provider text,
  ADD COLUMN IF NOT EXISTS external_subject text,
  ADD COLUMN IF NOT EXISTS external_issuer text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_external_identity_complete_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_external_identity_complete_chk
      CHECK (
        (
          external_provider IS NULL
          AND external_subject IS NULL
          AND external_issuer IS NULL
        )
        OR (
          external_provider IN ('oidc', 'microsoft-entra')
          AND external_subject IS NOT NULL
          AND external_issuer IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_external_identity_idx
  ON users (tenant_id, external_provider, external_issuer, external_subject)
  WHERE external_provider IS NOT NULL
    AND external_issuer IS NOT NULL
    AND external_subject IS NOT NULL;

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS external_provider text,
  ADD COLUMN IF NOT EXISTS external_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_external_identity_complete_chk'
  ) THEN
    ALTER TABLE groups
      ADD CONSTRAINT groups_external_identity_complete_chk
      CHECK (
        (
          external_provider IS NULL
          AND external_id IS NULL
        )
        OR (
          external_provider IN ('oidc', 'microsoft-entra')
          AND external_id IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS groups_external_identity_idx
  ON groups (tenant_id, external_provider, external_id)
  WHERE external_provider IS NOT NULL
    AND external_id IS NOT NULL;

ALTER TABLE group_memberships
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS external_provider text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_memberships_source_chk'
  ) THEN
    ALTER TABLE group_memberships
      ADD CONSTRAINT group_memberships_source_chk
      CHECK (source IN ('local', 'external'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_memberships_external_provider_chk'
  ) THEN
    ALTER TABLE group_memberships
      ADD CONSTRAINT group_memberships_external_provider_chk
      CHECK (
        (
          source = 'local'
          AND external_provider IS NULL
        )
        OR (
          source = 'external'
          AND external_provider IN ('oidc', 'microsoft-entra')
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS group_memberships_external_source_idx
  ON group_memberships (user_id, source, external_provider);

ALTER TABLE auth_provider_configs
  ADD COLUMN IF NOT EXISTS account_linking_mode text NOT NULL DEFAULT 'verified-email';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_provider_configs_account_linking_mode_chk'
  ) THEN
    ALTER TABLE auth_provider_configs
      ADD CONSTRAINT auth_provider_configs_account_linking_mode_chk
      CHECK (account_linking_mode IN ('disabled', 'verified-email', 'email'));
  END IF;
END $$;
