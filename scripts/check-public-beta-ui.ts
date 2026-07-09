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
assertIncludes(app, 'className="public-entry-main login-entry-main"', "login entry");
assertIncludes(app, "Log in to ForgetBase", "login entry");
assertIncludes(app, "Use your account to read pages or manage the knowledge base.", "login entry");
assertIncludes(app, "public-login-form", "login form");
assertNotIncludes(app, "showLoginPanel", "login modal removed");
assertNotIncludes(app, "openLoginPanel", "login modal removed");
assertNotIncludes(app, "A knowledge base for people and AI tools.", "marketing public page removed");
assertNotIncludes(app, "Write and organize company knowledge once.", "marketing public page removed");
assertNotIncludes(app, "People get a clean wiki-style reading view.", "marketing public page removed");
assertNotIncludes(app, "Separate reader and admin views", "marketing public page removed");
assertNotIncludes(app, "Read pages</h3>", "marketing public page removed");
assertNotIncludes(app, "Manage content</h3>", "marketing public page removed");
assertIncludes(html, "Knowledge Base for People and AI Tools", "HTML metadata");
assertIncludes(html, "knowledge base for people and AI tools", "HTML metadata");
assertIncludes(app, "reader-library", "reader page navigation");
assertIncludes(app, "reader-article", "reader article");
assertIncludes(app, "On this page", "reader section navigation");
assertIncludes(app, "reader-mobile-page-picker", "reader mobile page picker");
assertIncludes(app, "reader-page-footer", "reader page footer");
assertIncludes(app, "readerParentId", "reader hierarchy metadata");
assertIncludes(app, "readerIcon", "reader icon metadata");
assertIncludes(app, "reader-search-kbd", "reader search shortcut hint");
assertIncludes(app, "nav-resizer", "resizable page navigation");
assertIncludes(app, "nav-collapsed", "collapsible page navigation");
assertIncludes(app, "reader-collapsed-node", "collapsed reader navigation");
assertIncludes(app, "reader-leaf-dot", "reader leaf dot navigation");
assertIncludes(app, "reader-ask-title", "reader ask panel");
assertIncludes(app, "reader-ask-answer", "reader answer state");
assertIncludes(app, "reader-no-access-state", "reader no-access state");
assertIncludes(app, "reader-citation", "reader citations");
assertNotIncludes(app, "import * as PhosphorIcons", "direct icon imports");
assertNotIncludes(app, "reader-refresh-button", "reader refresh button removed");
assertNotIncludes(app, "reader-source-heading", "reader footer heading removed");
assertIncludes(app, "\"admin/content\": \"library\"", "admin content route");
assertIncludes(app, "\"admin/system/settings\": \"settings\"", "admin settings route");
assertIncludes(app, "window.history.replaceState({}, document.title", "admin canonical hash rewrite");
assertIncludes(app, "className=\"side-nav tree-nav admin-side-nav\"", "admin console shell");
assertIncludes(app, "renderNavigationSections(() => setIsMobileNavOpen(false))", "mobile admin shell navigation");
assertIncludes(app, "Search pages", "reader action");

for (const selector of [
  ".admin-side-header",
  ".reader-section-nav",
  ".reader-mobile-page-picker",
  ".reader-page-footer",
  ".reader-ask-panel",
  ".reader-no-access-state",
  ".reader-citation",
  ".reader-document-body h2",
  ".reader-page-footer dl",
  ".reader-leaf-dot",
  ".reader-collapsed-node",
  ".nav-chrome",
  ".nav-resizer",
  ".login-entry-main",
  ".login-panel"
]) {
  assertIncludes(css, selector, "reader-first CSS");
}

assertIncludes(css, ".reader-shell .reader-library {\n    display: none;", "single mobile reader navigation model");

const publicCopy = sliceBetween(
  app,
  '<main className="public-entry-main login-entry-main" id="main">',
  "</main>",
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
