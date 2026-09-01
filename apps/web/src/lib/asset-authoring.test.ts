import { describe, expect, it } from "vitest";
import {
  assetCreateInputSchema,
  assetUpdateInputSchema,
  type AssetDetail
} from "@forgetbase/schema";
import {
  assetAuthoringFormFromDetail,
  buildAssetCreateInput,
  buildAssetUpdateInput,
  createEmptyAssetAuthoringForm,
  validateAssetAuthoringForm
} from "./asset-authoring.js";

function form() {
  return {
    ...createEmptyAssetAuthoringForm("user_admin", "2027-01-31"),
    stableId: "guide.release-checklist",
    title: "Release checklist",
    summary: "Checks to complete before publishing.",
    parentStableId: "guide.operations",
    audience: "maintainers, readers, maintainers",
    body: "# Release checklist\n\nReview the release evidence.",
    changeNote: "Clarify the evidence check"
  };
}

describe("asset authoring", () => {
  it("maps a new page to a governed draft human document", () => {
    const input = buildAssetCreateInput(form());

    expect(input).toMatchObject({
      stableId: "guide.release-checklist",
      type: "human-document",
      lifecycleState: "draft",
      status: "draft",
      audience: ["maintainers", "readers"],
      allowedSurfaces: ["api", "cli", "mcp", "web"],
      metadata: { readerParentId: "guide.operations" },
      humanDocument: {
        format: "markdown",
        body: "# Release checklist\n\nReview the release evidence."
      }
    });
    expect(() => assetCreateInputSchema.parse(input)).not.toThrow();
  });

  it("preserves unrelated metadata and returns edited pages to draft governance", () => {
    const input = buildAssetUpdateInput(
      form(),
      {
        readerParentId: "guide.old-parent",
        readerNavOrder: 20,
        customFlag: true
      },
      {
        id: "human_document_release",
        assetId: "asset_release",
        versionId: "version_1",
        format: "markdown",
        renderOptions: { headingIds: true },
        linkedInstructionIds: ["instruction_release"],
        body: "Old body",
        createdAt: "2026-09-01T00:00:00.000Z"
      }
    );

    expect(input).toMatchObject({
      lifecycleState: "draft",
      status: "draft",
      metadata: {
        readerParentId: "guide.operations",
        readerNavOrder: 20,
        customFlag: true
      },
      humanDocument: {
        format: "markdown",
        renderOptions: { headingIds: true },
        linkedInstructionIds: ["instruction_release"]
      },
      changeNote: "Clarify the evidence check"
    });
    expect(() => assetUpdateInputSchema.parse(input)).not.toThrow();
  });

  it("removes only the reader parent when an edited page becomes a root", () => {
    const input = buildAssetUpdateInput({ ...form(), parentStableId: "" }, {
      readerParentId: "guide.operations",
      readerNavOrder: 20
    });

    expect(input.metadata).toEqual({ readerNavOrder: 20 });
  });

  it("reports actionable create and edit validation errors", () => {
    const invalid = {
      ...form(),
      stableId: "Bad ID",
      title: "",
      ownerId: "",
      reviewDueAt: "2027-02-30",
      audience: " , ",
      body: "",
      parentStableId: "missing.parent",
      changeNote: ""
    };

    expect(validateAssetAuthoringForm(invalid, "edit", ["guide.operations"])).toEqual({
      stableId: "Use lowercase letters, numbers, dots, hyphens, or underscores.",
      title: "Enter a page title.",
      ownerId: "Enter an owner ID.",
      reviewDueAt: "Use a valid date in YYYY-MM-DD format.",
      audience: "Enter at least one audience.",
      body: "Add Markdown content for the page.",
      parentStableId: "Choose a parent page that still exists.",
      changeNote: "Describe what changed in this version."
    });
  });

  it("rejects duplicate stable IDs for create and self-parenting", () => {
    const duplicate = form();
    const selfParent = { ...form(), parentStableId: form().stableId };

    expect(validateAssetAuthoringForm(duplicate, "create", [duplicate.stableId]).stableId)
      .toBe("This stable ID is already in use.");
    expect(validateAssetAuthoringForm(selfParent, "edit", [selfParent.stableId]).parentStableId)
      .toBe("A page cannot be its own parent.");
  });

  it("rejects a parent that would create a multi-page navigation cycle", () => {
    const edited = form();
    const parentByStableId = new Map([
      ["guide.operations", "guide.child"],
      ["guide.child", edited.stableId]
    ]);

    expect(validateAssetAuthoringForm(
      edited,
      "edit",
      ["guide.operations", "guide.child", edited.stableId],
      parentByStableId
    ).parentStableId).toBe("This parent would create a navigation cycle.");
  });

  it("preserves Markdown whitespace after validating meaningful content", () => {
    const indented = { ...form(), body: "    code block\n" };

    expect(validateAssetAuthoringForm(indented, "create", ["guide.operations"])).toEqual({});
    expect(buildAssetCreateInput(indented).humanDocument?.body).toBe("    code block\n");
  });

  it("initializes edit state from the current human document", () => {
    const detail = {
      asset: {
        stableId: "guide.release-checklist",
        ownerId: "user_admin",
        title: "Release checklist",
        summary: "Release guidance",
        reviewDueAt: "2027-01-31",
        sensitivity: "internal",
        audience: ["maintainers"],
        metadata: { readerParentId: "guide.operations" }
      },
      humanDocuments: [{ body: "# Release checklist" }]
    } as AssetDetail;

    expect(assetAuthoringFormFromDetail(detail)).toEqual({
      stableId: "guide.release-checklist",
      title: "Release checklist",
      summary: "Release guidance",
      parentStableId: "guide.operations",
      ownerId: "user_admin",
      reviewDueAt: "2027-01-31",
      sensitivity: "internal",
      audience: "maintainers",
      body: "# Release checklist",
      changeNote: ""
    });
  });
});
