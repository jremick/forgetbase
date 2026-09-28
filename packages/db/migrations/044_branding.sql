CREATE TABLE IF NOT EXISTS tenant_branding (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 64),
  logo_data_url text CHECK (octet_length(logo_data_url) <= 349560),
  updated_at timestamptz NOT NULL DEFAULT now()
);
