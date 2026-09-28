import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../apps/api/src/openapi.ts";

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

interface RouteEntry {
  method: Method;
  path: string;
}

const routeMethods = new Set(["get", "post", "put", "delete", "patch", "options", "head"]);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const serverPath = resolve(root, "apps/api/src/server.ts");

const metaRouteExceptions = new Map<string, string>([
  ["GET /", "Root service metadata route is not part of the API contract surface."],
  ["GET /openapi.json", "OpenAPI self-description endpoint is served outside the documented paths."]
]);

const serverSource = await readFile(serverPath, "utf8");
const serverRoutes = extractServerRoutes(serverSource);
const openApiRoutes = extractOpenApiRoutes(buildOpenApiDocument());

const serverKeys = new Set(serverRoutes.map(routeKey));
const openApiKeys = new Set(openApiRoutes.map(routeKey));

const undocumentedRoutes = [...serverKeys]
  .filter((key) => !openApiKeys.has(key) && !metaRouteExceptions.has(key))
  .sort();
const staleOpenApiRoutes = [...openApiKeys].filter((key) => !serverKeys.has(key)).sort();

if (undocumentedRoutes.length > 0 || staleOpenApiRoutes.length > 0) {
  console.error("OpenAPI route inventory drift detected.");
  console.error("");
  console.error(`Server route source: ${relative(root, serverPath)}`);
  console.error(`Server routes: ${serverRoutes.length}`);
  console.error(`OpenAPI routes: ${openApiRoutes.length}`);
  console.error("");

  if (undocumentedRoutes.length > 0) {
    console.error("Server routes missing from OpenAPI:");
    for (const key of undocumentedRoutes) {
      console.error(`  - ${key}`);
    }
    console.error("");
  }

  if (staleOpenApiRoutes.length > 0) {
    console.error("OpenAPI routes missing from server:");
    for (const key of staleOpenApiRoutes) {
      console.error(`  - ${key}`);
    }
    console.error("");
  }

  console.error("Known explicit meta-route exceptions:");
  for (const [key, reason] of metaRouteExceptions) {
    console.error(`  - ${key}: ${reason}`);
  }

  process.exit(1);
}

console.log(
  `OpenAPI route inventory OK: ${openApiRoutes.length} documented routes match ${serverRoutes.length} server routes with ${metaRouteExceptions.size} explicit meta-route exceptions.`
);

function extractServerRoutes(source: string): RouteEntry[] {
  const routePattern = /\bserver\.(get|post|put|delete|patch|options|head)(?:<[^>]+>)?\(\s*["'`]([^"'`]+)["'`]/g;
  const routes: RouteEntry[] = [];

  for (const match of source.matchAll(routePattern)) {
    const method = match[1];
    const path = match[2];

    if (!method || !path || !routeMethods.has(method)) {
      continue;
    }

    routes.push({
      method: method.toUpperCase() as Method,
      path: normalizeFastifyPath(path)
    });
  }

  return uniqueSortedRoutes(routes);
}

function extractOpenApiRoutes(document: unknown): RouteEntry[] {
  if (!isOpenApiDocument(document)) {
    throw new Error("buildOpenApiDocument() did not return an object with a paths map.");
  }

  const routes: RouteEntry[] = [];

  for (const [path, operations] of Object.entries(document.paths)) {
    if (!operations || typeof operations !== "object") {
      continue;
    }

    for (const method of Object.keys(operations)) {
      if (!routeMethods.has(method)) {
        continue;
      }

      routes.push({
        method: method.toUpperCase() as Method,
        path
      });
    }
  }

  return uniqueSortedRoutes(routes);
}

function isOpenApiDocument(value: unknown): value is { paths: Record<string, unknown> } {
  return Boolean(value && typeof value === "object" && "paths" in value && typeof (value as { paths?: unknown }).paths === "object");
}

function normalizeFastifyPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function routeKey(route: RouteEntry): string {
  return `${route.method} ${route.path}`;
}

function uniqueSortedRoutes(routes: RouteEntry[]): RouteEntry[] {
  return [...new Map(routes.map((route) => [routeKey(route), route])).values()].sort((a, b) =>
    routeKey(a).localeCompare(routeKey(b))
  );
}
