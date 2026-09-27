import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveComposeConfiguration, validateComposeApiSecurity } from "./check-deployment-security.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoots: string[] = [];
const publicEnvironment = {
  FORGETBASE_REQUIRE_AUTHENTICATION: "true",
  FORGETBASE_SESSION_COOKIE_SECURE: "true",
  FORGETBASE_CORS_ALLOWED_ORIGINS: "https://knowledge.example.test"
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("resolved Compose security", () => {
  it("keeps the loopback bootstrap defaults explicit", () => {
    const configuration = resolveComposeConfiguration(["compose.yaml"], {});
    expect(validateComposeApiSecurity(configuration, {
      requireAuthentication: false,
      secureCookies: false
    })).toEqual([]);
  });

  it.each([
    ["compose.yaml"],
    ["compose.yaml", "compose.same-origin.yaml"],
    ["compose.yaml", "compose.same-origin.yaml", "compose.tls.yaml"]
  ])("passes the public auth and cookie settings through %j", (...files) => {
    const configuration = resolveComposeConfiguration(files, publicEnvironment);
    expect(validateComposeApiSecurity(configuration, {
      requireAuthentication: true,
      secureCookies: true,
      corsAllowedOrigins: publicEnvironment.FORGETBASE_CORS_ALLOWED_ORIGINS
    })).toEqual([]);
  });

  it("keeps secure cookies enabled by the TLS overlay even when the shell disables them", () => {
    const configuration = resolveComposeConfiguration(["compose.yaml", "compose.same-origin.yaml", "compose.tls.yaml"], {
      ...publicEnvironment,
      FORGETBASE_SESSION_COOKIE_SECURE: "false"
    });
    expect(validateComposeApiSecurity(configuration, {
      requireAuthentication: true,
      secureCookies: true
    })).toEqual([]);
  });

  it.each(["FORGETBASE_REQUIRE_AUTHENTICATION", "FORGETBASE_SESSION_COOKIE_SECURE"])(
    "rejects a template that drops %s even when the shell setting is true", (name) => {
      const root = mkdtempSync(path.join(tmpdir(), "forgetbase-compose-security-"));
      temporaryRoots.push(root);
      const source = readFileSync(path.join(repoRoot, "compose.yaml"), "utf8");
      writeFileSync(path.join(root, "compose.yaml"), source.replace(new RegExp(`^      ${name}:.*\\n`, "m"), ""));
      const configuration = resolveComposeConfiguration(["compose.yaml"], publicEnvironment, root);
      expect(validateComposeApiSecurity(configuration, {
        requireAuthentication: true,
        secureCookies: true
      })).toEqual([`${name} is missing or differs from the required API container setting`]);
    }
  );

  it("does not expose interpolated configuration in a resolution failure", () => {
    const root = mkdtempSync(path.join(tmpdir(), "forgetbase-compose-security-"));
    temporaryRoots.push(root);
    writeFileSync(path.join(root, "compose.yaml"), "services:\n  api:\n    image: example\n    ports: [\"${PRIVATE_TEST_VALUE}\"]\n");
    expect(() => resolveComposeConfiguration(["compose.yaml"], { PRIVATE_TEST_VALUE: "synthetic-private-value" }, root))
      .toThrow("Unable to resolve Compose configuration; Docker Compose must be installed and the configuration must be valid.");
  });
});
