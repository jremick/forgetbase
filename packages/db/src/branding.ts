import type { Pool } from "pg";
import { brandingSchema, defaultBranding, type AuthPrincipal, type Branding } from "@forgetbase/schema";

export class PostgresBrandingRepository {
  constructor(private readonly pool: Pool) {}

  async get(tenantId: string): Promise<Branding> {
    const result = await this.pool.query<{ display_name: string; logo_data_url: string | null }>(
      "SELECT display_name, logo_data_url FROM tenant_branding WHERE tenant_id = $1", [tenantId]
    );
    const row = result.rows[0];
    return row ? brandingSchema.parse({ displayName: row.display_name, logoDataUrl: row.logo_data_url }) : { ...defaultBranding };
  }

  async save(principal: AuthPrincipal, input: Branding): Promise<Branding> {
    const branding = brandingSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO tenant_branding (tenant_id, display_name, logo_data_url)
        VALUES ($1, $2, $3) ON CONFLICT (tenant_id) DO UPDATE
        SET display_name = EXCLUDED.display_name, logo_data_url = EXCLUDED.logo_data_url, updated_at = now()`,
      [principal.tenantId, branding.displayName, branding.logoDataUrl]);
      await client.query(`INSERT INTO audit_events
        (tenant_id, actor_user_id, actor_service_account_id, actor_api_key_id, action, target_type, target_id, outcome, metadata)
        VALUES ($1, $2, $3, $4, 'admin.branding.update', 'branding', $1, 'success', $5::jsonb)`,
      [principal.tenantId, principal.userId, principal.serviceAccountId, principal.apiKeyId,
        JSON.stringify({ displayName: branding.displayName, customLogo: branding.logoDataUrl !== null })]);
      await client.query("COMMIT");
      return branding;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
