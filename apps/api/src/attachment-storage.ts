import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  link,
  mkdir,
  open,
  readdir,
  realpath,
  unlink,
  type FileHandle
} from "node:fs/promises";
import { dirname, parse, relative, resolve, sep } from "node:path";

export const ATTACHMENT_STORAGE_KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AttachmentStorageAdapter {
  put(storageKey: string, content: Uint8Array): Promise<void>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<boolean>;
  inventory?(): Promise<AttachmentStorageInventory>;
}

export interface AttachmentStorageInventory {
  storageKeys: string[];
  unexpectedEntryCount: number;
}

export function generateAttachmentStorageKey(): string {
  const id = randomUUID();
  return `${id.slice(0, 2)}/${id}`;
}

export class AttachmentStorageLimitError extends Error {
  constructor(maxBytes: number) {
    super(`Attachment exceeds the configured ${maxBytes}-byte storage limit.`);
    this.name = "AttachmentStorageLimitError";
  }
}

export class UnsafeAttachmentStoragePathError extends Error {
  constructor() {
    super("Attachment storage path is unsafe.");
    this.name = "UnsafeAttachmentStoragePathError";
  }
}

export class UnsafeAttachmentStorageRootError extends Error {
  constructor() {
    super("Attachment storage root is too broad.");
    this.name = "UnsafeAttachmentStorageRootError";
  }
}

export class LocalFilesystemAttachmentStorage implements AttachmentStorageAdapter {
  private readonly root: string;

  constructor(root: string, private readonly maxBytes: number) {
    if (!root.trim()) {
      throw new Error("Attachment storage root must not be empty.");
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new Error("Attachment storage maxBytes must be a positive safe integer.");
    }

    const resolvedRoot = resolve(root);
    const unsafeRoots = new Set([
      parse(resolvedRoot).root,
      "/app",
      "/etc",
      "/home",
      "/opt",
      "/root",
      "/tmp",
      "/usr",
      "/var",
      "/var/lib",
      "/var/lib/forgetbase"
    ]);
    if (unsafeRoots.has(resolvedRoot)) {
      throw new UnsafeAttachmentStorageRootError();
    }

    this.root = resolvedRoot;
  }

  async put(storageKey: string, content: Uint8Array): Promise<void> {
    if (content.byteLength > this.maxBytes) {
      throw new AttachmentStorageLimitError(this.maxBytes);
    }

    const root = await this.ensureSafeRoot();
    const target = this.resolveStoragePath(root, storageKey);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await this.assertSafeDirectory(dirname(target), root);

    const temporaryTarget = resolve(dirname(target), `.${randomUUID()}.tmp`);

    const handle = await open(
      temporaryTarget,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(),
      0o600
    ).catch((error: unknown) => {
      if (errorCode(error) === "ELOOP") {
        throw new UnsafeAttachmentStoragePathError();
      }
      throw error;
    });

    try {
      await handle.writeFile(content);
      await handle.sync();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporaryTarget).catch(() => undefined);
      throw error;
    }

    await handle.close();
    try {
      await link(temporaryTarget, target);
    } catch (error) {
      await unlink(temporaryTarget).catch(() => undefined);
      throw error;
    }
    await unlink(temporaryTarget);
    await syncDirectory(dirname(target));
  }

  async get(storageKey: string): Promise<Buffer> {
    const root = await this.ensureSafeRoot();
    const target = this.resolveStoragePath(root, storageKey);
    await this.assertSafeDirectory(dirname(target), root);
    const handle = await open(target, constants.O_RDONLY | noFollowFlag()).catch((error: unknown) => {
      if (errorCode(error) === "ELOOP") {
        throw new UnsafeAttachmentStoragePathError();
      }
      throw error;
    });

    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        throw new UnsafeAttachmentStoragePathError();
      }
      if (stats.size > this.maxBytes) {
        throw new AttachmentStorageLimitError(this.maxBytes);
      }

      return await readBoundedFile(handle, this.maxBytes);
    } finally {
      await handle.close();
    }
  }

  async delete(storageKey: string): Promise<boolean> {
    const root = await this.ensureSafeRoot();
    const target = this.resolveStoragePath(root, storageKey);
    await this.assertSafeDirectory(dirname(target), root);
    const stats = await lstat(target).catch((error: unknown) => {
      if (errorCode(error) === "ENOENT") {
        return null;
      }
      throw error;
    });

    if (!stats) {
      return false;
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new UnsafeAttachmentStoragePathError();
    }

    await unlink(target);
    return true;
  }

  async inventory(): Promise<AttachmentStorageInventory> {
    const root = await this.ensureSafeRoot();
    const storageKeys: string[] = [];
    let unexpectedEntryCount = 0;
    const rootEntries = await readdir(root, { withFileTypes: true });

    for (const rootEntry of rootEntries) {
      if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink() || !/^[0-9a-f]{2}$/.test(rootEntry.name)) {
        unexpectedEntryCount += 1;
        continue;
      }
      const shardPath = resolve(root, rootEntry.name);
      await this.assertSafeDirectory(shardPath, root);
      for (const entry of await readdir(shardPath, { withFileTypes: true })) {
        const storageKey = `${rootEntry.name}/${entry.name}`;
        if (!entry.isFile() || entry.isSymbolicLink() || !ATTACHMENT_STORAGE_KEY_PATTERN.test(storageKey)) {
          unexpectedEntryCount += 1;
          continue;
        }
        storageKeys.push(storageKey);
      }
    }

    storageKeys.sort();
    return { storageKeys, unexpectedEntryCount };
  }

  private async ensureSafeRoot(): Promise<string> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const rootStats = await lstat(this.root);
    if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
      throw new UnsafeAttachmentStoragePathError();
    }

    const canonicalRoot = await realpath(this.root);
    return canonicalRoot;
  }

  private resolveStoragePath(root: string, storageKey: string): string {
    if (!ATTACHMENT_STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new UnsafeAttachmentStoragePathError();
    }

    const target = resolve(root, storageKey);
    const pathFromRoot = relative(root, target);
    if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === ".." || resolve(root, pathFromRoot) !== target) {
      throw new UnsafeAttachmentStoragePathError();
    }
    return target;
  }

  private async assertSafeDirectory(directory: string, root: string): Promise<void> {
    const directoryFromRoot = relative(root, directory);
    if (!directoryFromRoot || directoryFromRoot.startsWith(`..${sep}`) || directoryFromRoot === "..") {
      throw new UnsafeAttachmentStoragePathError();
    }

    const stats = await lstat(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new UnsafeAttachmentStoragePathError();
    }
    const canonicalDirectory = await realpath(directory);
    if (canonicalDirectory !== directory) {
      throw new UnsafeAttachmentStoragePathError();
    }
  }
}

function noFollowFlag(): number {
  return "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
}

async function readBoundedFile(handle: FileHandle, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (totalBytes < maxBytes) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - totalBytes));
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, totalBytes);
    if (bytesRead === 0) {
      return Buffer.concat(chunks, totalBytes);
    }

    chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    totalBytes += bytesRead;
  }

  const probe = Buffer.allocUnsafe(1);
  const { bytesRead } = await handle.read(probe, 0, 1, totalBytes);
  if (bytesRead > 0) {
    throw new AttachmentStorageLimitError(maxBytes);
  }
  return Buffer.concat(chunks, totalBytes);
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try {
    await handle.sync().catch(() => undefined);
  } finally {
    await handle.close();
  }
}
