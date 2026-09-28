import { createHash } from "node:crypto";
import { z } from "zod";
import {
  agentInstructionInputSchema,
  assetVersionAssetSnapshotSchema,
  humanDocumentInputSchema,
  lifecycleStateSchema,
  permissionActionSchema,
  permissionPrincipalTypeSchema,
  sensitivitySchema,
  surfaceSchema,
  type AgentInstructionInput,
  type AssetVersionAssetSnapshot,
  type HumanDocumentInput
} from "./index.js";
import {
  GOVERNED_HASH_CONTRACT_VERSION,
  hashGovernedAssetSnapshot,
  type GovernedVersionContent
} from "./governed-hash.js";

/** This is a report-only contract. It is not an import or apply request. */
export const importManifestVersion = "3" as const;
export const IMPORT_MANIFEST_VERSION = importManifestVersion;
export const importHashContractVersion = GOVERNED_HASH_CONTRACT_VERSION;
export const IMPORT_HASH_CONTRACT_VERSION = importHashContractVersion;
export const importSourceScopeVersion = "1" as const;
export const IMPORT_SOURCE_SCOPE_VERSION = importSourceScopeVersion;
export const importQueryScopeVersion = "1" as const;
export const IMPORT_QUERY_SCOPE_VERSION = importQueryScopeVersion;
export const importAccessContractVersion = "effective-access-v1" as const;
export const IMPORT_ACCESS_CONTRACT_VERSION = importAccessContractVersion;
export const importCanonicalizerVersion = "import-json-v1" as const;
export const IMPORT_CANONICALIZER_VERSION = importCanonicalizerVersion;
export const importReportContract = "classification-report-only-v1" as const;
export const IMPORT_REPORT_CONTRACT = importReportContract;
export const importApplyAcceptance = "not-accepted-by-future-apply-schema" as const;
export const IMPORT_APPLY_ACCEPTANCE = importApplyAcceptance;

const MAX_MANIFEST_RECORDS = 5_000;
const MAX_EVIDENCE_ITEMS = 1_000;
const computedCandidateEvidence = new WeakMap<object, string>();
const computedTargetEvidence = new WeakMap<object, string>();
const identifierSchema = z.string().trim().min(1).max(256);
const referenceSchema = z.string().trim().min(1).max(1_024);
const revisionSchema = z.string().trim().min(1).max(256);
const sha256Schema = z.string().trim().regex(/^[a-f0-9]{64}$/);
const sourceScopeIdSchema = z.string().trim().regex(new RegExp(`^source-scope-v${importSourceScopeVersion}-[a-f0-9]{64}$`));
const optionalSha256Schema = sha256Schema.nullable();
const audienceSchema = z.array(identifierSchema).max(256).min(1)
  .refine((values) => new Set(values).size === values.length, "Values must be unique");
const surfaceListSchema = z.array(surfaceSchema).max(5).min(1)
  .refine((values) => new Set(values).size === values.length, "Values must be unique");
const optionalStringListSchema = z.array(identifierSchema).max(256)
  .refine((values) => new Set(values).size === values.length, "Values must be unique");
const sourceScopeShape = {
  system: identifierSchema,
  rootId: identifierSchema,
  scopeId: identifierSchema,
  sourceRefPrefix: referenceSchema
};
const sourceScopeDraftSchema = z.object({
  ...sourceScopeShape,
  sourceScopeId: sourceScopeIdSchema.optional()
}).strict();
const sourceScopeDescriptorSchema = z.object(sourceScopeShape).strict();

export const importSourceIdentitySchema = sourceScopeDescriptorSchema.extend({
  sourceScopeId: sourceScopeIdSchema,
  queryScopeDigest: sha256Schema
}).strict();

export type ImportSourceIdentity = z.infer<typeof importSourceIdentitySchema>;

const continuationSchema = z.object({
  version: z.literal("continuation-v1"),
  complete: z.boolean(),
  nextCursor: referenceSchema.nullable(),
  proof: z.enum(["exhaustive", "cursor"])
}).strict().superRefine((value, context) => {
  if (value.complete && (value.nextCursor !== null || value.proof !== "exhaustive")) {
    context.addIssue({ code: "custom", message: "A complete read must carry exhaustive continuation proof" });
  }
  if (!value.complete && (value.nextCursor === null || value.proof !== "cursor")) {
    context.addIssue({ code: "custom", message: "An incomplete read must carry a continuation cursor" });
  }
});

const publicationStateSchema = z.enum(["draft", "published"]);
const reviewStateSchema = z.enum(["pending", "approved", "rejected"]);
const effectiveGrantSchema = z.object({
  principalType: permissionPrincipalTypeSchema,
  principalId: identifierSchema,
  action: permissionActionSchema,
  surface: surfaceSchema,
  exportName: identifierSchema.nullable()
}).strict();

/** A complete effective-access descriptor. Fingerprints are derived, never supplied. */
export const importEffectiveAccessSchema = z.object({
  accessContractVersion: z.literal(IMPORT_ACCESS_CONTRACT_VERSION),
  lifecycleState: lifecycleStateSchema,
  publicationState: publicationStateSchema,
  reviewState: reviewStateSchema,
  sensitivity: sensitivitySchema,
  audience: audienceSchema,
  allowedSurfaces: surfaceListSchema,
  allowedExports: optionalStringListSchema,
  allowedActions: optionalStringListSchema,
  effectiveGrants: z.array(effectiveGrantSchema).max(2_000)
    .refine((values) => new Set(values.map((value) => canonicalizeImportJson(value))).size === values.length, "Effective grants must be unique")
}).strict();

export type ImportEffectiveAccess = z.infer<typeof importEffectiveAccessSchema>;

export const importProvenanceSchema = z.object({
  sourceScopeId: sourceScopeIdSchema,
  sourceSystem: identifierSchema,
  sourceRootId: identifierSchema,
  sourceId: identifierSchema,
  sourceParentId: identifierSchema.nullable(),
  sourceRevision: revisionSchema,
  snapshotId: identifierSchema,
  sourcePath: referenceSchema.nullable()
}).strict();
const provenanceDraftSchema = importProvenanceSchema.partial();

export type ImportProvenance = z.infer<typeof importProvenanceSchema>;

const snapshotRecordDraftSchema = z.object({
  sourceId: identifierSchema,
  sourceContentSha256: sha256Schema,
  effectiveAccess: importEffectiveAccessSchema.nullable().optional(),
  provenance: provenanceDraftSchema
}).strict();

export const importSnapshotRecordSchema = z.object({
  sourceId: identifierSchema,
  sourceContentSha256: sha256Schema,
  effectiveAccess: importEffectiveAccessSchema.nullable(),
  provenance: importProvenanceSchema
}).strict();

export type ImportSnapshotRecord = z.infer<typeof importSnapshotRecordSchema>;

const snapshotManifestDraftSchema = z.object({
  schemaVersion: z.literal(IMPORT_MANIFEST_VERSION),
  kind: z.literal("forgetbase.import-snapshot"),
  snapshotId: identifierSchema,
  source: sourceScopeDraftSchema,
  capturedAt: z.string().datetime(),
  sourceReadRevision: revisionSchema,
  queryScopeDigest: sha256Schema.optional(),
  correlationId: identifierSchema,
  complete: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  continuation: continuationSchema,
  records: z.array(snapshotRecordDraftSchema).max(MAX_MANIFEST_RECORDS),
  truncated: z.boolean()
}).strict();

export const importSnapshotManifestSchema = z.object({
  schemaVersion: z.literal(IMPORT_MANIFEST_VERSION),
  kind: z.literal("forgetbase.import-snapshot"),
  snapshotId: identifierSchema,
  source: importSourceIdentitySchema,
  capturedAt: z.string().datetime(),
  sourceReadRevision: revisionSchema,
  correlationId: identifierSchema,
  complete: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  continuation: continuationSchema,
  records: z.array(importSnapshotRecordSchema).max(MAX_MANIFEST_RECORDS),
  truncated: z.boolean(),
  checksum: sha256Schema
}).strict();

export type ImportSnapshotManifest = z.infer<typeof importSnapshotManifestSchema>;
export type ImportSnapshotManifestDraft = z.input<typeof snapshotManifestDraftSchema>;

const governedSnapshotSchema = z.object({
  assetSnapshot: assetVersionAssetSnapshotSchema,
  instructionObjects: z.array(agentInstructionInputSchema),
  humanDocuments: z.array(humanDocumentInputSchema)
}).strict();

type GovernedSnapshotInput = z.input<typeof governedSnapshotSchema>;

export const importPlanRequestSchema = z.object({
  tenantId: identifierSchema.default("tenant_demo"),
  snapshot: snapshotManifestDraftSchema,
  candidates: z.array(z.object({
    sourceId: identifierSchema,
    sourceContentSha256: sha256Schema,
    effectiveAccess: importEffectiveAccessSchema.nullable(),
    governedSnapshot: governedSnapshotSchema
  }).strict()).max(200)
}).strict();

export type ImportPlanRequest = z.input<typeof importPlanRequestSchema>;

const candidateDraftSchema = z.object({
  sourceId: identifierSchema,
  stableId: identifierSchema,
  sourceRef: referenceSchema,
  sourceContentSha256: sha256Schema,
  hashContractVersion: identifierSchema.optional(),
  candidateContentHash: sha256Schema.optional(),
  hashEvidence: z.literal("typed-governed-v1").nullable().optional(),
  effectiveAccess: importEffectiveAccessSchema.nullable().optional(),
  governedSnapshot: governedSnapshotSchema.optional()
}).strict();

export const importCandidateSchema = z.object({
  sourceId: identifierSchema,
  stableId: identifierSchema,
  sourceRef: referenceSchema,
  sourceContentSha256: sha256Schema,
  hashContractVersion: identifierSchema,
  candidateContentHash: sha256Schema,
  hashEvidence: z.literal("typed-governed-v1").nullable(),
  effectiveAccess: importEffectiveAccessSchema.nullable()
}).strict();

export type ImportCandidate = z.infer<typeof importCandidateSchema>;
export type ImportCandidateDraft = z.input<typeof candidateDraftSchema>;

const mappingManifestDraftSchema = z.object({
  schemaVersion: z.literal(IMPORT_MANIFEST_VERSION),
  kind: z.literal("forgetbase.import-mapping"),
  snapshotId: identifierSchema,
  snapshotChecksum: sha256Schema,
  sourceScopeId: sourceScopeIdSchema,
  sourceReadRevision: revisionSchema,
  queryScopeDigest: sha256Schema,
  correlationId: identifierSchema,
  complete: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  continuation: continuationSchema,
  mappings: z.array(z.object({ candidate: candidateDraftSchema }).strict()).max(MAX_MANIFEST_RECORDS),
  truncated: z.boolean()
}).strict();

export const importMappingEntrySchema = z.object({ candidate: importCandidateSchema }).strict();

export const importMappingManifestSchema = z.object({
  schemaVersion: z.literal(IMPORT_MANIFEST_VERSION),
  kind: z.literal("forgetbase.import-mapping"),
  snapshotId: identifierSchema,
  snapshotChecksum: sha256Schema,
  sourceScopeId: sourceScopeIdSchema,
  sourceReadRevision: revisionSchema,
  queryScopeDigest: sha256Schema,
  correlationId: identifierSchema,
  complete: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  continuation: continuationSchema,
  mappings: z.array(importMappingEntrySchema).max(MAX_MANIFEST_RECORDS),
  truncated: z.boolean(),
  checksum: sha256Schema
}).strict();

export type ImportMappingEntry = z.infer<typeof importMappingEntrySchema>;
export type ImportMappingManifest = z.infer<typeof importMappingManifestSchema>;
export type ImportMappingManifestDraft = z.input<typeof mappingManifestDraftSchema>;

const targetSourceIdentityDraftSchema = z.object({
  system: identifierSchema.nullable().optional(),
  rootId: identifierSchema.nullable().optional(),
  scopeId: identifierSchema.nullable().optional(),
  sourceScopeId: sourceScopeIdSchema.nullable().optional(),
  sourceId: identifierSchema.nullable().optional(),
  sourceRef: referenceSchema.nullable().optional()
}).strict();

export const importTargetSourceIdentitySchema = z.object({
  system: identifierSchema.nullable(),
  rootId: identifierSchema.nullable(),
  scopeId: identifierSchema.nullable(),
  sourceScopeId: sourceScopeIdSchema.nullable(),
  sourceId: identifierSchema.nullable(),
  sourceRef: referenceSchema.nullable()
}).strict();

const targetCurrentStateDraftSchema = z.object({
  versionId: identifierSchema.nullable(),
  contentHash: optionalSha256Schema,
  hashVerification: z.enum(["verified", "unverified", "legacy", "missing"]).optional(),
  hashEvidence: z.literal("typed-governed-v1").nullable().optional()
}).strict();

const targetCurrentStateSchema = z.object({
  versionId: identifierSchema.nullable(),
  contentHash: optionalSha256Schema,
  hashVerification: z.enum(["verified", "unverified", "legacy", "missing"]),
  hashEvidence: z.literal("typed-governed-v1").nullable()
}).strict();

const targetSummaryDraftSchema = z.object({
  tenantId: identifierSchema,
  assetId: identifierSchema,
  stableId: identifierSchema,
  source: targetSourceIdentityDraftSchema,
  current: targetCurrentStateDraftSchema,
  effectiveAccess: importEffectiveAccessSchema.nullable().optional(),
  governedSnapshot: governedSnapshotSchema.extend({ versionId: identifierSchema }).optional()
}).strict();
const governedTargetSummaryInputSchema = targetSummaryDraftSchema.omit({ current: true });

export const importTargetSummarySchema = z.object({
  tenantId: identifierSchema,
  assetId: identifierSchema,
  stableId: identifierSchema,
  source: importTargetSourceIdentitySchema,
  current: targetCurrentStateSchema,
  effectiveAccess: importEffectiveAccessSchema.nullable()
}).strict();

export type ImportTargetSummary = z.infer<typeof importTargetSummarySchema>;
export type ImportTargetSummaryDraft = z.input<typeof targetSummaryDraftSchema>;

const targetManifestDraftSchema = z.object({
  schemaVersion: z.literal(IMPORT_MANIFEST_VERSION),
  kind: z.literal("forgetbase.import-target-state"),
  tenantId: identifierSchema,
  sourceScopeId: sourceScopeIdSchema,
  targetSnapshotId: identifierSchema,
  correlationId: identifierSchema,
  capturedAt: z.string().datetime(),
  targetReadRevision: revisionSchema,
  hashContractVersion: identifierSchema,
  mappingChecksum: sha256Schema,
  queryScopeDigest: sha256Schema,
  complete: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  continuation: continuationSchema,
  targets: z.array(targetSummaryDraftSchema).max(MAX_MANIFEST_RECORDS),
  truncated: z.boolean()
}).strict();

export const importTargetManifestSchema = z.object({
  schemaVersion: z.literal(IMPORT_MANIFEST_VERSION),
  kind: z.literal("forgetbase.import-target-state"),
  tenantId: identifierSchema,
  sourceScopeId: sourceScopeIdSchema,
  targetSnapshotId: identifierSchema,
  correlationId: identifierSchema,
  capturedAt: z.string().datetime(),
  targetReadRevision: revisionSchema,
  hashContractVersion: identifierSchema,
  mappingChecksum: sha256Schema,
  queryScopeDigest: sha256Schema,
  complete: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  continuation: continuationSchema,
  targets: z.array(importTargetSummarySchema).max(MAX_MANIFEST_RECORDS),
  truncated: z.boolean(),
  checksum: sha256Schema
}).strict();

export type ImportTargetManifest = z.infer<typeof importTargetManifestSchema>;
export type ImportTargetManifestDraft = z.input<typeof targetManifestDraftSchema>;

export const importPlanActionSchema = z.enum([
  "would-create",
  "would-update-version",
  "would-noop",
  "would-source-missing",
  "conflict",
  "excluded"
]);
export const importPlanEntitySchema = z.enum(["source", "target"]);

export const importPlanItemSchema = z.object({
  entity: importPlanEntitySchema,
  action: importPlanActionSchema,
  tenantId: identifierSchema.nullable(),
  sourceScopeId: sourceScopeIdSchema.nullable(),
  sourceId: identifierSchema.nullable(),
  stableId: identifierSchema.nullable(),
  targetAssetId: identifierSchema.nullable(),
  sourceContentSha256: sha256Schema.nullable(),
  candidateContentHash: sha256Schema.nullable(),
  currentContentHash: sha256Schema.nullable(),
  currentHashVerification: z.enum(["verified", "unverified", "legacy", "missing"]).nullable(),
  proposedLifecycleState: z.literal("draft").nullable(),
  proposedStatus: z.literal("review").nullable(),
  reason: z.string().trim().min(1).max(500)
}).strict();

export type ImportPlanAction = z.infer<typeof importPlanActionSchema>;
export type ImportPlanItem = z.infer<typeof importPlanItemSchema>;

export const importPlanIssueSchema = z.object({
  code: identifierSchema,
  entity: importPlanEntitySchema.nullable(),
  tenantId: identifierSchema.nullable(),
  sourceId: identifierSchema.nullable(),
  stableId: identifierSchema.nullable(),
  targetAssetId: identifierSchema.nullable(),
  reason: z.string().trim().min(1).max(500)
}).strict();

export type ImportPlanIssue = z.infer<typeof importPlanIssueSchema>;

const countsSchema = z.object({
  "would-create": z.number().int().nonnegative(),
  "would-update-version": z.number().int().nonnegative(),
  "would-noop": z.number().int().nonnegative(),
  "would-source-missing": z.number().int().nonnegative(),
  conflict: z.number().int().nonnegative(),
  excluded: z.number().int().nonnegative()
}).strict();

export const importPlanSchema = z.object({
  schemaVersion: z.literal(IMPORT_MANIFEST_VERSION),
  reportType: z.literal(IMPORT_REPORT_CONTRACT),
  applyAcceptance: z.literal(IMPORT_APPLY_ACCEPTANCE),
  classificationComplete: z.boolean(),
  executable: z.literal(false),
  safeToApply: z.literal(false),
  tenantId: identifierSchema.nullable(),
  sourceScopeId: sourceScopeIdSchema.nullable(),
  queryScopeDigest: sha256Schema.nullable(),
  sourceReadRevision: revisionSchema.nullable(),
  targetReadRevision: revisionSchema.nullable(),
  correlationId: identifierSchema.nullable(),
  snapshotId: identifierSchema.nullable(),
  snapshotChecksum: sha256Schema.nullable(),
  mappingChecksum: sha256Schema.nullable(),
  targetSnapshotId: identifierSchema.nullable(),
  targetManifestChecksum: sha256Schema.nullable(),
  planDigest: sha256Schema,
  summary: z.object({
    sourceCount: z.number().int().nonnegative(),
    targetCount: z.number().int().nonnegative(),
    classifiedSourceCount: z.number().int().nonnegative(),
    classifiedTargetCount: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative()
  }).strict(),
  counts: countsSchema,
  items: z.array(importPlanItemSchema).max(MAX_EVIDENCE_ITEMS),
  errors: z.array(importPlanIssueSchema).max(MAX_EVIDENCE_ITEMS),
  truncated: z.boolean()
}).strict();

export type ImportPlan = z.infer<typeof importPlanSchema>;

const importPlannerInputSchema = z.object({
  tenantId: identifierSchema,
  snapshot: importSnapshotManifestSchema,
  mapping: importMappingManifestSchema,
  targetManifest: importTargetManifestSchema
}).strict();

export type ImportPlannerInput = z.input<typeof importPlannerInputSchema>;

/** Derive the one persisted source-root/scope identity. */
export function deriveImportSourceScopeId(input: {
  system: string;
  rootId: string;
  scopeId: string;
  sourceRefPrefix: string;
  sourceScopeId?: string;
}): string {
  const parsed = sourceScopeDraftSchema.parse(input);
  const descriptor = sourceScopeDescriptorSchema.parse({
    system: parsed.system,
    rootId: parsed.rootId,
    scopeId: parsed.scopeId,
    sourceRefPrefix: parsed.sourceRefPrefix
  });
  const sourceScopeId = `source-scope-v${importSourceScopeVersion}-${digest({
    sourceScopeVersion: importSourceScopeVersion,
    descriptor
  })}`;
  if (parsed.sourceScopeId !== undefined && parsed.sourceScopeId !== sourceScopeId) {
    throw new Error("Persisted source scope ID does not match its declared identity");
  }
  return sourceScopeId;
}

export function deriveImportQueryScopeDigest(sourceScopeId: string): string {
  const parsed = sourceScopeIdSchema.parse(sourceScopeId);
  return digest({ queryScopeVersion: importQueryScopeVersion, sourceScopeId: parsed });
}

export function buildImportSnapshot(input: ImportSnapshotManifestDraft): ImportSnapshotManifest {
  const parsed = snapshotManifestDraftSchema.parse(input);
  const source = resolveSourceIdentity(parsed.source);
  const queryScopeDigest = deriveImportQueryScopeDigest(source.sourceScopeId);
  if (parsed.queryScopeDigest !== undefined && parsed.queryScopeDigest !== queryScopeDigest) {
    throw new Error("Query scope digest does not match the source scope");
  }
  const records = parsed.records.map((record) => normalizeSnapshotRecord(
    record,
    source,
    parsed.snapshotId,
    parsed.sourceReadRevision
  ));
  const payload = {
    schemaVersion: parsed.schemaVersion,
    kind: parsed.kind,
    snapshotId: parsed.snapshotId,
    source: { ...source, queryScopeDigest },
    capturedAt: parsed.capturedAt,
    sourceReadRevision: parsed.sourceReadRevision,
    correlationId: parsed.correlationId,
    complete: parsed.complete,
    totalCount: parsed.totalCount,
    continuation: parsed.continuation,
    records: sortRecords(records),
    truncated: parsed.truncated
  };
  return withChecksum(importSnapshotManifestSchema, payload);
}

export function buildImportCandidateFromGovernedSnapshot(input: {
  sourceId: string;
  stableId: string;
  sourceRef: string;
  sourceContentSha256: string;
  effectiveAccess: ImportEffectiveAccess | null;
  governedSnapshot: GovernedSnapshotInput;
}): ImportCandidate {
  const candidate = candidateDraftSchema.parse(input);
  const governedSnapshot = governedSnapshotSchema.parse(candidate.governedSnapshot);
  if (governedSnapshot.assetSnapshot.stableId !== candidate.stableId) {
    throw new Error("Governed candidate snapshot stable ID does not match the candidate");
  }
  const { governedSnapshot: _governedSnapshot, ...candidateFields } = candidate;
  const result = importCandidateSchema.parse({
    ...candidateFields,
    hashContractVersion: IMPORT_HASH_CONTRACT_VERSION,
    candidateContentHash: hashGovernedSnapshotInput(governedSnapshot),
    hashEvidence: "typed-governed-v1",
    effectiveAccess: bindGovernedAccess(candidateFields.effectiveAccess, governedSnapshot.assetSnapshot)
  });
  computedCandidateEvidence.set(result, digest(result));
  return result;
}

export function buildImportMappingManifest(input: ImportMappingManifestDraft): ImportMappingManifest {
  const computedCandidateIndexes = new Set(
    input.mappings.map((entry, index) => hasComputedEvidence(entry.candidate, computedCandidateEvidence) ? index : -1)
  );
  const parsed = mappingManifestDraftSchema.parse(input);
  const mappings = parsed.mappings.map(({ candidate }, index) => ({ candidate: normalizeCandidate(candidate, computedCandidateIndexes.has(index)) }));
  const payload = {
    schemaVersion: parsed.schemaVersion,
    kind: parsed.kind,
    snapshotId: parsed.snapshotId,
    snapshotChecksum: parsed.snapshotChecksum,
    sourceScopeId: parsed.sourceScopeId,
    sourceReadRevision: parsed.sourceReadRevision,
    queryScopeDigest: parsed.queryScopeDigest,
    correlationId: parsed.correlationId,
    complete: parsed.complete,
    totalCount: parsed.totalCount,
    continuation: parsed.continuation,
    mappings: sortMappings(mappings),
    truncated: parsed.truncated
  };
  return withChecksum(importMappingManifestSchema, payload);
}

export function buildImportTargetSummaryFromGovernedSnapshot(input: {
  tenantId: string;
  assetId: string;
  stableId: string;
  source: ImportTargetSummaryDraft["source"];
  effectiveAccess: ImportEffectiveAccess | null;
  governedSnapshot: GovernedSnapshotInput & { versionId: string };
}): ImportTargetSummary {
  const target = governedTargetSummaryInputSchema.parse(input);
  const governedSnapshot = governedSnapshotSchema.extend({ versionId: identifierSchema }).parse(target.governedSnapshot);
  if (governedSnapshot.assetSnapshot.stableId !== target.stableId) {
    throw new Error("Governed target snapshot stable ID does not match the target");
  }
  const { governedSnapshot: _governedSnapshot, ...targetFields } = target;
  const result = importTargetSummarySchema.parse({
    ...targetFields,
    current: {
      versionId: governedSnapshot.versionId,
      contentHash: hashGovernedSnapshotInput(governedSnapshot),
      hashVerification: "verified",
      hashEvidence: "typed-governed-v1"
    },
    effectiveAccess: bindGovernedAccess(targetFields.effectiveAccess, governedSnapshot.assetSnapshot)
  });
  computedTargetEvidence.set(result, digest(result));
  return result;
}

export function buildImportTargetManifest(input: ImportTargetManifestDraft): ImportTargetManifest {
  const computedTargetIndexes = new Set(
    input.targets.map((target, index) => hasComputedEvidence(target, computedTargetEvidence) ? index : -1)
  );
  const parsed = targetManifestDraftSchema.parse(input);
  const targets = parsed.targets.map((target, index) => normalizeTargetSummary(target, computedTargetIndexes.has(index)));
  const payload = {
    schemaVersion: parsed.schemaVersion,
    kind: parsed.kind,
    tenantId: parsed.tenantId,
    sourceScopeId: parsed.sourceScopeId,
    targetSnapshotId: parsed.targetSnapshotId,
    correlationId: parsed.correlationId,
    capturedAt: parsed.capturedAt,
    targetReadRevision: parsed.targetReadRevision,
    hashContractVersion: parsed.hashContractVersion,
    mappingChecksum: parsed.mappingChecksum,
    queryScopeDigest: parsed.queryScopeDigest,
    complete: parsed.complete,
    totalCount: parsed.totalCount,
    continuation: parsed.continuation,
    targets: sortTargets(targets),
    truncated: parsed.truncated
  };
  return withChecksum(importTargetManifestSchema, payload);
}

function withChecksum<T>(schema: { parse(value: unknown): T }, payload: Record<string, unknown>): T {
  return schema.parse({ ...payload, checksum: digest(payload) });
}

export function planImport(input: unknown): ImportPlan {
  let parsed: ReturnType<typeof importPlannerInputSchema.safeParse>;
  try {
    parsed = importPlannerInputSchema.safeParse(input);
  } catch {
    return makePlan({
      tenantId: safeIdentifier(input, "tenantId"),
      sourceScopeId: null,
      queryScopeDigest: null,
      sourceReadRevision: null,
      targetReadRevision: null,
      correlationId: null,
      snapshotId: null,
      snapshotChecksum: null,
      mappingChecksum: null,
      targetSnapshotId: null,
      targetManifestChecksum: null,
      sourceCount: 0,
      targetCount: 0,
      items: [],
      errors: [issueFor("input.invalid", null, null, null, null, "Input could not be parsed safely")],
      truncated: true,
      classificationComplete: false
    });
  }
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, MAX_EVIDENCE_ITEMS).map((issue) => issueFor(
      "input.invalid",
      null,
      null,
      null,
      null,
      `${issue.path.map(String).join(".") || "input"} is invalid`
    ));
    return makePlan({
      tenantId: safeIdentifier(input, "tenantId"),
      sourceScopeId: null,
      queryScopeDigest: null,
      sourceReadRevision: null,
      targetReadRevision: null,
      correlationId: null,
      snapshotId: null,
      snapshotChecksum: null,
      mappingChecksum: null,
      targetSnapshotId: null,
      targetManifestChecksum: null,
      sourceCount: 0,
      targetCount: 0,
      items: [],
      errors,
      truncated: errors.length < parsed.error.issues.length || hasRawTruncation(input),
      classificationComplete: false
    });
  }

  try {
    return planParsedImport(parsed.data);
  } catch {
    return makePlan({
      tenantId: parsed.data.tenantId,
      sourceScopeId: parsed.data.snapshot.source.sourceScopeId,
      queryScopeDigest: parsed.data.snapshot.source.queryScopeDigest,
      sourceReadRevision: parsed.data.snapshot.sourceReadRevision,
      targetReadRevision: parsed.data.targetManifest.targetReadRevision,
      correlationId: parsed.data.targetManifest.correlationId,
      snapshotId: parsed.data.snapshot.snapshotId,
      snapshotChecksum: parsed.data.snapshot.checksum,
      mappingChecksum: parsed.data.mapping.checksum,
      targetSnapshotId: parsed.data.targetManifest.targetSnapshotId,
      targetManifestChecksum: parsed.data.targetManifest.checksum,
      sourceCount: uniqueSourceIds(parsed.data.snapshot, parsed.data.mapping),
      targetCount: uniqueTargetIds(parsed.data.targetManifest),
      items: [],
      errors: [issueFor("input.invalid", null, null, null, null, "Input could not be normalized safely")],
      truncated: true,
      classificationComplete: false
    });
  }
}

type ManifestCheckIssue = { code: string; reason: string };

function planParsedImport(input: z.output<typeof importPlannerInputSchema>): ImportPlan {
  const { snapshot, mapping, targetManifest, tenantId } = input;
  const items: ImportPlanItem[] = [];
  const errors: ImportPlanIssue[] = [];
  const itemKeys = new Set<string>();
  const issueKeys = new Set<string>();
  const targetItems = new Map<string, ImportPlanItem>();
  const sourceClassifications = new Map<string, { item: ImportPlanItem; candidate: ImportCandidate | null; target: ImportTargetSummary | null }>();
  const truncated = snapshot.truncated || mapping.truncated || targetManifest.truncated;

  const addIssue = (issue: ImportPlanIssue): void => {
    const key = canonicalizeImportJson([
      issue.code,
      issue.entity,
      issue.tenantId,
      issue.sourceId,
      issue.stableId,
      issue.targetAssetId
    ]);
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    errors.push(issue);
  };
  const addItem = (item: ImportPlanItem): void => {
    const identity = item.entity === "target"
      ? canonicalizeImportJson([item.entity, item.targetAssetId])
      : canonicalizeImportJson([item.entity, item.sourceId]);
    if (!itemKeys.has(identity)) {
      itemKeys.add(identity);
      items.push(item);
    }
  };

  const manifestValid = verifyManifests(snapshot, mapping, targetManifest, tenantId, addIssue);
  const recordsBySourceId = groupBy(sortRecords(snapshot.records), (record) => record.sourceId);
  const mappings = sortMappings(mapping.mappings);
  const mappingsBySourceId = groupBy(mappings, (entry) => entry.candidate.sourceId);
  const mappingsByStableId = groupBy(mappings, (entry) => entry.candidate.stableId);
  const targets = sortTargets(targetManifest.targets);
  const targetsByStableId = groupBy(targets, (target) => target.stableId);
  const targetsByAssetId = groupBy(targets, (target) => target.assetId);
  const targetsBySourceIdentity = groupBy(
    targets.filter((target) => target.source.sourceId && target.source.sourceRef),
    (target) => targetSourceKey(target)
  );
  const sourceIds = sortStrings([...new Set([...recordsBySourceId.keys(), ...mappingsBySourceId.keys()])]);
  const duplicateCandidateStableIds = new Set(
    [...mappingsByStableId.entries()].filter(([, entries]) => entries.length > 1).map(([stableId]) => stableId)
  );
  const targetTerminalIssues = new Map<string, ManifestCheckIssue>();

  for (const targetGroup of targetsByAssetId.values()) {
    if (targetGroup.length > 1) {
      for (const target of targetGroup) {
        targetTerminalIssues.set(target.assetId, { code: "target.asset_duplicate", reason: "Target asset ID is duplicated" });
      }
    }
  }
  for (const targetGroup of targetsByStableId.values()) {
    if (targetGroup.length > 1) {
      for (const target of targetGroup) {
        targetTerminalIssues.set(target.assetId, { code: "target.stable_duplicate", reason: "Target stable ID is duplicated" });
      }
    }
  }
  for (const targetGroup of targetsBySourceIdentity.values()) {
    if (targetGroup.length > 1) {
      for (const target of targetGroup) {
        targetTerminalIssues.set(target.assetId, { code: "target.source_identity_duplicate", reason: "Exact source identity is duplicated in the target manifest" });
      }
    }
  }

  for (const sourceId of sourceIds) {
    const recordGroup = recordsBySourceId.get(sourceId) ?? [];
    const record = recordGroup[0] ?? null;
    const entries = mappingsBySourceId.get(sourceId) ?? [];
    const candidate = entries[0]?.candidate ?? null;
    let item: ImportPlanItem;
    let target: ImportTargetSummary | null = null;

    if (!manifestValid || !snapshot.complete || !mapping.complete || !targetManifest.complete || truncated) {
      item = sourceItem("excluded", tenantId, record, candidate, "Authority or completeness proof is unavailable");
    } else if (recordGroup.length > 1) {
      addIssue(issueFor("source.duplicate", "source", tenantId, sourceId, candidate?.stableId ?? null, "Source identity is duplicated"));
      item = sourceItem("conflict", tenantId, record, candidate, "Source identity is duplicated");
    } else if (!record) {
      const sourceMissingIssue = entries.length !== 1
        ? {
            code: entries.length === 0 ? "mapping.candidate_missing" : "mapping.source_duplicate",
            reason: entries.length === 0 ? "Mapping candidate is missing" : "Source has multiple mappings"
          }
        : candidate && duplicateCandidateStableIds.has(candidate.stableId)
          ? { code: "mapping.stable_duplicate", reason: "Stable ID is mapped from multiple source identities" }
          : candidate
            ? validateCandidateWithoutSource(snapshot, mapping, candidate)
            : { code: "mapping.candidate_missing", reason: "Mapping candidate is missing" };
      const exactTarget = candidate ? exactTargetForCandidate(targetsByStableId.get(candidate.stableId) ?? [], snapshot.source, candidate) : null;
      const targetIssue = exactTarget ? targetTerminalIssues.get(exactTarget.assetId) : null;
      if (candidate && exactTarget && !sourceMissingIssue && !targetIssue) {
        target = exactTarget;
        item = sourceItem("would-source-missing", tenantId, null, candidate, "Exact complete source scope proves the source identity is absent", target);
      } else {
        const issue = sourceMissingIssue
          ?? targetIssue
          ?? { code: "source.missing_unproven", reason: "Source absence is not proven" };
        addIssue(issueFor(issue.code, "source", tenantId, sourceId, candidate?.stableId ?? null, issue.reason));
        const ambiguousMapping = issue.code === "mapping.source_duplicate" || issue.code === "mapping.stable_duplicate";
        item = sourceItem(targetIssue || ambiguousMapping ? "conflict" : "excluded", tenantId, null, candidate, issue.reason, exactTarget);
        target = exactTarget;
      }
    } else if (entries.length !== 1) {
      const reason = entries.length === 0 ? "Source record has no unique mapping" : "Source has multiple mappings";
      addIssue(issueFor(entries.length === 0 ? "source.unmapped" : "mapping.source_duplicate", "source", tenantId, sourceId, candidate?.stableId ?? null, reason));
      item = sourceItem("excluded", tenantId, record, candidate, reason);
    } else if (candidate && duplicateCandidateStableIds.has(candidate.stableId)) {
      const reason = "Stable ID is mapped from multiple source identities";
      addIssue(issueFor("mapping.stable_duplicate", "source", tenantId, sourceId, candidate.stableId, reason));
      item = sourceItem("conflict", tenantId, record, candidate, reason);
    } else if (!candidate) {
      addIssue(issueFor("mapping.candidate_missing", "source", tenantId, sourceId, null, "Mapping candidate is missing"));
      item = sourceItem("excluded", tenantId, record, null, "Mapping candidate is missing");
    } else {
      const bindingIssue = validateCandidateBinding(snapshot, mapping, record, candidate);
      if (bindingIssue) {
        addIssue(issueFor(bindingIssue.code, "source", tenantId, sourceId, candidate.stableId, bindingIssue.reason));
        item = sourceItem("excluded", tenantId, record, candidate, bindingIssue.reason);
      } else {
        const targetGroup = targetsByStableId.get(candidate.stableId) ?? [];
        target = exactTargetForCandidate(targetGroup, snapshot.source, candidate);
        const targetIssue = target ? targetTerminalIssues.get(target.assetId) : null;
        if (targetGroup.length > 1 || targetIssue) {
          const reason = targetGroup.length > 1
            ? "Target stable ID is duplicated"
            : targetIssue?.reason ?? "Target identity collides";
          addIssue(issueFor(
            targetGroup.length > 1 ? "target.stable_duplicate" : targetIssue?.code ?? "target.collision",
            "source",
            tenantId,
            sourceId,
            candidate.stableId,
            reason
          ));
          item = sourceItem("conflict", tenantId, record, candidate, reason, target);
        } else if (!target) {
          if (targetGroup.length > 0) {
            const reason = "Target stable ID is bound to a different source identity";
            addIssue(issueFor("target.stable_source_mismatch", "source", tenantId, sourceId, candidate.stableId, reason));
            item = sourceItem("conflict", tenantId, record, candidate, reason);
          } else {
            const sourceRefTargets = (targetsBySourceIdentity.get(targetSourceKeyFromCandidate(snapshot.source, candidate)) ?? [])
              .filter((entry) => entry.stableId !== candidate.stableId);
            if (sourceRefTargets.length > 0) {
              const reason = "Source reference belongs to another stable ID";
              addIssue(issueFor("target.source_ref_collision", "source", tenantId, sourceId, candidate.stableId, reason));
              item = sourceItem("conflict", tenantId, record, candidate, reason);
            } else {
              const accessIssue = compareEffectiveAccess(candidate.effectiveAccess, record.effectiveAccess);
              if (accessIssue !== "unchanged") {
                const reason = accessIssue === "widened" ? "Candidate effective access would widen source access" : "Candidate effective access is unproven";
                addIssue(issueFor(accessIssue === "widened" ? "candidate.access_widened" : "candidate.access_unproven", "source", tenantId, sourceId, candidate.stableId, reason));
                item = sourceItem("excluded", tenantId, record, candidate, reason);
              } else {
                item = sourceItem("would-create", tenantId, record, candidate, "Target stable ID is absent", null, true);
              }
            }
          }
        } else {
          const targetIssue = validateExistingTarget(target, candidate, tenantId);
          if (targetIssue) {
            addIssue(issueFor(targetIssue.code, "target", tenantId, sourceId, candidate.stableId, targetIssue.reason, target.assetId));
            item = sourceItem("conflict", tenantId, record, candidate, targetIssue.reason, target);
          } else {
            const action: ImportPlanAction = target.current.contentHash === candidate.candidateContentHash
              ? "would-noop"
              : "would-update-version";
            item = sourceItem(
              action,
              tenantId,
              record,
              candidate,
              action === "would-noop" ? "Candidate digest equals the computed target digest" : "Candidate digest differs from the computed target digest",
              target,
              action === "would-update-version"
            );
          }
        }
      }
    }

    addItem(item);
    sourceClassifications.set(sourceId, { item, candidate, target });
    if (target) {
      const targetItemAction: ImportPlanAction = item.action === "would-create" ? "excluded" : item.action;
      targetItems.set(target.assetId, targetItem(targetItemAction, tenantId, target, candidate, item.reason, item.action === "would-update-version"));
    }
  }

  for (const [assetId, targetGroup] of targetsByAssetId) {
    const target = targetGroup[0];
    if (!target || targetItems.has(assetId)) continue;
    const candidate = findCandidateForTarget(target, mappingsByStableId.get(target.stableId) ?? [], snapshot.source);
    const forcedIssue = targetTerminalIssues.get(assetId);
    let item: ImportPlanItem;
    if (!manifestValid || !snapshot.complete || !mapping.complete || !targetManifest.complete || truncated) {
      item = targetItem("excluded", tenantId, target, candidate, "Authority or completeness proof is unavailable");
    } else if (forcedIssue) {
      addIssue(issueFor(forcedIssue.code, "target", tenantId, target.source.sourceId, target.stableId, forcedIssue.reason, assetId));
      item = targetItem("excluded", tenantId, target, candidate, forcedIssue.reason);
    } else if (target.tenantId !== tenantId) {
      addIssue(issueFor("target.tenant_mismatch", "target", tenantId, target.source.sourceId, target.stableId, "Target tenant does not match the planner tenant", assetId));
      item = targetItem("excluded", tenantId, target, candidate, "Target tenant does not match the planner tenant");
    } else if (!targetSourceMatchesScope(target, snapshot.source)) {
      addIssue(issueFor("target.outside_source_scope", "target", tenantId, target.source.sourceId, target.stableId, "Target is outside the exact source scope", assetId));
      item = targetItem("excluded", tenantId, target, candidate, "Target is outside the exact source scope");
    } else if (!target.source.sourceId || !target.source.sourceRef) {
      addIssue(issueFor("target.source_identity_missing", "target", tenantId, null, target.stableId, "Target has no complete source identity", assetId));
      item = targetItem("excluded", tenantId, target, candidate, "Target has no complete source identity");
    } else if (!candidate) {
      addIssue(issueFor("target.candidate_missing", "target", tenantId, target.source.sourceId, target.stableId, "Target is not bound to an exact candidate", assetId));
      item = targetItem("excluded", tenantId, target, null, "Target is not bound to an exact candidate");
    } else if (!recordsBySourceId.has(target.source.sourceId)) {
      const sourceMissingIssue = validateCandidateWithoutSource(snapshot, mapping, candidate);
      if (!sourceMissingIssue && candidate.sourceRef === target.source.sourceRef) {
        item = targetItem("would-source-missing", tenantId, target, candidate, "Exact complete source scope proves the source identity is absent");
      } else {
        const reason = sourceMissingIssue?.reason ?? "Target source identity does not match the candidate";
        addIssue(issueFor(sourceMissingIssue?.code ?? "target.source_identity_mismatch", "target", tenantId, target.source.sourceId, target.stableId, reason, assetId));
        item = targetItem("excluded", tenantId, target, candidate, reason);
      }
    } else {
      const sourceClassification = sourceClassifications.get(target.source.sourceId);
      const reason = sourceClassification?.item.reason ?? "Target is not bound to a classified source";
      addIssue(issueFor("target.source_unclassified", "target", tenantId, target.source.sourceId, target.stableId, reason, assetId));
      item = targetItem("excluded", tenantId, target, candidate, reason);
    }
    targetItems.set(assetId, item);
  }

  for (const targetItemValue of targetItems.values()) addItem(targetItemValue);

  const sourceCount = sourceIds.length;
  const targetCount = uniqueTargetIds(targetManifest);
  const classifiedSourceCount = new Set(items.filter((item) => item.entity === "source").map((item) => item.sourceId).filter((value): value is string => value !== null)).size;
  const classifiedTargetCount = new Set(items.filter((item) => item.entity === "target").map((item) => item.targetAssetId).filter((value): value is string => value !== null)).size;
  if (classifiedSourceCount !== sourceCount || classifiedTargetCount !== targetCount) {
    addIssue(issueFor("classification.count_mismatch", null, tenantId, null, null, "Terminal classifications do not cover the manifest identities"));
  }

  return makePlan({
    tenantId,
    sourceScopeId: snapshot.source.sourceScopeId,
    queryScopeDigest: snapshot.source.queryScopeDigest,
    sourceReadRevision: snapshot.sourceReadRevision,
    targetReadRevision: targetManifest.targetReadRevision,
    correlationId: targetManifest.correlationId,
    snapshotId: snapshot.snapshotId,
    snapshotChecksum: snapshot.checksum,
    mappingChecksum: mapping.checksum,
    targetSnapshotId: targetManifest.targetSnapshotId,
    targetManifestChecksum: targetManifest.checksum,
    sourceCount,
    targetCount,
    items,
    errors,
    truncated,
    classificationComplete: manifestValid && errors.length === 0 && !truncated && classifiedSourceCount === sourceCount && classifiedTargetCount === targetCount
  });
}

function verifyManifests(
  snapshot: ImportSnapshotManifest,
  mapping: ImportMappingManifest,
  targetManifest: ImportTargetManifest,
  tenantId: string,
  addIssue: (issue: ImportPlanIssue) => void
): boolean {
  let valid = true;
  const check = (condition: boolean, code: string, entity: "source" | "target" | null, reason: string, sourceId: string | null = null, stableId: string | null = null, targetAssetId: string | null = null): void => {
    if (!condition) {
      valid = false;
      addIssue(issueFor(code, entity, tenantId, sourceId, stableId, reason, targetAssetId));
    }
  };

  const derivedScopeId = safeDeriveSourceScopeId(snapshot.source);
  check(derivedScopeId === snapshot.source.sourceScopeId, "manifest.source_scope_invalid", "source", "Persisted source scope ID does not match its descriptor");
  check(snapshot.source.queryScopeDigest === deriveImportQueryScopeDigest(snapshot.source.sourceScopeId), "manifest.query_scope_invalid", "source", "Source query/scope digest does not match its exact source scope");
  check(snapshot.checksum === checksumFor(snapshot), "manifest.snapshot_checksum_mismatch", "source", "Source snapshot checksum does not match its contents");
  check(snapshot.continuation.complete === snapshot.complete, "source.continuation_mismatch", "source", "Source completeness does not match continuation proof");
  check(snapshot.complete ? snapshot.continuation.proof === "exhaustive" : snapshot.continuation.proof === "cursor", "source.continuation_unproven", "source", "Source continuation proof is not authoritative");
  check(snapshot.complete ? snapshot.totalCount === snapshot.records.length : snapshot.totalCount >= snapshot.records.length, "source.total_mismatch", "source", "Source total count does not match the manifest");
  check(snapshot.complete, "source.incomplete", "source", "Source scope is incomplete");
  check(!snapshot.complete || !snapshot.truncated, "source.truncated", "source", "Complete source scope cannot be marked truncated");

  check(mapping.snapshotId === snapshot.snapshotId, "mapping.snapshot_mismatch", "source", "Mapping is bound to a different source snapshot");
  check(mapping.snapshotChecksum === snapshot.checksum, "mapping.snapshot_checksum_mismatch", "source", "Mapping is not bound to the exact source snapshot checksum");
  check(mapping.sourceScopeId === snapshot.source.sourceScopeId, "mapping.source_scope_mismatch", "source", "Mapping source scope does not match the source snapshot");
  check(mapping.sourceReadRevision === snapshot.sourceReadRevision, "mapping.source_revision_mismatch", "source", "Mapping source revision does not match the source snapshot");
  check(mapping.queryScopeDigest === snapshot.source.queryScopeDigest, "mapping.query_scope_mismatch", "source", "Mapping query/scope digest does not match the source snapshot");
  check(mapping.correlationId === snapshot.correlationId, "mapping.correlation_mismatch", "source", "Mapping correlation does not match the source snapshot");
  check(mapping.checksum === checksumFor(mapping), "manifest.mapping_checksum_mismatch", "source", "Mapping checksum does not match its contents");
  check(mapping.continuation.complete === mapping.complete, "mapping.continuation_mismatch", "source", "Mapping completeness does not match continuation proof");
  check(mapping.complete ? mapping.continuation.proof === "exhaustive" : mapping.continuation.proof === "cursor", "mapping.continuation_unproven", "source", "Mapping continuation proof is not authoritative");
  check(mapping.complete ? mapping.totalCount === mapping.mappings.length : mapping.totalCount >= mapping.mappings.length, "mapping.total_mismatch", "source", "Mapping total count does not match the manifest");
  check(mapping.complete, "mapping.incomplete", "source", "Candidate mapping is incomplete");
  check(!mapping.complete || !mapping.truncated, "mapping.truncated", "source", "Complete mapping cannot be marked truncated");

  check(targetManifest.tenantId === tenantId, "manifest.tenant_mismatch", "target", "Target manifest tenant does not match the planner tenant");
  check(targetManifest.sourceScopeId === snapshot.source.sourceScopeId, "target.source_scope_mismatch", "target", "Target manifest source scope does not match the source snapshot");
  check(targetManifest.queryScopeDigest === snapshot.source.queryScopeDigest, "target.query_scope_mismatch", "target", "Target query/scope digest does not match the exact source scope");
  check(targetManifest.correlationId === snapshot.correlationId, "target.correlation_mismatch", "target", "Target correlation does not match the source snapshot");
  check(targetManifest.mappingChecksum === mapping.checksum, "target.mapping_checksum_mismatch", "target", "Target manifest is not bound to the exact candidate-set mapping checksum");
  check(targetManifest.hashContractVersion === IMPORT_HASH_CONTRACT_VERSION, "target.hash_contract_unsupported", "target", "Target hash contract is not the governed production contract");
  check(targetManifest.checksum === checksumFor(targetManifest), "manifest.target_checksum_mismatch", "target", "Target manifest checksum does not match its contents");
  check(targetManifest.continuation.complete === targetManifest.complete, "target.continuation_mismatch", "target", "Target completeness does not match continuation proof");
  check(targetManifest.complete ? targetManifest.continuation.proof === "exhaustive" : targetManifest.continuation.proof === "cursor", "target.continuation_unproven", "target", "Target continuation proof is not authoritative");
  check(targetManifest.complete ? targetManifest.totalCount === targetManifest.targets.length : targetManifest.totalCount >= targetManifest.targets.length, "target.total_mismatch", "target", "Target total count does not match the manifest");
  check(targetManifest.complete, "target.incomplete", "target", "Target state manifest is incomplete");
  check(!targetManifest.complete || !targetManifest.truncated, "target.truncated", "target", "Complete target state cannot be marked truncated");

  const recordIds = new Set(snapshot.records.map((record) => record.sourceId));
  for (const record of snapshot.records) {
    check(record.provenance.sourceScopeId === snapshot.source.sourceScopeId, "source.provenance_scope_mismatch", "source", "Source provenance scope does not match the exact source scope", record.sourceId);
    check(record.provenance.sourceSystem === snapshot.source.system, "source.provenance_system_mismatch", "source", "Source provenance system does not match the source scope", record.sourceId);
    check(record.provenance.sourceRootId === snapshot.source.rootId, "source.provenance_root_mismatch", "source", "Source provenance root does not match the source scope", record.sourceId);
    check(record.provenance.sourceId === record.sourceId, "source.provenance_id_mismatch", "source", "Source provenance identity does not match the source record", record.sourceId);
    check(record.provenance.sourceRevision === snapshot.sourceReadRevision, "source.provenance_revision_mismatch", "source", "Source provenance revision does not match the source snapshot", record.sourceId);
    check(record.provenance.snapshotId === snapshot.snapshotId, "source.provenance_snapshot_mismatch", "source", "Source provenance snapshot does not match the source snapshot", record.sourceId);
    check(record.provenance.sourcePath !== null && record.provenance.sourcePath.startsWith(snapshot.source.sourceRefPrefix), "source.path_outside_scope", "source", "Source path is not a member of the exact source scope", record.sourceId);
    if (record.provenance.sourceParentId !== null) {
      check(record.provenance.sourceParentId !== record.sourceId, "source.parent_self", "source", "Source cannot be its own parent", record.sourceId);
      check(recordIds.has(record.provenance.sourceParentId), "source.parent_missing", "source", "Source parent is not present in the exact source scope", record.sourceId);
    }
  }
  const parentById = new Map(snapshot.records.map((record) => [record.sourceId, record.provenance.sourceParentId]));
  for (const sourceId of recordIds) {
    const visited = new Set<string>();
    let current: string | null | undefined = sourceId;
    while (current) {
      if (visited.has(current)) {
        check(false, "source.parent_cycle", "source", "Source parent relationships contain a cycle", sourceId);
        break;
      }
      visited.add(current);
      current = parentById.get(current);
    }
  }

  for (const target of targetManifest.targets) {
    check(target.tenantId === tenantId, "target.tenant_mismatch", "target", "Target tenant does not match the planner tenant", target.source.sourceId, target.stableId, target.assetId);
  }
  return valid;
}

function validateCandidateBinding(
  snapshot: ImportSnapshotManifest,
  mapping: ImportMappingManifest,
  record: ImportSnapshotRecord,
  candidate: ImportCandidate
): ManifestCheckIssue | null {
  if (candidate.hashEvidence !== "typed-governed-v1") return { code: "candidate.hash_unproven", reason: "Candidate digest was not computed by the typed governed-snapshot constructor" };
  if (candidate.hashContractVersion !== IMPORT_HASH_CONTRACT_VERSION) return { code: "candidate.hash_contract_unsupported", reason: "Candidate hash contract is not the governed production contract" };
  if (candidate.sourceContentSha256 !== record.sourceContentSha256) return { code: "candidate.source_digest_mismatch", reason: "Candidate is not bound to the source content digest" };
  if (candidate.sourceRef !== record.provenance.sourcePath) return { code: "candidate.source_reference_mismatch", reason: "Candidate source reference does not match the persisted source provenance" };
  if (candidate.effectiveAccess === null) return { code: "candidate.access_unproven", reason: "Candidate effective access is unavailable" };
  const accessComparison = compareEffectiveAccess(candidate.effectiveAccess, record.effectiveAccess);
  if (accessComparison === "unproven") return { code: "candidate.access_unproven", reason: "Candidate effective access is unproven" };
  if (accessComparison === "widened") return { code: "candidate.access_widened", reason: "Candidate effective access would widen source access" };
  if (mapping.sourceScopeId !== snapshot.source.sourceScopeId || mapping.snapshotChecksum !== snapshot.checksum) return { code: "candidate.mapping_binding_mismatch", reason: "Candidate mapping is not joined to the exact source snapshot" };
  return null;
}

function validateCandidateWithoutSource(
  snapshot: ImportSnapshotManifest,
  mapping: ImportMappingManifest,
  candidate: ImportCandidate
): ManifestCheckIssue | null {
  if (!snapshot.complete || snapshot.truncated || !mapping.complete || mapping.truncated) return { code: "source.scope_incomplete", reason: "Source scope is not complete enough to prove source absence" };
  if (candidate.hashEvidence !== "typed-governed-v1") return { code: "candidate.hash_unproven", reason: "Candidate digest was not computed by the typed governed-snapshot constructor" };
  if (candidate.hashContractVersion !== IMPORT_HASH_CONTRACT_VERSION) return { code: "candidate.hash_contract_unsupported", reason: "Candidate hash contract is not the governed production contract" };
  if (!candidate.sourceRef.startsWith(snapshot.source.sourceRefPrefix)) return { code: "candidate.source_reference_mismatch", reason: "Candidate source reference is outside the exact source scope" };
  if (candidate.effectiveAccess === null) return { code: "candidate.access_unproven", reason: "Candidate effective access is unavailable" };
  if (mapping.sourceScopeId !== snapshot.source.sourceScopeId || mapping.snapshotChecksum !== snapshot.checksum) return { code: "candidate.mapping_binding_mismatch", reason: "Candidate mapping is not joined to the exact source snapshot" };
  return null;
}

function validateExistingTarget(target: ImportTargetSummary, candidate: ImportCandidate, tenantId: string): ManifestCheckIssue | null {
  if (target.tenantId !== tenantId) return { code: "target.tenant_mismatch", reason: "Target tenant does not match the planner tenant" };
  if (target.current.hashVerification !== "verified" || target.current.hashEvidence !== "typed-governed-v1" || !target.current.versionId || !target.current.contentHash) {
    return { code: "target.hash_unproven", reason: "Target current digest is missing or was not computed by the typed governed-snapshot constructor" };
  }
  if (target.effectiveAccess === null) return { code: "target.access_unproven", reason: "Target effective access is unavailable" };
  const accessComparison = compareEffectiveAccess(candidate.effectiveAccess, target.effectiveAccess);
  if (accessComparison === "unproven") return { code: "target.access_unproven", reason: "Effective access is unavailable or incomplete" };
  if (accessComparison === "widened") return { code: "target.access_widened", reason: "Candidate effective access would widen target access" };
  return null;
}

type AccessComparison = "unchanged" | "widened" | "unproven";

function compareEffectiveAccess(candidate: ImportEffectiveAccess | null, baseline: ImportEffectiveAccess | null): AccessComparison {
  if (!candidate || !baseline) return "unproven";
  if (candidate.accessContractVersion !== IMPORT_ACCESS_CONTRACT_VERSION || baseline.accessContractVersion !== IMPORT_ACCESS_CONTRACT_VERSION) return "unproven";
  if (effectiveAccessFingerprint(candidate) === effectiveAccessFingerprint(baseline)) return "unchanged";
  const sensitivityRank = { "public-demo": 0, internal: 1, restricted: 2, confidential: 3, secret: 4 } as const;
  const lifecycleRank = { draft: 0, active: 1, deprecated: 2, archived: 3, restricted: 4 } as const;
  const publicationRank = { draft: 0, published: 1 } as const;
  const reviewRank = { pending: 0, rejected: 0, approved: 1 } as const;
  if (sensitivityRank[candidate.sensitivity] < sensitivityRank[baseline.sensitivity]) return "widened";
  const narrowsActiveToDraft = baseline.lifecycleState === "active" && candidate.lifecycleState === "draft"
    && candidate.publicationState === "draft" && candidate.reviewState === "pending";
  if (baseline.lifecycleState === "draft" && candidate.lifecycleState === "active") return "widened";
  if (lifecycleRank[candidate.lifecycleState] < lifecycleRank[baseline.lifecycleState] && !narrowsActiveToDraft) return "widened";
  if (publicationRank[candidate.publicationState] > publicationRank[baseline.publicationState]) return "widened";
  if (reviewRank[candidate.reviewState] > reviewRank[baseline.reviewState]) return "widened";
  if (!isExactSubset(candidate.audience, baseline.audience)) return "widened";
  if (!isExactSubset(candidate.allowedSurfaces, baseline.allowedSurfaces)) return "widened";
  if (!isExactSubset(candidate.allowedExports, baseline.allowedExports)) return "widened";
  if (!isExactSubset(candidate.allowedActions, baseline.allowedActions)) return "widened";
  if (!isExactSubset(candidate.effectiveGrants.map(grantKey), baseline.effectiveGrants.map(grantKey))) return "widened";
  return "unchanged";
}

function effectiveAccessFingerprint(access: ImportEffectiveAccess): string {
  return digest({
    domain: "forgetbase.effective-access",
    version: IMPORT_ACCESS_CONTRACT_VERSION,
    descriptor: normalizeAccess(access)
  });
}

function normalizeAccess(access: ImportEffectiveAccess): ImportEffectiveAccess {
  return {
    ...access,
    audience: sortStrings(access.audience),
    allowedSurfaces: sortStrings(access.allowedSurfaces) as ImportEffectiveAccess["allowedSurfaces"],
    allowedExports: sortStrings(access.allowedExports),
    allowedActions: sortStrings(access.allowedActions),
    effectiveGrants: [...access.effectiveGrants].sort((left, right) => compareStrings(grantKey(left), grantKey(right)))
  };
}

function bindGovernedAccess(access: ImportEffectiveAccess | null | undefined, snapshot: AssetVersionAssetSnapshot): ImportEffectiveAccess | null {
  if (!access) return null;
  const reviewState = snapshot.status === "draft" || snapshot.status === "review" || snapshot.status === "reviewing" || snapshot.status === "pending" ? "pending"
    : snapshot.status === "approved" || snapshot.status === "rejected" ? snapshot.status : null;
  if (reviewState === null) return null;
  const normalized = normalizeAccess(access);
  const governedFields = {
    lifecycleState: snapshot.lifecycleState,
    reviewState,
    sensitivity: snapshot.sensitivity,
    audience: sortStrings(snapshot.audience),
    allowedSurfaces: sortStrings(snapshot.allowedSurfaces),
    allowedExports: sortStrings(snapshot.allowedExports),
    allowedActions: sortStrings(snapshot.allowedActions)
  };
  for (const [key, expected] of Object.entries(governedFields)) {
    if (canonicalizeImportJson(normalized[key as keyof typeof governedFields]) !== canonicalizeImportJson(expected)) return null;
  }
  return normalized;
}

function grantKey(grant: ImportEffectiveAccess["effectiveGrants"][number]): string {
  return canonicalizeImportJson([grant.principalType, grant.principalId, grant.action, grant.surface, grant.exportName]);
}

function isExactSubset(values: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return values.every((value) => allowedSet.has(value));
}

function targetSourceMatchesScope(target: ImportTargetSummary, source: ImportSourceIdentity): boolean {
  return target.source.system === source.system
    && target.source.rootId === source.rootId
    && target.source.scopeId === source.scopeId
    && target.source.sourceScopeId === source.sourceScopeId;
}

function targetSourceMatchesCandidate(target: ImportTargetSummary, source: ImportSourceIdentity, candidate: ImportCandidate): boolean {
  return targetSourceMatchesScope(target, source)
    && target.source.sourceId === candidate.sourceId
    && target.source.sourceRef === candidate.sourceRef;
}

function exactTargetForCandidate(targets: readonly ImportTargetSummary[], source: ImportSourceIdentity, candidate: ImportCandidate): ImportTargetSummary | null {
  return targets.find((target) => targetSourceMatchesCandidate(target, source, candidate)) ?? null;
}

function findCandidateForTarget(target: ImportTargetSummary, candidates: readonly ImportMappingEntry[], source: ImportSourceIdentity): ImportCandidate | null {
  return candidates.find((entry) => targetSourceMatchesCandidate(target, source, entry.candidate))?.candidate ?? null;
}

function sourceItem(
  action: ImportPlanAction,
  tenantId: string,
  record: ImportSnapshotRecord | null,
  candidate: ImportCandidate | null,
  reason: string,
  target: ImportTargetSummary | null = null,
  proposed = false
): ImportPlanItem {
  return planItem({ entity: "source", action, tenantId, record, candidate, target, reason, proposed });
}

function targetItem(
  action: ImportPlanAction,
  tenantId: string,
  target: ImportTargetSummary,
  candidate: ImportCandidate | null,
  reason: string,
  proposed = false
): ImportPlanItem {
  return planItem({ entity: "target", action, tenantId, target, candidate, reason, proposed });
}

type PlanItemInput = {
  entity: "source" | "target";
  action: ImportPlanAction;
  tenantId: string;
  record?: ImportSnapshotRecord | null;
  candidate?: ImportCandidate | null;
  target?: ImportTargetSummary | null;
  reason: string;
  proposed: boolean;
};

function planItem(input: PlanItemInput): ImportPlanItem {
  const record = input.record ?? null;
  const candidate = input.candidate ?? null;
  const target = input.target ?? null;
  return {
    entity: input.entity,
    action: input.action,
    tenantId: target?.tenantId ?? input.tenantId,
    sourceScopeId: target?.source.sourceScopeId ?? null,
    sourceId: candidate?.sourceId ?? record?.sourceId ?? target?.source.sourceId ?? null,
    stableId: candidate?.stableId ?? target?.stableId ?? null,
    targetAssetId: target?.assetId ?? null,
    sourceContentSha256: candidate?.sourceContentSha256 ?? record?.sourceContentSha256 ?? null,
    candidateContentHash: candidate?.candidateContentHash ?? null,
    currentContentHash: target?.current.contentHash ?? null,
    currentHashVerification: target?.current.hashVerification ?? null,
    proposedLifecycleState: input.proposed ? "draft" : null,
    proposedStatus: input.proposed ? "review" : null,
    reason: input.reason
  };
}

type MakePlanInput = {
  tenantId: string | null;
  sourceScopeId: string | null;
  queryScopeDigest: string | null;
  sourceReadRevision: string | null;
  targetReadRevision: string | null;
  correlationId: string | null;
  snapshotId: string | null;
  snapshotChecksum: string | null;
  mappingChecksum: string | null;
  targetSnapshotId: string | null;
  targetManifestChecksum: string | null;
  sourceCount: number;
  targetCount: number;
  items: ImportPlanItem[];
  errors: ImportPlanIssue[];
  truncated: boolean;
  classificationComplete: boolean;
};

function makePlan(input: MakePlanInput): ImportPlan {
  const sortedItems = [...input.items].sort(compareItems);
  const sortedErrors = [...input.errors].sort(compareIssues);
  const evidenceTruncated = input.truncated || sortedItems.length > MAX_EVIDENCE_ITEMS || sortedErrors.length > MAX_EVIDENCE_ITEMS;
  const classificationComplete = input.classificationComplete && !evidenceTruncated;
  const visibleErrors = sortedErrors.slice(0, MAX_EVIDENCE_ITEMS);
  const finalItems = classificationComplete ? sortedItems : sortedItems.map((item) => {
    if (!item.action.startsWith("would-")) return item;
    return { ...item, action: "excluded" as const, proposedLifecycleState: null, proposedStatus: null, reason: `Classification incomplete: ${item.reason}` };
  });
  const visibleItems = finalItems.slice(0, MAX_EVIDENCE_ITEMS);
  const counts = countActions(finalItems);
  const summary = {
    sourceCount: input.sourceCount,
    targetCount: input.targetCount,
    classifiedSourceCount: new Set(finalItems.filter((item) => item.entity === "source").map((item) => item.sourceId).filter((value): value is string => value !== null)).size,
    classifiedTargetCount: new Set(finalItems.filter((item) => item.entity === "target").map((item) => item.targetAssetId).filter((value): value is string => value !== null)).size,
    itemCount: finalItems.length,
    issueCount: sortedErrors.length
  };
  const digestInput = {
    schemaVersion: IMPORT_MANIFEST_VERSION,
    reportType: IMPORT_REPORT_CONTRACT,
    applyAcceptance: IMPORT_APPLY_ACCEPTANCE,
    classificationComplete,
    executable: false,
    safeToApply: false,
    tenantId: input.tenantId,
    sourceScopeId: input.sourceScopeId,
    queryScopeDigest: input.queryScopeDigest,
    sourceReadRevision: input.sourceReadRevision,
    targetReadRevision: input.targetReadRevision,
    correlationId: input.correlationId,
    snapshotId: input.snapshotId,
    snapshotChecksum: input.snapshotChecksum,
    mappingChecksum: input.mappingChecksum,
    targetSnapshotId: input.targetSnapshotId,
    targetManifestChecksum: input.targetManifestChecksum,
    summary,
    counts,
    items: finalItems,
    errors: sortedErrors,
    truncated: evidenceTruncated
  };
  return importPlanSchema.parse({
    ...digestInput,
    planDigest: digest(digestInput),
    items: visibleItems,
    errors: visibleErrors
  });
}

function issueFor(
  code: string,
  entity: "source" | "target" | null,
  tenantId: string | null,
  sourceId: string | null,
  stableId: string | null,
  reason: string,
  targetAssetId: string | null = null
): ImportPlanIssue {
  return { code, entity, tenantId, sourceId, stableId, targetAssetId, reason };
}

function countActions(items: readonly ImportPlanItem[]): ImportPlan["counts"] {
  const counts: ImportPlan["counts"] = {
    "would-create": 0,
    "would-update-version": 0,
    "would-noop": 0,
    "would-source-missing": 0,
    conflict: 0,
    excluded: 0
  };
  for (const item of items) counts[item.action] += 1;
  return counts;
}

function normalizeSnapshotRecord(
  input: z.input<typeof snapshotRecordDraftSchema>,
  source: Omit<ImportSourceIdentity, "queryScopeDigest">,
  snapshotId: string,
  sourceReadRevision: string
): ImportSnapshotRecord {
  const parsed = provenanceDraftSchema.parse(input.provenance);
  return importSnapshotRecordSchema.parse({
    sourceId: input.sourceId,
    sourceContentSha256: input.sourceContentSha256,
    effectiveAccess: input.effectiveAccess ? normalizeAccess(input.effectiveAccess) : null,
    provenance: normalizeProvenance(parsed, { source, sourceId: input.sourceId, snapshotId, sourceReadRevision })
  });
}

type ProvenanceContext = { source: Omit<ImportSourceIdentity, "queryScopeDigest">; snapshotId: string; sourceReadRevision: string; sourceId: string };

function normalizeProvenance(input: z.input<typeof provenanceDraftSchema>, context: ProvenanceContext): ImportProvenance {
  const sourceParentId = input.sourceParentId ?? null;
  const sourcePath = input.sourcePath ?? null;
  const values = {
    sourceScopeId: context.source.sourceScopeId,
    sourceSystem: context.source.system,
    sourceRootId: context.source.rootId,
    sourceId: context.sourceId,
    sourceParentId,
    sourceRevision: context.sourceReadRevision,
    snapshotId: context.snapshotId,
    sourcePath
  };
  for (const [key, expected] of Object.entries({
    sourceScopeId: context.source.sourceScopeId,
    sourceSystem: context.source.system,
    sourceRootId: context.source.rootId,
    sourceId: context.sourceId,
    sourceRevision: context.sourceReadRevision,
    snapshotId: context.snapshotId
  })) {
    const supplied = input[key as keyof typeof input];
    if (supplied !== undefined && supplied !== expected) throw new Error(`Provenance ${key} does not match its manifest authority`);
  }
  return importProvenanceSchema.parse(values);
}

function normalizeCandidate(input: ImportCandidateDraft, computedEvidence = false): ImportCandidate {
  const parsed = candidateDraftSchema.parse(input);
  const governedSnapshot = parsed.governedSnapshot ? governedSnapshotSchema.parse(parsed.governedSnapshot) : null;
  if (governedSnapshot && governedSnapshot.assetSnapshot.stableId !== parsed.stableId) throw new Error("Governed candidate snapshot stable ID does not match the candidate");
  const candidateContentHash = governedSnapshot ? hashGovernedSnapshotInput(governedSnapshot) : parsed.candidateContentHash;
  const hashContractVersion = governedSnapshot ? IMPORT_HASH_CONTRACT_VERSION : parsed.hashContractVersion ?? "caller-authored";
  const hashEvidence = governedSnapshot || (computedEvidence && parsed.hashContractVersion === IMPORT_HASH_CONTRACT_VERSION && parsed.hashEvidence === "typed-governed-v1")
    ? "typed-governed-v1" as const
    : null;
  return importCandidateSchema.parse({
    sourceId: parsed.sourceId,
    stableId: parsed.stableId,
    sourceRef: parsed.sourceRef,
    sourceContentSha256: parsed.sourceContentSha256,
    hashContractVersion,
    candidateContentHash,
    hashEvidence,
    effectiveAccess: governedSnapshot
      ? bindGovernedAccess(parsed.effectiveAccess, governedSnapshot.assetSnapshot)
      : parsed.effectiveAccess ? normalizeAccess(parsed.effectiveAccess) : null
  });
}

function normalizeTargetSummary(input: ImportTargetSummaryDraft, computedEvidence = false): ImportTargetSummary {
  const parsed = targetSummaryDraftSchema.parse(input);
  const source = parsed.source;
  const governedSnapshot = parsed.governedSnapshot ? governedSnapshotSchema.extend({ versionId: identifierSchema }).parse(parsed.governedSnapshot) : null;
  if (governedSnapshot && governedSnapshot.assetSnapshot.stableId !== parsed.stableId) throw new Error("Governed target snapshot stable ID does not match the target");
  const current = governedSnapshot
    ? {
        versionId: governedSnapshot.versionId,
        contentHash: hashGovernedSnapshotInput(governedSnapshot),
        hashVerification: "verified" as const,
        hashEvidence: "typed-governed-v1" as const
      }
    : {
        versionId: parsed.current.versionId,
        contentHash: parsed.current.contentHash,
        hashVerification: computedEvidence && parsed.current.hashVerification === "verified" && parsed.current.hashEvidence === "typed-governed-v1"
          ? "verified" as const
          : parsed.current.hashVerification === "verified"
            ? "unverified" as const
            : parsed.current.hashVerification ?? "missing" as const,
        hashEvidence: computedEvidence && parsed.current.hashVerification === "verified" && parsed.current.hashEvidence === "typed-governed-v1"
          ? "typed-governed-v1" as const
          : null
      };
  return importTargetSummarySchema.parse({
    tenantId: parsed.tenantId,
    assetId: parsed.assetId,
    stableId: parsed.stableId,
    source: {
      system: source.system ?? null,
      rootId: source.rootId ?? null,
      scopeId: source.scopeId ?? null,
      sourceScopeId: source.sourceScopeId ?? null,
      sourceId: source.sourceId ?? null,
      sourceRef: source.sourceRef ?? null
    },
    current,
    effectiveAccess: governedSnapshot
      ? bindGovernedAccess(parsed.effectiveAccess, governedSnapshot.assetSnapshot)
      : parsed.effectiveAccess ? normalizeAccess(parsed.effectiveAccess) : null
  });
}

function resolveSourceIdentity(input: z.input<typeof sourceScopeDraftSchema>): Omit<ImportSourceIdentity, "queryScopeDigest"> {
  const parsed = sourceScopeDraftSchema.parse(input);
  const descriptor = {
    system: parsed.system,
    rootId: parsed.rootId,
    scopeId: parsed.scopeId,
    sourceRefPrefix: parsed.sourceRefPrefix
  };
  const sourceScopeId = deriveImportSourceScopeId(descriptor);
  if (parsed.sourceScopeId !== undefined && parsed.sourceScopeId !== sourceScopeId) throw new Error("Persisted source scope ID does not match its declared identity");
  return { ...descriptor, sourceScopeId };
}

function hashGovernedSnapshotInput(snapshot: GovernedSnapshotInput | (GovernedSnapshotInput & { versionId: string })): string {
  const { versionId: _versionId, ...contentSnapshot } = snapshot as GovernedSnapshotInput & { versionId?: string };
  const parsed = governedSnapshotSchema.parse(contentSnapshot);
  const content: GovernedVersionContent = {
    instructionObjects: parsed.instructionObjects as AgentInstructionInput[],
    humanDocuments: parsed.humanDocuments as HumanDocumentInput[]
  };
  return hashGovernedAssetSnapshot(parsed.assetSnapshot as AssetVersionAssetSnapshot, content);
}

function sortRecords(records: readonly ImportSnapshotRecord[]): ImportSnapshotRecord[] {
  return [...records].sort((left, right) => compareStrings(left.sourceId, right.sourceId) || compareCanonical(left, right));
}
function sortMappings(mappings: readonly ImportMappingEntry[]): ImportMappingEntry[] {
  return [...mappings].sort((left, right) => compareStrings(left.candidate.sourceId, right.candidate.sourceId) || compareStrings(left.candidate.stableId, right.candidate.stableId) || compareCanonical(left, right));
}
function sortTargets(targets: readonly ImportTargetSummary[]): ImportTargetSummary[] {
  return [...targets].sort((left, right) => compareStrings(left.stableId, right.stableId) || compareStrings(left.assetId, right.assetId) || compareCanonical(left, right));
}
function compareCanonical(left: unknown, right: unknown): number {
  return compareStrings(canonicalizeImportJson(left), canonicalizeImportJson(right));
}
function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const current = grouped.get(key);
    if (current) current.push(value);
    else grouped.set(key, [value]);
  }
  return grouped;
}
function compareItems(left: ImportPlanItem, right: ImportPlanItem): number {
  return compareStrings(
    canonicalizeImportJson([left.entity, left.sourceId, left.stableId, left.targetAssetId, left.action]),
    canonicalizeImportJson([right.entity, right.sourceId, right.stableId, right.targetAssetId, right.action])
  );
}
function compareIssues(left: ImportPlanIssue, right: ImportPlanIssue): number {
  return compareStrings(
    canonicalizeImportJson([left.code, left.entity, left.tenantId, left.sourceId, left.stableId, left.targetAssetId]),
    canonicalizeImportJson([right.code, right.entity, right.tenantId, right.sourceId, right.stableId, right.targetAssetId])
  );
}
function sortStrings(values: readonly string[]): string[] {
  return [...values].sort(compareStrings);
}
function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCodeUnit = left.charCodeAt(index);
    const rightCodeUnit = right.charCodeAt(index);
    if (leftCodeUnit !== rightCodeUnit) return leftCodeUnit - rightCodeUnit;
  }
  return left.length - right.length;
}
function targetSourceKey(target: ImportTargetSummary): string {
  return canonicalizeImportJson([target.source.sourceScopeId, target.source.sourceId, target.source.sourceRef]);
}
function targetSourceKeyFromCandidate(source: ImportSourceIdentity, candidate: ImportCandidate): string {
  return canonicalizeImportJson([source.sourceScopeId, candidate.sourceId, candidate.sourceRef]);
}
function checksumFor(manifest: ImportSnapshotManifest | ImportMappingManifest | ImportTargetManifest): string {
  const { checksum: _checksum, ...payload } = manifest;
  return digest(payload);
}
function safeDeriveSourceScopeId(source: ImportSourceIdentity): string | null {
  try {
    const { queryScopeDigest: _queryScopeDigest, ...descriptor } = source;
    return deriveImportSourceScopeId(descriptor);
  } catch {
    return null;
  }
}
function uniqueSourceIds(snapshot: ImportSnapshotManifest, mapping: ImportMappingManifest): number {
  return new Set([...snapshot.records.map((record) => record.sourceId), ...mapping.mappings.map((entry) => entry.candidate.sourceId)]).size;
}
function uniqueTargetIds(targetManifest: ImportTargetManifest): number {
  return new Set(targetManifest.targets.map((target) => target.assetId)).size;
}
function safeIdentifier(input: unknown, key: string): string | null {
  try {
    if (!input || typeof input !== "object" || !(key in input)) return null;
    const parsed = identifierSchema.safeParse((input as Record<string, unknown>)[key]);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
function isObject(input: unknown): input is object {
  return input !== null && typeof input === "object";
}
function hasComputedEvidence(input: unknown, evidence: WeakMap<object, string>): boolean {
  if (!isObject(input) || !evidence.has(input)) return false;
  try {
    return evidence.get(input) === digest(input);
  } catch {
    return false;
  }
}
function hasRawTruncation(input: unknown): boolean {
  try {
    if (!input || typeof input !== "object") return false;
    const value = input as Record<string, unknown>;
    const lengths = [
      (value.snapshot as Record<string, unknown> | undefined)?.records,
      (value.mapping as Record<string, unknown> | undefined)?.mappings,
      (value.targetManifest as Record<string, unknown> | undefined)?.targets
    ];
    return lengths.some((candidate) => Array.isArray(candidate) && candidate.length > MAX_MANIFEST_RECORDS);
  } catch {
    return false;
  }
}
export function canonicalizeImportJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalizeImportJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${canonicalizeImportJson(nestedValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function digest(value: unknown): string {
  return sha256(canonicalizeImportJson({ canonicalizerVersion: IMPORT_CANONICALIZER_VERSION, value }));
}
