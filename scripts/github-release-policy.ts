export function validateReleaseBranchProtection(value: unknown): string[] {
  if (!isRecord(value)) return ["main branch protection could not be read"];
  const issues: string[] = [];
  const statusChecks = isRecord(value.required_status_checks) ? value.required_status_checks : {};
  const contexts = [
    ...(Array.isArray(statusChecks.contexts) ? statusChecks.contexts : []),
    ...(Array.isArray(statusChecks.checks) ? statusChecks.checks.map((check) => isRecord(check) ? check.context : undefined) : [])
  ];
  if (!contexts.includes("Verify")) issues.push("main must require the CI Verify check");
  if (statusChecks.strict !== true) issues.push("main must require branches to be up to date");
  if (!isRecord(value.required_pull_request_reviews)) issues.push("main must require pull requests");
  for (const setting of ["enforce_admins", "required_conversation_resolution"]) {
    if (!isRecord(value[setting]) || value[setting].enabled !== true) issues.push(`${setting} must be enabled`);
  }
  for (const setting of ["allow_force_pushes", "allow_deletions"]) {
    if (!isRecord(value[setting]) || value[setting].enabled !== false) issues.push(`${setting} must be disabled`);
  }
  return issues;
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
