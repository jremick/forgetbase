export function validateReleaseBranchProtection(value: unknown): string[] {
  if (!isRecord(value)) return ["main branch protection could not be read"];
  const issues: string[] = [];
  const statusChecks = isRecord(value.required_status_checks) ? value.required_status_checks : {};
  const checks = Array.isArray(statusChecks.checks) ? statusChecks.checks : [];
  // GitHub.com's GitHub Actions app ID, verified from this repository's Verify check run.
  if (!checks.some((check) => isRecord(check) && check.context === "Verify" && check.app_id === 15368)) {
    issues.push("main must require the CI Verify check from the GitHub Actions app");
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

export function validateReleaseCodeScanning(value: unknown): string[] {
  if (!isRecord(value) || value.state !== "configured") return ["CodeQL default setup must be configured"];
  const languages = Array.isArray(value.languages) ? value.languages : [];
  return ["javascript-typescript", "actions"].filter((language) => !languages.includes(language))
    .map((language) => `CodeQL must analyze ${language}`);
}

/** GitHub returns runs newest first. A failed rerun must not fall back to an older success. */
export function findReleaseCiRun(value: unknown, commitSha: string): Record<string, unknown> | undefined {
  if (!Array.isArray(value) || !/^[a-f0-9]{40}$/.test(commitSha)) return undefined;
  const latest = value.find((run) => isRecord(run) && run.headSha === commitSha);
  return isRecord(latest) && latest.status === "completed" && latest.conclusion === "success"
    ? latest
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
