import { loadAssetCollection } from "./lib/asset-collection.js";
import type { AssetDetail, AssetRecord, Attachment, AuthPrincipal, ManagedQueryResponse, SearchResponse } from "@forgetbase/schema";
import { BookOpen } from "@phosphor-icons/react/dist/icons/BookOpen";
import { ClipboardText } from "@phosphor-icons/react/dist/icons/ClipboardText";
import { GearSix } from "@phosphor-icons/react/dist/icons/GearSix";
import { List } from "@phosphor-icons/react/dist/icons/List";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/icons/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/dist/icons/Package";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
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
import {
  buildReaderNavTree,
  extractReaderSectionHeadings,
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
  renderMarkdownDocument,
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
  principal: AuthPrincipal;
  route: Extract<AppRoute, "reader" | "account-settings">;
  request: AppRequest;
  requestBinary: AppBinaryRequest;
  onLogout: () => Promise<void>;
  onNavigate: (route: string) => void;
  canUseAdministration: boolean;
};

function readInitialPageId(): string {
  return new URLSearchParams(window.location.search).get("page")?.trim() ?? "";
}

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

export function ReaderSurface({ principal, route, request, requestBinary, onLogout, onNavigate, canUseAdministration }: ReaderSurfaceProps) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [selectedStableId, setSelectedStableId] = useState(readInitialPageId);
  const [assetDetail, setAssetDetail] = useState<AssetDetail | null>(null);
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
  const [error, setError] = useState("");
  const [navWidth, setNavWidth] = useState(readInitialNavWidth);
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => localStorage.getItem(navCollapsedStorageKey) === "true");
  const [expandedNavSections, setExpandedNavSections] = useState<Record<string, boolean>>(readExpandedSections);

  const publishedAssets = useMemo(() => assets.filter(isPublishedReaderAsset), [assets]);
  const filteredAssets = useMemo(() => publishedAssets.filter((asset) => readerAssetMatches(asset, libraryQuery)), [libraryQuery, publishedAssets]);
  const selectedAsset = publishedAssets.find((asset) => asset.stableId === selectedStableId) ?? filteredAssets[0] ?? publishedAssets[0];
  const navTree = useMemo(() => buildReaderNavTree(filteredAssets), [filteredAssets]);
  const humanBody = assetDetail?.humanDocuments[0]?.body ?? "";
  const currentVersion = assetDetail?.versions.find((version) => version.id === assetDetail.asset.currentVersionId) ?? assetDetail?.versions[0];
  const sectionHeadings = useMemo(() => assetDetail && humanBody
    ? extractReaderSectionHeadings(humanBody, assetDetail.asset.title).slice(0, 8)
    : [], [assetDetail, humanBody]);
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
    void loadAssetCollection(request, { signal: controller.signal })
      .then((collection) => { if (!controller.signal.aborted) setAssets(collection); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : String(loadError)); });
    return () => controller.abort();
  }, [request]);

  useEffect(() => {
    if (!publishedAssets.length) {
      setSelectedStableId("");
      setAssetDetail(null);
      return;
    }
    if (!publishedAssets.some((asset) => asset.stableId === selectedStableId)) setSelectedStableId(publishedAssets[0]!.stableId);
  }, [publishedAssets, selectedStableId]);

  useEffect(() => {
    if (accountSettings || !selectedAsset) {
      setAttachments([]);
      return;
    }
    let active = true;
    setAssetDetail(null);
    setAttachmentsLoading(true);
    setAttachmentsError("");
    void request<AssetDetail>(`/assets/${encodeURIComponent(selectedAsset.stableId)}`)
      .then((detail) => { if (active) setAssetDetail(detail); })
      .catch((loadError) => { if (active) { setAssetDetail(null); setError(loadError instanceof Error ? loadError.message : String(loadError)); } });
    void request<{ attachments: Attachment[] }>(`/assets/${encodeURIComponent(selectedAsset.stableId)}/attachments`)
      .then((response) => { if (active) setAttachments(response.attachments); })
      .catch((loadError) => { if (active) { setAttachments([]); setAttachmentsError(loadError instanceof Error ? loadError.message : String(loadError)); } })
      .finally(() => { if (active) setAttachmentsLoading(false); });
    return () => { active = false; };
  }, [accountSettings, request, selectedAsset?.stableId]);

  useEffect(() => {
    if (accountSettings || !selectedStableId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("page") === selectedStableId && url.hash === "#reader") return;
    url.searchParams.set("page", selectedStableId);
    url.hash = "reader";
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }, [accountSettings, selectedStableId]);

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
    setSelectedStableId(stableId);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".reader-article-header h1")?.focus({ preventScroll: true }));
  }

  async function runSearch(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    setError("");
    const query = searchQuery.trim();
    setLibraryQuery(query);
    if (!query) { setSearchResponse(null); return; }
    try {
      const params = new URLSearchParams({ query, limit: "8" });
      const response = await request<SearchResponse>(`/search?${params.toString()}`);
      setSearchResponse(response);
      scrollReaderRegionIntoView("reader-search-results");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    }
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
      <Button type="button" variant="ghost" className={`${hasChildren ? "nav-folder" : "nav-link nav-leaf has-dot"} reader-nav-node ${selectedBranch ? "is-active-ancestor" : ""} ${expanded ? "is-expanded" : ""} ${active ? "active" : ""}`} data-depth={depth} aria-current={active ? "page" : undefined} aria-expanded={hasChildren ? expanded : undefined} onClick={() => {
        selectPage(node.asset.stableId);
        if (hasChildren) setExpandedNavSections((current) => ({ ...current, [branchKey]: !(current[branchKey] ?? selectedBranch) }));
      }}>
        {hasChildren ? <span className="folder-glyph reader-folder-icon" aria-hidden="true">{renderNavIcon(node.asset, true)}</span> : <span className="nav-icon reader-leaf-dot" aria-hidden="true" />}
        <span className="nav-text">{readerNavLabel(node.asset)}</span>
        {hasChildren ? <><Badge variant="neutral" className="nav-count">{node.children.length}</Badge><span className="nav-chevron" aria-hidden="true" /></> : null}
      </Button>
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
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <div className="brand"><span className="mark" aria-hidden="true"><img className="mark-image" src="/favicon.svg" alt="" /></span><span className="brand-name">ForgetBase</span></div>
      <div className="topbar-main reader-topbar-main">
        {accountSettings ? <div className="reader-topbar-spacer" aria-hidden="true" /> : <form className="reader-topbar-search" onSubmit={(event) => void runSearch(event)}>
          <MagnifyingGlass aria-hidden="true" />
          <Input id="reader-search-input" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setLibraryQuery(event.target.value); }} placeholder="Search pages" aria-label="Search pages" />
          <span className="kbd reader-search-kbd">Cmd K</span>
        </form>}
        <div className="topbar-actions"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" type="button" className="identity-trigger" aria-label={`Account menu for ${displayIdentity}`}><span className="avatar">{initialsFor(displayIdentity)}</span><span className="identity-name">{displayIdentity}</span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="identity-menu"><DropdownMenuLabel><span className="identity-menu-header"><span className="identity-menu-label">Signed in</span><span className="identity-menu-title"><span className="identity-menu-value">{displayIdentity}</span><Badge variant="neutral">{principal.role}</Badge></span><span className="identity-menu-email">{principal.email ?? "No email available"}</span></span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onSelect={() => onNavigate("account-settings")}>Settings</DropdownMenuItem>{canUseAdministration ? <DropdownMenuItem onSelect={() => onNavigate("admin/content")}>Admin</DropdownMenuItem> : null}</DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => void onLogout()}>Sign out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu></div>
      </div>
    </header>
    {!accountSettings ? <aside className="side-nav tree-nav reader-library" aria-label="Published material list">
      <div className="nav-chrome"><Button type="button" size="icon" variant="ghost" className="nav-collapse-button" aria-label={isNavCollapsed ? "Expand Pages" : "Collapse Pages"} aria-pressed={isNavCollapsed} onClick={() => setIsNavCollapsed((current) => !current)}><List aria-hidden="true" /></Button><span className="nav-chrome-label">Pages<span className="nav-chrome-count">({filteredAssets.length})</span></span></div>
      {isNavCollapsed ? <div className="nav-group reader-nav-group reader-nav-group--collapsed"><div className="nav-tree reader-collapsed-tree">{navTree.map((node) => <Button key={node.asset.id} type="button" variant="ghost" className={`reader-collapsed-node ${readerNodeContainsStableId(node, selectedAsset?.stableId) ? "is-active-ancestor" : ""}`} aria-label={readerNavLabel(node.asset)} onClick={() => selectPage(node.asset.stableId)}>{node.children.length ? <span className="folder-glyph reader-folder-icon">{renderNavIcon(node.asset, true)}</span> : <span className="nav-icon reader-leaf-dot" />}</Button>)}</div></div>
        : <><div className="nav-group reader-nav-group">{filterActive ? <div className="reader-library-tools"><Button type="button" size="sm" variant="ghost" onClick={() => { setLibraryQuery(""); setSearchQuery(""); }}>Clear</Button></div> : null}<div className="nav-tree">{navTree.length ? navTree.map((node) => renderNavNode(node)) : <div className="reader-empty-state"><h3>No pages found</h3><p>{filterActive ? "Clear search to see all pages." : "No approved pages are available to this reader account yet."}</p></div>}</div></div><button type="button" className="nav-resizer" aria-label="Resize page navigation" aria-valuemin={navWidthMin} aria-valuemax={navWidthMax} aria-valuenow={navWidth} role="separator" onPointerDown={startNavResize} /></>}
    </aside> : null}
    <main className={`reader-main ${accountSettings ? "reader-main--account" : ""}`} id="main">
      {accountSettings ? <section className="account-settings-page" aria-labelledby="account-settings-title"><header className="account-settings-header"><p className="eyebrow">Account</p><h1 id="account-settings-title">Settings</h1><p>Review the signed-in identity, role, groups, and access scopes used for this session.</p></header><dl className="account-settings-grid"><div><dt>Name</dt><dd>{displayIdentity}</dd></div><div><dt>Email</dt><dd>{principal.email ?? "not available"}</dd></div><div><dt>Role</dt><dd>{principal.role}</dd></div><div><dt>Principal</dt><dd>{principal.principalType}</dd></div><div><dt>Groups</dt><dd>{formatList(principal.groupIds)}</dd></div><div><dt>Scopes</dt><dd>{formatList(principal.scopes)}</dd></div></dl><div className="account-settings-actions">{canUseAdministration ? <Button type="button" onClick={() => onNavigate("admin/content")}>Admin</Button> : null}<Button type="button" variant="ghost" onClick={() => void onLogout()}>Sign out</Button></div></section> : <>
        {error ? <Alert variant="destructive" className="reader-alert"><AlertTitle>Request failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {filterActive ? <section className="reader-search-results" id="reader-search-results" aria-label="Search results"><div className="reader-search-results-header"><div><p className="eyebrow">Search results</p><h2>Results for “{libraryQuery.trim()}”</h2></div><Button type="button" size="sm" variant="ghost" onClick={() => { setLibraryQuery(""); setSearchQuery(""); setSearchResponse(null); }}>Clear</Button></div>
          {searchHasFreshResponse ? searchPageResults.length ? <div className="reader-search-list">{searchPageResults.slice(0, 5).map(({ result, matchCount }) => <article className="reader-search-result" data-stable-id={result.asset.stableId} key={result.asset.stableId}><div><p className="reader-search-meta">{formatAssetTypeLabel(result.asset.type)} · {formatReaderAccess(result.asset)}{matchCount > 1 ? ` · ${matchCount} matches` : ""}</p><h3>{result.asset.title}</h3><p>{formatReaderSnippet(result.citation.snippet || result.content, 180)}</p></div><Button type="button" size="sm" onClick={() => { selectPage(result.asset.stableId); scrollReaderRegionIntoView("reader-article"); }}>Open page</Button></article>)}</div> : <div className="reader-empty-state"><h3>No readable results</h3><p>No pages you can read matched this search.</p></div> : <div className="reader-search-prompt"><p>Press Enter to search page content and sources.</p></div>}
        </section> : null}
        <section className="reader-mobile-page-picker" aria-label="Choose a page"><div><p className="eyebrow">Pages</p><p>{filteredAssets.length} page{filteredAssets.length === 1 ? "" : "s"} available</p></div><NativeSelect aria-label="Choose a page" value={selectedAsset?.stableId ?? ""} onChange={(event) => { selectPage(event.target.value); scrollReaderRegionIntoView("reader-article"); }}>{filteredAssets.map((asset) => <option key={asset.id} value={asset.stableId}>{asset.title}</option>)}</NativeSelect></section>
        <section className="reader-layout reader-layout--content" aria-label="Published library"><article className="reader-article" id="reader-article">
          {assetDetail && selectedAsset ? <><header className="reader-article-header"><div><p className="eyebrow">{formatAssetTypeLabel(assetDetail.asset.type)}</p><h1 tabIndex={-1}>{assetDetail.asset.title}</h1>{assetDetail.asset.summary ? <p>{assetDetail.asset.summary}</p> : null}</div><div className="reader-status"><Badge variant={stateBadgeVariant(assetDetail.asset.lifecycleState)}>{formatReaderLifecycle(assetDetail.asset.lifecycleState)}</Badge><Badge variant={stateBadgeVariant(assetDetail.asset.status)}>{formatReaderStatus(assetDetail.asset.status)}</Badge></div></header>
            {sectionHeadings.length ? <nav className="reader-section-nav" aria-label="Page sections"><p>On this page</p><div>{sectionHeadings.map((heading) => <button type="button" className={heading.level === 3 ? "is-nested" : ""} key={heading.id} onClick={() => document.getElementById(heading.id)?.scrollIntoView({ block: "start" })}>{heading.text}</button>)}</div></nav> : null}
            <div className="reader-document">{humanBody ? <div className="reader-document-body">{renderMarkdownDocument(humanBody, assetDetail.asset.title)}</div> : <div className="reader-empty-state"><h3>No readable page yet</h3><p>This item is published, but it does not have a human-readable page body yet.</p></div>}</div>
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
              {readerAskResponse && !isReaderAskRunning ? <div className="reader-ask-answer" aria-live="polite"><div><h3>Answer</h3>{!readerAskResponse.citations.length ? <div className="reader-no-access-state"><strong>No accessible answer was found.</strong><p>Try another question or ask an admin to check your access.</p></div> : renderReaderAnswer(readerAskResponse.answer)}{readerAskResponse.checks.deniedCount && readerAskResponse.citations.length ? <p className="reader-ask-note">Some matching pages are not available to your account.</p> : null}</div><div className="reader-citations" aria-label="Sources"><h3>Sources</h3>{readerAskResponse.citations.length ? readerAskResponse.citations.slice(0, 5).map((citation, index) => <details className="reader-citation" key={`${citation.assetId}:${citation.chunkId}`} open={index === 0}><summary><strong>{citation.title}</strong><span>Source {index + 1}</span></summary><p>{formatReaderSnippet(citation.snippet, 180)}</p><Button type="button" size="sm" variant="ghost" onClick={() => { selectPage(citation.stableId); scrollReaderRegionIntoView("reader-article"); }}>Open source page</Button></details>) : <p className="reader-ask-note">No accessible sources matched this question.</p>}</div></div> : !isReaderAskRunning ? <div className="reader-ask-empty"><p>Try asking “What should be redacted?”</p></div> : null}
            </section>
            <footer className="reader-page-footer" aria-label="Page details"><dl>{readerPageInfoItems(assetDetail.asset).map((item) => <div key={item.key}><dt>{item.term}</dt><dd>{item.description}</dd></div>)}</dl></footer>
          </> : <div className="reader-empty-state reader-empty-state--large"><h2>No page selected</h2><p>Select a page from the list after it loads.</p></div>}
        </article></section>
      </>}
    </main>
  </div>;
}
