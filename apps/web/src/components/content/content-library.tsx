import { MarkdownDocument } from "../markdown/markdown-document.js";
import { useMemo, useRef, useState } from "react";
import type { AssetDetail, AssetRecord } from "@forgetbase/schema";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Plus, RefreshCw, Search, X } from "lucide-react";
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { formatAssetTypeLabel, formatReaderLifecycle, formatReaderStatus } from "../../lib/reader-ui.js";
import { isPublicReaderEligible, isAssetGovernanceDue, type LibraryViewFilter } from "../../lib/asset-ui.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Badge } from "./ui/badge.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.js";
import "./content.css";

interface ContentLibraryProps {
  assets: AssetRecord[];
  total: number;
  query: string;
  onQuery: (query: string) => void;
  view: LibraryViewFilter;
  onView: (view: LibraryViewFilter) => void;
  sensitivity: string;
  onSensitivity: (value: string) => void;
  onClear: () => void;
  canCreate: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  detail: AssetDetail | null;
  error: string;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function Status({ asset }: { asset: AssetRecord }) {
  return <span className="content-status"><Badge variant="secondary">{formatReaderLifecycle(asset.lifecycleState)}</Badge><Badge variant="outline">{formatReaderStatus(asset.status)}</Badge></span>;
}

export function ContentLibrary(props: ContentLibraryProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  // The parent guards responses by request epoch; also match the ID before rendering.
  const detail = props.detail?.asset.stableId === openedId ? props.detail : null;
  const columns = useMemo<ColumnDef<AssetRecord>[]>(() => [
    { accessorKey: "title", header: "Page", cell: ({ row }) => <div className="content-page-cell"><button type="button" className="content-page-link" onClick={(event) => { opener.current = event.currentTarget; setOpenedId(row.original.stableId); props.onSelect(row.original.stableId); }}>{row.original.title}</button><span className="content-muted">{formatAssetTypeLabel(row.original.type)}</span></div> },
    { id: "status", header: "Status", cell: ({ row }) => <Status asset={row.original} />, enableSorting: false },
    { id: "access", header: "Access", cell: ({ row }) => isPublicReaderEligible(row.original) ? "Public readers" : "Signed-in", enableSorting: false },
    { accessorKey: "ownerId", header: "Owner", cell: ({ getValue }) => String(getValue()).replace(/^user_/, "").replace(/_/g, " "), enableSorting: false },
    { accessorKey: "reviewDueAt", header: "Review due", cell: ({ row }) => <span className={isAssetGovernanceDue(row.original) ? "content-review-due" : undefined}>{dateLabel(row.original.reviewDueAt)}</span> },
    { accessorKey: "updatedAt", header: "Updated", cell: ({ row }) => dateLabel(row.original.updatedAt), enableSorting: false },
  ], [props.onSelect]);
  const table = useReactTable({ data: props.assets, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 10 } } });
  const count = props.assets.length;
  const page = table.getState().pagination.pageIndex;
  const filtered = Boolean(props.query.trim() || props.view !== "all" || props.sensitivity !== "all");
  const resetPage = () => table.setPageIndex(0);
  return <div className="fb-content">
    <header className="content-heading"><div><h1>Content</h1><span className="content-muted">{filtered ? `${count} of ${props.total}` : props.total} pages</span></div><div className="content-actions"><Button type="button" variant="outline" size="icon" aria-label="Refresh content" onClick={props.onRefresh}><RefreshCw aria-hidden="true" /></Button>{props.canCreate ? <Button type="button" onClick={props.onCreate}><Plus aria-hidden="true" />New page</Button> : null}</div></header>
    <div className="content-toolbar" role="search" aria-label="Content filters">
      <div className="content-search"><Search aria-hidden="true" size={16} /><Input id="library-query" type="search" value={props.query} onChange={(event) => { props.onQuery(event.target.value); resetPage(); }} placeholder="Search pages" aria-label="Search pages" /></div>
      <label className="content-filter"><span className="fb:sr-only">View</span><select id="library-view-filter" value={props.view} onChange={(event) => { props.onView(event.target.value as LibraryViewFilter); resetPage(); }}><option value="all">All statuses</option><option value="public-reader">Reader-ready</option><option value="needs-governance">Needs review</option><option value="approved-active">Published and reviewed</option></select></label>
      <label className="content-filter"><span className="fb:sr-only">Sensitivity</span><select id="library-sensitivity-filter" value={props.sensitivity} onChange={(event) => { props.onSensitivity(event.target.value); resetPage(); }}><option value="all">All sensitivities</option><option value="public-demo">Public demo</option><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></select></label>
      {filtered ? <Button type="button" variant="ghost" onClick={() => { props.onClear(); resetPage(); }}>Clear filters</Button> : null}
    </div>
    <div className="content-table"><Table><TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id} className={`content-column-${header.id}`} aria-sort={header.column.getCanSort() ? header.column.getIsSorted() === "asc" ? "ascending" : header.column.getIsSorted() === "desc" ? "descending" : "none" : undefined}>{header.column.getCanSort() ? <button type="button" className="content-sort" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? <ArrowUp size={14} aria-hidden="true" /> : header.column.getIsSorted() === "desc" ? <ArrowDown size={14} aria-hidden="true" /> : <ArrowUpDown size={14} aria-hidden="true" />}</button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{count ? table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className={`content-column-${cell.column.id}`}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>) : <TableRow><TableCell colSpan={columns.length}><div className="content-empty"><strong>No pages match this view</strong><p>{filtered ? "Try another search or clear the filters." : "Create a page to get started."}</p>{filtered ? <Button variant="outline" type="button" onClick={() => { props.onClear(); resetPage(); }}>Clear filters</Button> : null}</div></TableCell></TableRow>}</TableBody></Table></div>
    <footer className="content-pagination"><span aria-live="polite" className="content-muted">{count ? `Showing ${page * 10 + 1}–${Math.min((page + 1) * 10, count)} of ${count}` : "No pages"}</span><nav aria-label="Content pagination"><span className="content-muted">Page {count ? page + 1 : 0} of {table.getPageCount()}</span><Button variant="outline" size="sm" type="button" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft aria-hidden="true" />Previous</Button><Button variant="outline" size="sm" type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next<ChevronRight aria-hidden="true" /></Button></nav></footer>
    <Dialog.Root open={openedId !== null} onOpenChange={(open) => { if (!open) setOpenedId(null); }}><Dialog.Portal><Dialog.Overlay className="content-drawer-overlay" /><Dialog.Content className="fb-content content-drawer" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
      <Dialog.Title className="content-drawer-title">{detail?.asset.title ?? "Page details"}</Dialog.Title><Dialog.Description className="content-muted">{detail?.asset.summary || "Inspect this page, or open it to manage content, access and versions."}</Dialog.Description><Dialog.Close asChild><Button variant="ghost" size="icon" className="content-drawer-close" aria-label="Close page details"><X aria-hidden="true" /></Button></Dialog.Close>
      {detail ? <><Status asset={detail.asset} /><dl className="content-detail-meta"><dt>Access</dt><dd>{isPublicReaderEligible(detail.asset) ? "Public readers" : "Signed-in"}</dd><dt>Owner</dt><dd>{detail.asset.ownerId}</dd><dt>Review due</dt><dd>{dateLabel(detail.asset.reviewDueAt)}</dd></dl><Button type="button" variant="outline" onClick={() => { setOpenedId(null); props.onOpen(detail.asset.stableId); }}>Open page</Button><article className="reader-document"><div className="reader-document-body">{detail.humanDocuments[0]?.body ? <MarkdownDocument body={detail.humanDocuments[0].body} title={detail.asset.title} /> : <p>No human document.</p>}</div></article></> : <p role="status">{props.error ? "Unable to load this page. Close this panel and refresh to retry." : "Loading page…"}</p>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
