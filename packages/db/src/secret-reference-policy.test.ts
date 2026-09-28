import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { defaultSecretReferencePolicy, isSecretEnvVarAllowed } from "./secret-reference-policy.js";
import { InMemoryModelProviderConfigRepository, PostgresModelProviderConfigRepository } from "./provider-config.js";
import { InMemoryAuthProviderConfigRepository, PostgresAuthProviderConfigRepository } from "./auth-provider-config.js";

const reserved = ["FORGETBASE_UPDATER_API_TOKEN", "FORGETBASE_UPDATER_API_TOKEN_FILE", "FORGETBASE_UPDATER_API_TOKEN_FILE_FILE"];

describe("reserved host secret references", () => {
  it.each(reserved)("denies %s before default, exact, prefix, or allow-unlisted policy", (reference) => {
    const defaults = defaultSecretReferencePolicy("tenant_reserved");
    for (const policy of [defaults, { ...defaults, allowedEnvVarPrefixes: [], allowedEnvVars: [reference] }, { ...defaults, allowedEnvVarPrefixes: [reference] }, { ...defaults, allowUnlistedEnvVars: true }]) {
      expect(isSecretEnvVarAllowed(policy, reference)).toBe(false);
      expect(isSecretEnvVarAllowed({ ...policy, allowUnlistedEnvVars: true }, "OPENAI_API_KEY")).toBe(true);
      expect(isSecretEnvVarAllowed(policy, null)).toBe(true);
    }
  });

  it.each(reserved)("rejects %s at both repository write boundaries before persistence", async (reference) => {
    const query = vi.fn(async () => { throw new Error("SQL must not run for a reserved reference"); });
    const pool = { query } as unknown as Pool;
    for (const model of [new InMemoryModelProviderConfigRepository(), new PostgresModelProviderConfigRepository(pool)]) {
      await expect(model.upsertProviderConfig({ provider: "openai", apiKeyEnvVar: reference })).rejects.toThrow(/reserved.*secret/i);
    }
    for (const auth of [new InMemoryAuthProviderConfigRepository(), new PostgresAuthProviderConfigRepository(pool)]) {
      await expect(auth.upsertAuthProviderConfig({ provider: "oidc", issuerUrl: "https://idp.example.test", clientId: "synthetic", clientSecretEnvVar: reference })).rejects.toThrow(/reserved.*secret/i);
    }
    expect(query).not.toHaveBeenCalled();
  });
});
