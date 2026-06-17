import { describe, expect, it } from "vitest";
import { redactText, validateAssetCollection } from "./index.js";

const validAsset = {
  stableId: "guardrail.validation",
  type: "guardrail",
  ownerId: "user_admin",
  title: "Validation Guardrail",
  lifecycleState: "active",
  sensitivity: "public-demo",
  audience: ["ai-team"],
  status: "approved",
  reviewDueAt: "2027-01-31",
  allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
  allowedExports: ["demo-agent-pack"],
  metadata: {},
  instruction: {
    instructionKind: "guardrail",
    body: "Validate governed assets before import."
  },
  humanDocument: {
    format: "markdown",
    body: "# Validation Guardrail"
  }
};

describe("redactText", () => {
  it("redacts common direct identifiers without changing ordinary text", () => {
    const fakeApiKey = `${"s"}${"k"}-abcdefghijklmnopqrstuvwxyz123456`;
    const result = redactText(
      `Ask jane@example.com about +61 400 123 456 using ${fakeApiKey}.`
    );

    expect(result.text).toBe(
      "Ask [REDACTED_EMAIL] about [REDACTED_PHONE] using [REDACTED_API_KEY]."
    );
    expect(result.redacted).toBe(true);
    expect(result.findings).toEqual([
      { kind: "api-key", count: 1 },
      { kind: "email", count: 1 },
      { kind: "phone", count: 1 }
    ]);
  });

  it("redacts high-signal provider, cloud, and repository token shapes as API keys", () => {
    const githubClassicToken = `ghp_${"a".repeat(36)}`;
    const githubFineGrainedToken = `github_pat_${"A".repeat(24)}_${"b".repeat(36)}`;
    const googleApiKey = `AIza${"C".repeat(35)}`;
    const awsAccessKey = `AKIA${"D".repeat(16)}`;
    const slackBotToken = `xoxb-${"1234567890-".repeat(3)}abcdef`;
    const result = redactText(
      `Rotate ${githubClassicToken} ${githubFineGrainedToken} ${googleApiKey} ${awsAccessKey} ${slackBotToken}.`
    );

    expect(result.text).toBe(
      "Rotate [REDACTED_API_KEY] [REDACTED_API_KEY] [REDACTED_API_KEY] [REDACTED_API_KEY] [REDACTED_API_KEY]."
    );
    expect(result.redacted).toBe(true);
    expect(result.findings).toEqual([
      { kind: "api-key", count: 5 }
    ]);
  });

  it("redacts pasted tokens, IP addresses, URL secrets, and government ID-like values", () => {
    const jwt = `eyJ${"a".repeat(16)}.${"b".repeat(16)}.${"c".repeat(16)}`;
    const result = redactText(
      `Authorization: Bearer ${"d".repeat(24)} ${jwt} from 203.0.113.42 with https://example.test/callback?code=abcdef1234567890 and id 123-45-6789.`
    );

    expect(result.text).toBe(
      "Authorization: Bearer [REDACTED_BEARER_TOKEN] [REDACTED_JWT] from [REDACTED_IP_ADDRESS] with https://example.test/callback?code=[REDACTED_URL_SECRET] and id [REDACTED_GOVERNMENT_ID]."
    );
    expect(result.redacted).toBe(true);
    expect(result.findings).toEqual([
      { kind: "jwt", count: 1 },
      { kind: "bearer-token", count: 1 },
      { kind: "url-secret", count: 1 },
      { kind: "government-id", count: 1 },
      { kind: "ip-address", count: 1 }
    ]);
  });

  it("does not redact ordinary review dates or stable IDs", () => {
    const result = redactText("Review guardrail.pii-redaction by 2027-01-31.");

    expect(result.text).toBe("Review guardrail.pii-redaction by 2027-01-31.");
    expect(result.redacted).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("can be disabled by policy", () => {
    const result = redactText("Ask jane@example.test from 203.0.113.42.", {
      enabled: false,
      ruleKinds: ["email", "ip-address"]
    });

    expect(result.text).toBe("Ask jane@example.test from 203.0.113.42.");
    expect(result.redacted).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("can limit redaction to selected rule kinds", () => {
    const result = redactText("Ask jane@example.test from 203.0.113.42.", {
      enabled: true,
      ruleKinds: ["email"]
    });

    expect(result.text).toBe("Ask [REDACTED_EMAIL] from 203.0.113.42.");
    expect(result.redacted).toBe(true);
    expect(result.findings).toEqual([
      { kind: "email", count: 1 }
    ]);
  });
});

describe("validateAssetCollection", () => {
  it("accepts valid governed assets", () => {
    const result = validateAssetCollection({ assets: [validAsset] }, { asOf: "2026-06-16" });

    expect(result.ok).toBe(true);
    expect(result.assetCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it("fails on missing required governed metadata", () => {
    const invalid = {
      ...validAsset,
      ownerId: undefined,
      status: undefined
    };
    const result = validateAssetCollection({ assets: [invalid] }, { asOf: "2026-06-16" });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "assets.0.ownerId",
      "assets.0.status"
    ]));
  });

  it("reports stale review dates without failing the report", () => {
    const result = validateAssetCollection({
      assets: [{
        ...validAsset,
        reviewDueAt: "2026-01-01"
      }]
    }, { asOf: "2026-06-16" });

    expect(result.ok).toBe(true);
    expect(result.staleCount).toBe(1);
    expect(result.issues[0]).toMatchObject({
      severity: "warning",
      code: "review.stale",
      stableId: "guardrail.validation"
    });
  });

  it("fails on duplicate stable IDs, broken references, and restricted public exports", () => {
    const result = validateAssetCollection({
      assets: [
        {
          ...validAsset,
          metadata: {
            relatedStableIds: ["missing.asset"]
          }
        },
        {
          ...validAsset,
          sensitivity: "restricted"
        }
      ]
    }, { asOf: "2026-06-16" });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "stable_id.duplicate",
      "reference.missing",
      "export.restricted_leakage"
    ]));
  });
});
