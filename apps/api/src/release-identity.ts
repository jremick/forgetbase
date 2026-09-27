import { readFileSync } from "node:fs";

export type ReleaseIdentity = {
  release: string;
  sourceRevision: string;
  sourceDate: string;
  contractVersion: string;
  lockfileSha256: string;
  schemaHead: string;
};

export function readReleaseIdentity(): ReleaseIdentity | null {
  try {
    const identity = JSON.parse(readFileSync(new URL("../../../build-info.json", import.meta.url), "utf8"));
    if (!/^[a-f0-9]{40}$/.test(identity.sourceRevision) || !/^[a-f0-9]{64}$/.test(identity.lockfileSha256) ||
        typeof identity.release !== "string" || typeof identity.schemaHead !== "string" ||
        typeof identity.contractVersion !== "string" || !Number.isFinite(Date.parse(identity.sourceDate))) {
      throw new Error("Invalid release identity");
    }
    return identity;
  } catch {
    if (process.env.FORGETBASE_REQUIRE_RELEASE_IDENTITY === "true") {
      throw new Error("A valid immutable build-info.json is required for this deployment");
    }
    return null;
  }
}
