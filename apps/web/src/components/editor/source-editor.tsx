import { useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, invertedEffects } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { applySourceChanges, type SourceChange } from "../../lib/editor-preservation.js";

export function SourceEditor({ initialValue, onChange, onMount, readOnly, label, describedBy, invalid }: {
  initialValue: string; onChange(value: string): void; onMount(reader: { read(): string; composing(): boolean }): void;
  readOnly: boolean; label: string; describedBy: string; invalid: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onMount });
  callbacks.current = { onChange, onMount };
  const settings = useRef(new Compartment());
  const initial = useRef(initialValue);
  const accessibility = () => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({ "aria-label": label, "aria-describedby": describedBy, "aria-invalid": String(invalid), "aria-readonly": String(readOnly) })];
  useEffect(() => {
    if (!host.current) return;
    const restoreRaw = StateEffect.define<string>();
    const raw = StateField.define<string>({
      create: () => initial.current,
      update(previous, transaction) {
        const restored = transaction.effects.filter((effect) => effect.is(restoreRaw)).at(-1);
        if (restored?.is(restoreRaw)) return restored.value;
        if (!transaction.docChanged) return previous;
        const changes: SourceChange[] = [];
        transaction.changes.iterChanges((from, to, _fromB, _toB, insert) => changes.push({ from, to, insert: insert.toString() }));
        return applySourceChanges(previous, changes);
      }
    });
    const editor = new EditorView({ parent: host.current, state: EditorState.create({
      doc: initial.current.replace(/\r\n?/g, "\n"),
      extensions: [raw, history(), invertedEffects.of((transaction) => transaction.docChanged ? [restoreRaw.of(transaction.startState.field(raw))] : []),
        keymap.of([...defaultKeymap, ...historyKeymap]), lineNumbers(), markdown({ pasteURLAsLink: false }), EditorView.lineWrapping,
        settings.current.of(accessibility()), EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.field(raw));
        })]
    }) });
    view.current = editor;
    callbacks.current.onMount({ read: () => editor.state.field(raw), composing: () => editor.composing });
    return () => { view.current = null; editor.destroy(); };
  }, []);
  useLayoutEffect(() => { view.current?.dispatch({ effects: settings.current.reconfigure(accessibility()) }); }, [readOnly, label, describedBy, invalid]);
  return <div className="fb-source-editor" ref={host} />;
}
