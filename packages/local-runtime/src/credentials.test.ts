import { describe, expect, it, vi } from "vitest";
import {
  createSystemCredentialStore,
  MemoryLocalCredentialStore,
  type CredentialCommandRunner,
  type LocalCredentialBundle
} from "./credentials.js";

const bundle: LocalCredentialBundle = {
  schemaVersion: 2,
  runtimeVersion: "0.1.0",
  minimumRuntimeVersion: "0.1.0",
  protocolVersion: "1",
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
    const setCall = calls.find((call) => call.input && JSON.parse(call.input).operation === "set");
    expect(setCall?.input).toContain(bundle.refreshToken);
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

    const storeCall = calls.find((call) => call.args[0] === "store");
    expect(storeCall?.executable).toBe("secret-tool");
    expect(storeCall?.args.join(" ")).not.toContain(bundle.refreshToken);
    expect(storeCall?.input).toContain(bundle.refreshToken);
  });

  it("supports an isolated in-memory test backend", async () => {
    const store = new MemoryLocalCredentialStore();
    expect(await store.get("profile:test")).toBeNull();
    await store.set("profile:test", bundle);
    expect(await store.get("profile:test")).toEqual(bundle);
    await store.delete("profile:test");
    expect(await store.get("profile:test")).toBeNull();
  });

  it("keeps accepted counters, hashes, and signing-key identity monotonic", async () => {
    const store = new MemoryLocalCredentialStore();
    const accepted: LocalCredentialBundle = {
      ...bundle,
      acceptedAuthorizationEpoch: 2,
      acceptedContentGeneration: 3,
      acceptedEntitlementHash: "sha256:" + "a".repeat(64),
      acceptedRecordSetHash: "sha256:" + "b".repeat(64),
      acceptedSigningKeyId: "key-1"
    };
    await store.set("profile:test", accepted);
    await expect(store.set("profile:test", {
      ...accepted,
      acceptedAuthorizationEpoch: 1
    })).rejects.toThrow(/rolled back/);
    await expect(store.set("profile:test", {
      ...accepted,
      acceptedEntitlementHash: "sha256:" + "c".repeat(64)
    })).rejects.toThrow(/authorization high-water/);
    await expect(store.set("profile:test", {
      ...accepted,
      acceptedSigningKeyId: "key-2"
    })).rejects.toThrow(/signing-key/);
    await expect(store.set("profile:test", {
      ...accepted,
      acceptedAuthorizationEpoch: 3,
      acceptedEntitlementHash: "sha256:" + "c".repeat(64)
    })).resolves.toBeUndefined();
  });

  it("rejects credentials from an incompatible N-1 schema", async () => {
    const store = new MemoryLocalCredentialStore();
    await expect(store.set("profile:test", {
      ...bundle,
      schemaVersion: 1 as 2
    })).rejects.toThrow(/unsupported or invalid shape/);
  });
});
