import { createHash } from "node:crypto";
import type { AuthRepository, RegistryRepository } from "@forgetbase/db";
import { assetVersionAssetSnapshotSchema, type AssetDetail, type AssetRecord, type AuthPrincipal, type PermissionGrant, type Surface } from "@forgetbase/schema";
import { hashGovernedAssetSnapshot } from "@forgetbase/schema/governed-hash";
import {
  buildImportSnapshot, buildImportMappingManifest, buildImportTargetManifest,
  buildImportTargetSummaryFromGovernedSnapshot, canonicalizeImportJson,
  importPlanRequestSchema, importTargetSourceIdentitySchema, planImport,
  IMPORT_ACCESS_CONTRACT_VERSION, IMPORT_HASH_CONTRACT_VERSION, IMPORT_MANIFEST_VERSION,
  type ImportEffectiveAccess, type ImportTargetSummaryDraft
} from "@forgetbase/schema/import-planner";

export class ImportPlanningError extends Error {
  constructor(readonly code: "access_denied" | "invalid_import_input" | "import_target_changed" | "import_target_limit_exceeded", readonly statusCode: 400 | 403 | 409) {
    super(code);
  }
}

/** Bound recursion before parsing or hashing untrusted metadata. HTTP also limits bytes. */
export function withinImportJsonBudget(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++count > 100_000 || entry.depth > 32) return false;
    if (entry.value && typeof entry.value === "object") {
      for (const child of Object.values(entry.value)) pending.push({ value: child, depth: entry.depth + 1 });
    }
  }
  return true;
}

type PlanningContext = {
  registry: RegistryRepository;
  auth: AuthRepository;
  principal: AuthPrincipal;
  surface: Surface;
};

type CapturedTarget = { detail: AssetDetail; grants: PermissionGrant[] };

/** A read-only optimistic capture. A report cannot reserve or authorize an import. */
export async function planGovernedImport(input: ReturnType<typeof importPlanRequestSchema.parse>, context: PlanningContext) {
  const { registry, auth, principal, surface } = context;
  const snapshot = parseDeclaredInput(() => buildImportSnapshot(input.snapshot));
  const candidates = input.candidates.map((candidate) => {
    const asset = candidate.governedSnapshot.assetSnapshot;
    const expectedSource = {
      system: snapshot.source.system, rootId: snapshot.source.rootId, scopeId: snapshot.source.scopeId,
      sourceScopeId: snapshot.source.sourceScopeId, sourceId: candidate.sourceId
    };
    if (!asset.sourceRef || asset.sourceRef !== asset.sourceRef.trim() || asset.sourceKind !== snapshot.source.system ||
        canonicalizeImportJson(asset.metadata.importSource ?? null) !== canonicalizeImportJson(expectedSource)) {
      throw new ImportPlanningError("invalid_import_input", 400);
    }
    if (!asset.allowedSurfaces.includes(surface)) throw new ImportPlanningError("access_denied", 403);
    return { ...candidate, stableId: asset.stableId, sourceRef: asset.sourceRef };
  });
  const mapping = parseDeclaredInput(() => buildImportMappingManifest({
    schemaVersion: IMPORT_MANIFEST_VERSION, kind: "forgetbase.import-mapping",
    snapshotId: snapshot.snapshotId, snapshotChecksum: snapshot.checksum,
    sourceScopeId: snapshot.source.sourceScopeId, sourceReadRevision: snapshot.sourceReadRevision,
    queryScopeDigest: snapshot.source.queryScopeDigest, correlationId: snapshot.correlationId,
    complete: true, totalCount: candidates.length,
    continuation: { version: "continuation-v1", complete: true, nextCursor: null, proof: "exhaustive" },
    mappings: candidates.map((candidate) => ({ candidate })), truncated: false
  }));
  const revisionBefore = await registry.getContentRevision(principal.tenantId);
  const stableIds = new Set(candidates.map((candidate) => candidate.stableId));
  const sourceRefs = new Set(candidates.map((candidate) => candidate.sourceRef));
  const captured: CapturedTarget[] = [];
  let afterStableId: string | undefined;
  let scanned = 0;
  while (true) {
    const page = await registry.listAssets({ tenantId: principal.tenantId, view: "current", limit: 200, afterStableId });
    scanned += page.length;
    if (scanned > 5_000) throw new ImportPlanningError("import_target_limit_exceeded", 409);
    for (const asset of page) {
      const source = targetSource(asset);
      // A malformed identity must remain visible as unresolved, not prove absence.
      const rawSource = asset.metadata.importSource;
      const rawScopeId = rawSource && typeof rawSource === "object" && !Array.isArray(rawSource)
        ? (rawSource as Record<string, unknown>).sourceScopeId : null;
      const inScope = rawScopeId === snapshot.source.sourceScopeId || source.sourceScopeId === snapshot.source.sourceScopeId ||
        (source.system === snapshot.source.system && source.rootId === snapshot.source.rootId && source.scopeId === snapshot.source.scopeId) ||
        (asset.sourceKind === snapshot.source.system && Boolean(asset.sourceRef?.startsWith(snapshot.source.sourceRefPrefix)));
      if (!inScope && !stableIds.has(asset.stableId) && !(asset.sourceRef && sourceRefs.has(asset.sourceRef))) continue;
      if (captured.length >= 200) throw new ImportPlanningError("import_target_limit_exceeded", 409);
      await requireTargetAccess(asset, context);
      const detail = await registry.getAssetByStableId(asset.stableId, { tenantId: principal.tenantId, view: "current" });
      if (!detail || canonicalizeImportJson(detail.asset) !== canonicalizeImportJson(asset)) {
        throw new ImportPlanningError("import_target_changed", 409);
      }
      captured.push({ detail, grants: await readGrants(auth, principal.tenantId, asset.stableId) });
    }
    if (page.length < 200) break;
    const next = page.at(-1)!.stableId;
    if (next === afterStableId) throw new ImportPlanningError("import_target_changed", 409);
    afterStableId = next;
  }
  // Grants have their own lifecycle and are not covered by the registry revision.
  for (const target of captured) {
    const grants = await readGrants(auth, principal.tenantId, target.detail.asset.stableId);
    if (canonicalizeImportJson(grants) !== canonicalizeImportJson(target.grants)) {
      throw new ImportPlanningError("import_target_changed", 409);
    }
    await requireTargetAccess(target.detail.asset, context);
  }
  if (await registry.getContentRevision(principal.tenantId) !== revisionBefore) {
    throw new ImportPlanningError("import_target_changed", 409);
  }
  const targets = captured.map(toTarget);
  // Stable for identical source input and relevant current state; no clock/random IDs.
  const targetRevision = digest(captured.map(({ detail, grants }) => ({
    asset: detail.asset, version: detail.versions.find((version) => version.id === detail.asset.currentVersionId), grants
  })));
  const targetManifest = buildImportTargetManifest({
    schemaVersion: IMPORT_MANIFEST_VERSION, kind: "forgetbase.import-target-state",
    tenantId: principal.tenantId, sourceScopeId: snapshot.source.sourceScopeId,
    targetSnapshotId: `target-${targetRevision}`, correlationId: snapshot.correlationId,
    capturedAt: snapshot.capturedAt, targetReadRevision: targetRevision,
    hashContractVersion: IMPORT_HASH_CONTRACT_VERSION, mappingChecksum: mapping.checksum,
    queryScopeDigest: snapshot.source.queryScopeDigest,
    complete: true, totalCount: targets.length, truncated: false,
    continuation: { version: "continuation-v1", complete: true, nextCursor: null, proof: "exhaustive" }, targets
  });
  return planImport({ tenantId: principal.tenantId, snapshot, mapping, targetManifest });
}

function targetSource(asset: AssetRecord): ImportTargetSummaryDraft["source"] {
  const stored = asset.metadata.importSource;
  const parsed = importTargetSourceIdentitySchema.safeParse({
    ...(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}), sourceRef: asset.sourceRef
  });
  return parsed.success && parsed.data.system === asset.sourceKind ? parsed.data : {
    system: null, rootId: null, scopeId: null, sourceScopeId: null, sourceId: null, sourceRef: asset.sourceRef
  };
}

async function requireTargetAccess(asset: AssetRecord, { auth, principal, surface }: PlanningContext) {
  if (!await auth.canAccessAsset({ principal, asset, action: "read", surface }) ||
      !await auth.canAccessAsset({ principal, asset, action: "write", surface })) {
    throw new ImportPlanningError("access_denied", 403);
  }
}

async function readGrants(auth: AuthRepository, tenantId: string, stableId: string): Promise<PermissionGrant[]> {
  const grants: PermissionGrant[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await auth.listPermissionGrants({ tenantId, stableId, limit: 200, cursor });
    grants.push(...page.grants);
    if (grants.reduce((sum, grant) => sum + grant.surfaces.length, 0) > 2_000) {
      throw new ImportPlanningError("import_target_limit_exceeded", 409);
    }
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new ImportPlanningError("import_target_changed", 409);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return grants.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function effectiveAccess(detail: AssetDetail, grants: PermissionGrant[]): ImportEffectiveAccess | null {
  const asset = detail.asset;
  const reviewState = asset.status === "approved" ? "approved" : asset.status === "rejected" ? "rejected" :
    ["draft", "review", "reviewing", "pending"].includes(asset.status) ? "pending" : null;
  if (!reviewState) return null;
  const effectiveGrants = new Map<string, ImportEffectiveAccess["effectiveGrants"][number]>();
  for (const grant of grants) for (const surface of grant.surfaces) {
    const entry = { principalType: grant.principalType, principalId: grant.principalId, action: grant.action, surface, exportName: null };
    effectiveGrants.set(canonicalizeImportJson(entry), entry);
  }
  return {
    accessContractVersion: IMPORT_ACCESS_CONTRACT_VERSION, lifecycleState: asset.lifecycleState,
    publicationState: asset.publishedVersionId ? "published" : "draft", reviewState,
    sensitivity: asset.sensitivity, audience: asset.audience, allowedSurfaces: asset.allowedSurfaces,
    allowedExports: asset.allowedExports, allowedActions: asset.allowedActions,
    effectiveGrants: [...effectiveGrants.values()]
  };
}

function toTarget({ detail, grants }: CapturedTarget): ImportTargetSummaryDraft {
  const asset = detail.asset;
  const version = detail.versions.find((entry) => entry.id === asset.currentVersionId);
  const base = { tenantId: asset.tenantId, assetId: asset.id, stableId: asset.stableId,
    source: targetSource(asset), effectiveAccess: effectiveAccess(detail, grants) };
  const instructionObjects = detail.instructionObjects.map((instruction) => ({ ...instruction, escalation: instruction.escalation ?? undefined }));
  const humanDocuments = detail.humanDocuments;
  if (version?.assetSnapshot &&
      canonicalizeImportJson(version.assetSnapshot) === canonicalizeImportJson(assetVersionAssetSnapshotSchema.parse({ ...asset, summary: asset.summary ?? null })) &&
      version.contentHash === hashGovernedAssetSnapshot(version.assetSnapshot, { instructionObjects, humanDocuments })) {
    // Pass the helper's exact object through; the builder rejects tampered typed evidence.
    return buildImportTargetSummaryFromGovernedSnapshot({ ...base, governedSnapshot: {
      assetSnapshot: version.assetSnapshot, versionId: version.id, instructionObjects, humanDocuments
    } });
  }
  return { ...base, current: { versionId: version?.id ?? null, contentHash: null, hashVerification: "unverified" } };
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalizeImportJson(value)).digest("hex");
}

function parseDeclaredInput<T>(build: () => T): T {
  try { return build(); }
  catch { throw new ImportPlanningError("invalid_import_input", 400); }
}
