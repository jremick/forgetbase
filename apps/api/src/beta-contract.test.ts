import { describe, expect, it } from "vitest";
import { aiExportPackageSchema, okfExportPackageSchema } from "@forgetbase/schema";
import { InMemoryAuthRepository, InMemoryRegistryRepository, InMemoryRetrievalRepository } from "@forgetbase/db";
import { buildServer } from "./server.js";

describe("beta machine-consumer contract", () => {
  it("freezes the canonical API fetch, search, JSON export, OKF export, and OpenAPI path", async () => {
    const registryRepository = new InMemoryRegistryRepository();
    const authRepository = new InMemoryAuthRepository();
    const retrievalRepository = new InMemoryRetrievalRepository();
    const server = buildServer({
      logger: false,
      registryRepository,
      authRepository,
      retrievalRepository
    });

    try {
      const adminBootstrap = await server.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: {
          email: "admin@example.test",
          displayName: "Admin"
        }
      });
      const adminKey = adminBootstrap.json().secret;

      await createContractAsset(server, adminKey, {
        stableId: "policy.beta-public-export",
        title: "Beta Public Export Policy",
        sensitivity: "public-demo",
        audience: ["ai-team"],
        body: "Beta public export instruction for canonical agent connector packages."
      });
      await createContractAsset(server, adminKey, {
        stableId: "policy.beta-restricted-export",
        title: "Beta Restricted Export Policy",
        sensitivity: "restricted",
        audience: ["security-team"],
        body: "Restricted beta export instruction must not leak to anonymous contract exports."
      });

      const openApiResponse = await server.inject({
        method: "GET",
        url: "/openapi.json"
      });

      expect(openApiResponse.statusCode).toBe(200);
      const openApi = openApiResponse.json();
      expect(Object.keys(openApi.paths)).toEqual(expect.arrayContaining([
        "/assets/{stableId}",
        "/search",
        "/exports/ai-package"
      ]));
      expect(parameterNames(openApi.paths["/search"].get.parameters)).toEqual(["query", "strategy", "limit"]);
      expect(parameterNames(openApi.paths["/exports/ai-package"].get.parameters)).toEqual([
        "package",
        "format",
        "okfVersion",
        "limit"
      ]);

      const fetchResponse = await server.inject({
        method: "GET",
        url: "/assets/policy.beta-public-export"
      });

      expect(fetchResponse.statusCode).toBe(200);
      expect(fetchResponse.json().asset).toMatchObject({
        stableId: "policy.beta-public-export",
        sensitivity: "public-demo",
        lifecycleState: "active",
        status: "approved",
        allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
        allowedExports: ["demo-agent-pack"]
      });

      const searchResponse = await server.inject({
        method: "GET",
        url: "/search?query=canonical%20agent%20connector&strategy=lexical&limit=5"
      });

      expect(searchResponse.statusCode).toBe(200);
      expect(searchResponse.json().results.map((result: { asset: { stableId: string } }) => result.asset.stableId))
        .toContain("policy.beta-public-export");

      const exportResponse = await server.inject({
        method: "GET",
        url: "/exports/ai-package?package=demo-agent-pack&format=json&limit=10"
      });

      expect(exportResponse.statusCode).toBe(200);
      const exportPackage = aiExportPackageSchema.parse(exportResponse.json());
      expect(exportPackage).toMatchObject({
        packageName: "demo-agent-pack",
        tenantId: "tenant_demo",
        assetCount: 1,
        deniedCount: 1
      });
      expect(exportPackage.assets.map((asset) => asset.stableId)).toEqual(["policy.beta-public-export"]);
      expect(exportPackage.assets[0]?.sourceVersion).toMatchObject({
        versionNumber: 1
      });
      expect(exportPackage.assets[0]?.citations[0]).toMatchObject({
        stableId: "policy.beta-public-export"
      });
      expect(JSON.stringify(exportPackage)).not.toContain("Restricted beta export instruction");

      const okfExportResponse = await server.inject({
        method: "GET",
        url: "/exports/ai-package?package=demo-agent-pack&format=okf&okfVersion=0.1&limit=10"
      });

      expect(okfExportResponse.statusCode).toBe(200);
      const okfExportPackage = okfExportPackageSchema.parse(okfExportResponse.json());
      expect(okfExportPackage).toMatchObject({
        format: "okf",
        packageName: "demo-agent-pack",
        tenantId: "tenant_demo",
        okfVersion: "0.1",
        assetCount: 1,
        deniedCount: 1,
        rootIndexPath: "index.md"
      });
      expect(okfExportPackage.spec).toMatchObject({
        name: "Open Knowledge Format",
        version: "0.1",
        status: "draft"
      });
      expect(okfExportPackage.sourcePackageHash).toBeTruthy();
      expect(okfExportPackage.projectionHash).toBeTruthy();
      expect(okfExportPackage.files.map((file) => file.path)).toEqual(expect.arrayContaining([
        "index.md",
        "manifest.md",
        "log.md"
      ]));
      const conceptFile = okfExportPackage.files.find((file) => file.path.startsWith("policies/"));
      expect(conceptFile?.path).toMatch(/^policies\/policy-beta-public-export-[a-f0-9]+\.md$/);
      expect(conceptFile?.content).toContain("stable_id: \"policy.beta-public-export\"");
      expect(conceptFile?.content).toContain("source_version_number: 1");
      expect(conceptFile?.content).toContain("allowed_exports:");
      expect(JSON.stringify(okfExportPackage)).not.toContain("Restricted beta export instruction");
    } finally {
      await server.close();
    }
  });
});

async function createContractAsset(
  server: ReturnType<typeof buildServer>,
  adminKey: string,
  input: {
    stableId: string;
    title: string;
    sensitivity: "public-demo" | "restricted";
    audience: string[];
    body: string;
  }
): Promise<void> {
  const response = await server.inject({
    method: "POST",
    url: "/assets",
    headers: {
      authorization: `Bearer ${adminKey}`
    },
    payload: {
      stableId: input.stableId,
      type: "policy",
      ownerId: "user_admin",
      title: input.title,
      summary: "Synthetic beta contract asset.",
      lifecycleState: "active",
      sensitivity: input.sensitivity,
      audience: input.audience,
      status: "approved",
      reviewDueAt: "2027-01-31",
      allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
      allowedExports: ["demo-agent-pack"],
      instruction: {
        instructionKind: "policy",
        body: input.body
      },
      humanDocument: {
        format: "markdown",
        body: `# ${input.title}`
      }
    }
  });

  expect(response.statusCode).toBe(201);
}

function parameterNames(parameters: Array<{ name: string }>): string[] {
  return parameters.map((parameter) => parameter.name);
}
