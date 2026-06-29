import { spawnSync } from "node:child_process";

type GhResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
};

type Finding = {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
};

const repo = process.env.PUBLIC_BETA_REPO ?? "jremick/forgetbase";
const expectedDescription = "Self-hosted knowledge base for people and AI tools";
const expectedTopics = ["forgetbase", "knowledge-base", "ai-tools", "self-hosted", "docker-compose"];
const findings: Finding[] = [];

const repoView = gh([
  "repo",
  "view",
  repo,
  "--json",
  [
    "nameWithOwner",
    "visibility",
    "defaultBranchRef",
    "description",
    "homepageUrl",
    "repositoryTopics",
    "licenseInfo",
    "latestRelease",
    "hasIssuesEnabled",
    "hasWikiEnabled",
    "hasDiscussionsEnabled",
    "usesCustomOpenGraphImage",
    "isPrivate",
    "isSecurityPolicyEnabled"
  ].join(",")
]);

if (!repoView.ok) {
  fail(`Unable to read GitHub repository metadata for ${repo}: ${repoView.stderr || repoView.stdout}`);
}

const metadata = parseJson<Record<string, unknown>>(repoView.stdout, "repo metadata");
const defaultBranch = readNestedString(metadata, ["defaultBranchRef", "name"]);
const license = readNestedString(metadata, ["licenseInfo", "key"]);
const topics = readTopics(metadata.repositoryTopics);

record(metadata.nameWithOwner === repo, "repo identity", `expected ${repo}, got ${String(metadata.nameWithOwner)}`);
record(metadata.visibility === "PUBLIC" && metadata.isPrivate === false, "repo visibility", `visibility=${String(metadata.visibility)}`);
record(defaultBranch === "main", "default branch", `defaultBranch=${defaultBranch || "unknown"}`);
record(metadata.description === expectedDescription, "repo description", `description=${String(metadata.description)}`);
record(license === "apache-2.0", "repo license", `license=${license || "unknown"}`);
record(metadata.hasIssuesEnabled === true, "issues enabled", `hasIssuesEnabled=${String(metadata.hasIssuesEnabled)}`);
record(metadata.hasWikiEnabled === false, "wiki disabled", `hasWikiEnabled=${String(metadata.hasWikiEnabled)}`);
record(metadata.hasDiscussionsEnabled === false, "discussions disabled", `hasDiscussionsEnabled=${String(metadata.hasDiscussionsEnabled)}`);
record(metadata.isSecurityPolicyEnabled === true, "security policy enabled", `isSecurityPolicyEnabled=${String(metadata.isSecurityPolicyEnabled)}`);

for (const topic of expectedTopics) {
  record(topics.includes(topic), `topic ${topic}`, `topics=${topics.join(",") || "none"}`);
}

record(
  metadata.usesCustomOpenGraphImage === true,
  "custom social preview",
  `usesCustomOpenGraphImage=${String(metadata.usesCustomOpenGraphImage)}`,
  "warn"
);

const privateVulnerability = gh(["api", `repos/${repo}/private-vulnerability-reporting`]);
if (privateVulnerability.ok) {
  const payload = parseJson<Record<string, unknown>>(privateVulnerability.stdout, "private vulnerability reporting");
  record(payload.enabled === true, "private vulnerability reporting", `enabled=${String(payload.enabled)}`);
} else {
  record(false, "private vulnerability reporting", summarizeGhFailure(privateVulnerability));
}

const rulesets = gh(["api", `repos/${repo}/rulesets`]);
const branchProtection = defaultBranch
  ? gh(["api", `repos/${repo}/branches/${defaultBranch}/protection`])
  : { ok: false, status: null, stdout: "", stderr: "default branch unavailable" };

const rulesetCount = rulesets.ok ? readArray(parseJson<unknown>(rulesets.stdout, "rulesets")).length : 0;
const hasBranchProtection = branchProtection.ok;
record(
  rulesetCount > 0 || hasBranchProtection,
  "default branch protection or rulesets",
  rulesets.ok
    ? `rulesets=${rulesetCount}; branchProtection=${hasBranchProtection ? "available" : "unavailable"}`
    : `rulesets unavailable: ${summarizeGhFailure(rulesets)}; branchProtection=${hasBranchProtection ? "available" : summarizeGhFailure(branchProtection)}`
);

const recentRuns = gh([
  "run",
  "list",
  "--repo",
  repo,
  "--branch",
  defaultBranch || "main",
  "--workflow",
  "CI",
  "--limit",
  "10",
  "--json",
  "databaseId,status,conclusion,headBranch,workflowName,url,createdAt"
]);

if (recentRuns.ok) {
  const runs = readArray(parseJson<unknown>(recentRuns.stdout, "recent CI runs"));
  const successfulCi = runs.find((run) =>
    isRecord(run) &&
    run.workflowName === "CI" &&
    run.status === "completed" &&
    run.conclusion === "success"
  );
  record(Boolean(successfulCi), "recent default-branch CI", successfulCi ? `success=${String((successfulCi as Record<string, unknown>).url)}` : "no successful CI run found");
} else {
  record(false, "recent default-branch CI", summarizeGhFailure(recentRuns));
}

const failures = findings.filter((finding) => finding.status === "fail");
console.log(JSON.stringify({
  ok: failures.length === 0,
  repo,
  checkedAt: new Date().toISOString(),
  findings
}, null, 2));

if (failures.length > 0) {
  process.exit(1);
}

function gh(args: string[]): GhResult {
  const result = spawnSync("gh", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim()
  };
}

function record(condition: boolean, name: string, detail: string, failMode: "fail" | "warn" = "fail"): void {
  findings.push({
    name,
    status: condition ? "pass" : failMode,
    detail
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseJson<T>(source: string, label: string): T {
  try {
    return JSON.parse(source) as T;
  } catch (error) {
    fail(`Unable to parse ${label} JSON: ${(error as Error).message}`);
  }
}

function readNestedString(source: Record<string, unknown>, path: string[]): string {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current)) {
      return "";
    }
    current = current[key];
  }

  return typeof current === "string" ? current : "";
}

function readTopics(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => isRecord(entry) && typeof entry.name === "string" ? entry.name : "")
    .filter(Boolean)
    .sort();
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function summarizeGhFailure(result: GhResult): string {
  return [result.stderr, result.stdout].filter(Boolean).join(" ").slice(0, 500) || `exit ${String(result.status)}`;
}
