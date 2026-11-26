import { describe, expect, it } from "vitest";
import {
  isDeploymentProviderSecretAllowed,
  readDeploymentProviderSecretBindings
} from "./provider-secret-bindings.js";

describe("deployment provider secret bindings", () => {
  it("keeps built-in provider credentials bound to their provider origins", () => {
    const bindings = readDeploymentProviderSecretBindings("");

    expect(isDeploymentProviderSecretAllowed(bindings, {
      envVar: "OPENAI_API_KEY",
      provider: "openai",
      destinationUrl: "https://api.openai.com/v1"
    })).toBe(true);
    expect(isDeploymentProviderSecretAllowed(bindings, {
      envVar: "OPENAI_API_KEY",
      provider: "openrouter",
      destinationUrl: "https://api.openai.com/v1"
    })).toBe(false);
    expect(isDeploymentProviderSecretAllowed(bindings, {
      envVar: "OPENAI_API_KEY",
      provider: "openai",
      destinationUrl: "https://attacker.example.test"
    })).toBe(false);
  });

  it("accepts exact operator bindings without granting sibling names or origins", () => {
    const bindings = readDeploymentProviderSecretBindings(JSON.stringify([{
      envVar: "CORP_OIDC_CLIENT_SECRET",
      provider: "oidc",
      origin: "https://identity.example.test"
    }]));

    expect(isDeploymentProviderSecretAllowed(bindings, {
      envVar: "CORP_OIDC_CLIENT_SECRET",
      provider: "oidc",
      destinationUrl: "https://identity.example.test/oauth/token"
    })).toBe(true);
    expect(isDeploymentProviderSecretAllowed(bindings, {
      envVar: "CORP_OIDC_CLIENT_SECRET_FILE",
      provider: "oidc",
      destinationUrl: "https://identity.example.test/oauth/token"
    })).toBe(false);
    expect(isDeploymentProviderSecretAllowed(bindings, {
      envVar: "CORP_OIDC_CLIENT_SECRET",
      provider: "oidc",
      destinationUrl: "https://other.example.test/oauth/token"
    })).toBe(false);
  });

  it.each([
    "FORGETBASE_OIDC_STATE_SECRET",
    "FORGETBASE_LOCAL_SYNC_SIGNING_PRIVATE_KEY_FILE",
    "CUSTOM_PROVIDER_KEY_FILE_FILE",
    "DATABASE_URL",
    "PGPASSWORD",
    "KUBECONFIG",
    "AWS_SECRET_ACCESS_KEY",
    "APP_SESSION_SECRET"
  ])("rejects reserved host reference %s from operator bindings", (envVar) => {
    expect(() => readDeploymentProviderSecretBindings(JSON.stringify([{
      envVar,
      provider: "openai",
      origin: "https://api.openai.com"
    }]))).toThrow(/reserved/);
  });

  it("rejects insecure or malformed deployment binding configuration", () => {
    expect(() => readDeploymentProviderSecretBindings("not-json")).toThrow(/JSON array/);
    expect(() => readDeploymentProviderSecretBindings(JSON.stringify([{
      envVar: "CUSTOM_PROVIDER_KEY",
      provider: "openai",
      origin: "http://provider.example.test"
    }]))).toThrow(/HTTPS/);
    expect(() => readDeploymentProviderSecretBindings(JSON.stringify([{
      envVar: "CUSTOM_PROVIDER_KEY",
      provider: "openai",
      origin: "https://provider.example.test/tenant-path"
    }]))).toThrow(/scheme, host/);
    expect(() => readDeploymentProviderSecretBindings(JSON.stringify([
      { envVar: "SHARED_PROVIDER_KEY", provider: "openai", origin: "https://api.openai.com" },
      { envVar: "SHARED_PROVIDER_KEY", provider: "openrouter", origin: "https://openrouter.ai" }
    ]))).toThrow(/exactly one provider origin/);
  });

  it("accepts one OIDC issuer for each token binding", () => {
    const binding = {
      envVar: "OIDC_EXAMPLE_SECRET", provider: "oidc", origin: "https://tokens.example.test",
      issuerOrigin: "https://idp.example.test"
    };
    expect(readDeploymentProviderSecretBindings(JSON.stringify([binding]))).toContainEqual(binding);
    expect(() => readDeploymentProviderSecretBindings(JSON.stringify([
      binding, { ...binding, issuerOrigin: "https://another-idp.example.test" }
    ]))).toThrow(/exactly one provider origin/);
    expect(() => readDeploymentProviderSecretBindings(JSON.stringify([{ ...binding, provider: "openai" }])))
      .toThrow(/issuerOrigin/);
  });
});
