import type { Branding } from "@forgetbase/schema";
import { Brand } from "./components/brand.js";

import { MarkdownDocument, useMarkdownHeadings } from "./components/markdown/markdown-document.js";
import { loadAssetCollection } from "./lib/asset-collection.js";
import type { AssetDetail, AssetRecord, Attachment, AuthPrincipal, ManagedQueryResponse, SearchResponse } from "@forgetbase/schema";
import { BookOpen } from "@phosphor-icons/react/dist/icons/BookOpen";
import { ClipboardText } from "@phosphor-icons/react/dist/icons/ClipboardText";
import { GearSix } from "@phosphor-icons/react/dist/icons/GearSix";
import { List } from "@phosphor-icons/react/dist/icons/List";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/icons/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/dist/icons/Package";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert.js";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu.js";
import { Input } from "./components/ui/input.js";
import { Label } from "./components/ui/label.js";
import { NativeSelect } from "./components/ui/native-select.js";
import { AttachmentsPanel } from "./components/domain/attachments-panel.js";
import type { AppBinaryRequest, AppRequest } from "./lib/app-api.js";
import type { AppRoute } from "./lib/app-routing.js";
import { formatList, stateBadgeVariant } from "./lib/asset-ui.js";
import { groupReaderSearchResults } from "./lib/reader-search-results.js";
import { readReaderPageId, readerLoadFailure, readerNavWidthForKey, readerPageHref, resolveReaderPageId } from "./lib/reader-navigation.js";
import {
  buildReaderNavTree,
  formatAssetTypeLabel,
  formatReaderAccess,
  formatReaderDate,
  formatReaderLifecycle,
  formatReaderMaintainer,
  formatReaderReview,
  formatReaderSnippet,
  formatReaderStatus,
  normalizeReaderQuery,
  readAssetMetadataString,
  readAssetMetadataStringArray,
  readerAssetMatches,
  readerNavLabel,
  readerNodeContainsStableId,
  renderReaderAnswer,
  type ReaderNavNode
} from "./lib/reader-ui.js";

const navWidthStorageKey = "forgetbase-web-nav-width";
const navCollapsedStorageKey = "forgetbase-web-nav-collapsed";
const navExpandedStorageKey = "forgetbase-web-nav-expanded";
const navWidthDefault = 280;
const navWidthMin = 240;
const navWidthMax = 420;
const navCollapsedWidth = 64;
const attachmentMaxBytes = 10 * 1024 * 1024;

type ReaderSurfaceProps = {
  branding: Branding;
  principal: AuthPrincipal;
  route: Extract<AppRoute, "reader" | "account-settings">;
  request: AppRequest;
  requestBinary: AppBinaryRequest;
  onLogout: () => Promise<void>;
  onNavigate: (route: string, pageId?: string) => void;
  canUseAdministration: boolean;
};

function readInitialNavWidth(): number {
  const stored = Number.parseInt(localStorage.getItem(navWidthStorageKey) || "", 10);
  return Number.isFinite(stored) ? Math.min(navWidthMax, Math.max(navWidthMin, stored)) : navWidthDefault;
}

function readExpandedSections(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(navExpandedStorageKey) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Boolean(value)]))
      : {};
  } catch {
    return {};
  }
}

function isPublishedReaderAsset(asset: AssetRecord): boolean {
  return asset.lifecycleState === "active" && asset.status === "approved" && asset.allowedSurfaces.includes("web");
}

function initialsFor(value: string): string {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "GU";
}

function scrollReaderRegionIntoView(id: string): void {
  window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
}

export function ReaderSurface({ branding, principal, route, request, requestBinary, onLogout, onNavigate, canUseAdministration }: ReaderSurfaceProps) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [selectedStableId, setSelectedStableId] = useState(() => readReaderPageId(window.location));
  const [collectionState, setCollectionState] = useState<"loading" | "loaded" | "error">("loading");
  const [collectionError, setCollectionError] = useState("");
  const [collectionRetry, setCollectionRetry] = useState(0);
  const [pageRequest, setPageRequest] = useState<{ stableId: string; state: "loading" | "loaded" | "error"; detail: AssetDetail | null; error: string }>({ stableId: "", state: "loading", detail: null, error: "" });
  const [pageRetry, setPageRetry] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [readerAskText, setReaderAskText] = useState("What should be redacted?");
  const [readerAskResponse, setReaderAskResponse] = useState<ManagedQueryResponse | null>(null);
  const [isReaderAskRunning, setIsReaderAskRunning] = useState(false);
  const [readerAskError, setReaderAskError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const searchController = useRef<AbortController | null>(null);
  const pendingPageFocus = useRef("");
  const [navWidth, setNavWidth] = useState(readInitialNavWidth);
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => localStorage.getItem(navCollapsedStorageKey) === "true");
  const [expandedNavSections, setExpandedNavSections] = useState<Record<string, boolean>>(readExpandedSections);

  const publishedAssets = useMemo(() => assets.filter(isPublishedReaderAsset), [assets]);
  const filteredAssets = useMemo(() => publishedAssets.filter((asset) => readerAssetMatches(asset, libraryQuery)), [libraryQuery, publishedAssets]);
  const resolvedStableId = resolveReaderPageId(selectedStableId, publishedAssets, collectionState === "loaded");
  const selectedAsset = publishedAssets.find((asset) => asset.stableId === resolvedStableId);
  const assetDetail = pageRequest.stableId === resolvedStableId ? pageRequest.detail : null;
  const pageLoading = collectionState === "loading" || Boolean(selectedAsset && (pageRequest.stableId !== resolvedStableId || pageRequest.state === "loading"));
  const pageError = pageRequest.stableId === resolvedStableId && pageRequest.state === "error" ? pageRequest.error : "";
  const pageReadyForFocus = Boolean(assetDetail || pageError || (collectionState === "loaded" && resolvedStableId && !selectedAsset));
  const navTree = useMemo(() => buildReaderNavTree(filteredAssets), [filteredAssets]);
  const humanBody = assetDetail?.humanDocuments[0]?.body ?? "";
  const currentVersion = assetDetail?.versions.find((version) => version.id === (assetDetail.asset.publishedVersionId ?? assetDetail.asset.currentVersionId)) ?? assetDetail?.versions[0];
  const sectionHeadings = useMarkdownHeadings(humanBody, assetDetail?.asset.title ?? "").slice(0, 8);
  const normalizedSearchQuery = normalizeReaderQuery(libraryQuery);
  const searchHasFreshResponse = Boolean(normalizedSearchQuery && searchResponse && normalizeReaderQuery(searchResponse.query) === normalizedSearchQuery);
  const searchPageResults = useMemo(
    () => groupReaderSearchResults((searchResponse?.results ?? []).filter((result) => isPublishedReaderAsset(result.asset))),
    [searchResponse]
  );
  const displayIdentity = principal.displayName || principal.email || "Guest";
  const accountSettings = route === "account-settings";
  const filterActive = Boolean(libraryQuery.trim());
  const shellStyle = { "--nav": `${isNavCollapsed ? navCollapsedWidth : navWidth}px` } as CSSProperties & Record<"--nav", string>;

  useEffect(() => {
    localStorage.setItem(navWidthStorageKey, String(navWidth));
    localStorage.setItem(navCollapsedStorageKey, String(isNavCollapsed));
    localStorage.setItem(navExpandedStorageKey, JSON.stringify(expandedNavSections));
  }, [expandedNavSections, isNavCollapsed, navWidth]);

  useEffect(() => {
    const controller = new AbortController();
    setCollectionState("loading");
    setCollectionError("");
    void loadAssetCollection(request, { signal: controller.signal })
      .then((collection) => {
        if (!controller.signal.aborted) { setAssets(collection); setCollectionState("loaded"); }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) { setCollectionError(readerLoadFailure(loadError, "pages")); setCollectionState("error"); }
      });
    return () => controller.abort();
  }, [collectionRetry, request]);

  useEffect(() => {
    const syncPage = () => {
      const stableId = readReaderPageId(window.location);
      pendingPageFocus.current = stableId;
      setSelectedStableId(stableId);
    };
    window.addEventListener("popstate", syncPage);
    window.addEventListener("hashchange", syncPage);
    return () => {
      window.removeEventListener("popstate", syncPage);
      window.removeEventListener("hashchange", syncPage);
    };
  }, []);

  useEffect(() => {
    if (accountSettings || !selectedAsset) {
      setAttachments([]);
      return;
    }
    const controller = new AbortController();
    const stableId = selectedAsset.stableId;
    setPageRequest({ stableId, state: "loading", detail: null, error: "" });
    setAttachments([]);
    setAttachmentsLoading(true);
    setAttachmentsError("");
    void request<AssetDetail>(`/assets/${encodeURIComponent(stableId)}`, { signal: controller.signal })
      .then((detail) => {
        if (!controller.signal.aborted) setPageRequest({ stableId, state: "loaded", detail, error: "" });
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setPageRequest({ stableId, state: "error", detail: null, error: readerLoadFailure(loadError, "page") });
      });
    void request<{ attachments: Attachment[] }>(`/assets/${encodeURIComponent(stableId)}/attachments`, { signal: controller.signal })
      .then((response) => { if (!controller.signal.aborted) setAttachments(response.attachments); })
      .catch((loadError) => { if (!controller.signal.aborted) { setAttachments([]); setAttachmentsError(readerLoadFailure(loadError, "page")); } })
      .finally(() => { if (!controller.signal.aborted) setAttachmentsLoading(false); });
    return () => controller.abort();
  }, [accountSettings, pageRetry, request, selectedAsset?.stableId]);

  useEffect(() => {
    if (accountSettings || pageLoading || !pageReadyForFocus || pendingPageFocus.current !== resolvedStableId) return;
    const frame = window.requestAnimationFrame(() => {
      const title = document.getElementById("reader-page-title");
      if (title) { title.focus({ preventScroll: true }); pendingPageFocus.current = ""; }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountSettings, pageLoading, pageReadyForFocus, resolvedStableId]);

  useEffect(() => () => searchController.current?.abort(), []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!accountSettings && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("reader-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [accountSettings]);

  function selectPage(stableId: string): void {
    pendingPageFocus.current = stableId;
    setSelectedStableId(stableId);
    onNavigate("reader", stableId);
    if (!accountSettings && assetDetail?.asset.stableId === stableId) {
      document.getElementById("reader-page-title")?.focus({ preventScroll: true });
      pendingPageFocus.current = "";
    }
  }

  function openPageLink(event: MouseEvent<HTMLAnchorElement>, stableId: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    selectPage(stableId);
  }

  async function runSearch(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    searchController.current?.abort();
    setSearchError("");
    const query = searchQuery.trim();
    setLibraryQuery(query);
    if (!query) { setSearchResponse(null); setSearchLoading(false); return; }
    const controller = new AbortController();
    searchController.current = controller;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ query, limit: "8" });
      const response = await request<SearchResponse>(`/search?${params.toString()}`, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setSearchResponse(response);
        scrollReaderRegionIntoView("reader-search-results");
      }
    } catch (searchError) {
      if (!controller.signal.aborted) setSearchError(readerLoadFailure(searchError, "search"));
    } finally {
      if (!controller.signal.aborted) setSearchLoading(false);
    }
  }

  function clearSearch(): void {
    searchController.current?.abort();
    setSearchLoading(false);
    setSearchError("");
    setLibraryQuery("");
    setSearchQuery("");
    setSearchResponse(null);
  }

  async function runAsk(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (!readerAskText.trim()) return;
    setReaderAskError("");
    setIsReaderAskRunning(true);
    try {
      setReaderAskResponse(await request<ManagedQueryResponse>("/agent/query", {
        method: "POST",
        body: JSON.stringify({ query: readerAskText, limit: 5, mode: "deterministic-retrieval", cache: false })
      }));
    } catch (queryError) {
      setReaderAskResponse(null);
      setReaderAskError(queryError instanceof Error ? queryError.message : String(queryError));
    } finally {
      setIsReaderAskRunning(false);
    }
  }

  async function downloadAttachment(attachment: Attachment): Promise<void> {
    if (!selectedAsset) return;
    setAttachmentsError("");
    try {
      const response = await requestBinary(`/assets/${encodeURIComponent(selectedAsset.stableId)}/attachments/${encodeURIComponent(attachment.id)}/download`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setAttachmentsError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    }
  }

  function startNavResize(event: React.PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return;
    const nav = event.currentTarget.closest(".side-nav");
    if (!(nav instanceof HTMLElement)) return;
    event.preventDefault();
    const navLeft = nav.getBoundingClientRect().left;
    const resize = (clientX: number) => { setIsNavCollapsed(false); setNavWidth(Math.min(navWidthMax, Math.max(navWidthMin, clientX - navLeft))); };
    resize(event.clientX);
    const move = (moveEvent: PointerEvent) => resize(moveEvent.clientX);
    const stop = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", stop); };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }

  function resizeNavWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const nextWidth = readerNavWidthForKey(event.key, navWidth);
    if (nextWidth === null) return;
    event.preventDefault();
    setIsNavCollapsed(false);
    setNavWidth(nextWidth);
  }

  function renderNavIcon(asset: AssetRecord, hasChildren: boolean): ReactNode {
    const icons: Record<string, React.ElementType> = { book: BookOpen, checklist: ClipboardText, export: Package, guide: BookOpen, policy: ClipboardText, privacy: GearSix, search: MagnifyingGlass, system: GearSix };
    const iconKey = (readAssetMetadataString(asset, "readerIcon") ?? (hasChildren ? "book" : asset.type)).toLowerCase();
    const Icon = icons[iconKey] ?? icons[asset.type] ?? BookOpen;
    return <Icon aria-hidden="true" />;
  }

  function renderNavNode(node: ReaderNavNode, depth = 0): ReactNode {
    const hasChildren = node.children.length > 0;
    const active = node.asset.stableId === selectedAsset?.stableId;
    const selectedBranch = readerNodeContainsStableId(node, selectedAsset?.stableId);
    const branchKey = `reader:${node.asset.stableId}`;
    const expanded = hasChildren ? expandedNavSections[branchKey] ?? selectedBranch : false;
    return <div className="reader-tree-group" key={node.asset.id} data-depth={depth}>
      <div className="reader-tree-row">
        <a href={readerPageHref(window.location, node.asset.stableId)} className={`${hasChildren ? "nav-folder" : "nav-link nav-leaf has-dot"} reader-nav-node ${selectedBranch ? "is-active-ancestor" : ""} ${expanded ? "is-expanded" : ""} ${active ? "active" : ""}`} data-depth={depth} aria-current={active ? "page" : undefined} onClick={(event) => openPageLink(event, node.asset.stableId)}>
          {hasChildren ? <span className="folder-glyph reader-folder-icon" aria-hidden="true">{renderNavIcon(node.asset, true)}</span> : <span className="nav-icon reader-leaf-dot" aria-hidden="true" />}
          <span className="nav-text">{readerNavLabel(node.asset)}</span>
          {hasChildren ? <Badge variant="neutral" className="nav-count">{node.children.length}</Badge> : null}
        </a>
        {hasChildren ? <button type="button" className="reader-tree-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${readerNavLabel(node.asset)} pages`} aria-expanded={expanded} onClick={() => setExpandedNavSections((current) => ({ ...current, [branchKey]: !expanded }))}><span className="nav-chevron" aria-hidden="true" /></button> : null}
      </div>
      {hasChildren && expanded ? <div className="nav-branch">{node.children.map((child) => renderNavNode(child, depth + 1))}</div> : null}
    </div>;
  }

  function readerPageInfoItems(asset: AssetRecord): Array<{ key: string; term: string; description: ReactNode }> {
    const catalog: Record<string, { term: string; description: ReactNode }> = {
      version: { term: "Version", description: currentVersion ? `Version ${currentVersion.versionNumber}` : "Not versioned" },
      updated: { term: "Last updated", description: formatReaderDate(asset.updatedAt) },
      access: { term: "Access", description: formatReaderAccess(asset) },
      maintainer: { term: "Maintainer", description: formatReaderMaintainer(asset.ownerId) },
      review: { term: "Review", description: formatReaderReview(asset.reviewDueAt) }
    };
    const configured = readAssetMetadataStringArray(asset, "readerPageInfoFields");
    return (configured.length ? configured : ["version", "updated", "access", "maintainer", "review"])
      .flatMap((key) => catalog[key] ? [{ key, ...catalog[key] }] : []);
  }

  return <div className={`app-shell reader-shell ${isNavCollapsed ? "nav-collapsed" : ""} ${accountSettings ? "reader-shell--account" : ""}`} style={shellStyle}>
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
    <header className="topbar">
      <a className="brand" aria-label={`${branding.displayName} pages`} href={readerPageHref(window.location, resolvedStableId)} onClick={(event) => openPageLink(event, resolvedStableId)}><Brand branding={branding} /></a>
      <div className="topbar-main reader-topbar-main">
        {accountSettings ? <div className="reader-topbar-spacer" aria-hidden="true" /> : <form className="reader-topbar-search" onSubmit={(event) => void runSearch(event)}>
          <MagnifyingGlass aria-hidden="true" />
          <Input id="reader-search-input" value={searchQuery} onChange={(event) => { searchController.current?.abort(); setSearchLoading(false); setSearchError(""); setSearchQuery(event.target.value); setLibraryQuery(event.target.value); }} placeholder="Search pages" aria-label="Search pages" />
          <span className="kbd reader-search-kbd">Cmd K</span>
        </form>}
        <div className="topbar-actions">{!accountSettings ? <Button type="button" size="sm" variant="ghost" className="reader-ask-shortcut" disabled={!assetDetail} onClick={() => { document.getElementById("reader-ask-input")?.focus(); document.getElementById("reader-ask-title")?.scrollIntoView({ block: "start" }); }}>Ask</Button> : null}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" type="button" className="identity-trigger" aria-label={`Account menu for ${displayIdentity}`}><span className="avatar">{initialsFor(displayIdentity)}</span><span className="identity-name">{displayIdentity}</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="identity-menu"><DropdownMenuLabel><span className="identity-menu-header"><span className="identity-menu-label">Signed in</span><span className="identity-menu-title"><span className="identity-menu-value">{displayIdentity}</span><Badge variant="neutral">{principal.role}</Badge></span><span className="identity-menu-email">{principal.email ?? "No email available"}</span></span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onSelect={() => onNavigate("account-settings")}>Settings</DropdownMenuItem>{canUseAdministration ? <DropdownMenuItem onSelect={() => onNavigate("admin")}>Admin</DropdownMenuItem> : null}</DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => void onLogout()}>Sign out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu></div>
      </div>
    </header>
    {!accountSettings ? <aside className="side-nav tree-nav reader-library" aria-label="Published material list">
      <div className="nav-chrome"><Button type="button" size="icon" variant="ghost" className="nav-collapse-button" aria-label={isNavCollapsed ? "Expand Pages" : "Collapse Pages"} aria-pressed={isNavCollapsed} onClick={() => setIsNavCollapsed((current) => !current)}><List aria-hidden="true" /></Button><span className="nav-chrome-label">Pages{collectionState === "loaded" ? <span className="nav-chrome-count">({filteredAssets.length})</span> : null}</span></div>
      {isNavCollapsed ? <div className="nav-group reader-nav-group reader-nav-group--collapsed"><div className="nav-tree reader-collapsed-tree">{navTree.map((node) => <a key={node.asset.id} href={readerPageHref(window.location, node.asset.stableId)} className={`reader-collapsed-node ${readerNodeContainsStableId(node, selectedAsset?.stableId) ? "is-active-ancestor" : ""}`} aria-label={readerNavLabel(node.asset)} aria-current={node.asset.stableId === selectedAsset?.stableId ? "page" : undefined} onClick={(event) => openPageLink(event, node.asset.stableId)}>{node.children.length ? <span className="folder-glyph reader-folder-icon">{renderNavIcon(node.asset, true)}</span> : <span className="nav-icon reader-leaf-dot" />}</a>)}</div></div>
        : <><div className="nav-group reader-nav-group">{filterActive ? <div className="reader-library-tools"><Button type="button" size="sm" variant="ghost" onClick={clearSearch}>Clear</Button></div> : null}<div className="nav-tree" aria-busy={collectionState === "loading"}>{navTree.length ? navTree.map((node) => renderNavNode(node)) : collectionState === "loading" ? <p role="status">Loading pages…</p> : collectionState === "error" ? <p>Pages could not load. Use Retry pages to try again.</p> : <div className="reader-empty-state"><h3>No pages found</h3><p>{filterActive ? "Clear search to see all pages." : "No published pages are available to this reader account yet."}</p></div>}</div></div><button type="button" className="nav-resizer" aria-label="Resize page navigation" aria-orientation="vertical" aria-valuemin={navWidthMin} aria-valuemax={navWidthMax} aria-valuenow={navWidth} aria-valuetext={`${navWidth} pixels`} role="separator" onPointerDown={startNavResize} onKeyDown={resizeNavWithKeyboard} /></>}
    </aside> : null}
    <main className={`reader-main ${accountSettings ? "reader-main--account" : ""}`} id="main" tabIndex={-1}>
      {accountSettings ? <section className="account-settings-page" aria-labelledby="account-settings-title"><a className="reader-return-link" href={readerPageHref(window.location, resolvedStableId)} onClick={(event) => openPageLink(event, resolvedStableId)}>Back to pages</a><header className="account-settings-header"><p className="eyebrow">Account</p><h1 id="account-settings-title">Settings</h1><p>Your signed-in account and role.</p></header><dl className="account-settings-grid"><div><dt>Name</dt><dd>{displayIdentity}</dd></div><div><dt>Email</dt><dd>{principal.email ?? "not available"}</dd></div><div><dt>Role</dt><dd>{principal.role}</dd></div></dl><details className="reader-account-access"><summary>Session access details</summary><dl className="account-settings-grid"><div><dt>Principal</dt><dd>{principal.principalType}</dd></div><div><dt>Groups</dt><dd>{formatList(principal.groupIds)}</dd></div><div><dt>Scopes</dt><dd>{formatList(principal.scopes)}</dd></div></dl></details><div className="account-settings-actions">{canUseAdministration ? <Button type="button" onClick={() => onNavigate("admin")}>Admin</Button> : null}<Button type="button" variant="ghost" onClick={() => void onLogout()}>Sign out</Button></div></section> : <>
        {collectionError ? <Alert variant="destructive" className="reader-alert"><AlertTitle>Pages could not load</AlertTitle><AlertDescription>{collectionError}</AlertDescription><Button type="button" size="sm" onClick={() => setCollectionRetry((current) => current + 1)}>Retry pages</Button></Alert> : null}
        {filterActive ? <section className="reader-search-results" id="reader-search-results" aria-label="Search results" aria-busy={searchLoading}><div className="reader-search-results-header"><div><p className="eyebrow">Search results</p><h2>Results for “{libraryQuery.trim()}”</h2></div><Button type="button" size="sm" variant="ghost" onClick={clearSearch}>Clear</Button></div>
          {searchLoading ? <p role="status">Searching accessible pages…</p> : searchError ? <Alert variant="destructive"><AlertTitle>Search could not finish</AlertTitle><AlertDescription>{searchError}</AlertDescription><Button type="button" size="sm" onClick={() => void runSearch()}>Retry search</Button></Alert> : searchHasFreshResponse ? searchPageResults.length ? <div className="reader-search-list">{searchPageResults.slice(0, 5).map(({ result, matchCount }) => <article className="reader-search-result" data-stable-id={result.asset.stableId} key={result.asset.stableId}><div><p className="reader-search-meta">{formatAssetTypeLabel(result.asset.type)} · {formatReaderAccess(result.asset)}{matchCount > 1 ? ` · ${matchCount} matches` : ""}</p><h3>{result.asset.title}</h3><p>{formatReaderSnippet(result.citation.snippet || result.content, 180)}</p></div><Button asChild size="sm"><a href={readerPageHref(window.location, result.asset.stableId)} onClick={(event) => { openPageLink(event, result.asset.stableId); if (event.defaultPrevented) scrollReaderRegionIntoView("reader-article"); }}>Open page</a></Button></article>)}</div> : <div className="reader-empty-state"><h3>No readable results</h3><p>No pages you can read matched this search.</p></div> : <div className="reader-search-prompt"><p>Press Enter to search page content and sources.</p></div>}
        </section> : null}
        <section className="reader-mobile-page-picker" aria-label="Choose a page"><Label htmlFor="reader-mobile-page-select">Pages</Label><NativeSelect id="reader-mobile-page-select" aria-label="Choose a page" value={resolvedStableId} disabled={collectionState !== "loaded" || !filteredAssets.length} onChange={(event) => { selectPage(event.target.value); scrollReaderRegionIntoView("reader-article"); }}>{!filteredAssets.some((asset) => asset.stableId === resolvedStableId) ? <option value={resolvedStableId}>{collectionState === "loading" ? "Loading pages…" : selectedAsset?.title ?? (resolvedStableId ? "Page unavailable" : "Choose a page")}</option> : null}{filteredAssets.map((asset) => <option key={asset.id} value={asset.stableId}>{asset.title}</option>)}</NativeSelect></section>
        <section className="reader-layout reader-layout--content" aria-label="Published library"><article className="reader-article" id="reader-article">
          {assetDetail && selectedAsset ? <><header className="reader-article-header"><div><p className="eyebrow">{formatAssetTypeLabel(assetDetail.asset.type)}</p><h1 id="reader-page-title" tabIndex={-1}>{assetDetail.asset.title}</h1>{assetDetail.asset.summary ? <p>{assetDetail.asset.summary}</p> : null}</div><div className="reader-status"><Badge variant={stateBadgeVariant(assetDetail.asset.lifecycleState)}>{formatReaderLifecycle(assetDetail.asset.lifecycleState)}</Badge><Badge variant={stateBadgeVariant(assetDetail.asset.status)}>{formatReaderStatus(assetDetail.asset.status)}</Badge></div></header>
            {sectionHeadings.length ? <details className="reader-section-nav reader-outline"><summary>On this page</summary><nav aria-label="Page sections"><div>{sectionHeadings.map((heading) => <button type="button" className={heading.level === 3 ? "is-nested" : ""} key={heading.id} onClick={() => { const target = document.getElementById(heading.id); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "start" }); }}>{heading.text}</button>)}</div></nav></details> : null}
            <div className="reader-document">{humanBody ? <div className="reader-document-body"><MarkdownDocument body={humanBody} title={assetDetail.asset.title} /></div> : <div className="reader-empty-state"><h3>No readable page yet</h3><p>This item is published, but it does not have a human-readable page body yet.</p></div>}</div>
            <AttachmentsPanel
              attachments={attachments}
              canManage={false}
              loading={attachmentsLoading}
              uploading={false}
              maxBytes={attachmentMaxBytes}
              error={attachmentsError}
              onUpload={() => undefined}
              onDownload={(attachment) => void downloadAttachment(attachment)}
              onDelete={() => undefined}
            />
            <section className="reader-ask-panel" aria-labelledby="reader-ask-title"><div className="reader-ask-heading"><div><p className="eyebrow">Ask</p><h2 id="reader-ask-title">Ask this knowledge base</h2><p>Get an answer with citations from pages available to your account.</p></div>{readerAskResponse ? <Badge variant={!readerAskResponse.citations.length || readerAskResponse.checks.deniedCount ? "warning" : "success"}>{!readerAskResponse.citations.length ? "No matching sources" : readerAskResponse.checks.deniedCount ? "Limited results" : "Sources checked"}</Badge> : null}</div>
              <form className="reader-ask-form" onSubmit={(event) => void runAsk(event)}><Label htmlFor="reader-ask-input" className="sr-only">Ask a question</Label><Input id="reader-ask-input" value={readerAskText} onChange={(event) => setReaderAskText(event.target.value)} placeholder="Ask about these pages" aria-describedby="reader-ask-help" /><p id="reader-ask-help" className="reader-ask-note">Answers only use content your account can read.</p><Button type="submit" disabled={isReaderAskRunning || !readerAskText.trim()}>{isReaderAskRunning ? "Finding sources…" : "Ask"}</Button></form>
              {isReaderAskRunning ? <div className="reader-ask-loading" role="status" aria-live="polite"><span className="reader-loading-dot" aria-hidden="true" />Finding an answer and checking accessible sources.</div> : null}
              {readerAskError ? <Alert variant="destructive" className="reader-ask-error"><AlertTitle>Could not answer this question</AlertTitle><AlertDescription>{readerAskError}</AlertDescription></Alert> : null}
              {readerAskResponse && !isReaderAskRunning ? <div className="reader-ask-answer" aria-live="polite"><div><h3>Answer</h3>{!readerAskResponse.citations.length ? <div className="reader-no-access-state"><strong>No accessible answer was found.</strong><p>Try another question or ask an admin to check your access.</p></div> : renderReaderAnswer(readerAskResponse.answer)}{readerAskResponse.checks.deniedCount && readerAskResponse.citations.length ? <p className="reader-ask-note">Some matching pages are not available to your account.</p> : null}</div><div className="reader-citations" aria-label="Sources"><h3>Sources</h3>{readerAskResponse.citations.length ? readerAskResponse.citations.slice(0, 5).map((citation, index) => <details className="reader-citation" key={`${citation.assetId}:${citation.chunkId}`} open={index === 0}><summary><strong>{citation.title}</strong><span>Source {index + 1}</span></summary><p>{formatReaderSnippet(citation.snippet, 180)}</p><Button asChild size="sm" variant="ghost"><a href={readerPageHref(window.location, citation.stableId)} onClick={(event) => { openPageLink(event, citation.stableId); if (event.defaultPrevented) scrollReaderRegionIntoView("reader-article"); }}>Open source page</a></Button></details>) : <p className="reader-ask-note">No accessible sources matched this question.</p>}</div></div> : !isReaderAskRunning ? <div className="reader-ask-empty"><p>Try asking “What should be redacted?”</p></div> : null}
            </section>
            <footer className="reader-page-footer" aria-label="Page details"><dl>{readerPageInfoItems(assetDetail.asset).map((item) => <div key={item.key}><dt>{item.term}</dt><dd>{item.description}</dd></div>)}</dl></footer>
          </> : pageLoading ? <div className="reader-empty-state reader-empty-state--large" role="status"><h2>{collectionState === "loading" ? "Loading pages…" : "Loading page…"}</h2><p>{selectedAsset ? `Opening ${selectedAsset.title}.` : "Finding the pages available to your account."}</p></div>
            : pageError ? <div className="reader-empty-state reader-empty-state--large" role="alert"><h2 id="reader-page-title" tabIndex={-1}>Page could not load</h2><p>{pageError}</p><Button type="button" onClick={() => setPageRetry((current) => current + 1)}>Retry page</Button></div>
              : collectionState === "error" ? <div className="reader-empty-state reader-empty-state--large"><h2>Pages could not load</h2><p>Retry the page list to continue reading.</p></div>
                : resolvedStableId ? <div className="reader-empty-state reader-empty-state--large"><h2 id="reader-page-title" tabIndex={-1}>Page unavailable</h2><p>This page may be unpublished, removed, or outside your access. Choose another page or ask an administrator to check your access.</p>{publishedAssets[0] ? <Button asChild><a href={readerPageHref(window.location, publishedAssets[0].stableId)} onClick={(event) => openPageLink(event, publishedAssets[0]!.stableId)}>Browse available pages</a></Button> : <Button type="button" onClick={() => setCollectionRetry((current) => current + 1)}>Retry pages</Button>}</div>
                  : <div className="reader-empty-state reader-empty-state--large"><h2>No published pages yet</h2><p>No published pages are available to your account. Ask an administrator to check your access or publish a page.</p><Button type="button" onClick={() => setCollectionRetry((current) => current + 1)}>Refresh pages</Button></div>}
        </article></section>
      </>}
    </main>
  </div>;
}
