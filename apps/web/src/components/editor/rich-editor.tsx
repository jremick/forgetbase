import { useEffect, useMemo, useRef, useState } from "react";
import { $getRoot, $getSelection, $isRangeSelection, $isLineBreakNode, FORMAT_TEXT_COMMAND, PASTE_COMMAND, COMMAND_PRIORITY_CRITICAL } from "lexical";
import { toMarkdown } from "mdast-util-to-markdown";
import { EditorView } from "@codemirror/view";
import { gfmToMarkdown } from "mdast-util-gfm";
import { MDXEditor, realmPlugin, rootEditor$, activeEditor$, exportVisitors$, jsxComponentDescriptors$, jsxIsAvailable$, exportLexicalTreeToMdast, NESTED_EDITOR_UPDATED_COMMAND, addExportVisitor$,
  headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, linkPlugin, linkDialogPlugin, tablePlugin, codeBlockPlugin, codeMirrorPlugin,
  toolbarPlugin, UndoRedo, BlockTypeSelect, BoldItalicUnderlineToggles, StrikeThroughSupSubToggles, ListsToggle, CreateLink, InsertTable, InsertCodeBlock,
} from "@mdxeditor/editor";
import { assessRichMarkdown, preserveRichEnding, richRoundTripMatches } from "../../lib/editor-preservation.js";
import "@mdxeditor/editor/style.css";

export type RichReader = { read(): string; composing(): boolean };
export function RichEditor({ initialValue, onChange, onFallback, onMount, readOnly, label, describedBy, invalid }: {
  initialValue: string; onChange(value: string): void; onFallback(value: string, reason: string): void; onMount(reader: RichReader): void;
  readOnly: boolean; label: string; describedBy: string; invalid: boolean;
}) {
  const initial = useRef(initialValue);
  const baseline = useRef<string | null>(null);
  const lastSource = useRef(initialValue);
  const serializeCurrent = useRef<(() => string) | null>(null);
  const callbacks = useRef({ onChange, onFallback, onMount });
  callbacks.current = { onChange, onFallback, onMount };
  const [checked, setChecked] = useState(false);
  const [pasteNotice, setPasteNotice] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const capture = useMemo(() => realmPlugin({
    init(realm) {
      realm.pub(addExportVisitor$, { priority: 100, testLexicalNode: $isLineBreakNode,
        visitLexicalNode: ({ mdastParent, actions }) => { actions.appendToParent(mdastParent, { type: "break" }); } });
    },
    postInit(realm) {
    const editor = realm.getValue(rootEditor$);
    if (!editor) return;
    const serialize = () => {
      const active = realm.getValue(activeEditor$);
      if (active && active !== editor) active.read(() => undefined);
      return editor.read(() => toMarkdown(exportLexicalTreeToMdast({
      root: $getRoot(), visitors: realm.getValue(exportVisitors$), jsxComponentDescriptors: realm.getValue(jsxComponentDescriptors$), jsxIsAvailable: realm.getValue(jsxIsAvailable$)
    }), { extensions: [gfmToMarkdown()], fences: true, bullet: "-", listItemIndent: "one" }).trim());
    };
    // The supplied converter's initial string getter is not a round-trip probe.
    const normalized = serialize();
    if (!richRoundTripMatches(initial.current, normalized)) {
      callbacks.current.onFallback(initial.current, "Rich editing would rewrite this document. Source keeps the original Markdown unchanged.");
      return;
    }
    baseline.current = normalized;
    serializeCurrent.current = serialize;
    callbacks.current.onMount({ read: () => {
      const active = realm.getValue(activeEditor$);
      if (active && active !== editor && active.getRootElement()?.contains(document.activeElement)) {
        active.read(() => undefined);
        active.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined);
      }
      const value = preserveRichEnding(initial.current, normalized, serialize());
      if (!assessRichMarkdown(value).eligible) callbacks.current.onFallback(value, "This edit needs Source. Your Markdown has been retained.");
      return value;
    }, composing: () => editor.isComposing() || (realm.getValue(activeEditor$)?.isComposing() ?? false) });
    setChecked(true);
    editor.registerCommand(FORMAT_TEXT_COMMAND, (format) => ["underline", "subscript", "superscript", "highlight"].includes(format), COMMAND_PRIORITY_CRITICAL);
    editor.registerCommand(PASTE_COMMAND, (event, origin) => {
      if (!(event instanceof ClipboardEvent) || event.defaultPrevented) return true;
      event.preventDefault();
      if (!origin.isEditable()) return true;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (origin !== editor && /[\r\n]/.test(text)) { setPasteNotice("Multiline paste into a table is not supported. Use Source to edit the Markdown. Nothing was pasted."); return true; }
      setPasteNotice("");
      const insert = () => { const selection = $getSelection(); if ($isRangeSelection(selection)) selection.insertRawText(text.replace(/\r\n?/g, "\n")); };
      if (text) { if (origin === editor) insert(); else origin.update(insert); }
      return true;
    }, COMMAND_PRIORITY_CRITICAL);
  } })(), []);
  const plugins = useMemo(() => [headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(), linkPlugin(), linkDialogPlugin(), tablePlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }), codeMirrorPlugin({ codeBlockLanguages: { "": "Plain text", txt: "Plain text", js: "JavaScript", ts: "TypeScript", json: "JSON", markdown: "Markdown" }, autoLoadLanguageSupport: false, codeMirrorExtensions: [EditorView.editable.of(!readOnly && checked)] }),
    toolbarPlugin({ toolbarContents: () => <><UndoRedo /><BlockTypeSelect /><BoldItalicUnderlineToggles options={["Bold", "Italic"]} /><StrikeThroughSupSubToggles options={["Strikethrough"]} /><ListsToggle /><CreateLink /><InsertTable /><InsertCodeBlock /></> }), capture], [capture, readOnly, checked]);
  // MDXEditor exposes a translated name but no root aria-describedby/invalid props.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () => {
      for (const editable of Array.from(element.querySelectorAll<HTMLElement>('[role="textbox"], [contenteditable="true"]'))) {
        editable.setAttribute("aria-label", editable.classList.contains("fb-rich-content") ? label : `${label} ${editable.classList.contains("cm-content") ? "code block" : "table cell"}`);
        editable.setAttribute("aria-describedby", describedBy);
        editable.setAttribute("aria-invalid", String(invalid));
        editable.setAttribute("aria-readonly", String(readOnly || !checked));
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [label, describedBy, invalid, readOnly, checked]);
  return <div ref={host} className="fb-rich-editor" aria-busy={!checked}>
    {pasteNotice && <p role="status" className="fb-editor-help">{pasteNotice}</p>}
    <MDXEditor contentEditableClassName="fb-rich-content" markdown={initial.current} trim={false} suppressHtmlProcessing toMarkdownOptions={{ fences: true, bullet: "-", listItemIndent: "one" }} readOnly={readOnly || !checked} plugins={plugins}
      translation={(key, fallback, values = {}) => key === "contentArea.editableMarkdown" ? label : Object.entries(values).reduce((text, [name, replacement]) => text.replaceAll(`{{${name}}}`, String(replacement)), fallback)}
      onError={() => callbacks.current.onFallback(lastSource.current, "Rich import failed. The original Markdown remains in Source.")}
      onChange={(serialized, initializing) => {
        if (initializing || baseline.current === null) return;
        let current: string;
        try { current = serializeCurrent.current?.() ?? serialized; }
        catch { callbacks.current.onFallback(serialized, "This edit needs Source. Its Markdown has been retained."); return; }
        const value = preserveRichEnding(initial.current, baseline.current, current);
        lastSource.current = value;
        const assessment = assessRichMarkdown(value);
        if (!assessment.eligible) callbacks.current.onFallback(value, "This edit needs Source. Your Markdown has been retained.");
        else callbacks.current.onChange(value);
      }} />
  </div>;
}
