import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(source: string, expected: string, label: string): void {
  if (!source.includes(expected)) {
    throw new Error(`${label} is missing expected text: ${expected}`);
  }
}

function assertNotIncludes(source: string, unexpected: string, label: string): void {
  if (source.toLowerCase().includes(unexpected.toLowerCase())) {
    throw new Error(`${label} still contains reader/public jargon: ${unexpected}`);
  }
}

function sliceBetween(source: string, start: string, end: string, label: string): string {
  const startIndex = source.indexOf(start);

  if (startIndex === -1) {
    throw new Error(`${label} start marker not found: ${start}`);
  }

  const endIndex = source.indexOf(end, startIndex);

  if (endIndex === -1) {
    throw new Error(`${label} end marker not found: ${end}`);
  }

  return source.slice(startIndex, endIndex);
}

const app = read("apps/web/src/App.tsx");
const css = read("apps/web/src/styles.css");
const html = read("apps/web/index.html");
const readme = read("README.md");
const goal = read("docs/PUBLIC_BETA_GOAL.md");

assertIncludes(goal, "ForgetBase is a knowledge base for people and AI tools.", "Public beta goal");
assertIncludes(goal, "Pages, Search, Ask, Sources, Review, Publish, Access, Admin, Exports, Settings", "Public beta goal");
assertIncludes(readme, "Public Beta Goal", "README docs list");

assertIncludes(app, 'return pageRoutes.has(aliasedRoute) ? aliasedRoute : "reader";', "default route");
assertIncludes(app, "A knowledge base for people and AI tools.", "public hero");
assertIncludes(app, "Write and organize company knowledge once.", "public hero");
assertIncludes(app, "People get a clean wiki-style reading view.", "public hero");
assertIncludes(app, "Reader and admin separated", "public trust strip");
assertIncludes(app, "Beta access", "public access boundary");
assertIncludes(app, "Beta access. Invitation required.", "login dialog");
assertIncludes(app, "<h3>Read pages</h3>", "public beta path");
assertIncludes(app, "<h3>Manage content</h3>", "public beta path");
assertIncludes(html, "Knowledge Base for People and AI Tools", "HTML metadata");
assertIncludes(html, "knowledge base for people and AI tools", "HTML metadata");
assertIncludes(app, "<h1 id=\"reader-title\">Pages</h1>", "reader home");
assertIncludes(app, "<h3 id=\"reader-ask-title\">Ask with sources</h3>", "reader ask");
assertIncludes(app, "Ask a question and see the pages used for the answer.", "reader ask");
assertIncludes(app, "aria-label=\"Sources\"", "reader sources");
assertIncludes(app, "Admin console", "reader admin handoff");
assertIncludes(app, "Search pages", "reader action");

for (const selector of [
  ".reader-hero",
  ".reader-summary-strip",
  ".reader-ask-panel",
  ".reader-ask-answer",
  ".reader-citation",
  ".reader-source-heading",
  ".reader-document-body h2",
  ".reader-source-panel dl",
  ".public-step-icon",
  ".proof-browser"
]) {
  assertIncludes(css, selector, "reader-first CSS");
}

const publicCopy = sliceBetween(
  app,
  '<main className="public-entry-main" id="main">',
  '<Dialog open={showLoginPanel}',
  "public entry"
);
const readerCopy = sliceBetween(
  app,
  '<main className={`reader-main ${accountSettingsRouteRequested ? "reader-main--account" : ""}`} id="main">',
  '<CommandDialog',
  "reader shell"
);

for (const phrase of [
  "agent-native",
  "control plane",
  "managed query",
  "governed asset",
  "machine-consumer",
  "delivery surface",
  "private beta",
  "certification-level compliance",
  "enterprise identity",
  "Reader UI"
]) {
  assertNotIncludes(publicCopy, phrase, "public entry");
  assertNotIncludes(readerCopy, phrase, "reader shell");
}

console.log("Public beta UI gate OK: reader-first copy, default route, and reader styles are present.");
