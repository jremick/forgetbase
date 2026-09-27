import { canonicalAppHash } from "./app-routing.js";

export type NavigationBlocker = (proceed: () => void) => void;
const indexKey = "forgetbaseNavigationIndex";

type NativeTraversal = { committed?: Promise<unknown>; finished: Promise<unknown> };
type NativeNavigation = {
  currentEntry?: { key: string } | null;
  traverseTo: (key: string) => NativeTraversal;
};

export function appLocation(route: string, pageId?: string, view?: string): string {
  const url = new URL(window.location.href);
  url.hash = canonicalAppHash(route);
  if (pageId !== undefined) {
    if (pageId) url.searchParams.set("page", pageId);
    else url.searchParams.delete("page");
  }
  if (view) url.searchParams.set("view", view);
  else url.searchParams.delete("view");
  return `${url.pathname}${url.search}${url.hash}`;
}

// Own the small hash router's history entries so a cancelled Back/Forward
// restores the original entry, rather than replacing or losing its neighbour.
export function createAppNavigation(
  onLocation: (location: string) => void,
  getBlocker: () => NavigationBlocker | null
) {
  const location = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
  let acceptedLocation = location();
  let acceptedIndex = Number.isInteger(window.history.state?.[indexKey]) ? window.history.state[indexKey] as number : 0;
  window.history.replaceState({ ...window.history.state, [indexKey]: acceptedIndex }, "");
  const candidate = (window as Window & { navigation?: NativeNavigation }).navigation;
  const nativeNavigation = candidate?.currentEntry?.key && typeof candidate.traverseTo === "function" ? candidate : null;
  let acceptedKey = nativeNavigation?.currentEntry?.key;
  type PendingTraversal = { target: string; targetIndex: number; targetKey?: string };
  let restoring: PendingTraversal | null = null;
  let restorationInFlight = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let allowedTarget: string | null = null;

  const accept = (nextLocation: string, index: number) => {
    acceptedLocation = nextLocation;
    acceptedIndex = index;
    acceptedKey = nativeNavigation?.currentEntry?.key;
    window.history.replaceState({ ...window.history.state, [indexKey]: index }, "");
    onLocation(nextLocation);
  };

  const traverseToKey = (key: string): Promise<unknown> => {
    try {
      const traversal = nativeNavigation!.traverseTo(key);
      // Both promises reject when a second browser traversal aborts this one.
      void traversal.committed?.catch(() => undefined);
      return traversal.finished;
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const finishRestoring = (pending: PendingTraversal) => {
    if (disposed || restoring !== pending) return;
    restoring = null;
    const resume = () => {
      if (disposed) return;
      allowedTarget = pending.target;
      if (nativeNavigation && pending.targetKey) {
        void traverseToKey(pending.targetKey).catch(() => {
          if (allowedTarget === pending.target) allowedTarget = null;
        });
      } else {
        window.history.go(pending.targetIndex - acceptedIndex);
      }
    };
    const blocker = getBlocker();
    if (blocker) blocker(resume);
    else resume();
  };

  const restoreAcceptedEntry = () => {
    const pending = restoring;
    if (!pending || disposed || restorationInFlight) return;
    if (nativeNavigation && acceptedKey) {
      // Unlike history.go(delta), an entry key stays exact when another Back or
      // Forward is queued. Await completion before opening the leave dialog.
      restorationInFlight = true;
      void traverseToKey(acceptedKey).catch((error: unknown) => {
        // A removed/unavailable entry cannot be retried by key indefinitely.
        if (!(error instanceof Error) || error.name !== "AbortError") acceptedKey = undefined;
      }).finally(() => {
        restorationInFlight = false;
        if (disposed || restoring !== pending) return;
        if (nativeNavigation.currentEntry?.key === acceptedKey && location() === acceptedLocation) finishRestoring(pending);
        else restoreAcceptedEntry();
      });
      return;
    }
    // Older browsers have no absolute traversal or completion promise. Coalesce
    // observed events, then correct one step using the latest observed index.
    // Never replace a neighbouring entry's URL to simulate staying on the page.
    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      fallbackTimer = null;
      if (disposed || restoring !== pending) return;
      if (location() === acceptedLocation) { finishRestoring(pending); return; }
      const observedIndex = window.history.state?.[indexKey];
      if (Number.isInteger(observedIndex) && observedIndex !== acceptedIndex) {
        window.history.go(Math.sign(acceptedIndex - observedIndex));
      }
    }, 0);
  };

  const sync = () => {
    const nextLocation = location();
    if (restoring) {
      restoreAcceptedEntry();
      return;
    }
    if (nextLocation === acceptedLocation) return;
    const storedIndex = window.history.state?.[indexKey];
    // Native hash links copy state from the previous entry.
    const nextIndex = Number.isInteger(storedIndex) && storedIndex !== acceptedIndex ? storedIndex as number : acceptedIndex + 1;
    const blocker = getBlocker();
    if (blocker && allowedTarget !== nextLocation) {
      window.history.replaceState({ ...window.history.state, [indexKey]: nextIndex }, "");
      restoring = { target: nextLocation, targetIndex: nextIndex, targetKey: nativeNavigation?.currentEntry?.key };
      restoreAcceptedEntry();
      return;
    }
    allowedTarget = null;
    accept(nextLocation, nextIndex);
  };
  window.addEventListener("popstate", sync);
  window.addEventListener("hashchange", sync);

  return {
    navigate(nextLocation: string) {
      if (nextLocation === acceptedLocation) return;
      const proceed = () => {
        window.history.pushState({ [indexKey]: acceptedIndex + 1 }, "", nextLocation);
        accept(nextLocation, acceptedIndex + 1);
        // Query-only page navigation must also reach mounted reader listeners.
        window.dispatchEvent(new Event("popstate"));
      };
      const blocker = getBlocker();
      if (blocker) blocker(proceed);
      else proceed();
    },
    dispose() {
      disposed = true;
      restoring = null;
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    }
  };
}
