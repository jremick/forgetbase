import { afterEach, describe, expect, it, vi } from "vitest";
import { appLocation, createAppNavigation, type NavigationBlocker } from "./app-navigation.js";

function browserAt(path = "/?page=first#reader", withNativeNavigation = false) {
  const events = new EventTarget();
  const entries = [{ key: "entry-0", url: new URL(path, "https://example.test"), state: {} as Record<string, unknown> }];
  let index = 0;
  let nextKey = 1;
  let abortNextTraversal = false;
  const traversalKeys: string[] = [];
  const moveTo = (nextIndex: number) => {
    const oldHash = entries[index]!.url.hash;
    index = nextIndex;
    events.dispatchEvent(new Event("popstate"));
    if (entries[index]!.url.hash !== oldHash) events.dispatchEvent(new Event("hashchange"));
  };
  const browser = Object.assign(events, {
    get location() { return entries[index]!.url; },
    history: {
      get state() { return entries[index]!.state; },
      replaceState(state: Record<string, unknown>, _title: string, url?: string) {
        entries[index] = { key: entries[index]!.key, state, url: url ? new URL(url, entries[index]!.url) : entries[index]!.url };
      },
      pushState(state: Record<string, unknown>, _title: string, url: string) {
        entries.splice(index + 1, entries.length, { key: `entry-${nextKey++}`, state, url: new URL(url, entries[index]!.url) });
        index += 1;
      },
      go(delta: number) {
        queueMicrotask(() => {
          if (!entries[index + delta]) return;
          moveTo(index + delta);
        });
      }
    }
  });
  // Object.assign materializes accessors; keep location live as history moves.
  Object.defineProperty(browser, "location", { get: () => entries[index]!.url });
  if (withNativeNavigation) Object.defineProperty(browser, "navigation", { value: {
    get currentEntry() { return entries[index]; },
    traverseTo(key: string) {
      traversalKeys.push(key);
      const finished = new Promise<void>((resolve, reject) => queueMicrotask(() => {
        if (abortNextTraversal) { abortNextTraversal = false; reject(new DOMException("Superseded by another traversal", "AbortError")); return; }
        const targetIndex = entries.findIndex((entry) => entry.key === key);
        if (targetIndex < 0) { reject(new DOMException("Entry removed", "InvalidStateError")); return; }
        moveTo(targetIndex);
        resolve();
      }));
      return { committed: finished, finished };
    }
  } });
  vi.stubGlobal("window", browser);
  return { browser, entries, traversalKeys, abortNextTraversal: () => { abortNextTraversal = true; } };
}
const settle = async () => {
  // Classic restoration may need several coalesced one-step traversals.
  for (let turn = 0; turn < 12; turn++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
afterEach(() => vi.unstubAllGlobals());

describe("guarded app history", () => {
  it("keeps page IDs and object tabs in durable URLs", () => {
    browserAt();
    expect(appLocation("asset-read", "guide.release", "version")).toBe("/?page=guide.release&view=version#admin/content/page");
    expect(appLocation("reader", "guide.release")).toBe("/?page=guide.release#reader");
  });

  it("does not leave a dirty page until its blocker resumes navigation", () => {
    const { browser } = browserAt("/?page=draft#admin/content/page");
    let resume: (() => void) | undefined;
    const listener = vi.fn();
    const navigation = createAppNavigation(listener, () => (proceed) => { resume = proceed; });
    navigation.navigate("/?page=draft#reader");
    expect(browser.location.hash).toBe("#admin/content/page");
    expect(listener).not.toHaveBeenCalled();
    resume!();
    expect(browser.location.hash).toBe("#reader");
    expect(listener).toHaveBeenCalledOnce();
    navigation.dispose();
  });

  it("cancels Back without overwriting the previous page and can later resume it", async () => {
    const { browser, entries } = browserAt();
    let blocker: NavigationBlocker | null = null;
    let resume: (() => void) | undefined;
    const listener = vi.fn();
    const navigation = createAppNavigation(listener, () => blocker);
    navigation.navigate("/?page=second#reader");
    navigation.navigate("/?page=second#admin/content/page");
    blocker = (proceed) => { resume = proceed; };
    browser.history.go(-1);
    await settle();
    expect(browser.location.hash).toBe("#admin/content/page");
    expect(entries.map((entry) => entry.url.hash)).toEqual(["#reader", "#reader", "#admin/content/page"]);
    expect(listener).toHaveBeenCalledTimes(2);
    resume!();
    await settle();
    expect(browser.location.search).toBe("?page=second");
    expect(browser.location.hash).toBe("#reader");
    expect(listener).toHaveBeenCalledTimes(3);
    blocker = null;
    browser.history.go(-1);
    await settle();
    expect(browser.location.search).toBe("?page=first");
    browser.history.go(1);
    await settle();
    expect(browser.location.search).toBe("?page=second");
    navigation.dispose();
  });

  it.each([false, true])("restores the dirty entry after two rapid Back traversals (native: %s)", async (native) => {
    const { browser, entries } = browserAt(undefined, native);
    let blocker: NavigationBlocker | null = null;
    let resume: (() => void) | undefined;
    const navigation = createAppNavigation(() => undefined, () => blocker);
    navigation.navigate("/?page=second#reader");
    navigation.navigate("/?page=second#admin/content/page");
    const originalEntries = entries.map((entry) => entry.url.href);
    blocker = (proceed) => { resume = proceed; };

    browser.history.go(-1);
    browser.history.go(-1);
    await settle();

    expect(browser.location.hash).toBe("#admin/content/page");
    expect(resume).toBeTypeOf("function");
    expect(entries.map((entry) => entry.url.href)).toEqual(originalEntries);
    resume!();
    await settle();
    expect(browser.location.search).toBe("?page=second");
    expect(browser.location.hash).toBe("#reader");
    navigation.dispose();
  });

  it.each([false, true])("keeps the requested target when Forward races restoration (native: %s)", async (native) => {
    const { browser, entries, traversalKeys } = browserAt(undefined, native);
    let blocker: NavigationBlocker | null = null;
    let resume: (() => void) | undefined;
    const navigation = createAppNavigation(() => undefined, () => blocker);
    navigation.navigate("/?page=second#reader");
    navigation.navigate("/?page=second#admin/content/page");
    navigation.navigate("/?page=third#reader");
    browser.history.go(-1);
    await settle();
    const dirtyKey = entries[2]!.key;
    blocker = (proceed) => { resume = proceed; };
    const originalEntries = entries.map((entry) => entry.url.href);

    browser.history.go(-1);
    browser.history.go(1);
    await settle();
    expect(browser.location.hash).toBe("#admin/content/page");
    expect(traversalKeys).toEqual(native ? [dirtyKey] : []);
    expect(entries.map((entry) => entry.url.href)).toEqual(originalEntries);
    resume!();
    await settle();
    expect(browser.location.search).toBe("?page=second");
    expect(browser.location.hash).toBe("#reader");
    expect(traversalKeys).toEqual(native ? [dirtyKey, entries[1]!.key] : []);
    navigation.dispose();
  });

  it("retries an aborted key restoration without changing neighbouring URLs", async () => {
    const { browser, entries, traversalKeys, abortNextTraversal } = browserAt(undefined, true);
    let blocker: NavigationBlocker | null = null;
    const prompt = vi.fn();
    const navigation = createAppNavigation(() => undefined, () => blocker);
    navigation.navigate("/?page=draft#admin/content/page");
    const originalEntries = entries.map((entry) => entry.url.href);
    blocker = prompt;
    abortNextTraversal();
    browser.history.go(-1);
    await settle();
    expect(browser.location.hash).toBe("#admin/content/page");
    expect(traversalKeys).toEqual([entries[1]!.key, entries[1]!.key]);
    expect(prompt).toHaveBeenCalledOnce();
    expect(entries.map((entry) => entry.url.href)).toEqual(originalEntries);
    navigation.dispose();
  });
});
