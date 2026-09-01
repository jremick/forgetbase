import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderMarkdownDocument, sanitizeMarkdownHref } from "./reader-ui.js";

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
