import { describe, expect, it } from "vitest";
import {
  assetCreateInputSchema,
  assetSchema,
  authProviderConfigInputSchema,
  createHealthResponse,
  healthResponseSchema,
  managedQueryEvalInputSchema,
  managedQueryInputSchema,
  modelProviderConfigInputSchema
} from "./index.js";

describe("schema package", () => {
  it("validates a governed asset", () => {
    const asset = assetSchema.parse({
      id: "asset_01",
      tenantId: "tenant_default",
      stableId: "policy.acceptable-ai-use",
      type: "policy",
      ownerId: "user_admin",
      title: "Acceptable AI Use",
      lifecycleState: "active",
      sensitivity: "internal",
      audience: ["all-staff"],
      status: "approved",
      reviewDueAt: "2026-12-31",
      allowedSurfaces: ["api", "cli", "mcp", "web"],
      allowedExports: ["internal-ai-package"],
      allowedActions: []
    });

    expect(asset.stableId).toBe("policy.acceptable-ai-use");
  });

  it("builds the shared health response", () => {
    expect(healthResponseSchema.parse(createHealthResponse("agentic-cms-api"))).toEqual({
      status: "ok",
      service: "agentic-cms-api",
      version: "0.1.0"
    });
  });

  it("validates an agent-first asset create payload", () => {
    const asset = assetCreateInputSchema.parse({
      stableId: "guardrail.pii-redaction",
      type: "guardrail",
      ownerId: "user_admin",
      title: "PII Redaction Guardrail",
      lifecycleState: "active",
      sensitivity: "internal",
      audience: ["ai-team"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      sourceKind: "synthetic-demo",
      allowedSurfaces: ["api", "cli", "mcp"],
      instruction: {
        instructionKind: "guardrail",
        body: "Remove or mask direct personal identifiers before using model context."
      },
      humanDocument: {
        format: "markdown",
        body: "# PII Redaction Guardrail\n\nMask direct personal identifiers before retrieval."
      }
    });

    expect(asset.tenantId).toBe("tenant_demo");
    expect(asset.instruction?.targetAgents).toEqual([]);
    expect(asset.humanDocument?.linkedInstructionIds).toEqual([]);
  });

  it("validates deterministic managed query eval cases", () => {
    const evalInput = managedQueryEvalInputSchema.parse({
      cases: [
        {
          id: "eval.pii-redaction",
          query: "How should support records be redacted?",
          expectedStableIds: ["guardrail.pii-redaction"]
        }
      ]
    });

    expect(evalInput.tenantId).toBe("tenant_demo");
    expect(evalInput.limit).toBe(5);
    expect(evalInput.cases[0]?.requiredCitationCount).toBe(1);
    expect(evalInput.cases[0]?.expectedGrounded).toBe(true);
  });

  it("validates provider-routed managed query input", () => {
    const query = managedQueryInputSchema.parse({
      query: "How should model context be assembled?",
      mode: "provider-routed",
      provider: "openai",
      model: "gpt-test"
    });

    expect(query.tenantId).toBe("tenant_demo");
    expect(query.mode).toBe("provider-routed");
    expect(query.provider).toBe("openai");
    expect(query.model).toBe("gpt-test");
    expect(query.cache).toBe(true);
  });

  it("validates provider config stubs without secret values", () => {
    const config = modelProviderConfigInputSchema.parse({
      provider: "openai",
      enabled: true,
      apiKeyEnvVar: "OPENAI_API_KEY",
      defaultModel: "gpt-5.1",
      availableModels: ["gpt-5.1"],
      priority: 10
    });

    expect(config.tenantId).toBe("tenant_demo");
    expect(config.apiKeyEnvVar).toBe("OPENAI_API_KEY");
  });

  it("validates external auth provider config stubs without client secrets", () => {
    const config = authProviderConfigInputSchema.parse({
      provider: "microsoft-entra",
      enabled: true,
      issuerUrl: "https://login.microsoftonline.com/common/v2.0",
      clientId: "agentic-cms-client",
      clientSecretEnvVar: "ENTRA_CLIENT_SECRET",
      groupClaim: "groups",
      allowedDomains: ["example.com"]
    });

    expect(config.tenantId).toBe("tenant_demo");
    expect(config.defaultRole).toBe("reader");
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
    expect(config.clientSecretEnvVar).toBe("ENTRA_CLIENT_SECRET");
  });
});
