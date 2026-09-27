import { Component, type ReactNode, forwardRef, useLayoutEffect, useCallback, useId, useImperativeHandle, useRef, useState, useEffect } from "react";
import { assessRichMarkdown } from "../../lib/editor-preservation.js";
import { SourceEditor } from "./source-editor.js";
import { RichEditor, type RichReader } from "./rich-editor.js";
import "./markdown-editor.css";

export type MarkdownSnapshot = { value: string; ready: boolean; reason?: string };
export type MarkdownEditorHandle = { getSnapshot(): MarkdownSnapshot };
export type MarkdownEditorProps = {
  value: string; onChange(value: string): void; documentKey: string; readOnly?: boolean; label: string; error?: string;
  onReadyChange?(ready: boolean): void;
};

/** Parent owns persistence. A changed key or non-echo value starts a fresh history. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(props, ref) {
  const emitted = useRef(props.value);
  const [input, setInput] = useState({ value: props.value, revision: 0 });
  const session = `${props.documentKey}:${input.revision}`;
  const activeSession = useRef(session);
  activeSession.current = session;
  useLayoutEffect(() => { emitted.current = props.value; }, [props.documentKey, input.revision]);
  if (input.value !== props.value) setInput({ value: props.value, revision: input.revision + (props.value === emitted.current ? 0 : 1) });
  return <EditorSession {...props} key={session} ref={ref} onReadyChange={(ready) => { if (activeSession.current === session) props.onReadyChange?.(ready); }} onChange={(value) => { if (activeSession.current !== session) return; emitted.current = value; props.onChange(value); }} />;
});

const EditorSession = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function EditorSession({ value, onChange, readOnly = false, label, error, onReadyChange }, ref) {
  const [assessment] = useState(() => assessRichMarkdown(value));
  const [mode, setMode] = useState<"rich" | "source">(assessment.eligible ? "rich" : "source");
  const [reason, setReason] = useState(assessment.reason);
  const [modeVersion, setModeVersion] = useState(0);
  const [buffer, setBuffer] = useState(value);
  const working = useRef(value);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const reader = useRef<RichReader | null>(null);
  const composing = useRef(false);
  const ready = useRef(false);
  const [notice, setNotice] = useState("");
  const id = useId();
  const callbacks = useRef({ onChange, onReadyChange });
  callbacks.current = { onChange, onReadyChange };
  const setReady = useCallback((next: boolean) => { ready.current = next; callbacks.current.onReadyChange?.(next); }, []);
  useEffect(() => () => callbacks.current.onReadyChange?.(false), []);
  const emit = useCallback((next: string) => {
    if (next === working.current) return;
    working.current = next; setBuffer(next); callbacks.current.onChange(next);
  }, []);
  const snapshot = (): MarkdownSnapshot => {
    if (composing.current || reader.current?.composing()) return { value: working.current, ready: false, reason: "Finish composing text before saving." };
    if (!ready.current || !reader.current) return { value: working.current, ready: false, reason: "The editor is preparing this document." };
    let next: string;
    try { next = reader.current.read(); }
    catch { fallback(working.current, "Rich export failed. Your last valid Markdown is available in Source."); return { value: working.current, ready: false, reason: "Editor recovery is preparing Source." }; }
    if (!ready.current) return { value: working.current, ready: false, reason: "The edit is moving to Source. Try Save again when ready." };
    emit(next);
    return { value: next, ready: true };
  };
  useImperativeHandle(ref, () => ({ getSnapshot: snapshot }));
  const mounted = useCallback((read: RichReader) => { composing.current = false; reader.current = read; setReady(true); }, [setReady]);
  const fallback = useCallback((next: string, message: string) => {
    emit(next); composing.current = false; reader.current = null; setReady(false); setReason(message); setMode("source"); setModeVersion((v) => v + 1);
  }, [emit, setReady]);
  const switchMode = (next: "source" | "rich") => {
    const current = snapshot();
    if (!current.ready || readOnly) return;
    if (next === "rich") {
      const check = assessRichMarkdown(current.value);
      if (!check.eligible) { setReason(check.reason); return; }
    }
    setReason(""); reader.current = null; setReady(false); setMode(next); setModeVersion((v) => v + 1);
  };
  useEffect(() => {
    const element = fieldset.current;
    if (!element || !readOnly) return;
    const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    element.addEventListener("beforeinput", block, true); element.addEventListener("cut", block, true);
    return () => { element.removeEventListener("beforeinput", block, true); element.removeEventListener("cut", block, true); };
  }, [readOnly]);
  const describedBy = `${id}-help${error ? ` ${id}-error` : ""}`;
  return <section className="fb-markdown-editor" aria-label={`${label} editor`}>
    <div className="fb-editor-controls">
      <span className="fb-editor-label">{label}</span>
      <div role="group" aria-label="Editing mode">
        <button type="button" aria-pressed={mode === "rich"} disabled={readOnly || mode === "rich"} onClick={() => switchMode("rich")}>Rich text</button>
        <button type="button" aria-pressed={mode === "source"} disabled={readOnly || mode === "source"} onClick={() => switchMode("source")}>Source</button>
      </div>
      <button type="button" onClick={async () => {
        const current = snapshot();
        if (!current.ready) { setNotice(current.reason ?? "Editor is not ready."); return; }
        try { await navigator.clipboard.writeText(current.value); setNotice("Markdown copied."); }
        catch { setNotice("Clipboard unavailable. Select and copy the Markdown in Source."); }
      }}>Copy Markdown</button>
    </div>
    <p id={`${id}-help`} className="fb-editor-help">{reason || (mode === "rich" ? "Rich text edits Markdown. Paste inserts plain text." : "Source preserves Markdown and untouched line endings.")} Switching modes starts a new undo history.</p>
    {error && <p id={`${id}-error`} className="fb-editor-error" role="alert">{error}</p>}
    <fieldset ref={fieldset} disabled={readOnly} className="fb-editor-body"
      onCompositionStartCapture={() => { composing.current = true; setReady(false); }}
      onCompositionEndCapture={() => { composing.current = false; queueMicrotask(() => setReady(Boolean(reader.current))); }}
      onBeforeInputCapture={(event) => { if (readOnly) event.preventDefault(); }}
      onDropCapture={(event) => { event.preventDefault(); event.stopPropagation(); setNotice("Drop is disabled. Use the governed attachment controls."); }}
      onPasteCapture={(event) => { if (readOnly || event.clipboardData.files.length || !event.clipboardData.getData("text/plain")) { event.preventDefault(); event.stopPropagation(); setNotice("Paste plain text here. Use the governed attachment controls for files."); } }}
      onKeyDownCapture={(event) => {
        if (readOnly && !["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Shift", "Meta", "Control"].includes(event.key) && !((event.ctrlKey || event.metaKey) && ["c", "a"].includes(event.key.toLowerCase()))) { event.preventDefault(); event.stopPropagation(); }
        // Keep the app command-palette shortcut away from the authoring surface.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") event.stopPropagation();
      }}>
      {mode === "source" ? <SourceEditor key={modeVersion} initialValue={buffer} onChange={emit} onMount={mounted} readOnly={readOnly} label={`${label} Markdown source`} describedBy={describedBy} invalid={Boolean(error)} />
        : <RichFailureBoundary key={modeVersion} onFailure={() => fallback(working.current, "Rich editing failed. Your last valid Markdown remains in Source.")}><RichEditor initialValue={buffer} onChange={emit} onFallback={fallback} onMount={mounted} readOnly={readOnly} label={label} describedBy={describedBy} invalid={Boolean(error)} /></RichFailureBoundary>}
    </fieldset>
    <span role="status" className="fb-editor-help">{notice}</span>
  </section>;
});


class RichFailureBoundary extends Component<{ children: ReactNode; onFailure(): void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() { this.props.onFailure(); }
  override render() { return this.state.failed ? null : this.props.children; }
}
