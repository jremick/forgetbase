import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, resolve } from "node:path";

type ManifestChunk = {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  src?: string;
};

const root = process.cwd();
const distDir = resolve(root, "apps/web/dist");
const manifestPath = join(distDir, ".vite/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, ManifestChunk>;
const entryKey = Object.entries(manifest).find(([, chunk]) => chunk.isEntry)?.[0];

if (!entryKey) {
  throw new Error("Web bundle manifest does not contain an entry chunk");
}

const entry = manifest[entryKey];
const adminKey = entry?.dynamicImports?.find((key) => key.endsWith("/AdminSurface.tsx") || key === "src/AdminSurface.tsx")
  ?? Object.entries(manifest).find(([key, chunk]) =>
    chunk.isDynamicEntry && (key.endsWith("/AdminSurface.tsx") || chunk.src?.endsWith("/AdminSurface.tsx"))
  )?.[0];

if (!entry || !adminKey || !manifest[adminKey]) {
  throw new Error("Web bundle manifest does not preserve the lazy AdminSurface boundary");
}

function collectStaticGraph(startKey: string): Set<string> {
  const files = new Set<string>();
  const pending = [startKey];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || visited.has(key)) continue;
    visited.add(key);

    const chunk = manifest[key];
    if (!chunk) throw new Error(`Manifest references missing chunk: ${key}`);
    if (chunk.file.endsWith(".js")) files.add(chunk.file);
    pending.push(...(chunk.imports ?? []));
  }

  return files;
}

function javascriptFiles(): Set<string> {
  return new Set(
    readdirSync(join(distDir, "assets"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => `assets/${entry.name}`)
  );
}

function measure(files: Set<string>): { raw: number; gzip: number } {
  let raw = 0;
  let gzip = 0;

  for (const file of files) {
    const source = readFileSync(join(distDir, file));
    raw += source.byteLength;
    gzip += gzipSync(source, { level: 9 }).byteLength;
  }

  return { raw, gzip };
}

function assertBudget(label: string, actual: { raw: number; gzip: number }, maximum: { raw: number; gzip: number }): void {
  const failures = [
    actual.raw > maximum.raw ? `raw ${actual.raw} > ${maximum.raw}` : null,
    actual.gzip > maximum.gzip ? `gzip ${actual.gzip} > ${maximum.gzip}` : null
  ].filter(Boolean);

  if (failures.length > 0) {
    throw new Error(`${label} exceeds its bundle budget: ${failures.join(", ")}`);
  }
}

const initialFiles = collectStaticGraph(entryKey);
const adminFiles = collectStaticGraph(adminKey);
const incrementalAdminFiles = new Set([...adminFiles].filter((file) => !initialFiles.has(file)));
const editorKey = Object.entries(manifest).find(([key, chunk]) =>
  key.endsWith("/components/editor/markdown-editor.tsx") || chunk.src?.endsWith("/components/editor/markdown-editor.tsx")
)?.[0];
const editorFiles = editorKey ? collectStaticGraph(editorKey) : new Set<string>();
const incrementalEditorFiles = new Set([...editorFiles].filter((file) => !initialFiles.has(file) && !adminFiles.has(file)));
if (editorKey && (initialFiles.has(manifest[editorKey]!.file) || adminFiles.has(manifest[editorKey]!.file))) {
  throw new Error("The editor must load only across its authoring dynamic import boundary");
}
const authoring = measure(incrementalEditorFiles);
const allFiles = javascriptFiles();
const initial = measure(initialFiles);
const admin = measure(incrementalAdminFiles);
const all = measure(allFiles);

assertBudget("Initial reader graph", initial, { raw: 650_000, gzip: 185_000 });
assertBudget("Lazy admin graph", admin, { raw: 300_000, gzip: 80_000 });
assertBudget("Incremental authoring graph", authoring, { raw: 1_500_000, gzip: 500_000 });
assertBudget("All web JavaScript", all, { raw: 3_600_000, gzip: 1_200_000 });

const initialSource = [...initialFiles].map((file) => readFileSync(join(distDir, file), "utf8")).join("\n");
const adminSource = [...incrementalAdminFiles].map((file) => readFileSync(join(distDir, file), "utf8")).join("\n");
const adminMarkers = ["Manage ForgetBase", "/admin/managed-query-policy", "admin-side-nav"];
const editorSource = [...editorFiles].map((file) => readFileSync(join(distDir, file), "utf8")).join("\n");
for (const marker of ["mdxeditor-root-contenteditable", "fb-source-editor"]) {
  if (initialSource.includes(marker) || adminSource.includes(marker)) {
    throw new Error(`Reader or administration eagerly includes editor code: ${marker}`);
  }
  if (editorKey && !editorSource.includes(marker)) {
    throw new Error(`Authoring graph is missing expected editor marker: ${marker}`);
  }
}


for (const marker of adminMarkers) {
  if (initialSource.includes(marker)) {
    throw new Error(`Initial reader graph contains admin-only marker: ${marker}`);
  }
  if (!adminSource.includes(marker)) {
    throw new Error(`Lazy admin graph is missing expected marker: ${marker}`);
  }
}

const format = (bytes: number) => `${(bytes / 1_000).toFixed(2)} kB`;
console.log([
  `Web bundle budget OK (${relative(root, manifestPath)})`,
  `initial reader: ${format(initial.raw)} raw / ${format(initial.gzip)} gzip`,
  `lazy admin: ${format(admin.raw)} raw / ${format(admin.gzip)} gzip`,
  `incremental authoring: ${format(authoring.raw)} raw / ${format(authoring.gzip)} gzip${editorKey ? "" : " (disabled)"}`,
  `all JavaScript: ${format(all.raw)} raw / ${format(all.gzip)} gzip`
].join("\n"));
