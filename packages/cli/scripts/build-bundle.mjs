import { cp, chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const outputDirectory = resolve(packageRoot, "bundle");
const outputFile = resolve(outputDirectory, "forgetbase.mjs");

await mkdir(resolve(outputDirectory, "native"), { recursive: true });
await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  target: "node22.13",
  format: "esm",
  legalComments: "none",
  sourcemap: false
});
await chmod(outputFile, 0o755);
await cp(
  resolve(workspaceRoot, "packages/local-runtime/dist/native"),
  resolve(outputDirectory, "native"),
  { recursive: true, force: true }
);
await writeFile(resolve(outputDirectory, "README.txt"), [
  "ForgetBase Local private-pilot bundle",
  "",
  "Requires Node.js 22.13 or newer.",
  "macOS uses the bundled Keychain helper. Linux requires secret-tool and an available Secret Service.",
  "Run: ./forgetbase.mjs --help",
  ""
].join("\n"), "utf8");
