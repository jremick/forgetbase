import type { AssetRecord } from "@agentic-cms/schema";
import type { BadgeVariant } from "../components/ui/badge.js";

export type LibraryViewFilter = "all" | "public-reader" | "needs-governance" | "approved-active";

export function isPublicReaderEligible(asset: Pick<AssetRecord, "lifecycleState" | "sensitivity" | "status">): boolean {
  return asset.sensitivity === "public-demo" && asset.lifecycleState === "active" && asset.status === "approved";
}

export function isAssetGovernanceDue(asset: Pick<AssetRecord, "lifecycleState" | "reviewDueAt" | "status">): boolean {
  return asset.status !== "approved" || asset.lifecycleState !== "active" || isReviewOverdue(asset.reviewDueAt);
}

export function libraryAssetMatches(asset: AssetRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    asset.title,
    asset.stableId,
    asset.type,
    asset.summary ?? "",
    asset.ownerId,
    asset.sourceKind ?? "",
    asset.sourceRef ?? ""
  ].join(" ").toLowerCase().includes(normalizedQuery);
}

export function libraryAssetMatchesView(asset: AssetRecord, view: LibraryViewFilter): boolean {
  switch (view) {
    case "public-reader":
      return isPublicReaderEligible(asset);
    case "needs-governance":
      return isAssetGovernanceDue(asset);
    case "approved-active":
      return asset.status === "approved" && asset.lifecycleState === "active";
    case "all":
    default:
      return true;
  }
}

export function reviewDueTimestamp(reviewDueAt: string): number | null {
  const value = /^\d{4}-\d{2}-\d{2}$/.test(reviewDueAt) ? `${reviewDueAt}T00:00:00Z` : reviewDueAt;
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function daysUntilReview(reviewDueAt: string): number | null {
  const dueAt = reviewDueTimestamp(reviewDueAt);

  if (dueAt === null) {
    return null;
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.ceil((dueAt - todayUtc) / 86_400_000);
}

export function isReviewOverdue(reviewDueAt: string): boolean {
  const daysUntil = daysUntilReview(reviewDueAt);

  return daysUntil !== null && daysUntil < 0;
}

export function formatReviewDue(reviewDueAt: string): string {
  const daysUntil = daysUntilReview(reviewDueAt);

  if (daysUntil === null) {
    return reviewDueAt;
  }

  if (daysUntil < 0) {
    return `overdue ${Math.abs(daysUntil)}d`;
  }

  if (daysUntil === 0) {
    return "due today";
  }

  return `${daysUntil}d`;
}

export function stateBadgeVariant(value: string): BadgeVariant {
  if (["active", "approved", "enabled", "pass", "ready", "ok", "authenticated"].includes(value)) {
    return "success";
  }

  if (["draft", "reviewing", "pending", "dry-run", "stale", "warn"].includes(value)) {
    return "warning";
  }

  if (["disabled", "denied", "rejected", "failed", "error", "expired", "revoked"].includes(value)) {
    return "destructive";
  }

  return "neutral";
}

export function sensitivityBadgeVariant(value: string): BadgeVariant {
  switch (value) {
    case "public-demo":
      return "sensitivity-public";
    case "internal":
      return "sensitivity-internal";
    case "restricted":
      return "sensitivity-restricted";
    case "confidential":
      return "sensitivity-confidential";
    case "secret":
      return "sensitivity-secret";
    default:
      return "neutral";
  }
}

export function formatDaysUntil(daysUntilExpiry: number | null): string {
  if (daysUntilExpiry === null) {
    return "no expiry";
  }

  if (daysUntilExpiry <= 0) {
    return `${Math.abs(daysUntilExpiry)}d overdue`;
  }

  return `${daysUntilExpiry}d left`;
}

export function formatCounts(counts: Array<{ key: string; count: number }>): string {
  return counts.length
    ? counts.map((entry) => `${entry.key} ${entry.count}`).join(", ")
    : "none";
}

export function formatList(values: string[]): string {
  return values.length ? values.join(", ") : "none";
}

export function formatMetric(value: number | null, suffix = ""): string {
  return value === null ? "n/a" : `${value}${suffix}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatCurrency(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(6)}`;
}

export function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCsvInput(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function formatRetentionDays(value: number | null): string {
  return value === null ? "forever" : `${value}d`;
}

export function formatRetentionInput(value: number | null): string {
  return value === null ? "forever" : String(value);
}

export function parseRetentionInput(value: string): number | null {
  const trimmed = value.trim().toLowerCase();

  if (["forever", "none", "null"].includes(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function policyValue(value: number | null): string {
  return value === null ? "unlimited" : String(value);
}

export function formatCachePolicyTtl(value: number | null): string {
  return value === null ? "unlimited" : `${value}s`;
}

export function parseNullablePolicyNumber(value: string): number | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed || ["forever", "none", "null", "unlimited"].includes(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }

  return parsed;
}
