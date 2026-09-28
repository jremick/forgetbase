import { describe, expect, it } from "vitest";
import {
  buildImportCandidateFromGovernedSnapshot,
  buildImportMappingManifest,
  buildImportSnapshot,
  buildImportTargetManifest,
  buildImportTargetSummaryFromGovernedSnapshot,
  canonicalizeImportJson,
  deriveImportQueryScopeDigest,
  deriveImportSourceScopeId,
  IMPORT_ACCESS_CONTRACT_VERSION,
  IMPORT_APPLY_ACCEPTANCE,
  IMPORT_HASH_CONTRACT_VERSION,
  IMPORT_MANIFEST_VERSION,
  importPlanRequestSchema,
  planImport,
  type ImportCandidateDraft,
  type ImportEffectiveAccess,
  type ImportSnapshotManifestDraft,
  type ImportTargetSummaryDraft,
  type ImportSourceIdentity
} from "./import-planner.js";
import { hashGovernedAssetSnapshot } from "./governed-hash.js";
import { agentInstructionInputSchema } from "./index.js";

const tenantId = "tenant_alpha";
const snapshotId = "snapshot-1";
const correlationId = "import-run-1";
const sourceReadRevision = "hub-revision-1";
const targetReadRevision = "db-revision-7";
const sourceDescriptor = {
  system: "ai-hub",
  rootId: "root-team-ai",
  scopeId: "team-ai",
  sourceRefPrefix: "ai-hub://"
};
const sourceScopeId = deriveImportSourceScopeId(sourceDescriptor);
const queryScopeDigest = deriveImportQueryScopeDigest(sourceScopeId);
const source: ImportSourceIdentity = {
  ...sourceDescriptor,
  sourceScopeId,
  queryScopeDigest
};
const sourceDigest = "a".repeat(64);

const access: ImportEffectiveAccess = {
  accessContractVersion: IMPORT_ACCESS_CONTRACT_VERSION,
  lifecycleState: "active",
  publicationState: "published",
  reviewState: "approved",
  sensitivity: "restricted",
  audience: ["ai-team"],
  allowedSurfaces: ["api", "cli", "mcp"],
  allowedExports: ["internal-pack"],
  allowedActions: ["read"],
  effectiveGrants: []
};

function governedSnapshot(stableId: string, overrides: Partial<{
  title: string;
  summary: string;
  sourceRef: string;
  lifecycleState: "draft" | "active" | "deprecated" | "archived" | "restricted";
  sensitivity: "public-demo" | "internal" | "restricted" | "confidential" | "secret";
}> = {}) {
  return {
    assetSnapshot: {
      stableId,
      type: "guideline" as const,
      ownerId: "user_admin",
      title: overrides.title ?? `Guide ${stableId}`,
      summary: overrides.summary ?? "Synthetic planner fixture",
      lifecycleState: overrides.lifecycleState ?? "active" as const,
      sensitivity: overrides.sensitivity ?? "restricted" as const,
      audience: ["ai-team"],
      status: "approved",
      reviewDueAt: "2027-01-31",
      sourceKind: "ai-hub",
      sourceRef: overrides.sourceRef ?? `ai-hub://${stableId}`,
      allowedSurfaces: ["api", "cli", "mcp"] as ImportEffectiveAccess["allowedSurfaces"],
      allowedExports: ["internal-pack"],
      allowedActions: ["read"],
      metadata: {}
    },
    instructionObjects: [{ instructionKind: "guideline", body: `Synthetic body for ${stableId}` }],
    humanDocuments: []
  };
}

function sourceRecord(sourceId: string, overrides: Partial<ImportSnapshotManifestDraft["records"][number]> = {}) {
  return {
    sourceId,
    sourceContentSha256: sourceDigest,
    effectiveAccess: access,
    provenance: {
      sourceParentId: null,
      sourcePath: `ai-hub://${sourceId}`
    },
    ...overrides
  } satisfies ImportSnapshotManifestDraft["records"][number];
}

function continuation(complete = true) {
  return complete
    ? { version: "continuation-v1" as const, complete: true, nextCursor: null, proof: "exhaustive" as const }
    : { version: "continuation-v1" as const, complete: false, nextCursor: "cursor-next", proof: "cursor" as const };
}

function snapshot(
  records: ImportSnapshotManifestDraft["records"],
  overrides: Partial<{
    complete: boolean;
    truncated: boolean;
    totalCount: number;
    sourceReadRevision: string;
    correlationId: string;
    source: ImportSnapshotManifestDraft["source"];
    queryScopeDigest: string;
  }> = {}
) {
  const complete = overrides.complete ?? true;
  return buildImportSnapshot({
    schemaVersion: IMPORT_MANIFEST_VERSION,
    kind: "forgetbase.import-snapshot",
    snapshotId,
    source: overrides.source ?? { ...sourceDescriptor, sourceScopeId },
    capturedAt: "2026-09-03T00:00:00.000Z",
    sourceReadRevision: overrides.sourceReadRevision ?? sourceReadRevision,
    queryScopeDigest: overrides.queryScopeDigest,
    correlationId: overrides.correlationId ?? correlationId,
    complete,
    totalCount: overrides.totalCount ?? records.length,
    continuation: continuation(complete),
    truncated: overrides.truncated ?? false,
    records
  });
}

function candidate(
  sourceId: string,
  stableId: string,
  overrides: Partial<{
    sourceRef: string;
    sourceContentSha256: string;
    effectiveAccess: ImportEffectiveAccess | null;
    governedSnapshot: ReturnType<typeof governedSnapshot>;
  }> = {}
) {
  return buildImportCandidateFromGovernedSnapshot({
    sourceId,
    stableId,
    sourceRef: overrides.sourceRef ?? `ai-hub://${sourceId}`,
    sourceContentSha256: overrides.sourceContentSha256 ?? sourceDigest,
    effectiveAccess: overrides.effectiveAccess === undefined ? access : overrides.effectiveAccess,
    governedSnapshot: overrides.governedSnapshot ?? governedSnapshot(stableId)
  });
}

function mapping(candidates: ImportCandidateDraft[], sourceSnapshot: ReturnType<typeof snapshot>, overrides: Partial<{
  complete: boolean;
  truncated: boolean;
  totalCount: number;
  snapshotChecksum: string;
  sourceScopeId: string;
  queryScopeDigest: string;
  correlationId: string;
}> = {}) {
  const complete = overrides.complete ?? true;
  return buildImportMappingManifest({
    schemaVersion: IMPORT_MANIFEST_VERSION,
    kind: "forgetbase.import-mapping",
    snapshotId: sourceSnapshot.snapshotId,
    snapshotChecksum: overrides.snapshotChecksum ?? sourceSnapshot.checksum,
    sourceScopeId: overrides.sourceScopeId ?? sourceScopeId,
    sourceReadRevision: sourceSnapshot.sourceReadRevision,
    queryScopeDigest: overrides.queryScopeDigest ?? queryScopeDigest,
    correlationId: overrides.correlationId ?? sourceSnapshot.correlationId,
    complete,
    totalCount: overrides.totalCount ?? candidates.length,
    continuation: continuation(complete),
    truncated: overrides.truncated ?? false,
    mappings: candidates.map((value) => ({ candidate: value }))
  });
}

function target(
  stableId: string,
  sourceId: string,
  overrides: Partial<{
    tenantId: string;
    assetId: string;
    source: ImportTargetSummaryDraft["source"];
    current: ImportTargetSummaryDraft["current"];
    effectiveAccess: ImportEffectiveAccess | null;
    governedSnapshot: ReturnType<typeof governedSnapshot> & { versionId: string };
  }> = {}
) {
  const sourceIdentity = overrides.source ?? {
    system: source.system,
    rootId: source.rootId,
    scopeId: source.scopeId,
    sourceScopeId,
    sourceId,
    sourceRef: `ai-hub://${sourceId}`
  };
  if (overrides.current) {
    return {
      tenantId: overrides.tenantId ?? tenantId,
      assetId: overrides.assetId ?? `asset-${stableId}`,
      stableId,
      source: sourceIdentity,
      current: overrides.current,
      effectiveAccess: overrides.effectiveAccess === undefined ? access : overrides.effectiveAccess
    } satisfies ImportTargetSummaryDraft;
  }
  return buildImportTargetSummaryFromGovernedSnapshot({
    tenantId: overrides.tenantId ?? tenantId,
    assetId: overrides.assetId ?? `asset-${stableId}`,
    stableId,
    source: sourceIdentity,
    effectiveAccess: overrides.effectiveAccess === undefined ? access : overrides.effectiveAccess,
    governedSnapshot: overrides.governedSnapshot ?? { ...governedSnapshot(stableId), versionId: "version-1" }
  });
}

function targetManifest(
  targets: ReturnType<typeof target>[],
  sourceMapping: ReturnType<typeof mapping>,
  overrides: Partial<{
    tenantId: string;
    sourceScopeId: string;
    targetSnapshotId: string;
    correlationId: string;
    targetReadRevision: string;
    hashContractVersion: string;
    mappingChecksum: string;
    queryScopeDigest: string;
    complete: boolean;
    totalCount: number;
    truncated: boolean;
  }> = {}
) {
  const complete = overrides.complete ?? true;
  return buildImportTargetManifest({
    schemaVersion: IMPORT_MANIFEST_VERSION,
    kind: "forgetbase.import-target-state",
    tenantId: overrides.tenantId ?? tenantId,
    sourceScopeId: overrides.sourceScopeId ?? sourceScopeId,
    targetSnapshotId: overrides.targetSnapshotId ?? "target-snapshot-1",
    correlationId: overrides.correlationId ?? correlationId,
    capturedAt: "2026-09-03T00:00:01.000Z",
    targetReadRevision: overrides.targetReadRevision ?? targetReadRevision,
    hashContractVersion: overrides.hashContractVersion ?? IMPORT_HASH_CONTRACT_VERSION,
    mappingChecksum: overrides.mappingChecksum ?? sourceMapping.checksum,
    queryScopeDigest: overrides.queryScopeDigest ?? queryScopeDigest,
    complete,
    totalCount: overrides.totalCount ?? targets.length,
    continuation: continuation(complete),
    truncated: overrides.truncated ?? false,
    targets
  });
}

function plan(
  records: ImportSnapshotManifestDraft["records"],
  candidates: ReturnType<typeof candidate>[],
  targets: ReturnType<typeof target>[],
  options: Partial<{
    snapshot: Parameters<typeof snapshot>[1];
    mapping: Parameters<typeof mapping>[2];
    targetManifest: Parameters<typeof targetManifest>[2];
  }> = {}
) {
  const sourceSnapshot = snapshot(records, options.snapshot);
  const sourceMapping = mapping(candidates, sourceSnapshot, options.mapping);
  const targetState = targetManifest(targets, sourceMapping, options.targetManifest);
  return planImport({ tenantId, snapshot: sourceSnapshot, mapping: sourceMapping, targetManifest: targetState });
}

describe("import planner", () => {
  it("reports would-create/noop/update/source-missing with one terminal result per entity", () => {
    const result = plan(
      [sourceRecord("create"), sourceRecord("same"), sourceRecord("changed")],
      [
        candidate("create", "guide.create"),
        candidate("same", "guide.same"),
        candidate("changed", "guide.changed", { governedSnapshot: governedSnapshot("guide.changed", { title: "Changed body" }) }),
        candidate("stale", "guide.stale")
      ],
      [
        target("guide.same", "same"),
        target("guide.changed", "changed"),
        target("guide.stale", "stale")
      ]
    );

    expect(result.classificationComplete).toBe(true);
    expect(result.executable).toBe(false);
    expect(result.safeToApply).toBe(false);
    expect(result.reportType).toBe("classification-report-only-v1");
    expect(result.applyAcceptance).toBe(IMPORT_APPLY_ACCEPTANCE);
    expect(result.counts["would-create"]).toBe(1);
    expect(result.counts["would-noop"]).toBe(2);
    expect(result.counts["would-update-version"]).toBe(2);
    expect(result.counts["would-source-missing"]).toBe(2);
    expect(result.summary.sourceCount).toBe(4);
    expect(result.summary.targetCount).toBe(3);
    expect(result.summary.classifiedSourceCount).toBe(4);
    expect(result.summary.classifiedTargetCount).toBe(3);
    expect(result.items.filter((item) => item.entity === "source")).toHaveLength(4);
    expect(result.items.filter((item) => item.entity === "target")).toHaveLength(3);
    expect(result.items.filter((item) => item.action === "would-create")[0]).toMatchObject({ proposedLifecycleState: "draft", proposedStatus: "review" });
    expect(JSON.stringify(result)).not.toContain("body");
    expect(JSON.stringify(result)).not.toContain("ai-hub://");
  });

  it("requires one planner tenant and verifies every target tenant", () => {
    const result = plan(
      [sourceRecord("same")],
      [candidate("same", "guide.same")],
      [target("guide.same", "same", { tenantId: "tenant_other" })]
    );

    expect(result.classificationComplete).toBe(false);
    expect(result.safeToApply).toBe(false);
    expect(result.items.every((item) => !item.action.startsWith("would-"))).toBe(true);
    expect(result.errors.map((error) => error.code)).toContain("target.tenant_mismatch");
  });

  it("rejects restricted-to-public access widening without wildcard semantics", () => {
    const publicAccess: ImportEffectiveAccess = {
      ...access,
      sensitivity: "public-demo",
      audience: ["public"],
      allowedSurfaces: ["api", "cli", "mcp", "web", "export"],
      allowedExports: ["public-pack"],
      effectiveGrants: [{ principalType: "group", principalId: "public", action: "read", surface: "web", exportName: null }]
    };
    const publicSnapshot = governedSnapshot("guide.restricted", { sensitivity: "public-demo" });
    publicSnapshot.assetSnapshot.audience = publicAccess.audience;
    publicSnapshot.assetSnapshot.allowedSurfaces = publicAccess.allowedSurfaces;
    publicSnapshot.assetSnapshot.allowedExports = publicAccess.allowedExports;
    const result = plan(
      [sourceRecord("restricted")],
      [candidate("restricted", "guide.restricted", { effectiveAccess: publicAccess, governedSnapshot: publicSnapshot })],
      []
    );

    expect(result.classificationComplete).toBe(false);
    expect(result.items.every((item) => !item.action.startsWith("would-"))).toBe(true);
    expect(result.errors.map((error) => error.code)).toContain("candidate.access_widened");
  });

  it("rejects fingerprints and caller-authored verified target hashes", () => {
    expect(() => buildImportCandidateFromGovernedSnapshot({
      sourceId: "fingerprint",
      stableId: "guide.fingerprint",
      sourceRef: "ai-hub://fingerprint",
      sourceContentSha256: sourceDigest,
      effectiveAccess: { fingerprint: "f".repeat(64) } as unknown as ImportEffectiveAccess,
      governedSnapshot: governedSnapshot("guide.fingerprint")
    })).toThrow();

    const rawTarget = target("guide.raw", "raw", {
      current: { versionId: "version-1", contentHash: "c".repeat(64), hashVerification: "verified" }
    });
    const result = plan([sourceRecord("raw")], [candidate("raw", "guide.raw")], [rawTarget]);
    expect(result.classificationComplete).toBe(false);
    expect(result.counts["would-noop"]).toBe(0);
    expect(result.errors.map((error) => error.code)).toContain("target.hash_unproven");
  });

  it("does not false-noop unverified or legacy target digests", () => {
    for (const hashVerification of ["unverified", "legacy"] as const) {
      const result = plan(
        [sourceRecord("same")],
        [candidate("same", "guide.same")],
        [target("guide.same", "same", { current: { versionId: "version-1", contentHash: "c".repeat(64), hashVerification } })]
      );
      expect(result.counts["would-noop"]).toBe(0);
      expect(result.classificationComplete).toBe(false);
      expect(result.errors.map((error) => error.code)).toContain("target.hash_unproven");
    }
  });

  it("keeps source and target revisions separate while binding correlation, query scope, and mapping checksum", () => {
    const result = plan(
      [sourceRecord("same")],
      [candidate("same", "guide.same")],
      [target("guide.same", "same")],
      { snapshot: { sourceReadRevision: "source-revision", correlationId: "source-correlation" }, targetManifest: { targetReadRevision: "target-revision", correlationId: "target-correlation" } }
    );
    expect(result.classificationComplete).toBe(false);
    expect(result.sourceReadRevision).toBe("source-revision");
    expect(result.targetReadRevision).toBe("target-revision");
    expect(result.errors.map((error) => error.code)).toContain("target.correlation_mismatch");

    const sourceSnapshot = snapshot([sourceRecord("same")]);
    const sourceMapping = mapping([candidate("same", "guide.same")], sourceSnapshot);
    const targetState = targetManifest([target("guide.same", "same")], sourceMapping, { mappingChecksum: "b".repeat(64) });
    const tampered = planImport({ tenantId, snapshot: sourceSnapshot, mapping: sourceMapping, targetManifest: targetState });
    expect(tampered.classificationComplete).toBe(false);
    expect(tampered.errors.map((error) => error.code)).toContain("target.mapping_checksum_mismatch");
  });

  it("never calls a cross-root or cross-scope target source-missing", () => {
    const foreignScopeId = deriveImportSourceScopeId({ ...sourceDescriptor, rootId: "root-other", scopeId: "scope-other" });
    const result = plan(
      [],
      [candidate("missing", "guide.foreign")],
      [target("guide.foreign", "missing", {
        source: { system: source.system, rootId: "root-other", scopeId: "scope-other", sourceScopeId: foreignScopeId, sourceId: "missing", sourceRef: "ai-hub://missing" }
      })]
    );
    expect(result.counts["would-source-missing"]).toBe(0);
    expect(result.items.every((item) => item.action === "excluded")).toBe(true);
    expect(result.errors.map((error) => error.code)).toContain("target.outside_source_scope");
  });

  it("binds candidate references to persisted provenance and blocks stable-ID collisions", () => {
    const nested = plan(
      [sourceRecord("nested", { provenance: { sourceParentId: null, sourcePath: "ai-hub://folder/nested" } })],
      [candidate("nested", "guide.nested", { sourceRef: "ai-hub://folder/nested" })],
      []
    );
    expect(nested.classificationComplete).toBe(true);
    expect(nested.counts["would-create"]).toBe(1);

    const collision = plan(
      [sourceRecord("same")],
      [candidate("same", "guide.same")],
      [target("guide.same", "other")]
    );
    expect(collision.classificationComplete).toBe(false);
    expect(collision.counts["would-create"]).toBe(0);
    expect(collision.errors.map((error) => error.code)).toContain("target.stable_source_mismatch");
  });

  it("does not call a present-but-unmapped source missing", () => {
    const result = plan([sourceRecord("present")], [], [target("guide.present", "present")]);
    expect(result.counts["would-source-missing"]).toBe(0);
    expect(result.classificationComplete).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("source.unmapped");
  });

  it("only calls source-missing when the complete exact source scope and candidate binding prove absence", () => {
    const result = plan([], [candidate("ghost", "guide.ghost")], [target("guide.ghost", "ghost")]);
    expect(result.classificationComplete).toBe(true);
    expect(result.counts["would-source-missing"]).toBe(2);

    const unmapped = plan([], [], [target("guide.ghost", "ghost")]);
    expect(unmapped.counts["would-source-missing"]).toBe(0);
    expect(unmapped.classificationComplete).toBe(false);
  });

  it("uses the shared governed-v1 helper for fixed ASCII and non-ASCII vectors while keeping import ordering separate", () => {
    const ascii = governedSnapshot("guide.vector.ascii", { title: "Golden Guide" });
    const asciiExpected = "d96cdb00156cdc1ab4a9a8e77dcf02449a3e244247ef99995a63521a008df529";
    expect(hashGovernedAssetSnapshot(ascii.assetSnapshot, {
      instructionObjects: ascii.instructionObjects.map((instruction) => agentInstructionInputSchema.parse(instruction)),
      humanDocuments: ascii.humanDocuments
    })).toBe(asciiExpected);
    expect(buildImportCandidateFromGovernedSnapshot({
      sourceId: "vector-ascii",
      stableId: ascii.assetSnapshot.stableId,
      sourceRef: "ai-hub://vector-ascii",
      sourceContentSha256: sourceDigest,
      effectiveAccess: access,
      governedSnapshot: ascii
    }).candidateContentHash).toBe(asciiExpected);
    const asciiTarget = buildImportTargetSummaryFromGovernedSnapshot({
      tenantId,
      assetId: "asset-vector-ascii",
      stableId: ascii.assetSnapshot.stableId,
      source: {
        system: source.system,
        rootId: source.rootId,
        scopeId: source.scopeId,
        sourceScopeId: source.sourceScopeId,
        sourceId: "vector-ascii",
        sourceRef: "ai-hub://vector-ascii"
      },
      effectiveAccess: access,
      governedSnapshot: { ...ascii, versionId: "version-vector-ascii" }
    });
    expect(asciiTarget.current.contentHash).toBe(asciiExpected);
    expect(asciiTarget.current.hashVerification).toBe("verified");
    expect(JSON.stringify(asciiTarget)).not.toContain("body");

    const unicode = governedSnapshot("guide.vector.unicode", { title: "Golden Guía — é", summary: "Résumé 東京" });
    const unicodeExpected = "300847a96d6e50043c7df0bc546e458ac772a4bd1d04f74bfe3cee09be750229";
    expect(hashGovernedAssetSnapshot(unicode.assetSnapshot, {
      instructionObjects: unicode.instructionObjects.map((instruction) => agentInstructionInputSchema.parse(instruction)),
      humanDocuments: unicode.humanDocuments
    })).toBe(unicodeExpected);
    expect(buildImportCandidateFromGovernedSnapshot({
      sourceId: "vector-unicode",
      stableId: unicode.assetSnapshot.stableId,
      sourceRef: "ai-hub://vector-unicode",
      sourceContentSha256: sourceDigest,
      effectiveAccess: access,
      governedSnapshot: unicode
    }).candidateContentHash).toBe(unicodeExpected);
    expect(IMPORT_HASH_CONTRACT_VERSION).toBe("governed-v1");

    const localeFixture = { "é": "accent", e: "plain", nested: { "Ω": 2, a: 1 }, list: [{ z: 1, A: 2 }] };
    expect(canonicalizeImportJson(localeFixture)).toBe("{\"e\":\"plain\",\"list\":[{\"A\":2,\"z\":1}],\"nested\":{\"a\":1,\"Ω\":2},\"é\":\"accent\"}");
  });

  it("normalizes IDs but fails closed for whitespace and overlong values", () => {
    const normalized = snapshot([sourceRecord(" source-id ")], { source: { ...sourceDescriptor, system: " ai-hub ", sourceScopeId } });
    expect(normalized.records[0]?.sourceId).toBe("source-id");
    const invalid = planImport({ tenantId: " ".repeat(257), snapshot: normalized, mapping: mapping([candidate("source-id", "guide.source")], normalized), targetManifest: targetManifest([], mapping([candidate("source-id", "guide.source")], normalized)) });
    expect(invalid.classificationComplete).toBe(false);
    expect(invalid.executable).toBe(false);
    expect(invalid.errors[0]?.code).toBe("input.invalid");
  });

  it("returns structured evidence for tampered source scope and checksum fields", () => {
    const sourceSnapshot = snapshot([sourceRecord("scope")]);
    const tamperedSnapshot = { ...sourceSnapshot, source: { ...sourceSnapshot.source, sourceScopeId: deriveImportSourceScopeId({ ...sourceDescriptor, rootId: "other-root" }) } };
    const sourceMapping = mapping([candidate("scope", "guide.scope")], sourceSnapshot);
    const result = planImport({ tenantId, snapshot: tamperedSnapshot, mapping: sourceMapping, targetManifest: targetManifest([], sourceMapping) });
    expect(result.classificationComplete).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("manifest.source_scope_invalid");

    const tamperedChecksum = { ...sourceSnapshot, records: [{ ...sourceSnapshot.records[0], sourceContentSha256: "b".repeat(64) }] };
    const checksumResult = planImport({ tenantId, snapshot: tamperedChecksum, mapping: sourceMapping, targetManifest: targetManifest([], sourceMapping) });
    expect(checksumResult.errors.map((error) => error.code)).toContain("manifest.snapshot_checksum_mismatch");
  });

  it("fails closed for incomplete, truncated, and total-count evidence", () => {
    const incomplete = plan(
      [sourceRecord("partial")],
      [candidate("partial", "guide.partial")],
      [],
      { snapshot: { complete: false }, mapping: { complete: false }, targetManifest: { complete: false } }
    );
    expect(incomplete.classificationComplete).toBe(false);
    expect(incomplete.items.every((item) => item.action === "excluded")).toBe(true);

    const wrongTotal = plan([sourceRecord("wrong-total")], [candidate("wrong-total", "guide.wrong-total")], [], { snapshot: { totalCount: 4 } });
    expect(wrongTotal.classificationComplete).toBe(false);
    expect(wrongTotal.errors.map((error) => error.code)).toContain("source.total_mismatch");

    const truncated = plan([sourceRecord("truncated")], [candidate("truncated", "guide.truncated")], [], { mapping: { truncated: true } });
    expect(truncated.classificationComplete).toBe(false);
    expect(truncated.truncated).toBe(true);
    expect(truncated.items.every((item) => item.action === "excluded")).toBe(true);
  });

  it("rejects candidate/source digest mismatch and untrusted candidate hashes", () => {
    const digestMismatch = plan([sourceRecord("mismatch")], [candidate("mismatch", "guide.mismatch", { sourceContentSha256: "b".repeat(64) })], []);
    expect(digestMismatch.classificationComplete).toBe(false);
    expect(digestMismatch.errors.map((error) => error.code)).toContain("candidate.source_digest_mismatch");

    const rawCandidate = {
      sourceId: "raw",
      stableId: "guide.raw",
      sourceRef: "ai-hub://raw",
      sourceContentSha256: sourceDigest,
      candidateContentHash: "c".repeat(64),
      effectiveAccess: access
    } as ImportCandidateDraft;
    const sourceSnapshot = snapshot([sourceRecord("raw")]);
    const sourceMapping = mapping([rawCandidate], sourceSnapshot);
    const result = planImport({ tenantId, snapshot: sourceSnapshot, mapping: sourceMapping, targetManifest: targetManifest([], sourceMapping) });
    expect(result.classificationComplete).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("candidate.hash_unproven");

    const forgedCandidate = { ...candidate("forged", "guide.forged"), hashEvidence: "typed-governed-v1" } as ImportCandidateDraft;
    const forgedSnapshot = snapshot([sourceRecord("forged")]);
    const forgedMapping = mapping([forgedCandidate], forgedSnapshot);
    const forgedCandidateResult = planImport({
      tenantId,
      snapshot: forgedSnapshot,
      mapping: forgedMapping,
      targetManifest: targetManifest([], forgedMapping)
    });
    expect(forgedCandidateResult.classificationComplete).toBe(false);
    expect(forgedCandidateResult.errors.map((error) => error.code)).toContain("candidate.hash_unproven");

    const forgedTarget = {
      ...target("guide.forged-target", "forged-target"),
      current: { ...target("guide.forged-target", "forged-target").current, hashVerification: "verified", hashEvidence: "typed-governed-v1" }
    } as unknown as ReturnType<typeof target>;
    const forgedTargetResult = plan(
      [sourceRecord("forged-target")],
      [candidate("forged-target", "guide.forged-target")],
      [forgedTarget]
    );
    expect(forgedTargetResult.classificationComplete).toBe(false);
    expect(forgedTargetResult.errors.map((error) => error.code)).toContain("target.hash_unproven");
  });

  it("rejects changed candidate evidence even when the original helper object is retained", () => {
    const changed = candidate("same", "guide.same", { governedSnapshot: governedSnapshot("guide.same", { title: "Changed content" }) });
    const existing = target("guide.same", "same");
    changed.candidateContentHash = existing.current.contentHash!;

    const result = plan([sourceRecord("same")], [changed], [existing]);
    expect(result.classificationComplete).toBe(false);
    expect(result.counts["would-noop"]).toBe(0);
    expect(result.errors.map((error) => error.code)).toContain("candidate.hash_unproven");
  });

  it("rejects changed nested target hashes and access evidence on the original helper object", () => {
    for (const mutation of ["hash", "access"] as const) {
      const existing = buildImportTargetSummaryFromGovernedSnapshot({
        tenantId,
        assetId: "asset-guide.same",
        stableId: "guide.same",
        source: { system: source.system, rootId: source.rootId, scopeId: source.scopeId, sourceScopeId, sourceId: "same", sourceRef: "ai-hub://same" },
        effectiveAccess: access,
        governedSnapshot: { ...governedSnapshot("guide.same"), versionId: "version-1" }
      });
      if (mutation === "hash") existing.current.contentHash = "f".repeat(64);
      else existing.effectiveAccess!.allowedActions.push("write");

      const result = plan([sourceRecord("same")], [candidate("same", "guide.same")], [existing]);
      expect(result.classificationComplete).toBe(false);
      expect(result.items.every((item) => !item.action.startsWith("would-"))).toBe(true);
      expect(result.errors.map((error) => error.code)).toContain("target.hash_unproven");
    }
  });

  it("treats contradictory governed access fields and unknown review states as unproven", () => {
    const overrides: Partial<ReturnType<typeof governedSnapshot>["assetSnapshot"]>[] = [
      { sensitivity: "public-demo" },
      { audience: ["public"] },
      { allowedSurfaces: ["api", "cli", "mcp", "web"] },
      { allowedExports: ["public-pack"] },
      { allowedActions: ["read", "write"] },
      { lifecycleState: "draft" },
      { status: "rejected" },
      { status: "custom-workflow" }
    ];
    for (const override of overrides) {
      const actual = governedSnapshot("guide.bound");
      Object.assign(actual.assetSnapshot, override);
      const candidateResult = plan([sourceRecord("bound")], [candidate("bound", "guide.bound", { governedSnapshot: actual })], []);
      expect(candidateResult.classificationComplete).toBe(false);
      expect(candidateResult.errors.map((error) => error.code)).toContain("candidate.access_unproven");

      const targetResult = plan([sourceRecord("bound")], [candidate("bound", "guide.bound")], [target("guide.bound", "bound", { governedSnapshot: { ...actual, versionId: "version-1" } })]);
      expect(targetResult.classificationComplete).toBe(false);
      expect(targetResult.errors.map((error) => error.code)).toContain("target.access_unproven");
    }
  });

  it("allows an active source to become an unpublished pending draft while rejecting lifecycle promotion", () => {
    const draftAccess: ImportEffectiveAccess = { ...access, lifecycleState: "draft", publicationState: "draft", reviewState: "pending" };
    const draftSnapshot = governedSnapshot("guide.draft", { lifecycleState: "draft" });
    draftSnapshot.assetSnapshot.status = "review";
    const draftCandidate = candidate("draft", "guide.draft", { effectiveAccess: draftAccess, governedSnapshot: draftSnapshot });
    const narrowed = plan([sourceRecord("draft")], [draftCandidate], []);
    expect(narrowed.classificationComplete).toBe(true);
    expect(narrowed.counts["would-create"]).toBe(1);
    expect(narrowed.items[0]).toMatchObject({ proposedLifecycleState: "draft", proposedStatus: "review" });

    const publishedDraft = candidate("draft", "guide.draft", { effectiveAccess: { ...draftAccess, publicationState: "published" }, governedSnapshot: draftSnapshot });
    const unsafeDraft = plan([sourceRecord("draft")], [publishedDraft], []);
    expect(unsafeDraft.classificationComplete).toBe(false);
    expect(unsafeDraft.errors.map((error) => error.code)).toContain("candidate.access_widened");

    const promoted = plan([sourceRecord("draft", { effectiveAccess: draftAccess })], [candidate("draft", "guide.draft", { effectiveAccess: { ...access, publicationState: "draft", reviewState: "pending" }, governedSnapshot: { ...governedSnapshot("guide.draft"), assetSnapshot: { ...governedSnapshot("guide.draft").assetSnapshot, status: "review" } } })], []);
    expect(promoted.classificationComplete).toBe(false);
    expect(promoted.errors.map((error) => error.code)).toContain("candidate.access_widened");
  });

  it("accepts bounded governed draft requests and rejects caller hash, identity, and target assertions", () => {
    const { checksum: _checksum, source: { queryScopeDigest: _queryScopeDigest, ...sourceDraft }, ...snapshotFields } = snapshot([sourceRecord("request")]);
    const draftRequest = {
      snapshot: { ...snapshotFields, source: sourceDraft },
      candidates: [{ sourceId: "request", sourceContentSha256: sourceDigest, effectiveAccess: access, governedSnapshot: governedSnapshot("guide.request") }]
    };
    const parsed = importPlanRequestSchema.parse(draftRequest);
    expect(parsed.tenantId).toBe("tenant_demo");
    expect(importPlanRequestSchema.safeParse({ ...draftRequest, tenantId, candidates: [{ ...draftRequest.candidates[0], effectiveAccess: null }] }).success).toBe(true);
    expect(importPlanRequestSchema.safeParse({ ...draftRequest, candidates: Array.from({ length: 201 }, () => draftRequest.candidates[0]) }).success).toBe(false);
    for (const field of ["candidateContentHash", "hashEvidence", "hashContractVersion", "stableId", "sourceRef"]) {
      expect(importPlanRequestSchema.safeParse({ ...draftRequest, candidates: [{ ...draftRequest.candidates[0], [field]: "caller-authored" }] }).success).toBe(false);
    }
    expect(importPlanRequestSchema.safeParse({ ...draftRequest, targetManifest: {} }).success).toBe(false);
  });

  it("validates source parent membership, self-parenting, cycles, and exact source paths", () => {
    const result = plan(
      [
        sourceRecord("a", { provenance: { sourceParentId: "missing", sourcePath: "other://a" } }),
        sourceRecord("b", { provenance: { sourceParentId: "c", sourcePath: "ai-hub://b" } }),
        sourceRecord("c", { provenance: { sourceParentId: "b", sourcePath: "ai-hub://c" } }),
        sourceRecord("self", { provenance: { sourceParentId: "self", sourcePath: "ai-hub://self" } })
      ],
      [candidate("a", "guide.a"), candidate("b", "guide.b"), candidate("c", "guide.c"), candidate("self", "guide.self")],
      []
    );
    expect(result.classificationComplete).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "source.parent_missing",
      "source.parent_cycle",
      "source.parent_self",
      "source.path_outside_scope"
    ]));
  });

  it("treats duplicate exact source identities as target collisions and remains deterministic", () => {
    const targets = [target("guide.same", "same"), target("guide.same-again", "same", { assetId: "asset-other" })];
    const first = plan([sourceRecord("same")], [candidate("same", "guide.same")], targets);
    const second = plan([sourceRecord("same")], [candidate("same", "guide.same")], [...targets].reverse());
    expect(first).toEqual(second);
    expect(first.classificationComplete).toBe(false);
    expect(first.counts["would-noop"]).toBe(0);
    expect(first.errors.map((error) => error.code)).toContain("target.source_identity_duplicate");
    expect(first.items.filter((item) => item.entity === "target")).toHaveLength(2);
  });

  it("keeps full deterministic digest while bounding evidence and refusing actionable conclusions", () => {
    const records = Array.from({ length: 1_001 }, (_, index) => sourceRecord(`source-${String(index).padStart(4, "0")}`));
    const candidates = records.map((record) => candidate(record.sourceId, `guide.${record.sourceId}`));
    const result = plan(records, candidates, []);
    expect(result.classificationComplete).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(1_000);
    expect(result.summary.sourceCount).toBe(1_001);
    expect(result.summary.classifiedSourceCount).toBe(1_001);
    expect(result.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.items.every((item) => item.action === "excluded")).toBe(true);
  });
});
