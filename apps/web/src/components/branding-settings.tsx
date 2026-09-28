import type { Branding } from "@forgetbase/schema";
import { brandingLogoMaxBytes, brandingLogoMaxDimension, defaultBranding } from "@forgetbase/schema/branding-defaults";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppRequest } from "../lib/app-api.js";
import type { NavigationBlocker } from "../lib/app-navigation.js";
import { Brand } from "./brand.js";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import { Alert, AlertDescription } from "./ui/alert.js";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog.js";

type Props = {
  request: AppRequest;
  onSaved: (branding: Branding) => void;
  onBlockerChange: (blocker: NavigationBlocker | null) => void;
};
export function BrandingSettings({ request, onSaved, onBlockerChange }: Props) {
  const [saved, setSaved] = useState<Branding | null>(null);
  const [draft, setDraft] = useState(defaultBranding);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileEpoch = useRef(0);
  const dirty = saved !== null && (draft.displayName !== saved.displayName || draft.logoDataUrl !== saved.logoDataUrl);
  const pendingChanges = dirty || busy || reading;

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void request<Branding>("/admin/branding", { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setSaved(value); setDraft(value);
    }).catch(() => { if (!controller.signal.aborted) setError("Branding could not be loaded. Retry before making changes."); });
    return () => { controller.abort(); fileEpoch.current++; };
  }, [request, reload]);

  useEffect(() => {
    onBlockerChange(pendingChanges ? (proceed) => { pending.current = proceed; setLeaving(true); } : null);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (pendingChanges) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { onBlockerChange(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [pendingChanges, onBlockerChange]);

  function replaceDraft(value: Branding) {
    fileEpoch.current++;
    setReading(false); setDraft(value); setError(""); setNotice("");
    if (fileInput.current) fileInput.current.value = "";
  }
  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    const generation = ++fileEpoch.current;
    setError(""); setNotice("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > brandingLogoMaxBytes) {
      setError("Choose a PNG, JPEG or WebP image up to 256 KB.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setReading(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = objectUrl;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > brandingLogoMaxDimension || image.naturalHeight > brandingLogoMaxDimension) throw new Error("dimensions");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (generation === fileEpoch.current) setDraft(current => ({ ...current, logoDataUrl: dataUrl }));
    } catch {
      if (generation === fileEpoch.current) setError("This image could not be read. Use a static image up to 2048 pixels per side.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (generation === fileEpoch.current) { setReading(false); if (fileInput.current) fileInput.current.value = ""; }
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || reading || !saved) return;
    const input = { ...draft, displayName: draft.displayName.trim() };
    if (!input.displayName || input.displayName.length > 64 || /[\u0000-\u001f\u007f]/.test(input.displayName)) { setError("Enter logo text from 1 to 64 characters on a single line."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await request<Branding>("/admin/branding", { method: "PUT", body: JSON.stringify(input) });
      setSaved(value); setDraft(value); onSaved(value); setNotice("Branding saved.");
    } catch {
      // A lost response can follow a committed save. Read back before inviting a retry.
      try {
        const actual = await request<Branding>("/admin/branding");
        setSaved(actual); onSaved(actual);
        if (actual.displayName === input.displayName && actual.logoDataUrl === input.logoDataUrl) {
          setDraft(actual); setNotice("Branding saved.");
        } else setError("Branding was not saved. Check the image format and try again.");
      } catch { setError("The save result could not be confirmed. Reload settings to check before trying again."); }
    } finally { setBusy(false); }
  }
  return <section aria-labelledby="branding-title" className="branding-settings">
    <div><h2 id="branding-title">Branding</h2><p>Set the logo and text shown on the login, reader, and admin screens. These are visible before login.</p></div>
    {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <p role="status" className="branding-notice">{notice}</p> : null}
    {!saved ? <div><p>{error ? "Settings unavailable." : "Loading branding…"}</p>{error ? <Button type="button" onClick={() => setReload(value => value + 1)}>Retry</Button> : null}</div> :
      <form onSubmit={(event) => void save(event)} className="branding-form">
        <fieldset disabled={busy || reading} className="branding-fields">
          <div className="branding-field"><Label htmlFor="branding-name">Logo text</Label><Input id="branding-name" value={draft.displayName} maxLength={64} required
            onChange={(event) => { setDraft(current => ({ ...current, displayName: event.target.value })); setNotice(""); }} aria-describedby="branding-name-help" />
            <p id="branding-name-help">Up to 64 characters.</p></div>
          <div className="branding-field"><Label htmlFor="branding-logo">Logo image</Label><Input ref={fileInput} id="branding-logo" type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(event) => void chooseLogo(event.target.files?.[0])} aria-describedby="branding-logo-help" />
            <p id="branding-logo-help">Static PNG, JPEG or WebP. Up to 256 KB and 2048 pixels per side. Transparent images are supported.</p>
            {draft.logoDataUrl ? <Button type="button" variant="ghost" onClick={() => replaceDraft({ ...draft, logoDataUrl: null })}>Use default image</Button> : null}</div>
        </fieldset>
        <div className="branding-preview" aria-label="Branding preview"><p>Preview</p><div className="brand"><Brand branding={{ ...draft, displayName: draft.displayName || "Logo text" }} /></div><p>Changes appear after you save.</p></div>
        <div className="branding-actions">
          <Button type="submit" variant="primary" disabled={!dirty || busy || reading || !draft.displayName.trim()}>{busy ? "Saving…" : reading ? "Reading image…" : "Save"}</Button>
          <Button type="button" disabled={!dirty || busy} onClick={() => replaceDraft(saved)}>Cancel</Button>
          <Button type="button" variant="ghost" disabled={busy || reading} onClick={() => replaceDraft(defaultBranding)}>Restore defaults</Button>
        </div>
      </form>}
    <AlertDialog open={leaving} onOpenChange={setLeaving}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard branding changes?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><Button type="button" variant="danger" disabled={busy || reading} onClick={() => {
          const proceed = pending.current; pending.current = null; setLeaving(false); if (saved) replaceDraft(saved); proceed?.();
        }}>Discard changes</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
