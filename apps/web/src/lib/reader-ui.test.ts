import { describe, expect, it } from "vitest";
import { sanitizeMarkdownHref } from "./reader-ui.js";

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
});
