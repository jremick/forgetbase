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
const reader = read("apps/web/src/ReaderSurface.tsx");
const admin = read("apps/web/src/AdminSurface.tsx");
const routing = read("apps/web/src/lib/app-routing.ts");
const productUi = [app, reader, admin, routing].join("\n");
const css = read("apps/web/src/styles.css");
const html = read("apps/web/index.html");
const readme = read("README.md");
const goal = read("docs/PUBLIC_BETA_GOAL.md");

assertIncludes(goal, "ForgetBase is a knowledge base for people and AI tools.", "Public beta goal");
assertIncludes(goal, "Pages, Search, Ask, Sources, Review, Publish, Access, Admin, Exports, Settings", "Public beta goal");
assertIncludes(readme, "Public Beta Goal", "README docs list");

assertIncludes(routing, 'return pageRoutes.has(aliasedRoute) ? aliasedRoute as AppRoute : "reader";', "default route");
assertIncludes(app, 'className="public-entry-main login-entry-main"', "login entry");
assertIncludes(app, "Log in to ForgetBase", "login entry");
assertIncludes(app, "Use your account to read pages or manage the knowledge base.", "login entry");
assertIncludes(app, "public-login-form", "login form");
assertNotIncludes(productUi, "showLoginPanel", "login modal removed");
assertNotIncludes(productUi, "openLoginPanel", "login modal removed");
assertNotIncludes(productUi, "A knowledge base for people and AI tools.", "marketing public page removed");
assertNotIncludes(productUi, "Write and organize company knowledge once.", "marketing public page removed");
assertNotIncludes(productUi, "People get a clean wiki-style reading view.", "marketing public page removed");
assertNotIncludes(productUi, "Separate reader and admin views", "marketing public page removed");
assertNotIncludes(productUi, "Read pages</h3>", "marketing public page removed");
assertNotIncludes(productUi, "Manage content</h3>", "marketing public page removed");
assertIncludes(html, "Knowledge Base for People and AI Tools", "HTML metadata");
assertIncludes(html, "knowledge base for people and AI tools", "HTML metadata");
assertIncludes(reader, "reader-library", "reader page navigation");
assertIncludes(reader, "reader-article", "reader article");
assertIncludes(reader, "On this page", "reader section navigation");
assertIncludes(reader, "reader-mobile-page-picker", "reader mobile page picker");
assertIncludes(reader, "reader-page-footer", "reader page footer");
assertIncludes(reader, "readerIcon", "reader icon metadata");
assertIncludes(reader, "reader-search-kbd", "reader search shortcut hint");
assertIncludes(reader, "nav-resizer", "resizable page navigation");
assertIncludes(reader, "nav-collapsed", "collapsible page navigation");
assertIncludes(reader, "reader-collapsed-node", "collapsed reader navigation");
assertIncludes(reader, "reader-leaf-dot", "reader leaf dot navigation");
assertIncludes(reader, "reader-ask-title", "reader ask panel");
assertIncludes(reader, "reader-ask-answer", "reader answer state");
assertIncludes(reader, "reader-no-access-state", "reader no-access state");
assertIncludes(reader, "reader-citation", "reader citations");
assertNotIncludes(productUi, "import * as PhosphorIcons", "direct icon imports");
assertNotIncludes(reader, "reader-refresh-button", "reader refresh button removed");
assertNotIncludes(reader, "reader-source-heading", "reader footer heading removed");
assertIncludes(routing, "\"admin/content\": \"library\"", "admin content route");
assertIncludes(routing, "\"admin/system/settings\": \"settings\"", "admin settings route");
assertIncludes(app, "window.history.replaceState({}, document.title", "admin canonical hash rewrite");
assertIncludes(admin, "className=\"side-nav tree-nav admin-side-nav\"", "admin console shell");
assertIncludes(admin, "renderNavigationSections(() => setIsMobileNavOpen(false))", "mobile admin shell navigation");
assertIncludes(reader, "Search pages", "reader action");
assertIncludes(app, 'lazy(() => import("./AdminSurface.js")', "lazy admin boundary");
assertNotIncludes(app, 'import { AdminSurface } from "./AdminSurface.js"', "admin excluded from static entry graph");
assertIncludes(app, "isAdminRoute(route) && !administrator", "reader admin-route guard");

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
  reader,
  '<main className={`reader-main ${accountSettings ? "reader-main--account" : ""}`} id="main">',
  "</main>",
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
