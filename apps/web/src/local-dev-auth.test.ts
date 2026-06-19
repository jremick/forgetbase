import { describe, expect, it } from "vitest";
import {
  localSplitOriginAuthKey,
  localSplitOriginDefaultApiUrl,
  readInitialApiUrl,
  readInitialLoginEmail,
  readInitialLoginPassword,
  readInitialLoginTenantId,
  resolveDefaultApiUrl
} from "./local-dev-auth.js";

function location(hostname: string, port: string): Pick<Location, "hostname" | "port"> {
  return { hostname, port };
}

function storage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return {
    getItem: (key) => values[key] ?? null
  };
}

describe("local dev auth defaults", () => {
  it("defaults local Vite web instances to the split-origin API", () => {
    expect(resolveDefaultApiUrl(undefined, location("localhost", "5173"))).toBe(localSplitOriginDefaultApiUrl);
    expect(resolveDefaultApiUrl(undefined, location("127.0.0.1", "5175"))).toBe(localSplitOriginDefaultApiUrl);
  });

  it("keeps configured and same-origin API URLs outside local Vite defaults", () => {
    expect(resolveDefaultApiUrl("https://api.example.test", location("localhost", "5173"))).toBe("https://api.example.test");
    expect(resolveDefaultApiUrl(undefined, location("app.example.test", ""))).toBe("/api");
    expect(resolveDefaultApiUrl(undefined, location("localhost", "4173"))).toBe("/api");
  });

  it("replaces stale local API storage when moving between local Vite and same-origin builds", () => {
    expect(readInitialApiUrl(undefined, storage({ "agentic-cms-api-url": "/api" }), location("localhost", "5173"))).toBe(
      localSplitOriginDefaultApiUrl
    );
    expect(readInitialApiUrl(undefined, storage({ "agentic-cms-api-url": localSplitOriginDefaultApiUrl }), location("app.example.test", ""))).toBe(
      "/api"
    );
    expect(readInitialApiUrl(undefined, storage({ "agentic-cms-api-url": "https://custom.example.test" }), location("localhost", "5173"))).toBe(
      "https://custom.example.test"
    );
  });

  it("does not prefill login credentials from local defaults or deployed storage", () => {
    const local = location("localhost", "5173");
    const deployed = location("app.example.test", "");
    const stored = storage({
      "agentic-cms-login-tenant": "tenant_custom",
      "agentic-cms-login-email": "operator@example.test"
    });

    expect(readInitialLoginTenantId(undefined, local)).toBe("");
    expect(readInitialLoginEmail(undefined, local)).toBe("");
    expect(readInitialLoginPassword(local)).toBe("");

    expect(readInitialLoginTenantId(undefined, deployed)).toBe("");
    expect(readInitialLoginEmail(undefined, deployed)).toBe("");
    expect(readInitialLoginPassword(deployed)).toBe("");

    expect(readInitialLoginTenantId(stored, local)).toBe("");
    expect(readInitialLoginEmail(stored, local)).toBe("");
  });

  it("uses the login response key only for local split-origin review", () => {
    expect(localSplitOriginAuthKey("temporary-secret", location("localhost", "5173"))).toBe("temporary-secret");
    expect(localSplitOriginAuthKey("temporary-secret", location("127.0.0.1", "5175"))).toBe("temporary-secret");
    expect(localSplitOriginAuthKey("temporary-secret", location("app.example.test", ""))).toBe("");
  });
});
