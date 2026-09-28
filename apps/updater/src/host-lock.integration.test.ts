import { execFile, spawnSync } from "node:child_process";
import { closeSync, fstatSync, openSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { acquireHostLock } from "./host-lock.js";

const runFile = promisify(execFile);
const sourceUrl = new URL("./host-lock.ts", import.meta.url).href;

// Managed host ownership is a Linux util-linux flock contract. Process fixtures
// use Node's native TypeScript loading so they exercise this source before build.
describe.skipIf(process.platform !== "linux")("managed host lock process integration", () => {
  it("keeps numeric descriptor ownership across forced garbage collection", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "forgetbase-lock-gc-"));
    try {
      const fixture = `
        import { acquireHostLock } from ${JSON.stringify(sourceUrl)};
        import { fstatSync } from "node:fs";
        import { spawnSync } from "node:child_process";
        import { setTimeout } from "node:timers/promises";
        import { join } from "node:path";
        const descriptor = (await acquireHostLock(process.argv[1])).descriptor;
        for (let attempt = 0; attempt < 30; attempt++) {
          global.gc();
          await setTimeout(5);
        }
        fstatSync(descriptor);
        const contender = spawnSync("flock", ["--nonblock", join(process.argv[1], "updater.lock"), "true"]);
        if (contender.status !== 1) throw new Error("Garbage collection released updater ownership");
        console.log("gc-ownership-held");
      `;
      const result = await runFile(process.execPath, ["--expose-gc", "--input-type=module", "-e", fixture, stateDir], {
        timeout: 10_000, maxBuffer: 32_768
      });
      expect(result.stdout.trim()).toBe("gc-ownership-held");
      expect(result.stderr).not.toContain("ERR_INVALID_STATE");
      expect(spawnSync("flock", ["--nonblock", join(stateDir, "updater.lock"), "true"]).status).toBe(0);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 15_000);

  it("keeps inherited command ownership after its updater process exits", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "forgetbase-lock-inherit-"));
    let descendantPid: number | undefined;
    try {
      const fixture = `
        import { acquireHostLock } from ${JSON.stringify(sourceUrl)};
        import { spawn } from "node:child_process";
        import { once } from "node:events";
        const lock = await acquireHostLock(process.argv[1]);
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000); process.send('ready');"], {
          detached: true, shell: false, stdio: ["ignore", "ignore", "ignore", lock.descriptor, "ipc"]
        });
        await once(child, "message");
        child.disconnect();
        child.unref();
        console.log(JSON.stringify({ pid: child.pid }));
        process.exit(0);
      `;
      const result = await runFile(process.execPath, ["--input-type=module", "-e", fixture, stateDir], {
        timeout: 10_000, maxBuffer: 32_768
      });
      descendantPid = JSON.parse(result.stdout).pid as number;
      expect(descendantPid).toBeGreaterThan(0);
      expect(spawnSync("flock", ["--nonblock", join(stateDir, "updater.lock"), "true"]).status).toBe(1);
      process.kill(descendantPid!, "SIGTERM");
      await expect.poll(() => spawnSync("flock", ["--nonblock", join(stateDir, "updater.lock"), "true"]).status, {
        timeout: 3_000
      }).toBe(0);
      descendantPid = undefined;
    } finally {
      if (descendantPid !== undefined) {
        try { process.kill(descendantPid, "SIGKILL"); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects contenders and releases idempotently without closing a reused descriptor", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "forgetbase-lock-release-"));
    const lock = await acquireHostLock(stateDir);
    let replacement: number | undefined;
    try {
      await expect(acquireHostLock(stateDir)).rejects.toThrow("Another updater owns this state directory");
      expect(spawnSync("flock", ["--nonblock", join(stateDir, "updater.lock"), "true"]).status).toBe(1);
      await lock.release();
      replacement = openSync(join(stateDir, "replacement"), "a", 0o600);
      await lock.release();
      expect(fstatSync(replacement).isFile()).toBe(true);
      expect(spawnSync("flock", ["--nonblock", join(stateDir, "updater.lock"), "true"]).status).toBe(0);
    } finally {
      await lock.release();
      if (replacement !== undefined) closeSync(replacement);
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});
