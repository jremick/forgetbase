import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { sanitizeMarkdownHref, type ReaderSectionHeading } from "../../lib/reader-ui.js";

type MarkdownNode = {
  type: string;
  value?: string;
  alt?: string | null;
  depth?: number;
  children?: MarkdownNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};

function boundMarkdownNesting(tree: MarkdownNode, body: string): void {
  // Check iteratively before heading traversal and mdast-to-hast recurse.
  const pending = [{ node: tree, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 64) {
      // A text node preserves the exact source; raw HTML stays escaped.
      tree.children = [{ type: "paragraph", data: { hName: "pre" }, children: [{ type: "text", value: body }] }];
      return;
    }
    for (const child of node.children ?? []) pending.push({ node: child, depth: depth + 1 });
  }
}

function nodeText(node: MarkdownNode): string {
  return node.value ?? node.alt ?? (node.children ?? []).map(nodeText).join("");
}

// The renderer and outline use the same tree walk, including nested headings.
function prepareHeadings(tree: MarkdownNode, title: string, body: string): ReaderSectionHeading[] {
  boundMarkdownNesting(tree, body);
  const headings: ReaderSectionHeading[] = [];
  const usedIds = new Set<string>();
  const normalizedTitle = title.trim().toLowerCase();
  const visit = (parent: MarkdownNode) => {
    if (!parent.children) return;
    parent.children = parent.children.filter((node) => !(node.type === "heading" && node.depth === 1 && nodeText(node).trim().toLowerCase() === normalizedTitle));
    for (const node of parent.children) {
      if (node.type === "heading") {
        const text = nodeText(node).trim();
        if (node.depth !== 1 && text && text.toLowerCase() !== normalizedTitle) {
          const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
          const base = `reader-section-${slug || headings.length + 1}`;
          let id = base;
          let occurrence = 1;
          while (usedIds.has(id)) id = `${base}-${++occurrence}`;
          usedIds.add(id);
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id, tabIndex: -1 } };
          headings.push({ id, text, level: node.depth === 2 ? 2 : 3 });
        }
        if (node.depth === 1) node.depth = 2;
      }
      visit(node);
    }
  };
  visit(tree);
  return headings;
}

export function extractRichHeadings(body: string, title: string): ReaderSectionHeading[] {
  return prepareHeadings(unified().use(remarkParse).use(remarkGfm).parse(body), title, body);
}

function headingPlugin(options: { title: string; body: string }) {
  return (tree: MarkdownNode) => { prepareHeadings(tree, options.title, options.body); };
}

export function RichMarkdownDocument({ body, title }: { body: string; title: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm, [headingPlugin, { title, body }]]}
    urlTransform={(url) => sanitizeMarkdownHref(url) ?? ""}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>,
      img: ({ alt }) => <span className="markdown-image-alt">{alt || "Image"}</span>
    }}
  >{body}</ReactMarkdown>;
}
