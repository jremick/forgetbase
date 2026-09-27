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
  return [...markdownHeadings(parseMarkdownBlocks(body.split(/\r?\n/)), title).values()];
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

type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; level: number }
  | { type: "code"; text: string; language: string }
  | { type: "list"; ordered: boolean; start: number; items: MarkdownBlock[][] };

function markdownListMarker(line: string) {
  const match = /^( *)([-+*]|\d+[.)])(\s+)(.*)$/.exec(line);
  return match ? {
    indent: match[1]!.length,
    contentIndent: match[1]!.length + match[2]!.length + match[3]!.length,
    ordered: /^\d/.test(match[2]!),
    start: Number.parseInt(match[2]!, 10) || 1,
    text: match[4]!
  } : null;
}

/** This deliberately small Markdown subset always renders text through React escaping. */
function parseMarkdownBlocks(sourceLines: string[], depth = 0): MarkdownBlock[] {
  if (depth >= 32) return [{ type: "paragraph", text: sourceLines.join("\n") }];
  const lines = sourceLines.map((line) => line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length)));
  const blocks: MarkdownBlock[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor]!;
    if (!line.trim()) { cursor++; continue; }
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const code: string[] = [];
      const close = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`);
      cursor++;
      while (cursor < lines.length && !close.test(lines[cursor]!)) code.push(sourceLines[cursor++]!);
      if (cursor < lines.length) cursor++;
      const language = fence[2]!.trim().split(/\s/)[0] ?? "";
      blocks.push({ type: "code", text: code.join("\n"), language: /^[a-z0-9_-]+$/i.test(language) ? language : "" });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]! });
      cursor++;
      continue;
    }
    const firstItem = markdownListMarker(line);
    if (firstItem) {
      const items: MarkdownBlock[][] = [];
      while (cursor < lines.length) {
        const item = markdownListMarker(lines[cursor]!);
        if (!item || item.indent !== firstItem.indent || item.ordered !== firstItem.ordered) break;
        const itemLines = [item.text];
        cursor++;
        while (cursor < lines.length) {
          const continuation = lines[cursor]!;
          if (!continuation.trim()) {
            let next = cursor + 1;
            while (next < lines.length && !lines[next]!.trim()) next++;
            if (next === lines.length || (lines[next]!.match(/^ */)?.[0].length ?? 0) <= firstItem.indent) {
              cursor = next;
              break;
            }
            itemLines.push("");
            cursor++;
            continue;
          }
          const indent = continuation.match(/^ */)?.[0].length ?? 0;
          if (indent <= firstItem.indent) break;
          itemLines.push(continuation.slice(Math.min(indent, item.contentIndent)));
          cursor++;
        }
        items.push(parseMarkdownBlocks(itemLines, depth + 1));
      }
      blocks.push({ type: "list", ordered: firstItem.ordered, start: firstItem.start, items });
      continue;
    }
    const paragraph = [line.trim()];
    cursor++;
    while (cursor < lines.length && lines[cursor]!.trim() &&
      !/^(#{1,3})\s+/.test(lines[cursor]!.trim()) &&
      !/^ {0,3}(`{3,}|~{3,})/.test(lines[cursor]!) && !markdownListMarker(lines[cursor]!)) {
      paragraph.push(lines[cursor++]!.trim());
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

function markdownHeadings(blocks: MarkdownBlock[], title: string): Map<MarkdownBlock, ReaderSectionHeading> {
  const headings = new Map<MarkdownBlock, ReaderSectionHeading>();
  const usedIds = new Set<string>();
  const visit = (block: MarkdownBlock) => {
    if (block.type === "list") { block.items.forEach((item) => item.forEach(visit)); return; }
    if (block.type !== "heading" || block.level === 1) return;
    const text = normalizeHeadingText(block.text);
    if (!text || text.toLowerCase() === title.trim().toLowerCase()) return;
    const base = readerHeadingId(text, headings.size);
    let id = base;
    let occurrence = 1;
    while (usedIds.has(id)) id = `${base}-${++occurrence}`;
    usedIds.add(id);
    headings.set(block, { id, text, level: block.level === 3 ? 3 : 2 });
  };
  blocks.forEach(visit);
  return headings;
}

export function renderMarkdownDocument(body: string, title: string): ReactNode[] {
  const blocks = parseMarkdownBlocks(body.split(/\r?\n/));
  const headings = markdownHeadings(blocks, title);
  const renderBlock = (block: MarkdownBlock, key: number): ReactNode => {
    if (block.type === "paragraph") return <p key={key}>{renderInlineMarkdown(block.text)}</p>;
    if (block.type === "code") return <pre key={key}><code className={block.language ? `language-${block.language}` : undefined}>{block.text}</code></pre>;
    if (block.type === "list") {
      const items = block.items.map((item, index) => <li key={index}>{item.map((child, childIndex) => child.type === "paragraph" && childIndex === 0
        ? <span key={childIndex}>{renderInlineMarkdown(child.text)}</span>
        : renderBlock(child, childIndex))}</li>);
      return block.ordered ? <ol key={key} start={block.start === 1 ? undefined : block.start}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    const text = normalizeHeadingText(block.text);
    if (block.level === 1 && text.toLowerCase() === title.trim().toLowerCase()) return null;
    const id = headings.get(block)?.id;
    return block.level === 3
      ? <h3 key={key} id={id} tabIndex={-1}>{renderInlineMarkdown(block.text)}</h3>
      : <h2 key={key} id={id} tabIndex={-1}>{renderInlineMarkdown(block.text)}</h2>;
  };
  return blocks.map(renderBlock);
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
