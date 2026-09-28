import { describe, expect, it } from "vitest";
import { hashGovernedAssetSnapshot } from "@forgetbase/schema/governed-hash";
import type { AssetCreateInput } from "@forgetbase/schema";
import { InMemoryRegistryRepository } from "./index.js";

// Frozen from main 3fb5a4b before extracting the governed-v1 hash helper.
const input = {
  "stableId": "guide.hash-contract",
  "type": "guideline",
  "ownerId": "user_admin",
  "title": "Hash contract — café",
  "summary": "Synthetic compatibility vector",
  "lifecycleState": "draft",
  "sensitivity": "internal",
  "audience": [
    "team"
  ],
  "status": "draft",
  "reviewDueAt": "2027-01-31",
  "sourceKind": "synthetic-demo",
  "sourceRef": "synthetic://hash-contract",
  "allowedSurfaces": [
    "api",
    "cli",
    "mcp"
  ],
  "allowedExports": [],
  "allowedActions": [],
  "instruction": {
    "instructionKind": "guideline",
    "body": "Keep governed hashes byte-compatible."
  },
  "humanDocument": {
    "format": "markdown",
    "body": "# Synthetic compatibility vector"
  }
} satisfies AssetCreateInput;
const vectors = [
  {
    "metadata": {
      "2": "two",
      "10": "ten",
      "01": "leading",
      "4294967295": "non-index"
    },
    "expected": "374b0d96c1a0f084c7bee8d821dff7cb1259ac4528895a4c7279f01ed66a6808"
  },
  {
    "metadata": {
      "nested": {
        "2": "two",
        "10": "ten"
      },
      "list": [
        {
          "2": "two",
          "10": "ten"
        }
      ]
    },
    "expected": "4ee4b0694894fd8186217ae7b8897fdba85ee4ee99da85e44c7ad9334d67f002"
  },
  {
    "metadata": {
      "z": "last",
      "A": "first",
      "a": "middle"
    },
    "expected": "3bdb5a2d939cb749ccc2c7d49b0ebfb941e6c86addee47717805ee9da9789fe8"
  },
  {
    "metadata": {
      "é": "café",
      "中": "文",
      "😀": "emoji"
    },
    "expected": "423602ae52018331b273618a229eff41e8d6453126d915a6248f91038549998d"
  }
];

describe("persisted governed-v1 compatibility", () => {
  it.each(vectors)("preserves persisted hashes for $metadata", async ({ metadata, expected }) => {
    const registry = new InMemoryRegistryRepository();
    const detail = await registry.createAsset({ ...input, metadata });
    const version = detail.versions[0]!;
    expect(version.contentHash).toBe(expected);
    expect(hashGovernedAssetSnapshot(version.assetSnapshot!, {
      instructionObjects: detail.instructionObjects.map((instruction) => ({ ...instruction, escalation: instruction.escalation ?? undefined })),
      humanDocuments: detail.humanDocuments
    })).toBe(expected);
  });
});
