import { createPool, runMigrations } from "@forgetbase/db";

export type WorkerPool = ReturnType<typeof createPool>;

export interface WorkerRuntime {
  getPool(): Promise<WorkerPool>;
  close(): Promise<void>;
}

interface WorkerRuntimeDependencies {
  createPool: () => WorkerPool;
  runMigrations: (pool: WorkerPool) => Promise<unknown>;
}

export function createWorkerRuntime(
  dependencies: WorkerRuntimeDependencies = { createPool, runMigrations }
): WorkerRuntime {
  let pool: WorkerPool | undefined;
  let ready: Promise<WorkerPool> | undefined;
  let closed = false;

  return {
    getPool() {
      if (closed) {
        return Promise.reject(new Error("Worker runtime is closed."));
      }

      if (!ready) {
        pool = dependencies.createPool();
        ready = dependencies.runMigrations(pool)
          .then(() => pool as WorkerPool)
          .catch(async (error: unknown) => {
            await pool?.end();
            throw error;
          });
      }

      return ready;
    },

    async close() {
      if (closed) {
        return;
      }

      closed = true;

      if (ready) {
        try {
          await ready;
        } catch {
          return;
        }
      }

      await pool?.end();
    }
  };
}

export interface ScheduledJobDefinition {
  name: string;
  intervalMs: number;
  runOnStart: boolean;
  scheduleMessage: string;
  overlapMessage: string;
  failureMessage: string;
  run(): Promise<void>;
}

export interface ScheduledJobsController {
  readonly jobNames: string[];
  trigger(name: string): boolean;
  stop(): Promise<void>;
}

export function startScheduledJobs(
  definitions: ScheduledJobDefinition[]
): ScheduledJobsController {
  const definitionsByName = new Map(definitions.map((definition) => [definition.name, definition]));
  const activeRuns = new Map<string, Promise<void>>();
  const timers: Array<ReturnType<typeof setInterval>> = [];
  let stopped = false;

  const trigger = (name: string): boolean => {
    const definition = definitionsByName.get(name);

    if (!definition || stopped) {
      return false;
    }

    if (activeRuns.has(name)) {
      console.log(definition.overlapMessage);
      return false;
    }

    const run = Promise.resolve()
      .then(definition.run)
      .catch((error: unknown) => {
        console.error(definition.failureMessage, error);
      })
      .finally(() => {
        if (activeRuns.get(name) === run) {
          activeRuns.delete(name);
        }
      });
    activeRuns.set(name, run);
    return true;
  };

  for (const definition of definitions) {
    console.log(definition.scheduleMessage);
    timers.push(setInterval(() => {
      trigger(definition.name);
    }, definition.intervalMs));

    if (definition.runOnStart) {
      trigger(definition.name);
    }
  }

  return {
    jobNames: definitions.map((definition) => definition.name),
    trigger,
    async stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      timers.forEach(clearInterval);
      await Promise.allSettled(activeRuns.values());
    }
  };
}

export async function withWorkerRuntime<T>(
  runtime: WorkerRuntime | undefined,
  use: (runtime: WorkerRuntime, pool: WorkerPool) => Promise<T>
): Promise<T> {
  const activeRuntime = runtime ?? createWorkerRuntime();

  try {
    return await use(activeRuntime, await activeRuntime.getPool());
  } finally {
    if (!runtime) {
      await activeRuntime.close();
    }
  }
}
