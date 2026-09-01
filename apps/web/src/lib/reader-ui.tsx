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

function normalizeHeadingText(value: string): string {
  return value.replace(/[*_`~]/g, "").trim();
}

function readerHeadingId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return `reader-section-${slug || index + 1}`;
}

export function extractReaderSectionHeadings(body: string, title: string): ReaderSectionHeading[] {
  const lines = body.split(/\r?\n/);
  const headings: ReaderSectionHeading[] = [];

  for (const line of lines) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const text = normalizeHeadingText(match[2] ?? "");
    if (!text || text.toLowerCase() === title.trim().toLowerCase() || match[1]?.length === 1) continue;
    headings.push({ id: readerHeadingId(text, headings.length), text, level: match[1]?.length === 3 ? 3 : 2 });
  }

  return headings;
}

function renderInlineMarkdown(value: string): ReactNode[] {
  const tokens = value.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, index) => {
    const code = /^`([^`]+)`$/.exec(token);
    if (code) return <code key={index}>{code[1]}</code>;
    const strong = /^\*\*([^*]+)\*\*$/.exec(token);
    if (strong) return <strong key={index}>{strong[1]}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      const href = sanitizeMarkdownHref(link[2] ?? "");
      return href
        ? <a key={index} href={href} target="_blank" rel="noreferrer">{link[1]}</a>
        : <span key={index}>{link[1]}</span>;
    }
    return token;
  });
}

export function sanitizeMarkdownHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^[\\/]{2}/.test(trimmed)) return null;

  const normalizedForScheme = trimmed.replace(/[\u0000-\u0020\u007f\u00a0]+/g, "");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalizedForScheme)?.[1]?.toLowerCase();

  if (scheme && !new Set(["http", "https", "mailto"]).has(scheme)) return null;
  return trimmed;
}

export function renderMarkdownDocument(body: string, title: string): ReactNode[] {
  const output: ReactNode[] = [];
  const paragraph: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(<p key={`p-${key++}`}>{renderInlineMarkdown(paragraph.join(" "))}</p>);
    paragraph.length = 0;
  };
  const flushList = () => {
    if (!list.length) return;
    output.push(<ul key={`ul-${key++}`}>{list.map((item, index) => <li key={index}>{renderInlineMarkdown(item)}</li>)}</ul>);
    list = [];
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const listItem = /^[-*]\s+(.+)$/.exec(line);

    if (!line) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const text = normalizeHeadingText(heading[2] ?? "");
      if (heading[1]?.length === 1 && text.toLowerCase() === title.trim().toLowerCase()) continue;
      const id = heading[1]?.length === 1 ? undefined : readerHeadingId(text, output.filter((node) => node !== null).length);
      output.push(heading[1]?.length === 1
        ? <h2 key={`h-${key++}`}>{renderInlineMarkdown(text)}</h2>
        : heading[1]?.length === 2
          ? <h2 id={id} key={`h-${key++}`}>{renderInlineMarkdown(text)}</h2>
          : <h3 id={id} key={`h-${key++}`}>{renderInlineMarkdown(text)}</h3>);
    } else if (listItem) {
      flushParagraph();
      list.push(listItem[1] ?? "");
    } else {
      flushList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  flushList();
  return output;
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
