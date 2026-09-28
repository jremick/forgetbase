import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import {
  availableUpdateSchema,
  recoveryPointSchema,
  updateJobSchema,
  type AvailableUpdate,
  type RecoveryPoint,
  type UpdateJob
} from "@forgetbase/schema";

export interface PersistedUpdateState {
  schemaVersion: "1";
  availableUpdate: AvailableUpdate | null;
  lastCheckedAt: string | null;
  feedStatus: "not-checked" | "available" | "current" | "unreachable" | "invalid" | "disabled";
  jobs: UpdateJob[];
  recoveryPoints: RecoveryPoint[];
}

export function emptyUpdateState(): PersistedUpdateState {
  return {
    schemaVersion: "1",
    availableUpdate: null,
    lastCheckedAt: null,
    feedStatus: "not-checked",
    jobs: [],
    recoveryPoints: []
  };
}

export class JsonUpdateStore {
  private ioTail: Promise<void> = Promise.resolve();

  constructor(private readonly statePath: string) {}

  get directory(): string { return dirname(this.statePath); }

  async read(): Promise<PersistedUpdateState> {
    return this.serialize(async () => {
      let contents: string;
      try {
        const file = await open(this.statePath, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const info = await file.stat();
          if (!info.isFile() || info.size > 4 * 1024 * 1024 || (info.mode & 0o077) !== 0 ||
              (process.getuid && info.uid !== process.getuid())) throw new Error("Updater ledger must be a private owned regular file within 4 MiB");
          contents = await file.readFile("utf8");
        } finally { await file.close(); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return emptyUpdateState();
        }

        throw error;
      }

      return parseState(JSON.parse(contents));
    });
  }

  async write(state: PersistedUpdateState): Promise<void> {
    const bounded = parseState(state);
    let contents = `${JSON.stringify(bounded, null, 2)}\n`;
    const terminal = new Set(["completed", "failed", "rolled-back", "cancelled", "denied", "expired"]);
    while (Buffer.byteLength(contents) > 4 * 1024 * 1024) {
      let removable = bounded.jobs.length - 1;
      while (removable >= 0 && !terminal.has(bounded.jobs[removable]!.phase)) removable--;
      if (removable < 0) throw new Error("Updater ledger exceeds 4 MiB; active requests and recovery points cannot be pruned");
      bounded.jobs.splice(removable, 1);
      contents = `${JSON.stringify(bounded, null, 2)}\n`;
    }
    await this.serialize(() => durableWriteFile(this.statePath, contents));
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.ioTail.then(operation);
    this.ioTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

/** Atomically replace a host control file and persist its contents and rename. */
export async function durableWriteFile(path: string, contents: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const parent = await lstat(dirname(path));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 ||
      (process.getuid && parent.uid !== process.getuid())) throw new Error("Host control files require a private owned directory");
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

  try {
    const file = await open(temporaryPath, "wx", mode);
    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, path);
    // Persist the rename as well as its file contents before acknowledging a
    // write boundary. Some filesystems do not implement directory fsync.
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync().catch((error: NodeJS.ErrnoException) => {
        if (!["EINVAL", "ENOTSUP", "EOPNOTSUPP"].includes(error.code ?? "")) throw error;
      });
    } finally {
      await directory.close();
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function parseState(value: unknown): PersistedUpdateState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid updater state");
  const parsed = value as Record<string, unknown>;
  if (parsed.schemaVersion !== "1") throw new Error("Unsupported updater state schema");
  if (!Array.isArray(parsed.jobs) || !Array.isArray(parsed.recoveryPoints)) throw new Error("Invalid updater state ledger");
  if (parsed.lastCheckedAt !== null && (typeof parsed.lastCheckedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(parsed.lastCheckedAt) ||
    !Number.isFinite(Date.parse(parsed.lastCheckedAt)))) throw new Error("Invalid updater state timestamp");
  if (typeof parsed.feedStatus !== "string" ||
    !["not-checked", "available", "current", "unreachable", "invalid", "disabled"].includes(parsed.feedStatus)) {
    throw new Error("Invalid updater feed status");
  }
  const jobs = parsed.jobs.map((job) => updateJobSchema.parse(job));
  const recoveryPoints = parsed.recoveryPoints.map((point) => recoveryPointSchema.parse(point));
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length ||
    new Set(recoveryPoints.map((point) => point.id)).size !== recoveryPoints.length) {
    throw new Error("Duplicate updater ledger identifier");
  }
  return {
    schemaVersion: "1",
    availableUpdate: parsed.availableUpdate === null ? null : availableUpdateSchema.parse(parsed.availableUpdate),
    lastCheckedAt: parsed.lastCheckedAt as string | null,
    feedStatus: parsed.feedStatus as PersistedUpdateState["feedStatus"],
    jobs,
    recoveryPoints
  };
}
