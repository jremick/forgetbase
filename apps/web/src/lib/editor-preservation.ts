import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

const parser = unified().use(remarkParse).use(remarkGfm);
const allowed = new Set(["root", "paragraph", "text", "heading", "emphasis", "strong", "delete", "inlineCode", "code", "blockquote", "thematicBreak", "break", "list", "listItem", "link", "table", "tableRow", "tableCell"]);
type MarkdownNode = { type: string; children?: MarkdownNode[]; value?: string; url?: string; start?: number | null; spread?: boolean; checked?: boolean | null; meta?: string | null; position?: { start: { offset?: number } } };
export type RichAssessment = { eligible: boolean; reason: string };

function safeHref(value: string): boolean {
  const href = value.trim();
  if (!href || /^[\\/]{2}/.test(href)) return false;
  const scheme = href.replace(/[\u0000-\u0020\u007f\u00a0]/g, "").match(/^([a-z][a-z0-9+.-]*):/i)?.[1];
  return !scheme || /^(https?|mailto)$/i.test(scheme);
}

/** Conservative pre-import boundary. Eligibility still requires an exact editor round trip. */
export function assessRichMarkdown(source: string): RichAssessment {
  const sourceOnly = (reason: string): RichAssessment => ({ eligible: false, reason });
  if (source.length > 100_000) return sourceOnly("Large documents use Source to avoid a costly rich import.");
  if (/\r|\uFEFF|\u0000/.test(source)) return sourceOnly("Source preserves this document's line endings and special characters.");
  if (/^\s/.test(source) && source !== "") return sourceOnly("Source preserves leading whitespace.");
  if (/^(---|\+\+\+)\n/.test(source)) return sourceOnly("Frontmatter stays in Source.");
  // Bound parser recursion before parsing adversarial quote/list nesting.
  if (source.split("\n").some((line) => /^(?:\s*>){25}/.test(line) || /^ {48}/.test(line))) return sourceOnly("Deeply nested documents use Source.");
  try {
    const root = parser.parse(source) as unknown as MarkdownNode;
    let reason = "";
    let nodes = 0;
    const visit = (node: MarkdownNode, depth: number): void => {
      if (reason) return;
      if (++nodes > 2000 || depth > 24 || !allowed.has(node.type)) { reason = "This document contains syntax supported only in Source."; return; }
      if (node.type === "text" && (node.value?.includes("\n") || /[<{}]|\[\[|==|\$[^\n]*\$|(?:^|\n)\s*:{2,}|\[\^/.test(node.value ?? ""))) reason = "Extended Markdown and literal special syntax stay in Source.";
      if (node.type === "link" && (!safeHref(node.url ?? "") || source[node.position?.start.offset ?? -1] === "<")) reason = "Source preserves this link without rewriting it.";
      if (node.type === "list") {
        const items = node.children ?? [];
        const taskCount = items.filter((item) => typeof item.checked === "boolean").length;
        if ((node.start != null && node.start !== 1) || node.spread || items.some((item) => item.spread) || (taskCount > 0 && taskCount !== items.length)) reason = "Source preserves this list's numbering and spacing.";
      }
      if (node.type === "code") {
        const start = node.position?.start.offset ?? 0;
        if (node.meta || !/^(?:`{3,}|~{3,})/.test(source.slice(start))) reason = "Source preserves this code block's indentation or metadata.";
      }
      for (const child of node.children ?? []) visit(child, depth + 1);
    };
    visit(root, 0);
    return reason ? sourceOnly(reason) : { eligible: true, reason: "" };
  } catch {
    return sourceOnly("This Markdown could not be safely imported. The original remains in Source.");
  }
}

export function richRoundTripMatches(original: string, serialized: string): boolean {
  return original.replace(/\n+$/, "") === serialized.replace(/\n+$/, "");
}

export function preserveRichEnding(original: string, initialExport: string, currentExport: string): string {
  if (currentExport === initialExport) return original;
  return currentExport.replace(/\n+$/, "") + (original.match(/\n*$/)?.[0] ?? "");
}

export type SourceChange = { from: number; to: number; insert: string };
/** CodeMirror offsets use LF. Apply edits to the original string, retaining every untouched byte. */
export function applySourceChanges(source: string, changes: SourceChange[]): string {
  if (!changes.length) return source;
  const offsets: number[] = [0];
  for (let raw = 0; raw < source.length;) {
    raw += source[raw] === "\r" && source[raw + 1] === "\n" ? 2 : 1;
    offsets.push(raw);
  }
  const separator = /\r\n/.test(source) && !/(?:^|[^\r])\n|\r(?!\n)/.test(source) ? "\r\n" : "\n";
  let result = source;
  for (const change of [...changes].reverse()) {
    const from = offsets[change.from];
    const to = offsets[change.to];
    if (from == null || to == null || to < from) throw new Error("Invalid source edit range");
    const before = result.slice(0, from);
    const after = result.slice(to);
    let inserted = change.insert.replace(/\r\n?/g, "\n").replace(/\n/g, separator);
    // Keep two logical breaks when an edit would join a lone CR to an LF.
    if (before.endsWith("\r") && (inserted + after).startsWith("\n")) inserted = "\n" + inserted;
    result = before + inserted + after;
  }
  return result;
}
