import { describe, expect, it } from "vitest";
import { readReaderPageId, readerLoadFailure, readerNavWidthForKey, readerPageHref, resolveReaderPageId } from "./reader-navigation.js";

describe("reader page selection", () => {
  const pages = [{ stableId: "first" }, { stableId: "requested" }];

  it("retains a deep link through an empty pending collection and after loading", () => {
    const requested = readReaderPageId({ href: "https://example.test/?page=requested#reader" });
    expect(resolveReaderPageId(requested, [], false)).toBe("requested");
    expect(resolveReaderPageId(requested, pages, true)).toBe("requested");
  });

  it("keeps unavailable links explicit instead of showing another page", () => {
    expect(resolveReaderPageId("missing", pages, true)).toBe("missing");
    expect(resolveReaderPageId("requested", [], true)).toBe("requested");
  });

  it("chooses a default only after a complete collection loads", () => {
    expect(resolveReaderPageId("", pages, false)).toBe("");
    expect(resolveReaderPageId("", pages, true)).toBe("first");
    expect(resolveReaderPageId("", [], true)).toBe("");
  });

  it("makes durable page links and reads each browser history location independently", () => {
    const location = { href: "https://example.test/library?view=compact&page=first#account-settings" };
    const href = readerPageHref(location, "guide with spaces/and&symbols");
    expect(href).toBe("/library?view=compact&page=guide+with+spaces%2Fand%26symbols#reader");
    expect(readReaderPageId({ href: new URL(href, location.href).href })).toBe("guide with spaces/and&symbols");
    expect(readReaderPageId(location)).toBe("first");
    expect(readerPageHref(location, "")).toBe("/library?view=compact#reader");
  });
});

describe("reader navigation width", () => {
  it("supports both arrows and endpoint keys within the same pointer bounds", () => {
    expect(readerNavWidthForKey("ArrowLeft", 280)).toBe(264);
    expect(readerNavWidthForKey("ArrowRight", 280)).toBe(296);
    expect(readerNavWidthForKey("ArrowLeft", 240)).toBe(240);
    expect(readerNavWidthForKey("ArrowRight", 420)).toBe(420);
    expect(readerNavWidthForKey("Home", 350)).toBe(240);
    expect(readerNavWidthForKey("End", 350)).toBe(420);
    expect(readerNavWidthForKey("Tab", 280)).toBeNull();
  });
});

describe("reader request recovery", () => {
  it("does not expose response internals or imply whether a denied page exists", () => {
    const missing = readerLoadFailure(new Error('404 {"debug":"internal detail"}'), "page");
    expect(readerLoadFailure(new Error("403 Forbidden"), "page")).toBe(missing);
    expect(missing).not.toContain("debug");
    expect(readerLoadFailure(new Error("401 Unauthorized"), "pages")).toContain("sign in again");
    expect(readerLoadFailure(new Error("API request failed"), "pages")).toContain("try again");
  });
});
