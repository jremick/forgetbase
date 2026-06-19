import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CheckStatus = "pass" | "fail";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results: CheckResult[] = [];

function readRepoFile(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath);

  if (!existsSync(absolutePath)) {
    record("fail", `${relativePath} exists`, "required deployment/security file is missing");
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}

function record(status: CheckStatus, name: string, detail: string): void {
  results.push({ status, name, detail });
  console.error(`[security:check-deployment-defaults] ${status}: ${name}: ${detail}`);
}

function requireIncludes(relativePath: string, content: string, required: string, name: string): void {
  const found = content.includes(required);
  record(
    found ? "pass" : "fail",
    name,
    found ? `${relativePath} contains ${required}` : `${relativePath} is missing ${required}`
  );
}

function parseStrictBoolean(name: string): boolean | undefined {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return undefined;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  record("fail", `${name} value`, "must be exactly true or false when set");
  return undefined;
}

function isLocalPortBinding(raw: string | undefined): boolean {
  if (!raw) {
    return false;
  }

  const value = raw.trim();

  return value.startsWith("127.0.0.1:") ||
    value.startsWith("localhost:") ||
    value.startsWith("[::1]:");
}

function isHttpsOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();

    return parsed.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "::1";
  } catch {
    return false;
  }
}

function checkTemplatePosture(): void {
  const compose = readRepoFile("compose.yaml");
  const composeSameOrigin = readRepoFile("compose.same-origin.yaml");
  const composeTls = readRepoFile("compose.tls.yaml");
  const sameOriginNginx = readRepoFile("infra/docker/nginx.same-origin.conf");
  const tlsNginx = readRepoFile("infra/docker/nginx.tls.conf");
  const railwayNginx = readRepoFile("infra/docker/nginx.railway-proxy.conf.template");
  const railwayRunbook = readRepoFile("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md");
  const dockerRunbook = readRepoFile("docs/runbooks/DEPLOY_DOCKER_COMPOSE.md");
  const server = readRepoFile("apps/api/src/server.ts");

  requireIncludes("compose.yaml", compose, "HOST: 0.0.0.0", "local Compose direct API bind remains explicit");
  requireIncludes("compose.yaml", compose, "${AGENTIC_CMS_API_PORT:-3000}:3000", "local Compose API port remains overrideable");
  requireIncludes("compose.same-origin.yaml", composeSameOrigin, "proxy:", "same-origin proxy overlay exists");
  requireIncludes("infra/docker/nginx.same-origin.conf", sameOriginNginx, "location /api/", "same-origin proxy routes API under /api");
  requireIncludes("compose.tls.yaml", composeTls, "AGENTIC_CMS_SESSION_COOKIE_SECURE: \"true\"", "TLS overlay enables secure browser cookies");
  requireIncludes("infra/docker/nginx.tls.conf", tlsNginx, "Strict-Transport-Security", "TLS proxy sets HSTS");
  requireIncludes("infra/docker/nginx.railway-proxy.conf.template", railwayNginx, "location = /api/auth/bootstrap", "Railway proxy template gates bootstrap route");
  requireIncludes("infra/docker/nginx.railway-proxy.conf.template", railwayNginx, "return 404;", "Railway proxy template blocks bootstrap exposure");
  requireIncludes("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md", railwayRunbook, "AGENTIC_CMS_REQUIRE_AUTHENTICATION=true", "Railway public template requires auth");
  requireIncludes("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md", railwayRunbook, "AGENTIC_CMS_SESSION_COOKIE_SECURE=true", "Railway public template requires secure cookies");
  requireIncludes("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md", railwayRunbook, "api` and `web` have no public domains", "Railway template keeps api/web private");
  requireIncludes("docs/runbooks/DEPLOY_DOCKER_COMPOSE.md", dockerRunbook, "security:check-deployment-defaults", "Docker runbook documents deployment-default gate");

  const publicAuthBlockMatch = server.match(/function isPublicAuthenticationPath[\s\S]*?\n}/);

  if (!publicAuthBlockMatch) {
    record("fail", "server public auth path inspection", "could not find isPublicAuthenticationPath");
    return;
  }

  const exposesBootstrap = publicAuthBlockMatch[0].includes("/auth/bootstrap");
  record(
    exposesBootstrap ? "fail" : "pass",
    "require-auth bootstrap behavior",
    exposesBootstrap ? "/auth/bootstrap is exempt from global auth" : "/auth/bootstrap is not exempt from global require-auth"
  );
}

function checkPublicEnvironment(): void {
  const publicDeployment = parseStrictBoolean("AGENTIC_CMS_PUBLIC_DEPLOYMENT") === true;

  if (!publicDeployment) {
    record(
      "pass",
      "public deployment mode",
      "AGENTIC_CMS_PUBLIC_DEPLOYMENT is not true; local OSS bootstrap defaults are allowed"
    );
    return;
  }

  const requireAuthentication = parseStrictBoolean("AGENTIC_CMS_REQUIRE_AUTHENTICATION");
  const secureCookies = parseStrictBoolean("AGENTIC_CMS_SESSION_COOKIE_SECURE");

  record(
    requireAuthentication === true ? "pass" : "fail",
    "public auth requirement",
    "AGENTIC_CMS_REQUIRE_AUTHENTICATION must be true for public deployment checks"
  );
  record(
    secureCookies === true ? "pass" : "fail",
    "public secure-cookie requirement",
    "AGENTIC_CMS_SESSION_COOKIE_SECURE must be true for public browser-cookie deployment checks"
  );

  const publicEntrypoint = process.env.AGENTIC_CMS_PUBLIC_ENTRYPOINT;
  const validEntrypoints = new Set(["same-origin-proxy", "compose-tls", "external-tls-proxy", "railway-proxy"]);
  record(
    publicEntrypoint !== undefined && validEntrypoints.has(publicEntrypoint) ? "pass" : "fail",
    "public entrypoint shape",
    "AGENTIC_CMS_PUBLIC_ENTRYPOINT must be one of same-origin-proxy, compose-tls, external-tls-proxy, railway-proxy"
  );

  const corsOrigins = process.env.AGENTIC_CMS_CORS_ALLOWED_ORIGINS;
  const origins = corsOrigins?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  const originsArePublicHttps = origins.length > 0 && origins.every(isHttpsOrigin);
  record(
    originsArePublicHttps ? "pass" : "fail",
    "public CORS origins",
    "AGENTIC_CMS_CORS_ALLOWED_ORIGINS must contain only approved https origins, not localhost or wildcards"
  );

  const directPortNames = ["AGENTIC_CMS_API_PORT", "AGENTIC_CMS_WEB_PORT", "AGENTIC_CMS_POSTGRES_PORT"];

  if (publicEntrypoint === "railway-proxy") {
    record("pass", "public direct Compose binds", "railway-proxy mode does not use local Compose direct service port binds");
  } else {
    for (const name of directPortNames) {
      record(
        isLocalPortBinding(process.env[name]) ? "pass" : "fail",
        `${name} public bind`,
        `${name} must be explicitly bound to 127.0.0.1, localhost, or [::1] in public Compose checks`
      );
    }
  }

  if (publicEntrypoint === "compose-tls") {
    record(
      Boolean(process.env.AGENTIC_CMS_HTTPS_PORT) ? "pass" : "fail",
      "Compose TLS public HTTPS port",
      "AGENTIC_CMS_HTTPS_PORT must be set when compose-tls is the public entrypoint"
    );
    record(
      isLocalPortBinding(process.env.AGENTIC_CMS_PROXY_PORT) ? "pass" : "fail",
      "Compose TLS plain HTTP listener",
      "AGENTIC_CMS_PROXY_PORT should be explicitly localhost-bound so public traffic uses HTTPS"
    );
  }

  if (publicEntrypoint === "external-tls-proxy") {
    record(
      isLocalPortBinding(process.env.AGENTIC_CMS_PROXY_PORT) ? "pass" : "fail",
      "external TLS upstream listener",
      "AGENTIC_CMS_PROXY_PORT must be localhost-bound behind the external TLS edge"
    );
  }
}

function main(): void {
  checkTemplatePosture();
  checkPublicEnvironment();

  const failures = results.filter((result) => result.status === "fail");

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    checked: results.length,
    publicDeployment: parseStrictBoolean("AGENTIC_CMS_PUBLIC_DEPLOYMENT") === true
  }, null, 2));
}

main();
