import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { extractReaderSectionHeadings, renderMarkdownDocument, sanitizeMarkdownHref } from "./reader-ui.js";

function renderDocument(body: string): string {
  return renderToStaticMarkup(createElement(Fragment, null, ...renderMarkdownDocument(body, "Example")));
}

describe("sanitizeMarkdownHref", () => {
  it.each([
    "javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//attacker.example/path",
    "\\\\attacker.example\\path"
  ])("rejects executable or cross-origin shorthand URL %s", (value) => {
    expect(sanitizeMarkdownHref(value)).toBeNull();
  });

  it.each([
    ["/docs/start", "/docs/start"],
    ["../guide", "../guide"],
    ["https://example.com/docs", "https://example.com/docs"],
    ["http://example.com/docs", "http://example.com/docs"],
    ["mailto:help@example.com", "mailto:help@example.com"]
  ])("allows supported URL %s", (value, expected) => {
    expect(sanitizeMarkdownHref(value)).toBe(expected);
  });

  it("renders rejected Markdown links as visible text without an href", () => {
    const markup = renderToStaticMarkup(createElement(Fragment, null, ...renderMarkdownDocument("[Open](javascript:alert(1))", "Example")));

    expect(markup).toContain("Open");
    expect(markup).not.toContain("href=");
    expect(markup).not.toContain("javascript:");
  });

  it("keeps safe Markdown links clickable", () => {
    const markup = renderToStaticMarkup(createElement(Fragment, null, ...renderMarkdownDocument("[Guide](/docs/start)", "Example")));

    expect(markup).toContain('href="/docs/start"');
    expect(markup).toContain("Guide");
  });
});

describe("reader and authoring Markdown", () => {
  it("keeps procedure steps and nested ordered and unordered lists semantic", () => {
    const markup = renderDocument("1. Prepare\n   - Check access\n   - Check the source\n2. Run\n   1. Read\n      - Inspect\n   2. Confirm\n3. Finish");

    expect(markup.match(/<ol>/g)).toHaveLength(2);
    expect(markup.match(/<ul>/g)).toHaveLength(2);
    expect(markup.match(/<li>/g)).toHaveLength(8);
    expect(markup).toContain("<li><span>Run</span><ol>");
    expect(markup).toContain("<li><span>Read</span><ul>");
  });

  it("preserves an ordered list start, multiline steps, and following paragraphs", () => {
    const markup = renderDocument("3. Third step\n   continues on this line\n4. Fourth step\n\nAfter the procedure.");
    expect(markup).toContain('<ol start="3">');
    expect(markup).toContain("Third step continues on this line");
    expect(markup).toContain("</ol><p>After the procedure.</p>");
  });

  it("preserves fenced code lines and treats Markdown and HTML inside them as text", () => {
    const body = "```html\n<script>alert('x')</script>\n## Not a heading\n[Bad](javascript:alert(1))\n```\n\n## Real heading";
    const markup = renderDocument(body);
    expect(markup).toContain('<pre><code class="language-html">');
    expect(markup).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;\n## Not a heading\n");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<a ");
    expect(extractReaderSectionHeadings(body, "Example")).toEqual([{ id: "reader-section-real-heading", text: "Real heading", level: 2 }]);
  });

  it("supports tilde fences and keeps an unfinished fence as code", () => {
    expect(renderDocument("~~~text\nline one\n\nline three\n~~~")).toContain("line one\n\nline three</code></pre>");
    expect(renderDocument("```\nline one\nline two")).toBe("<pre><code>line one\nline two</code></pre>");
    expect(renderDocument("```\n\tindented\n```")).toBe("<pre><code>\tindented</code></pre>");
  });

  it("uses matching unique outline targets for repeated headings", () => {
    const body = "## Check\nFirst\n\n## Check\nSecond\n\n## Check-2\nThird";
    const headings = extractReaderSectionHeadings(body, "Example");
    const markup = renderDocument(body);
    expect(headings.map((heading) => heading.id)).toEqual(["reader-section-check", "reader-section-check-2", "reader-section-check-2-2"]);
    for (const heading of headings) expect(markup).toContain(`id="${heading.id}"`);
  });

  it("escapes raw HTML and rejects executable links inside nested lists", () => {
    const markup = renderDocument("1. <img src=x onerror=alert(1)>\n   - [Open](javascript:alert(1))\n   - [Guide](https://example.test/guide)");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("javascript:");
    expect(markup).toContain('href="https://example.test/guide"');
  });

  it("bounds pathological list nesting without dropping its text", () => {
    const markup = renderDocument(`${"1. ".repeat(1000)}Last step`);
    expect(markup).toContain("Last step");
    expect(markup.match(/<ol>/g)?.length).toBeLessThanOrEqual(32);
  });
});
