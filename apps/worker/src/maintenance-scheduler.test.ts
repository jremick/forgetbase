import { expect, it, vi } from "vitest";
import { buildMaintenanceJobDefinitions } from "./index.js";
import type { WorkerRuntime } from "./runtime.js";

it("maps all five maintenance jobs to their configured cadence and startup behavior", () => {
  const environment = {
    FORGETBASE_RETENTION_PURGE_ENABLED: "true",
    FORGETBASE_RETENTION_PURGE_INTERVAL_MS: "1001",
    FORGETBASE_RETENTION_PURGE_ON_START: "true",
    FORGETBASE_CACHE_PURGE_ENABLED: "true",
    FORGETBASE_CACHE_PURGE_INTERVAL_MS: "1002",
    FORGETBASE_CACHE_PURGE_ON_START: "false",
    FORGETBASE_API_KEY_ROTATION_REMINDERS_ENABLED: "true",
    FORGETBASE_API_KEY_ROTATION_REMINDERS_INTERVAL_MS: "1003",
    FORGETBASE_API_KEY_ROTATION_REMINDERS_ON_START: "true",
    FORGETBASE_MANAGED_QUERY_EVALS_ENABLED: "true",
    FORGETBASE_MANAGED_QUERY_EVALS_INTERVAL_MS: "1004",
    FORGETBASE_MANAGED_QUERY_EVALS_ON_START: "false",
    FORGETBASE_ACTION_APPROVAL_EXPIRY_ENABLED: "true",
    FORGETBASE_ACTION_APPROVAL_EXPIRY_INTERVAL_MS: "1005",
    FORGETBASE_ACTION_APPROVAL_EXPIRY_ON_START: "true"
  } as const;
  const previous = Object.fromEntries(
    Object.keys(environment).map((name) => [name, process.env[name]])
  );
  const runtime: WorkerRuntime = {
    getPool: vi.fn(() => Promise.reject(new Error("not used"))),
    close: vi.fn(() => Promise.resolve())
  };

  try {
    Object.assign(process.env, environment);
    const definitions = buildMaintenanceJobDefinitions(runtime);

    expect(definitions.map(({ name, intervalMs, runOnStart }) => ({ name, intervalMs, runOnStart }))).toEqual([
      { name: "telemetry-retention", intervalMs: 1001, runOnStart: true },
      { name: "managed-query-cache-purge", intervalMs: 1002, runOnStart: false },
      { name: "api-key-rotation-reminders", intervalMs: 1003, runOnStart: true },
      { name: "managed-query-eval-schedule", intervalMs: 1004, runOnStart: false },
      { name: "action-approval-expiry", intervalMs: 1005, runOnStart: true }
    ]);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});
