import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
  constructor(private readonly statePath: string) {}

  async read(): Promise<PersistedUpdateState> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as Record<string, unknown>;

      if (parsed.schemaVersion !== "1") {
        throw new Error("Unsupported updater state schema");
      }

      return {
        schemaVersion: "1",
        availableUpdate: parsed.availableUpdate === null ? null : availableUpdateSchema.parse(parsed.availableUpdate),
        lastCheckedAt: typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : null,
        feedStatus: readFeedStatus(parsed.feedStatus),
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs.map((job) => updateJobSchema.parse(job)) : [],
        recoveryPoints: Array.isArray(parsed.recoveryPoints)
          ? parsed.recoveryPoints.map((point) => recoveryPointSchema.parse(point))
          : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyUpdateState();
      }

      throw error;
    }
  }

  async write(state: PersistedUpdateState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.statePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

    try {
      await rename(temporaryPath, this.statePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}

function readFeedStatus(value: unknown): PersistedUpdateState["feedStatus"] {
  return ["not-checked", "available", "current", "unreachable", "invalid", "disabled"].includes(String(value))
    ? value as PersistedUpdateState["feedStatus"]
    : "not-checked";
}
