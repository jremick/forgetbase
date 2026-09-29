import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateReleaseCodeScanning, evaluateReleaseStatuses, validateReleaseBranchProtection } from "./github-release-policy.js";

// Failure cases: a newer failed, pending or foreign status hides behind an older success; response
// order outranks creation time; a status for another commit, context or creator counts; a required
// context or CodeQL language (including Swift) is missing; a stale, failed, non-CodeQL, wrong-category
// or pull-request analysis counts; protection still binds checks to the Actions app; the release
// scripts call Actions APIs or invent a CI URL.

const commit = "a".repeat(40);
// The required commit status contexts and CodeQL categories shared with the portable CI reporter.
const contexts = ["local-ci/verify", "local-ci/codeql-javascript-typescript", "local-ci/codeql-actions", "local-ci/codeql-swift"];
const categories = ["/language:javascript-typescript", "/language:actions", "/language:swift"];
const earlier = "2026-09-29T01:00:00Z";
const later = "2026-09-29T02:00:00Z";
const protectedBranch = {
  required_status_checks: { strict: true, checks: contexts.map((context) => ({ context, app_id: null })) },
  required_pull_request_reviews: { required_approving_review_count: 0, require_code_owner_reviews: false, require_last_push_approval: false },
  enforce_admins: { enabled: true },
  required_conversation_resolution: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false }
};

function status(context: string, overrides: Record<string, unknown> = {}, sha = commit) {
  return {
    id: 100 + contexts.indexOf(context),
    url: `https://api.github.com/repos/jremick/forgetbase/statuses/${sha}`,
    state: "success",
    context,
    description: "Portable CI passed",
    target_url: `https://ci.invalid/runs/${context.replace("/", "-")}`,
    created_at: earlier,
    updated_at: earlier,
    creator: { login: "jremick" },
    ...overrides
  };
}

function analysis(category: string, overrides: Record<string, unknown> = {}, sha = commit) {
  return {
    id: 10 + categories.indexOf(category),
    ref: "refs/heads/main",
    commit_sha: sha,
    category,
    error: "",
    warning: "",
    created_at: earlier,
    results_count: 0,
    rules_count: 50,
    tool: { name: "CodeQL", version: "2.27.1" },
    ...overrides
  };
}

const passingStatuses = (sha = commit) => contexts.map((context) => status(context, {}, sha));
const passingAnalyses = (sha = commit) => categories.map((category) => analysis(category, {}, sha));

describe("release commit statuses", () => {
  it("accepts the latest maintainer success of every required context for the exact commit", () => {
    const result = evaluateReleaseStatuses(passingStatuses(), commit);

    expect(result.issues).toEqual([]);
    expect(result.contexts.map((entry) => entry.status?.context)).toEqual(contexts);
    expect(result.contexts[0]?.status).toMatchObject({
      sha: commit, state: "success", creator: "jremick", targetUrl: "https://ci.invalid/runs/local-ci-verify"
    });
  });

  it.each(["failure", "error", "pending"])("does not fall back to an older success after a newer %s status", (state) => {
    const statuses = [...passingStatuses(), status("local-ci/verify", { id: 900, state, created_at: later })];

    expect(evaluateReleaseStatuses(statuses, commit).issues).toEqual([expect.stringContaining("local-ci/verify")]);
  });

  it("does not let a newer success from another account shadow the maintainer's status", () => {
    const statuses = [...passingStatuses(), status("local-ci/verify", { id: 900, created_at: later, creator: { login: "someone-else" } })];

    expect(evaluateReleaseStatuses(statuses, commit).issues).toEqual([expect.stringContaining("local-ci/verify")]);
  });

  it("orders statuses by creation time, then ID, rather than response order", () => {
    const others = passingStatuses().filter((entry) => entry.context !== "local-ci/verify");
    const verify = (id: number, state: string, created_at: string) => status("local-ci/verify", { id, state, created_at });

    expect(evaluateReleaseStatuses([...others, verify(1, "success", earlier), verify(3, "failure", later), verify(2, "success", earlier)], commit).issues)
      .toEqual([expect.stringContaining("local-ci/verify")]);
    expect(evaluateReleaseStatuses([...others, verify(1, "failure", earlier), verify(3, "success", later), verify(2, "failure", earlier)], commit).issues)
      .toEqual([]);
    expect(evaluateReleaseStatuses([...others, verify(4, "success", earlier), verify(5, "failure", earlier)], commit).issues)
      .toEqual([expect.stringContaining("local-ci/verify")]);
  });

  it.each(contexts)("requires a %s status", (context) => {
    const statuses = passingStatuses().filter((entry) => entry.context !== context);

    expect(evaluateReleaseStatuses(statuses, commit).issues).toEqual([expect.stringContaining(context)]);
  });

  it.each([
    ["another creator", { creator: { login: "someone-else" } }],
    ["no creator", { creator: null }],
    ["another commit", { url: `https://api.github.com/repos/jremick/forgetbase/statuses/${"b".repeat(40)}` }],
    ["an unreadable creation time", { created_at: "yesterday" }]
  ])("rejects a latest status with %s", (_name, overrides) => {
    const statuses = passingStatuses().map((entry) => entry.context === "local-ci/codeql-swift" ? { ...entry, ...overrides } : entry);

    expect(evaluateReleaseStatuses(statuses, commit).issues).toEqual([expect.stringContaining("local-ci/codeql-swift")]);
  });

  it("does not accept the legacy Actions Verify context or let unrelated contexts interfere", () => {
    expect(evaluateReleaseStatuses([status("Verify")], commit).issues).toHaveLength(contexts.length);
    expect(evaluateReleaseStatuses([...passingStatuses(), status("Verify", { state: "failure", created_at: later })], commit).issues).toEqual([]);
  });

  it("rejects unreadable statuses and a release reference that is not a commit SHA", () => {
    expect(evaluateReleaseStatuses(null, commit).issues).not.toEqual([]);
    expect(evaluateReleaseStatuses(passingStatuses(), "main").issues).not.toEqual([]);
  });
});

describe("release CodeQL analyses", () => {
  it("accepts successful CodeQL analyses of every language category for the exact commit on main", () => {
    const result = evaluateReleaseCodeScanning(passingAnalyses(), commit, "main");

    expect(result.issues).toEqual([]);
    expect(result.categories.map((entry) => entry.analysis?.category)).toEqual(categories);
  });

  it("treats the SARIF category's trailing slash as the same category", () => {
    const analyses = passingAnalyses().map((entry) => ({ ...entry, category: `${entry.category}/` }));

    expect(evaluateReleaseCodeScanning(analyses, commit, "main").issues).toEqual([]);
  });

  it("rejects zero analyses for every category, including native Swift", () => {
    const issues = evaluateReleaseCodeScanning([], commit, "main").issues;

    expect(issues).toEqual(categories.map((category) => expect.stringContaining(category)));
  });

  it.each([
    ["a stale commit", { commit_sha: "b".repeat(40) }],
    ["another category", { category: "/language:python" }],
    ["another tool", { tool: { name: "OtherScanner", version: "1.0.0" } }],
    ["a pull request ref", { ref: "refs/pull/7/merge" }]
  ])("does not accept an analysis with %s", (_name, overrides) => {
    const analyses = passingAnalyses().map((entry) => entry.category === "/language:swift" ? { ...entry, ...overrides } : entry);

    expect(evaluateReleaseCodeScanning(analyses, commit, "main").issues).toEqual([expect.stringContaining("/language:swift")]);
  });

  it("does not fall back to an older success when the newest analysis failed", () => {
    const failed = analysis("/language:javascript-typescript", { id: 99, created_at: later, error: "extraction failed" });

    expect(evaluateReleaseCodeScanning([...passingAnalyses(), failed], commit, "main").issues)
      .toEqual([expect.stringContaining("/language:javascript-typescript")]);
  });

  it("rejects unreadable analyses", () => {
    expect(evaluateReleaseCodeScanning({ message: "Not Found" }, commit, "main").issues).not.toEqual([]);
  });
});

describe("release branch protection", () => {
  it("accepts the solo-maintainer PR policy with the portable CI statuses from any source", () => {
    expect(validateReleaseBranchProtection(protectedBranch)).toEqual([]);
    expect(validateReleaseBranchProtection({
      ...protectedBranch, required_status_checks: { strict: true, checks: contexts.map((context) => ({ context, app_id: -1 })) }
    })).toEqual([]);
  });

  it.each(contexts)("requires the %s status", (context) => {
    expect(validateReleaseBranchProtection({
      ...protectedBranch,
      required_status_checks: { strict: true, checks: protectedBranch.required_status_checks.checks.filter((check) => check.context !== context) }
    })).toEqual([expect.stringContaining(context)]);
  });

  it.each([15368, 12345, undefined])("rejects a required status bound to app %s", (appId) => {
    const checks = protectedBranch.required_status_checks.checks.map((check) =>
      check.context === "local-ci/verify" ? { context: check.context, app_id: appId } : check);

    expect(validateReleaseBranchProtection({ ...protectedBranch, required_status_checks: { strict: true, checks } }))
      .toEqual([expect.stringContaining("local-ci/verify")]);
  });

  it("rejects the previous Actions-only Verify requirement", () => {
    expect(validateReleaseBranchProtection({
      ...protectedBranch, required_status_checks: { strict: true, checks: [{ context: "Verify", app_id: 15368 }] }
    })).toHaveLength(contexts.length);
  });

  it("rejects an unreadable policy or an unrelated ruleset inventory", () => {
    expect(validateReleaseBranchProtection(null)).not.toEqual([]);
    expect(validateReleaseBranchProtection([{ name: "protect some other branch" }])).not.toEqual([]);
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

  it.each([
    ["enforce_admins", { enabled: false }],
    ["required_conversation_resolution", { enabled: false }],
    ["allow_force_pushes", { enabled: true }],
    ["allow_deletions", { enabled: true }],
    ["required_pull_request_reviews", null],
    ["required_status_checks", { ...protectedBranch.required_status_checks, strict: false }]
  ])("rejects unsafe %s settings", (setting, value) => {
    expect(validateReleaseBranchProtection({ ...protectedBranch, [setting]: value })).not.toEqual([]);
  });
});

// The release scripts against a recorded GitHub API, without Actions or network access.
describe("release scripts", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  function github(overrides: { statuses?: unknown[] | null; analyses?: unknown[] } = {}) {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "forgetbase-release-policy-")));
    folders.push(base);
    mkdirSync(join(base, "bin"));
    writeFileSync(join(base, "github.json"), JSON.stringify({
      repoView: {
        nameWithOwner: "jremick/forgetbase", visibility: "PUBLIC", isPrivate: false, defaultBranchRef: { name: "main" },
        description: "Self-hosted knowledge base for people and AI tools",
        repositoryTopics: ["forgetbase", "knowledge-base", "ai-tools", "self-hosted", "docker-compose"].map((name) => ({ name })),
        licenseInfo: { key: "apache-2.0", spdxId: "Apache-2.0" }, hasIssuesEnabled: true, hasWikiEnabled: false,
        hasDiscussionsEnabled: false, usesCustomOpenGraphImage: true, isSecurityPolicyEnabled: true
      },
      api: {
        "repos/jremick/forgetbase": {
          security_and_analysis: { secret_scanning: { status: "enabled" }, secret_scanning_push_protection: { status: "enabled" } }
        },
        "repos/jremick/forgetbase/commits/main": { sha: head },
        "repos/jremick/forgetbase/private-vulnerability-reporting": { enabled: true },
        "repos/jremick/forgetbase/branches/main/protection": protectedBranch,
        ...(overrides.statuses === null ? {} : { [`repos/jremick/forgetbase/commits/${head}/statuses`]: overrides.statuses ?? passingStatuses(head) }),
        "repos/jremick/forgetbase/code-scanning/analyses": overrides.analyses ?? [
          ...passingAnalyses(head), analysis("/language:swift", { ref: "refs/pull/3/merge", id: 50 }, "c".repeat(40))
        ]
      }
    }));
    writeFileSync(join(base, "bin/gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const state = ${JSON.stringify(base)};
const args = process.argv.slice(2);
fs.appendFileSync(state + "/calls.log", JSON.stringify(args) + "\\n");
const fixture = JSON.parse(fs.readFileSync(state + "/github.json", "utf8"));
if (args[0] === "repo" && args[1] === "view") { process.stdout.write(JSON.stringify(fixture.repoView)); process.exit(0); }
if (args[0] === "api") {
  const endpoint = (args.find((arg) => arg.startsWith("repos/")) || "").split("?")[0];
  const body = fixture.api[endpoint];
  if (body === undefined) { process.stderr.write("gh: Not Found (HTTP 404) " + endpoint); process.exit(1); }
  if (args.includes("--jq")) {
    if (args[args.indexOf("--jq") + 1] !== ".[]" || !args.includes("--paginate")) process.exit(2);
    for (const item of body) process.stdout.write(JSON.stringify(item) + "\\n");
  } else process.stdout.write(JSON.stringify(body));
  process.exit(0);
}
process.stderr.write("unsupported gh " + args.join(" "));
process.exit(1);
`);
    chmodSync(join(base, "bin/gh"), 0o755);
    const env = { PATH: `${join(base, "bin")}:${join(root, "node_modules/.bin")}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: base };
    const calls = () => readFileSync(join(base, "calls.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
    return { base, env, calls };
  }

  function checkGithub(fixture: ReturnType<typeof github>) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-public-beta-github.ts"], {
      cwd: root, encoding: "utf8", env: fixture.env, timeout: 60_000
    });
    return { status: result.status, payload: JSON.parse(result.stdout) as Record<string, any> };
  }

  it("github:public-beta:check passes on portable CI statuses and CodeQL analyses without Actions APIs", () => {
    const fixture = github();
    const { status: exitCode, payload } = checkGithub(fixture);

    expect(exitCode, JSON.stringify(payload.findings)).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.releaseStatuses.contexts.map((entry: any) => entry.status.sha)).toEqual(contexts.map(() => head));
    expect(payload.codeScanning.categories.map((entry: any) => entry.analysis.commitSha)).toEqual(categories.map(() => head));
    expect(payload.releaseStatuses.evidenceUrl).toBe(`https://api.github.com/repos/jremick/forgetbase/commits/${head}/statuses`);
    expect(fixture.calls().filter((args) => args[0] === "run" || args.some((arg) => /actions|default-setup/.test(arg)))).toEqual([]);
  }, 60_000);

  it("github:public-beta:check fails when a newer verify status failed", () => {
    const statuses = [...passingStatuses(head), status("local-ci/verify", { id: 900, state: "failure", created_at: later }, head)];
    const { status: exitCode, payload } = checkGithub(github({ statuses }));

    expect(exitCode).toBe(1);
    expect(payload.findings.filter((finding: any) => finding.status === "fail").map((finding: any) => finding.name))
      .toEqual(["commit status local-ci/verify"]);
  }, 60_000);

  const readbackUrl = (repo: string, sha: string) => `https://api.github.com/repos/${repo}/commits/${sha}/statuses`;
  const withoutVerifyTarget = () => passingStatuses(head).map((entry) => entry.context === "local-ci/verify" ? { ...entry, target_url: null } : entry);

  // Collects a manifest, optionally edits it, and returns the release-proof validator's CI findings.
  // The fixture has no UAT or gate evidence, so only CI findings are meaningful here.
  function collect(fixture: ReturnType<typeof github>, edit?: (manifest: any) => void) {
    const output = join(fixture.base, "proof/public-beta-release-proof.json");
    const collected = spawnSync(process.execPath, ["--import", "tsx", "scripts/collect-public-beta-release-proof.ts", "--output", output], {
      cwd: root, encoding: "utf8", env: fixture.env, timeout: 90_000
    });
    expect(collected.status, collected.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    if (edit) {
      edit(manifest);
      writeFileSync(output, JSON.stringify(manifest));
    }
    const validation = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-public-beta-release-proof.ts", output], {
      cwd: root, encoding: "utf8", env: fixture.env, timeout: 60_000
    });
    const ciIssues = validation.stderr.split("\n").filter((line) => /^- (release\.ci|checks\.ci-default-branch)/.test(line));
    return { manifest, ciIssues };
  }

  it.each([
    ["the verified verify status target", "https://ci.invalid/runs/local-ci-verify", "status-target", "https://ci.invalid/runs/local-ci-verify"],
    ["the exact-commit statuses readback when no target is set", null, "status-api-readback", readbackUrl("jremick/forgetbase", head)]
  ])("release-proof:collect cites %s and passes the proof CI contract", (_name, targetUrl, kind, expectedUrl) => {
    const statuses = passingStatuses(head).map((entry) => entry.context === "local-ci/verify" ? { ...entry, target_url: targetUrl } : entry);
    const fixture = github({ statuses });
    const { manifest, ciIssues } = collect(fixture);

    expect(manifest.release).toMatchObject({
      commitSha: head, ciHeadSha: head, ciStatus: "passed", ciProvider: "github-commit-status", ciRunUrl: expectedUrl, ciRunUrlKind: kind
    });
    const ci = manifest.checks.find((check: any) => check.name === "ci-default-branch");
    expect(ci.status).toBe("pass");
    const recorded = JSON.parse(ci.evidence.find((evidence: any) => evidence.kind === "text").value);
    expect(recorded.statuses.map((entry: any) => [entry.context, entry.sha, entry.creator])).toEqual(contexts.map((context) => [context, head, "jremick"]));
    expect(ci.evidence.filter((evidence: any) => evidence.kind === "url").map((evidence: any) => evidence.value)).toEqual([expectedUrl]);
    expect(JSON.stringify(manifest)).not.toContain("actions/runs");
    expect(fixture.calls().filter((args) => args[0] === "run")).toEqual([]);
    expect(ciIssues).toEqual([]);
  }, 90_000);

  it.each([
    ["an unreadable statuses readback", null],
    ["a newer pending verify status", [...withoutVerifyTarget(), status("local-ci/verify", { id: 900, state: "pending", created_at: later, target_url: null }, head)]],
    ["a newer failed verify status", [...withoutVerifyTarget(), status("local-ci/verify", { id: 900, state: "failure", created_at: later, target_url: null }, head)]],
    ["a status from an untrusted account", withoutVerifyTarget().map((entry) => entry.context === "local-ci/codeql-swift" ? { ...entry, creator: { login: "someone-else" } } : entry)]
  ])("release-proof:collect cannot pass the proof CI contract with %s", (_name, statuses) => {
    const { manifest, ciIssues } = collect(github({ statuses }));

    expect(manifest.release.ciStatus).toBe("unknown");
    if (statuses === null) expect(manifest.release.ciRunUrl).toMatch(/^<.+>$/);
    expect(ciIssues).not.toEqual([]);
  }, 90_000);

  it.each([
    ["a readback of another commit", "release.ciRunUrl", (manifest: any) => { manifest.release.ciRunUrl = readbackUrl("jremick/forgetbase", "b".repeat(40)); }],
    ["a readback of another repository", "release.ciRunUrl", (manifest: any) => { manifest.release.ciRunUrl = readbackUrl("someone/forgetbase", head); }],
    ["an unrecognized URL kind", "release.ciRunUrlKind", (manifest: any) => { manifest.release.ciRunUrlKind = "job-log"; }],
    ["a pending status under a passed claim", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => { recorded.statuses[0].state = "pending"; })],
    ["a status for another commit", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => { recorded.statuses[1].sha = "b".repeat(40); })],
    ["a missing required status", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => { recorded.statuses.pop(); })],
    ["a status from an untrusted account", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => { recorded.statuses[2].creator = "someone-else"; })],
    // The collector records exactly one selected status per context; an extra entry must not let an older success pass.
    ...(["failure", "pending"] as const).map((state): [string, string, (manifest: any) => void] => [
      `a newer ${state} status beside an older success`, "checks.ci-default-branch",
      (manifest: any) => editStatuses(manifest, (recorded) => {
        recorded.statuses.push({ ...recorded.statuses[0], id: 900, state, createdAt: later });
      })
    ]),
    ["a newer status from another account beside an older success", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => {
      recorded.statuses.push({ ...recorded.statuses[0], id: 900, creator: "someone-else", createdAt: later });
    })],
    ["a duplicate success for one context", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => {
      recorded.statuses.push({ ...recorded.statuses[0], id: 900, createdAt: later });
    })],
    ["a status without an ID", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => { delete recorded.statuses[1].id; })],
    ["a status without a readable time", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => { recorded.statuses[1].createdAt = "yesterday"; })],
    ["an unexpected status context", "checks.ci-default-branch", (manifest: any) => editStatuses(manifest, (recorded) => {
      recorded.statuses.push({ ...recorded.statuses[0], id: 900, context: "Verify" });
    })]
  ])("release-proof:check rejects a commit-status manifest with %s", (_name, field, edit) => {
    expect(collect(github({ statuses: withoutVerifyTarget() }), edit).ciIssues).toEqual([expect.stringContaining(`- ${field}`)]);
  }, 90_000);

  it("release-proof:check still accepts historical Actions CI fields", () => {
    const { ciIssues } = collect(github(), (manifest: any) => {
      delete manifest.release.ciProvider;
      delete manifest.release.ciRunUrlKind;
      manifest.release.ciRunUrl = "https://github.com/jremick/forgetbase/actions/runs/1";
      manifest.checks.find((check: any) => check.name === "ci-default-branch").evidence = [{ kind: "url", value: manifest.release.ciRunUrl }];
    });

    expect(ciIssues).toEqual([]);
  }, 90_000);
});

function editStatuses(manifest: any, edit: (recorded: any) => void): void {
  const evidence = manifest.checks.find((check: any) => check.name === "ci-default-branch").evidence.find((entry: any) => entry.kind === "text");
  const recorded = JSON.parse(evidence.value);
  edit(recorded);
  evidence.value = JSON.stringify(recorded);
}
