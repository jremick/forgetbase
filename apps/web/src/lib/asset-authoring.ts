import type {
  AssetCreateInput,
  AssetDetail,
  AssetUpdateInput,
  HumanDocument,
  Sensitivity
} from "@forgetbase/schema";

export type AssetAuthoringMode = "create" | "edit";

export type AssetAuthoringFormState = {
  stableId: string;
  title: string;
  summary: string;
  parentStableId: string;
  ownerId: string;
  reviewDueAt: string;
  sensitivity: Sensitivity;
  audience: string;
  body: string;
  changeNote: string;
};

export type AssetAuthoringField = keyof AssetAuthoringFormState;
export type AssetAuthoringErrors = Partial<Record<AssetAuthoringField, string>>;

const stableIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function parseAudience(value: string): string[] {
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

function isDateOnly(value: string): boolean {
  if (!dateOnlyPattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function metadataWithParent(
  currentMetadata: Record<string, unknown>,
  parentStableId: string
): Record<string, unknown> {
  const metadata = { ...currentMetadata };
  const parent = parentStableId.trim();

  if (parent) {
    metadata.readerParentId = parent;
  } else {
    delete metadata.readerParentId;
  }

  return metadata;
}

export function createEmptyAssetAuthoringForm(ownerId: string, reviewDueAt: string): AssetAuthoringFormState {
  return {
    stableId: "",
    title: "",
    summary: "",
    parentStableId: "",
    ownerId,
    reviewDueAt,
    sensitivity: "internal",
    audience: "readers",
    body: "",
    changeNote: ""
  };
}

export function assetAuthoringFormFromDetail(detail: AssetDetail): AssetAuthoringFormState {
  const parentStableId = typeof detail.asset.metadata.readerParentId === "string"
    ? detail.asset.metadata.readerParentId
    : "";

  return {
    stableId: detail.asset.stableId,
    title: detail.asset.title,
    summary: detail.asset.summary ?? "",
    parentStableId,
    ownerId: detail.asset.ownerId,
    reviewDueAt: detail.asset.reviewDueAt,
    sensitivity: detail.asset.sensitivity,
    audience: detail.asset.audience.join(", "),
    body: detail.humanDocuments[0]?.body ?? "",
    changeNote: ""
  };
}

export function validateAssetAuthoringForm(
  form: AssetAuthoringFormState,
  mode: AssetAuthoringMode,
  existingStableIds: Iterable<string>,
  parentByStableId: ReadonlyMap<string, string> = new Map()
): AssetAuthoringErrors {
  const errors: AssetAuthoringErrors = {};
  const stableId = form.stableId.trim();
  const knownStableIds = new Set(existingStableIds);

  if (!stableId) {
    errors.stableId = "Enter a stable ID.";
  } else if (!stableIdPattern.test(stableId)) {
    errors.stableId = "Use lowercase letters, numbers, dots, hyphens, or underscores.";
  } else if (mode === "create" && knownStableIds.has(stableId)) {
    errors.stableId = "This stable ID is already in use.";
  }

  if (!form.title.trim()) {
    errors.title = "Enter a page title.";
  }

  if (!form.ownerId.trim()) {
    errors.ownerId = "Enter an owner ID.";
  }

  if (!form.reviewDueAt.trim()) {
    errors.reviewDueAt = "Choose a review date.";
  } else if (!isDateOnly(form.reviewDueAt.trim())) {
    errors.reviewDueAt = "Use a valid date in YYYY-MM-DD format.";
  }

  if (!parseAudience(form.audience).length) {
    errors.audience = "Enter at least one audience.";
  }

  if (!form.body.trim()) {
    errors.body = "Add Markdown content for the page.";
  }

  const parentStableId = form.parentStableId.trim();
  if (parentStableId === stableId) {
    errors.parentStableId = "A page cannot be its own parent.";
  } else if (parentStableId && !knownStableIds.has(parentStableId)) {
    errors.parentStableId = "Choose a parent page that still exists.";
  } else if (parentStableId) {
    const visited = new Set<string>();
    let cursor: string | undefined = parentStableId;

    while (cursor && !visited.has(cursor)) {
      if (cursor === stableId) {
        errors.parentStableId = "This parent would create a navigation cycle.";
        break;
      }

      visited.add(cursor);
      cursor = parentByStableId.get(cursor);
    }
  }

  if (mode === "edit" && !form.changeNote.trim()) {
    errors.changeNote = "Describe what changed in this version.";
  }

  return errors;
}

export function buildAssetCreateInput(form: AssetAuthoringFormState): AssetCreateInput {
  return {
    stableId: form.stableId.trim(),
    type: "human-document",
    ownerId: form.ownerId.trim(),
    title: form.title.trim(),
    summary: form.summary.trim() || undefined,
    lifecycleState: "draft",
    sensitivity: form.sensitivity,
    audience: parseAudience(form.audience),
    status: "draft",
    reviewDueAt: form.reviewDueAt.trim(),
    sourceKind: "manual",
    allowedSurfaces: ["api", "cli", "mcp", "web"],
    allowedExports: [],
    allowedActions: [],
    metadata: metadataWithParent({}, form.parentStableId),
    humanDocument: {
      format: "markdown",
      body: form.body,
      renderOptions: {},
      linkedInstructionIds: []
    },
    changeNote: "Created in the admin UI"
  };
}

export function buildAssetUpdateInput(
  form: AssetAuthoringFormState,
  currentMetadata: Record<string, unknown>,
  currentDocument?: HumanDocument
): AssetUpdateInput {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    lifecycleState: "draft",
    sensitivity: form.sensitivity,
    audience: parseAudience(form.audience),
    status: "draft",
    reviewDueAt: form.reviewDueAt.trim(),
    metadata: metadataWithParent(currentMetadata, form.parentStableId),
    humanDocument: {
      format: currentDocument?.format ?? "markdown",
      body: form.body,
      renderOptions: currentDocument?.renderOptions ?? {},
      linkedInstructionIds: currentDocument?.linkedInstructionIds ?? []
    },
    changeNote: form.changeNote.trim()
  };
}
