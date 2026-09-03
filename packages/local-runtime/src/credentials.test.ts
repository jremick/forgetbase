import { describe, expect, it, vi } from "vitest";
import {
  createSystemCredentialStore,
  MemoryLocalCredentialStore,
  type CredentialCommandRunner,
  type LocalCredentialBundle
} from "./credentials.js";

const bundle: LocalCredentialBundle = {
  schemaVersion: 1,
  refreshToken: "refresh-token".padEnd(40, "x"),
  refreshTokenExpiresAt: "2026-09-10T00:00:00.000Z",
  profileIntegrityKey: "a".repeat(43)
};

describe("local credential stores", () => {
  it("keeps macOS Keychain secret material out of process arguments", async () => {
    const calls: Array<{ executable: string; args: string[]; input?: string }> = [];
    const runner: CredentialCommandRunner = vi.fn(async (executable, args, input) => {
      calls.push({ executable, args, input });
      if (input && (JSON.parse(input) as { operation?: string }).operation === "get") {
        return { exitCode: 0, stdout: JSON.stringify(bundle) };
      }
      return { exitCode: 0, stdout: "" };
    });
    const store = createSystemCredentialStore({ platform: "darwin", commandRunner: runner });

    await store.set("profile:test", bundle);
    expect(await store.get("profile:test")).toEqual(bundle);
    await store.delete("profile:test");

    expect(["/usr/bin/swift", "forgetbase-keychain"].some((value) => calls[0]?.executable.endsWith(value))).toBe(true);
    expect(calls[0]?.args.join(" ")).not.toContain(bundle.refreshToken);
    expect(calls[0]?.input).toContain(bundle.refreshToken);
  });

  it("uses Secret Service attributes and stdin on Linux", async () => {
    const calls: Array<{ executable: string; args: string[]; input?: string }> = [];
    const runner: CredentialCommandRunner = vi.fn(async (executable, args, input) => {
      calls.push({ executable, args, input });
      if (args[0] === "lookup") return { exitCode: 0, stdout: JSON.stringify(bundle) };
      return { exitCode: 0, stdout: "" };
    });
    const store = createSystemCredentialStore({ platform: "linux", commandRunner: runner });

    await store.set("profile:test", bundle);
    expect(await store.get("profile:test")).toEqual(bundle);
    await store.delete("profile:test");

    expect(calls[0]?.executable).toBe("secret-tool");
    expect(calls[0]?.args.join(" ")).not.toContain(bundle.refreshToken);
    expect(calls[0]?.input).toContain(bundle.refreshToken);
  });

  it("supports an isolated in-memory test backend", async () => {
    const store = new MemoryLocalCredentialStore();
    expect(await store.get("profile:test")).toBeNull();
    await store.set("profile:test", bundle);
    expect(await store.get("profile:test")).toEqual(bundle);
    await store.delete("profile:test");
    expect(await store.get("profile:test")).toBeNull();
  });
});
