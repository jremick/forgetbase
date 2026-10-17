import { expect, it, vi } from "vitest";
import { buildMaintenanceJobDefinitions, DEFAULT_ASSET_CHANGES_INTERVAL_MS } from "./index.js";
import { logScheduledAssetChangeMaintenance } from "./asset-changes.js";
import type { WorkerRuntime } from "./runtime.js";

it("maps maintenance jobs to their configured cadence and startup behavior", () => {
  const environment = {
    FORGETBASE_ASSET_CHANGES_ENABLED: "true",
    FORGETBASE_ASSET_CHANGES_INTERVAL_MS: "1000",
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
      { name: "asset-change-reconciliation", intervalMs: 1000, runOnStart: false },
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

it("sweeps asset changes every 60 seconds by default", () => {
  const previous = {
    enabled: process.env.FORGETBASE_ASSET_CHANGES_ENABLED,
    interval: process.env.FORGETBASE_ASSET_CHANGES_INTERVAL_MS
  };
  const runtime: WorkerRuntime = {
    getPool: vi.fn(() => Promise.reject(new Error("not used"))),
    close: vi.fn(() => Promise.resolve())
  };

  try {
    process.env.FORGETBASE_ASSET_CHANGES_ENABLED = "true";
    delete process.env.FORGETBASE_ASSET_CHANGES_INTERVAL_MS;
    const assetChanges = buildMaintenanceJobDefinitions(runtime).find(({ name }) => name === "asset-change-reconciliation");
    expect(assetChanges?.intervalMs).toBe(DEFAULT_ASSET_CHANGES_INTERVAL_MS);
    expect(DEFAULT_ASSET_CHANGES_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
  } finally {
    if (previous.enabled === undefined) delete process.env.FORGETBASE_ASSET_CHANGES_ENABLED;
    else process.env.FORGETBASE_ASSET_CHANGES_ENABLED = previous.enabled;
    if (previous.interval === undefined) delete process.env.FORGETBASE_ASSET_CHANGES_INTERVAL_MS;
    else process.env.FORGETBASE_ASSET_CHANGES_INTERVAL_MS = previous.interval;
  }
});

it("logs scheduled asset-change ticks only when work happened", () => {
  const idle = {
    claimed: 0, completed: 0, retryScheduled: 0, leaseLost: 0, errors: {},
    health: { pending: 0, processing: 0, failed: 0, oldestPendingAt: null, oldestPendingAgeMs: null }
  };
  const log = vi.fn();

  expect(logScheduledAssetChangeMaintenance(idle, log)).toBe(false);
  expect(logScheduledAssetChangeMaintenance({ ...idle, claimed: 1, completed: 1 }, log)).toBe(true);
  expect(logScheduledAssetChangeMaintenance({ ...idle, health: { ...idle.health, failed: 2 } }, log)).toBe(true);
  expect(log).toHaveBeenCalledTimes(2);
});
