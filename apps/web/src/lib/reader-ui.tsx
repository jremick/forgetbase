import type { AssetRecord } from "@forgetbase/schema";
import type { ReactNode } from "react";
import { formatReviewDue, isPublicReaderEligible } from "./asset-ui.js";

export type ReaderNavNode = {
  asset: AssetRecord;
  children: ReaderNavNode[];
};

export type ReaderSectionHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

const assetTypeLabels: Record<string, string> = {
  "agent-instruction": "Agent Guide",
  "eval-case": "Check",
  guardrail: "Privacy Guide",
  guideline: "Guideline",
  "human-document": "Document",
  playbook: "Guide",
  policy: "Policy",
  reference: "Reference",
  skill: "Skill",
  sop: "Checklist",
  "telemetry-policy": "Privacy Policy",
  template: "Template",
  "tool-instruction": "Tool Guide"
};

export function formatAssetTypeLabel(type: string): string {
  return assetTypeLabels[type] ?? type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReaderLifecycle(value: string): string {
  return ({ active: "Published", archived: "Archived", deprecated: "Deprecated", draft: "Draft", restricted: "Restricted" } as Record<string, string>)[value]
    ?? formatAssetTypeLabel(value);
}

export function formatReaderStatus(value: string): string {
  return ({ approved: "Reviewed", draft: "Draft", rejected: "Needs changes", reviewing: "In review" } as Record<string, string>)[value]
    ?? formatAssetTypeLabel(value);
}

export function formatReaderAccess(asset: AssetRecord): string {
  return isPublicReaderEligible(asset) ? "Open to readers" : "Signed-in readers";
}

export function formatReaderDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(parsed))
    : value;
}

export function formatReaderMaintainer(ownerId: string): string {
  const cleaned = ownerId.replace(/^user[_-]/, "").replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : ownerId;
}

export function formatReaderReview(reviewDueAt: string): string {
  const relative = formatReviewDue(reviewDueAt);
  return relative === "not scheduled" ? "Not scheduled" : relative;
}

export function readerAssetMatches(asset: AssetRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery || [asset.title, asset.summary ?? "", formatAssetTypeLabel(asset.type)]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function normalizeReaderQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function sanitizeMarkdownHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^[\\/]{2}/.test(trimmed)) return null;

  const normalizedForScheme = trimmed.replace(/[\u0000-\u0020\u007f\u00a0]+/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalizedForScheme)?.[1]?.toLowerCase();

  if (scheme && !new Set(["http", "https", "mailto"]).has(scheme)) return null;
  return trimmed;
}

export function cleanReaderAnswerText(value: string): string {
  return value.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

export function formatReaderSnippet(value: string, maxLength: number): string {
  const cleaned = cleanReaderAnswerText(value).replace(/\s+/g, " ");
  if (cleaned.length <= maxLength) return cleaned;
  const bounded = cleaned.slice(0, maxLength);
  const trimmed = bounded.slice(0, Math.max(0, bounded.lastIndexOf(" "))).trim() || bounded.trim();
  return `${trimmed}…`;
}

export function renderReaderAnswer(answer: string): ReactNode {
  const lines = answer.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const intro = lines.find((line) => line.startsWith("Answer from the pages I can access"));
  const findings = lines.filter((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line));
  const fallbackParagraphs = lines.filter((line) => line !== intro && !findings.includes(line));

  return <div className="reader-answer-copy">
    {intro ? <p>{intro}</p> : null}
    {findings.length ? <ol>{findings.slice(0, 3).map((finding, index) => <li key={index}>{cleanReaderAnswerText(finding)}</li>)}</ol> :
      fallbackParagraphs.map((paragraph, index) => <p key={index}>{cleanReaderAnswerText(paragraph)}</p>)}
  </div>;
}

export function readAssetMetadataString(asset: AssetRecord, key: string): string | null {
  const value = asset.metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readAssetMetadataStringArray(asset: AssetRecord, key: string): string[] {
  const value = asset.metadata[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())) : [];
}

function readAssetMetadataNumber(asset: AssetRecord, key: string): number | null {
  const value = asset.metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readerNavLabel(asset: AssetRecord): string {
  return readAssetMetadataString(asset, "readerNavLabel") ?? asset.title;
}

function readerParentId(asset: AssetRecord): string | null {
  return readAssetMetadataString(asset, "readerParentId");
}

function readerNavOrder(asset: AssetRecord): number {
  return readAssetMetadataNumber(asset, "readerNavOrder") ?? Number.MAX_SAFE_INTEGER;
}

function sortReaderNodes(nodes: ReaderNavNode[]): ReaderNavNode[] {
  return nodes.sort((left, right) => readerNavOrder(left.asset) - readerNavOrder(right.asset) || left.asset.title.localeCompare(right.asset.title));
}

export function buildReaderNavTree(assets: AssetRecord[]): ReaderNavNode[] {
  const nodes = new Map<string, ReaderNavNode>(assets.map((asset) => [asset.stableId, { asset, children: [] }]));
  const roots: ReaderNavNode[] = [];

  nodes.forEach((node) => {
    const parent = readerParentId(node.asset);
    const parentNode = parent ? nodes.get(parent) : undefined;
    if (parentNode && parentNode !== node) parentNode.children.push(node);
    else roots.push(node);
  });
  nodes.forEach((node) => sortReaderNodes(node.children));
  return sortReaderNodes(roots);
}

export function readerNodeContainsStableId(node: ReaderNavNode, stableId: string | undefined): boolean {
  return Boolean(stableId && (node.asset.stableId === stableId || node.children.some((child) => readerNodeContainsStableId(child, stableId))));
}
