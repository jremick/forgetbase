import { lazy, Suspense, useEffect, useState } from "react";
import type { ReaderSectionHeading } from "../../lib/reader-ui.js";

function MarkdownSource({ body, failed = false }: { body: string; failed?: boolean }) {
  return <><p role="status">{failed ? "Formatted view could not load. Showing Markdown source." : "Formatting page…"}</p><pre className="markdown-source-fallback" style={{ whiteSpace: "pre-wrap" }}>{body}</pre></>;
}

const RichMarkdown = lazy(() => import("./rich-markdown.js")
  .then((module) => ({ default: module.RichMarkdownDocument }))
  .catch(() => ({ default: ({ body }: { body: string; title: string }) => <MarkdownSource body={body} failed /> })));

export function MarkdownDocument({ body, title }: { body: string; title: string }) {
  return <Suspense fallback={<MarkdownSource body={body} />}><RichMarkdown body={body} title={title} /></Suspense>;
}

export function useMarkdownHeadings(body: string, title: string): ReaderSectionHeading[] {
  const [result, setResult] = useState<{ body: string; title: string; headings: ReaderSectionHeading[] } | null>(null);
  useEffect(() => {
    let current = true;
    if (body) void import("./rich-markdown.js").then((module) => {
      if (current) setResult({ body, title, headings: module.extractRichHeadings(body, title) });
    }).catch(() => { /* The document component shows a readable source fallback. */ });
    return () => { current = false; };
  }, [body, title]);
  return result?.body === body && result.title === title ? result.headings : [];
}
