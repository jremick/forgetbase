import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { releaseManifestSchema, signedReleaseManifestSchema } from "../packages/schema/src/index.js";
import { canonicalJson } from "../packages/updater/src/manifest.js";

const inputPath = resolve(readArgument("--input"));
const outputPath = resolve(readArgument("--output"));
const keyId = readArgument("--key-id");
const privateKeyPath = resolve(readArgument("--private-key-file"));
const manifest = releaseManifestSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const privateKey = createPrivateKey(await readFile(privateKeyPath, "utf8"));
const signature = sign(null, Buffer.from(canonicalJson(manifest), "utf8"), privateKey).toString("base64");
const envelope = signedReleaseManifestSchema.parse({ keyId, signature, manifest });
const output = `${JSON.stringify(envelope, null, 2)}\n`;
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, { encoding: "utf8", mode: 0o644 });

console.log(JSON.stringify({
  outputPath,
  version: manifest.version,
  keyId,
  sha256: createHash("sha256").update(output).digest("hex")
}));

function readArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}
