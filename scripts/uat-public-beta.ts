import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

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
const outputDir = resolve(process.env.UAT_OUTPUT_DIR ?? join(root, "work/public-beta-uat"));
const shouldStartServer = !process.env.UAT_BASE_URL;
const baseUrl = process.env.UAT_BASE_URL ?? "http://127.0.0.1:4175/";
const tenantId = process.env.UAT_TENANT_ID ?? "";
const email = process.env.UAT_EMAIL ?? (isLocalUrl(baseUrl) ? "admin@example.test" : "");
const password = process.env.UAT_PASSWORD ?? (isLocalUrl(baseUrl) ? "local-dev-password" : "");
const commitSha = commandOutput("git", ["rev-parse", "HEAD"]) ?? "";
const checks: CheckResult[] = [];
const consoleProblems: string[] = [];
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

    const releaseMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    trackConsole(releaseMobile);
    await checkReleaseFlow(releaseMobile, "mobile");
    await releaseMobile.close();
  }

  if (consoleProblems.length) {
    throw new Error(`Browser console warnings/errors:\n${consoleProblems.join("\n")}`);
  }

  const report = {
    mode,
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

  await expectText(page, "h1", "A knowledge base for people and AI tools.", `${viewportName}: public h1`);
  await expectTitle(page, "ForgetBase | Knowledge Base for People and AI Tools", `${viewportName}: page title`);
  await expectVisibleText(page, "Write and organize company knowledge once.", `${viewportName}: public lede`);
  await expectVisibleText(page, "People get a clean wiki-style reading view.", `${viewportName}: public reader lede`);
  await expectVisibleText(page, "Reader and admin separated", `${viewportName}: trust badge`);
  await expectVisibleText(page, "Useful beta, clear limits.", `${viewportName}: beta boundary`);
  await expectVisibleText(page, "Read pages", `${viewportName}: beta path read`);
  await expectVisibleText(page, "Search with sources", `${viewportName}: beta path search`);
  await expectVisibleText(page, "Manage content", `${viewportName}: beta path manage`);
  await expectVisibleText(page, "Check exports", `${viewportName}: beta path exports`);
  await assertNoJargon(page, "main", `${viewportName}: public copy`);
  await assertNoHorizontalOverflow(page, `${viewportName}: public overflow`);
  await assertNoClippedText(page, `${viewportName}: public clipped text`);
  await assertHeroFits(page, `${viewportName}: hero fits`);
  await screenshot(page, `public-${viewportName}.png`, `${viewportName}: public screenshot`);
}

async function checkReleaseFlow(page: Page, viewportName: "desktop" | "mobile"): Promise<void> {
  if (!email || !password) {
    throw new Error("Release UAT requires UAT_EMAIL and UAT_PASSWORD unless UAT_BASE_URL is localhost.");
  }

  await applyTenantOverride(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await clickFirstVisible(page, "button", "Log in");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator(".public-login-form button[type='submit']").click();
  await page.waitForSelector(".app-shell.reader-shell", { timeout: 15000 });
  await page.waitForSelector(".reader-ask-panel", { timeout: 15000 });
  await page.waitForSelector("#reader-title", { timeout: 15000 });

  await expectText(page, "#reader-title", "Pages", `release ${viewportName}: reader title`);
  await expectVisibleText(page, "Published pages", `release ${viewportName}: reader summary`);
  await expectVisibleText(page, "Ask with sources", `release ${viewportName}: reader ask heading`);
  if (viewportName === "desktop") {
    await screenshot(page, "page-browse-tree.png", "release desktop: reader page tree screenshot");
    await screenshot(page, "page-read-view.png", "release desktop: reader page read screenshot");
  }
  await page.locator("#reader-ask-input").fill("What should be redacted?");
  await page.locator(".reader-ask-form button[type='submit']").click();
  await page.waitForSelector(".reader-ask-answer", { timeout: 15000 });
  await expectVisibleText(page, "Answer", `release ${viewportName}: reader ask answer`);
  await expectVisibleText(page, "Sources", `release ${viewportName}: reader ask sources`);
  await assertNoClippedText(page, `release ${viewportName}: reader ask clipped text`);
  await screenshot(page, viewportName === "desktop" ? "ask-with-sources.png" : "ask-with-sources-mobile.png", `release ${viewportName}: ask with sources screenshot`);
  await page.locator("#reader-search-input").fill("personal data");
  await expectVisibleText(page, "Personal Data", `release ${viewportName}: reader search`);
  if (viewportName === "desktop") {
    await screenshot(page, "search-results.png", "release desktop: reader search results screenshot");
  }
  await assertNoJargon(page, "main", `release ${viewportName}: reader copy`);
  await assertNoHorizontalOverflow(page, `release ${viewportName}: reader overflow`);
  await assertNoClippedText(page, `release ${viewportName}: reader clipped text`);
  if (viewportName === "desktop" && expectedRole === "reader") {
    await page.locator("#reader-ask-input").fill("credential vault escalation");
    await page.locator(".reader-ask-form button[type='submit']").click();
    await expectVisibleText(page, "Some results hidden", "release desktop: restricted result badge");
    await expectVisibleText(page, "restricted result", "release desktop: restricted result note");
    await assertNoHorizontalOverflow(page, "release desktop: restricted result overflow");
    await assertNoClippedText(page, "release desktop: restricted result clipped text");
    await screenshot(page, "no-access-restricted-state.png", "release desktop: restricted result screenshot");
  }
  await screenshot(page, `reader-${viewportName}.png`, `release ${viewportName}: reader screenshot`);

  if (expectedRole === "reader") {
    await expectHiddenText(page, "Admin console", `release ${viewportName}: reader has no admin handoff`);
    await page.goto(`${baseUrl.replace(/#.*$/, "")}#settings`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#reader-title", { timeout: 10000 });
    const hash = await page.evaluate(() => window.location.hash);
    if (hash !== "#reader") {
      throw new Error(`Reader direct admin route was not forced back to #reader; got ${hash}`);
    }
    checks.push({ name: `release ${viewportName}: reader direct admin route forced back`, status: "pass", detail: hash });
    return;
  }

  if (viewportName === "mobile") {
    return;
  }

  await clickUnique(page, "button", "Admin console");
  await page.waitForSelector(".side-nav", { timeout: 10000 });
  await expectVisibleText(page, "Content", "release: admin content label");
  await expectVisibleText(page, "Reviews", "release: admin reviews label");
  await expectVisibleText(page, "Exports", "release: admin exports label");
  await expectVisibleText(page, "System", "release: admin system label");
  await assertNoHorizontalOverflow(page, "release: admin desktop overflow");
  await assertNoClippedText(page, "release: admin desktop clipped text");
  await screenshot(page, "admin-desktop.png", "release: admin screenshot");
  await screenshotAdminRoute(page, "review", "Review queue", "reviews.png", "release: admin reviews screenshot");
  await screenshotAdminRoute(page, "policies", "Telemetry retention", "policies.png", "release: admin policies screenshot");
  await screenshotAdminRoute(page, "access", "Users", "access-management.png", "release: admin access screenshot");
  await screenshotAdminRoute(page, "approvals", "Action execution", "approvals.png", "release: admin approvals screenshot");
  await screenshotExportRoute(page);
}

async function applyTenantOverride(page: Page): Promise<void> {
  await page.context().clearCookies();

  await page.addInitScript((value) => {
    window.localStorage.removeItem("forgetbase-api-key");
    window.localStorage.removeItem("forgetbase-session-cookie-active");
    window.localStorage.removeItem("forgetbase-login-email");

    if (value) {
      window.localStorage.setItem("forgetbase-login-tenant", value);
    } else {
      window.localStorage.removeItem("forgetbase-login-tenant");
    }
  }, tenantId);
}

function routeUrl(route: string): string {
  const url = new URL(baseUrl);
  url.hash = route;
  return url.toString();
}

async function screenshotAdminRoute(
  page: Page,
  route: string,
  expectedText: string,
  fileName: string,
  name: string
): Promise<void> {
  await page.goto(routeUrl(route), { waitUntil: "domcontentloaded" });
  await expectVisibleText(page, expectedText, `${name}: route loaded`);
  await assertNoHorizontalOverflow(page, `${name}: overflow`);
  await assertNoClippedText(page, `${name}: clipped text`);
  await screenshot(page, fileName, name);
}

async function screenshotExportRoute(page: Page): Promise<void> {
  await page.goto(routeUrl("distribute"), { waitUntil: "domcontentloaded" });
  await expectVisibleText(page, "Package builder", "release: admin exports route loaded");
  await page.getByRole("button", { name: /^Generate$/ }).click();
  await expectVisibleText(page, "Included stable IDs", "release: admin export generated");
  await assertNoHorizontalOverflow(page, "release: admin exports overflow");
  await assertNoClippedText(page, "release: admin exports clipped text");
  await screenshot(page, "exports.png", "release: admin exports screenshot");
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

async function assertProtectedSessionApiRequiresAuthentication(page: Page, name: string): Promise<void> {
  const response = await page.context().request.get(new URL("/api/auth/me", baseUrl).toString(), {
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
    throw new Error(`${name}: expected 401 authentication_required from /api/auth/me, got ${JSON.stringify({
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
  await page.screenshot({ path: filePath, fullPage: true });
  checks.push({ name, status: "pass", detail: filePath });
}

function normalizeText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
