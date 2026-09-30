import type { AssetDetail, AssetRecord, Attachment, AuthPrincipal, Branding, ManagedQueryResponse, SearchResponse } from "@forgetbase/schema";
import { BookOpen } from "@phosphor-icons/react/dist/icons/BookOpen";
import { ClipboardText } from "@phosphor-icons/react/dist/icons/ClipboardText";
import { GearSix } from "@phosphor-icons/react/dist/icons/GearSix";
import { List } from "@phosphor-icons/react/dist/icons/List";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/icons/MagnifyingGlass";
import { Package } from "@phosphor-icons/react/dist/icons/Package";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Brand } from "./components/brand.js";
import { AttachmentsPanel } from "./components/domain/attachments-panel.js";
import { MarkdownDocument, useMarkdownHeadings } from "./components/markdown/markdown-document.js";
import type { ReaderInfoItem } from "./components/reader/reader-evidence.js";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert.js";
import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu.js";
import { Label } from "./components/ui/label.js";
import { NativeSelect } from "./components/ui/native-select.js";
import type { AppBinaryRequest, AppRequest } from "./lib/app-api.js";
import type { AppRoute } from "./lib/app-routing.js";
import { loadAssetCollection } from "./lib/asset-collection.js";
import { formatList } from "./lib/asset-ui.js";
import { readReaderPageId, readerLoadFailure, readerNavWidthForKey, readerPageHref } from "./lib/reader-navigation.js";
import { buildReaderNavTree, formatAssetTypeLabel, formatReaderAccess, formatReaderDate, readAssetMetadataString, readAssetMetadataStringArray, readerNavLabel, readerNodeContainsStableId, type ReaderNavNode } from "./lib/reader-ui.js";

const navWidthStorageKey = "forgetbase-web-nav-width";
const navCollapsedStorageKey = "forgetbase-web-nav-collapsed";
const navExpandedStorageKey = "forgetbase-web-nav-expanded";
const navWidthDefault = 280;
const navWidthMin = 240;
const navWidthMax = 420;
const navCollapsedWidth = 64;
const attachmentMaxBytes = 10 * 1024 * 1024;

type ReaderSurfaceProps = {
  branding: Branding; principal: AuthPrincipal; route: Extract<AppRoute, "reader" | "account-settings">;
  request: AppRequest; requestBinary: AppBinaryRequest; onLogout: () => Promise<void>;
  onNavigate: (route: string, pageId?: string) => void; canUseAdministration: boolean;
};
type LoadState = "loading" | "loaded" | "error";
type ReaderDialog = "search" | "ask" | "details";
type PageRequest = { stableId: string; state: LoadState; detail: AssetDetail | null; error: string; unavailable: boolean };
type AttachmentRequest = { stableId: string; state: LoadState; attachments: Attachment[]; error: string };

function readInitialNavWidth(): number {
  const stored = Number.parseInt(localStorage.getItem(navWidthStorageKey) || "", 10);
  return Number.isFinite(stored) ? Math.min(navWidthMax, Math.max(navWidthMin, stored)) : navWidthDefault;
}
function readExpandedSections(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(navExpandedStorageKey) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Boolean(value)])) : {};
  } catch { return {}; }
}
function isPublishedReaderAsset(asset: AssetRecord): boolean {
  return asset.lifecycleState === "active" && asset.status === "approved" && asset.allowedSurfaces.includes("web");
}
function initialsFor(value: string): string {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "GU";
}
function isOrdinaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}
function focusPageTitle(): boolean {
  const title = document.getElementById("reader-page-title");
  if (!title) return false;
  title.focus({ preventScroll: true }); window.scrollTo({ top: 0 });
  return true;
}

export function ReaderSurface({ branding, principal, route, request, requestBinary, onLogout, onNavigate, canUseAdministration }: ReaderSurfaceProps) {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [selectedStableId, setSelectedStableId] = useState(() => readReaderPageId(window.location));
  const [collectionState, setCollectionState] = useState<LoadState>("loading");
  const [collectionError, setCollectionError] = useState("");
  const [collectionRetry, setCollectionRetry] = useState(0);
  const [pageRequest, setPageRequest] = useState<PageRequest>({ stableId: "", state: "loading", detail: null, error: "", unavailable: false });
  const [pageRetry, setPageRetry] = useState(0);
  const [attachmentRequest, setAttachmentRequest] = useState<AttachmentRequest>({ stableId: "", state: "loaded", attachments: [], error: "" });
  const [attachmentRetry, setAttachmentRetry] = useState(0);
  const [selectedSource, setSelectedSource] = useState({ stableId: "", sourceId: "" });
  const [dialog, setDialog] = useState<ReaderDialog | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [evidenceComponents, setEvidenceComponents] = useState<typeof import("./components/reader/reader-evidence.js") | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceLoadError, setEvidenceLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [searchSelectedId, setSearchSelectedId] = useState("");
  const [searchReturn, setSearchReturn] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [readerAskText, setReaderAskText] = useState("");
  const [readerAskResponse, setReaderAskResponse] = useState<ManagedQueryResponse | null>(null);
  const [isReaderAskRunning, setIsReaderAskRunning] = useState(false);
  const [readerAskError, setReaderAskError] = useState("");
  const [navWidth, setNavWidth] = useState(readInitialNavWidth);
  const [isNavCollapsed, setIsNavCollapsed] = useState(() => localStorage.getItem(navCollapsedStorageKey) === "true");
  const [expandedNavSections, setExpandedNavSections] = useState<Record<string, boolean>>(readExpandedSections);
  const [contentsOpen, setContentsOpen] = useState(() => window.innerWidth > 760);
  const searchController = useRef<AbortController | null>(null);
  const askController = useRef<AbortController | null>(null);
  const searchGeneration = useRef(0);
  const askGeneration = useRef(0);
  const pendingPageFocus = useRef<string | null>(null);
  const navigationDismissal = useRef(false);
  const dialogOpener = useRef<Partial<Record<ReaderDialog, HTMLElement>>>({});
  const evidenceImport = useRef<Promise<typeof import("./components/reader/reader-evidence.js")> | null>(null);
  const mounted = useRef(true);
  const dialogRef = useRef(dialog);
  const selectedStableIdRef = useRef(selectedStableId);
  dialogRef.current = dialog;
  selectedStableIdRef.current = selectedStableId;

  const accountSettings = route === "account-settings";
  const publishedAssets = useMemo(() => assets.filter(isPublishedReaderAsset), [assets]);
  const navTree = useMemo(() => buildReaderNavTree(publishedAssets), [publishedAssets]);
  const assetDetail = selectedStableId && pageRequest.stableId === selectedStableId ? pageRequest.detail : null;
  const pageLoading = Boolean(selectedStableId && (pageRequest.stableId !== selectedStableId || pageRequest.state === "loading"));
  const pageError = pageRequest.stableId === selectedStableId && pageRequest.state === "error" ? pageRequest.error : "";
  const pageUnavailable = pageRequest.stableId === selectedStableId && pageRequest.unavailable;
  const attachments = attachmentRequest.stableId === selectedStableId ? attachmentRequest.attachments : [];
  const attachmentsLoading = Boolean(selectedStableId && (attachmentRequest.stableId !== selectedStableId || attachmentRequest.state === "loading"));
  const attachmentsError = attachmentRequest.stableId === selectedStableId ? attachmentRequest.error : "";
  const sourceOptions = assetDetail ? [
    ...assetDetail.humanDocuments.map((source, index) => ({ id: source.id, label: `Page text${assetDetail.humanDocuments.length > 1 ? ` ${index + 1}` : ""}` })),
    ...assetDetail.instructionObjects.map((source, index) => ({ id: source.id, label: `Agent instruction${assetDetail.instructionObjects.length > 1 ? ` ${index + 1}` : ""}` }))
  ] : [];
  const readableSourceId = selectedSource.stableId === selectedStableId && sourceOptions.some((source) => source.id === selectedSource.sourceId)
    ? selectedSource.sourceId : sourceOptions[0]?.id ?? "";
  const humanDocument = assetDetail?.humanDocuments.find((source) => source.id === readableSourceId);
  const instruction = assetDetail?.instructionObjects.find((source) => source.id === readableSourceId);
  const readableBody = humanDocument?.body ?? instruction?.body ?? "";
  const markdownBody = instruction || humanDocument?.format === "markdown" ? readableBody : "";
  const bodyHeadings = useMarkdownHeadings(markdownBody, assetDetail?.asset.title ?? "");
  const sectionHeadings = instruction && evidenceComponents ? [...bodyHeadings, ...evidenceComponents.readerInstructionHeadings(instruction)] : bodyHeadings;
  const versionId = assetDetail?.asset.publishedVersionId ?? assetDetail?.asset.currentVersionId;
  const currentVersion = versionId ? assetDetail?.versions.find((version) => version.id === versionId) : undefined;
  const displayIdentity = principal.displayName || principal.email || "Guest";
  const shortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Cmd K" : "Ctrl K";
  const shellStyle = { "--nav": `${isNavCollapsed ? navCollapsedWidth : navWidth}px` } as CSSProperties;

  function breadcrumbAssets(stableId: string): AssetRecord[] {
    const byId = new Map(publishedAssets.map((asset) => [asset.stableId, asset]));
    if (assetDetail) byId.set(assetDetail.asset.stableId, assetDetail.asset);
    const chain: AssetRecord[] = [];
    const visited = new Set<string>();
    let item = byId.get(stableId);
    while (item && !visited.has(item.stableId)) {
      chain.unshift(item); visited.add(item.stableId);
      const parentId = readAssetMetadataString(item, "readerParentId");
      item = parentId ? byId.get(parentId) : undefined;
    }
    return chain;
  }
  function pageInfoItems(): ReaderInfoItem[] {
    if (!assetDetail) return [];
    const asset = assetDetail.asset;
    const dueTime = Date.parse(asset.reviewDueAt);
    const review = !asset.reviewDueAt ? "Not scheduled" : Number.isFinite(dueTime) && dueTime < Date.now()
      ? `Review overdue · ${formatReaderDate(asset.reviewDueAt)}` : `Due ${formatReaderDate(asset.reviewDueAt)}`;
    const catalog: Record<string, { term: string; description: ReactNode }> = {
      version: { term: "Version", description: currentVersion ? `Version ${currentVersion.versionNumber}` : "Version unavailable" },
      updated: { term: "Last updated", description: asset.updatedAt ? formatReaderDate(asset.updatedAt) : "Not supplied" },
      access: { term: "Access", description: formatReaderAccess(asset) },
      maintainer: { term: "Maintainer", description: asset.ownerId || "Not supplied" },
      review: { term: "Review", description: review }
    };
    const configured = readAssetMetadataStringArray(asset, "readerPageInfoFields");
    return (configured.length ? configured : ["version", "updated", "access", "maintainer", "review"])
      .flatMap((key) => catalog[key] ? [{ key, ...catalog[key] }] : []);
  }

  useEffect(() => {
    localStorage.setItem(navWidthStorageKey, String(navWidth));
    localStorage.setItem(navCollapsedStorageKey, String(isNavCollapsed));
    localStorage.setItem(navExpandedStorageKey, JSON.stringify(expandedNavSections));
  }, [expandedNavSections, isNavCollapsed, navWidth]);
  useEffect(() => {
    const controller = new AbortController();
    setCollectionState("loading"); setCollectionError("");
    void loadAssetCollection(request, { signal: controller.signal }).then((collection) => {
      if (!controller.signal.aborted) { setAssets(collection); setCollectionState("loaded"); }
    }).catch((error) => {
      if (!controller.signal.aborted) { setAssets([]); setCollectionError(readerLoadFailure(error, "pages")); setCollectionState("error"); }
    });
    return () => controller.abort();
  }, [collectionRetry, request]);
  useEffect(() => {
    const syncPage = () => selectPageState(readReaderPageId(window.location));
    window.addEventListener("popstate", syncPage); window.addEventListener("hashchange", syncPage);
    return () => { window.removeEventListener("popstate", syncPage); window.removeEventListener("hashchange", syncPage); };
  }, []);
  useEffect(() => {
    if (accountSettings || !selectedStableId) return;
    const controller = new AbortController();
    const stableId = selectedStableId;
    setPageRequest({ stableId, state: "loading", detail: null, error: "", unavailable: false });
    void request<AssetDetail>(`/assets/${encodeURIComponent(stableId)}`, { signal: controller.signal }).then((detail) => {
      if (controller.signal.aborted) return;
      if (detail.asset.stableId !== stableId || !isPublishedReaderAsset(detail.asset)) {
        setPageRequest({ stableId, state: "error", detail: null, error: "This page is unavailable. Choose another published source.", unavailable: true });
      } else setPageRequest({ stableId, state: "loaded", detail, error: "", unavailable: false });
    }).catch((error) => {
      if (!controller.signal.aborted) setPageRequest({ stableId, state: "error", detail: null, error: readerLoadFailure(error, "page"), unavailable: /^(403|404)\b/.test(error instanceof Error ? error.message : String(error)) });
    });
    return () => controller.abort();
  }, [accountSettings, selectedStableId, pageRetry, request]);
  useEffect(() => {
    if (accountSettings || !selectedStableId) return;
    const controller = new AbortController();
    const stableId = selectedStableId;
    setAttachmentRequest({ stableId, state: "loading", attachments: [], error: "" });
    void request<{ attachments: Attachment[] }>(`/assets/${encodeURIComponent(stableId)}/attachments`, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) setAttachmentRequest({ stableId, state: "loaded", attachments: response.attachments, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setAttachmentRequest({ stableId, state: "error", attachments: [], error: readerLoadFailure(error, "page") });
    });
    return () => controller.abort();
  }, [accountSettings, selectedStableId, attachmentRetry, request]);
  useEffect(() => {
    if (accountSettings || pageLoading || (!selectedStableId && !evidenceComponents && !evidenceLoadError) || pendingPageFocus.current !== selectedStableId || dialog) return;
    const frame = window.requestAnimationFrame(() => {
      if (focusPageTitle()) pendingPageFocus.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [accountSettings, pageLoading, assetDetail, pageError, selectedStableId, collectionState, dialog, evidenceComponents, evidenceLoadError]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; searchController.current?.abort(); askController.current?.abort(); };
  }, []);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!accountSettings && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openDialog("search"); }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [accountSettings]);
  useEffect(() => {
    const region = document.querySelector(".reader-document-body");
    if (!region) return;
    const labelTables = () => {
      let heading = assetDetail?.asset.title ?? "Page";
      for (const element of Array.from(region.querySelectorAll<HTMLElement>("h2,h3,h4,h5,h6,table,pre:not(.markdown-source-fallback)"))) {
        if (element.tagName === "PRE" && !element.querySelector("code")) continue;
        if (element.tagName !== "TABLE" && element.tagName !== "PRE") heading = element.textContent?.trim() || heading;
        else {
          const table = element.tagName === "TABLE";
          element.tabIndex = 0; element.setAttribute("role", table ? "table" : "region"); element.setAttribute("aria-label", `${heading} ${table ? "table" : "code example"}`);
        }
      }
    };
    labelTables();
    const observer = new MutationObserver(labelTables);
    observer.observe(region, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [assetDetail, readableSourceId]);

  function loadEvidence(): void {
    if (evidenceComponents || evidenceImport.current) return;
    setEvidenceLoading(true); setEvidenceLoadError(false);
    const pending = import("./components/reader/reader-evidence.js");
    evidenceImport.current = pending;
    void pending.then((components) => { if (mounted.current) setEvidenceComponents(components); }).catch(() => {
      evidenceImport.current = null;
      if (mounted.current) setEvidenceLoadError(true);
    }).finally(() => { if (mounted.current) setEvidenceLoading(false); });
  }
  useEffect(() => {
    if (accountSettings || instruction || !selectedStableId) loadEvidence();
  }, [instruction?.id, accountSettings, selectedStableId]);
  function openDialog(next: ReaderDialog): void {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest("[role=dialog]")) dialogOpener.current[next] = document.activeElement;
    setMobileNavOpen(false); loadEvidence(); setDialog(next);
  }
  function closeDialogFocus(kind: ReaderDialog): void {
    if (navigationDismissal.current) {
      navigationDismissal.current = false;
      if (pendingPageFocus.current === null) focusPageTitle();
      return;
    }
    if (pendingPageFocus.current !== null || dialogRef.current !== null) return;
    const opener = dialogOpener.current[kind];
    if (opener?.isConnected) opener.focus();
    else document.getElementById(kind === "search" ? "reader-search-trigger" : kind === "ask" ? "reader-ask-trigger" : "reader-source-trigger")?.focus();
  }
  function selectPageState(stableId: string): void {
    if (selectedStableIdRef.current !== stableId) setPageRequest({ stableId, state: "loading", detail: null, error: "", unavailable: false });
    pendingPageFocus.current = stableId; setSelectedStableId(stableId);
  }
  function selectPage(stableId: string): void {
    if (evidenceComponents && (dialogRef.current !== null || mobileNavOpen)) navigationDismissal.current = true;
    selectPageState(stableId); setMobileNavOpen(false); setDialog(null);
    onNavigate("reader", stableId);
    if (selectedStableId === stableId && (assetDetail || (!stableId && (evidenceComponents || evidenceLoadError)))) window.requestAnimationFrame(() => {
      focusPageTitle(); pendingPageFocus.current = null;
    });
  }
  function openPageLink(event: MouseEvent<HTMLAnchorElement>, stableId: string): void {
    if (!isOrdinaryClick(event)) return;
    event.preventDefault(); setSearchReturn(false); selectPage(stableId);
  }
  function openSearchPage(event: MouseEvent<HTMLAnchorElement>, stableId: string): void {
    if (!isOrdinaryClick(event)) return;
    event.preventDefault(); setSearchReturn(true); selectPage(stableId);
  }
  function changeDialog(kind: ReaderDialog, open: boolean): void {
    setDialog((current) => open ? kind : current === kind ? null : current);
  }
  async function runSearch(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    searchController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    const generation = ++searchGeneration.current;
    setSubmittedSearchQuery(query); setSearchLoading(true); setSearchError(""); setSearchResponse(null); setSearchSelectedId("");
    try {
      const response = await request<SearchResponse>(`/search?${new URLSearchParams({ query, limit: "8" })}`, { signal: controller.signal });
      if (!controller.signal.aborted && searchGeneration.current === generation) setSearchResponse({ ...response, results: response.results.filter((result) => isPublishedReaderAsset(result.asset)) });
    } catch (error) {
      if (!controller.signal.aborted && searchGeneration.current === generation) setSearchError(readerLoadFailure(error, "search"));
    } finally { if (!controller.signal.aborted && searchGeneration.current === generation) setSearchLoading(false); }
  }
  async function runAsk(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const query = readerAskText.trim();
    if (!query) return;
    askController.current?.abort();
    const controller = new AbortController(); askController.current = controller;
    const generation = ++askGeneration.current;
    setReaderAskError(""); setReaderAskResponse(null); setIsReaderAskRunning(true);
    try {
      const response = await request<ManagedQueryResponse>("/agent/query", { method: "POST", signal: controller.signal, body: JSON.stringify({ query, limit: 5, mode: "deterministic-retrieval", cache: false }) });
      if (!controller.signal.aborted && askGeneration.current === generation) setReaderAskResponse(response);
    } catch (error) {
      if (!controller.signal.aborted && askGeneration.current === generation) setReaderAskError(/^401\b/.test(error instanceof Error ? error.message : String(error)) ? readerLoadFailure(error, "page") : "Could not answer this question. Check your connection and try again.");
    } finally { if (!controller.signal.aborted && askGeneration.current === generation) setIsReaderAskRunning(false); }
  }
  async function downloadAttachment(attachment: Attachment): Promise<void> {
    const stableId = assetDetail?.asset.stableId;
    if (!stableId) return;
    setAttachmentRequest((current) => ({ ...current, error: "" }));
    try {
      const response = await requestBinary(`/assets/${encodeURIComponent(stableId)}/attachments/${encodeURIComponent(attachment.id)}/download`);
      const blob = await response.blob();
      if (selectedStableIdRef.current !== stableId) return;
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = attachment.filename; link.click(); URL.revokeObjectURL(url);
    } catch (error) {
      if (selectedStableIdRef.current === stableId) setAttachmentRequest((current) => ({ ...current, error: readerLoadFailure(error, "page") }));
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
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", stop);
  }
  function resizeNavWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>): void {
    const nextWidth = readerNavWidthForKey(event.key, navWidth);
    if (nextWidth === null) return;
    event.preventDefault(); setIsNavCollapsed(false); setNavWidth(nextWidth);
  }
  function renderNavIcon(asset: AssetRecord): ReactNode {
    const icons: Record<string, React.ElementType> = { book: BookOpen, checklist: ClipboardText, export: Package, guide: BookOpen, policy: ClipboardText, privacy: GearSix, search: MagnifyingGlass, system: GearSix };
    const key = readAssetMetadataString(asset, "readerIcon") ?? asset.type;
    const Icon = icons[key] ?? BookOpen;
    return <Icon aria-hidden="true" />;
  }
  function renderNavNode(node: ReaderNavNode, depth = 0): ReactNode {
    const hasChildren = node.children.length > 0;
    const active = node.asset.stableId === selectedStableId;
    const selectedBranch = readerNodeContainsStableId(node, selectedStableId);
    const branchKey = `reader:${node.asset.stableId}`;
    const expanded = hasChildren ? expandedNavSections[branchKey] ?? selectedBranch : false;
    return <div className="reader-tree-group" key={node.asset.id} data-depth={depth}><div className="reader-tree-row">
      <a href={readerPageHref(window.location, node.asset.stableId)} className={`nav-link reader-nav-node ${selectedBranch ? "is-active-ancestor" : ""} ${active ? "active" : ""}`} data-depth={depth} aria-current={active ? "page" : undefined} onClick={(event) => openPageLink(event, node.asset.stableId)}>
        <span className="reader-nav-icon">{renderNavIcon(node.asset)}</span><span className="nav-text">{readerNavLabel(node.asset)}</span>
      </a>
      {hasChildren ? <button type="button" className="reader-tree-toggle" aria-label={`${expanded ? "Collapse" : "Expand"} ${readerNavLabel(node.asset)} pages`} aria-expanded={expanded} onClick={() => setExpandedNavSections((current) => ({ ...current, [branchKey]: !expanded }))}><span className="nav-chevron" aria-hidden="true" /></button> : null}
    </div>{hasChildren && expanded ? <div className="nav-branch">{node.children.map((child) => renderNavNode(child, depth + 1))}</div> : null}</div>;
  }
  function navigationContent(): ReactNode {
    return <><a className={`reader-overview-link ${!selectedStableId ? "active" : ""}`} href={readerPageHref(window.location, "")} aria-current={!selectedStableId ? "page" : undefined} onClick={(event) => openPageLink(event, "")}><BookOpen aria-hidden="true" /><span>Overview</span></a>
      <div className="nav-tree" aria-busy={collectionState === "loading"}>{navTree.length ? navTree.map((node) => renderNavNode(node)) : collectionState === "loading" ? <p role="status">Loading pages…</p> : collectionState === "error" ? <p>Pages could not load. Use Retry pages to try again.</p> : <p>No published sources are available to your account.</p>}</div></>;
  }
  const infoItems = pageInfoItems();
  return <div className={`app-shell reader-shell ${isNavCollapsed ? "nav-collapsed" : ""} ${accountSettings ? "reader-shell--account" : ""}`} style={shellStyle}>
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
    <header className="topbar">
      <a className="brand" aria-label={`${branding.displayName} pages`} href={readerPageHref(window.location, "")} onClick={(event) => openPageLink(event, "")}><Brand branding={branding} /></a>
      <div className="topbar-main reader-topbar-main">
        {!accountSettings ? <><Button className="reader-mobile-nav-trigger" size="icon" variant="ghost" aria-label="Open pages" onClick={() => { loadEvidence(); setMobileNavOpen(true); }}><List aria-hidden="true" /></Button>
          <Button id="reader-search-trigger" className="reader-topbar-search" variant="default" aria-label="Search pages" onClick={() => openDialog("search")}><MagnifyingGlass aria-hidden="true" /><span>Search pages</span><span className="kbd reader-search-kbd">{shortcut}</span></Button></> : <div className="reader-topbar-spacer" />}
        <div className="topbar-actions">{!accountSettings ? <Button id="reader-ask-trigger" size="sm" variant="ghost" className="reader-ask-shortcut" onClick={() => openDialog("ask")}>Ask</Button> : null}
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="identity-trigger" aria-label={`Account menu for ${displayIdentity}`}><span className="avatar">{initialsFor(displayIdentity)}</span><span className="identity-name">{displayIdentity}</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="identity-menu"><DropdownMenuLabel><span className="identity-menu-header"><span className="identity-menu-label">Signed in</span><span className="identity-menu-title"><span className="identity-menu-value">{displayIdentity}</span><Badge variant="neutral">{principal.role}</Badge></span><span className="identity-menu-email">{principal.email ?? "No email available"}</span></span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onSelect={() => onNavigate("account-settings")}>Settings</DropdownMenuItem>{canUseAdministration ? <DropdownMenuItem onSelect={() => onNavigate("admin")}>Admin</DropdownMenuItem> : null}</DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => void onLogout()}>Sign out</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
    {!accountSettings ? <aside className="side-nav tree-nav reader-library" aria-label="Published material list">
      <div className="nav-chrome"><Button size="icon" variant="ghost" className="nav-collapse-button" aria-label={isNavCollapsed ? "Expand Pages" : "Collapse Pages"} aria-pressed={isNavCollapsed} onClick={() => setIsNavCollapsed((current) => !current)}><List aria-hidden="true" /></Button><span className="nav-chrome-label">Pages<span className="nav-chrome-count">({publishedAssets.length})</span></span></div>
      {isNavCollapsed ? <div className="reader-collapsed-tree"><a className="reader-collapsed-node" href={readerPageHref(window.location, "")} aria-label="Overview" onClick={(event) => openPageLink(event, "")}><BookOpen aria-hidden="true" /></a>{navTree.map((node) => <a className="reader-collapsed-node" href={readerPageHref(window.location, node.asset.stableId)} aria-label={readerNavLabel(node.asset)} key={node.asset.stableId} aria-current={node.asset.stableId === selectedStableId ? "page" : undefined} onClick={(event) => openPageLink(event, node.asset.stableId)}>{renderNavIcon(node.asset)}</a>)}</div>
        : <div className="reader-navigation-scroll">{navigationContent()}<button className="nav-resizer" aria-label="Resize page navigation" aria-orientation="vertical" aria-valuemin={navWidthMin} aria-valuemax={navWidthMax} aria-valuenow={navWidth} aria-valuetext={`${navWidth} pixels`} role="separator" onPointerDown={startNavResize} onKeyDown={resizeNavWithKeyboard} /></div>}
    </aside> : null}
    <main className={`reader-main ${accountSettings ? "reader-main--account" : ""}`} id="main" tabIndex={-1}>
      {accountSettings ? <section className="account-settings-page" aria-labelledby="account-settings-title"><a className="reader-return-link" href={readerPageHref(window.location, selectedStableId)} onClick={(event) => openPageLink(event, selectedStableId)}>Back to pages</a><header className="account-settings-header"><p className="eyebrow">Account</p><h1 id="account-settings-title">Settings</h1><p>Your signed-in account and role.</p></header><dl className="account-settings-grid"><div><dt>Name</dt><dd>{displayIdentity}</dd></div><div><dt>Email</dt><dd>{principal.email ?? "Not available"}</dd></div><div><dt>Role</dt><dd>{principal.role}</dd></div></dl><details className="reader-account-access"><summary>Session access details</summary><dl className="account-settings-grid"><div><dt>Principal</dt><dd>{principal.principalType}</dd></div><div><dt>Groups</dt><dd>{formatList(principal.groupIds)}</dd></div><div><dt>Scopes</dt><dd>{formatList(principal.scopes)}</dd></div></dl></details>{evidenceComponents ? <evidenceComponents.LocalDevicesPanel request={request} /> : <section className="local-devices-panel" aria-labelledby="local-devices-title"><h2 id="local-devices-title">Local devices</h2><p role={evidenceLoadError ? "alert" : "status"}>{evidenceLoadError ? "Local device controls could not load. Try again to manage your devices." : "Loading local devices…"}</p>{evidenceLoadError ? <><Button onClick={loadEvidence}>Retry local devices</Button><Button variant="ghost" onClick={() => window.location.reload()}>Reload reader</Button></> : null}</section>}<div className="account-settings-actions">{canUseAdministration ? <Button onClick={() => onNavigate("admin")}>Admin</Button> : null}<Button variant="ghost" onClick={() => void onLogout()}>Sign out</Button></div></section>
        : <>
          {collectionError ? <Alert variant="destructive" className="reader-alert"><AlertTitle>Pages could not load</AlertTitle><AlertDescription>{collectionError}</AlertDescription><Button size="sm" onClick={() => setCollectionRetry((current) => current + 1)}>Retry pages</Button></Alert> : null}
          {!selectedStableId ? collectionState === "loading" ? <div className="reader-empty-state reader-state" role="status"><h1 id="reader-page-title" tabIndex={-1}>Loading pages…</h1><p>Finding the published sources available to your account.</p></div>
            : collectionState === "loaded" && !publishedAssets.length ? <div className="reader-empty-state reader-state"><h1 id="reader-page-title" tabIndex={-1}>No published pages yet</h1><p>Ask an administrator to check your access or publish a page.</p><Button onClick={() => setCollectionRetry((current) => current + 1)}>Retry pages</Button></div>
              : evidenceComponents ? <evidenceComponents.ReaderOverview nodes={navTree} onOpenPage={openPageLink} onSearch={() => openDialog("search")} /> : <section className="reader-overview reader-state"><h1 id="reader-page-title" tabIndex={-1}>{evidenceLoadError ? "Overview could not load" : "Loading overview…"}</h1><p role={evidenceLoadError ? "alert" : "status"}>{evidenceLoadError ? "Try again or browse published sources in Pages." : "Opening the source overview."}</p>{evidenceLoadError ? <><Button onClick={loadEvidence}>Retry overview</Button><Button variant="ghost" onClick={() => window.location.reload()}>Reload reader</Button></> : null}</section>
            : <div className="reader-layout reader-layout--content"><article className="reader-article" id="reader-article">
              {assetDetail ? <>
                {searchReturn && searchResponse ? <Button variant="ghost" size="sm" className="reader-search-return" onClick={() => openDialog("search")}>Back to search results</Button> : null}
                <nav className="reader-breadcrumb" aria-label="Breadcrumb"><a href={readerPageHref(window.location, "")} onClick={(event) => openPageLink(event, "")}>Overview</a>{breadcrumbAssets(selectedStableId).map((asset) => <span key={asset.stableId}><span aria-hidden="true">/</span>{asset.stableId === selectedStableId ? <span aria-current="page">{readerNavLabel(asset)}</span> : <a href={readerPageHref(window.location, asset.stableId)} onClick={(event) => openPageLink(event, asset.stableId)}>{readerNavLabel(asset)}</a>}</span>)}</nav>
                <header className="reader-article-header"><div><p className="eyebrow">{formatAssetTypeLabel(assetDetail.asset.type)}</p><h1 id="reader-page-title" tabIndex={-1}>{assetDetail.asset.title}</h1>{assetDetail.asset.summary ? <p>{assetDetail.asset.summary}</p> : null}</div></header>
                <div className="reader-trust-line reader-page-footer"><span className="reader-publication-label">Published</span><dl>{infoItems.map((item) => <div key={item.key}><dt>{item.term}</dt><dd>{item.description}</dd></div>)}</dl><button id="reader-source-trigger" className="reader-source-trigger" onClick={() => openDialog("details")}>Source details</button></div>
                {sourceOptions.length > 1 ? <div className="reader-source-choice"><Label htmlFor="reader-readable-source">Readable source</Label><NativeSelect id="reader-readable-source" value={readableSourceId} onChange={(event) => setSelectedSource({ stableId: selectedStableId, sourceId: event.target.value })}>{sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}</NativeSelect></div> : null}
                <div className="reader-document"><div className="reader-document-body" data-source-id={readableSourceId}>
                  {instruction ? evidenceComponents ? <evidenceComponents.ReaderInstruction instruction={instruction} title={assetDetail.asset.title} /> : <><p role="status">{evidenceLoadError ? "Instruction fields could not load. The source body remains available." : "Loading instruction fields…"}</p><pre className="reader-readable-source">{instruction.body}</pre>{evidenceLoadError ? <><Button onClick={loadEvidence}>Retry instruction fields</Button><Button variant="ghost" onClick={() => window.location.reload()}>Reload reader</Button></> : null}</> : humanDocument ? humanDocument.format === "markdown" ? <MarkdownDocument body={humanDocument.body} title={assetDetail.asset.title} /> : <><p className="reader-format-note">{humanDocument.format === "html" ? "HTML source is displayed as readable text." : "Plain-text source."}</p><pre className="reader-readable-source">{humanDocument.body}</pre></>
                    : <div className="reader-empty-state"><h2>No readable page yet</h2><p>This source has no human document or instruction content available.</p></div>}
                </div></div>
                {attachmentsLoading || attachmentsError || attachments.length ? <div className="reader-attachments"><AttachmentsPanel attachments={attachments} canManage={false} loading={attachmentsLoading} uploading={false} maxBytes={attachmentMaxBytes} error={attachmentsError} onUpload={() => undefined} onDownload={(attachment) => void downloadAttachment(attachment)} onDelete={() => undefined} />{attachmentsError ? <Button size="sm" variant="default" onClick={() => setAttachmentRetry((current) => current + 1)}>Retry attachments</Button> : null}</div> : null}
              </> : pageLoading ? <div className="reader-empty-state reader-state" role="status"><h1 id="reader-page-title" tabIndex={-1}>Loading page…</h1><p>Opening the published source.</p></div>
                : <div className="reader-empty-state reader-state" role="alert"><h1 id="reader-page-title" tabIndex={-1}>{pageUnavailable ? "Page unavailable" : "Page could not load"}</h1><p>{pageError || "This page may be unpublished, removed, or outside your access."}</p><Button onClick={() => setPageRetry((current) => current + 1)}>Retry page</Button><a href={readerPageHref(window.location, "")} onClick={(event) => openPageLink(event, "")}>Browse available pages</a></div>}
            </article>{assetDetail ? <aside className="reader-contents-rail"><details className="reader-section-nav reader-outline" open={contentsOpen} onToggle={(event) => setContentsOpen(event.currentTarget.open)}><summary>On this page</summary><nav aria-label="Page sections">{sectionHeadings.length ? sectionHeadings.map((heading) => <button className={heading.level === 3 ? "is-nested" : ""} key={heading.id} onClick={() => { const target = document.getElementById(heading.id); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "start" }); }}>{heading.text}</button>) : <p>No sections in this source.</p>}</nav></details><Button variant="ghost" className="reader-contents-ask" onClick={() => openDialog("ask")}>Ask the knowledge base</Button></aside> : null}</div>}
        </>}
    </main>
    {!accountSettings && (dialog || mobileNavOpen) && !evidenceComponents ? <div className="reader-panel-state" role="status">{evidenceLoading ? "Loading reader tools…" : evidenceLoadError ? <Alert variant="destructive"><AlertTitle>Reader tools could not load</AlertTitle><AlertDescription>Try again to open search, Ask or navigation.</AlertDescription><Button onClick={loadEvidence}>Retry tools</Button><Button variant="ghost" onClick={() => window.location.reload()}>Reload reader</Button><Button variant="ghost" onClick={() => { setDialog(null); setMobileNavOpen(false); }}>Close</Button></Alert> : null}</div> : null}
    {!accountSettings && evidenceComponents ? <>
      <evidenceComponents.ReaderPagesDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen} onCloseFocus={() => {
        if (navigationDismissal.current) { navigationDismissal.current = false; if (pendingPageFocus.current === null) focusPageTitle(); }
        else if (pendingPageFocus.current === null && dialogRef.current === null) document.querySelector<HTMLButtonElement>(".reader-mobile-nav-trigger")?.focus();
      }}>{navigationContent()}</evidenceComponents.ReaderPagesDrawer>
      <evidenceComponents.ReaderSearchDialog open={dialog === "search"} onOpenChange={(open) => changeDialog("search", open)} onCloseFocus={() => closeDialogFocus("search")} input={searchQuery} onInputChange={setSearchQuery} submittedQuery={submittedSearchQuery} response={searchResponse} loading={searchLoading} error={searchError} selectedId={searchSelectedId} onSelectResult={setSearchSelectedId} onSearch={(event) => void runSearch(event)} onOpenPage={openSearchPage} onAsk={() => { if (!readerAskText) setReaderAskText(searchQuery); openDialog("ask"); }} breadcrumbFor={(stableId) => breadcrumbAssets(stableId).map(readerNavLabel).join(" / ")} />
      <evidenceComponents.ReaderAskDialog open={dialog === "ask"} onOpenChange={(open) => changeDialog("ask", open)} onCloseFocus={() => closeDialogFocus("ask")} input={readerAskText} onInputChange={setReaderAskText} onAsk={(event) => void runAsk(event)} response={readerAskResponse} loading={isReaderAskRunning} error={readerAskError} detail={assetDetail} onOpenPage={openPageLink} />
      <evidenceComponents.ReaderSourceDetails open={dialog === "details"} onOpenChange={(open) => changeDialog("details", open)} onCloseFocus={() => closeDialogFocus("details")} detail={assetDetail} items={infoItems} />
    </> : null}
  </div>;
}
