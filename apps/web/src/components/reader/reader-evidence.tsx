import type { AssetDetail, Citation, ManagedQueryResponse, SearchResponse, SearchResult } from "@forgetbase/schema";
import { useRef, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet.js";
import { readerPageHref } from "../../lib/reader-navigation.js";
import { groupReaderSearchResults } from "../../lib/reader-search-results.js";
import { formatAssetTypeLabel, formatReaderSnippet, renderReaderAnswer } from "../../lib/reader-ui.js";
export { ReaderInstruction, readerInstructionHeadings } from "./reader-instruction.js";
export { LocalDevicesPanel } from "../domain/local-devices-panel.js";
export { ReaderOverview } from "./reader-overview.js";

type PageLinkHandler = (event: MouseEvent<HTMLAnchorElement>, stableId: string) => void;
type DialogControls = { open: boolean; onOpenChange: (open: boolean) => void; onCloseFocus: () => void };
export type ReaderInfoItem = { key: string; term: string; description: ReactNode };

export function ReaderPagesDrawer({ open, onOpenChange, onCloseFocus, children }: DialogControls & { children: ReactNode }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="left" className="reader-navigation-sheet" onCloseAutoFocus={(event) => { event.preventDefault(); onCloseFocus(); }}>
    <SheetTitle>Pages</SheetTitle><SheetDescription>Browse published sources.</SheetDescription>
    <nav className="reader-mobile-tree" aria-label="Published material list">{children}</nav>
  </SheetContent></Sheet>;
}

function sourceKindLabel(kind: Citation["sourceKind"]): string {
  return kind === "human-document" ? "Page text" : kind === "agent-instruction" ? "Agent instruction" : "Summary";
}

function citationVersionLabel(citation: Citation, asset: AssetDetail["asset"] | null | undefined): string {
  if (!citation.versionId) return "Version not supplied";
  const publishedId = asset?.id === citation.assetId && asset.stableId === citation.stableId ? asset.publishedVersionId : null;
  if (!publishedId) return "Version cannot be compared";
  return publishedId === citation.versionId ? "Current published version" : "Different from current published version";
}

function CitationIdentity({ citation }: { citation: Citation }) {
  return <details className="reader-evidence-identity"><summary>Source identity</summary><dl>
    <div><dt>Stable ID</dt><dd>{citation.stableId}</dd></div>
    <div><dt>Asset ID</dt><dd>{citation.assetId}</dd></div>
    <div><dt>Passage ID</dt><dd>{citation.chunkId}</dd></div>
    <div><dt>Source ID</dt><dd>{citation.sourceId ?? "Not supplied"}</dd></div>
    <div><dt>Source kind</dt><dd>{citation.sourceKind}</dd></div>
    <div><dt>Version ID</dt><dd>{citation.versionId ?? "Not supplied"}</dd></div>
    <div><dt>Source reference</dt><dd>{citation.sourceRef ?? "Not supplied"}</dd></div>
    <div><dt>Passage index</dt><dd>{citation.chunkIndex}</dd></div>
  </dl></details>;
}

export function ReaderSourceDetails({ detail, items, open, onOpenChange, onCloseFocus }: DialogControls & { detail: AssetDetail | null; items: ReaderInfoItem[] }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="reader-evidence-sheet reader-source-sheet" onCloseAutoFocus={(event) => { event.preventDefault(); onCloseFocus(); }}>
    <SheetHeader><SheetTitle>Source details</SheetTitle><SheetDescription>{detail?.asset.title ?? "Published source information"}</SheetDescription></SheetHeader>
    {detail ? <div className="reader-evidence-scroll">
      <section className="reader-source-fields" aria-label="Page details"><dl>{items.map((item) => <div key={item.key}><dt>{item.term}</dt><dd>{item.description}</dd></div>)}</dl></section>
      <section className="reader-source-metadata" aria-label="Source metadata"><h3>Source metadata</h3><dl>
        <div><dt>Audience label</dt><dd>{detail.asset.audience.join(", ") || "Not supplied"}</dd></div>
        <div><dt>Classification</dt><dd>{detail.asset.sensitivity || "Not supplied"}</dd></div>
      </dl><p>Audience and classification describe this source. They do not establish your permissions.</p></section>
      <details className="reader-evidence-identity"><summary>Source identity</summary><dl>
        <div><dt>Stable ID</dt><dd>{detail.asset.stableId}</dd></div><div><dt>Asset ID</dt><dd>{detail.asset.id}</dd></div>
        <div><dt>Published version ID</dt><dd>{detail.asset.publishedVersionId ?? "Not supplied"}</dd></div>
        <div><dt>Source kind</dt><dd>{detail.asset.sourceKind ?? "Not supplied"}</dd></div>
        <div><dt>Source reference</dt><dd>{detail.asset.sourceRef ?? "Not supplied"}</dd></div>
        <div><dt>Human source IDs</dt><dd>{detail.humanDocuments.map((source) => source.id).join(", ") || "None supplied"}</dd></div>
        <div><dt>Instruction source IDs</dt><dd>{detail.instructionObjects.map((source) => source.id).join(", ") || "None supplied"}</dd></div>
      </dl></details>
    </div> : null}
  </SheetContent></Sheet>;
}

type ReaderSearchProps = DialogControls & {
  input: string; submittedQuery: string; response: SearchResponse | null; loading: boolean; error: string;
  selectedId: string; onSelectResult: (stableId: string) => void; onInputChange: (value: string) => void;
  onSearch: (event?: FormEvent) => void; onOpenPage: PageLinkHandler; onAsk: () => void;
  breadcrumbFor: (stableId: string) => string;
};

export function ReaderSearchDialog({ open, onOpenChange, onCloseFocus, input, onInputChange, submittedQuery, response, loading, error, selectedId, onSelectResult, onSearch, onOpenPage, onAsk, breadcrumbFor }: ReaderSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const grouped = groupReaderSearchResults(response?.results ?? []).slice(0, 5);
  function moveResult(event: KeyboardEvent, direction: number): void {
    const links = Array.from(resultsRef.current?.querySelectorAll<HTMLAnchorElement>("a.reader-result-open") ?? []);
    if (!links.length) return;
    event.preventDefault();
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    links[index < 0 ? direction > 0 ? 0 : links.length - 1 : (index + direction + links.length) % links.length]?.focus();
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="reader-search-dialog" onOpenAutoFocus={(event) => {
    event.preventDefault(); inputRef.current?.focus(); if (resultsRef.current) resultsRef.current.scrollTop = savedScroll.current;
  }} onCloseAutoFocus={(event) => { event.preventDefault(); onCloseFocus(); }}>
    <DialogTitle>Search pages</DialogTitle><DialogDescription>Find passages in the published sources available to your account.</DialogDescription>
    <form className="reader-search-form" onSubmit={onSearch}>
      <Label htmlFor="reader-search-input" className="sr-only">Search pages</Label>
      <Input ref={inputRef} id="reader-search-input" value={input} onChange={(event) => onInputChange(event.target.value)} placeholder="Search page content" onKeyDown={(event) => { if (event.key === "ArrowDown") moveResult(event, 1); }} />
      <Button type="submit" disabled={!input.trim()}>Search</Button>
    </form>
    <p className="reader-search-help">Press Enter to search content. Arrow keys move through results.</p>
    <div className="reader-search-results" id="reader-search-results" ref={resultsRef} aria-label="Search results" aria-busy={loading} onScroll={(event) => { savedScroll.current = event.currentTarget.scrollTop; }} onKeyDown={(event) => {
      if ((event.target as HTMLElement).closest(".reader-result-open")) { if (event.key === "ArrowDown") moveResult(event, 1); if (event.key === "ArrowUp") moveResult(event, -1); }
    }}>
      {loading ? <p role="status" aria-live="polite">Searching accessible pages…</p> : error ? <Alert variant="destructive"><AlertTitle>Search could not finish</AlertTitle><AlertDescription>{error}</AlertDescription><Button onClick={() => onSearch()}>Retry search</Button></Alert>
        : response ? <><h2>Results for “{submittedQuery}”</h2>{grouped.length ? <div className="reader-search-list">{grouped.map(({ result, matchCount }) => {
          const passages: SearchResult[] = response.results.filter((passage) => passage.asset.stableId === result.asset.stableId);
          return <article className={`reader-search-result ${selectedId === result.asset.stableId ? "is-selected" : ""}`} key={result.asset.stableId} data-stable-id={result.asset.stableId}>
            <p className="reader-search-meta">{formatAssetTypeLabel(result.asset.type)} · {breadcrumbFor(result.asset.stableId) || result.asset.title}</p>
            <h3>{result.asset.title}</h3><p>{formatReaderSnippet(result.citation.snippet || result.content, 220)}</p>
            <div className="reader-result-actions"><a className="reader-result-open" href={readerPageHref(window.location, result.asset.stableId)} onFocus={() => onSelectResult(result.asset.stableId)} onClick={(event) => { onSelectResult(result.asset.stableId); onOpenPage(event, result.asset.stableId); }}>Open page</a><span>{matchCount} returned {matchCount === 1 ? "match" : "matches"}</span></div>
            <details className="reader-matched-passages"><summary>Matched passages ({matchCount})</summary>{passages.map((passage, index) => <section className="reader-matched-passage" key={`${passage.chunkId}:${index}`} data-chunk-id={passage.chunkId} data-source-id={passage.citation.sourceId ?? ""} data-version-id={passage.citation.versionId ?? ""}>
              <p className="reader-evidence-meta">{sourceKindLabel(passage.citation.sourceKind)} · {citationVersionLabel(passage.citation, passage.asset)}</p>
              <p className="reader-passage-text">{passage.citation.snippet}</p><CitationIdentity citation={passage.citation} />
            </section>)}</details>
          </article>;
        })}</div> : <div className="reader-empty-state" role="status"><h3>No readable results</h3><p>No sources available to your account matched this search.</p></div>}</>
          : <p className="reader-search-prompt">Enter a query and press Search to find page content and sources.</p>}
    </div>
    <div className="reader-search-footer"><span>Search returns a bounded set of passages.</span><Button variant="ghost" onClick={onAsk}>Ask a question</Button></div>
  </DialogContent></Dialog>;
}

type ReaderAskProps = DialogControls & {
  input: string; onInputChange: (value: string) => void; onAsk: (event?: FormEvent) => void;
  response: ManagedQueryResponse | null; loading: boolean; error: string; detail: AssetDetail | null; onOpenPage: PageLinkHandler;
};

export function ReaderAskDialog({ open, onOpenChange, onCloseFocus, input, onInputChange, onAsk, response, loading, error, detail, onOpenPage }: ReaderAskProps) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="reader-evidence-sheet reader-ask-sheet" onCloseAutoFocus={(event) => { event.preventDefault(); onCloseFocus(); }}>
    <SheetHeader><SheetTitle className="reader-ask-title">Ask the knowledge base</SheetTitle><SheetDescription>Ask one question and inspect the sources available to your account.</SheetDescription></SheetHeader>
    <form className="reader-ask-form" onSubmit={onAsk}><Label htmlFor="reader-ask-input">Ask a question</Label>
      <Input id="reader-ask-input" value={input} onChange={(event) => onInputChange(event.target.value)} placeholder="Ask about these sources" />
      <Button type="submit" disabled={!input.trim()} aria-busy={loading}>Ask</Button>
    </form>
    <div className="reader-evidence-scroll reader-ask-panel">
      {loading ? <p role="status" aria-live="polite">Finding an answer from accessible sources…</p> : error ? <Alert variant="destructive"><AlertTitle>Could not answer this question</AlertTitle><AlertDescription>{error}</AlertDescription><Button onClick={() => onAsk()}>Retry question</Button></Alert>
        : response ? <div className="reader-ask-answer" aria-live="polite">
          <div className="reader-ask-submitted"><h3>Question</h3><p>{response.query}</p><p className="reader-evidence-meta">Response mode: {response.mode === "deterministic-retrieval" ? "Deterministic retrieval" : "Provider routed"}</p></div>
          {response.warnings.length ? <Alert><AlertTitle>Response notes</AlertTitle><AlertDescription><ul>{response.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></AlertDescription></Alert> : null}
          <div><h3>Answer</h3><Badge variant={!response.citations.length || response.checks.deniedCount ? "warning" : "neutral"}>{!response.citations.length ? "No matching sources" : response.checks.deniedCount ? "Limited results" : "Sources returned"}</Badge>
            {response.citations.length ? renderReaderAnswer(response.answer) : <div className="reader-no-access-state"><strong>No accessible answer was found.</strong><p>Try another question or ask an administrator to check the content and your access.</p></div>}
            {response.checks.deniedCount ? <p className="reader-ask-note">Some matching sources are not available to your account.</p> : null}
          </div>
          <section className="reader-citations" aria-label="Sources"><h3>Sources</h3>{response.citations.length ? response.citations.slice(0, 5).map((citation, index) => <details className="reader-citation" key={`${citation.chunkId}:${index}`} open={index === 0} data-chunk-id={citation.chunkId} data-version-id={citation.versionId ?? ""}>
            <summary><strong>{citation.title}</strong><span>Source {index + 1}</span></summary><p className="reader-evidence-meta">{sourceKindLabel(citation.sourceKind)} · {citationVersionLabel(citation, response.results.find(({ asset }) => asset.id === citation.assetId && asset.stableId === citation.stableId)?.asset ?? detail?.asset)}</p><p className="reader-passage-text">{citation.snippet}</p>
            <a href={readerPageHref(window.location, citation.stableId)} onClick={(event) => onOpenPage(event, citation.stableId)}>Open source page</a>
            <p className="reader-ask-note">This link opens the current published page.</p><CitationIdentity citation={citation} />
          </details>) : <p>No accessible sources matched this question.</p>}</section>
        </div> : <p className="reader-ask-empty">Enter a question to retrieve an answer with source citations.</p>}
    </div>
  </SheetContent></Sheet>;
}
