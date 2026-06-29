import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

type EvidenceRef = {
  kind: "file" | "text" | "url";
  value: string;
  note?: string;
};

type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
};

type CheckStatus = "pass" | "fail";

const root = process.cwd();
const repo = process.env.PUBLIC_BETA_REPO ?? "jremick/forgetbase";
const outputPath = resolve(
  root,
  readArg("--output") ??
    process.env.PUBLIC_BETA_PROOF ??
    "work/public-beta-proof/public-beta-release-proof.json"
);
const proofDir = dirname(outputPath);
const gateResultsDir = process.env.PUBLIC_BETA_PROOF_GATE_DIR ?? "work/public-beta-proof/gate-results";
const githubCheck = run("tsx", ["scripts/check-public-beta-github.ts"]);
const githubCheckPayload = parseJson(githubCheck.stdout);
const githubMetadata = readGithubMetadata(repo);
const latestCi = readLatestSuccessfulCi(repo, githubMetadata.defaultBranch || "main");
const commitSha = commandOutput("git", ["rev-parse", "HEAD"]) ?? "<40-character git commit SHA>";
const ciHeadSha = process.env.PUBLIC_BETA_CI_HEAD_SHA ?? latestCi.headSha ?? "<40-character CI head SHA>";
const releaseTag = process.env.PUBLIC_BETA_TAG;
const ciRunUrl = process.env.PUBLIC_BETA_CI_RUN_URL ?? latestCi.url ?? `https://github.com/${repo}/actions/runs/<run-id>`;
const liveDemoUrl = process.env.PUBLIC_BETA_LIVE_DEMO_URL ?? "https://<public-demo-host>";
const releaseUatTenantId = process.env.PUBLIC_BETA_RELEASE_UAT_TENANT_ID;
const releaseAdminEmail = process.env.PUBLIC_BETA_RELEASE_ADMIN_EMAIL ?? "admin-public-beta@example.test";
const releaseReaderEmail = process.env.PUBLIC_BETA_RELEASE_READER_EMAIL ?? "reader-public-beta@example.test";
const releaseUatPasswordRef = process.env.PUBLIC_BETA_RELEASE_UAT_PASSWORD_REF ?? "$PUBLIC_BETA_UAT_PASSWORD";
const liveDemoReady = isPublicHttpsUrl(liveDemoUrl);
const liveDemoRootUrl = liveDemoUrl;
const liveDemoHealthUrl = liveDemoUrlForPath(liveDemoUrl, "/api/health");
const liveDemoRootCheck = liveDemoReady ? run("curl", [
  "--silent",
  "--show-error",
  "--location",
  "--max-time",
  "20",
  "--write-out",
  "\n__FORGETBASE_LIVE_ROOT__%{http_code} %{url_effective}",
  liveDemoRootUrl
]) : undefined;
const liveDemoRootReadback = summarizeLiveDemoRoot(liveDemoRootCheck, liveDemoRootUrl);
const liveDemoHealthCheck = liveDemoReady ? run("curl", [
  "--silent",
  "--show-error",
  "--fail",
  "--max-time",
  "20",
  liveDemoHealthUrl
]) : undefined;
const supportSurfaceFiles = [
  "SUPPORT.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/pull_request_template.md"
];

const manifest = {
  schemaVersion: "1",
  stage: "public-beta",
  release: {
    commitSha,
    ...(releaseTag ? { tag: releaseTag } : {}),
    ciRunUrl,
    ciHeadSha,
    ciStatus: latestCi.status,
    generatedAt: new Date().toISOString(),
    liveDemoUrl
  },
  compatibility: {
    node: "22.x",
    pnpm: "11.7.0",
    docker: "Docker Compose v2 with Docker Engine running",
    database: "Postgres 17 with pgvector",
    browser: "Chromium via Playwright",
    document: "docs/PUBLIC_BETA_COMPATIBILITY.md"
  },
  checks: [
    {
      name: "clean-checkout",
      status: gateReportStatus("clean-checkout.json"),
      command: [
        "npx -y pnpm@11.7.0 install --frozen-lockfile",
        "npx -y pnpm@11.7.0 public-beta:preflight",
        "npx -y pnpm@11.7.0 test",
        "git status --porcelain=v1 --untracked-files=all"
      ].join(" && "),
      evidence: [gateReportEvidence("clean-checkout.json")]
    },
    {
      name: "ci-default-branch",
      status: latestCi.status === "passed" ? "pass" : "fail",
      evidence: [urlEvidence(ciRunUrl)]
    },
    {
      name: "live-demo-root",
      status: liveDemoRootReadback.ok ? "pass" : "fail",
      command: `curl --silent --show-error --location --max-time 20 --write-out "\\n__FORGETBASE_LIVE_ROOT__%{http_code} %{url_effective}" ${liveDemoRootUrl}`,
      evidence: [textEvidence(
        liveDemoRootReadback.evidence ||
          liveDemoRootCheck?.stderr ||
          "<public HTTPS demo root read-back>",
        liveDemoReady ? undefined : "requires PUBLIC_BETA_LIVE_DEMO_URL"
      )]
    },
    {
      name: "live-demo-health",
      status: liveDemoHealthCheck?.ok === true && parseJson(liveDemoHealthCheck.stdout)?.status === "ok" ? "pass" : "fail",
      command: `curl --silent --show-error --fail --max-time 20 ${liveDemoHealthUrl}`,
      evidence: [textEvidence(
        liveDemoHealthCheck?.stdout ||
          liveDemoHealthCheck?.stderr ||
          "<public HTTPS demo /api/health read-back>",
        liveDemoReady ? undefined : "requires PUBLIC_BETA_LIVE_DEMO_URL"
      )]
    },
    {
      name: "public-uat",
      status: uatReportStatus("public-uat/public-beta-uat-report.json", {
        mode: "public",
        commitSha
      }),
      command: "UAT_OUTPUT_DIR=work/public-beta-proof/public-uat npx -y pnpm@11.7.0 test:uat",
      evidence: [fileEvidence("public-uat/public-beta-uat-report.json")]
    },
    {
      name: "release-uat-admin",
      status: liveDemoReady
        ? uatReportStatus("release-admin/public-beta-uat-report.json", {
          mode: "release",
          baseUrl: liveDemoUrl,
          commitSha
        })
        : "fail",
      command: buildReleaseUatCommand({
        baseUrl: liveDemoUrl,
        expectedRole: "admin",
        tenantId: releaseUatTenantId,
        email: releaseAdminEmail,
        passwordRef: releaseUatPasswordRef,
        outputDir: "work/public-beta-proof/release-admin"
      }),
      evidence: [fileEvidence(
        "release-admin/public-beta-uat-report.json",
        liveDemoReady ? undefined : "local evidence only; rerun against PUBLIC_BETA_LIVE_DEMO_URL"
      )]
    },
    {
      name: "release-uat-reader",
      status: liveDemoReady
        ? uatReportStatus("release-reader/public-beta-uat-report.json", {
          mode: "release",
          baseUrl: liveDemoUrl,
          commitSha
        })
        : "fail",
      command: buildReleaseUatCommand({
        baseUrl: liveDemoUrl,
        expectedRole: "reader",
        tenantId: releaseUatTenantId,
        email: releaseReaderEmail,
        passwordRef: releaseUatPasswordRef,
        outputDir: "work/public-beta-proof/release-reader"
      }),
      evidence: [fileEvidence(
        "release-reader/public-beta-uat-report.json",
        liveDemoReady ? undefined : "local evidence only; rerun against PUBLIC_BETA_LIVE_DEMO_URL"
      )]
    },
    {
      name: "smoke-compose",
      status: gateReportStatus("smoke-compose.json"),
      command: "npx -y pnpm@11.7.0 smoke:compose",
      evidence: [gateReportEvidence("smoke-compose.json")]
    },
    {
      name: "restricted-leakage",
      status: gateReportStatus("restricted-leakage.json"),
      command: "npx -y pnpm@11.7.0 security:verify-restricted-leakage",
      evidence: [gateReportEvidence("restricted-leakage.json")]
    },
    {
      name: "backup-restore",
      status: gateReportStatus("backup-restore.json"),
      command: "npx -y pnpm@11.7.0 db:verify-backup-restore",
      evidence: [gateReportEvidence("backup-restore.json")]
    },
    {
      name: "github-readback",
      status: githubCheckPayload?.ok === true ? "pass" : "fail",
      command: "npx -y pnpm@11.7.0 github:public-beta:check",
      evidence: [
        textEvidence(
          githubCheck.stdout ||
            githubCheck.stderr ||
            "<github:public-beta:check JSON output showing public visibility, reader-first metadata, license, topics, vulnerability reporting, branch protection or rulesets, and successful CI>"
        )
      ]
    },
    {
      name: "support-surfaces",
      status: supportSurfaceFiles.every((file) => fileExistsAndTracked(file)) ? "pass" : "fail",
      evidence: supportSurfaceFiles.map((file) => repoFileEvidence(file))
    }
  ],
  browserProof: [
    browserEvidence("public-reader-home", "desktop", "Public entry", "public-uat/public-desktop.png"),
    browserEvidence("page-browse-tree", "desktop", "Signed-in reader browse tree", "release-reader/page-browse-tree.png"),
    browserEvidence("page-read-view", "desktop", "Signed-in reader page view", "release-reader/page-read-view.png"),
    browserEvidence("search-results", "desktop", "Signed-in reader search", "release-reader/search-results.png"),
    browserEvidence("ask-with-sources", "desktop", "Ask with sources", "release-reader/ask-with-sources.png"),
    browserEvidence("no-access-restricted-state", "desktop", "Reader restricted-content boundary", "release-reader/no-access-restricted-state.png"),
    browserEvidence("login-gate", "desktop", "Login gate", "public-uat/public-desktop.png"),
    browserEvidence("admin-overview", "desktop", "Admin console", "release-admin/admin-desktop.png"),
    browserEvidence("reviews", "desktop", "Admin reviews", "release-admin/reviews.png"),
    browserEvidence("policies", "desktop", "Admin policies", "release-admin/policies.png"),
    browserEvidence("access-management", "desktop", "Admin access management", "release-admin/access-management.png"),
    browserEvidence("approvals", "desktop", "Admin approvals", "release-admin/approvals.png"),
    browserEvidence("exports", "desktop", "Admin exports", "release-admin/exports.png"),
    browserEvidence("mobile-reader", "mobile", "Signed-in reader", "release-reader/reader-mobile.png")
  ],
  githubReadback: {
    repo,
    visibility: githubMetadata.visibility,
    defaultBranch: githubMetadata.defaultBranch,
    license: githubMetadata.license,
    privateVulnerabilityReporting: githubMetadata.privateVulnerabilityReporting,
    topics: githubMetadata.topics,
    evidence: [
      textEvidence(
        githubMetadata.raw ||
          "<gh repo view and GitHub API read-back summary>"
      )
    ]
  },
  knownLimitations: [
    "Public beta is for trial use, not production support or compliance certification."
  ],
  supportPolicy: "Use GitHub issues for reproducible bugs and concrete feature requests; use GitHub private vulnerability reporting for suspected vulnerabilities."
};

mkdirSync(proofDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Draft public beta release proof written: ${relative(root, outputPath)}`);
console.log("Run `npx -y pnpm@11.7.0 release-proof:check " + relative(root, outputPath) + "` after replacing any placeholders and adding missing evidence files.");

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function textEvidence(value: string, note?: string): EvidenceRef {
  return { kind: "text", value, ...(note ? { note } : {}) };
}

function urlEvidence(value: string, note?: string): EvidenceRef {
  return { kind: "url", value, ...(note ? { note } : {}) };
}

function fileEvidence(value: string, note?: string): EvidenceRef {
  return { kind: "file", value, ...(note ? { note } : {}) };
}

function repoFileEvidence(repoRelativePath: string): EvidenceRef {
  const absolutePath = resolve(root, repoRelativePath);
  return fileEvidence(relative(proofDir, absolutePath), repoRelativePath);
}

function fileExistsAndTracked(repoRelativePath: string): boolean {
  if (!existsSync(resolve(root, repoRelativePath))) {
    return false;
  }

  return run("git", ["ls-files", "--error-unmatch", repoRelativePath]).ok;
}

function gateReportEvidence(fileName: string): EvidenceRef {
  const absolutePath = resolve(root, gateResultsDir, fileName);
  return fileEvidence(relative(proofDir, absolutePath), `${fileName} structured gate report`);
}

function gateReportStatus(fileName: string): CheckStatus {
  const absolutePath = resolve(root, gateResultsDir, fileName);

  if (!existsSync(absolutePath)) {
    return "fail";
  }

  const parsed = parseJson(readFileSync(absolutePath, "utf8"));
  return parsed?.ok === true ? "pass" : "fail";
}

function uatReportStatus(
  reportPath: string,
  expected: { mode: "public" | "release"; baseUrl?: string; commitSha: string }
): CheckStatus {
  const absolutePath = resolve(proofDir, reportPath);

  if (!existsSync(absolutePath)) {
    return "fail";
  }

  const parsed = parseJson(readFileSync(absolutePath, "utf8"));

  if (!parsed) {
    return "fail";
  }

  if (parsed.mode !== expected.mode || parsed.commitSha !== expected.commitSha) {
    return "fail";
  }

  if (expected.baseUrl && parsed.baseUrl !== expected.baseUrl) {
    return "fail";
  }

  if (!Array.isArray(parsed.checks) || parsed.checks.some((check) => !isRecord(check) || check.status !== "pass")) {
    return "fail";
  }

  if (!Array.isArray(parsed.screenshots) || parsed.screenshots.length === 0) {
    return "fail";
  }

  return "pass";
}

function isPublicHttpsUrl(value: string): boolean {
  if (value.includes("<") || value.includes(">")) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1" &&
      !hostname.endsWith(".local");
  } catch {
    return false;
  }
}

function liveDemoUrlForPath(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return `https://<public-demo-host>${path}`;
  }
}

function browserEvidence(
  label: string,
  viewport: "desktop" | "mobile",
  flow: string,
  file: string
): { label: string; viewport: "desktop" | "mobile"; flow: string; evidence: EvidenceRef[] } {
  return {
    label,
    viewport,
    flow,
    evidence: [fileEvidence(file)]
  };
}

function buildReleaseUatCommand(input: {
  baseUrl: string;
  expectedRole: "admin" | "reader";
  tenantId: string | undefined;
  email: string;
  passwordRef: string;
  outputDir: string;
}): string {
  return [
    `UAT_BASE_URL=${input.baseUrl}`,
    "UAT_MODE=release",
    `UAT_EXPECT_ROLE=${input.expectedRole}`,
    ...(input.tenantId ? [`UAT_TENANT_ID=${input.tenantId}`] : []),
    `UAT_EMAIL=${input.email}`,
    `UAT_PASSWORD=${input.passwordRef}`,
    `UAT_OUTPUT_DIR=${input.outputDir}`,
    "npx -y pnpm@11.7.0 test:uat"
  ].join(" ");
}

function commandOutput(command: string, args: string[]): string | undefined {
  const result = run(command, args);
  return result.ok && result.stdout ? result.stdout : undefined;
}

function parseJson(source: string): Record<string, unknown> | undefined {
  if (!source.trim().startsWith("{")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(source) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function run(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });

  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim()
  };
}

function summarizeLiveDemoRoot(
  result: CommandResult | undefined,
  expectedUrl: string
): { ok: boolean; evidence: string } {
  const requiredText = [
    "ForgetBase | Knowledge Base for People and AI Tools",
    "ForgetBase: A Knowledge Base for People and AI Tools",
    "knowledge base for people and AI tools"
  ];
  const forbiddenText = [
    "ForgetBase | Governed Instructions for AI Agents",
    "ForgetBase: Governed Instructions for AI Agents",
    "governed registry for agent instructions",
    "context packages with API, CLI, MCP"
  ];

  if (!result) {
    return {
      ok: false,
      evidence: JSON.stringify({
        ok: false,
        expectedUrl,
        reason: "missing live root read-back"
      })
    };
  }

  const marker = "\n__FORGETBASE_LIVE_ROOT__";
  const markerIndex = result.stdout.lastIndexOf(marker);
  const html = markerIndex === -1 ? result.stdout : result.stdout.slice(0, markerIndex);
  const meta = markerIndex === -1 ? "" : result.stdout.slice(markerIndex + marker.length).trim();
  const [statusCodeText = "", ...effectiveUrlParts] = meta.split(/\s+/);
  const statusCode = Number.parseInt(statusCodeText, 10);
  const effectiveUrl = effectiveUrlParts.join(" ");
  const required = requiredText.map((text) => ({ text, present: html.includes(text) }));
  const forbidden = forbiddenText.map((text) => ({ text, present: html.includes(text) }));
  const hasRequiredText = required.every((entry) => entry.present);
  const hasForbiddenText = forbidden.some((entry) => entry.present);
  const ok = result.ok &&
    statusCode >= 200 &&
    statusCode < 300 &&
    hasRequiredText &&
    !hasForbiddenText;

  return {
    ok,
    evidence: JSON.stringify({
      ok,
      statusCode: Number.isNaN(statusCode) ? null : statusCode,
      effectiveUrl,
      expectedUrl,
      htmlBytes: Buffer.byteLength(html, "utf8"),
      requiredText: required,
      forbiddenText: forbidden,
      stderr: result.stderr || undefined
    })
  };
}

function readLatestSuccessfulCi(targetRepo: string, branch: string): { url: string; headSha: string; status: "passed" | "unknown" } {
  const result = run("gh", [
    "run",
    "list",
    "--repo",
    targetRepo,
    "--branch",
    branch,
    "--workflow",
    "CI",
    "--limit",
    "10",
    "--json",
    "status,conclusion,url,headSha"
  ]);

  if (!result.ok) {
    return { url: "", headSha: "", status: "unknown" };
  }

  try {
    const runs = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    const success = runs.find((run) => run.status === "completed" && run.conclusion === "success");
    return typeof success?.url === "string"
      ? {
        url: success.url,
        headSha: typeof success.headSha === "string" ? success.headSha : "",
        status: "passed"
      }
      : { url: "", headSha: "", status: "unknown" };
  } catch {
    return { url: "", headSha: "", status: "unknown" };
  }
}

function readGithubMetadata(targetRepo: string): {
  visibility: string;
  defaultBranch: string;
  license: string;
  privateVulnerabilityReporting: string;
  topics: string[];
  raw: string;
} {
  const repoView = run("gh", [
    "repo",
    "view",
    targetRepo,
    "--json",
    "visibility,defaultBranchRef,licenseInfo,repositoryTopics"
  ]);
  const pvr = run("gh", ["api", `repos/${targetRepo}/private-vulnerability-reporting`]);
  const fallback = {
    visibility: "unknown",
    defaultBranch: "unknown",
    license: "unknown",
    privateVulnerabilityReporting: "unknown",
    topics: [] as string[],
    raw: [repoView.stderr, repoView.stdout, pvr.stderr, pvr.stdout].filter(Boolean).join("\n")
  };

  if (!repoView.ok) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(repoView.stdout) as Record<string, unknown>;
    const pvrParsed = pvr.ok ? JSON.parse(pvr.stdout) as Record<string, unknown> : {};
    const topics = Array.isArray(parsed.repositoryTopics)
      ? parsed.repositoryTopics
        .map((topic) => isRecord(topic) && typeof topic.name === "string" ? topic.name : "")
        .filter(Boolean)
        .sort()
      : [];

    return {
      visibility: String(parsed.visibility ?? "unknown").toLowerCase(),
      defaultBranch: readNestedString(parsed, ["defaultBranchRef", "name"]) || "unknown",
      license: normalizeLicense(parsed.licenseInfo),
      privateVulnerabilityReporting: pvrParsed.enabled === true ? "enabled" : pvr.ok ? "disabled" : "unknown",
      topics,
      raw: [repoView.stdout, pvr.stdout, pvr.stderr].filter(Boolean).join("\n")
    };
  } catch {
    return fallback;
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

function normalizeLicense(value: unknown): string {
  if (!isRecord(value)) {
    return "unknown";
  }

  const spdxId = typeof value.spdxId === "string" ? value.spdxId : "";
  const key = typeof value.key === "string" ? value.key : "";

  if (spdxId && spdxId !== "NOASSERTION") {
    return spdxId;
  }

  if (key.toLowerCase() === "apache-2.0") {
    return "Apache-2.0";
  }

  return key || "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
