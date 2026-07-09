import { describe, expect, it } from "vitest";
import {
  assetCreateInputSchema,
  assetSchema,
  authProviderConfigInputSchema,
  buildOkfExportPackage,
  createHealthResponse,
  healthResponseSchema,
  managedQueryEvalInputSchema,
  managedQueryInputSchema,
  modelProviderConfigInputSchema,
  readerNavigationFallbacks,
  readerNavigationMetadataSchema
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
    expect(healthResponseSchema.parse(createHealthResponse("forgetbase-api"))).toEqual({
      status: "ok",
      service: "forgetbase-api",
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

  it("types reader navigation metadata while retaining safe omission fallbacks", () => {
    expect(readerNavigationMetadataSchema.parse({
      domain: "reader-experience",
      readerParentId: "policy.parent",
      readerNavLabel: "Child page",
      readerIcon: "guide",
      readerNavOrder: 20,
      readerPageInfoFields: ["updated", "maintainer"]
    })).toMatchObject({
      domain: "reader-experience",
      readerParentId: "policy.parent",
      readerIcon: "guide",
      readerNavOrder: 20
    });
    expect(readerNavigationMetadataSchema.parse({ domain: "reader-experience" })).toEqual({
      domain: "reader-experience"
    });
    expect(readerNavigationFallbacks).toMatchObject({
      parentId: null,
      label: null,
      icon: null,
      order: Number.MAX_SAFE_INTEGER,
      pageInfoFields: ["version", "updated", "access", "maintainer", "review"]
    });
  });

  it("rejects invalid reader navigation icons, orders, and footer fields", () => {
    expect(readerNavigationMetadataSchema.safeParse({ readerIcon: "made-up" }).success).toBe(false);
    expect(readerNavigationMetadataSchema.safeParse({ readerNavOrder: -1 }).success).toBe(false);
    expect(readerNavigationMetadataSchema.safeParse({ readerNavOrder: "10" }).success).toBe(false);
    expect(readerNavigationMetadataSchema.safeParse({
      readerPageInfoFields: ["updated", "updated"]
    }).success).toBe(false);
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
      clientId: "forgetbase-client",
      clientSecretEnvVar: "ENTRA_CLIENT_SECRET",
      groupClaim: "groups",
      allowedDomains: ["example.com"]
    });

    expect(config.tenantId).toBe("tenant_demo");
    expect(config.defaultRole).toBe("reader");
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
    expect(config.clientSecretEnvVar).toBe("ENTRA_CLIENT_SECRET");
  });

  it("builds versioned OKF export bundles from AI export packages", () => {
    const bundle = buildOkfExportPackage({
      packageName: "demo-agent-pack",
      generatedAt: "2026-06-18T00:00:00.000Z",
      tenantId: "tenant_demo",
      assetCount: 1,
      deniedCount: 0,
      assets: [
        {
          stableId: "policy.okf-export",
          assetId: "asset_okf",
          type: "policy",
          title: "OKF Export Policy",
          summary: "Public package material for OKF export.",
          audience: ["ai-team"],
          status: "approved",
          sensitivity: "public-demo",
          lifecycleState: "active",
          sourceRef: null,
          currentVersionId: "version_okf_1",
          sourceVersion: {
            id: "version_okf_1",
            versionNumber: 1,
            contentHash: "sha256:source",
            createdAt: "2026-06-18T00:00:00.000Z",
            changeNote: "Initial version"
          },
          allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
          allowedExports: ["demo-agent-pack"],
          instructions: [
            {
              id: "instruction_okf",
              instructionKind: "policy",
              targetAgents: [],
              body: "Use OKF for portable agent knowledge.",
              constraints: ["Preserve source version metadata."],
              failureModes: [],
              escalation: null
            }
          ],
          humanDocuments: [],
          citations: []
        }
      ]
    });

    expect(bundle.okfVersion).toBe("0.1");
    expect(bundle.rootIndexPath).toBe("index.md");
    expect(bundle.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      "index.md",
      "log.md",
      "manifest.md"
    ]));
    expect(bundle.files.find((file) => file.path.startsWith("policies/"))?.content)
      .toContain('source_version_number: 1');
    expect(bundle.projectionHash).toMatch(/^sha256:/);
  });
});
