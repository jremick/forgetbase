import { useEffect, useSyncExternalStore } from "react";

// Reader and admin share one tab's credential. Reloading discards it.
let apiKey = "";
const listeners = new Set<() => void>();

export function readBrowserApiKey(): string {
  return apiKey;
}

export function setBrowserApiKey(value: string): void {
  if (value === apiKey) return;
  apiKey = value;
  for (const listener of listeners) listener();
}

export function subscribeBrowserApiKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function clearLegacyBrowserApiKey(): void {
  try {
    window.localStorage.removeItem("forgetbase-api-key");
  } catch {
    // Storage may be disabled. Never read or recover a persisted bearer key.
  }
}

export function useBrowserApiKey(): readonly [string, typeof setBrowserApiKey] {
  const value = useSyncExternalStore(subscribeBrowserApiKey, readBrowserApiKey, () => "");
  useEffect(clearLegacyBrowserApiKey, []);
  return [value, setBrowserApiKey];
}
