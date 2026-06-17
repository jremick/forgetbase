ALTER TABLE action_execution_policies
  ADD COLUMN IF NOT EXISTS max_requests_per_hour integer NOT NULL DEFAULT 60 CHECK (
    max_requests_per_hour BETWEEN 1 AND 10000
  );
