import { describe, expect, it } from "vitest";

import {
  formatContentHealthSampleNote,
  formatAnalyticsCount,
  formatAnalyticsDay,
  formatAnalyticsRate,
  formatReviewState,
  reviewStateVariant
} from "./analytics-dashboard.js";

describe("analytics dashboard helpers", () => {
  it("formats counts and rates without implying a rate for an empty sample", () => {
    expect(formatAnalyticsCount(12_345)).toBe("12,345");
    expect(formatAnalyticsRate(1, 4)).toBe("25%");
    expect(formatAnalyticsRate(0, 0)).toBe("—");
  });

  it("formats daily UTC buckets without shifting the date", () => {
    expect(formatAnalyticsDay("2026-09-01")).toBe("1 Sept");
    expect(formatAnalyticsDay("not-a-date")).toBe("not-a-date");
  });

  it("turns review-state keys into readable, consistent labels", () => {
    expect(formatReviewState("due-soon")).toBe("Due Soon");
    expect(formatReviewState("needs_review")).toBe("Needs Review");
    expect(reviewStateVariant("fresh")).toBe("success");
    expect(reviewStateVariant("due-soon")).toBe("warning");
    expect(reviewStateVariant("overdue")).toBe("destructive");
    expect(reviewStateVariant("unknown")).toBe("neutral");
  });

  it("labels bounded content health without implying exhaustive counts", () => {
    expect(formatContentHealthSampleNote({ sampleLimit: 200, sampleLimitReached: false, totalCount: 18 }))
      .toContain("18 governed content records");
    expect(formatContentHealthSampleNote({ sampleLimit: 200, sampleLimitReached: true, totalCount: 200 }))
      .toContain("older content may be omitted");
  });
});
