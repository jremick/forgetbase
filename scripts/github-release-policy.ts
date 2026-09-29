// Portable CI reports these commit statuses through the maintainer's authenticated controller.
export const releaseStatusContexts = [
  "local-ci/verify",
  "local-ci/codeql-javascript-typescript",
  "local-ci/codeql-actions",
  "local-ci/codeql-swift"
] as const;
export const releaseStatusCreator = "jremick";
// CodeQL categories uploaded for each analyzed language, matching the former default setup plus Swift.
export const releaseCodeScanningCategories = ["/language:javascript-typescript", "/language:actions", "/language:swift"] as const;

export type ReleaseStatusSummary = {
  context: string;
  state: string;
  sha: string;
  id: number | null;
  creator: string | null;
  createdAt: string;
  targetUrl: string | null;
  description: string | null;
};

export type ReleaseAnalysisSummary = {
  category: string;
  id: number | null;
  commitSha: string;
  ref: string;
  createdAt: string;
  tool: string;
  toolVersion: string | null;
  resultsCount: number | null;
  error: string | null;
};

export type ReleaseStatusEvaluation = {
  ok: boolean;
  issues: string[];
  contexts: Array<{ context: string; status: ReleaseStatusSummary | null; issues: string[] }>;
};

export type ReleaseCodeScanningEvaluation = {
  ok: boolean;
  issues: string[];
  categories: Array<{ category: string; analysis: ReleaseAnalysisSummary | null; issues: string[] }>;
};

export function validateReleaseBranchProtection(value: unknown): string[] {
  if (!isRecord(value)) return ["main branch protection could not be read"];
  const issues: string[] = [];
  const statusChecks = isRecord(value.required_status_checks) ? value.required_status_checks : {};
  const checks = Array.isArray(statusChecks.checks) ? statusChecks.checks.filter(isRecord) : [];
  for (const context of releaseStatusContexts) {
    const check = checks.find((entry) => entry.context === context);
    // Commit statuses are not created by an app. null or -1 accepts them; creator identity is checked per release.
    if (!check) issues.push(`main must require the ${context} commit status`);
    else if (check.app_id !== null && check.app_id !== -1) issues.push(`main must accept the ${context} commit status from any source (app_id null or -1)`);
  }
  if (statusChecks.strict !== true) issues.push("main must require branches to be up to date");
  const reviews = value.required_pull_request_reviews;
  if (!isRecord(reviews)) {
    issues.push("main must require pull requests");
  } else if (reviews.required_approving_review_count !== 0 || reviews.require_code_owner_reviews !== false || reviews.require_last_push_approval !== false) {
    issues.push("the solo-maintainer policy must require zero outside approvals");
  }
  for (const setting of ["enforce_admins", "required_conversation_resolution"]) {
    if (!isRecord(value[setting]) || value[setting].enabled !== true) issues.push(`${setting} must be enabled`);
  }
  for (const setting of ["allow_force_pushes", "allow_deletions"]) {
    if (!isRecord(value[setting]) || value[setting].enabled !== false) issues.push(`${setting} must be disabled`);
  }
  return issues;
}

/**
 * The newest status of each required context decides. A newer failure, pending state or status from
 * another account is never hidden by an older maintainer success.
 */
export function evaluateReleaseStatuses(value: unknown, commitSha: string): ReleaseStatusEvaluation {
  if (!shaPattern.test(commitSha)) return { ok: false, issues: ["the release reference must be a full commit SHA"], contexts: [] };
  if (!Array.isArray(value)) return { ok: false, issues: ["commit statuses could not be read"], contexts: [] };
  const contexts: ReleaseStatusEvaluation["contexts"] = [];
  for (const context of releaseStatusContexts) {
    const candidates = value.filter(isRecord).filter((entry) => entry.context === context);
    const latest = newest(candidates);
    const issues: string[] = [];
    if (candidates.length === 0) issues.push(`${context} has no status for ${commitSha}`);
    else if (candidates.some((entry) => statusSha(entry) !== commitSha)) issues.push(`${context} includes a status for another commit`);
    else if (!latest) issues.push(`${context} has a status without a readable creation time`);
    const status = latest && issues.length === 0 ? summarizeStatus(latest, commitSha) : null;
    if (status && status.state !== "success") issues.push(`${context} latest status is ${status.state}`);
    if (status && status.creator !== releaseStatusCreator) {
      issues.push(`${context} latest status was created by ${status.creator ?? "an unknown account"}, not ${releaseStatusCreator}`);
    }
    contexts.push({ context, status, issues });
  }
  const issues = contexts.flatMap((entry) => entry.issues);
  return { ok: issues.length === 0, issues, contexts };
}

/**
 * Requires a successful CodeQL analysis of every language category for the exact release commit on
 * the default branch. The newest matching analysis decides.
 */
export function evaluateReleaseCodeScanning(value: unknown, commitSha: string, defaultBranch: string): ReleaseCodeScanningEvaluation {
  if (!shaPattern.test(commitSha)) return { ok: false, issues: ["the release reference must be a full commit SHA"], categories: [] };
  if (!Array.isArray(value)) return { ok: false, issues: ["CodeQL analyses could not be read"], categories: [] };
  const categories: ReleaseCodeScanningEvaluation["categories"] = [];
  for (const category of releaseCodeScanningCategories) {
    const candidates = value.filter(isRecord).filter((entry) =>
      normalizeCategory(entry.category) === category &&
      entry.commit_sha === commitSha &&
      entry.ref === `refs/heads/${defaultBranch}` &&
      isRecord(entry.tool) && entry.tool.name === "CodeQL");
    const latest = newest(candidates);
    const issues: string[] = [];
    if (candidates.length === 0) issues.push(`no CodeQL analysis of ${category} for ${commitSha} on ${defaultBranch}`);
    else if (!latest) issues.push(`${category} has an analysis without a readable creation time`);
    const analysis = latest && issues.length === 0 ? summarizeAnalysis(latest, category) : null;
    if (analysis && analysis.error !== "") issues.push(`${category} latest CodeQL analysis failed: ${analysis.error ?? "unknown error"}`);
    categories.push({ category, analysis, issues });
  }
  const issues = categories.flatMap((entry) => entry.issues);
  return { ok: issues.length === 0, issues, categories };
}

const shaPattern = /^[a-f0-9]{40}$/;

function newest(entries: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const times = entries.map((entry) => typeof entry.created_at === "string" ? Date.parse(entry.created_at) : Number.NaN);
  if (entries.length === 0 || times.some(Number.isNaN)) return undefined;
  return entries
    .map((entry, index) => ({ entry, time: times[index]!, id: typeof entry.id === "number" ? entry.id : -1 }))
    .sort((left, right) => right.time - left.time || right.id - left.id)[0]?.entry;
}

function statusSha(entry: Record<string, unknown>): string | undefined {
  return typeof entry.url === "string" ? /\/statuses\/([a-f0-9]{40})$/.exec(entry.url)?.[1] : undefined;
}

function summarizeStatus(entry: Record<string, unknown>, sha: string): ReleaseStatusSummary {
  return {
    context: String(entry.context),
    state: String(entry.state),
    sha,
    id: typeof entry.id === "number" ? entry.id : null,
    creator: isRecord(entry.creator) && typeof entry.creator.login === "string" ? entry.creator.login : null,
    createdAt: String(entry.created_at),
    targetUrl: typeof entry.target_url === "string" && entry.target_url ? entry.target_url : null,
    description: typeof entry.description === "string" ? entry.description : null
  };
}

function summarizeAnalysis(entry: Record<string, unknown>, category: string): ReleaseAnalysisSummary {
  const tool = isRecord(entry.tool) ? entry.tool : {};
  return {
    category,
    id: typeof entry.id === "number" ? entry.id : null,
    commitSha: String(entry.commit_sha),
    ref: String(entry.ref),
    createdAt: String(entry.created_at),
    tool: String(tool.name),
    toolVersion: typeof tool.version === "string" ? tool.version : null,
    resultsCount: typeof entry.results_count === "number" ? entry.results_count : null,
    error: typeof entry.error === "string" ? entry.error : null
  };
}

function normalizeCategory(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/\/$/, "") : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
