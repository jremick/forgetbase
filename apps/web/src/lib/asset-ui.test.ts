import type { AssetRecord } from "@agentic-cms/schema";
import { describe, expect, it } from "vitest";
import {
  formatCachePolicyTtl,
  formatCounts,
  formatCurrency,
  formatList,
  formatMetric,
  formatPercent,
  formatRetentionDays,
  formatRetentionInput,
  formatReviewDue,
  isAssetGovernanceDue,
  isPublicReaderEligible,
  libraryAssetMatches,
  libraryAssetMatchesView,
  parseCsvInput,
  parseNullablePolicyNumber,
  parseOptionalNumber,
  parseRetentionInput,
  policyValue,
  sensitivityBadgeVariant,
  stateBadgeVariant
} from "./asset-ui.js";

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "asset_1",
    tenantId: "tenant_demo",
    stableId: "guardrail.pii-redaction",
    type: "policy",
    title: "PII Redaction Guardrail",
    summary: "How agents should handle direct personal identifiers.",
    ownerId: "privacy",
    lifecycleState: "active",
    sensitivity: "public-demo",
    audience: ["agents"],
    status: "approved",
    reviewDueAt: "2100-01-01",
    sourceKind: "demo",
    sourceRef: "corpus/demo/assets.json",
    allowedSurfaces: ["web", "api", "mcp"],
    allowedExports: ["json", "okf"],
    allowedActions: [],
    currentVersionId: "version_1",
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
    ...overrides
  };
}

describe("asset UI helpers", () => {
  it("requires public-demo, active, and approved for public-reader eligibility", () => {
    expect(isPublicReaderEligible(asset())).toBe(true);
    expect(isPublicReaderEligible(asset({ sensitivity: "internal" }))).toBe(false);
    expect(isPublicReaderEligible(asset({ lifecycleState: "draft" }))).toBe(false);
    expect(isPublicReaderEligible(asset({ status: "reviewing" }))).toBe(false);
  });

  it("marks assets due for governance when status, lifecycle, or review date is not current", () => {
    expect(isAssetGovernanceDue(asset())).toBe(false);
    expect(isAssetGovernanceDue(asset({ status: "reviewing" }))).toBe(true);
    expect(isAssetGovernanceDue(asset({ lifecycleState: "deprecated" }))).toBe(true);
    expect(isAssetGovernanceDue(asset({ reviewDueAt: "2000-01-01" }))).toBe(true);
    expect(isAssetGovernanceDue(asset({ reviewDueAt: "not-a-date" }))).toBe(false);
  });

  it("matches library text queries across asset identity and source fields", () => {
    const record = asset();

    expect(libraryAssetMatches(record, "")).toBe(true);
    expect(libraryAssetMatches(record, " pii redaction ")).toBe(true);
    expect(libraryAssetMatches(record, "GUARDRAIL.PII")).toBe(true);
    expect(libraryAssetMatches(record, "corpus/demo")).toBe(true);
    expect(libraryAssetMatches(record, "unrelated")).toBe(false);
  });

  it("filters library view modes without weakening public-reader gating", () => {
    expect(libraryAssetMatchesView(asset(), "all")).toBe(true);
    expect(libraryAssetMatchesView(asset(), "public-reader")).toBe(true);
    expect(libraryAssetMatchesView(asset({ sensitivity: "internal" }), "public-reader")).toBe(false);
    expect(libraryAssetMatchesView(asset({ status: "reviewing" }), "needs-governance")).toBe(true);
    expect(libraryAssetMatchesView(asset({ status: "reviewing" }), "approved-active")).toBe(false);
    expect(libraryAssetMatchesView(asset(), "approved-active")).toBe(true);
  });

  it("formats review dates and badge variants for stable UI states", () => {
    expect(formatReviewDue("not-a-date")).toBe("not-a-date");
    expect(stateBadgeVariant("active")).toBe("success");
    expect(stateBadgeVariant("reviewing")).toBe("warning");
    expect(stateBadgeVariant("revoked")).toBe("destructive");
    expect(stateBadgeVariant("unknown")).toBe("neutral");
    expect(sensitivityBadgeVariant("public-demo")).toBe("sensitivity-public");
    expect(sensitivityBadgeVariant("secret")).toBe("sensitivity-secret");
    expect(sensitivityBadgeVariant("unknown")).toBe("neutral");
  });

  it("formats display values and parses form helper inputs", () => {
    expect(formatCounts([{ key: "api", count: 2 }])).toBe("api 2");
    expect(formatCounts([])).toBe("none");
    expect(formatList(["web", "mcp"])).toBe("web, mcp");
    expect(formatList([])).toBe("none");
    expect(formatMetric(null)).toBe("n/a");
    expect(formatMetric(12, "ms")).toBe("12ms");
    expect(formatPercent(0.755)).toBe("76%");
    expect(formatCurrency(null)).toBe("n/a");
    expect(formatCurrency(0.25)).toBe("$0.250000");
    expect(formatRetentionDays(null)).toBe("forever");
    expect(formatRetentionInput(30)).toBe("30");
    expect(formatCachePolicyTtl(null)).toBe("unlimited");
    expect(policyValue(null)).toBe("unlimited");
    expect(parseOptionalNumber(" 1.25 ")).toBe(1.25);
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseOptionalNumber("NaN")).toBeUndefined();
    expect(parseCsvInput(" web, api,, mcp ")).toEqual(["web", "api", "mcp"]);
    expect(parseRetentionInput("forever")).toBeNull();
    expect(parseRetentionInput("bad")).toBe(0);
    expect(parseNullablePolicyNumber("unlimited")).toBeNull();
    expect(parseNullablePolicyNumber("15")).toBe(15);
    expect(() => parseNullablePolicyNumber("0")).toThrow("Invalid positive integer");
  });
});
