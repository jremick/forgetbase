type ReaderLocation = Pick<Location, "href">;

export function readReaderPageId(location: ReaderLocation): string {
  return new URL(location.href).searchParams.get("page")?.trim() ?? "";
}

export function readerPageHref(location: ReaderLocation, stableId: string): string {
  const url = new URL(location.href);
  if (stableId) url.searchParams.set("page", stableId);
  else url.searchParams.delete("page");
  url.hash = "reader";
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A requested page stays selected even when loading, unavailable, or filtered out. */
export function resolveReaderPageId(
  requestedId: string,
  pages: ReadonlyArray<{ stableId: string }>,
  collectionLoaded: boolean
): string {
  return requestedId || (collectionLoaded ? pages[0]?.stableId ?? "" : "");
}

export function readerNavWidthForKey(key: string, width: number): number | null {
  switch (key) {
    case "ArrowLeft": return Math.max(240, width - 16);
    case "ArrowRight": return Math.min(420, width + 16);
    case "Home": return 240;
    case "End": return 420;
    default: return null;
  }
}

export function readerLoadFailure(error: unknown, subject: "pages" | "page" | "search"): string {
  const detail = error instanceof Error ? error.message : String(error);
  if (/^401\b/.test(detail)) return "Your session has expired. Sign out and sign in again.";
  if (/^(403|404)\b/.test(detail)) return subject === "page"
    ? "This page is unavailable. It may be unpublished, removed, or outside your access."
    : "These pages are unavailable to your account. Ask an administrator to check your access.";
  return subject === "search"
    ? "Search could not finish. Try again."
    : `Could not load ${subject === "page" ? "this page" : "the pages"}. Check your connection and try again.`;
}
