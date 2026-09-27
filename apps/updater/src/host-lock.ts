import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";

/** Hold a Linux flock on an open file description, also inherited by child commands. */
export async function acquireHostLock(stateDir: string): Promise<{ descriptor: number; release(): Promise<void> }> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const file = await open(join(stateDir, "updater.lock"), "a", 0o600);
  try {
    await new Promise<void>((resolve, reject) => {
      // fd 3 duplicates our open description. flock exits; this process keeps the lock.
      const child = spawn("flock", ["--nonblock", "3"], { stdio: ["ignore", "ignore", "ignore", file.fd], shell: false });
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Updater ownership lock timed out")); }, 5_000);
      child.once("error", () => { clearTimeout(timeout); reject(new Error("Managed updater requires Linux util-linux flock")); });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error("Another updater owns this state directory"));
      });
    });
    return { descriptor: file.fd, release: () => file.close() };
  } catch (error) { await file.close(); throw error; }
}
