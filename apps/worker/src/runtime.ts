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
      if (process.env.FORGETBASE_INSTALLATION_MODE === "managed" && process.env.FORGETBASE_MANAGED_WRITES_ENABLED !== "true") {
        return Promise.reject(new Error("Managed update maintenance: worker writes are fenced."));
      }
      if (closed) {
        return Promise.reject(new Error("Worker runtime is closed."));
      }

      if (!ready) {
        pool = dependencies.createPool();
        ready = (process.env.FORGETBASE_AUTO_MIGRATE === "false"
          ? pool.query("SELECT 1 FROM schema_migrations LIMIT 1")
          : dependencies.runMigrations(pool))
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

export interface GracefulShutdownOptions {
  /** Work to drain before exit (stop schedulers, close pools). */
  drain(): Promise<void>;
  /** Hard deadline before forcing exit. Railway sends SIGKILL after its drain window. */
  timeoutMs?: number;
  log?: (message: string) => void;
  logError?: (message: string, error?: unknown) => void;
  exit?: (code: number) => void;
}

/**
 * Returns a signal handler that drains once, logs the received signal and the
 * exit code, and then exits explicitly: 0 after a clean drain, 1 when the drain
 * fails or exceeds its deadline. Exiting explicitly prevents lingering handles
 * from keeping the process alive until the platform SIGKILLs it (exit 137),
 * which Railway reports as a crashed deployment.
 */
export function createGracefulShutdown(options: GracefulShutdownOptions): (signal: NodeJS.Signals) => Promise<number> {
  const log = options.log ?? ((message: string) => console.log(message));
  const logError = options.logError ?? ((message: string, error?: unknown) => console.error(message, error));
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const timeoutMs = options.timeoutMs ?? 25_000;
  let pending: Promise<number> | undefined;

  return (signal) => {
    pending ??= (async () => {
      log(`ForgetBase worker received ${signal}; shutting down.`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
        timer.unref?.();
      });
      let code = 0;
      try {
        const outcome = await Promise.race([options.drain().then(() => "drained" as const), deadline]);
        if (outcome === "timeout") {
          logError(`ForgetBase worker shutdown exceeded ${timeoutMs}ms.`);
          code = 1;
        }
      } catch (error) {
        logError("ForgetBase worker shutdown failed.", error);
        code = 1;
      } finally {
        if (timer) clearTimeout(timer);
      }
      log(`ForgetBase worker shutdown complete (signal=${signal}, exitCode=${code}).`);
      exit(code);
      return code;
    })();
    return pending;
  };
}
