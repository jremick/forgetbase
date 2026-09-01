import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATTACHMENT_STORAGE_KEY_PATTERN,
  AttachmentStorageLimitError,
  LocalFilesystemAttachmentStorage,
  UnsafeAttachmentStoragePathError,
  UnsafeAttachmentStorageRootError,
  generateAttachmentStorageKey
} from "./attachment-storage.js";

const STORAGE_KEY = "ab/11111111-2222-4333-8444-555555555555";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "forgetbase-attachments-"));
  temporaryDirectories.push(directory);
  return join(directory, "storage");
}

describe("LocalFilesystemAttachmentStorage", () => {
  it("rejects filesystem and broad application roots", () => {
    for (const root of ["/", "/app", "/var", "/var/lib", "/var/lib/forgetbase"]) {
      expect(() => new LocalFilesystemAttachmentStorage(root, 16))
        .toThrow(UnsafeAttachmentStorageRootError);
    }
  });

  it("generates opaque keys and round-trips bounded content", async () => {
    const storage = new LocalFilesystemAttachmentStorage(await temporaryRoot(), 16);
    const key = generateAttachmentStorageKey();

    expect(key).toMatch(ATTACHMENT_STORAGE_KEY_PATTERN);
    await storage.put(key, Buffer.from("safe bytes"));
    await expect(storage.get(key)).resolves.toEqual(Buffer.from("safe bytes"));
    await expect(storage.delete(key)).resolves.toBe(true);
    await expect(storage.delete(key)).resolves.toBe(false);
  });

  it("uses exclusive creation and never overwrites an existing object", async () => {
    const storage = new LocalFilesystemAttachmentStorage(await temporaryRoot(), 16);
    await storage.put(STORAGE_KEY, Buffer.from("first"));

    await expect(storage.put(STORAGE_KEY, Buffer.from("second")))
      .rejects.toMatchObject({ code: "EEXIST" });
    await expect(storage.get(STORAGE_KEY)).resolves.toEqual(Buffer.from("first"));
  });

  it("publishes complete files atomically and inventories only opaque storage keys", async () => {
    const root = await temporaryRoot();
    const storage = new LocalFilesystemAttachmentStorage(root, 16);
    await storage.put(STORAGE_KEY, Buffer.from("complete"));
    await writeFile(join(root, "unexpected"), "ignored");

    await expect(storage.inventory()).resolves.toEqual({
      storageKeys: [STORAGE_KEY],
      unexpectedEntryCount: 1
    });
  });

  it("rejects traversal and non-generated keys before filesystem access", async () => {
    const storage = new LocalFilesystemAttachmentStorage(await temporaryRoot(), 16);

    await expect(storage.put("../private.txt", Buffer.from("bad")))
      .rejects.toBeInstanceOf(UnsafeAttachmentStoragePathError);
    await expect(storage.get("ab/not-a-generated-id"))
      .rejects.toBeInstanceOf(UnsafeAttachmentStoragePathError);
  });

  it("rejects oversized writes and oversized files on read", async () => {
    const root = await temporaryRoot();
    const storage = new LocalFilesystemAttachmentStorage(root, 4);
    await expect(storage.put(STORAGE_KEY, Buffer.from("12345")))
      .rejects.toBeInstanceOf(AttachmentStorageLimitError);

    await mkdir(join(root, "ab"), { recursive: true });
    await writeFile(join(root, STORAGE_KEY), "12345", { flag: "wx" });
    await expect(storage.get(STORAGE_KEY))
      .rejects.toBeInstanceOf(AttachmentStorageLimitError);
  });

  it("rejects symlinked shard directories and file entries", async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(root, "ab"));
    const storage = new LocalFilesystemAttachmentStorage(root, 16);

    await expect(storage.put(STORAGE_KEY, Buffer.from("bad")))
      .rejects.toBeInstanceOf(UnsafeAttachmentStoragePathError);

    await rm(join(root, "ab"));
    await mkdir(join(root, "ab"));
    await writeFile(join(outside, "target"), "secret");
    await symlink(join(outside, "target"), join(root, STORAGE_KEY));
    await expect(storage.get(STORAGE_KEY))
      .rejects.toBeInstanceOf(UnsafeAttachmentStoragePathError);
    await expect(storage.delete(STORAGE_KEY))
      .rejects.toBeInstanceOf(UnsafeAttachmentStoragePathError);
  });
});
