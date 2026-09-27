import { link, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  productIdentitySchema,
  type ProductIdentity,
  type SignedReleaseManifest
} from "@forgetbase/schema";
import { buildReleaseEnvironment } from "./executor.js";
import { validateManifestImages, verifySignedManifest } from "./manifest.js";

export interface InitializeManagedInstallationInput {
  envelope: unknown;
  publicKeys: ReadonlyMap<string, string>;
  allowedRegistryPrefixes: readonly string[];
  stateDir: string;
  updaterVersion: string;
  bundleDigest?: string;
}

export interface InitializedManagedInstallation {
  envelope: SignedReleaseManifest;
  identity: ProductIdentity;
  releaseEnvironmentPath: string;
  identityPath: string;
}

export async function initializeManagedInstallation(
  input: InitializeManagedInstallationInput
): Promise<InitializedManagedInstallation> {
  const envelope = verifySignedManifest(input.envelope, input.publicKeys);
  validateManifestImages(envelope.manifest, input.allowedRegistryPrefixes);

  const stateDir = resolve(input.stateDir);
  const releaseEnvironmentPath = join(stateDir, "current-release.env");
  const identityPath = join(stateDir, "identity.json");
  const identity = productIdentitySchema.parse({
    product: "forgetbase",
    version: envelope.manifest.version,
    sourceRevision: envelope.manifest.sourceRevision,
    builtAt: envelope.manifest.publishedAt,
    channel: envelope.manifest.channel,
    installationMode: "managed",
    databaseSchemaVersion: envelope.manifest.migration.targetSchemaVersion,
    updaterVersion: input.updaterVersion,
    updaterProtocolVersion: "1",
    managed: true
  });

  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const created: string[] = [];

  try {
    await publishExclusive(stateDir, "current-release.env", buildReleaseEnvironment(envelope.manifest, input.updaterVersion));
    created.push(releaseEnvironmentPath);
    await publishExclusive(stateDir, "identity.json", `${JSON.stringify(identity, null, 2)}\n`);
    created.push(identityPath);
    if (input.bundleDigest) {
      const receiptPath = join(stateDir, "bundle.sha256");
      await publishExclusive(stateDir, "bundle.sha256", `${input.bundleDigest}\n`);
      created.push(receiptPath);
    }
  } catch (error) {
    await Promise.all(created.map((path) => rm(path, { force: true })));
    throw error;
  }

  return { envelope, identity, releaseEnvironmentPath, identityPath };
}

async function publishExclusive(directory: string, filename: string, content: string): Promise<void> {
  const target = join(directory, filename);
  const temporary = join(directory, `.${filename}.${process.pid}.${crypto.randomUUID()}.tmp`);

  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await link(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Managed installation state already exists at ${target}`);
    }
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}
