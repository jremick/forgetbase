import { describe, expect, it } from "vitest";
import { findReleaseCiRun, validateReleaseBranchProtection, validateReleaseCodeScanning } from "./github-release-policy.js";

const commit = "a".repeat(40);
const protectedBranch = {
  required_status_checks: { strict: true, checks: [{ context: "Verify", app_id: 15368 }] },
  required_pull_request_reviews: { required_approving_review_count: 0, require_code_owner_reviews: false, require_last_push_approval: false },
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
    })).toContain("main must require the CI Verify check from the GitHub Actions app");
  });

  it.each([undefined, -1, 12345])("rejects a Verify status bound to app %s", (appId) => {
    expect(validateReleaseBranchProtection({ ...protectedBranch,
      required_status_checks: { strict: true, contexts: ["Verify"], checks: [{ context: "Verify", app_id: appId }] }
    })).toContain("main must require the CI Verify check from the GitHub Actions app");
  });

  it.each([
    { required_approving_review_count: 1 },
    { require_code_owner_reviews: true },
    { require_last_push_approval: true }
  ])("rejects an approval requirement that blocks the solo-maintainer policy: %j", (override) => {
    expect(validateReleaseBranchProtection({ ...protectedBranch,
      required_pull_request_reviews: { ...protectedBranch.required_pull_request_reviews, ...override }
    })).toContain("the solo-maintainer policy must require zero outside approvals");
  });

  it("requires CodeQL coverage of both application and workflow code", () => {
    expect(validateReleaseCodeScanning({ state: "configured", languages: ["javascript-typescript", "actions"] })).toEqual([]);
    expect(validateReleaseCodeScanning({ state: "configured", languages: ["javascript-typescript"] })).toEqual(["CodeQL must analyze actions"]);
    expect(validateReleaseCodeScanning({ state: "configured", languages: ["python"] })).toHaveLength(2);
    expect(validateReleaseCodeScanning({ state: "not-configured" })).not.toEqual([]);
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
