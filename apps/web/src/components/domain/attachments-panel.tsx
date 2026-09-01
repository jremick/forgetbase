import * as React from "react";
import { Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import type { Attachment } from "@forgetbase/schema";

import { Alert, AlertDescription, AlertTitle } from "../ui/alert.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";

export type AttachmentsPanelProps = {
  attachments: Attachment[];
  canManage: boolean;
  loading: boolean;
  uploading: boolean;
  maxBytes: number;
  error?: string;
  onUpload: (file: File) => void;
  onDownload: (attachment: Attachment) => void;
  onDelete: (attachment: Attachment) => void;
};

export const attachmentClientAllowedMediaTypes = [
  "application/json",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain"
] as const;

type AttachmentPanelPresentationInput = {
  activeCount: number;
  canManage: boolean;
  loading: boolean;
  uploading: boolean;
  maxBytes: number;
};

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function validateAttachmentFile(
  file: Pick<File, "name" | "size" | "type">,
  maxBytes: number
): string {
  if (file.size > maxBytes) {
    return `${file.name} is larger than the ${formatAttachmentSize(maxBytes)} limit.`;
  }
  if (!attachmentClientAllowedMediaTypes.some((mediaType) => mediaType === file.type)) {
    return `${file.name} has an unsupported file type (${file.type || "unknown"}).`;
  }
  return "";
}

export function attachmentUploadHeaders(file: Pick<File, "name" | "type">): Record<string, string> {
  return {
    "content-type": "application/octet-stream",
    "x-forgetbase-attachment-filename-encoded": encodeURIComponent(file.name),
    "x-forgetbase-attachment-media-type": file.type
  };
}

export function attachmentSecurityPresentation(attachment: Attachment): {
  label: string;
  variant: "success" | "warning" | "neutral";
} {
  const malwareScan = attachment.metadata.malwareScan;
  const status = malwareScan && typeof malwareScan === "object" && !Array.isArray(malwareScan)
    ? (malwareScan as Record<string, unknown>).status
    : undefined;
  if (status === "clean") return { label: "Malware scan passed", variant: "success" };
  if (status === "not-required") return { label: "Content checked", variant: "neutral" };
  return { label: "Scan status unavailable", variant: "warning" };
}

export function attachmentUploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("attachment_content_rejected")) {
    return "The file extension, declared type, and file contents do not match.";
  }
  if (message.includes("attachment_malware_detected")) {
    return "The malware scanner rejected this file. It was not stored.";
  }
  if (message.includes("attachment_scanner_unavailable")) {
    return "The malware scanner is unavailable. Uploads are paused until it recovers.";
  }
  if (message.includes("attachment_quota_exceeded")) {
    return "The attachment storage quota has been reached. Delete unused files or increase the configured quota.";
  }
  if (message.includes("attachment_upload_rate_limited") || message.includes("attachment_upload_concurrency_limited")) {
    return "Too many attachments are being uploaded. Wait briefly and try again.";
  }
  return message;
}

export function getAttachmentPanelPresentation({
  activeCount,
  canManage,
  loading,
  uploading,
  maxBytes
}: AttachmentPanelPresentationInput) {
  return {
    emptyTitle: canManage ? "No attachments yet" : "No attachments available",
    emptyDescription: canManage
      ? "Upload a file to make it available from this page."
      : "This page does not have any files available to download.",
    listLabel: `${activeCount} active ${activeCount === 1 ? "attachment" : "attachments"}`,
    showUploadControls: canManage,
    showDeleteControls: canManage,
    uploadDisabled: loading || uploading,
    uploadLimitLabel: `Maximum file size: ${formatAttachmentSize(maxBytes)}.`
  };
}

export function AttachmentsPanel({
  attachments,
  canManage,
  loading,
  uploading,
  maxBytes,
  error,
  onUpload,
  onDownload,
  onDelete
}: AttachmentsPanelProps) {
  const inputId = React.useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [selectionError, setSelectionError] = React.useState("");
  const activeAttachments = attachments.filter((attachment) => attachment.lifecycleState === "active");
  const presentation = getAttachmentPanelPresentation({
    activeCount: activeAttachments.length,
    canManage,
    loading,
    uploading,
    maxBytes
  });

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;

    const nextSelectionError = file ? validateAttachmentFile(file, maxBytes) : "";
    if (file && nextSelectionError) {
      setSelectedFile(null);
      setSelectionError(nextSelectionError);
      event.currentTarget.value = "";
      return;
    }

    setSelectedFile(file);
    setSelectionError("");
  }

  function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile || presentation.uploadDisabled) {
      return;
    }

    onUpload(selectedFile);
  }

  return (
    <Stack as="section" gap="4" aria-labelledby={`${inputId}-title`} aria-busy={loading || uploading}>
      <Stack gap="1">
        <Heading id={`${inputId}-title`} as="h3" size="md">
          Attachments
        </Heading>
        <Text color="fg.muted" textStyle="sm">
          Download files linked to this page. Files are not previewed in ForgetBase.
        </Text>
      </Stack>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Attachments could not be updated</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {presentation.showUploadControls ? (
        <Box as="form" onSubmit={submitUpload}>
          <Stack gap="3">
            <Stack gap="1">
              <Label htmlFor={inputId}>Choose a file</Label>
              <Input
                id={inputId}
                type="file"
                accept={attachmentClientAllowedMediaTypes.join(",")}
                disabled={presentation.uploadDisabled}
                aria-describedby={`${helpId}${selectionError ? ` ${errorId}` : ""}`}
                aria-invalid={selectionError ? true : undefined}
                onChange={selectFile}
              />
              <Text id={helpId} color="fg.muted" textStyle="sm">
                {presentation.uploadLimitLabel} Supported: PDF, Office documents, JSON, text, Markdown, CSV, PNG, JPEG, and WebP. The extension, file signature, and malware scan must pass before the file is stored.
              </Text>
              {selectionError ? (
                <Text id={errorId} color="fg.error" textStyle="sm" role="alert">
                  {selectionError}
                </Text>
              ) : null}
            </Stack>
            <HStack gap="2" align="center" flexWrap="wrap">
              <Button
                type="submit"
                variant="primary"
                disabled={!selectedFile || presentation.uploadDisabled}
                aria-disabled={!selectedFile || presentation.uploadDisabled}
              >
                {uploading ? "Uploading…" : "Upload attachment"}
              </Button>
              {selectedFile ? (
                <Text color="fg.muted" textStyle="sm">
                  Selected: {selectedFile.name} ({formatAttachmentSize(selectedFile.size)})
                </Text>
              ) : null}
            </HStack>
          </Stack>
        </Box>
      ) : null}

      {loading ? (
        <Text color="fg.muted" role="status" aria-live="polite">
          Loading attachments…
        </Text>
      ) : activeAttachments.length ? (
        <Box as="ul" listStyleType="none" m="0" p="0" aria-label={presentation.listLabel}>
          {activeAttachments.map((attachment) => (
            <Box as="li" key={attachment.id} borderTopWidth="1px" py="3" _last={{ borderBottomWidth: "1px" }}>
              <Stack direction={{ base: "column", sm: "row" }} gap="3" align={{ base: "stretch", sm: "center" }} justify="space-between">
                <Stack gap="1" minW="0">
                  <Text fontWeight="medium" overflowWrap="anywhere">
                    {attachment.filename}
                  </Text>
                  <Text color="fg.muted" textStyle="sm">
                    {attachment.mediaType} · {formatAttachmentSize(attachment.sizeBytes)}
                  </Text>
                  <Box>
                    <Badge variant={attachmentSecurityPresentation(attachment).variant}>
                      {attachmentSecurityPresentation(attachment).label}
                    </Badge>
                  </Box>
                </Stack>
                <HStack gap="2" align="center" flexWrap="wrap" flexShrink="0">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onDownload(attachment)}
                    aria-label={`Download ${attachment.filename}`}
                  >
                    Download
                  </Button>
                  {presentation.showDeleteControls ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      onClick={() => onDelete(attachment)}
                      aria-label={`Delete attachment ${attachment.filename}`}
                    >
                      Delete attachment
                    </Button>
                  ) : null}
                </HStack>
              </Stack>
            </Box>
          ))}
        </Box>
      ) : (
        <Box borderWidth="1px" borderStyle="dashed" rounded="md" p="5">
          <Stack gap="1">
            <Heading as="h4" size="sm">
              {presentation.emptyTitle}
            </Heading>
            <Text color="fg.muted" textStyle="sm">
              {presentation.emptyDescription}
            </Text>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
