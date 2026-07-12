import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerRuntime, startScheduledJobs, type WorkerPool } from "./runtime.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("worker runtime", () => {
  it("creates one pool, runs migrations once, and closes the shared pool once", async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) } as unknown as WorkerPool;
    const createPool = vi.fn(() => pool);
    const runMigrations = vi.fn().mockResolvedValue({ applied: [] });
    const runtime = createWorkerRuntime({ createPool, runMigrations });

    const [first, second] = await Promise.all([runtime.getPool(), runtime.getPool()]);

    expect(first).toBe(pool);
    expect(second).toBe(pool);
    expect(createPool).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledWith(pool);

    await runtime.close();
    await runtime.close();

    expect(pool.end).toHaveBeenCalledTimes(1);
    await expect(runtime.getPool()).rejects.toThrow("Worker runtime is closed.");
  });

  it("closes the pool when startup migration fails", async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) } as unknown as WorkerPool;
    const runtime = createWorkerRuntime({
      createPool: () => pool,
      runMigrations: vi.fn().mockRejectedValue(new Error("migration failed"))
    });

    await expect(runtime.getPool()).rejects.toThrow("migration failed");
    await runtime.close();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

describe("scheduled worker jobs", () => {
  it("keeps cadence, skips overlapping same-process runs, and stops cleanly", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let releaseRun: (() => void) | undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => {
      releaseRun = resolve;
    }));
    const controller = startScheduledJobs([{
      name: "maintenance",
      intervalMs: 1_000,
      runOnStart: true,
      scheduleMessage: "scheduled",
      overlapMessage: "overlap",
      failureMessage: "failed",
      run
    }]);

    await Promise.resolve();
    expect(controller.jobNames).toEqual(["maintenance"]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(controller.trigger("maintenance")).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith("overlap");

    let stopped = false;
    const stop = controller.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    releaseRun?.();
    await stop;
    expect(stopped).toBe(true);
    expect(controller.trigger("maintenance")).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("isolates failures so later ticks still run", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("first run failed"))
      .mockResolvedValue(undefined);
    const controller = startScheduledJobs([{
      name: "maintenance",
      intervalMs: 500,
      runOnStart: true,
      scheduleMessage: "scheduled",
      overlapMessage: "overlap",
      failureMessage: "failed",
      run
    }]);

    await vi.advanceTimersByTimeAsync(0);
    expect(console.error).toHaveBeenCalledWith("failed", expect.any(Error));

    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(2);
    await controller.stop();
  });
});
