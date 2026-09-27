import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Hold a Linux flock on an open file description, also inherited by child commands. */
export async function acquireHostLock(stateDir: string): Promise<{ descriptor: number; release(): Promise<void> }> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  // Ownership follows the raw descriptor, which the executor also retains.
  // A FileHandle finalizer can close it once only the numeric fd remains.
  const descriptor = openSync(join(stateDir, "updater.lock"), "a", 0o600);
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    closeSync(descriptor);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      // fd 3 duplicates our open description. flock exits; this process keeps the lock.
      const child = spawn("flock", ["--nonblock", "3"], { stdio: ["ignore", "ignore", "ignore", descriptor], shell: false });
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Updater ownership lock timed out")); }, 5_000);
      child.once("error", () => { clearTimeout(timeout); reject(new Error("Managed updater requires Linux util-linux flock")); });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error("Another updater owns this state directory"));
      });
    });
    return { descriptor, release };
  } catch (error) { await release(); throw error; }
}
