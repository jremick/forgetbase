// Failure cases defined before renderer implementation: lost table/task/code structure,
// heading IDs disagreeing with outline, unsafe URLs/HTML, remote image fetches.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichMarkdownDocument, extractRichHeadings } from "./rich-markdown.js";
const render = (body: string) => renderToStaticMarkup(createElement(RichMarkdownDocument, { body, title: "Example" }));
describe("shared rich Markdown reader", () => {
  it("renders nested tasks, ordered starts, tables, quotes and unchanged code text", () => {
    const output = render("# Example\n\n3. Third\n   - [x] Checked\n   - [ ] Pending\n\n> A **quoted** *note*\n\n| Key | Value |\n| --- | --- |\n| First | ~~old~~ new |\n\n```ts\nconst value = '<unsafe>';\n```\n");
    expect(output).toContain('<ol start="3">');
    expect(output.match(/type="checkbox"/g)).toHaveLength(2);
    expect(output).toContain("<table>");
    expect(output).toContain("<blockquote>");
    expect(output).toContain("<em>note</em>");
    expect(output).toContain("<del>old</del>");
    expect(output).toContain("const value = &#x27;&lt;unsafe&gt;&#x27;;\n");
    expect(output).not.toContain("<h1");
  });
  it("uses the same unique targets for the outline and rendered headings", () => {
    const body = "## Check\n\n## Check\n\n## Check-2\n\n> ### *Quoted* heading\n\n#### Deep\n\n```\n## Ignored\n```";
    const headings = extractRichHeadings(body, "Example");
    expect(headings.map(x => x.id)).toEqual(["reader-section-check", "reader-section-check-2", "reader-section-check-2-2", "reader-section-quoted-heading", "reader-section-deep"]);
    const output = render(body);
    for (const {id} of headings) expect(output).toContain(`id="${id}"`);
  });
  it("preserves text without executing raw HTML, unsafe links or remote images", () => {
    const output = render('<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1)) [Shorthand](//evil.test) [Guide](/docs/start)\n\n![Private image](https://tracking.test/pixel)');
    expect(output).not.toContain("<script");
    expect(output).not.toContain('href="javascript:');
    expect(output).not.toContain('href="//');
    expect(output).not.toContain("<img");
    expect(output).not.toContain("https://tracking.test");
    expect(output).toContain("Private image");
    expect(output).toContain('href="/docs/start"');
  });
  // These contracts move from the retired reader-ui renderer. Expected output
  // follows the document's semantics, not the retired renderer's span wrappers.
  it("keeps nested procedure lists and safe links in the active reader", () => {
    const output = render("1. Prepare\n   - Check access\n   - [Guide](/docs/start)\n2. Run\n   1. Read\n      - [Open](javascript:alert(1))\n   2. Confirm\n3. Finish");
    expect(output.match(/<ol(?:\s[^>]*)?>/g)).toHaveLength(2);
    expect(output.match(/<ul>/g)).toHaveLength(2);
    expect(output.match(/<li>/g)).toHaveLength(8);
    expect(output).toMatch(/<li>Run\s*<ol>/);
    expect(output).toMatch(/<li>Read\s*<ul>/);
    expect(output).toContain('href="/docs/start"');
    expect(output).toContain(">Guide</a>");
    expect(output).toContain("Open");
    expect(output).not.toContain("javascript:");
  });
  it("keeps ordered starts, continuation text, and the following paragraph", () => {
    const output = render("3. Third step\n   continues on this line\n4. Fourth step\n\nAfter the procedure.");
    expect(output).toContain('<ol start="3">');
    expect(output).toMatch(/Third step\s+continues on this line/);
    expect(output).toMatch(/<\/ol>\s*<p>After the procedure\.<\/p>/);
  });
  it("preserves code literally and excludes code headings from the outline", () => {
    const body = "```html\n<script>alert('x')</script>\n## Not a heading\n[Bad](javascript:alert(1))\n```\n\n## Real heading";
    const output = render(body);
    expect(output).toContain('<pre><code class="language-html">');
    expect(output).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;\n## Not a heading\n[Bad](javascript:alert(1))\n");
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("<a ");
    expect(extractRichHeadings(body, "Example")).toEqual([{ id: "reader-section-real-heading", text: "Real heading", level: 2 }]);
  });
  it.each([
    ["~~~text\nline one\n\nline three\n~~~", "line one\n\nline three\n"],
    ["```\nline one\nline two", "line one\nline two\n"],
    ["```\n\tindented\n```", "\tindented\n"]
  ])("preserves tilde, unfinished, and tabbed code: %s", (body, code) => {
    expect(render(body)).toContain(`${code}</code></pre>`);
  });
  it("keeps raw HTML inert and safe links usable inside lists", () => {
    // CommonMark HTML blocks include following lines until a blank line.
    // Preserve that input as inert literal text; use an explicit block boundary
    // when testing actual nested Markdown links.
    const literal = render("1. <img src=x onerror=alert(1)>\n   - [Open](javascript:alert(1))\n   - [Guide](https://example.test/guide)");
    expect(literal).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(literal).toContain("[Guide](https://example.test/guide)");
    expect(literal).not.toContain("<img");
    expect(literal).not.toContain("<a ");
    const output = render("1. <img src=x onerror=alert(1)>\n\n   - [Open](javascript:alert(1))\n   - [Guide](https://example.test/guide)");
    expect(output).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(output).not.toContain("<img");
    expect(output).not.toContain("javascript:");
    expect(output).toContain("Open");
    expect(output).toContain('href="https://example.test/guide"');
  });
  it.each(["1. ", "> "])("bounds pathological %s nesting with literal source and no dangling outline", (marker) => {
    const prefix = marker.repeat(1000);
    const body = `${prefix}Last step\n\n## Hidden outline\n\n<script>alert(1)</script>\n[Unsafe](javascript:alert(1))\n\n`;
    const escapedPrefix = marker === "> " ? "&gt; ".repeat(1000) : prefix;
    expect(render(body)).toBe(`<pre>${escapedPrefix}Last step\n\n## Hidden outline\n\n&lt;script&gt;alert(1)&lt;/script&gt;\n[Unsafe](javascript:alert(1))\n\n</pre>`);
    expect(extractRichHeadings(body, "Example")).toEqual([]);
  });
  it("keeps ordinary nested documents semantic with a matching outline", () => {
    const body = `${"> ".repeat(12)}## Nested guide`;
    const output = render(body);
    expect(output.match(/<blockquote>/g)).toHaveLength(12);
    expect(output).toContain('id="reader-section-nested-guide"');
    expect(extractRichHeadings(body, "Example")).toEqual([{ id: "reader-section-nested-guide", text: "Nested guide", level: 2 }]);
  });
});
