import { createPublicKey, verify } from "node:crypto";
import {
  releaseManifestSchema,
  signedReleaseManifestSchema,
  type ReleaseManifest,
  type SignedReleaseManifest
} from "@forgetbase/schema";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

export function verifySignedManifest(
  input: unknown,
  publicKeys: ReadonlyMap<string, string>
): SignedReleaseManifest {
  const envelope = signedReleaseManifestSchema.parse(input);
  const publicKey = publicKeys.get(envelope.keyId);

  if (!publicKey) {
    throw new Error(`Untrusted release manifest key: ${envelope.keyId}`);
  }

  const valid = verify(
    null,
    Buffer.from(canonicalJson(envelope.manifest), "utf8"),
    createPublicKey(publicKey),
    Buffer.from(envelope.signature, "base64")
  );

  if (!valid) {
    throw new Error("Release manifest signature verification failed");
  }

  if (envelope.manifest.revoked) {
    throw new Error(`Release ${envelope.manifest.version} is revoked: ${envelope.manifest.revocationReason ?? "no reason supplied"}`);
  }

  return envelope;
}

export async function fetchSignedManifest(input: {
  feedUrl: string;
  publicKeys: ReadonlyMap<string, string>;
  allowHttpForLocalhost?: boolean;
  fetchImplementation?: typeof fetch;
}): Promise<SignedReleaseManifest> {
  const url = new URL(input.feedUrl);
  const localHttpAllowed = input.allowHttpForLocalhost === true &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname);

  if (url.protocol !== "https:" && !localHttpAllowed) {
    throw new Error("Update feeds must use HTTPS; local HTTP requires an explicit development override");
  }

  const response = await (input.fetchImplementation ?? fetch)(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`Update feed returned HTTP ${response.status}`);
  }

  const body = await response.json();
  return verifySignedManifest(body, input.publicKeys);
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseSemver(value: string): ParsedSemver {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);

  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Invalid semantic version: ${value}`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4]?.split(".") ?? []
  };
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);

  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) {
      return a[key] > b[key] ? 1 : -1;
    }
  }

  if (!a.prerelease.length && !b.prerelease.length) {
    return 0;
  }

  if (!a.prerelease.length) {
    return 1;
  }

  if (!b.prerelease.length) {
    return -1;
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];

    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);

    if (leftNumeric && rightNumeric) {
      return Number.parseInt(leftPart, 10) > Number.parseInt(rightPart, 10) ? 1 : -1;
    }

    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }

    return leftPart.localeCompare(rightPart) > 0 ? 1 : -1;
  }

  return 0;
}

export function supportsUpgradeFrom(manifest: ReleaseManifest, currentVersion: string): boolean {
  return manifest.upgradeFrom.some((rule) => {
    if (rule === "*") return true;
    if (rule === currentVersion) return true;

    const range = /^>=(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s+<(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(rule);

    if (range?.[1] && range[2]) {
      return compareSemver(currentVersion, range[1]) >= 0 && compareSemver(currentVersion, range[2]) < 0;
    }

    return false;
  });
}

export function validateManifestImages(manifest: ReleaseManifest, allowedRegistryPrefixes: readonly string[]): void {
  const components = new Set<string>();

  for (const image of manifest.images) {
    if (components.has(image.component)) {
      throw new Error(`Duplicate release image component: ${image.component}`);
    }

    components.add(image.component);

    const referenceDigest = image.reference.slice(image.reference.indexOf("@") + 1);
    if (referenceDigest !== image.digest) {
      throw new Error(`Image digest mismatch for ${image.component}`);
    }

    if (!allowedRegistryPrefixes.some((prefix) => image.reference.startsWith(prefix))) {
      throw new Error(`Image registry is not allowed for ${image.component}`);
    }
  }

  for (const required of ["api", "web", "worker", "migrate", "proxy"] as const) {
    if (!components.has(required)) {
      throw new Error(`Release manifest is missing ${required} image`);
    }
  }

  releaseManifestSchema.parse(manifest);
}
