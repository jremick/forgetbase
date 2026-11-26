import { randomBytes } from "node:crypto";
import { lstat, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "work/bootstrap");
await mkdir(directory, { recursive: true, mode: 0o700 });
const parent = await lstat(directory);
if (!parent.isDirectory() || (process.getuid && (parent.uid !== process.getuid() || (parent.mode & 0o077) !== 0))) {
  throw new Error("Use a private directory owned by the operator (mode 0700).");
}

const path = join(directory, "token");
const file = await open(path, "wx", 0o400);
try {
  await file.writeFile(randomBytes(32).toString("base64url"));
  // Compose mounts just this file. The host directory restricts access to its owner.
  await file.chmod(0o444);
} finally {
  await file.close();
}
console.log(`Created bootstrap token file at ${path}`);
