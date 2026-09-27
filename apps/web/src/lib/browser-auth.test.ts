import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLegacyBrowserApiKey, readBrowserApiKey, setBrowserApiKey, subscribeBrowserApiKey } from "./browser-auth.js";

afterEach(() => {
  setBrowserApiKey("");
  vi.unstubAllGlobals();
});

describe("browser bearer credentials", () => {
  it("shares changes and logout between mounted reader and admin consumers", () => {
    const reader = vi.fn();
    const admin = vi.fn();
    const unsubscribeReader = subscribeBrowserApiKey(reader);
    const unsubscribeAdmin = subscribeBrowserApiKey(admin);
    setBrowserApiKey("temporary-test-token");
    expect(readBrowserApiKey()).toBe("temporary-test-token");
    expect(reader).toHaveBeenCalledTimes(1);
    expect(admin).toHaveBeenCalledTimes(1);
    unsubscribeAdmin();
    setBrowserApiKey("");
    expect(readBrowserApiKey()).toBe("");
    expect(reader).toHaveBeenCalledTimes(2);
    expect(admin).toHaveBeenCalledTimes(1);
    unsubscribeReader();
  });

  it("removes legacy storage without loading or persisting a credential", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal("window", { localStorage: storage });
    clearLegacyBrowserApiKey();
    setBrowserApiKey("temporary-test-token");
    expect(storage.removeItem).toHaveBeenCalledWith("forgetbase-api-key");
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("loses the credential when the page's module state is reloaded", async () => {
    setBrowserApiKey("temporary-test-token");
    vi.resetModules();
    const reloaded = await import("./browser-auth.js");
    expect(reloaded.readBrowserApiKey()).toBe("");
  });

  it("does not recover a credential when browser storage is unavailable", () => {
    vi.stubGlobal("window", { get localStorage(): never { throw new Error("Storage disabled"); } });
    expect(clearLegacyBrowserApiKey).not.toThrow();
    expect(readBrowserApiKey()).toBe("");
  });
});
