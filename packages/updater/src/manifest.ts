import { createPublicKey, verify, type KeyObject } from "node:crypto";
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

export const maximumManifestBytes = 2 * 1024 * 1024;

export function requireEd25519Key(key: KeyObject): KeyObject {
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Release signing keys must use Ed25519");
  return key;
}

export function verifyEd25519Signature(value: unknown, signature: string, publicKey: string): boolean {
  const key = requireEd25519Key(createPublicKey(publicKey));
  // Reject ambiguous base64 decodings and signatures of other algorithms.
  const bytes = Buffer.from(signature, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== signature) return false;
  return verify(null, Buffer.from(canonicalJson(value), "utf8"), key, bytes);
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

  const valid = verifyEd25519Signature(envelope.manifest, envelope.signature, publicKey);

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
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);

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

  const declaredBytes = Number(response.headers.get("content-length"));
  if (declaredBytes > maximumManifestBytes) {
    await response.body?.cancel();
    throw new Error("Release manifest exceeds the 2 MiB size limit");
  }
  if (!response.body) throw new Error("Release manifest response has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumManifestBytes) {
        await reader.cancel();
        throw new Error("Release manifest exceeds the 2 MiB size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return verifySignedManifest(JSON.parse(Buffer.concat(chunks, size).toString("utf8")), input.publicKeys);
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

    // OCI references are data in Compose environment files, never URLs or expressions.
    const reference = /^(?<repository>[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*)(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?@(?<digest>sha256:[a-f0-9]{64})$/.exec(image.reference);
    if (!reference?.groups) throw new Error(`Invalid OCI image reference for ${image.component}`);
    const referenceDigest = reference.groups.digest;
    if (referenceDigest !== image.digest) {
      throw new Error(`Image digest mismatch for ${image.component}`);
    }

    if (!allowedRegistryPrefixes.some((prefix) => {
      const boundary = prefix.replace(/\/$/, "");
      return boundary.length > 0 && (reference.groups!.repository === boundary || reference.groups!.repository!.startsWith(`${boundary}/`));
    })) {
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
