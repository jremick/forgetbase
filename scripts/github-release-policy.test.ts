import { describe, expect, it } from "vitest";
import { findReleaseCiRun, validateReleaseBranchProtection } from "./github-release-policy.js";

const commit = "a".repeat(40);
const protectedBranch = {
  required_status_checks: { strict: true, checks: [{ context: "Verify", app_id: 15368 }] },
  required_pull_request_reviews: { required_approving_review_count: 0 },
  enforce_admins: { enabled: true },
  required_conversation_resolution: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false }
};

describe("public release eligibility", () => {
  it("requires the source commit's completed CI", () => {
    const run = { headSha: commit, status: "completed", conclusion: "success" };
    expect(findReleaseCiRun([run], commit)).toBe(run);
    expect(findReleaseCiRun([run], "b".repeat(40))).toBeUndefined();
    expect(findReleaseCiRun([run], "main")).toBeUndefined();
  });

  it.each(["failure", "cancelled", "skipped"])("does not hide the latest %s behind an older success", (conclusion) => {
    expect(findReleaseCiRun([
      { headSha: commit, status: "completed", conclusion },
      { headSha: commit, status: "completed", conclusion: "success" }
    ], commit)).toBeUndefined();
  });

  it("waits for an in-progress run even when the same source passed before", () => {
    expect(findReleaseCiRun([
      { headSha: commit, status: "in_progress", conclusion: null },
      { headSha: commit, status: "completed", conclusion: "success" }
    ], commit)).toBeUndefined();
  });

  it("accepts the deliberately chosen solo-maintainer PR policy", () => {
    expect(validateReleaseBranchProtection(protectedBranch)).toEqual([]);
  });

  it("rejects an unreadable policy or an unrelated ruleset inventory", () => {
    expect(validateReleaseBranchProtection(null)).not.toEqual([]);
    expect(validateReleaseBranchProtection([{ name: "protect some other branch" }])).not.toEqual([]);
  });

  it("rejects a branch that requires an unrelated check", () => {
    expect(validateReleaseBranchProtection({
      ...protectedBranch, required_status_checks: { strict: true, contexts: ["Unrelated"] }
    })).toContain("main must require the CI Verify check");
  });

  it.each([
    ["enforce_admins", { enabled: false }],
    ["required_conversation_resolution", { enabled: false }],
    ["allow_force_pushes", { enabled: true }],
    ["allow_deletions", { enabled: true }],
    ["required_pull_request_reviews", null],
    ["required_status_checks", { strict: false, contexts: ["Verify"] }]
  ])("rejects unsafe %s settings", (setting, value) => {
    expect(validateReleaseBranchProtection({ ...protectedBranch, [setting]: value })).not.toEqual([]);
  });
});
