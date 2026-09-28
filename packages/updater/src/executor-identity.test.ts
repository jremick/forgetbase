import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { productIdentitySchema } from "@forgetbase/schema";
import { ManagedComposeExecutor } from "./executor.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("managed approval identity refresh", () => {
  it("reads fresh application identity with the running updater metadata after a host runtime replacement", async () => {
    const { root, currentIdentity, executor } = await fixture();
    await writeFile(join(root, "identity.json"), JSON.stringify({ ...currentIdentity, updaterVersion: "0.0.9" }), { mode: 0o600 });
    expect(await executor.refreshIdentity()).toEqual(currentIdentity);
    const updatedApplication = { ...currentIdentity, version: "0.2.0", sourceRevision: "2".repeat(40), databaseSchemaVersion: "033_update" };
    await writeFile(join(root, "identity.json"), JSON.stringify({ ...updatedApplication, updaterVersion: "0.0.9" }), { mode: 0o600 });
    expect(await executor.refreshIdentity()).toEqual(updatedApplication);
  });

  it("fails closed when the managed identity file disappears instead of accepting cached identity", async () => {
    const { executor } = await fixture();
    await expect(executor.refreshIdentity()).rejects.toThrow(/identity.*missing/i);
  });

  it("retains source-mode identity fallback without a managed installation file", async () => {
    const { root, currentIdentity } = await fixture();
    const sourceIdentity = { ...currentIdentity, managed: false, installationMode: "source" as const };
    const executor = new ManagedComposeExecutor({ bundleDir: root, stateDir: root, composeFiles: [], currentIdentity: sourceIdentity });
    expect(await executor.refreshIdentity()).toEqual(sourceIdentity);
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "forgetbase-approval-identity-")); roots.push(root);
  const currentIdentity = productIdentitySchema.parse({ product: "forgetbase", version: "0.1.0", sourceRevision: "1".repeat(40), builtAt: null, channel: "beta", installationMode: "managed", databaseSchemaVersion: "032_base", updaterVersion: "0.1.0", updaterProtocolVersion: "1", managed: true });
  return { root, currentIdentity, executor: new ManagedComposeExecutor({ bundleDir: root, stateDir: root, composeFiles: [], currentIdentity }) };
}
