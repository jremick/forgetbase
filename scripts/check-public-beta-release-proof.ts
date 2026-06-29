import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

type EvidenceRef = {
  kind: "file" | "text" | "url";
  value: string;
  note?: string;
};

type ReleaseProofManifest = {
  schemaVersion: string;
  stage: string;
  release: {
    commitSha: string;
    ciRunUrl: string;
    ciHeadSha: string;
    ciStatus: string;
    generatedAt: string;
    liveDemoUrl: string;
    tag?: string;
  };
  compatibility: Record<string, unknown>;
  checks: Array<{
    name: string;
    status: string;
    command?: string;
    evidence: EvidenceRef[];
  }>;
  browserProof: Array<{
    label: string;
    viewport?: "desktop" | "mobile";
    flow?: string;
    evidence: EvidenceRef[];
  }>;
  githubReadback: {
    repo: string;
    visibility: string;
    defaultBranch: string;
    license: string;
    privateVulnerabilityReporting: string;
    topics: string[];
    evidence: EvidenceRef[];
  };
  knownLimitations: string[];
  supportPolicy: string;
};

const defaultManifestPath = "work/public-beta-proof/public-beta-release-proof.json";
const manifestPath = process.argv[2] ?? process.env.PUBLIC_BETA_PROOF ?? defaultManifestPath;
const absoluteManifestPath = resolve(process.cwd(), manifestPath);
const manifestDir = dirname(absoluteManifestPath);
const issues: string[] = [];

const requiredCheckNames = [
  "clean-checkout",
  "ci-default-branch",
  "public-uat",
  "release-uat-admin",
  "release-uat-reader",
  "smoke-compose",
  "restricted-leakage",
  "backup-restore",
  "support-surfaces",
  "github-readback"
];

const requiredBrowserLabels = [
  "public-reader-home",
  "page-browse-tree",
  "page-read-view",
  "search-results",
  "ask-with-sources",
  "no-access-restricted-state",
  "login-gate",
  "admin-overview",
  "reviews",
  "policies",
  "access-management",
  "approvals",
  "exports",
  "mobile-reader"
];
const browserLabelsRequiringDistinctEvidence = new Set([
  "page-browse-tree",
  "page-read-view",
  "search-results",
  "ask-with-sources",
  "no-access-restricted-state",
  "admin-overview",
  "reviews",
  "policies",
  "access-management",
  "approvals",
  "exports"
]);
const requiredGithubTopics = ["forgetbase", "knowledge-base", "ai-tools", "self-hosted", "docker-compose"];
const structuredGateReports = new Set(["clean-checkout", "smoke-compose", "restricted-leakage", "backup-restore"]);

if (!existsSync(absoluteManifestPath)) {
  fail([
    `Release proof manifest not found: ${manifestPath}`,
    "Create it from docs/PUBLIC_BETA_RELEASE_PROOF.template.json after running the stack-backed release gates."
  ]);
}

const manifest = parseManifest(readFileSync(absoluteManifestPath, "utf8"));
const releaseLiveDemoUrl = isRecord(manifest.release) && typeof manifest.release.liveDemoUrl === "string"
  ? manifest.release.liveDemoUrl
  : undefined;
const releaseCommitSha = isRecord(manifest.release) && typeof manifest.release.commitSha === "string"
  ? manifest.release.commitSha
  : undefined;

requireString(manifest.schemaVersion, "schemaVersion");
requireEqual(manifest.schemaVersion, "1", "schemaVersion");
requireEqual(manifest.stage, "public-beta", "stage");
validateRelease(manifest.release);
validateCompatibility(manifest.compatibility);
validateChecks(manifest.checks);
validateBrowserProof(manifest.browserProof);
validateGithubReadback(manifest.githubReadback);
validateKnownLimitations(manifest.knownLimitations);
requireString(manifest.supportPolicy, "supportPolicy");

if (issues.length > 0) {
  fail(issues);
}

console.log(`Public beta release proof OK: ${manifestPath}`);

function parseManifest(source: string): Partial<ReleaseProofManifest> {
  try {
    return JSON.parse(source) as Partial<ReleaseProofManifest>;
  } catch (error) {
    throw new Error(`Release proof manifest is not valid JSON: ${(error as Error).message}`);
  }
}

function validateRelease(value: unknown): void {
  if (!isRecord(value)) {
    issues.push("release must be an object");
    return;
  }

  requireCommitSha(value.commitSha, "release.commitSha");
  requireCommitSha(value.ciHeadSha, "release.ciHeadSha");
  if (typeof value.commitSha === "string" && typeof value.ciHeadSha === "string" && value.ciHeadSha !== value.commitSha) {
    issues.push("release.ciHeadSha must match release.commitSha");
  }
  requireIsoDate(value.generatedAt, "release.generatedAt");
  requireUrl(value.ciRunUrl, "release.ciRunUrl", { requireHttps: true });
  requireEqual(value.ciStatus, "passed", "release.ciStatus");
  requireUrl(value.liveDemoUrl, "release.liveDemoUrl", { requireHttps: true, rejectLocalhost: true });
  if (value.tag !== undefined) {
    requireString(value.tag, "release.tag");
  }
}

function validateCompatibility(value: unknown): void {
  if (!isRecord(value)) {
    issues.push("compatibility must be an object");
    return;
  }

  for (const field of ["node", "pnpm", "docker", "database", "browser", "document"]) {
    if (!(field in value)) {
      issues.push(`compatibility.${field} is required`);
    } else {
      requireNonPlaceholder(value[field], `compatibility.${field}`);
      if (field === "document" && typeof value[field] === "string" && !existsSync(resolve(process.cwd(), value[field]))) {
        issues.push(`compatibility.document file does not exist: ${value[field]}`);
      }
    }
  }
}

function validateChecks(value: unknown): void {
  if (!Array.isArray(value)) {
    issues.push("checks must be an array");
    return;
  }

  const checkNames = new Set(value.map((check) => isRecord(check) ? check.name : ""));
  for (const name of requiredCheckNames) {
    if (!checkNames.has(name)) {
      issues.push(`checks is missing required check "${name}"`);
    }
  }

  for (const check of value) {
    if (!isRecord(check)) {
      issues.push("checks entries must be objects");
      continue;
    }

    requireString(check.name, "checks.name");
    requireEqual(check.status, "pass", `checks.${String(check.name)}.status`);
    requireEvidenceList(check.evidence, `checks.${String(check.name)}.evidence`);
    if (check.command !== undefined) {
      requireString(check.command, `checks.${String(check.name)}.command`);
    }

    if (check.name === "public-uat") {
      requireUatReportEvidence(check.evidence, "checks.public-uat.evidence", {
        mode: "public",
        screenshots: ["public-desktop.png", "public-mobile.png"],
        commitSha: releaseCommitSha,
        checkNameIncludes: ["clipped text"]
      });
    }

    if (check.name === "release-uat-admin") {
      requireUatReportEvidence(check.evidence, "checks.release-uat-admin.evidence", {
        mode: "release",
        screenshots: [
          "page-browse-tree.png",
          "page-read-view.png",
          "search-results.png",
          "ask-with-sources.png",
          "reader-desktop.png",
          "reader-mobile.png",
          "admin-desktop.png"
        ],
        baseUrl: releaseLiveDemoUrl,
        commitSha: releaseCommitSha,
        checkNameIncludes: [
          "protected session API requires authentication",
          "clipped text"
        ]
      });
    }

    if (check.name === "release-uat-reader") {
      requireUatReportEvidence(check.evidence, "checks.release-uat-reader.evidence", {
        mode: "release",
        screenshots: [
          "page-browse-tree.png",
          "page-read-view.png",
          "search-results.png",
          "ask-with-sources.png",
          "no-access-restricted-state.png",
          "reader-desktop.png",
          "reader-mobile.png"
        ],
        baseUrl: releaseLiveDemoUrl,
        commitSha: releaseCommitSha,
        checkNameIncludes: [
          "protected session API requires authentication",
          "clipped text"
        ]
      });
    }

    if (check.name === "github-readback") {
      requireGithubCheckerEvidence(check.evidence, "checks.github-readback.evidence");
    }

    if (typeof check.name === "string" && structuredGateReports.has(check.name)) {
      requireStructuredGateReportEvidence(check.evidence, `checks.${check.name}.evidence`, check.name);
    }
  }
}

function validateBrowserProof(value: unknown): void {
  if (!Array.isArray(value)) {
    issues.push("browserProof must be an array");
    return;
  }

  const browserLabels = new Set(value.map((entry) => isRecord(entry) ? entry.label : ""));
  const distinctEvidenceFiles = new Map<string, string>();
  for (const label of requiredBrowserLabels) {
    if (!browserLabels.has(label)) {
      issues.push(`browserProof is missing required label "${label}"`);
    }
  }

  for (const entry of value) {
    if (!isRecord(entry)) {
      issues.push("browserProof entries must be objects");
      continue;
    }

    requireString(entry.label, "browserProof.label");
    requireEvidenceList(entry.evidence, `browserProof.${String(entry.label)}.evidence`);
    requirePngEvidence(entry.evidence, `browserProof.${String(entry.label)}.evidence`);
    if (typeof entry.label === "string" && browserLabelsRequiringDistinctEvidence.has(entry.label)) {
      const screenshotFiles = evidenceRecords(entry.evidence)
        .filter((evidence) => evidence.kind === "file" && typeof evidence.value === "string")
        .map((evidence) => String(evidence.value));
      if (!screenshotFiles.length) {
        continue;
      }

      const firstScreenshot = screenshotFiles[0]!;
      const existingLabel = distinctEvidenceFiles.get(firstScreenshot);
      if (existingLabel) {
        issues.push(`browserProof label "${entry.label}" must not reuse screenshot evidence from "${existingLabel}"`);
      } else {
        distinctEvidenceFiles.set(firstScreenshot, entry.label);
      }
    }
  }
}

function validateGithubReadback(value: unknown): void {
  if (!isRecord(value)) {
    issues.push("githubReadback must be an object");
    return;
  }

  requireString(value.repo, "githubReadback.repo");
  requireEqual(value.visibility, "public", "githubReadback.visibility");
  requireString(value.defaultBranch, "githubReadback.defaultBranch");
  requireEqual(value.license, "Apache-2.0", "githubReadback.license");
  requireEqual(value.privateVulnerabilityReporting, "enabled", "githubReadback.privateVulnerabilityReporting");

  if (!Array.isArray(value.topics)) {
    issues.push("githubReadback.topics must be an array");
  } else {
    value.topics.forEach((topic, index) => requireString(topic, `githubReadback.topics.${index}`));
    for (const topic of requiredGithubTopics) {
      if (!value.topics.includes(topic)) {
        issues.push(`githubReadback.topics must include "${topic}"`);
      }
    }
  }

  requireEvidenceList(value.evidence, "githubReadback.evidence");
}

function validateKnownLimitations(value: unknown): void {
  if (!Array.isArray(value)) {
    issues.push("knownLimitations must be an array");
    return;
  }

  if (value.length < 1) {
    issues.push("knownLimitations must list at least one beta limitation");
  }

  value.forEach((limitation, index) => requireString(limitation, `knownLimitations.${index}`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireString(value: unknown, path: string): void {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${path} must be a non-empty string`);
    return;
  }

  requireNonPlaceholder(value, path);
}

function requireEqual(value: unknown, expected: string, path: string): void {
  if (value !== expected) {
    issues.push(`${path} must be "${expected}"`);
  }
}

function requireCommitSha(value: unknown, path: string): void {
  requireString(value, path);
  if (typeof value === "string" && !/^[a-f0-9]{40}$/i.test(value)) {
    issues.push(`${path} must be a 40-character git commit SHA`);
  }
}

function requireIsoDate(value: unknown, path: string): void {
  requireString(value, path);
  if (typeof value === "string" && Number.isNaN(Date.parse(value))) {
    issues.push(`${path} must be an ISO-compatible date string`);
  }
}

function requireUrl(
  value: unknown,
  path: string,
  options: { rejectLocalhost?: boolean; requireHttps?: boolean } = {}
): void {
  requireString(value, path);
  if (typeof value !== "string") {
    return;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (options.requireHttps && url.protocol !== "https:") {
      issues.push(`${path} must use https`);
    }
    if (options.rejectLocalhost && ["127.0.0.1", "::1", "localhost"].includes(host)) {
      issues.push(`${path} must not be localhost`);
    }
  } catch {
    issues.push(`${path} must be a valid URL`);
  }
}

function requireEvidenceList(value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return;
  }

  if (value.length < 1) {
    issues.push(`${path} must contain at least one evidence item`);
    return;
  }

  for (const [index, evidence] of value.entries()) {
    requireEvidence(evidence, `${path}.${index}`);
  }
}

function requireEvidence(value: unknown, path: string): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an evidence object`);
    return;
  }

  if (!["file", "text", "url"].includes(String(value.kind))) {
    issues.push(`${path}.kind must be file, text, or url`);
  }
  requireString(value.value, `${path}.value`);
  if (value.note !== undefined) {
    requireString(value.note, `${path}.note`);
  }

  if (value.kind === "url") {
    requireUrl(value.value, `${path}.value`, { requireHttps: true });
  }

  if (value.kind === "file" && typeof value.value === "string") {
    const evidencePath = resolveEvidenceFile(value.value);
    if (!existsSync(evidencePath)) {
      issues.push(`${path}.value file does not exist: ${value.value}`);
    }
  }
}

function requireUatReportEvidence(
  value: unknown,
  path: string,
  expected: {
    mode: "public" | "release";
    screenshots: string[];
    baseUrl?: string;
    commitSha?: string;
    checkNameIncludes?: string[];
  }
): void {
  const reportEvidence = evidenceRecords(value)
    .find((evidence) => evidence.kind === "file" && typeof evidence.value === "string" && evidence.value.endsWith("public-beta-uat-report.json"));

  if (!reportEvidence || typeof reportEvidence.value !== "string") {
    issues.push(`${path} must include a public-beta-uat-report.json file`);
    return;
  }

  const reportPath = resolveEvidenceFile(reportEvidence.value);
  if (!existsSync(reportPath)) {
    return;
  }

  let report: unknown;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8")) as unknown;
  } catch (error) {
    issues.push(`${path} UAT report is not valid JSON: ${(error as Error).message}`);
    return;
  }

  if (!isRecord(report)) {
    issues.push(`${path} UAT report must be an object`);
    return;
  }

  if (report.mode !== expected.mode) {
    issues.push(`${path} UAT report mode must be "${expected.mode}"`);
  }

  if (expected.baseUrl && typeof report.baseUrl === "string" && normalizeUrl(report.baseUrl) !== normalizeUrl(expected.baseUrl)) {
    issues.push(`${path} UAT report baseUrl must match release.liveDemoUrl`);
  }

  if (expected.baseUrl && typeof report.baseUrl !== "string") {
    issues.push(`${path} UAT report must include baseUrl`);
  }

  if (expected.commitSha) {
    if (report.commitSha !== expected.commitSha) {
      issues.push(`${path} UAT report commitSha must match release.commitSha`);
    }
  }

  if (!Array.isArray(report.checks) || report.checks.length < 1) {
    issues.push(`${path} UAT report must include passed checks`);
  } else if (expected.checkNameIncludes) {
    const checkNames = report.checks
      .filter((check): check is Record<string, unknown> => isRecord(check))
      .map((check) => typeof check.name === "string" ? check.name : "");

    for (const expectedText of expected.checkNameIncludes) {
      if (!checkNames.some((name) => name.includes(expectedText))) {
        issues.push(`${path} UAT report must include a passed check containing "${expectedText}"`);
      }
    }
  }

  const screenshots = Array.isArray(report.screenshots)
    ? report.screenshots.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (!screenshots.length) {
    issues.push(`${path} UAT report must list screenshots`);
    return;
  }

  for (const expectedScreenshot of expected.screenshots) {
    if (!screenshots.some((screenshot) => screenshot.endsWith(expectedScreenshot))) {
      issues.push(`${path} UAT report is missing screenshot ${expectedScreenshot}`);
    }
  }
}

function requireStructuredGateReportEvidence(value: unknown, path: string, expectedName: string): void {
  const reportEvidence = evidenceRecords(value)
    .find((evidence) => evidence.kind === "file" && typeof evidence.value === "string" && evidence.value.endsWith(".json"));

  if (!reportEvidence || typeof reportEvidence.value !== "string") {
    issues.push(`${path} must include a structured JSON gate report file`);
    return;
  }

  const reportPath = resolveEvidenceFile(reportEvidence.value);
  if (!existsSync(reportPath)) {
    return;
  }

  let report: unknown;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8")) as unknown;
  } catch (error) {
    issues.push(`${path} gate report is not valid JSON: ${(error as Error).message}`);
    return;
  }

  if (!isRecord(report)) {
    issues.push(`${path} gate report must be an object`);
    return;
  }

  if (report.name !== expectedName) {
    issues.push(`${path} gate report name must be "${expectedName}"`);
  }

  if (report.ok !== true) {
    issues.push(`${path} gate report must have ok=true`);
  }

  if (expectedName === "clean-checkout") {
    if (!isRecord(report.worktree)) {
      issues.push(`${path} clean-checkout gate report must include worktree state`);
    } else {
      if (report.worktree.clean !== true) {
        issues.push(`${path} clean-checkout worktree must be clean`);
      }
      if (typeof report.worktree.commitSha !== "string" || report.worktree.commitSha !== releaseCommitSha) {
        issues.push(`${path} clean-checkout commitSha must match release.commitSha`);
      }
    }

    if (!isRecord(report.initialWorktree)) {
      issues.push(`${path} clean-checkout gate report must include initialWorktree state`);
    }

    if (!isRecord(report.finalWorktree)) {
      issues.push(`${path} clean-checkout gate report must include finalWorktree state`);
    } else {
      if (report.finalWorktree.clean !== true) {
        issues.push(`${path} clean-checkout finalWorktree must be clean`);
      }
      if (typeof report.finalWorktree.commitSha !== "string" || report.finalWorktree.commitSha !== releaseCommitSha) {
        issues.push(`${path} clean-checkout finalWorktree commitSha must match release.commitSha`);
      }
    }
  }

  if (!Array.isArray(report.commands) || report.commands.length < 1) {
    issues.push(`${path} gate report must include command results`);
  }
}

function requireGithubCheckerEvidence(value: unknown, path: string): void {
  const textEvidence = evidenceRecords(value)
    .find((evidence) => evidence.kind === "text" && typeof evidence.value === "string" && evidence.value.trim().startsWith("{"));

  if (!textEvidence || typeof textEvidence.value !== "string") {
    issues.push(`${path} must include JSON text output from github:public-beta:check`);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(textEvidence.value) as unknown;
  } catch (error) {
    issues.push(`${path} github:public-beta:check evidence is not valid JSON: ${(error as Error).message}`);
    return;
  }

  if (!isRecord(payload)) {
    issues.push(`${path} github:public-beta:check evidence must be a JSON object`);
    return;
  }

  if (payload.ok !== true) {
    issues.push(`${path} github:public-beta:check evidence must have ok=true`);
  }

  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const failed = findings.filter((finding) => isRecord(finding) && finding.status === "fail");
  if (failed.length > 0) {
    issues.push(`${path} github:public-beta:check evidence includes failing findings`);
  }
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function requirePngEvidence(value: unknown, path: string): void {
  const fileEvidence = evidenceRecords(value)
    .filter((evidence) => evidence.kind === "file" && typeof evidence.value === "string");

  if (!fileEvidence.length) {
    issues.push(`${path} must include screenshot file evidence`);
    return;
  }

  for (const evidence of fileEvidence) {
    if (typeof evidence.value !== "string") {
      continue;
    }

    const filePath = resolveEvidenceFile(evidence.value);
    if (!existsSync(filePath)) {
      continue;
    }

    const stats = statSync(filePath);
    if (stats.size < 1024) {
      issues.push(`${path} PNG evidence is too small to be credible: ${evidence.value}`);
      continue;
    }

    const bytes = readFileSync(filePath);
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const isPng = pngSignature.every((byte, index) => bytes[index] === byte);
    if (!isPng) {
      issues.push(`${path} file is not a PNG screenshot: ${evidence.value}`);
    }
  }
}

function evidenceRecords(value: unknown): EvidenceRef[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is EvidenceRef => isRecord(entry))
    : [];
}

function resolveEvidenceFile(value: string): string {
  return isAbsolute(value) ? value : resolve(manifestDir, value);
}

function requireNonPlaceholder(value: unknown, path: string): void {
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (
      value.includes("<") ||
      lowered.includes("todo") ||
      lowered.includes("tbd") ||
      lowered.includes("replace-me") ||
      lowered.includes("example.com")
    ) {
      issues.push(`${path} still looks like a placeholder`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => requireNonPlaceholder(item, `${path}.${index}`));
  }
}

function fail(messages: string[]): never {
  console.error("Public beta release proof check failed:");
  for (const message of messages) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}
