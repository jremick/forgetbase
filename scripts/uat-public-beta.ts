import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, type Browser, type Page, type Request } from "@playwright/test";

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
let server: Server | undefined;
let browser: Browser | undefined;

try {
  mkdirSync(outputDir, { recursive: true });

  if (shouldStartServer) {
    server = await startStaticDistServer(baseUrl);
  }

  browser = await chromium.launch({ headless: true });

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  trackConsole(desktop);
  await checkPublicEntry(desktop, "desktop");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  trackConsole(mobile);
  await checkPublicEntry(mobile, "mobile");
  await mobile.close();

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
    mode,
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
      consoleProblems.push(`${message.type()}: ${message.text()}`);
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

    consoleProblems.push(`requestfailed: ${request.method()} ${url} ${request.failure()?.errorText ?? ""}`.trim());
  });
}

async function checkPublicEntry(page: Page, viewportName: "desktop" | "mobile"): Promise<void> {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  if (!shouldStartServer && viewportName === "desktop") {
    await assertProtectedSessionApiRequiresAuthentication(page, `${viewportName}: protected session API requires authentication`);
  }

  await expectText(page, "h1", `Log in to ${expectedBrandName}`, `${viewportName}: login h1`);
  await expectTitle(page, "ForgetBase | Knowledge Base for People and AI Tools", `${viewportName}: page title`);
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
  await page.waitForSelector(
    viewportName === "desktop" ? ".reader-library" : ".reader-mobile-page-picker",
    { timeout: 15000 }
  );
  await page.waitForSelector(".reader-article", { timeout: 15000 });
  await page.waitForSelector(".reader-page-footer", { timeout: 15000 });

  const readerPageNavigation = viewportName === "desktop"
    ? page.locator(".reader-library .nav-chrome-label")
    : page.locator(".reader-mobile-page-picker");
  await readerPageNavigation.filter({ hasText: /pages/i }).waitFor({ state: "visible", timeout: 15000 });
  checks.push({ name: `release ${viewportName}: reader page navigation`, status: "pass" });
  if (viewportName === "desktop") {
    await expectVisibleText(page, "Cmd K", `release ${viewportName}: reader search shortcut`);
  }
  if (viewportName === "mobile") {
    await assertMobileReaderPagePicker(page, `release ${viewportName}: reader page picker`);
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
  await assertReaderPageFooter(page, `release ${viewportName}: reader page footer`);
  if (viewportName === "desktop") {
    await screenshot(page, "page-browse-tree.png", "release desktop: reader page tree screenshot");
    await screenshot(page, "page-read-view.png", "release desktop: reader page read screenshot");
  }
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
  await assertNoJargon(page, "main", `release ${viewportName}: reader copy`);
  await assertNoHorizontalOverflow(page, `release ${viewportName}: reader overflow`);
  await assertNoClippedText(page, `release ${viewportName}: reader clipped text`);
  if (viewportName === "desktop" && expectedRole === "reader") {
    await page.locator("#reader-ask-input").fill("credential vault escalation");
    await page.locator(".reader-ask-form button[type='submit']").click();
    await expectVisibleText(page, "No matching sources", "release desktop: no accessible sources badge");
    await expectVisibleText(page, "No accessible answer was found", "release desktop: restricted result note");
    await assertNoHorizontalOverflow(page, "release desktop: restricted result overflow");
    await assertNoClippedText(page, "release desktop: restricted result clipped text");
    await screenshot(page, "no-access-restricted-state.png", "release desktop: restricted result screenshot");
  }
  await screenshot(page, `reader-${viewportName}.png`, `release ${viewportName}: reader screenshot`);

  if (expectedRole === "reader") {
    await assertReaderHasNoAdminControls(page, `release ${viewportName}: reader has no admin controls`);
    await page.goto(routeUrl(page, "admin/system/settings"), { waitUntil: "domcontentloaded" });
    await expectVisibleText(page, "This area is unavailable for your account", `release ${viewportName}: reader direct admin route denied`);
    await assertReaderHasNoAdminControls(page, `release ${viewportName}: denied route exposes no admin controls`);
    await page.getByRole("button", { name: "Back to pages", exact: true }).click();
    await page.waitForSelector(".reader-article", { timeout: 10000 });
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

async function checkAdminBranding(page: Page): Promise<void> {
  // Exercise the actual Railway image policy even when the isolated Compose
  // proxy does not add it. Upload previews must not require a weaker policy.
  const proxyConfig = readFileSync(resolve(root, "infra/docker/nginx.railway-proxy.conf.template"), "utf8");
  const policy = proxyConfig.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];
  if (!policy) throw new Error("Railway content security policy was not found");
  const brandingPage = await page.context().newPage();
  trackConsole(brandingPage);
  await brandingPage.setViewportSize({ width: 1280, height: 800 });
  await brandingPage.route("**/*", async route => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
  });
  try {
    await brandingPage.goto(routeUrl(page, "admin/system/settings"), { waitUntil: "domcontentloaded" });
    const field = brandingPage.getByRole("textbox", { name: "Logo text", exact: true });
    await field.waitFor({ state: "visible" });
    if (await field.inputValue() !== "ForgetBase" || await brandingPage.locator(".branding-preview img").count()) {
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
    await brandingPage.getByRole("button", { name: "Save", exact: true }).click();
    await expectVisibleText(brandingPage, "Branding saved.", "branding: custom image and text saved");
    await brandingPage.reload({ waitUntil: "domcontentloaded" });
    await field.waitFor({ state: "visible" });
    if (await field.inputValue() !== "Field Notes & Research" || await brandingPage.locator(".branding-preview img").getAttribute("src") !== logoUrl) {
      throw new Error("Branding did not persist the exact uploaded image and text after reload");
    }
    checks.push({ name: "branding: exact image and text persist after reload", status: "pass" });
    await screenshot(brandingPage, "branding-desktop.png", "branding: desktop screenshot");
    await brandingPage.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(brandingPage, "branding: mobile overflow");
    await screenshot(brandingPage, "branding-mobile.png", "branding: mobile screenshot");
    await brandingPage.getByRole("button", { name: "Restore defaults", exact: true }).click();
    await brandingPage.getByRole("button", { name: "Save", exact: true }).click();
    await expectVisibleText(brandingPage, "Branding saved.", "branding: defaults restored");
  } finally {
    await brandingPage.close();
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
  await page.goto(routeUrl(page, "reader"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".reader-article", { timeout: 15000 });
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
  await page.waitForSelector(splitOrigin ? "#login-email" : ".reader-article", { timeout: 15000 });
  await waitForSettledRequests(page);
  checks.push({ name: `release ${viewportName}: ${splitOrigin ? "reload discards development bearer credential" : "cookie session survives reload"}`, status: "pass" });
}

async function waitForSettledRequests(page: Page): Promise<void> {
  const traffic = pageTraffic.get(page);
  if (!traffic) throw new Error("Page request tracking was not initialized");
  const deadline = Date.now() + 15000;
  while (traffic.pending.size || Date.now() - traffic.changedAt < 500) {
    if (Date.now() >= deadline) throw new Error("Background requests did not settle before the credential reload check");
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}

function routeUrl(page: Page, route: string): string {
  const url = new URL(page.url());
  url.hash = route;
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

async function assertNoJargon(page: Page, selector: string, name: string): Promise<void> {
  const text = await page.locator(selector).textContent();
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

async function assertMobileReaderPagePicker(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const picker = document.querySelector<HTMLElement>(".reader-mobile-page-picker");
    const desktopNavigation = document.querySelector<HTMLElement>(".reader-library");
    const select = picker?.querySelector<HTMLSelectElement>("select");
    const rect = picker?.getBoundingClientRect();
    const desktopRect = desktopNavigation?.getBoundingClientRect();

    return {
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      desktopNavigationVisible: Boolean(desktopRect && desktopRect.width > 0 && desktopRect.height > 0),
      label: picker?.textContent?.includes("Pages") ?? false,
      options: select?.options.length ?? 0,
      value: select?.value ?? ""
    };
  });

  if (!result.visible || result.desktopNavigationVisible || !result.label || result.options < 2 || !result.value) {
    throw new Error(`${name}: expected one visible mobile page picker and a hidden desktop tree; got ${JSON.stringify(result)}`);
  }

  checks.push({ name, status: "pass", detail: result.options });
}

async function assertReaderNestedNavigation(page: Page, name: string): Promise<void> {
  const mobilePicker = page.locator(".reader-mobile-page-picker");
  if (await mobilePicker.isVisible()) {
    await mobilePicker.locator("select").selectOption({ label: "Reader Nested Navigation Example" });
  } else {
    for (const label of ["Reader experience", "Lifecycle states"]) {
      const expand = page.getByRole("button", { name: `Expand ${label} pages`, exact: true });
      if (await expand.isVisible()) await expand.click();
      await page.getByRole("button", { name: `Collapse ${label} pages`, exact: true }).waitFor({ state: "visible" });
    }
    await page.getByRole("link", { name: "Nested page sample", exact: true }).click();
  }
  await page.waitForFunction(
    () => document.querySelector(".reader-article-header h1")?.textContent?.replace(/\s+/g, " ").trim() === "Reader Nested Navigation Example",
    undefined,
    { timeout: 15000 }
  );
  await assertReaderArticleDepth(page, `${name}: nested article depth`);
  checks.push({ name, status: "pass", detail: "Reader experience > Lifecycle states > Nested page sample" });
}

async function assertReaderPageFooter(page: Page, name: string): Promise<void> {
  const result = await page.evaluate(() => {
    const footer = document.querySelector<HTMLElement>(".reader-page-footer");
    const terms = Array.from(footer?.querySelectorAll("dt") ?? [])
      .map((term) => term.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
    const values = Array.from(footer?.querySelectorAll("dd") ?? [])
      .map((value) => value.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
    const rect = footer?.getBoundingClientRect();

    return {
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      heading: footer?.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      terms,
      values
    };
  });

  if (!result.visible || result.heading || result.terms.length < 3 || result.values.length < 3) {
    throw new Error(`${name}: expected a compact page details footer with configured fields and no heading; got ${JSON.stringify(result)}`);
  }

  checks.push({ name, status: "pass", detail: result.terms.join(", ") });
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

  if (await page.locator(".reader-section-nav").getAttribute("open") === null) {
    await page.locator(".reader-section-nav > summary").click();
  }
  await page.locator(".reader-section-nav button").first().click();
  await assertElementInViewport(page, ".reader-document-body h2[id], .reader-document-body h3[id]", `${name}: section link scrolls to heading`);
  await page.evaluate(() => window.scrollTo(0, 0));
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
  await assertElementInViewport(page, ".reader-article", `${name}: opened page in view`);
  await assertReaderArticleDepth(page, `${name}: opened page article depth`);
  checks.push({ name, status: "pass", detail: expectedTitle });
}

async function selectReaderPageForUat(page: Page, title: string): Promise<void> {
  const mobilePicker = page.locator(".reader-mobile-page-picker");

  if (await mobilePicker.isVisible()) {
    await mobilePicker.locator("select").selectOption({ label: title });
  } else {
    await clickFirstVisible(page, "a", title === "Reader Access and Export Rules" ? "Read vs export" : title);
  }

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
