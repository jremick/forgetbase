import { mkdir, chown } from "node:fs/promises";

// Railway volumes initially belong to root. Initialize only this application
// directory, then drop privileges before importing any database or API code.
if (process.getuid?.() === 0) {
  const storageRoot = process.env.FORGETBASE_ATTACHMENT_STORAGE_ROOT;
  if (storageRoot !== "/var/lib/forgetbase/attachments") {
    throw new Error("Root initialization requires the declared attachment volume path");
  }
  await mkdir(storageRoot, { recursive: true, mode: 0o700 });
  await chown(storageRoot, 1000, 1000);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
if (process.getuid?.() !== 1000) throw new Error("The Railway API must run as the node user");

await import("../apps/api/dist/index.js");
