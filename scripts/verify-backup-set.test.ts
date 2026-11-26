import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("accepts pending backup records with or without bytes and still checks active and present blobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "forgetbase-backup-reservations-"));
  try {
    const tree = join(root, "tree");
    await mkdir(join(tree, "aa"), { recursive: true });
    const present = "aa/11111111-2222-4333-8444-555555555555";
    const absent = "aa/11111111-2222-4333-8444-666666666666";
    const content = "stored bytes";
    await writeFile(join(tree, present), content);
    const archive = join(root, "attachments.tar");
    expect(spawnSync("tar", ["-cf", archive, "-C", tree, "aa"]).status).toBe(0);
    const database = join(root, "database.dump");
    await writeFile(database, "synthetic database fixture");
    const digest = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      format: "forgetbase-backup-set-v1", consistency: "writers-stopped",
      files: { database: { sha256: digest(await readFile(database)) }, attachments: { sha256: digest(await readFile(archive)) } }
    }));

    // Replace only Compose/PostgreSQL. Exercise the shipped manifest, archive,
    // lifecycle, checksum and orphan checks against real files.
    await writeFile(join(root, "docker"), `#!/bin/sh
case "$*" in
  *"SELECT storage_key, content_sha256, size_bytes, lifecycle_state FROM attachments"*) cat "$TEST_BACKUP_DB_ROWS" ;;
  *"SELECT storage_key"*) exit 1 ;;
esac
`, { mode: 0o700 });
    const records = join(root, "db-rows");
    const verify = async (absentState: string, expectedDigest: string) => {
      await writeFile(records, [
        [present, expectedDigest, content.length, "pending"].join("\t"),
        [absent, digest("absent"), 6, absentState].join("\t")
      ].join("\n") + "\n");
      return spawnSync("bash", ["scripts/verify-backup-set.sh", root], {
        encoding: "utf8", env: { ...process.env, PATH: `${root}:${process.env.PATH}`, TEST_BACKUP_DB_ROWS: records }
      });
    };
    const valid = await verify("pending", digest(content));
    expect(valid.status, valid.stderr).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({ verified: true, verifiedAttachmentCount: 1 });
    expect((await verify("active", digest(content))).stderr).toContain("missing a referenced attachment blob");
    expect((await verify("pending", digest("different bytes"))).stderr).toContain("integrity mismatch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
