import { describe, expect, it } from "vitest";
import { shouldProbeAuthenticatedSession } from "./app-api.js";

describe("app API session discovery", () => {
  it.each([
    { apiKey: "", sessionCookieActive: false, expected: false },
    { apiKey: "fb_test_key", sessionCookieActive: false, expected: true },
    { apiKey: "", sessionCookieActive: true, expected: true }
  ])("probes only when local state indicates a credential may exist", ({ apiKey, sessionCookieActive, expected }) => {
    expect(shouldProbeAuthenticatedSession(apiKey, sessionCookieActive)).toBe(expected);
  });
});
