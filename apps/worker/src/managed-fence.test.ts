import { afterEach, expect, it, vi } from "vitest";
import { createWorkerRuntime, type WorkerPool } from "./runtime.js";

afterEach(() => vi.unstubAllEnvs());
it.each([undefined, "false"])("refuses any managed worker DB work before explicit open (%s)", async (permission) => {
  vi.stubEnv("FORGETBASE_INSTALLATION_MODE", "managed");
  vi.stubEnv("FORGETBASE_MANAGED_WRITES_ENABLED", permission);
  const createPool = vi.fn(() => ({ end: vi.fn() }) as unknown as WorkerPool);
  const runMigrations = vi.fn().mockResolvedValue(undefined);
  const runtime = createWorkerRuntime({ createPool, runMigrations });
  await expect(runtime.getPool()).rejects.toThrow("Managed update maintenance");
  expect(createPool).not.toHaveBeenCalled();
  expect(runMigrations).not.toHaveBeenCalled();
  await runtime.close();
});
