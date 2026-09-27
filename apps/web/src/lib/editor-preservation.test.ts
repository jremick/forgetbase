import { describe, expect, it } from "vitest";
import { assessRichMarkdown, richRoundTripMatches, preserveRichEnding, applySourceChanges } from "./editor-preservation.js";

// Written before the adapter: storage is a string contract; parsing and source
// offset mapping have failure modes distinct from browser editor lifecycle.
describe("editor preservation boundary", () => {
  it.each([
    "\uFEFF# BOM\r\n", "    indented code\n", "3. three\n4. four\n", "- [ ] task\n- plain\n",
    "<script>alert(1)</script>", "![remote](https://example.test/image.png)",
    "[x](javascript:alert)", "[x](//example.test)", "[x](java&#x73;cript:alert)",
    "[reference][a]\n\n[a]: /local", "---\nkey: value\n---\nbody", "[^note]: footnote",
    "Text {expression}", "a < b", "==highlight==", "[[wiki]]", "$$math$$", ":::note\nbody\n:::",
    "```js title=x\ncode\n```", "> ".repeat(30) + "nested", "x".repeat(100_001),
  ])("routes uncertain or unsupported content to Source before import: %s", (source) => {
    expect(assessRichMarkdown(source).eligible).toBe(false);
  });
  it("admits a supported mixed document to the separate round-trip probe", () => {
    const source = "# Guide\n\nUnicode café 🧪 **bold** and *emphasis*.\n\n- [ ] Task\n- [x] Done\n\n> Quote\n\n[Download](/assets/one?q=1#file)\n\n| A | B |\n| - | - |\n| One | Two |\n\n```txt\nkeep  two spaces\n```\n";
    expect(assessRichMarkdown(source).eligible).toBe(true);
  });
  it("requires exact imported spelling apart from terminal LF, never a lossy semantic approximation", () => {
    expect(richRoundTripMatches("# Guide\n\nText.\n\n", "# Guide\n\nText.")).toBe(true);
    expect(richRoundTripMatches("- a\n- b\n", "* a\n* b")).toBe(false);
    expect(richRoundTripMatches("[x](/a?q=1)", "[x](/a?q=2)")).toBe(false);
    expect(richRoundTripMatches("```txt\na  b\n```", "```txt\na b\n```")).toBe(false);
    expect(richRoundTripMatches("a  \nb", "a\nb")).toBe(false);
    expect(richRoundTripMatches("    code", "code")).toBe(false);
  });
  it("keeps original bytes on no-op and undo, and preserves the final newline policy on edits", () => {
    expect(preserveRichEnding("# A\n\n", "# A", "# A")).toBe("# A\n\n");
    expect(preserveRichEnding("# A\n\n", "# A", "# B")).toBe("# B\n\n");
    expect(preserveRichEnding("# A", "# A", "# B")).toBe("# B");
  });
  it("maps source edits without rewriting untouched mixed line endings or Unicode", () => {
    expect(applySourceChanges("a\r\nβ\nc\rd", [{ from: 2, to: 3, insert: "🧪" }])).toBe("a\r\n🧪\nc\rd");
    expect(applySourceChanges("a\r\nb\r\n", [{ from: 3, to: 3, insert: "\nnew" }])).toBe("a\r\nb\r\nnew\r\n");
    expect(applySourceChanges("A\r\nB\nC", [{ from: 0, to: 1, insert: "X" }, { from: 4, to: 5, insert: "Z" }])).toBe("X\r\nB\nZ");
    expect(applySourceChanges("\uFEFFα\r\n", [])).toBe("\uFEFFα\r\n");
  });
});
