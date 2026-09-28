import { createHash } from "node:crypto";
import {
  assetVersionAssetSnapshotSchema,
  type AgentInstructionInput,
  type AssetVersionAssetSnapshot,
  type HumanDocumentInput
} from "./index.js";

/** The persisted governed asset-version hash contract. Keep this byte-compatible. */
export const GOVERNED_HASH_CONTRACT_VERSION = "governed-v1" as const;

export interface GovernedVersionContent {
  instructionObjects: AgentInstructionInput[];
  humanDocuments: HumanDocumentInput[];
}

/**
 * Hash the exact resolved governed snapshot used by the DB repositories.
 * The legacy localeCompare ordering is intentional: existing stored hashes
 * depend on these bytes. Import reports use a separate canonicalizer.
 */
export function hashGovernedAssetSnapshot(
  assetSnapshot: AssetVersionAssetSnapshot,
  content: GovernedVersionContent
): string {
  const canonicalSnapshot = {
    asset: assetVersionAssetSnapshotSchema.parse(assetSnapshot),
    instructionObjects: content.instructionObjects.map((instruction) => ({
      instructionKind: instruction.instructionKind,
      targetAgents: instruction.targetAgents,
      body: instruction.body,
      inputContract: instruction.inputContract,
      outputContract: instruction.outputContract,
      constraints: instruction.constraints,
      examples: instruction.examples,
      failureModes: instruction.failureModes,
      escalation: instruction.escalation ?? null
    })),
    humanDocuments: content.humanDocuments.map((document) => ({
      format: document.format,
      body: document.body,
      renderOptions: document.renderOptions,
      linkedInstructionIds: document.linkedInstructionIds
    }))
  };

  return createHash("sha256").update(stableJson(canonicalSnapshot)).digest("hex");
}

// Object reconstruction plus JSON.stringify preserves numeric-index ordering.
// Do not replace this with a manual serializer under the governed-v1 name.
function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonValue(entry)])
    );
  }

  return value;
}
