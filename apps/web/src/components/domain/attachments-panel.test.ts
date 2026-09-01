import { describe, expect, it } from "vitest";
import { attachmentAllowedMediaTypes } from "@forgetbase/schema";

import {
  attachmentUploadHeaders,
  attachmentClientAllowedMediaTypes,
  formatAttachmentSize,
  getAttachmentPanelPresentation,
  validateAttachmentFile
} from "./attachments-panel.js";

describe("attachments panel helpers", () => {
  it("keeps the file picker allowlist aligned with the API contract", () => {
    expect(attachmentClientAllowedMediaTypes).toEqual(attachmentAllowedMediaTypes);
  });

  it("formats attachment sizes with compact binary units", () => {
    expect(formatAttachmentSize(0)).toBe("0 B");
    expect(formatAttachmentSize(512)).toBe("512 B");
    expect(formatAttachmentSize(1_536)).toBe("1.5 KB");
    expect(formatAttachmentSize(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatAttachmentSize(Number.NaN)).toBe("0 B");
  });

  it("keeps reader controls download-only", () => {
    expect(getAttachmentPanelPresentation({
      activeCount: 2,
      canManage: false,
      loading: false,
      uploading: false,
      maxBytes: 10 * 1024 * 1024
    })).toMatchObject({
      listLabel: "2 active attachments",
      showUploadControls: false,
      showDeleteControls: false,
      emptyTitle: "No attachments available"
    });
  });

  it("exposes admin controls and a clear upload limit", () => {
    expect(getAttachmentPanelPresentation({
      activeCount: 1,
      canManage: true,
      loading: false,
      uploading: true,
      maxBytes: 10 * 1024 * 1024
    })).toMatchObject({
      listLabel: "1 active attachment",
      showUploadControls: true,
      showDeleteControls: true,
      uploadDisabled: true,
      uploadLimitLabel: "Maximum file size: 10 MB."
    });
  });

  it("uses actionable admin and neutral reader empty states", () => {
    const admin = getAttachmentPanelPresentation({
      activeCount: 0,
      canManage: true,
      loading: false,
      uploading: false,
      maxBytes: 1024
    });
    const reader = getAttachmentPanelPresentation({
      activeCount: 0,
      canManage: false,
      loading: false,
      uploading: false,
      maxBytes: 1024
    });

    expect(admin.emptyTitle).toBe("No attachments yet");
    expect(admin.emptyDescription).toContain("Upload a file");
    expect(reader.emptyTitle).toBe("No attachments available");
    expect(reader.emptyDescription).toContain("does not have any files");
  });

  it("rejects oversized and unsupported file selections before upload", () => {
    expect(validateAttachmentFile({ name: "large.pdf", size: 11, type: "application/pdf" }, 10)).toContain("larger");
    expect(validateAttachmentFile({ name: "archive.zip", size: 8, type: "application/zip" }, 10)).toContain("unsupported");
    expect(validateAttachmentFile({ name: "unknown.bin", size: 8, type: "" }, 10)).toContain("unknown");
    expect(validateAttachmentFile({ name: "guide.pdf", size: 8, type: "application/pdf" }, 10)).toBe("");
  });

  it("keeps attachment display metadata out of the upload URL", () => {
    expect(attachmentUploadHeaders({ name: "private guide – résumé.pdf", type: "application/pdf" })).toEqual({
      "content-type": "application/octet-stream",
      "x-forgetbase-attachment-filename-encoded": "private%20guide%20%E2%80%93%20r%C3%A9sum%C3%A9.pdf",
      "x-forgetbase-attachment-media-type": "application/pdf"
    });
  });
});
