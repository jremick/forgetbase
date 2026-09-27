import { cp, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageRoot, "src/native/keychain.swift");
const nativeOutput = resolve(packageRoot, "dist/native");

await mkdir(nativeOutput, { recursive: true });
await cp(source, resolve(nativeOutput, "keychain.swift"));

if (process.platform === "darwin") {
  await run("/usr/bin/swiftc", [
    source,
    "-O",
    "-o",
    resolve(nativeOutput, "forgetbase-keychain")
  ]);
}

async function run(executable, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Native helper build failed with exit code ${code ?? "unknown"}`));
    });
  });
}
