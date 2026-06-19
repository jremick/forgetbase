import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface ClaimsRule {
  id: string;
  description: string;
  suggestion: string;
  patterns: string[];
  requiredNearbyTerms?: string[];
}

interface RuleConfig {
  rules: ClaimsRule[];
}

interface Finding {
  file: string;
  lineNumber: number;
  rule: ClaimsRule;
  match: string;
  line: string;
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rulesPath = resolve(root, "scripts/claims-lint-rules.json");
const config = JSON.parse(await readFile(rulesPath, "utf8")) as RuleConfig;
const compiledRules = config.rules.map((rule) => ({
  rule,
  patterns: rule.patterns.map((pattern) => new RegExp(pattern, "gi"))
}));

const boundaryContextPattern =
  /\b(avoid|are not|before adding|blocklist|blocked|blocks|boundary|deferred|do not|do not compete|does not|does not yet|don't|excluded|forbidden|future|future phase|future phases|future work|gap|gaps|is not|must not|never claim|no public copy claims|not a|not an|not as|not be|not be described|not beta-blocking|not claim|not claimed|not included|not stable|not yet|not yet included|not yet stable|overclaim|overstates|rejected|remain|remaining|remaining gap|remaining gaps|remaining work|remains|review when adding|risk|risky|safer allowed|should not|still future|still need|until|unsupported|warning|warnings|when adding|without introducing)\b/i;

const inlineDisablePattern =
  /claims-lint-disable-next-line\s+([a-z0-9-, ]+)\s+--\s+(.+?);\s*expires\s+(\d{4}-\d{2}-\d{2})/i;

const scannedFiles = await collectScanTargets();
const findings: Finding[] = [];

for (const file of scannedFiles) {
  const absolutePath = resolve(root, file);
  const text = await readFile(absolutePath, "utf8");
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    for (const { rule, patterns } of compiledRules) {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const matches = [...line.matchAll(pattern)];

        for (const match of matches) {
          const matchedText = match[0] ?? "";
          if (!matchedText) {
            continue;
          }

          if (isBoundaryContext(lines, index) || isInlineDisabled(lines, index, rule.id) || hasRequiredNearbyTerm(lines, index, rule)) {
            continue;
          }

          findings.push({
            file,
            lineNumber: index + 1,
            rule,
            match: matchedText,
            line: line.trim()
          });
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`Claims lint found ${findings.length} blocked claim${findings.length === 1 ? "" : "s"}.`);
  console.error("");

  for (const finding of findings) {
    console.error(`${finding.file}:${finding.lineNumber} [${finding.rule.id}] matched "${finding.match}"`);
    console.error(`  ${finding.line}`);
    console.error(`  Suggestion: ${finding.rule.suggestion}`);
    console.error("");
  }

  process.exit(1);
}

console.log(`Claims lint OK: scanned ${scannedFiles.length} public copy/source files with ${config.rules.length} claim rules.`);

async function collectScanTargets(): Promise<string[]> {
  const files = new Set<string>();

  for (const file of ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "apps/web/index.html"]) {
    if (await exists(resolve(root, file))) {
      files.add(file);
    }
  }

  for (const file of await walk(resolve(root, "docs"))) {
    if (file.endsWith(".md")) {
      files.add(relative(root, file));
    }
  }

  for (const file of await walk(resolve(root, "apps/web/src"))) {
    if (isWebSourceScanTarget(file)) {
      files.add(relative(root, file));
    }
  }

  return [...files].sort();
}

async function walk(directory: string): Promise<string[]> {
  if (!(await exists(directory))) {
    return [];
  }

  const output: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (shouldSkipPath(absolutePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      output.push(...(await walk(absolutePath)));
    } else if (entry.isFile()) {
      output.push(absolutePath);
    }
  }

  return output;
}

function shouldSkipPath(path: string): boolean {
  const parts = relative(root, path).split(sep);
  return parts.some((part) => [".git", "node_modules", "dist", "build", "coverage", ".turbo"].includes(part));
}

function isWebSourceScanTarget(path: string): boolean {
  if (/\.(test|spec)\.[tj]sx?$/.test(path)) {
    return false;
  }

  return /\.[tj]sx?$/.test(path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isBoundaryContext(lines: string[], index: number): boolean {
  const context = lines.slice(Math.max(0, index - 10), Math.min(lines.length, index + 4)).join(" ");
  return boundaryContextPattern.test(context);
}

function isInlineDisabled(lines: string[], index: number, ruleId: string): boolean {
  const previousLine = lines[index - 1] ?? "";
  const match = previousLine.match(inlineDisablePattern);

  if (!match) {
    return false;
  }

  const disabledRules = (match[1] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const expiry = match[3];

  if (!disabledRules.includes(ruleId) && !disabledRules.includes("all")) {
    return false;
  }

  if (!expiry || expiry < new Date().toISOString().slice(0, 10)) {
    throw new Error(`Expired claims-lint disable before line ${index + 1}. Use a fresh reason and expiry or fix the claim.`);
  }

  return true;
}

function hasRequiredNearbyTerm(lines: string[], index: number, rule: ClaimsRule): boolean {
  if (!rule.requiredNearbyTerms || rule.requiredNearbyTerms.length === 0) {
    return false;
  }

  const context = [lines[index - 1], lines[index], lines[index + 1]].filter(Boolean).join(" ").toLowerCase();
  return rule.requiredNearbyTerms.some((term) => context.includes(term.toLowerCase()));
}
