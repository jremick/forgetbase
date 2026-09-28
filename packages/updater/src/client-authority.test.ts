// Mixed-version failure: a new API must discover host approval support BEFORE
// posting to an older updater whose request endpoints execute immediately.
// Existing transport tests only cover HTTPS/trusted-host selection; they cannot
// detect this request-ordering regression. The fetch boundary records actual
// outgoing calls from the production client; it does not enforce the guard.
import { describe, expect, it } from "vitest";
import { HttpUpdateControlClient } from "./client.js";

const identity = {
  product: "forgetbase", version: "0.1.0", sourceRevision: "synthetic",
  builtAt: null, channel: "beta", installationMode: "managed", managed: true,
  databaseSchemaVersion: "039_asset_change_outbox", updaterVersion: "0.1.0", updaterProtocolVersion: "1"
};
const pending = {
  id: "update_synthetic", kind: "update", phase: "queued", requestedAt: "2026-09-28T00:00:00.000Z",
  scheduledFor: null, startedAt: null, completedAt: null, currentVersion: "0.1.0", targetVersion: "0.1.1",
  manifestKeyId: null, recoveryPointId: null, progressPercent: 0, message: "Synthetic response",
  errorCode: null, automaticRollback: true, writesReopened: false
};

function fixture(capability: unknown, unavailable = false) {
  const calls: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/v1/status") {
      if (unavailable) return new Response("unavailable", { status: 503 });
      return Response.json({ enabled: true, identity, activeJob: null, jobs: [], recoveryPoints: [],
        availableUpdate: null, lastCheckedAt: null, feedStatus: "not-checked",
        ...(capability === undefined ? {} : { hostApprovalRequired: capability }) });
    }
    // Simulates the dangerous older transport: any accepted POST can execute.
    return Response.json(pending);
  };
  return { calls, client: new HttpUpdateControlClient("https://updater.example.test", "synthetic-request-token-000000000000000", transport) };
}

describe("host approval capability before request submission", () => {
  it.each([undefined, false, "true"])("never posts an update or restore when capability is %s", async (capability) => {
    const f = fixture(capability);
    await expect(f.client.apply({ version: "0.1.1" })).rejects.toThrow();
    await expect(f.client.rollback({ recoveryPointId: "recovery_synthetic", confirmDataLossAfter: "2026-09-27T00:00:00.000Z" })).rejects.toThrow();
    expect(f.calls).toEqual(["GET /v1/status", "GET /v1/status"]);
  });

  it("does not submit or retry when capability status is unavailable", async () => {
    const f = fixture(true, true);
    await expect(f.client.apply({ version: "0.1.1" })).rejects.toThrow();
    expect(f.calls).toEqual(["GET /v1/status"]);
  });

  it("checks capability before each update and restore request", async () => {
    const f = fixture(true);
    await f.client.apply({ version: "0.1.1" });
    await f.client.rollback({ recoveryPointId: "recovery_synthetic", confirmDataLossAfter: "2026-09-27T00:00:00.000Z" });
    expect(f.calls).toEqual(["GET /v1/status", "POST /v1/jobs", "GET /v1/status", "POST /v1/rollback"]);
  });
});

// Approval snapshots expand valid status responses beyond the old 256KiB
// truncation. Bound the transport while preserving complete allowed responses.
describe("bounded approval status transport", () => {
  it("reads a complete valid history larger than 256KiB without truncating JSON", async () => {
    const history = Array.from({ length: 10 }, (_, index) => ({ ...pending, id: `update_${index}`, message: "x".repeat(32_768) }));
    const client = new HttpUpdateControlClient("https://updater.example.test", "synthetic-request-token-000000000000000",
      async () => Response.json({ enabled: true, hostApprovalRequired: true, identity, activeJob: null, jobs: history,
        recoveryPoints: [], availableUpdate: null, lastCheckedAt: null, feedStatus: "not-checked" }));
    expect((await client.status()).jobs.map((job) => job.message.length)).toEqual(Array(10).fill(32_768));
  });

  it("cancels an oversized streamed response instead of buffering it to completion", async () => {
    let chunks = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunks === 10) { controller.close(); return; }
        chunks += 1;
        controller.enqueue(new Uint8Array(1024 * 1024).fill(32));
      },
      cancel() { cancelled = true; }
    });
    const client = new HttpUpdateControlClient("https://updater.example.test", "synthetic-request-token-000000000000000",
      async () => new Response(body));
    await expect(client.status()).rejects.toThrow("5 MiB");
    expect(cancelled).toBe(true);
    expect(chunks).toBeLessThan(10);
  });
});
