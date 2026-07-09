import {
  assetCreateInputSchema,
  assetSchema,
  assetValidationInputSchema,
  assetValidationReportSchema,
  piiRedactionRuleKindSchema,
  type Asset,
  type AssetValidationInput,
  type AssetValidationReport,
  type PiiRedactionPolicy,
  type PiiRedactionRuleKind,
  type ValidationIssue
} from "@forgetbase/schema";

export interface SchemaValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: SchemaValidationIssue[];
}

export interface RedactionFinding {
  kind: PiiRedactionRuleKind;
  count: number;
}

export interface RedactedText {
  text: string;
  redacted: boolean;
  findings: RedactionFinding[];
}

export interface RedactionOptions {
  enabled?: boolean;
  ruleKinds?: PiiRedactionRuleKind[];
}

export const DEFAULT_PII_REDACTION_RULE_KINDS = piiRedactionRuleKindSchema.options;

const redactionRules: Array<{
  kind: RedactionFinding["kind"];
  placeholder: string;
  pattern: RegExp;
}> = [
  {
    kind: "jwt",
    placeholder: "[REDACTED_JWT]",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
  },
  {
    kind: "bearer-token",
    placeholder: "Bearer [REDACTED_BEARER_TOKEN]",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/g
  },
  {
    kind: "api-key",
    placeholder: "[REDACTED_API_KEY]",
    pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|fbase_[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g
  },
  {
    kind: "url-secret",
    placeholder: "$1=[REDACTED_URL_SECRET]",
    pattern: /\b(access_token|api_key|token|secret|password|code)=([^&\s]{8,})/gi
  },
  {
    kind: "email",
    placeholder: "[REDACTED_EMAIL]",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  },
  {
    kind: "credit-card",
    placeholder: "[REDACTED_PAYMENT_CARD]",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g
  },
  {
    kind: "government-id",
    placeholder: "[REDACTED_GOVERNMENT_ID]",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g
  },
  {
    kind: "ip-address",
    placeholder: "[REDACTED_IP_ADDRESS]",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g
  },
  {
    kind: "phone",
    placeholder: "[REDACTED_PHONE]",
    pattern: /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?!\w)/g
  }
];

const internalReferenceKeys = [
  "relatedStableIds",
  "dependsOnStableIds",
  "linkedStableIds",
  "supersedesStableIds"
];

type ParsedAssetCreateInput = ReturnType<typeof assetCreateInputSchema.parse>;

export function validateAsset(input: unknown): ValidationResult<Asset> {
  const result = assetSchema.safeParse(input);

  if (result.success) {
    return {
      ok: true,
      value: result.data,
      issues: []
    };
  }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  };
}

export function validateAssetCollection(input: unknown, options: Partial<AssetValidationInput> = {}): AssetValidationReport {
  const records = readAssetCollectionInput(input);
  const asOf = normalizeDateOnly(options.asOf ?? new Date()) ?? normalizeDateOnly(new Date()) ?? "1970-01-01";
  const publicExportPackages = options.publicExportPackages ?? ["demo-agent-pack", "public-demo"];
  const issues: ValidationIssue[] = [];
  const parsedAssets: ParsedAssetCreateInput[] = [];

  records.forEach((record, index) => {
    const result = assetCreateInputSchema.safeParse(record);
    const stableId = readStableId(record);
    const pathPrefix = `assets.${index}`;

    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          severity: "error",
          code: "schema.invalid",
          path: [pathPrefix, ...issue.path.map(String)].join("."),
          message: issue.message,
          stableId
        });
      }
      return;
    }

    parsedAssets.push(result.data);
    validateReviewDate(result.data, index, asOf, issues);
    validateAllowedSurfaces(result.data, index, issues);
    validateRestrictedExports(result.data, index, publicExportPackages, issues);
    validateSearchEligibility(result.data, index, issues);
    validateHumanDocumentInstructionLinks(result.data, index, issues);
  });

  validateStableIdUniqueness(parsedAssets, issues);
  validateInternalReferences(parsedAssets, issues);
  validateReaderNavigation(parsedAssets, issues);

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const staleCount = issues.filter((issue) => issue.code === "review.stale").length;

  return assetValidationReportSchema.parse({
    ok: errorCount === 0,
    checkedAt: new Date().toISOString(),
    asOf,
    assetCount: records.length,
    errorCount,
    warningCount,
    staleCount,
    issues
  });
}

export function redactText(input: string, options?: RedactionOptions | PiiRedactionPolicy): RedactedText {
  const normalizedOptions = normalizeRedactionOptions(options);

  if (!normalizedOptions.enabled) {
    return {
      text: input,
      redacted: false,
      findings: []
    };
  }

  const enabledRuleKinds = new Set(normalizedOptions.ruleKinds);
  let text = input;
  const findings: RedactionFinding[] = [];

  for (const rule of redactionRules) {
    if (!enabledRuleKinds.has(rule.kind)) {
      continue;
    }

    const matches = text.match(rule.pattern);
    const count = matches?.length ?? 0;

    if (count > 0) {
      text = text.replace(rule.pattern, rule.placeholder);
      findings.push({
        kind: rule.kind,
        count
      });
    }
  }

  return {
    text,
    redacted: findings.length > 0,
    findings
  };
}

function normalizeRedactionOptions(options?: RedactionOptions | PiiRedactionPolicy): Required<RedactionOptions> {
  if (!options) {
    return {
      enabled: true,
      ruleKinds: [...DEFAULT_PII_REDACTION_RULE_KINDS]
    };
  }

  const enabled = "redactionEnabled" in options
    ? options.redactionEnabled
    : options.enabled ?? true;
  const ruleKinds = "enabledRuleKinds" in options
    ? options.enabledRuleKinds
    : options.ruleKinds ?? DEFAULT_PII_REDACTION_RULE_KINDS;

  return {
    enabled,
    ruleKinds: ruleKinds.filter((kind, index) => ruleKinds.indexOf(kind) === index)
  };
}

function readAssetCollectionInput(input: unknown): unknown[] {
  const parsed = assetValidationInputSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data.assets;
  }

  if (Array.isArray(input)) {
    return input;
  }

  if (isRecord(input) && Array.isArray(input.assets)) {
    return input.assets;
  }

  return [input];
}

function validateReviewDate(
  asset: ParsedAssetCreateInput,
  index: number,
  asOf: string,
  issues: ValidationIssue[]
): void {
  const reviewDate = normalizeDateOnly(asset.reviewDueAt);

  if (!reviewDate) {
    issues.push({
      severity: "error",
      code: "review.invalid_date",
      path: `assets.${index}.reviewDueAt`,
      message: "reviewDueAt must be a valid YYYY-MM-DD date",
      stableId: asset.stableId
    });
    return;
  }

  if (reviewDate < asOf) {
    issues.push({
      severity: "warning",
      code: "review.stale",
      path: `assets.${index}.reviewDueAt`,
      message: `reviewDueAt ${reviewDate} is before validation date ${asOf}`,
      stableId: asset.stableId
    });
  }
}

function validateAllowedSurfaces(asset: ParsedAssetCreateInput, index: number, issues: ValidationIssue[]): void {
  if (asset.allowedExports.length > 0 && !asset.allowedSurfaces.includes("export")) {
    issues.push({
      severity: "warning",
      code: "surface.export_missing",
      path: `assets.${index}.allowedSurfaces`,
      message: "Assets with allowedExports should normally include the export surface",
      stableId: asset.stableId
    });
  }
}

function validateRestrictedExports(
  asset: ParsedAssetCreateInput,
  index: number,
  publicExportPackages: string[],
  issues: ValidationIssue[]
): void {
  const leakedPackages = asset.allowedExports.filter((packageName) =>
    publicExportPackages.includes(packageName) && asset.sensitivity !== "public-demo"
  );

  if (leakedPackages.length > 0) {
    issues.push({
      severity: "error",
      code: "export.restricted_leakage",
      path: `assets.${index}.allowedExports`,
      message: `Non-public asset is allowed in public export package(s): ${leakedPackages.join(", ")}`,
      stableId: asset.stableId
    });
  }
}

function validateSearchEligibility(asset: ParsedAssetCreateInput, index: number, issues: ValidationIssue[]): void {
  const searchableSurfaces = ["api", "cli", "mcp", "web"];

  if (
    asset.lifecycleState === "active" &&
    asset.status === "approved" &&
    !asset.allowedSurfaces.some((surface) => searchableSurfaces.includes(surface)) &&
    asset.allowedExports.length === 0
  ) {
    issues.push({
      severity: "warning",
      code: "search.not_retrievable",
      path: `assets.${index}.allowedSurfaces`,
      message: "Approved active asset is not available to retrieval or export surfaces",
      stableId: asset.stableId
    });
  }
}

function validateHumanDocumentInstructionLinks(
  asset: ParsedAssetCreateInput,
  index: number,
  issues: ValidationIssue[]
): void {
  const linkedInstructionIds = asset.humanDocument?.linkedInstructionIds ?? [];

  if (linkedInstructionIds.length === 0) {
    return;
  }

  const uniqueIds = new Set<string>();

  linkedInstructionIds.forEach((instructionId, instructionIndex) => {
    if (uniqueIds.has(instructionId)) {
      issues.push({
        severity: "warning",
        code: "document.linked_instruction_duplicate",
        path: `assets.${index}.humanDocument.linkedInstructionIds.${instructionIndex}`,
        message: `Duplicate linked instruction ID ${instructionId}`,
        stableId: asset.stableId
      });
    }

    uniqueIds.add(instructionId);
  });

  if (!asset.instruction) {
    issues.push({
      severity: "error",
      code: "document.linked_instruction_missing",
      path: `assets.${index}.humanDocument.linkedInstructionIds`,
      message: "Human document links instruction IDs, but this asset does not define an instruction object",
      stableId: asset.stableId
    });
    return;
  }

  issues.push({
    severity: "warning",
    code: "document.linked_instruction_unverified",
    path: `assets.${index}.humanDocument.linkedInstructionIds`,
    message: "Linked instruction IDs cannot be fully verified until imported instruction records have database IDs",
    stableId: asset.stableId
  });
}

function validateStableIdUniqueness(assets: ParsedAssetCreateInput[], issues: ValidationIssue[]): void {
  const firstSeen = new Map<string, number>();

  assets.forEach((asset, index) => {
    const existingIndex = firstSeen.get(asset.stableId);

    if (existingIndex === undefined) {
      firstSeen.set(asset.stableId, index);
      return;
    }

    issues.push({
      severity: "error",
      code: "stable_id.duplicate",
      path: `assets.${index}.stableId`,
      message: `Duplicate stableId also appears at assets.${existingIndex}.stableId`,
      stableId: asset.stableId
    });
  });
}

function validateInternalReferences(assets: ParsedAssetCreateInput[], issues: ValidationIssue[]): void {
  const stableIds = new Set(assets.map((asset) => asset.stableId));

  assets.forEach((asset, index) => {
    for (const key of internalReferenceKeys) {
      const value = asset.metadata[key];

      if (!Array.isArray(value)) {
        continue;
      }

      value.forEach((reference, referenceIndex) => {
        if (typeof reference !== "string") {
          issues.push({
            severity: "error",
            code: "reference.invalid",
            path: `assets.${index}.metadata.${key}.${referenceIndex}`,
            message: "Internal stable ID references must be strings",
            stableId: asset.stableId
          });
          return;
        }

        if (!stableIds.has(reference)) {
          issues.push({
            severity: "error",
            code: "reference.missing",
            path: `assets.${index}.metadata.${key}.${referenceIndex}`,
            message: `Referenced asset ${reference} is not present in this validation set`,
            stableId: asset.stableId
          });
        }
      });
    }
  });
}

function validateReaderNavigation(assets: ParsedAssetCreateInput[], issues: ValidationIssue[]): void {
  const assetIndexes = new Map<string, number>();
  const parents = new Map<string, string>();

  assets.forEach((asset, index) => {
    if (!assetIndexes.has(asset.stableId)) {
      assetIndexes.set(asset.stableId, index);
    }

    const parentId = asset.metadata.readerParentId;

    if (typeof parentId === "string") {
      parents.set(asset.stableId, parentId);
    }
  });

  parents.forEach((parentId, stableId) => {
    const index = assetIndexes.get(stableId);

    if (index === undefined) {
      return;
    }

    if (parentId === stableId) {
      issues.push({
        severity: "error",
        code: "reader.parent_self",
        path: `assets.${index}.metadata.readerParentId`,
        message: "Reader navigation parent must not reference the asset itself",
        stableId
      });
      return;
    }

    if (!assetIndexes.has(parentId)) {
      issues.push({
        severity: "error",
        code: "reader.parent_missing",
        path: `assets.${index}.metadata.readerParentId`,
        message: `Reader navigation parent ${parentId} is not present in this validation set`,
        stableId
      });
    }
  });

  const cycleMembers = new Set<string>();

  for (const asset of assets) {
    const path: string[] = [];
    const positions = new Map<string, number>();
    let current: string | undefined = asset.stableId;

    while (current && assetIndexes.has(current)) {
      const existingPosition = positions.get(current);

      if (existingPosition !== undefined) {
        path.slice(existingPosition).forEach((stableId) => cycleMembers.add(stableId));
        break;
      }

      positions.set(current, path.length);
      path.push(current);
      const parentId = parents.get(current);
      current = parentId === current ? undefined : parentId;
    }
  }

  cycleMembers.forEach((stableId) => {
    const index = assetIndexes.get(stableId);

    if (index === undefined) {
      return;
    }

    issues.push({
      severity: "error",
      code: "reader.parent_cycle",
      path: `assets.${index}.metadata.readerParentId`,
      message: "Reader navigation parent relationships must not contain a cycle",
      stableId
    });
  });
}

function normalizeDateOnly(value: Date | string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return value;
}

function readStableId(input: unknown): string | undefined {
  return isRecord(input) && typeof input.stableId === "string" ? input.stableId : undefined;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
