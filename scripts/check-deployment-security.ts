import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

interface ComposeSecurityExpectation {
  requireAuthentication: boolean;
  secureCookies: boolean;
  corsAllowedOrigins?: string;
}

export function resolveComposeConfiguration(
  files: readonly string[],
  environment: NodeJS.ProcessEnv,
  root = repoRoot
): unknown {
  try {
    const output = execFileSync("docker", [
      "compose", "--project-directory", root,
      ...files.flatMap((file) => ["-f", path.resolve(root, file)]),
      "config", "--format", "json"
    ], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...environment,
        COMPOSE_DISABLE_ENV_FILE: "true"
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
      maxBuffer: 5 * 1024 * 1024
    });
    return JSON.parse(output);
  } catch {
    // Compose errors can include interpolated secrets. Never echo its output.
    throw new Error("Unable to resolve Compose configuration; Docker Compose must be installed and the configuration must be valid.");
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function validateComposeApiSecurity(
  configuration: unknown,
  expected: ComposeSecurityExpectation
): string[] {
  const services = asRecord(asRecord(configuration)?.services);
  const environment = asRecord(asRecord(services?.api)?.environment);
  const required: Record<string, string> = {
    FORGETBASE_REQUIRE_AUTHENTICATION: String(expected.requireAuthentication),
    FORGETBASE_SESSION_COOKIE_SECURE: String(expected.secureCookies),
    FORGETBASE_ATTACHMENT_SCAN_REQUIRED: "true"
  };
  if (expected.corsAllowedOrigins !== undefined) {
    required.FORGETBASE_CORS_ALLOWED_ORIGINS = expected.corsAllowedOrigins;
  }
  return Object.entries(required)
    .filter(([name, value]) => environment?.[name] !== value)
    .map(([name]) => `${name} is missing or differs from the required API container setting`);
}

function checkResolvedCompose(
  name: string,
  files: readonly string[],
  environment: NodeJS.ProcessEnv,
  expected: ComposeSecurityExpectation
): void {
  try {
    const failures = validateComposeApiSecurity(resolveComposeConfiguration(files, environment), expected);
    record(failures.length === 0 ? "pass" : "fail", name,
      failures.length === 0 ? "resolved API container security settings match the required posture" : failures.join("; "));
  } catch {
    record("fail", name, "Compose configuration could not be resolved; no container settings were verified");
  }
}

function checkResolvedTemplatePosture(): void {
  checkResolvedCompose("resolved local Compose defaults", ["compose.yaml"], {}, {
    requireAuthentication: false, secureCookies: false
  });
  const publicEnvironment = {
    FORGETBASE_REQUIRE_AUTHENTICATION: "true",
    FORGETBASE_SESSION_COOKIE_SECURE: "true",
    FORGETBASE_CORS_ALLOWED_ORIGINS: "https://knowledge.example.test"
  };
  for (const files of [["compose.yaml"], ["compose.yaml", "compose.same-origin.yaml"]]) {
    checkResolvedCompose(`resolved public ${files.join(" + ")}`, files, publicEnvironment, {
      requireAuthentication: true,
      secureCookies: true,
      corsAllowedOrigins: publicEnvironment.FORGETBASE_CORS_ALLOWED_ORIGINS
    });
  }
  checkResolvedCompose("resolved TLS overlay security", ["compose.yaml", "compose.same-origin.yaml", "compose.tls.yaml"], {
    ...publicEnvironment,
    FORGETBASE_SESSION_COOKIE_SECURE: "false"
  }, { requireAuthentication: true, secureCookies: true });
}

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
  const nodeDockerfile = readRepoFile("infra/docker/node.Dockerfile");
  const railwayApiDockerfile = readRepoFile("infra/docker/railway-api.Dockerfile");
  const railwayWorkerDockerfile = readRepoFile("infra/docker/railway-worker.Dockerfile");
  const railwayWebDockerfile = readRepoFile("infra/docker/railway-web.Dockerfile");
  const railwayProxyDockerfile = readRepoFile("infra/docker/railway-proxy.Dockerfile");
  const railwayRunbook = readRepoFile("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md");
  const dockerRunbook = readRepoFile("docs/runbooks/DEPLOY_DOCKER_COMPOSE.md");
  const server = readRepoFile("apps/api/src/server.ts");

  requireIncludes("compose.yaml", compose, "HOST: 0.0.0.0", "API listens on the container network");
  requireIncludes("compose.yaml", compose, "${FORGETBASE_POSTGRES_PORT:-127.0.0.1:5432}:5432", "local Compose Postgres defaults to loopback");
  requireIncludes("compose.yaml", compose, "${FORGETBASE_API_PORT:-127.0.0.1:3000}:3000", "local Compose API defaults to loopback");
  requireIncludes("compose.yaml", compose, "${FORGETBASE_WEB_PORT:-127.0.0.1:5175}:4173", "local Compose web preview defaults to loopback");
  requireIncludes("compose.yaml", compose, "clamav/clamav:1.5.4-debian13-slim@sha256:", "Compose pins the ClamAV image by digest");
  requireIncludes("compose.yaml", compose, "FORGETBASE_ATTACHMENT_SCAN_REQUIRED: \"true\"", "Compose requires attachment malware scanning");
  requireIncludes("compose.yaml", compose, "FORGETBASE_ATTACHMENT_RECONCILIATION_DRY_RUN: \"true\"", "scheduled attachment reconciliation defaults to dry-run");
  const clamavServiceMatch = compose.match(/\n  clamav:[\s\S]*?\n  api:/);
  record(
    clamavServiceMatch && !clamavServiceMatch[0].includes("ports:") ? "pass" : "fail",
    "ClamAV network exposure",
    "Compose ClamAV must remain internal and have no host port mapping"
  );
  requireIncludes("compose.same-origin.yaml", composeSameOrigin, "proxy:", "same-origin proxy overlay exists");
  requireIncludes("compose.same-origin.yaml", composeSameOrigin, "${FORGETBASE_PROXY_PORT:-127.0.0.1:8080}:8080", "same-origin proxy defaults to loopback");
  requireIncludes("infra/docker/nginx.same-origin.conf", sameOriginNginx, "location /api/", "same-origin proxy routes API under /api");
  requireIncludes("compose.tls.yaml", composeTls, "FORGETBASE_SESSION_COOKIE_SECURE: \"true\"", "TLS overlay enables secure browser cookies");
  requireIncludes("infra/docker/nginx.tls.conf", tlsNginx, "Strict-Transport-Security", "TLS proxy sets HSTS");
  requireIncludes("infra/docker/nginx.railway-proxy.conf.template", railwayNginx, "location = /api/auth/bootstrap", "Railway proxy template gates bootstrap route");
  requireIncludes("infra/docker/nginx.railway-proxy.conf.template", railwayNginx, "return 404;", "Railway proxy template blocks bootstrap exposure");
  requireIncludes("infra/docker/nginx.railway-proxy.conf.template", railwayNginx, "${FORGETBASE_API_UPSTREAM_PORT}", "Railway proxy template uses a configurable internal API port");
  requireIncludes("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md", railwayRunbook, "FORGETBASE_REQUIRE_AUTHENTICATION=true", "Railway public template requires auth");
  requireIncludes("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md", railwayRunbook, "FORGETBASE_SESSION_COOKIE_SECURE=true", "Railway public template requires secure cookies");
  requireIncludes("docs/runbooks/DEPLOY_RAILWAY_PRIVATE_TEMPLATE.md", railwayRunbook, "api` and `web` have no public domains", "Railway template keeps api/web private");
  requireIncludes("docs/runbooks/DEPLOY_DOCKER_COMPOSE.md", dockerRunbook, "security:check-deployment-defaults", "Docker runbook documents deployment-default gate");
  requireIncludes("infra/docker/node.Dockerfile", nodeDockerfile, "pnpm install --frozen-lockfile", "Compose image uses the frozen lockfile");
  requireIncludes("infra/docker/node.Dockerfile", nodeDockerfile, "USER node", "Compose application image runs as non-root");
  requireIncludes("infra/docker/railway-api.Dockerfile", railwayApiDockerfile, "USER node", "Railway API image runs as non-root");
  requireIncludes("infra/docker/railway-worker.Dockerfile", railwayWorkerDockerfile, "USER node", "Railway worker image runs as non-root");
  requireIncludes("infra/docker/railway-web.Dockerfile", railwayWebDockerfile, "USER node", "Railway web image runs as non-root");
  requireIncludes("infra/docker/railway-proxy.Dockerfile", railwayProxyDockerfile, "pnpm install --frozen-lockfile", "Railway proxy build uses the frozen lockfile");
  requireIncludes("infra/docker/railway-proxy.Dockerfile", railwayProxyDockerfile, "USER nginx", "Railway proxy image runs as non-root");
  requireIncludes("infra/docker/railway-proxy.Dockerfile", railwayProxyDockerfile, "pid /tmp/nginx.pid", "Railway proxy uses a non-root-writable PID path");
  requireIncludes("infra/docker/railway-proxy.Dockerfile", railwayProxyDockerfile, "FORGETBASE_API_UPSTREAM_PORT=8080", "Railway proxy defaults the internal API port to Railway's runtime port");
  requireIncludes("apps/api/src/server.ts", server, "server.get(\"/ready\"", "API exposes a database-aware readiness route");

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
  const publicDeployment = parseStrictBoolean("FORGETBASE_PUBLIC_DEPLOYMENT") === true;

  if (!publicDeployment) {
    record(
      "pass",
      "public deployment mode",
      "FORGETBASE_PUBLIC_DEPLOYMENT is not true; local OSS bootstrap defaults are allowed"
    );
    return;
  }

  const requireAuthentication = parseStrictBoolean("FORGETBASE_REQUIRE_AUTHENTICATION");
  const secureCookies = parseStrictBoolean("FORGETBASE_SESSION_COOKIE_SECURE");
  const attachmentScanRequired = parseStrictBoolean("FORGETBASE_ATTACHMENT_SCAN_REQUIRED");

  record(
    requireAuthentication === true ? "pass" : "fail",
    "public auth requirement",
    "FORGETBASE_REQUIRE_AUTHENTICATION must be true for public deployment checks"
  );
  record(
    secureCookies === true ? "pass" : "fail",
    "public secure-cookie requirement",
    "FORGETBASE_SESSION_COOKIE_SECURE must be true for public browser-cookie deployment checks"
  );
  record(
    attachmentScanRequired === true ? "pass" : "fail",
    "public attachment scanning requirement",
    "FORGETBASE_ATTACHMENT_SCAN_REQUIRED must be true for public deployment checks"
  );

  const publicEntrypoint = process.env.FORGETBASE_PUBLIC_ENTRYPOINT;
  const validEntrypoints = new Set(["same-origin-proxy", "compose-tls", "external-tls-proxy", "railway-proxy"]);
  record(
    publicEntrypoint !== undefined && validEntrypoints.has(publicEntrypoint) ? "pass" : "fail",
    "public entrypoint shape",
    "FORGETBASE_PUBLIC_ENTRYPOINT must be one of same-origin-proxy, compose-tls, external-tls-proxy, railway-proxy"
  );

  const corsOrigins = process.env.FORGETBASE_CORS_ALLOWED_ORIGINS;
  const origins = corsOrigins?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  const originsArePublicHttps = origins.length > 0 && origins.every(isHttpsOrigin);
  record(
    originsArePublicHttps ? "pass" : "fail",
    "public CORS origins",
    "FORGETBASE_CORS_ALLOWED_ORIGINS must contain only approved https origins, not localhost or wildcards"
  );

  if (publicEntrypoint !== undefined && validEntrypoints.has(publicEntrypoint) && publicEntrypoint !== "railway-proxy") {
    const files = ["compose.yaml", "compose.same-origin.yaml"];
    if (publicEntrypoint === "compose-tls") {
      files.push("compose.tls.yaml");
    }
    checkResolvedCompose("resolved public deployment API settings", files, process.env, {
      requireAuthentication: true,
      secureCookies: true,
      corsAllowedOrigins: corsOrigins
    });
  }

  const directPortNames = ["FORGETBASE_API_PORT", "FORGETBASE_WEB_PORT", "FORGETBASE_POSTGRES_PORT"];

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
      Boolean(process.env.FORGETBASE_HTTPS_PORT) ? "pass" : "fail",
      "Compose TLS public HTTPS port",
      "FORGETBASE_HTTPS_PORT must be set when compose-tls is the public entrypoint"
    );
    record(
      isLocalPortBinding(process.env.FORGETBASE_PROXY_PORT) ? "pass" : "fail",
      "Compose TLS plain HTTP listener",
      "FORGETBASE_PROXY_PORT should be explicitly localhost-bound so public traffic uses HTTPS"
    );
  }

  if (publicEntrypoint === "external-tls-proxy") {
    record(
      isLocalPortBinding(process.env.FORGETBASE_PROXY_PORT) ? "pass" : "fail",
      "external TLS upstream listener",
      "FORGETBASE_PROXY_PORT must be localhost-bound behind the external TLS edge"
    );
  }
}

function main(): void {
  checkTemplatePosture();
  checkResolvedTemplatePosture();
  checkPublicEnvironment();

  const failures = results.filter((result) => result.status === "fail");

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    checked: results.length,
    publicDeployment: parseStrictBoolean("FORGETBASE_PUBLIC_DEPLOYMENT") === true
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
