import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, type Browser, type Locator, type Page, type Request, type Route } from "@playwright/test";
import { assetDetailSchema, managedQueryResponseSchema, searchResponseSchema } from "../packages/schema/src/index.js";
import { readerFixture, readerPolicyBody } from "./fixtures/reader-experience.js";

type UatMode = "public" | "release";
type ExpectedRole = "admin" | "reader";

type CheckResult = {
  name: string;
  status: "pass";
  detail?: string | number | boolean;
};

const root = process.cwd();
const mode = parseMode(process.env.UAT_MODE);
const expectedRole = parseExpectedRole(process.env.UAT_EXPECT_ROLE);
const expectedBrandName = process.env.UAT_EXPECT_BRAND_NAME ?? "ForgetBase";
const shouldTestAuthoring = process.env.UAT_TEST_AUTHORING === "true";
const shouldTestRichEditor = process.env.UAT_TEST_RICH_EDITOR === "true";
const shouldTestBranding = process.env.UAT_TEST_BRANDING === "true";
const shouldTestReaderExperience = process.env.UAT_TEST_READER_EXPERIENCE === "true";
const expectedReaderPublishedVersionId = process.env.UAT_EXPECT_READER_PUBLISHED_VERSION_ID ?? "";
const expectedReaderPublishedVersionNumber = Number(process.env.UAT_EXPECT_READER_PUBLISHED_VERSION_NUMBER ?? "0");
if (shouldTestBranding && (mode !== "release" || expectedRole !== "admin")) {
  throw new Error("Branding UAT requires release mode and an admin of a disposable synthetic tenant.");
}
if (shouldTestRichEditor && (!shouldTestAuthoring || mode !== "release" || expectedRole !== "admin")) {
  throw new Error("Rich-editor UAT requires release mode, admin role, and UAT_TEST_AUTHORING=true.");
}
const outputDir = resolve(process.env.UAT_OUTPUT_DIR ?? join(root, "work/public-beta-uat"));
const shouldStartServer = !process.env.UAT_BASE_URL;
const baseUrl = process.env.UAT_BASE_URL ?? "http://127.0.0.1:4175/";
const tenantId = process.env.UAT_TENANT_ID ?? "";
const email = process.env.UAT_EMAIL ?? (isLocalUrl(baseUrl) ? "admin@example.test" : "");
const password = process.env.UAT_PASSWORD ?? (isLocalUrl(baseUrl) ? "local-dev-password" : "");
const expectedAttachmentFilename = process.env.UAT_EXPECT_ATTACHMENT_FILENAME ?? "";
const commitSha = commandOutput("git", ["rev-parse", "HEAD"]) ?? "";
const checks: CheckResult[] = [];
const consoleProblems: string[] = [];
const pageTraffic = new WeakMap<Page, { pending: Set<Request>; changedAt: number }>();
const expectedReaderFailures = new WeakMap<Page, Map<string, Set<number>>>();
const expectedReaderAborts = new WeakSet<Request>();
let server: Server | undefined;
let browser: Browser | undefined;

try {
  mkdirSync(outputDir, { recursive: true });

  if (shouldStartServer) {
    server = await startStaticDistServer(baseUrl);
  }

  browser = await chromium.launch({ headless: true });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  trackConsole(desktop);
  await checkPublicEntry(desktop, "desktop");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  trackConsole(mobile);
  await checkPublicEntry(mobile, "mobile");
  await mobile.close();

  if (shouldStartServer) await checkPublicBrowserBranding();

  if (mode === "release") {
    await checkReleaseFlow(desktop, "desktop");
    await checkBrowserCredentialLifetime(desktop, "desktop");

    const releaseMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    trackConsole(releaseMobile);
    await checkReleaseFlow(releaseMobile, "mobile");
    await checkBrowserCredentialLifetime(releaseMobile, "mobile");
    await releaseMobile.close();
  }

  if (consoleProblems.length) {
    throw new Error(`Browser console warnings/errors:\n${consoleProblems.join("\n")}`);
  }

  const report = {
    status: "pass",
    mode,
    expectedRole,
    expectedBrandName,
    baseUrl,
    commitSha,
    outputDir,
    checks,
    screenshots: checks
      .filter((check) => typeof check.detail === "string" && String(check.detail).endsWith(".png"))
      .map((check) => check.detail)
  };

  writeFileSync(join(outputDir, "public-beta-uat-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Public beta UAT OK (${mode}). Evidence: ${outputDir}`);
} catch (error) {
  writeFileSync(join(outputDir, "public-beta-uat-report.json"), `${JSON.stringify({ status: "fail", mode, expectedRole, expectedBrandName, baseUrl, commitSha, outputDir,
    error: error instanceof Error ? error.message : String(error), checks,
    screenshots: checks.filter(check => typeof check.detail === "string" && check.detail.endsWith(".png")).map(check => check.detail)
  }, null, 2)}\n`);
  throw error;
} finally {
  await browser?.close();
  await new Promise<void>((resolveClose) => server?.close(() => resolveClose()) ?? resolveClose());
}

function commandOutput(command: string, args: string[]): string | undefined {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  const output = (result.stdout ?? "").trim();

  return result.status === 0 && output ? output : undefined;
}

function parseMode(value: string | undefined): UatMode {
  if (!value || value === "public") {
    return "public";
  }

  if (value === "release") {
    return "release";
  }

  throw new Error("UAT_MODE must be public or release");
}

function parseExpectedRole(value: string | undefined): ExpectedRole {
  if (!value || value === "admin") {
    return "admin";
  }

  if (value === "reader") {
    return "reader";
  }

  throw new Error("UAT_EXPECT_ROLE must be admin or reader");
}

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

async function startStaticDistServer(urlString: string): Promise<Server> {
  const distDir = resolve(root, "apps/web/dist");
  const indexPath = join(distDir, "index.html");

  if (!existsSync(indexPath)) {
    throw new Error("apps/web/dist is missing. Run `npx -y pnpm@11.7.0 --filter @forgetbase/web build` before `test:uat`.");
  }

  const url = new URL(urlString);
  const port = Number(url.port || "4175");
  const hostname = url.hostname;
  const mimeTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };

  const staticServer = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", url);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
    const candidatePath = resolve(distDir, `.${normalizedPath}`);
    const safePath = candidatePath.startsWith(distDir) && existsSync(candidatePath) && statSync(candidatePath).isFile()
      ? candidatePath
      : indexPath;
    const body = readFileSync(safePath);

    response.writeHead(200, {
      "content-type": mimeTypes[extname(safePath)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    staticServer.once("error", rejectListen);
    staticServer.listen(port, hostname, () => {
      staticServer.off("error", rejectListen);
      resolveListen();
    });
  });

  return staticServer;
}

function trackConsole(page: Page): void {
  const traffic = { pending: new Set<Request>(), changedAt: Date.now() };
  pageTraffic.set(page, traffic);
  page.on("request", (request) => {
    traffic.pending.add(request);
    traffic.changedAt = Date.now();
  });
  const finished = (request: Request) => {
    traffic.pending.delete(request);
    traffic.changedAt = Date.now();
  };
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      const expectedStatuses = expectedReaderFailures.get(page)?.get(message.location().url);
      const resourceStatus = Number(/\bstatus(?: of)?\s+(\d{3})\b/.exec(message.text())?.[1]);
      if (message.type() === "error" && expectedStatuses?.has(resourceStatus) && /Failed to load resource/.test(message.text())) return;
      let resourcePath = "";
      try { resourcePath = new URL(message.location().url).pathname.slice(0, 240); } catch { /* Console messages can omit their location. */ }
      consoleProblems.push(`${message.type()}: ${message.text()}${resourcePath ? ` (${resourcePath})` : ""}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleProblems.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();

    if (!url.startsWith(baseUrl)) {
      return;
    }
    if (expectedReaderAborts.has(request) && /ERR_ABORTED/.test(request.failure()?.errorText ?? "")) return;

    consoleProblems.push(`requestfailed: ${request.method()} ${url} ${request.failure()?.errorText ?? ""}`.trim());
  });
}

async function checkPublicEntry(page: Page, viewportName: "desktop" | "mobile"): Promise<void> {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  if (!shouldStartServer && viewportName === "desktop") {
    await assertProtectedSessionApiRequiresAuthentication(page, `${viewportName}: protected session API requires authentication`);
  }

  await expectText(page, "h1", `Log in to ${expectedBrandName}`, `${viewportName}: login h1`);
  await expectTitle(page, `${expectedBrandName} | Knowledge Base for People and AI Tools`, `${viewportName}: page title`);
  await expectVisibleText(page, "Use your account to read pages or manage the knowledge base.", `${viewportName}: login description`);
  await page.waitForSelector(".login-panel", { timeout: 15000 });
  await page.waitForSelector(".public-login-form", { timeout: 15000 });
  await page.waitForSelector("#login-email", { timeout: 15000 });
  await page.waitForSelector("#login-password", { timeout: 15000 });
  await expectHiddenText(page, "A knowledge base for people and AI tools.", `${viewportName}: marketing h1 removed`);
  await expectHiddenText(page, "Write and organize company knowledge once.", `${viewportName}: marketing lede removed`);
  await expectHiddenText(page, "Separate reader and admin views", `${viewportName}: marketing trust badge removed`);
  await assertNoJargon(page, "main", `${viewportName}: public copy`);
  await assertNoHorizontalOverflow(page, `${viewportName}: public overflow`);
  await assertNoClippedText(page, `${viewportName}: public clipped text`);
  await screenshot(page, `login-${viewportName}.png`, `${viewportName}: login screenshot`);
}

async function checkReleaseFlow(page: Page, viewportName: "desktop" | "mobile"): Promise<void> {
  if (!email || !password) {
    throw new Error("Release UAT requires UAT_EMAIL and UAT_PASSWORD unless UAT_BASE_URL is localhost.");
  }

  await applyTenantOverride(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator(".public-login-form button[type='submit']").click();
  await page.waitForSelector(".app-shell.reader-shell", { timeout: 15000 });
  if (shouldTestReaderExperience) await checkReaderPublicationBoundary(page, viewportName);
  const readerPageNavigation = viewportName === "desktop" ? page.locator(".reader-library") : page.getByRole("button", { name: "Open pages", exact: true });
  await readerPageNavigation.waitFor({ state: "visible", timeout: 15000 });
  checks.push({ name: `release ${viewportName}: reader page navigation`, status: "pass" });
  if (viewportName === "desktop") {
    await page.locator(".topbar").getByRole("button", { name: "Search pages", exact: true }).waitFor({ state: "visible" });
    checks.push({ name: `release ${viewportName}: reader search shortcut`, status: "pass" });
  }
  if (viewportName === "mobile") {
    await assertMobileReaderNavigation(page, `release ${viewportName}: reader pages drawer`);
  }
  await assertReaderNestedNavigation(page, `release ${viewportName}: reader nested navigation`);
  await selectReaderPageForUat(page, "Reader Access and Export Rules");
  await page.locator(".reader-article").scrollIntoViewIfNeeded();
  await expectText(page, ".reader-article-header h1", "Reader Access and Export Rules", `release ${viewportName}: reader article title`);
  await expectVisibleText(page, "Attachments", `release ${viewportName}: reader attachments panel`);
  if (expectedAttachmentFilename) {
    await assertAttachmentDownload(page, expectedAttachmentFilename, `release ${viewportName}: reader attachment download`);
  }
  await assertReaderArticleDepth(page, `release ${viewportName}: reader article depth`);
  await assertReaderSectionNavigation(page, `release ${viewportName}: reader section navigation`);
  await assertReaderSourceFields(page, `release ${viewportName}: reader source fields`);
  if (viewportName === "desktop") {
    await screenshot(page, "page-browse-tree.png", "release desktop: reader page tree screenshot");
    await screenshot(page, "page-read-view.png", "release desktop: reader page read screenshot");
  }
  await openReaderAsk(page);
  await page.locator("#reader-ask-input").fill("What should be redacted?");
  await page.locator(".reader-ask-form button[type='submit']").click();
  await page.waitForSelector(".reader-ask-answer", { timeout: 15000 });
  await expectVisibleText(page, "Answer", `release ${viewportName}: reader ask answer`);
  await expectVisibleText(page, "Sources", `release ${viewportName}: reader ask sources`);
  await page.waitForSelector(".reader-citation", { timeout: 15000 });
  await assertNoClippedText(page, `release ${viewportName}: reader ask clipped text`);
  await screenshot(
    page,
    viewportName === "desktop" ? "ask-with-sources.png" : "ask-with-sources-mobile.png",
    `release ${viewportName}: ask with sources screenshot`
  );
  await closeReaderDialog(page, "Ask the knowledge base");
  await openReaderSearch(page);
  await page.locator("#reader-search-input").fill("personal data");
  await page.locator("#reader-search-input").press("Enter");
  await page.waitForSelector(".reader-search-results", { timeout: 15000 });
  await page.waitForSelector(".reader-search-result", { timeout: 15000 });
  await expectVisibleText(page, "Results for", `release ${viewportName}: reader search heading`);
  await assertReaderSearchResults(page, `release ${viewportName}: reader search results`);
  await assertElementInViewport(page, ".reader-search-results", `release ${viewportName}: reader search results in view`);
  if (viewportName === "desktop") {
    await screenshot(page, "search-results.png", "release desktop: reader search results screenshot");
  }
  await assertSearchResultOpensPage(page, `release ${viewportName}: reader search result opens page`);
  // Authored titles, documents, instructions and source values retain their
  // technical terms. This copy guard checks application-owned labels only.
  await assertNoJargon(page, [
    ".reader-topbar-search", ".reader-ask-shortcut", ".reader-mobile-nav-trigger",
    ".nav-collapse-button", ".nav-chrome-label", ".nav-resizer",
    ".reader-source-trigger", ".reader-source-choice > label", ".reader-publication-label",
    ".reader-search-return", ".reader-section-nav > summary", ".reader-contents-ask"
  ], `release ${viewportName}: reader application labels`);
  await assertNoHorizontalOverflow(page, `release ${viewportName}: reader overflow`);
  await assertNoClippedText(page, `release ${viewportName}: reader clipped text`);
  if (viewportName === "desktop" && expectedRole === "reader") {
    await openReaderAsk(page);
    await page.locator("#reader-ask-input").fill("credential vault escalation");
    await page.locator(".reader-ask-form button[type='submit']").click();
    await expectVisibleText(page, "No matching sources", "release desktop: no accessible sources badge");
    await expectVisibleText(page, "No accessible answer was found", "release desktop: restricted result note");
    await assertNoHorizontalOverflow(page, "release desktop: restricted result overflow");
    await assertNoClippedText(page, "release desktop: restricted result clipped text");
    await screenshot(page, "no-access-restricted-state.png", "release desktop: restricted result screenshot");
    await closeReaderDialog(page, "Ask the knowledge base");
  }
  if (shouldTestReaderExperience) await checkReaderExperienceFlow(page, viewportName);
  await screenshot(page, `reader-${viewportName}.png`, `release ${viewportName}: reader screenshot`);

  if (expectedRole === "reader") {
    await assertReaderHasNoAdminControls(page, `release ${viewportName}: reader has no admin controls`);
    await page.goto(routeUrl(page, "admin/system/settings"), { waitUntil: "domcontentloaded" });
    await expectVisibleText(page, "This area is unavailable for your account", `release ${viewportName}: reader direct admin route denied`);
    await assertReaderHasNoAdminControls(page, `release ${viewportName}: denied route exposes no admin controls`);
    await page.getByRole("button", { name: "Back to pages", exact: true }).click();
    await page.waitForSelector(".reader-overview, .reader-article", { timeout: 10000 });
    await expectHash(page, "#reader", `release ${viewportName}: denied route returns to reader`);
    return;
  }

  if (viewportName === "mobile") {
    await checkMobileAdminShell(page);
    return;
  }

  await page.goto(routeUrl(page, "admin/content"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".side-nav", { timeout: 10000 });
  await expectHash(page, "#admin/content", "release: admin canonical content route");
  await expectVisibleText(page, "Manage ForgetBase", "release: admin console shell title");
  await assertLegacyAdminHashCanonicalizes(page);
  await expectVisibleText(page, "Content", "release: admin content label");
  await expectVisibleText(page, "Reviews", "release: admin reviews label");
  await expectVisibleText(page, "Exports", "release: admin exports label");
  await expectVisibleText(page, "System", "release: admin system label");
  await page.getByRole("searchbox", { name: "Search pages", exact: true }).fill("Reader Access and Export Rules");
  await page.getByRole("button", { name: "Reader Access and Export Rules", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Open page", exact: true }).click();
  await expectVisibleText(page, "Page files", "release: content drawer opens governed page and attachment controls");
  await assertNoHorizontalOverflow(page, "release: admin desktop overflow");
  await assertNoClippedText(page, "release: admin desktop clipped text");
  await screenshot(page, "admin-desktop.png", "release: admin screenshot");
  if (shouldTestAuthoring) {
    await checkAdminPageAuthoring(page);
    if (shouldTestRichEditor) await checkRichEditorAuthoring(page);
  }
  if (shouldTestBranding) await checkAdminBranding(page);
  await screenshotAdminRoute(page, "admin/reviews", "Review queue", "reviews.png", "release: admin reviews screenshot");
  await screenshotAdminRoute(page, "admin/system/activity", "Search activity", "analytics.png", "release: admin analytics screenshot");
  await expectVisibleText(page, "Content health", "release: admin analytics content health");
  await expectVisibleText(page, "90 days", "release: admin analytics window controls");
  await screenshotAdminRoute(page, "admin/system/policies", "Telemetry retention", "policies.png", "release: admin policies screenshot");
  await screenshotAdminRoute(page, "admin/system/access", "Users", "access-management.png", "release: admin access screenshot");
  await screenshotAdminRoute(page, "admin/system/approvals", "Action execution", "approvals.png", "release: admin approvals screenshot");
  await screenshotExportRoute(page);
}

function readerProof(condition: unknown, name: string, detail?: string | number | boolean): asserts condition {
  if (!condition) throw new Error(`${name}${detail === undefined ? "" : `: ${detail}`}`);
  checks.push({ name, status: "pass", ...(detail === undefined ? {} : { detail }) });
}

async function openReaderSearch(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Search pages", exact: true });
  if (!await dialog.isVisible()) await page.locator(".topbar").getByRole("button", { name: "Search pages", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  return dialog;
}

async function openReaderAsk(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Ask the knowledge base", exact: true });
  if (!await dialog.isVisible()) await page.getByRole("button", { name: "Ask", exact: true }).click();
  await dialog.waitFor({ state: "visible" });
  return dialog;
}

async function closeReaderDialog(page: Page, title: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: title, exact: true, includeHidden: true });
  if (await dialog.isVisible()) {
    await page.keyboard.press("Escape");
  }
  // Hidden can precede Radix's close-auto-focus callback during exit animation.
  await dialog.waitFor({ state: "detached" });
  await page.evaluate(() => new Promise<void>(resolvePromise => {
    const animations = document.getAnimations().filter(animation => animation.playState === "running");
    void Promise.all(animations.map(animation => animation.finished.catch(() => undefined))).then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise())));
  }));
}

async function readerNavigation(page: Page): Promise<Locator> {
  const trigger = page.getByRole("button", { name: "Open pages", exact: true });
  if (await trigger.isVisible()) {
    const drawer = page.getByRole("dialog", { name: "Pages", exact: true });
    if (!await drawer.isVisible()) await trigger.click();
    await drawer.waitFor({ state: "visible" });
    return drawer;
  }
  return page.locator(".reader-library");
}

async function readerApiUrl(page: Page, path: string): Promise<string> {
  const apiBase = await page.evaluate(() => window.localStorage.getItem("forgetbase-api-url") ?? "/api");
  return new URL(path.replace(/^\//, ""), new URL(`${apiBase.replace(/\/$/, "")}/`, baseUrl)).href;
}

async function readerApiGet(page: Page, path: string) {
  return page.context().request.get(await readerApiUrl(page, path), { headers: { accept: "application/json", "x-forgetbase-surface": "web" } });
}

async function readerApiAsk(page: Page, query: string) {
  const url = await readerApiUrl(page, "/agent/query");
  const csrf = (await page.context().cookies(url)).find(cookie => cookie.name === "forgetbase_csrf");
  return page.context().request.post(url, { headers: { "x-forgetbase-surface": "web", ...(csrf ? { "x-forgetbase-csrf": decodeURIComponent(csrf.value) } : {}) },
    data: { query, limit: 5, mode: "deterministic-retrieval", cache: false } });
}

async function openReaderStablePage(page: Page, stableId: string): Promise<void> {
  await waitForSettledRequests(page, "reader page navigation");
  const url = new URL(page.url());
  url.searchParams.set("page", stableId);
  url.hash = "reader";
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
}

async function checkReaderPublicationBoundary(page: Page, viewportName: string): Promise<void> {
  const label = `reader real-stack ${viewportName}`;
  const response = await readerApiGet(page, `/assets/${encodeURIComponent(readerFixture.policyId)}`);
  readerProof(response.status() === 200, `${label}: ordinary published detail is readable`);
  const detail = assetDetailSchema.parse(await response.json());
  readerProof(Boolean(expectedReaderPublishedVersionId) && Number.isInteger(expectedReaderPublishedVersionNumber) && expectedReaderPublishedVersionNumber > 0, `${label}: independent publication receipt was supplied by fixture seeding`);
  const serialized = JSON.stringify(detail);
  readerProof(detail.asset.title === readerFixture.title && detail.humanDocuments[0]?.body === readerPolicyBody, `${label}: published title and body survive newer draft`);
  readerProof(detail.asset.currentVersionId === expectedReaderPublishedVersionId && detail.asset.publishedVersionId === expectedReaderPublishedVersionId && detail.versions.length === 1 && detail.versions[0]?.id === expectedReaderPublishedVersionId && detail.versions[0]?.versionNumber === expectedReaderPublishedVersionNumber &&
    detail.humanDocuments.every(source => source.versionId === expectedReaderPublishedVersionId) && detail.instructionObjects.every(source => source.versionId === expectedReaderPublishedVersionId), `${label}: detail/version/source IDs match independent publish receipt exactly`);
  readerProof(!serialized.includes(readerFixture.draftToken), `${label}: draft title/body/metadata/instruction absent from response`);
  readerProof(detail.asset.allowedExports.length === 0 && detail.asset.allowedActions.length === 0, `${label}: published metadata lists no export packages or actions; existing enforcement gates remain independent`);
  await openReaderStablePage(page, readerFixture.policyId);
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  readerProof((await page.locator(".reader-document-body").innerText()).includes(readerFixture.publishedToken), `${label}: rendered body is the publication`);
  readerProof(!(await page.locator("main").innerText()).includes(readerFixture.draftToken), `${label}: rendered consumer has no draft sentinel`);

  const search = await readerApiGet(page, `/search?${new URLSearchParams({ query: readerFixture.query, limit: "8" })}`);
  readerProof(search.status() === 200, `${label}: real close-match search succeeds`);
  const searchData = searchResponseSchema.parse(await search.json());
  const policyResults = searchData.results.filter(result => result.asset.stableId === readerFixture.policyId);
  readerProof(policyResults.length >= 2 && searchData.results.some(result => result.asset.stableId === readerFixture.checklistId), `${label}: close-match retrieval returns policy passages and distinct checklist`);
  readerProof(policyResults.every(result => result.citation.versionId === expectedReaderPublishedVersionId) && !JSON.stringify(searchData).includes(readerFixture.draftToken), `${label}: search cites independent publication receipt without draft leakage`);

  const askResponse = await readerApiAsk(page, readerFixture.ask);
  readerProof(askResponse.status() === 200, `${label}: real single-query Ask succeeds`);
  const ask = managedQueryResponseSchema.parse(await askResponse.json());
  readerProof(ask.mode === "deterministic-retrieval" && ask.generation.provider === null && ask.citations.some(citation => citation.stableId === readerFixture.policyId && citation.versionId === expectedReaderPublishedVersionId), `${label}: returned Ask evidence is deterministic and matches publication receipt`);
  readerProof(!JSON.stringify(ask).includes(readerFixture.draftToken), `${label}: Ask does not disclose the newer draft`);
  const control = JSON.parse(process.env.UAT_READER_RESTRICTED_CONTROL ?? "{}") as { stableId?: string; searchMatches?: number; askMatches?: number };
  readerProof(control.stableId === readerFixture.restrictedId && Number(control.searchMatches) > 0 && Number(control.askMatches) > 0, `${label}: authorized restricted retrieval positive control was captured before reader UAT`);
  const restrictedSearchResponse = await readerApiGet(page, `/search?${new URLSearchParams({ query: readerFixture.restrictedToken, limit: "8" })}`);
  const restrictedAskResponse = await readerApiAsk(page, readerFixture.restrictedToken);
  readerProof(restrictedSearchResponse.status() === 200 && restrictedAskResponse.status() === 200, `${label}: unique restricted query exercises real Search and Ask`);
  const restrictedSearch = searchResponseSchema.parse(await restrictedSearchResponse.json());
  const restrictedAsk = managedQueryResponseSchema.parse(await restrictedAskResponse.json());

  if (expectedRole === "reader") {
    const denied = await readerApiGet(page, `/assets/${encodeURIComponent(readerFixture.restrictedId)}`);
    const missing = await readerApiGet(page, `/assets/${encodeURIComponent(readerFixture.missingId)}`);
    readerProof([403, 404].includes(denied.status()) && missing.status() === 404, `${label}: restricted and missing real sources reject reader access`);
    readerProof(!(await denied.text()).includes(readerFixture.restrictedToken), `${label}: denied response has no restricted body`);
    readerProof(!JSON.stringify(searchData).includes(readerFixture.restrictedToken) && !JSON.stringify(ask).includes(readerFixture.restrictedToken), `${label}: retrieval has no restricted title/body sentinel`);
    // The deterministic no-result answer echoes the question once. That user-
    // supplied echo is not retrieved content and must not count as a leak.
    const returned = JSON.stringify({ results: restrictedSearch.results, askResults: restrictedAsk.results, citations: restrictedAsk.citations, answer: restrictedAsk.answer.replace(readerFixture.restrictedToken, "") });
    readerProof(restrictedSearch.results.length === 0 && restrictedAsk.results.length === 0 && restrictedAsk.citations.length === 0 && !returned.includes(readerFixture.restrictedId) && !returned.includes("Private Riverstone Review Notes") && !returned.includes(readerFixture.restrictedToken), `${label}: reader excludes known matching restricted record/body/citations from unique-query retrieval`);
  } else {
    readerProof(restrictedSearch.results.some(result => result.asset.stableId === readerFixture.restrictedId && result.citation.snippet.includes(readerFixture.restrictedToken)) && restrictedAsk.citations.some(citation => citation.stableId === readerFixture.restrictedId && citation.snippet.includes(readerFixture.restrictedToken)), `${label}: authenticated authorized positive control retrieves the restricted source`);
  }
  await screenshot(page, `reader-publication-${viewportName}.png`, `${label}: published-with-newer-draft screenshot`);
}

async function submitReaderSearch(page: Page, query: string) {
  const dialog = await openReaderSearch(page);
  await dialog.locator("#reader-search-input").fill(query);
  const result = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/search") && new URL(response.url()).searchParams.get("query") === query);
  await dialog.locator("#reader-search-input").press("Enter");
  const response = await result;
  readerProof(response.status() === 200 && new URL(response.url()).searchParams.get("limit") === "8", "reader search: submitted remote query uses existing limit");
  const data = searchResponseSchema.parse(await response.json());
  await dialog.locator(".reader-search-results").waitFor({ state: "visible" });
  return { dialog, data };
}

async function submitReaderAsk(page: Page, query: string) {
  const dialog = await openReaderAsk(page);
  await dialog.locator("#reader-ask-input").fill(query);
  const result = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/agent/query") && response.request().postDataJSON()?.query === query);
  await dialog.locator(".reader-ask-form button[type='submit']").click();
  const response = await result;
  const input = response.request().postDataJSON() as Record<string, unknown>;
  readerProof(Object.keys(input).sort().join(",") === "cache,limit,mode,query" && input.limit === 5 && input.mode === "deterministic-retrieval" && input.cache === false,
    "reader Ask: single-query request preserves limit/mode/cache and has no conversation/provider fields");
  readerProof(response.status() === 200, "reader Ask: submitted query succeeds");
  const data = managedQueryResponseSchema.parse(await response.json());
  await dialog.locator(".reader-ask-answer").waitFor({ state: "visible" });
  return { dialog, data };
}

async function assertReaderDialogFocus(page: Page, title: string, trigger: Locator, label: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.waitFor({ state: "visible" });
  readerProof(await dialog.evaluate(element => element.contains(document.activeElement)), `${label}: initial focus enters named dialog`);
  const focusEdge = async (last: boolean) => dialog.evaluate((element, useLast) => {
    const items = Array.from(element.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"))
      .filter(item => item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0 && !item.closest("[aria-hidden='true']"));
    const item = useLast ? items.at(-1) : items[0];
    item?.focus();
    return Boolean(item);
  }, last);
  readerProof(await focusEdge(true), `${label}: dialog has usable controls`);
  await page.keyboard.press("Tab");
  readerProof(await dialog.evaluate(element => element.contains(document.activeElement)), `${label}: forward Tab stays inside dialog`);
  await focusEdge(false);
  await page.keyboard.press("Shift+Tab");
  readerProof(await dialog.evaluate(element => element.contains(document.activeElement)), `${label}: reverse Tab stays inside dialog`);
  await closeReaderDialog(page, title);
  const restored = await trigger.evaluate(element => ({ focused: element === document.activeElement,
    activeId: document.activeElement?.id ?? "", activeTag: document.activeElement?.tagName ?? "",
    activeText: document.activeElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "" }));
  if (!restored.focused) throw new Error(`${label}: Escape did not restore trigger focus after settled dismissal: ${JSON.stringify(restored)}`);
  readerProof(true, `${label}: Escape closes and restores trigger focus`, JSON.stringify(restored));
}

async function assertSettledReaderArticleFocus(page: Page, label: string): Promise<void> {
  await waitForSettledRequests(page, "article navigation focus");
  await page.evaluate(() => new Promise<void>(resolvePromise => {
    const animations = document.getAnimations().filter(animation => animation.playState === "running");
    void Promise.all(animations.map(animation => animation.finished.catch(() => undefined))).then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise())));
  }));
  const position = await page.locator("#reader-page-title").evaluate(element => {
    const title = element.getBoundingClientRect();
    const header = document.querySelector(".topbar")?.getBoundingClientRect();
    const visibleHeaderBottom = header && header.bottom > 0 && header.top < window.innerHeight ? header.bottom : 0;
    return { focused: element === document.activeElement, activeId: document.activeElement?.id ?? "", activeTag: document.activeElement?.tagName ?? "",
      activeText: document.activeElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "",
      titleTop: title.top, titleBottom: title.bottom, visibleHeaderBottom, viewportHeight: window.innerHeight };
  });
  readerProof(position.focused && position.titleTop >= position.visibleHeaderBottom - 2 && position.titleBottom > position.visibleHeaderBottom && position.titleTop < position.viewportHeight,
    `${label}: destination title retains focus and remains visible below the header after sheet close and render settling`, JSON.stringify(position));
}

async function checkReaderExperienceFlow(page: Page, viewportName: string): Promise<void> {
  const label = `reader E2E ${viewportName}`;
  const overview = new URL(page.url());
  overview.searchParams.delete("page");
  overview.searchParams.set("reader-proof", "retained");
  overview.hash = "reader";
  await waitForSettledRequests(page, "reader overview navigation");
  await page.goto(overview.href, { waitUntil: "domcontentloaded" });
  await page.locator(".reader-overview").waitFor({ state: "visible" });
  readerProof(!new URL(page.url()).searchParams.has("page"), `${label}: absent page shows overview without silently selecting a page`);
  readerProof(!(await page.locator("main").innerText()).includes(readerFixture.draftToken), `${label}: overview does not expose newer draft metadata`);
  await screenshot(page, `reader-overview-${viewportName}.png`, `${label}: overview screenshot`);
  await openReaderStablePage(page, "guideline.reader-footer-configuration");
  await page.getByRole("heading", { name: "Reader Footer Configuration Guide", exact: true, level: 1 }).waitFor();
  await assertReaderSourceFields(page, `${label}: custom field order and omitted version`);

  await openReaderStablePage(page, readerFixture.policyId);
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  const detail = assetDetailSchema.parse(await (await readerApiGet(page, `/assets/${readerFixture.policyId}`)).json());
  const source = page.getByLabel("Readable source", { exact: true });
  await source.waitFor({ state: "visible" });
  readerProof((await source.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).includes(detail.instructionObjects[0]!.id), `${label}: mixed source choices preserve actual instruction identity`);
  await source.selectOption(detail.instructionObjects[0]!.id);
  await page.locator(".reader-document-body").getByText(readerFixture.instructionToken, { exact: false }).waitFor();
  readerProof(!(await page.locator(".reader-document-body").innerText()).includes(readerFixture.publishedToken), `${label}: selected instruction stays separate from human page`);
  await source.selectOption(detail.humanDocuments[0]!.id);
  await page.locator(".reader-document-body").getByText(readerFixture.publishedToken, { exact: false }).waitFor();
  await assertReaderReadingFidelity(page, `${label}: long article`, viewportName);

  const navigation = await readerNavigation(page);
  const parent = navigation.getByRole("button", { name: "Expand Riverstone sharing policy pages", exact: true });
  if (await parent.isVisible()) await parent.click();
  const checklistLink = navigation.getByRole("link", { name: "Riverstone sharing checklist", exact: true });
  const href = await checklistLink.getAttribute("href");
  const target = new URL(href ?? "", page.url());
  readerProof(target.searchParams.get("page") === readerFixture.checklistId && target.searchParams.get("reader-proof") === "retained" && target.hash === "#reader", `${label}: real nested anchor preserves stable ID, unrelated query and route`);
  await waitForSettledRequests(page, "reader nested-link navigation");
  await checklistLink.click();
  await page.getByRole("heading", { name: readerFixture.checklistTitle, exact: true, level: 1 }).waitFor();
  await page.getByRole("dialog", { name: "Pages", exact: true }).waitFor({ state: "hidden" });
  await assertSettledReaderArticleFocus(page, `${label}: nested page navigation`);
  await waitForSettledRequests(page, "reader history Back");
  await page.goBack();
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  await waitForSettledRequests(page, "reader history Forward");
  await page.goForward();
  await page.getByRole("heading", { name: readerFixture.checklistTitle, exact: true, level: 1 }).waitFor();
  await waitForSettledRequests(page, "reader deep-link reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: readerFixture.checklistTitle, exact: true, level: 1 }).waitFor();
  readerProof(new URL(page.url()).searchParams.get("page") === readerFixture.checklistId, `${label}: Back/Forward/reload retain requested stable identity`);

  const searchTrigger = page.locator(".topbar").getByRole("button", { name: "Search pages", exact: true });
  await searchTrigger.focus();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.getByRole("dialog", { name: "Search pages", exact: true }).waitFor({ state: "visible" });
  await assertReaderDialogFocus(page, "Search pages", searchTrigger, `${label}: keyboard search`);
  const { dialog: searchDialog, data: search } = await submitReaderSearch(page, readerFixture.query);
  const groupedIds = [...new Set(search.results.map(result => result.asset.stableId))].slice(0, 5);
  const rows = searchDialog.locator(".reader-search-result");
  readerProof(await rows.count() === groupedIds.length, `${label}: real passage results are grouped into distinct page cards`);
  for (const stableId of groupedIds) {
    const row = searchDialog.locator(`.reader-search-result[data-stable-id='${stableId}']`);
    const matches = search.results.filter(result => result.asset.stableId === stableId);
    await row.waitFor({ state: "visible" });
    readerProof((await row.innerText()).includes(`${matches.length} returned match`), `${label}: ${stableId} count refers to returned passages`);
    const rowText = await row.textContent() ?? "";
    readerProof(matches.every(match => rowText.includes(match.citation.chunkId)), `${label}: ${stableId} retains inspectable passage identities`);
  }
  const checklist = searchDialog.locator(`.reader-search-result[data-stable-id='${readerFixture.checklistId}']`);
  await checklist.getByRole("link", { name: "Open page", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: readerFixture.checklistTitle, exact: true, level: 1 }).waitFor();
  await searchDialog.waitFor({ state: "hidden" });
  await assertSettledReaderArticleFocus(page, `${label}: same-page search selection`);
  await assertReaderSearchReturnVisible(page, `${label}: same-page search selection`);
  await openReaderSearch(page);
  readerProof(await page.locator("#reader-search-input").inputValue() === readerFixture.query && await checklist.isVisible(), `${label}: source→search restores submitted query and results`);
  await page.locator("#reader-search-input").focus();
  await page.keyboard.press("ArrowDown");
  readerProof(await searchDialog.evaluate(element => {
    const active = document.activeElement;
    const descendant = active?.getAttribute("aria-activedescendant");
    return Boolean(active?.closest(".reader-search-result") || (descendant && element.querySelector(`[id='${descendant}']`)?.closest(".reader-search-result")));
  }), `${label}: ArrowDown moves selection from input into results`);
  await screenshot(page, `reader-search-${viewportName}.png`, `${label}: real close-match search screenshot`);
  await closeReaderDialog(page, "Search pages");

  await openReaderStablePage(page, readerFixture.instructionId);
  await page.getByRole("heading", { name: readerFixture.instructionTitle, exact: true, level: 1 }).waitFor();
  const instruction = assetDetailSchema.parse(await (await readerApiGet(page, `/assets/${readerFixture.instructionId}`)).json());
  readerProof(instruction.humanDocuments.length === 0 && instruction.instructionObjects.length > 0, `${label}: fixture proves instruction-only data`);
  const instructionText = await page.locator(".reader-document-body").textContent() ?? "";
  readerProof(instructionText.includes(readerFixture.instructionToken) && instructionText.includes("Use only accessible published sources.") && instructionText.includes("Ask the synthetic information owner."), `${label}: instruction body, constraints and escalation are readable`);
  readerProof(await page.evaluate(() => !(window as Window & { readerFixtureExecuted?: boolean }).readerFixtureExecuted), `${label}: structured instruction HTML remains escaped`);
  const inputContract = page.locator(".reader-contract").filter({ hasText: "Inspect input contract" });
  await inputContract.locator("summary").click();
  readerProof((await inputContract.locator("code").textContent() ?? "").includes("<script>window.readerFixtureExecuted=true</script>"), `${label}: input contract preserves escaped structured data`);
  readerProof(await page.locator(".reader-instruction").getAttribute("data-source-id") === instruction.instructionObjects[0]!.id, `${label}: instruction view carries actual source identity`);
  await screenshot(page, `reader-instruction-${viewportName}.png`, `${label}: instruction-only screenshot`);
  for (const [stableId, title, literal] of [[readerFixture.htmlId, "Synthetic HTML source", "<h2>RIVERSTONE_ESCAPED_HTML</h2>"], [readerFixture.plainId, "Synthetic plain-text source", "**Keep these literal markers.**"]] as const) {
    await openReaderStablePage(page, stableId);
    await page.getByRole("heading", { name: title, exact: true, level: 1 }).waitFor();
    readerProof((await page.locator(".reader-document-body").textContent() ?? "").includes(literal) && await page.locator(".reader-document-body script, .reader-document-body h2").count() === 0,
      `${label}: ${stableId} renders literal escaped source without executing HTML or Markdown`);
    readerProof(await page.evaluate(() => !(window as Window & { readerFixtureExecuted?: boolean }).readerFixtureExecuted), `${label}: ${stableId} has no script side effect`);
  }

  await openReaderStablePage(page, readerFixture.policyId);
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  const sourceTrigger = page.getByRole("button", { name: "Source details", exact: true });
  await sourceTrigger.click();
  const sourceDialog = page.getByRole("dialog", { name: "Source details", exact: true });
  readerProof((await sourceDialog.innerText()).includes(detail.asset.ownerId) && !(await sourceDialog.innerText()).includes(readerFixture.draftToken), `${label}: source metadata uses actual published owner and excludes draft`);
  await assertReaderDialogFocus(page, "Source details", sourceTrigger, `${label}: source details`);

  const { dialog: askDialog, data: ask } = await submitReaderAsk(page, readerFixture.ask);
  readerProof(ask.mode === "deterministic-retrieval" && ask.generation.status === "not-requested" && ask.generation.provider === null && ask.citations.length > 0, `${label}: UI Ask response establishes deterministic evidence`);
  readerProof(!JSON.stringify(ask).includes(readerFixture.draftToken), `${label}: UI Ask stays on approved sources`);
  const policyCitation = askDialog.locator(".reader-citation").filter({ hasText: readerFixture.title }).first();
  await policyCitation.waitFor({ state: "visible" });
  if (await policyCitation.getAttribute("open") === null) await policyCitation.locator("summary").first().click();
  await policyCitation.getByText("Current published version", { exact: false }).waitFor({ state: "visible" });
  readerProof((await policyCitation.textContent() ?? "").includes(ask.citations.find(citation => citation.stableId === readerFixture.policyId)!.snippet), `${label}: citation displays supplied excerpt`);
  await policyCitation.getByRole("link", { name: "Open source page", exact: true }).click();
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  await askDialog.waitFor({ state: "hidden" });
  await assertSettledReaderArticleFocus(page, `${label}: same-page citation navigation`);
  await openReaderAsk(page);
  readerProof(await page.locator("#reader-ask-input").inputValue() === readerFixture.ask && await page.locator(".reader-ask-answer").isVisible(), `${label}: citation→source→Ask restores question and answer`);
  await screenshot(page, `reader-ask-${viewportName}.png`, `${label}: real deterministic Ask screenshot`);
  const askTrigger = page.locator(".topbar").getByRole("button", { name: "Ask", exact: true, includeHidden: true });
  await assertReaderDialogFocus(page, "Ask the knowledge base", askTrigger, `${label}: Ask keyboard`);

  await checkReaderCitationFixtures(page, ask, viewportName);
  const noAnswer = await submitReaderAsk(page, readerFixture.noAnswer);
  readerProof(noAnswer.data.citations.length === 0 && noAnswer.data.checks.resultCount === 0, `${label}: real unanswerable question has no supported sources`);
  readerProof(!(await noAnswer.dialog.textContent() ?? "").includes(readerFixture.publishedToken), `${label}: previous supported answer does not survive unanswerable query`);
  await closeReaderDialog(page, "Ask the knowledge base");
  if (expectedRole === "reader") await checkReaderUnavailablePages(page, viewportName);
  await openReaderStablePage(page, readerFixture.policyId);
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  await page.locator(".reader-breadcrumb").getByRole("link", { name: "Overview", exact: true }).click();
  await page.locator(".reader-overview").waitFor({ state: "visible" });
  await assertSettledReaderArticleFocus(page, `${label}: Overview navigation`);
  await page.locator(".reader-overview-source").filter({ has: page.getByRole("heading", { name: "Riverstone sharing policy", exact: true }) }).click();
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  await assertSettledReaderArticleFocus(page, `${label}: Overview source navigation`);
  if (viewportName === "desktop") await checkReaderControlledStates(page);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openReaderSearch(page);
  await assertReaderDialogFocus(page, "Search pages", searchTrigger, `${label}: forced-colors search`);
  await assertNoHorizontalOverflow(page, `${label}: forced-colors overflow`);
  await screenshot(page, `reader-forced-colors-${viewportName}.png`, `${label}: forced-colors screenshot for parent visual review`);
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  if (viewportName === "desktop") {
    await page.setViewportSize({ width: 820, height: 900 });
    await assertMobileReaderNavigation(page, `${label}: 820px navigation breakpoint`);
    const drawer = await readerNavigation(page);
    await drawer.getByRole("link", { name: "Riverstone sharing policy", exact: true }).click();
    await page.getByRole("dialog", { name: "Pages", exact: true }).waitFor({ state: "hidden" });
    await assertSettledReaderArticleFocus(page, `${label}: 820px same-page drawer navigation`);
    await assertNoHorizontalOverflow(page, `${label}: 820px drawer/article overflow`);
    await screenshot(page, "reader-820px.png", `${label}: 820px responsive screenshot`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  if (viewportName === "mobile") {
    const pagesTrigger = page.getByRole("button", { name: "Open pages", exact: true });
    await pagesTrigger.click();
    await assertReaderDialogFocus(page, "Pages", pagesTrigger, `${label}: mobile pages drawer`);
    await page.setViewportSize({ width: 320, height: 844 });
    await assertNoHorizontalOverflow(page, `${label}: 320px article overflow`);
    await screenshot(page, "reader-320px.png", `${label}: narrowest article screenshot`);
    await page.setViewportSize({ width: 390, height: 844 });
  }
}

async function assertReaderReadingFidelity(page: Page, label: string, viewportName: string): Promise<void> {
  const expectedHeadings = [...readerPolicyBody.matchAll(/^## (.+)$/gm)].map(match => match[1]!);
  const expectedCodeHeading = [...readerPolicyBody.split("```", 1)[0]!.matchAll(/^## (.+)$/gm)].at(-1)?.[1];
  const expectedCodeLabel = `${expectedCodeHeading} code example`;
  const expectedParagraphs = readerPolicyBody.split(/\n\n/).map(block => block.trim())
    .filter(block => block && !/^(?:#|\d+\.|>|\||```)/.test(block))
    .map(block => block.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim());
  const minimumProseWords = expectedParagraphs.join(" ").split(/\s+/).filter(Boolean).length;
  const result = await page.locator(".reader-document-body").evaluate((body, expected) => {
    const headings = Array.from(body.querySelectorAll<HTMLElement>("h2[id], h3[id]"));
    const headingTexts = headings.map(heading => heading.textContent?.replace(/\s+/g, " ").trim() ?? "");
    const text = (body.textContent ?? "").replace(/\s+/g, " ").trim();
    const table = body.querySelector<HTMLElement>("table");
    const code = body.querySelector<HTMLElement>("pre:not(.markdown-source-fallback)");
    // Keep this browser callback self-contained: tsx keepNames can insert a
    // Node-side __name helper around a nested function assigned to a variable.
    const scrollSources = [{ element: table, scrollable: false }, { element: code, scrollable: false }];
    for (const source of scrollSources) {
      for (let current = source.element; current && current !== body; current = current.parentElement) {
        if (["auto", "scroll"].includes(getComputedStyle(current).overflowX)) {
          source.scrollable = current.clientWidth <= window.innerWidth;
          break;
        }
      }
    }
    return { words: text.split(/\s+/).filter(Boolean).length, headings: headings.length, headingTexts, uniqueHeadingIds: new Set(headings.map(heading => heading.id)).size,
      missingParagraphIndexes: expected.paragraphs.flatMap((paragraph, index) => text.includes(paragraph) ? [] : [index]),
      sectionsComplete: JSON.stringify(headingTexts) === JSON.stringify(expected.headings),
      table: Boolean(table), tableScrollable: scrollSources[0]!.scrollable, codeScrollable: scrollSources[1]!.scrollable, nestedList: Boolean(body.querySelector("li ul li ul li")),
      codeTabIndex: code?.getAttribute("tabindex"), codeRole: code?.getAttribute("role"), codeLabel: code?.getAttribute("aria-label"),
      warning: body.textContent?.includes("Warning: This is synthetic guidance."), codeText: code?.textContent ?? "" };
  }, { headings: expectedHeadings, paragraphs: expectedParagraphs });
  const conditions = {
    fixtureProseComplete: result.missingParagraphIndexes.length === 0,
    fixtureProseMinimum: result.words >= minimumProseWords,
    fixtureSectionsComplete: result.sectionsComplete && result.headings === expectedHeadings.length,
    uniqueHeadingIds: result.uniqueHeadingIds === result.headings,
    tablePresent: result.table, tableScrollable: result.tableScrollable, codeScrollable: result.codeScrollable,
    codeKeyboardAttributes: result.codeTabIndex === "0" && result.codeRole === "region" && result.codeLabel === expectedCodeLabel,
    nestedList: result.nestedList, warning: Boolean(result.warning), codeSpacesPreserved: result.codeText.includes("keep  two spaces")
  };
  const failed = Object.entries(conditions).filter(([, passed]) => !passed).map(([condition]) => condition);
  const diagnostics = JSON.stringify({ failed, words: result.words, minimumProseWords, headingTexts: result.headingTexts, expectedHeadings,
    missingParagraphIndexes: result.missingParagraphIndexes, codeTabIndex: result.codeTabIndex, codeRole: result.codeRole, codeLabel: result.codeLabel, expectedCodeLabel, conditions });
  if (failed.length) throw new Error(`${label}: reading fidelity failed: ${diagnostics}`);
  readerProof(true, `${label}: fixture prose, headings, table, nested lists, warning and code retain reading fidelity`, diagnostics);
  const table = page.locator(".reader-document-body table").first();
  const codeSelector = ".reader-document-body pre:not(.markdown-source-fallback)";
  const code = page.locator(codeSelector).first();
  await table.focus();
  readerProof(await table.evaluate(element => element === document.activeElement), `${label}: native table receives keyboard focus`);
  await page.keyboard.press("Tab");
  const focused = await code.evaluate(element => ({ focused: element === document.activeElement, activeTag: document.activeElement?.tagName ?? "", activeId: document.activeElement?.id ?? "" }));
  readerProof(focused.focused, `${label}: Tab from the table reaches the next rendered code region`, JSON.stringify(focused));
  const before = await code.evaluate(element => ({ scrollLeft: element.scrollLeft, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  readerProof(before.scrollWidth > before.clientWidth, `${label}: fixture code has real horizontal overflow`, JSON.stringify(before));
  await page.keyboard.press("ArrowRight");
  try {
    await page.waitForFunction(input => {
      const element = document.querySelector<HTMLElement>(input.selector);
      return Boolean(element && element === document.activeElement && element.scrollLeft > input.before);
    }, { selector: codeSelector, before: before.scrollLeft }, { timeout: 3000 });
  } catch (error) {
    const actual = await code.evaluate(element => ({ scrollLeft: element.scrollLeft, focused: element === document.activeElement, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    throw new Error(`${label}: ArrowRight did not scroll the focused code region: ${JSON.stringify({ before, actual, cause: error instanceof Error ? error.message : String(error) })}`);
  }
  const after = await code.evaluate(element => element.scrollLeft);
  readerProof(after > before.scrollLeft, `${label}: ArrowRight scrolls the focused code region`, JSON.stringify({ before: before.scrollLeft, after }));
  await assertNoHorizontalOverflow(page, `${label}: local table/code scrolling prevents document overflow`);
  const screenshotPath = join(outputDir, `code-keyboard-${viewportName}.png`);
  await code.screenshot({ path: screenshotPath });
  checks.push({ name: `${label}: code keyboard scroll screenshot`, status: "pass", detail: screenshotPath });
  await assertReaderSectionNavigation(page, `${label}: contents`);
}

async function checkReaderUnavailablePages(page: Page, viewportName: string): Promise<void> {
  const messages: string[] = [];
  for (const stableId of [readerFixture.restrictedId, readerFixture.missingId]) {
    const detailUrl = await readerApiUrl(page, `/assets/${encodeURIComponent(stableId)}`);
    const attachmentsUrl = await readerApiUrl(page, `/assets/${encodeURIComponent(stableId)}/attachments`);
    const expectedStatuses = stableId === readerFixture.missingId ? [404] : [403, 404];
    expectReaderHttpFixtureFailure(page, detailUrl, expectedStatuses);
    expectReaderHttpFixtureFailure(page, attachmentsUrl, expectedStatuses);
    try {
      const observed = Promise.all([detailUrl, attachmentsUrl].map(url => page.waitForResponse(response => response.request().method() === "GET" && response.url() === url, { timeout: 15000 })));
      const [, responses] = await Promise.all([openReaderStablePage(page, stableId), observed]);
      readerProof(responses.every(response => expectedStatuses.includes(response.status())),
        `reader real-stack ${viewportName}: intentional ${stableId} detail and attachments reject access with approved statuses`,
        JSON.stringify(responses.map(response => ({ url: response.url(), status: response.status() }))));
      await page.getByRole("heading", { name: /unavailable|could not load/i }).waitFor({ state: "visible" });
      const text = normalizeText(await page.locator("main").textContent());
      readerProof(new URL(page.url()).searchParams.get("page") === stableId && !text.includes(readerFixture.title) && !text.includes("Private Riverstone") && !text.includes(readerFixture.restrictedToken), `reader ${viewportName}: explicit ${stableId} is generic and stays requested`);
      messages.push(text);
      await waitForSettledRequests(page, `intentional unavailable ${stableId} responses`);
    } finally {
      const expected = expectedReaderFailures.get(page);
      expected?.delete(detailUrl);
      expected?.delete(attachmentsUrl);
      if (expected?.size === 0) expectedReaderFailures.delete(page);
    }
  }
  readerProof(messages[0] === messages[1], `reader ${viewportName}: restricted and missing pages share one generic state`);
  await screenshot(page, `reader-unavailable-${viewportName}.png`, `reader ${viewportName}: unavailable screenshot`);
}

async function checkReaderCitationFixtures(page: Page, original: ReturnType<typeof managedQueryResponseSchema.parse>, viewportName: string): Promise<void> {
  const policy = original.citations.find(citation => citation.stableId === readerFixture.policyId);
  readerProof(Boolean(policy?.versionId), "reader citation fixtures: real source identity/version captured before substitution");
  const pattern = "**/agent/query";
  for (const [versionId, expected] of [["synthetic-different-version", "Different version from the page now shown"], [null, "Version not supplied"]] as const) {
    const fixture = structuredClone(original);
    fixture.citations = fixture.citations.map(citation => citation.stableId === readerFixture.policyId ? { ...citation, versionId } : citation);
    fixture.results = fixture.results.map(result => result.asset.stableId === readerFixture.policyId ? { ...result, citation: { ...result.citation, versionId } } : result);
    const parsed = managedQueryResponseSchema.parse(fixture);
    const handler = (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(parsed) });
    await page.route(pattern, handler);
    try {
      const { dialog } = await submitReaderAsk(page, readerFixture.ask);
      const citation = dialog.locator(".reader-citation").filter({ hasText: readerFixture.title }).first();
      if (await citation.getAttribute("open") === null) await citation.locator("summary").first().click();
      await citation.getByText(expected, { exact: false }).waitFor({ state: "visible" });
      readerProof((await citation.textContent() ?? "").includes(policy!.snippet) && !(await citation.innerText()).toLowerCase().includes("older"), `reader response-fixture ${viewportName}: ${expected}; supplied excerpt preserved without chronology claim`);
      const link = citation.getByRole("link", { name: "Open source page", exact: true });
      const url = new URL(await link.getAttribute("href") ?? "", page.url());
      readerProof(url.searchParams.get("page") === readerFixture.policyId && !url.href.includes("versions") && !url.searchParams.has("preview"), `reader response-fixture ${viewportName}: stable source link grants no historical preview`);
      await screenshot(page, `reader-citation-${versionId ? "different" : "missing"}-${viewportName}.png`, `reader response-fixture ${viewportName}: citation version screenshot`);
      await closeReaderDialog(page, "Ask the knowledge base");
    } finally {
      await page.unroute(pattern, handler);
    }
  }
}

function expectReaderHttpFixtureFailure(page: Page, url: string, statuses: readonly number[] = [503]): void {
  const urls = expectedReaderFailures.get(page) ?? new Map<string, Set<number>>();
  urls.set(url, new Set(statuses));
  expectedReaderFailures.set(page, urls);
}

async function waitForReaderFixture<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`Reader response fixture did not observe ${label} within 15 seconds`)), 15000);
    })]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function checkReaderControlledStates(page: Page): Promise<void> {
  // Each fixture fetches or retries the real endpoint. Only response timing or
  // one HTTP failure is substituted; these assertions prove UI lifecycle only.
  await checkReaderSixCardFixture(page);
  for (const kind of ["search", "ask"] as const) {
    const pattern = kind === "search" ? "**/search?**" : "**/agent/query";
    const title = kind === "search" ? "Search pages" : "Ask the knowledge base";
    const firstQuery = kind === "search" ? readerFixture.query : readerFixture.ask;
    let release!: () => void;
    let started!: () => void;
    let finished!: () => void;
    let originalRequest: Request | undefined;
    let settled!: () => void;
    let outcome = "";
    const hold = new Promise<void>(resolvePromise => { release = resolvePromise; });
    const captured = new Promise<void>(resolvePromise => { started = resolvePromise; });
    const completed = new Promise<void>(resolvePromise => { finished = resolvePromise; });
    const consumed = new Promise<void>(resolvePromise => { settled = resolvePromise; });
    const finishRequest = (request: Request) => { if (request === originalRequest) { outcome = "delivered"; settled(); } };
    const failRequest = (request: Request) => { if (request === originalRequest) { outcome = request.failure()?.errorText ?? "failed"; settled(); } };
    page.on("requestfinished", finishRequest);
    page.on("requestfailed", failRequest);
    const handler = async (route: Route) => {
      const request = route.request();
      const query = kind === "search" ? new URL(request.url()).searchParams.get("query") : request.postDataJSON()?.query;
      if (query !== firstQuery) return route.continue();
      originalRequest = request;
      const response = await route.fetch();
      const payload = kind === "search" ? searchResponseSchema.parse(await response.json()) : managedQueryResponseSchema.parse(await response.json());
      expectedReaderAborts.add(request);
      started();
      await hold;
      try {
        await route.fulfill({ response, body: JSON.stringify(payload) });
      } catch (error) {
        // Cancelling the obsolete browser request can invalidate interception.
        if (!(error instanceof Error && /closed|handled|interception|aborted/i.test(error.message))) throw error;
      } finally {
        finished();
      }
    };
    await page.route(pattern, handler);
    try {
      const dialog = kind === "search" ? await openReaderSearch(page) : await openReaderAsk(page);
      const input = dialog.locator(kind === "search" ? "#reader-search-input" : "#reader-ask-input");
      await input.fill(firstQuery);
      if (kind === "search") await input.press("Enter");
      else await dialog.locator(".reader-ask-form button[type='submit']").click();
      await waitForReaderFixture(captured, `${kind} A capture`);
      await dialog.getByRole("status").filter({ hasText: kind === "search" ? "Searching" : "Finding" }).waitFor({ state: "visible" });
      readerProof(await dialog.locator(kind === "search" ? ".reader-search-result" : ".reader-ask-answer").count() === 0,
        `reader response-fixture: ${kind} loading does not display a prior response as current`);
      if (kind === "search") await submitReaderSearch(page, readerFixture.noAnswer);
      else await submitReaderAsk(page, readerFixture.noAnswer);
      release();
      await waitForReaderFixture(completed, `${kind} A route completion`);
      await waitForReaderFixture(consumed, `${kind} A browser finish or failure`);
      await waitForSettledRequests(page, `obsolete ${kind} response completion`);
      await page.evaluate(() => new Promise<void>(resolvePromise => requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise()))));
      const displayedQuery = kind === "search" ? await dialog.getByRole("heading", { name: `Results for “${readerFixture.noAnswer}”`, exact: true }).isVisible() : normalizeText(await dialog.locator(".reader-ask-submitted > p").first().textContent()) === readerFixture.noAnswer;
      const displayedB = kind === "search" || await dialog.getByText("No accessible answer was found.", { exact: true }).isVisible();
      readerProof((outcome === "delivered" || /ERR_ABORTED/.test(outcome)) && displayedQuery && displayedB && await input.inputValue() === readerFixture.noAnswer && await dialog.locator(kind === "search" ? ".reader-search-result" : ".reader-citation").count() === 0 && !(await dialog.innerText()).includes(readerFixture.publishedToken),
        `reader response-fixture: delayed ${kind} A cannot replace B after request and render settling`, JSON.stringify({ browserOutcome: outcome, cancellationObserved: /ERR_ABORTED/.test(outcome), displayedQueryB: displayedQuery }));
      await closeReaderDialog(page, title);
    } finally {
      release();
      await page.unroute(pattern, handler);
      page.off("requestfinished", finishRequest);
      page.off("requestfailed", failRequest);
    }

    let failOnce = true;
    const failureHandler = async (route: Route) => {
      if (!failOnce) return route.continue();
      failOnce = false;
      expectReaderHttpFixtureFailure(page, route.request().url());
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "synthetic_failure", privateDebug: "RIVERSTONE_PRIVATE_ERROR_DETAIL" }) });
    };
    await page.route(pattern, failureHandler);
    try {
      const dialog = kind === "search" ? await openReaderSearch(page) : await openReaderAsk(page);
      const input = dialog.locator(kind === "search" ? "#reader-search-input" : "#reader-ask-input");
      await input.fill(firstQuery);
      if (kind === "search") await input.press("Enter");
      else await dialog.locator(".reader-ask-form button[type='submit']").click();
      await dialog.getByText(kind === "search" ? "Search could not finish" : "Could not answer this question", { exact: true }).waitFor();
      readerProof(!(await dialog.textContent() ?? "").includes("RIVERSTONE_PRIVATE_ERROR_DETAIL"), `reader response-fixture: ${kind} error hides response internals`);
      const retried = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(kind === "search" ? "/search" : "/agent/query") && response.status() === 200);
      await dialog.getByRole("button", { name: kind === "search" ? "Retry search" : "Retry question", exact: true }).click();
      await retried;
      await dialog.locator(kind === "search" ? ".reader-search-result" : ".reader-citation").first().waitFor({ state: "visible" });
      readerProof(await input.inputValue() === firstQuery, `reader response-fixture: ${kind} retry recovers through real endpoint with submitted question retained`);
      await closeReaderDialog(page, title);
    } finally {
      await page.unroute(pattern, failureHandler);
      expectedReaderFailures.delete(page);
    }
  }
  await checkReaderIndependentRecovery(page);
  await checkReaderColdEvidenceFocus(page);
  await checkReaderAccountDevices(page);
  await openReaderStablePage(page, readerFixture.policyId);
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
}

async function checkReaderColdEvidenceFocus(page: Page): Promise<void> {
  // Fresh document keeps the authenticated session. Only real module timing is
  // controlled; no module contents, API responses or production state change.
  await waitForSettledRequests(page, "cold reader evidence fixture preparation");
  const pattern = "**/assets/reader-evidence-*.js";
  let release!: () => void;
  let started!: () => void;
  let finished!: () => void;
  let settled!: () => void;
  let moduleRequest: Request | undefined;
  let moduleStatus = 0;
  let browserOutcome = "";
  const hold = new Promise<void>(resolvePromise => { release = resolvePromise; });
  const captured = new Promise<void>(resolvePromise => { started = resolvePromise; });
  const completed = new Promise<void>(resolvePromise => { finished = resolvePromise; });
  const consumed = new Promise<void>(resolvePromise => { settled = resolvePromise; });
  const finishRequest = (request: Request) => { if (request === moduleRequest) { browserOutcome = "delivered"; settled(); } };
  const failRequest = (request: Request) => { if (request === moduleRequest) { browserOutcome = request.failure()?.errorText ?? "failed"; settled(); } };
  const handler = async (route: Route) => {
    if (moduleRequest) return route.continue();
    moduleRequest = route.request();
    const response = await route.fetch({ timeout: 15000 });
    moduleStatus = response.status();
    started();
    await hold;
    try { await route.fulfill({ response }); } finally { finished(); }
  };
  page.on("requestfinished", finishRequest);
  page.on("requestfailed", failRequest);
  await page.route(pattern, handler);
  try {
    const fresh = new URL(page.url());
    fresh.searchParams.set("page", readerFixture.checklistId);
    fresh.hash = "reader";
    await page.goto(fresh.href, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: readerFixture.checklistTitle, exact: true, level: 1 }).waitFor();
    const sidebar = page.locator(".reader-library");
    await sidebar.waitFor({ state: "visible" });
    const expand = sidebar.getByRole("button", { name: "Expand Pages", exact: true });
    if (await expand.isVisible()) await expand.click();
    const trigger = page.locator(".topbar").getByRole("button", { name: "Search pages", exact: true });
    await trigger.click();
    await waitForReaderFixture(captured, "cold evidence module capture");
    readerProof(moduleStatus === 200 && await page.getByRole("dialog", { name: "Search pages", exact: true }).count() === 0 && await page.getByText("Loading reader tools…", { exact: true }).isVisible(),
      "reader response-fixture: first Search intent waits for the real cold evidence module", moduleStatus);
    await sidebar.getByRole("link", { name: "Riverstone sharing policy", exact: true }).click();
    await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
    readerProof(new URL(page.url()).searchParams.get("page") === readerFixture.policyId && await page.getByRole("dialog", { name: "Search pages", exact: true }).count() === 0,
      "reader response-fixture: sidebar navigation supersedes the unopened Search intent");
    release();
    await waitForReaderFixture(completed, "cold evidence route completion");
    await waitForReaderFixture(consumed, "cold evidence browser finish or failure");
    readerProof(browserOutcome === "delivered", "reader response-fixture: real cold evidence module reaches the browser", browserOutcome);
    await waitForSettledRequests(page, "cold reader evidence module completion");
    await openReaderSearch(page);
    await assertReaderDialogFocus(page, "Search pages", trigger, "reader response-fixture: Search after cancelled cold-load intent");
    await screenshot(page, "reader-cold-evidence-focus-response-fixture.png", "reader response-fixture: cold evidence focus screenshot");
  } finally {
    release();
    await page.unroute(pattern, handler);
    page.off("requestfinished", finishRequest);
    page.off("requestfailed", failRequest);
  }
}

async function checkReaderAccountDevices(page: Page): Promise<void> {
  const devicesResponse = page.waitForResponse(response => response.request().method() === "GET" && new URL(response.url()).pathname.endsWith("/local-sync/v1/device-sessions"));
  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Settings", exact: true, level: 1 }).waitFor();
  const response = await devicesResponse;
  const panel = page.locator(".local-devices-panel");
  await panel.locator(".local-device-list").waitFor({ state: "visible" });
  await panel.getByText("Loading devices…", { exact: true }).waitFor({ state: "hidden" });
  readerProof(response.status() === 200 && await panel.getByRole("alert").count() === 0,
    "reader real-stack: Settings renders deferred local-device controls after the authenticated read", response.status());
  await page.locator(".reader-return-link").click();
  await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
  await waitForSettledRequests(page, "reader return after Settings device read");
}

async function checkReaderSixCardFixture(page: Page): Promise<void> {
  const actual = searchResponseSchema.parse(await (await readerApiGet(page, `/search?${new URLSearchParams({ query: readerFixture.query, limit: "8" })}`)).json());
  const seed = actual.results[0];
  readerProof(Boolean(seed), "reader six-card response fixture: real schema-valid passage captured first");
  const query = "synthetic bounded six-source fixture";
  const fixture = searchResponseSchema.parse({ ...structuredClone(actual), query, results: Array.from({ length: 6 }, (_, index) => {
    const result = structuredClone(seed!);
    const stableId = `synthetic-response-source-${index + 1}`;
    const assetId = `synthetic-response-asset-${index + 1}`;
    const chunkId = `synthetic-response-passage-${index + 1}`;
    return { ...result, asset: { ...result.asset, stableId, id: assetId, title: `Synthetic bounded source ${index + 1}` }, chunkId, rank: 6 - index,
      ranking: { ...result.ranking, finalScore: 6 - index }, citation: { ...result.citation, stableId, assetId, chunkId, title: `Synthetic bounded source ${index + 1}` } };
  }) });
  const pattern = "**/search?**";
  const handler = (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
  await page.route(pattern, handler);
  try {
    const { dialog } = await submitReaderSearch(page, query);
    const ids = await dialog.locator(".reader-search-result").evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.stableId));
    readerProof(JSON.stringify(ids) === JSON.stringify(fixture.results.slice(0, 5).map(result => result.asset.stableId)), "reader response-fixture: six distinct sources retain the existing strongest-five card limit");
    await screenshot(page, "reader-bounded-search-response-fixture.png", "reader response-fixture: five-card search screenshot");
    await closeReaderDialog(page, "Search pages");
  } finally {
    await page.unroute(pattern, handler);
  }
}

async function checkReaderIndependentRecovery(page: Page): Promise<void> {
  for (const kind of ["collection", "detail", "attachments"] as const) {
    await openReaderStablePage(page, readerFixture.policyId);
    await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
    await waitForSettledRequests(page, `${kind} failure fixture preparation`);
    const matcher = (url: URL) => kind === "collection" ? url.pathname.endsWith("/assets") : url.pathname.endsWith(`/assets/${readerFixture.policyId}${kind === "attachments" ? "/attachments" : ""}`);
    let failOnce = true;
    let interceptedUrl = "";
    const handler = async (route: Route) => {
      if (!failOnce) return route.continue();
      failOnce = false;
      interceptedUrl = route.request().url();
      expectReaderHttpFixtureFailure(page, interceptedUrl);
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "synthetic_failure", privateDebug: "RIVERSTONE_PRIVATE_ERROR_DETAIL" }) });
    };
    await page.route(matcher, handler);
    try {
      const failedResponse = page.waitForResponse(response => matcher(new URL(response.url())) && response.status() === 503, { timeout: 15000 });
      try {
        // A same-URL goto can be a hash navigation and skip mount-time reads.
        // Install the fault only after preparation, then replace the document.
        const [, observed] = await Promise.all([page.reload({ waitUntil: "domcontentloaded" }), failedResponse]);
        readerProof(!failOnce && Boolean(interceptedUrl) && observed.url() === interceptedUrl && observed.status() === 503,
          `reader response-fixture: ${kind} exact request was intercepted and returned 503`, interceptedUrl);
      } catch (error) {
        throw new Error(`Reader ${kind} failure fixture did not observe its intended 503: ${JSON.stringify({ intercepted: !failOnce, interceptedUrl, pageUrl: page.url(), cause: error instanceof Error ? error.message : String(error) })}`);
      }
      if (kind === "detail") await page.getByRole("heading", { name: "Page could not load", exact: true }).waitFor();
      else await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
      const retry = page.getByRole("button", { name: kind === "collection" ? "Retry pages" : kind === "detail" ? "Retry page" : "Retry attachments", exact: true });
      await retry.waitFor({ state: "visible" });
      readerProof(!(await page.locator("main").textContent() ?? "").includes("RIVERSTONE_PRIVATE_ERROR_DETAIL"), `reader response-fixture: ${kind} error hides internals`);
      if (kind !== "detail") readerProof((await page.locator(".reader-document-body").textContent() ?? "").includes(readerFixture.publishedToken), `reader response-fixture: ${kind} failure leaves independently loaded article readable`);
      const recovered = page.waitForResponse(response => matcher(new URL(response.url())) && response.status() === 200);
      await retry.click();
      const finalResponse = await recovered;
      await page.getByRole("heading", { name: readerFixture.title, exact: true, level: 1 }).waitFor();
      await retry.waitFor({ state: "hidden" });
      readerProof(finalResponse.status() === 200 && (await page.locator(".reader-document-body").textContent() ?? "").includes(readerFixture.publishedToken), `reader response-fixture: ${kind} retries independently through real endpoint`);
    } finally {
      await page.unroute(matcher, handler);
      expectedReaderFailures.delete(page);
    }
  }
}

async function assertBrowserBranding(page: Page, displayName: string, href: string, type: string, name: string): Promise<void> {
  const title = `${displayName} | Knowledge Base for People and AI Tools`;
  try {
    await page.waitForFunction(expected => {
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      return document.title === expected.title && icon?.getAttribute("href") === expected.href && icon.type === expected.type;
    }, { title, href, type }, { timeout: 10000 });
  } catch {
    const actual = await page.evaluate(expectedHref => ({
      title: document.title,
      iconType: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.type,
      iconMatches: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute("href") === expectedHref
    }), href);
    throw new Error(`${name}: expected title ${JSON.stringify(title)} and ${type} favicon; got ${JSON.stringify(actual)}`);
  }
  checks.push({ name, status: "pass", detail: title });
}

async function checkPublicBrowserBranding(): Promise<void> {
  const context = await browser!.newContext();
  const page = await context.newPage();
  trackConsole(page);
  const logoUrl = `data:image/png;base64,${readFileSync(resolve(root, "scripts/fixtures/branding/logo.png")).toString("base64")}`;
  let response = JSON.stringify({ displayName: "R&D <Knowledge>", logoDataUrl: logoUrl });
  await page.route("**/branding?**", route => route.fulfill({ contentType: "application/json", body: response }));
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Log in to R&D <Knowledge>", exact: true }).waitFor();
    await assertBrowserBranding(page, "R&D <Knowledge>", logoUrl, "image/png", "browser branding: public login treats custom name as text and loads favicon");
    await screenshot(page, "branding-login.png", "browser branding: custom login screenshot");
    response = "unreadable branding response";
    const unreadableResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/branding"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await unreadableResponse;
    await page.getByRole("heading", { name: "Log in to ForgetBase", exact: true }).waitFor();
    await assertBrowserBranding(page, "ForgetBase", "/favicon.svg", "image/svg+xml", "browser branding: unreadable public branding falls back to defaults");
  } finally {
    await context.close();
  }
}

async function checkAdminBranding(page: Page): Promise<void> {
  // Exercise the actual Railway image policy even when the isolated Compose
  // proxy does not add it. Upload previews must not require a weaker policy.
  const proxyConfig = readFileSync(resolve(root, "infra/docker/nginx.railway-proxy.conf.template"), "utf8");
  const policy = proxyConfig.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];
  if (!policy) throw new Error("Railway content security policy was not found");
  const brandingContext = await browser!.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 1280, height: 800 }
  });
  const brandingPage = await brandingContext.newPage();
  trackConsole(brandingPage);
  await brandingPage.route("**/*", async route => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
  });
  try {
    await brandingPage.goto(routeUrl(page, "admin/system/settings"), { waitUntil: "domcontentloaded" });
    const field = brandingPage.getByRole("textbox", { name: "Logo text", exact: true });
    await field.waitFor({ state: "visible" });
    if (await field.inputValue() !== "ForgetBase" || await brandingPage.locator(".branding-preview img").getAttribute("src") !== "/favicon.svg") {
      throw new Error("Branding UAT requires default branding in a disposable synthetic tenant");
    }
    const logo = readFileSync(resolve(root, "scripts/fixtures/branding/logo.png"));
    const logoUrl = `data:image/png;base64,${logo.toString("base64")}`;
    await field.fill("Field Notes & Research");
    await brandingPage.getByLabel("Logo image", { exact: true }).setInputFiles(resolve(root, "scripts/fixtures/branding/logo.png"));
    await brandingPage.getByRole("button", { name: "Use default image", exact: true }).waitFor({ state: "visible" });
    await brandingPage.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>(".branding-preview img");
      return Boolean(image?.complete && image.naturalWidth > 0);
    });
    await expectHiddenText(brandingPage, "This image could not be read", "branding: image preview works under the production CSP");
    await assertBrowserBranding(brandingPage, "ForgetBase", "/favicon.svg", "image/svg+xml", "browser branding: unsaved preview preserves default tab");
    await brandingPage.getByRole("button", { name: "Save", exact: true }).click();
    await expectVisibleText(brandingPage, "Branding saved.", "branding: custom image and text saved");
    await assertBrowserBranding(brandingPage, "Field Notes & Research", logoUrl, "image/png", "browser branding: save updates title and PNG favicon without reload");
    await field.fill("Unsaved tab title");
    await assertBrowserBranding(brandingPage, "Field Notes & Research", logoUrl, "image/png", "browser branding: draft text leaves the saved tab unchanged");
    await brandingPage.getByRole("button", { name: "Cancel", exact: true }).click();
    await assertBrowserBranding(brandingPage, "Field Notes & Research", logoUrl, "image/png", "browser branding: cancel preserves saved tab");
    await brandingPage.reload({ waitUntil: "domcontentloaded" });
    await field.waitFor({ state: "visible" });
    if (await field.inputValue() !== "Field Notes & Research" || await brandingPage.locator(".branding-preview img").getAttribute("src") !== logoUrl) {
      throw new Error("Branding did not persist the exact uploaded image and text after reload");
    }
    checks.push({ name: "branding: exact image and text persist after reload", status: "pass" });
    await assertBrowserBranding(brandingPage, "Field Notes & Research", logoUrl, "image/png", "browser branding: custom title and favicon persist after reload");
    await screenshot(brandingPage, "branding-desktop.png", "branding: desktop screenshot");
    await brandingPage.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(brandingPage, "branding: mobile overflow");
    await screenshot(brandingPage, "branding-mobile.png", "branding: mobile screenshot");
    for (const [extension, type] of [["jpg", "image/jpeg"], ["webp", "image/webp"]] as const) {
      const path = resolve(root, `scripts/fixtures/branding/logo.${extension}`);
      await brandingPage.getByLabel("Logo image", { exact: true }).setInputFiles(path);
      await brandingPage.getByRole("button", { name: "Save", exact: true }).click();
      await expectVisibleText(brandingPage, "Branding saved.", `branding: ${extension} image saved`);
      await assertBrowserBranding(brandingPage, "Field Notes & Research", `data:${type};base64,${readFileSync(path).toString("base64")}`, type, `browser branding: replacement ${extension} favicon and media type`);
    }
    await waitForSettledRequests(brandingPage);
    await brandingPage.goto(readerOverviewUrl(page), { waitUntil: "domcontentloaded" });
    await brandingPage.getByRole("link", { name: "Field Notes & Research pages", exact: true }).waitFor();
    await assertBrowserBranding(brandingPage, "Field Notes & Research", `data:image/webp;base64,${readFileSync(resolve(root, "scripts/fixtures/branding/logo.webp")).toString("base64")}`, "image/webp", "browser branding: reader uses saved title and favicon");
    await brandingPage.getByRole("heading", { name: "Knowledge and instructions", exact: true, level: 1 }).waitFor({ timeout: 15000 });
    await waitForSettledRequests(brandingPage);
    await brandingPage.goto(routeUrl(page, "admin/system/settings"), { waitUntil: "domcontentloaded" });
    await field.waitFor({ state: "visible" });
    await brandingPage.getByRole("button", { name: "Use default image", exact: true }).click();
    await brandingPage.getByRole("button", { name: "Save", exact: true }).click();
    await expectVisibleText(brandingPage, "Branding saved.", "branding: default image saved independently");
    await assertBrowserBranding(brandingPage, "Field Notes & Research", "/favicon.svg", "image/svg+xml", "browser branding: default image preserves custom tab title");
    await brandingPage.getByRole("button", { name: "Restore defaults", exact: true }).click();
    await assertBrowserBranding(brandingPage, "Field Notes & Research", "/favicon.svg", "image/svg+xml", "browser branding: staged defaults do not change the tab before Save");
    await brandingPage.getByRole("button", { name: "Save", exact: true }).click();
    await expectVisibleText(brandingPage, "Branding saved.", "branding: defaults restored");
    await assertBrowserBranding(brandingPage, "ForgetBase", "/favicon.svg", "image/svg+xml", "browser branding: restore defaults resets title and favicon without reload");
    await brandingPage.reload({ waitUntil: "domcontentloaded" });
    await field.waitFor({ state: "visible" });
    if (await field.inputValue() !== "ForgetBase" || await brandingPage.locator(".branding-preview img").getAttribute("src") !== "/favicon.svg") {
      throw new Error("Default branding did not persist after restoration");
    }
    checks.push({ name: "branding: defaults persist after reload", status: "pass" });
    await assertBrowserBranding(brandingPage, "ForgetBase", "/favicon.svg", "image/svg+xml", "browser branding: default title and favicon persist after reload");
  } finally {
    await brandingContext.close();
  }
}

async function checkAdminPageAuthoring(page: Page): Promise<void> {
  const stableId = "guide.browser-authoring-uat";
  const createdTitle = "Browser Authoring UAT Guide";
  const updatedTitle = "Browser Authoring UAT Guide Updated";
  const createdBody = "# Browser authoring proof\n\nThis synthetic page verifies the browser create, edit, review, and publish flow.";
  const updatedBody = "# Browser authoring proof\n\nThis updated synthetic page verifies that browser edits create a governed version before publishing.";

  await page.goto(routeUrl(page, "admin/content"), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await expectVisibleText(page, "Create page", "release: authoring create form opened");
  await page.locator("#authoring-settings > summary").click();
  await page.locator("#authoring-stable-id").fill(stableId);
  await page.locator("#authoring-title").fill(createdTitle);
  await page.locator("#authoring-summary").fill("Synthetic page created by the isolated browser authoring proof.");
  await fillAuthoringBody(page, createdBody);
  const createResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/assets")
  );
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  const authoringApiUrl = (await createResponse).url().replace(/\/assets(?:\?.*)?$/, "");
  await expectVisibleText(page, `Created ${stableId} as a draft`, "release: authoring draft created");
  await expectVisibleText(page, createdTitle, "release: authored page selected");
  await assertAuthoringDraft(page, authoringApiUrl, stableId, createdBody, "release: created draft content");
  await assertAuthoringPublication(page, authoringApiUrl, stableId, null, null, "release: draft excluded from ordinary reads");

  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await expectVisibleText(page, `Edit ${createdTitle}`, "release: authoring edit form opened");
  await page.locator("#authoring-title").fill(updatedTitle);
  await page.locator("#authoring-settings > summary").click();
  await page.locator("#authoring-change-note").fill("Verify browser version authoring");
  await fillAuthoringBody(page, updatedBody);
  await page.getByRole("button", { name: "Save draft version", exact: true }).click();
  await expectVisibleText(page, `Saved ${stableId} as a new draft version`, "release: authoring draft version saved");
  await expectVisibleText(page, updatedTitle, "release: authored page title updated");
  await expectVisibleText(page, "v2", "release: authored page version advanced");
  await assertAuthoringDraft(page, authoringApiUrl, stableId, updatedBody, "release: updated draft content");

  await page.getByRole("tab", { name: "Versions", exact: true }).click();
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expectVisibleText(page, `Reviewed ${stableId}`, "release: authored page reviewed");
  await assertAuthoringPublication(page, authoringApiUrl, stableId, null, null, "release: review does not publish draft");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expectVisibleText(page, `Published ${stableId}`, "release: authored page published");
  await assertAuthoringPublication(page, authoringApiUrl, stableId, updatedTitle, updatedBody, "release: published content available to ordinary reads");
  await assertNoHorizontalOverflow(page, "release: authoring desktop overflow");
  await assertNoClippedText(page, "release: authoring desktop clipped text");
  await screenshot(page, "authoring-flow.png", "release: authoring flow screenshot");
}

async function assertAuthoringDraft(page: Page, apiUrl: string, stableId: string, expectedBody: string, name: string): Promise<void> {
  const response = await page.context().request.get(`${apiUrl}/assets/${encodeURIComponent(stableId)}?preview=true`, {
    headers: { "x-forgetbase-surface": "web" }
  });
  const payload = await response.json() as { humanDocuments?: Array<{ body?: string }> };
  if (response.status() !== 200 || payload.humanDocuments?.length !== 1 || payload.humanDocuments[0]?.body !== expectedBody) {
    throw new Error(`${name}: saved draft did not preserve the complete Markdown body`);
  }
  checks.push({ name, status: "pass", detail: createHash("sha256").update(expectedBody).digest("hex") });
}

async function assertRichEditorReady(page: Page, name: string): Promise<void> {
  await page.locator('.fb-rich-editor[aria-busy="false"] .fb-rich-content[contenteditable="true"]').waitFor({ timeout: 15000 });
  if (await page.getByRole("button", { name: "Rich text", exact: true }).getAttribute("aria-pressed") !== "true") {
    throw new Error(`${name}: Rich text must be active; a Source or textarea fallback is not rich-editor proof`);
  }
  checks.push({ name, status: "pass" });
}

async function checkRichEditorAuthoring(page: Page): Promise<void> {
  // Failures targeted here: lossy import, stale nested-editor state on Save,
  // altered bytes on mode switches/reopen, and loss of unsupported source.
  const stableId = "guide.rich-editor-uat";
  const title = "Rich Editor UAT Guide";
  const body = "# Rich editing proof\n\nUnicode café 🧪 and **bold**.\n\n- First\n- Second\n\n```txt\nnested original\nkeep  two spaces\n```\n\n";
  const updatedBody = body.replace("nested original", "nested updated");
  await page.goto(routeUrl(page, "admin/content"), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.locator("#authoring-settings > summary").click();
  await page.locator("#authoring-stable-id").fill(stableId);
  await page.locator("#authoring-title").fill(title);
  await fillAuthoringBody(page, body);
  await page.getByRole("button", { name: "Rich text", exact: true }).click();
  await assertRichEditorReady(page, "rich editor: supported mixed document imported");
  await screenshot(page, "rich-editor-import.png", "rich editor: import screenshot");
  const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/assets"));
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  const apiUrl = (await created).url().replace(/\/assets(?:\?.*)?$/, "");
  await expectVisibleText(page, `Created ${stableId} as a draft`, "rich editor: draft created");
  await assertAuthoringDraft(page, apiUrl, stableId, body, "rich editor: no-op import preserves all bytes");

  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await assertRichEditorReady(page, "rich editor: reopened draft");
  await page.locator(".fb-rich-editor .cm-content").fill("pending nested edit\nkeep  two spaces");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Save your page before leaving?", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Continue editing", exact: true }).click();
  if (await page.locator(".fb-rich-editor .cm-content").innerText() !== "pending nested edit\nkeep  two spaces") {
    throw new Error("rich editor: navigation guard lost the pending nested edit");
  }
  checks.push({ name: "rich editor: unsaved navigation keeps the pending nested edit", status: "pass" });
  await page.locator("#authoring-settings > summary").click();
  await page.locator("#authoring-change-note").fill("Save the current nested code block");
  // No artificial settling delay: Save must flush the nested editor itself.
  await page.locator(".fb-rich-editor .cm-content").fill("nested updated\nkeep  two spaces");
  await page.getByRole("button", { name: "Save draft version", exact: true }).click();
  await expectVisibleText(page, `Saved ${stableId} as a new draft version`, "rich editor: immediate nested save");
  await assertAuthoringDraft(page, apiUrl, stableId, updatedBody, "rich editor: saved nested edit matches exact body");

  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await assertRichEditorReady(page, "rich editor: saved nested content reopens");
  if (await page.locator(".fb-rich-editor .cm-content").innerText() !== "nested updated\nkeep  two spaces") {
    throw new Error("rich editor: reopened code block differs from saved text");
  }
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.locator(".fb-source-editor .cm-content").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Rich text", exact: true }).click();
  await assertRichEditorReady(page, "rich editor: Source-to-Rich round trip");
  await page.locator("#authoring-settings > summary").click();
  await page.locator("#authoring-change-note").fill("Verify mode switching preserves content");
  await page.getByRole("button", { name: "Save draft version", exact: true }).click();
  await expectVisibleText(page, `Saved ${stableId} as a new draft version`, "rich editor: round-trip save");
  await assertAuthoringDraft(page, apiUrl, stableId, updatedBody, "rich editor: mode switches preserve all bytes");
  await page.getByRole("tab", { name: "Versions", exact: true }).click();
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expectVisibleText(page, `Reviewed ${stableId}`, "rich editor: reviewed");
  await assertAuthoringPublication(page, apiUrl, stableId, null, null, "rich editor: review does not publish");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish page", exact: true }).click();
  await expectVisibleText(page, `Published ${stableId}`, "rich editor: published");
  await assertAuthoringPublication(page, apiUrl, stableId, title, updatedBody, "rich editor: published exact body");
  const readerUrl = new URL(routeUrl(page, "reader"));
  readerUrl.searchParams.set("page", stableId);
  await page.goto(readerUrl.href, { waitUntil: "domcontentloaded" });
  await page.locator(".reader-document-body pre code").waitFor({ state: "visible" });
  if (await page.locator(".reader-document-body pre code").textContent() !== "nested updated\nkeep  two spaces\n") {
    throw new Error("rich editor: reader code text differs from the published document");
  }
  checks.push({ name: "rich editor: reader renders the saved nested text", status: "pass" });
  await screenshot(page, "rich-editor-reader.png", "rich editor: reader screenshot");

  const sourceId = "guide.source-fallback-uat";
  const sourceBody = "---\nowner: synthetic\n---\n\n    keep indented code\n\n[Reference][guide]\n\n[guide]: /docs/start\n\n";
  await page.goto(routeUrl(page, "admin/content"), { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.locator("#authoring-settings > summary").click();
  await page.locator("#authoring-stable-id").fill(sourceId);
  await page.locator("#authoring-title").fill("Source Fallback UAT Guide");
  await fillAuthoringBody(page, sourceBody);
  await page.getByRole("button", { name: "Rich text", exact: true }).click();
  if (await page.getByRole("button", { name: "Source", exact: true }).getAttribute("aria-pressed") !== "true") {
    throw new Error("source fallback: unsupported Markdown must remain in Source");
  }
  await expectVisibleText(page, "Frontmatter stays in Source.", "source fallback: visible explanation");
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expectVisibleText(page, `Created ${sourceId} as a draft`, "source fallback: draft created");
  await assertAuthoringDraft(page, apiUrl, sourceId, sourceBody, "source fallback: saved original bytes");
  await page.getByRole("button", { name: "Edit page", exact: true }).click();
  await page.locator(".fb-source-editor .cm-content").waitFor({ state: "visible" });
  if (await page.getByRole("button", { name: "Source", exact: true }).getAttribute("aria-pressed") !== "true") {
    throw new Error("source fallback: reopened unsupported document must use Source");
  }
  await page.locator("#authoring-settings > summary").click();
  await page.locator("#authoring-change-note").fill("Verify unchanged fallback source");
  await screenshot(page, "source-fallback.png", "source fallback: reopened screenshot");
  await page.getByRole("button", { name: "Save draft version", exact: true }).click();
  await expectVisibleText(page, `Saved ${sourceId} as a new draft version`, "source fallback: reopened draft saved");
  await assertAuthoringDraft(page, apiUrl, sourceId, sourceBody, "source fallback: reopen and save preserves all bytes");
}

async function fillAuthoringBody(page: Page, body: string): Promise<void> {
  const textarea = page.locator("#authoring-body");
  if (await textarea.isVisible()) {
    await textarea.fill(body);
  } else {
    const sourceMode = page.getByRole("button", { name: "Source", exact: true });
    if (await sourceMode.getAttribute("aria-pressed") !== "true") await sourceMode.click();
    await page.locator(".fb-source-editor .cm-content").fill(body);
  }
}

async function assertAuthoringPublication(page: Page, apiUrl: string, stableId: string, title: string | null, expectedBody: string | null, name: string): Promise<void> {
  const response = await page.context().request.get(`${apiUrl}/assets/${encodeURIComponent(stableId)}`, {
    headers: { "x-forgetbase-surface": "web" }
  });
  const payload = await response.json() as {
    error?: string;
    asset?: { title?: string; lifecycleState?: string; status?: string; currentVersionId?: string; publishedVersionId?: string };
    versions?: Array<{ id?: string }>;
    humanDocuments?: Array<{ body?: string }>;
  };
  if (title === null) {
    if (response.status() !== 404 || payload.error !== "asset_not_found") {
      throw new Error(`${name}: expected an unpublished asset to be unavailable, got HTTP ${response.status()}`);
    }
  } else if (response.status() !== 200 || payload.asset?.title !== title ||
    payload.asset.lifecycleState !== "active" || payload.asset.status !== "approved" ||
    !payload.asset.publishedVersionId || payload.asset.currentVersionId !== payload.asset.publishedVersionId ||
    payload.versions?.length !== 1 || payload.humanDocuments?.length !== 1 ||
    expectedBody === null || payload.humanDocuments[0]?.body !== expectedBody) {
    throw new Error(`${name}: ordinary read did not match the approved authored version`);
  }
  checks.push({ name, status: "pass", ...(expectedBody === null ? {} : { detail: createHash("sha256").update(expectedBody).digest("hex") }) });
}

async function applyTenantOverride(page: Page): Promise<void> {
  await page.context().clearCookies();

  await page.addInitScript((value) => {
    if (window.sessionStorage.getItem("forgetbase-uat-storage-initialized") === "true") {
      return;
    }

    window.sessionStorage.setItem("forgetbase-uat-storage-initialized", "true");
    window.localStorage.setItem("forgetbase-api-key", "legacy-uat-token");
    window.localStorage.removeItem("forgetbase-session-cookie-active");
    window.localStorage.removeItem("forgetbase-login-email");

    if (value) {
      window.localStorage.setItem("forgetbase-login-tenant", value);
    } else {
      window.localStorage.removeItem("forgetbase-login-tenant");
    }
  }, tenantId);
}

async function checkBrowserCredentialLifetime(page: Page, viewportName: string): Promise<void> {
  // The denied-admin return can render an article shell before its reads finish.
  // Settle those reads before this deliberate document replacement, as for reload.
  await waitForSettledRequests(page, "the credential check's overview navigation");
  await page.goto(readerOverviewUrl(page), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Knowledge and instructions", exact: true, level: 1 }).waitFor({ timeout: 15000 });
  const hasStoredKey = await page.evaluate(() =>
    window.localStorage.getItem("forgetbase-api-key") !== null ||
    window.sessionStorage.getItem("forgetbase-api-key") !== null
  );
  if (hasStoredKey) throw new Error("Browser bearer credential persisted after login or navigation");
  checks.push({ name: `release ${viewportName}: reader return and no persisted bearer credential`, status: "pass" });

  // Finish background reads before deliberately replacing the document. Otherwise
  // this test creates ERR_ABORTED failures in its own request-failure gate.
  await waitForSettledRequests(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const url = new URL(baseUrl);
  const splitOrigin = isLocalUrl(baseUrl) && ["5173", "5175"].includes(url.port);
  await page.waitForSelector(splitOrigin ? "#login-email" : ".reader-overview, .reader-article", { timeout: 15000 });
  await waitForSettledRequests(page);
  checks.push({ name: `release ${viewportName}: ${splitOrigin ? "reload discards development bearer credential" : "cookie session survives reload"}`, status: "pass" });
}

async function waitForSettledRequests(page: Page, purpose = "the credential reload check"): Promise<void> {
  const traffic = pageTraffic.get(page);
  if (!traffic) throw new Error("Page request tracking was not initialized");
  const deadline = Date.now() + 15000;
  while (traffic.pending.size || Date.now() - traffic.changedAt < 500) {
    if (Date.now() >= deadline) throw new Error(`Background requests did not settle before ${purpose}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}

function routeUrl(page: Page, route: string): string {
  const url = new URL(page.url());
  url.hash = route;
  return url.toString();
}

function readerOverviewUrl(page: Page): string {
  const url = new URL(routeUrl(page, "reader"));
  // Generic reader checks must not inherit an unpublished authoring selection.
  url.searchParams.delete("page");
  return url.toString();
}

async function checkMobileAdminShell(page: Page): Promise<void> {
  await page.goto(routeUrl(page, "admin/content"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell.admin-shell", { timeout: 10000 });
  await expectHash(page, "#admin/content", "release mobile: admin canonical content route");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expectVisibleText(page, "Manage ForgetBase", "release mobile: admin console shell title");
  await assertNoHorizontalOverflow(page, "release mobile: admin shell overflow");
  await assertNoClippedText(page, "release mobile: admin shell clipped text");
  await screenshot(page, "admin-mobile.png", "release mobile: admin shell screenshot");
}

async function assertLegacyAdminHashCanonicalizes(page: Page): Promise<void> {
  await page.goto(routeUrl(page, "settings"), { waitUntil: "domcontentloaded" });
  await expectVisibleText(page, "Settings", "release: legacy settings route loaded");
  await expectHash(page, "#admin/system/settings", "release: legacy settings route canonicalized");
  // Settings loads admin branding on mount and aborts that read when the route unmounts. Leaving
  // before it settles makes this check create its own ERR_ABORTED in the request-failure gate.
  await waitForSettledRequests(page, "leaving the legacy settings route");
  await page.goto(routeUrl(page, "exports"), { waitUntil: "domcontentloaded" });
  await expectVisibleText(page, "Package builder", "release: legacy exports route loaded");
  await expectHash(page, "#admin/exports", "release: legacy exports route canonicalized");
  await page.goto(routeUrl(page, "admin/content"), { waitUntil: "domcontentloaded" });
  await expectHash(page, "#admin/content", "release: admin content route restored");
}

async function screenshotAdminRoute(
  page: Page,
  route: string,
  expectedText: string,
  fileName: string,
  name: string
): Promise<void> {
  await page.goto(routeUrl(page, route), { waitUntil: "domcontentloaded" });
  await expectVisibleText(page, expectedText, `${name}: route loaded`);
  if (route.startsWith("admin/")) {
    await expectHash(page, `#${route}`, `${name}: canonical hash`);
  }
  if (route === "admin/system/access") {
    await page.locator("strong").filter({ hasText: email }).first().waitFor({ state: "visible", timeout: 15000 });
    checks.push({ name: `${name}: user records loaded`, status: "pass" });
  }
  await assertNoHorizontalOverflow(page, `${name}: overflow`);
  await assertNoClippedText(page, `${name}: clipped text`);
  await screenshot(page, fileName, name);
}

async function screenshotExportRoute(page: Page): Promise<void> {
  await page.goto(routeUrl(page, "admin/exports"), { waitUntil: "domcontentloaded" });
  await expectVisibleText(page, "Package builder", "release: admin exports route loaded");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await expectVisibleText(page, "Included stable IDs", "release: admin export generated");
  await assertNoHorizontalOverflow(page, "release: admin exports overflow");
  await assertNoClippedText(page, "release: admin exports clipped text");
  await screenshot(page, "exports.png", "release: admin exports screenshot");
}

async function assertAttachmentDownload(page: Page, filename: string, name: string): Promise<void> {
  await expectVisibleText(page, filename, `${name}: filename visible`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download ${filename}` }).click();
  const download = await downloadPromise;
  if (download.suggestedFilename() !== filename) {
    throw new Error(`${name}: expected filename ${filename}; got ${download.suggestedFilename()}`);
  }
  checks.push({ name, status: "pass", detail: filename });
}

async function clickUnique(page: Page, selector: string, text: string): Promise<void> {
  const locator = page.locator(selector).filter({ hasText: text });
  const count = await locator.count();
  const visibleMatches = [];

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);

    if (await candidate.isVisible()) {
      visibleMatches.push(candidate);
    }
  }

  if (visibleMatches.length !== 1) {
    throw new Error(`Expected exactly one visible ${selector} with text "${text}", found ${visibleMatches.length} visible of ${count}`);
  }

  await visibleMatches[0]!.click();
}

async function clickFirstVisible(page: Page, selector: string, text: string): Promise<void> {
  const locator = page.locator(selector).filter({ hasText: text });
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);

    if (await candidate.isVisible()) {
      await candidate.click();
      return;
    }
  }

  throw new Error(`Expected at least one visible ${selector} with text "${text}", found 0 visible of ${count}`);
}

async function expectTitle(page: Page, expected: string, name: string): Promise<void> {
  const actual = await page.title();

  if (actual !== expected) {
    throw new Error(`${name}: expected title "${expected}", got "${actual}"`);
  }

  checks.push({ name, status: "pass", detail: actual });
}

async function expectText(page: Page, selector: string, expected: string, name: string): Promise<void> {
  const actual = normalizeText(await page.locator(selector).textContent());

  if (actual !== expected) {
    throw new Error(`${name}: expected "${expected}", got "${actual}"`);
  }

  checks.push({ name, status: "pass", detail: actual });
}

async function expectVisibleText(page: Page, text: string, name: string): Promise<void> {
  await page.waitForFunction(
    (expectedText) => document.body.innerText.includes(expectedText),
    text,
    { timeout: 15000 }
  );
  const count = await page.getByText(text, { exact: false }).count();

  if (count < 1) {
    throw new Error(`${name}: expected visible text containing "${text}"`);
  }

  checks.push({ name, status: "pass", detail: count });
}

async function expectHiddenText(page: Page, text: string, name: string): Promise<void> {
  const count = await page.getByText(text, { exact: false }).count();

  if (count > 0) {
    throw new Error(`${name}: unexpected text "${text}" was visible`);
  }

  checks.push({ name, status: "pass", detail: count });
}

async function assertReaderHasNoAdminControls(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const exactAdminControls = Array.from(document.querySelectorAll("button, [role='menuitem'], a"))
      .filter((element) => element.textContent?.replace(/\s+/g, " ").trim() === "Admin")
      .filter((element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
    const adminShells = Array.from(document.querySelectorAll(".admin-shell, .admin-side-nav"))
      .filter((element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });

    return {
      adminShells: adminShells.length,
      exactAdminControls: exactAdminControls.length
    };
  });

  if (result.adminShells > 0 || result.exactAdminControls > 0) {
    throw new Error(`${name}: found ${JSON.stringify(result)}`);
  }

  checks.push({ name, status: "pass", detail: 0 });
}

async function expectHash(page: Page, expected: string, name: string): Promise<void> {
  await page.waitForFunction(
    (expectedHash) => window.location.hash === expectedHash,
    expected,
    { timeout: 10000 }
  );
  const hash = await page.evaluate(() => window.location.hash);

  if (hash !== expected) {
    throw new Error(`${name}: expected hash "${expected}", got "${hash}"`);
  }

  checks.push({ name, status: "pass", detail: hash });
}

async function assertNoJargon(page: Page, selector: string | string[], name: string): Promise<void> {
  const text = typeof selector === "string" ? await page.locator(selector).textContent()
    : await page.locator(selector.join(", ")).evaluateAll(elements => elements.map(element => `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`).join(" "));
  const lowered = normalizeText(text).toLowerCase();
  const banned = [
    /agent-native/,
    /control plane/,
    /deterministic managed/,
    /governed context/,
    /managed query/,
    /governed asset/,
    /machine-consumer/,
    /delivery surface/,
    /\bpii\b/,
    /\bsop\b/,
    /\bguardrail\b/,
    /public-demo/,
    /no-export/,
    /broad-reader/,
    /credential vault/
  ];
  const match = banned.find((phrase) => phrase.test(lowered));

  if (match) {
    throw new Error(`${name}: found jargon phrase "${match.source}"`);
  }

  checks.push({ name, status: "pass" });
}

async function assertNoHorizontalOverflow(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  if (result.scrollWidth > result.innerWidth) {
    throw new Error(`${name}: scrollWidth ${result.scrollWidth} exceeds viewport ${result.innerWidth}`);
  }

  checks.push({ name, status: "pass", detail: result.scrollWidth });
}

async function assertNoClippedText(page: Page, name: string): Promise<void> {
  const clipped = await page.evaluate(() => {
    const selectors = [
      "main button",
      "main [role='button']",
      "main [data-slot='button']",
      "main [data-slot='badge']",
      "main [data-slot='card-title']",
      "main [data-slot='card-description']",
      "main th",
      "main td"
    ];
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")));

    return elements.flatMap((element) => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      if (
        !text ||
        rect.width < 1 ||
        rect.height < 1 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.closest("[aria-hidden='true']")
      ) {
        return [];
      }

      const clippedX = element.scrollWidth > Math.ceil(element.clientWidth) + 2;
      const clippedY = ["hidden", "clip"].includes(style.overflowY) &&
        element.scrollHeight > Math.ceil(element.clientHeight) + 2;

      if (!clippedX && !clippedY) {
        return [];
      }

      return [{
        selector: element.tagName.toLowerCase(),
        text: text.slice(0, 96),
        size: `${element.scrollWidth}x${element.scrollHeight}/${element.clientWidth}x${element.clientHeight}`
      }];
    }).slice(0, 8);
  });

  if (clipped.length > 0) {
    const details = clipped
      .map((item) => `${item.selector} "${item.text}" (${item.size})`)
      .join("; ");
    throw new Error(`${name}: text does not fit its UI element: ${details}`);
  }

  checks.push({ name, status: "pass", detail: 0 });
}

async function assertReaderArticleDepth(page: Page, name: string): Promise<void> {
  await page.locator(".reader-document-body h2").first().waitFor({ state: "visible" });
  const result = await page.evaluate(() => {
    const body = document.querySelector(".reader-document-body");
    const text = (body?.textContent ?? "").replace(/\s+/g, " ").trim();
    const headings = body?.querySelectorAll("h2, h3").length ?? 0;
    const contentBlocks = Array.from(body?.querySelectorAll("p, li") ?? [])
      .filter((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim().length > 24)
      .length;
    const words = text ? text.split(/\s+/).length : 0;

    return { headings, contentBlocks, words };
  });

  if (result.headings < 4 || result.contentBlocks < 6 || result.words < 120) {
    throw new Error(`${name}: expected a KB-style article with at least 4 section headings, 6 readable blocks, and 120 words; got ${JSON.stringify(result)}`);
  }

  checks.push({ name, status: "pass", detail: result.words });
}

async function assertMobileReaderNavigation(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole("button", { name: "Open pages", exact: true });
  readerProof(await trigger.isVisible() && !await page.locator(".reader-library").isVisible(), `${name}: labelled mobile trigger replaces the desktop tree`);
  const drawer = await readerNavigation(page);
  readerProof(await drawer.getByRole("link").count() >= 2, `${name}: drawer contains published page anchors`);
  await closeReaderDialog(page, "Pages");
}

async function assertReaderNestedNavigation(page: Page, name: string): Promise<void> {
  const navigation = await readerNavigation(page);
  for (const label of ["Reader experience", "Lifecycle states"]) {
    const expand = navigation.getByRole("button", { name: `Expand ${label} pages`, exact: true });
    if (await expand.isVisible()) await expand.click();
    await navigation.getByRole("button", { name: `Collapse ${label} pages`, exact: true }).waitFor({ state: "visible" });
  }
  await navigation.getByRole("link", { name: "Nested page sample", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".reader-article-header h1")?.textContent?.replace(/\s+/g, " ").trim() === "Reader Nested Navigation Example",
    undefined,
    { timeout: 15000 }
  );
  await assertReaderArticleDepth(page, `${name}: nested article depth`);
  checks.push({ name, status: "pass", detail: "Reader experience > Lifecycle states > Nested page sample" });
}

async function assertReaderSourceFields(page: Page, name: string): Promise<void> {
  const stableId = new URL(page.url()).searchParams.get("page");
  readerProof(Boolean(stableId), `${name}: selected stable identity is explicit`);
  const detail = assetDetailSchema.parse(await (await readerApiGet(page, `/assets/${encodeURIComponent(stableId!)}`)).json());
  const configured = detail.asset.metadata.readerPageInfoFields ?? ["version", "updated", "access", "maintainer", "review"];
  const version = detail.versions.find(item => item.id === detail.asset.publishedVersionId);
  const dates = await page.evaluate(input => {
    const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
    return { updated: formatter.format(new Date(input.updated)), review: formatter.format(new Date(input.review)), overdue: Date.parse(input.review) < Date.now() };
  }, { updated: detail.asset.updatedAt, review: detail.asset.reviewDueAt });
  const expected: Record<string, { term: string; value: string }> = {
    version: { term: "Version", value: version ? `Version ${version.versionNumber}` : "Version unavailable" },
    updated: { term: "Last updated", value: dates.updated },
    access: { term: "Access", value: detail.asset.sensitivity === "public-demo" ? "Open to readers" : "Signed-in readers" },
    maintainer: { term: "Maintainer", value: detail.asset.ownerId },
    review: { term: "Review", value: `${dates.overdue ? "Review overdue ·" : "Due"} ${dates.review}` }
  };
  await page.getByRole("button", { name: "Source details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Source details", exact: true });
  await dialog.waitFor({ state: "visible" });
  const fields = dialog.locator(".reader-source-fields");
  await fields.waitFor({ state: "visible" });
  const result = await fields.evaluate((section) => {
    const terms = Array.from(section.querySelectorAll("dt"))
      .map((term) => term.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
    const values = Array.from(section.querySelectorAll("dd"))
      .map((value) => value.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
    const rect = section.getBoundingClientRect();

    return {
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      terms,
      values
    };
  });

  readerProof(result.visible && JSON.stringify(result.terms) === JSON.stringify(configured.map(key => expected[key]!.term)) && JSON.stringify(result.values) === JSON.stringify(configured.map(key => expected[key]!.value)), `${name}: configured source fields preserve exact terms, order and published values`, result.terms.join(", "));
  await closeReaderDialog(page, "Source details");
}

async function assertReaderSectionNavigation(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const nav = document.querySelector(".reader-section-nav");
    const buttons = Array.from(nav?.querySelectorAll("button") ?? []);
    const headings = Array.from(document.querySelectorAll<HTMLElement>(".reader-document-body h2[id], .reader-document-body h3[id]"));

    return {
      label: nav?.textContent?.includes("On this page") ?? false,
      buttons: buttons.length,
      headings: headings.length,
      firstButton: buttons[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      firstHeading: headings[0]?.textContent?.replace(/\s+/g, " ").trim() ?? ""
    };
  });

  if (!result.label || result.buttons < 3 || result.headings < 3 || result.firstButton !== result.firstHeading) {
    throw new Error(`${name}: expected section navigation to match document headings; got ${JSON.stringify(result)}`);
  }

  if (await page.locator(".reader-section-nav").evaluate(element => element.tagName === "DETAILS" && !element.hasAttribute("open"))) {
    await page.locator(".reader-section-nav > summary").click();
  }
  await page.locator(".reader-section-nav button").first().click();
  await assertElementInViewport(page, ".reader-document-body h2[id], .reader-document-body h3[id]", `${name}: section link scrolls to heading`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectHash(page, "#reader", `${name}: contents preserves reader route`);
  checks.push({ name, status: "pass", detail: result.buttons });
}

async function assertReaderSearchResults(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".reader-search-result"));
    const openButtons = rows.filter((row) => row.innerText.includes("Open page")).length;
    const readableSnippets = rows.filter((row) => {
      const paragraphs = Array.from(row.querySelectorAll("p"));
      return paragraphs.some((paragraph) => (paragraph.textContent ?? "").replace(/\s+/g, " ").trim().length > 40);
    }).length;

    const stableIds = rows.map((row) => row.dataset.stableId ?? "");

    return {
      rows: rows.length,
      openButtons,
      readableSnippets,
      stableIdsPresent: stableIds.filter(Boolean).length,
      uniqueStableIds: new Set(stableIds).size
    };
  });

  if (
    result.rows < 1 ||
    result.openButtons < 1 ||
    result.readableSnippets < 1 ||
    result.stableIdsPresent !== result.rows ||
    result.uniqueStableIds !== result.rows
  ) {
    throw new Error(`${name}: expected one result per page with a snippet and Open page action; got ${JSON.stringify(result)}`);
  }

  checks.push({ name, status: "pass", detail: result.rows });
}

async function assertSearchResultOpensPage(page: Page, name: string): Promise<void> {
  const firstResult = page.locator(".reader-search-result").first();
  const expectedTitle = normalizeText(await firstResult.locator("h3").textContent());

  if (!expectedTitle) {
    throw new Error(`${name}: first search result did not have a readable title`);
  }

  await firstResult.getByRole("link", { name: "Open page" }).click();
  await page.waitForFunction(
    (title) => document.querySelector(".reader-article-header h1")?.textContent?.replace(/\s+/g, " ").trim() === title,
    expectedTitle,
    { timeout: 15000 }
  );
  await page.getByRole("dialog", { name: "Search pages", exact: true }).waitFor({ state: "hidden" });
  await assertSettledReaderArticleFocus(page, `${name}: source navigation`);
  await assertReaderSearchReturnVisible(page, name);
  await assertElementInViewport(page, ".reader-article", `${name}: opened page in view`);
  await assertReaderArticleDepth(page, `${name}: opened page article depth`);
  checks.push({ name, status: "pass", detail: expectedTitle });
}

async function assertReaderSearchReturnVisible(page: Page, name: string): Promise<void> {
  // Inspect the settled position before any click can scroll the control into view.
  const position = await page.locator(".reader-search-return").evaluate(element => {
    const control = element.getBoundingClientRect();
    const header = document.querySelector(".topbar")?.getBoundingClientRect();
    const visibleHeaderBottom = header && header.bottom > 0 && header.top < window.innerHeight ? header.bottom : 0;
    return { top: control.top, bottom: control.bottom, width: control.width, height: control.height, visibleHeaderBottom, viewportHeight: window.innerHeight };
  });
  readerProof(position.width > 0 && position.height > 0 && position.top >= position.visibleHeaderBottom - 2 && position.bottom <= position.viewportHeight + 2,
    `${name}: Back to search results remains visible below the header after navigation`, JSON.stringify(position));
}

async function selectReaderPageForUat(page: Page, title: string): Promise<void> {
  const navigation = await readerNavigation(page);
  await navigation.getByRole("link", { name: title === "Reader Access and Export Rules" ? "Read vs export" : title, exact: true }).click();

  await page.waitForFunction(
    (expectedTitle) => document.querySelector(".reader-article-header h1")?.textContent?.replace(/\s+/g, " ").trim() === expectedTitle,
    title,
    { timeout: 15000 }
  );
}

async function assertElementInViewport(page: Page, selector: string, name: string): Promise<void> {
  const result = await page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();

    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      viewportHeight: window.innerHeight
    };
  });

  if (result.bottom <= 0 || result.top >= result.viewportHeight) {
    throw new Error(`${name}: expected ${selector} to be visible in the viewport; got ${JSON.stringify(result)}`);
  }

  checks.push({ name, status: "pass", detail: result.top });
}

async function assertProtectedSessionApiRequiresAuthentication(page: Page, name: string): Promise<void> {
  const apiBase = await page.evaluate(() => window.localStorage.getItem("forgetbase-api-url") ?? "/api");
  const apiUrl = new URL(apiBase.endsWith("/") ? apiBase : `${apiBase}/`, baseUrl);
  const response = await page.context().request.get(new URL("auth/me", apiUrl).toString(), {
    headers: { accept: "application/json" }
  });
  let error = "";

  try {
    const payload = await response.json() as { error?: unknown };
    error = typeof payload.error === "string" ? payload.error : "";
  } catch {
    error = "";
  }

  if (response.status() !== 401 || error !== "authentication_required") {
    throw new Error(`${name}: expected 401 authentication_required from auth/me, got ${JSON.stringify({
      status: response.status(),
      error
    })}`);
  }

  checks.push({ name, status: "pass", detail: response.status() });
}

async function assertHeroFits(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const heading = document.querySelector("h1");
    const rect = heading?.getBoundingClientRect();

    return {
      right: rect?.right ?? 0,
      left: rect?.left ?? 0,
      width: rect?.width ?? 0,
      viewport: window.innerWidth
    };
  });

  if (result.left < -1 || result.right > result.viewport + 1) {
    throw new Error(`${name}: hero heading clips viewport (${JSON.stringify(result)})`);
  }

  checks.push({ name, status: "pass", detail: Math.round(result.width) });
}

async function screenshot(page: Page, fileName: string, name: string): Promise<void> {
  const filePath = join(outputDir, fileName);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: filePath, fullPage: true });
  checks.push({ name, status: "pass", detail: filePath });
}

function normalizeText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
