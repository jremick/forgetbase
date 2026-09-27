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
});
