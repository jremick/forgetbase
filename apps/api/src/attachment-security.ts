import { createConnection } from "node:net";

export type AttachmentInspection = {
  detectedMediaType: string;
  extension: string;
};

export type AttachmentMalwareScanResult = {
  status: "clean" | "infected";
  scanner: string;
};

export interface AttachmentMalwareScanner {
  scan(content: Uint8Array): Promise<AttachmentMalwareScanResult>;
  checkReady?(): Promise<void>;
}

export class AttachmentContentRejectedError extends Error {
  constructor(public readonly reason: "extension_mismatch" | "content_mismatch" | "invalid_content") {
    super("Attachment content does not match the permitted file type.");
    this.name = "AttachmentContentRejectedError";
  }
}

export class AttachmentMalwareDetectedError extends Error {
  constructor() {
    super("Attachment malware scan rejected the file.");
    this.name = "AttachmentMalwareDetectedError";
  }
}

export class AttachmentScannerUnavailableError extends Error {
  constructor() {
    super("Attachment malware scanner is unavailable.");
    this.name = "AttachmentScannerUnavailableError";
  }
}

export class AttachmentFixedWindowRateLimiter {
  private readonly entries = new Map<string, { count: number; windowStartedAt: number; lastTouchedAt: number }>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly maxEntries = 10_000
  ) {
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) throw new Error("Rate limit must be positive.");
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error("Rate window must be positive.");
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("Rate entry limit must be positive.");
  }

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const existing = this.entries.get(key);
    const entry = !existing || now - existing.windowStartedAt >= this.windowMs
      ? { count: 0, windowStartedAt: now, lastTouchedAt: now }
      : existing;
    entry.count += 1;
    entry.lastTouchedAt = now;
    this.entries.set(key, entry);
    this.prune();
    const allowed = entry.count <= this.maxRequests;
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((entry.windowStartedAt + this.windowMs - now) / 1_000))
    };
  }

  private prune(): void {
    if (this.entries.size <= this.maxEntries) return;
    const oldest = Array.from(this.entries.entries())
      .sort((left, right) => left[1].lastTouchedAt - right[1].lastTouchedAt)
      .slice(0, this.entries.size - this.maxEntries);
    for (const [key] of oldest) this.entries.delete(key);
  }
}

export class AttachmentConcurrencyGate {
  private active = 0;

  constructor(private readonly maxConcurrent: number) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("Attachment concurrency limit must be positive.");
    }
  }

  tryAcquire(): (() => void) | null {
    if (this.active >= this.maxConcurrent) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

const MEDIA_TYPE_EXTENSIONS = new Map<string, ReadonlySet<string>>([
  ["application/json", new Set(["json"])],
  ["application/pdf", new Set(["pdf"])],
  ["application/vnd.ms-excel", new Set(["xls"])],
  ["application/vnd.ms-powerpoint", new Set(["ppt"])],
  ["application/vnd.ms-word", new Set(["doc"])],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", new Set(["pptx"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set(["xlsx"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set(["docx"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["text/csv", new Set(["csv"])],
  ["text/markdown", new Set(["md", "markdown"])],
  ["text/plain", new Set(["txt"])]
]);

const LEGACY_OFFICE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function inspectAttachmentContent(input: {
  filename: string;
  mediaType: string;
  content: Uint8Array;
}): AttachmentInspection {
  const content = Buffer.from(input.content.buffer, input.content.byteOffset, input.content.byteLength);
  const extension = filenameExtension(input.filename);
  const allowedExtensions = MEDIA_TYPE_EXTENSIONS.get(input.mediaType);

  if (!allowedExtensions?.has(extension)) {
    throw new AttachmentContentRejectedError("extension_mismatch");
  }

  if (!contentMatchesMediaType(content, input.mediaType)) {
    throw new AttachmentContentRejectedError("content_mismatch");
  }

  if (input.mediaType === "application/json") {
    try {
      JSON.parse(decodeText(content));
    } catch {
      throw new AttachmentContentRejectedError("invalid_content");
    }
  }

  return { detectedMediaType: input.mediaType, extension };
}

export class DisabledAttachmentMalwareScanner implements AttachmentMalwareScanner {
  async scan(): Promise<AttachmentMalwareScanResult> {
    return { status: "clean", scanner: "disabled" };
  }
}

export class ClamDAttachmentMalwareScanner implements AttachmentMalwareScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs: number
  ) {
    if (!host.trim()) throw new Error("ClamD host must not be empty.");
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("ClamD port is invalid.");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("ClamD timeout must be positive.");
  }

  async checkReady(): Promise<void> {
    const reply = await this.exchange([Buffer.from("zPING\0")]);
    if (reply !== "PONG") throw new AttachmentScannerUnavailableError();
  }

  async scan(content: Uint8Array): Promise<AttachmentMalwareScanResult> {
    const chunks: Buffer[] = [Buffer.from("zINSTREAM\0")];

    for (let offset = 0; offset < content.byteLength; offset += 64 * 1024) {
      const chunk = Buffer.from(
        content.buffer,
        content.byteOffset + offset,
        Math.min(64 * 1024, content.byteLength - offset)
      );
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(chunk.byteLength);
      chunks.push(length, chunk);
    }
    chunks.push(Buffer.alloc(4));

    const reply = await this.exchange(chunks);
    if (/^stream: OK$/i.test(reply)) {
      return { status: "clean", scanner: "clamd" };
    }
    if (/^stream: .+ FOUND$/i.test(reply)) {
      return { status: "infected", scanner: "clamd" };
    }
    throw new AttachmentScannerUnavailableError();
  }

  private async exchange(chunks: Buffer[]): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      const responseChunks: Buffer[] = [];
      let responseBytes = 0;
      let settled = false;

      const finish = (error?: Error, response?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(response ?? "");
      };

      socket.setTimeout(this.timeoutMs, () => finish(new AttachmentScannerUnavailableError()));
      socket.once("error", () => finish(new AttachmentScannerUnavailableError()));
      socket.once("connect", () => {
        for (const chunk of chunks) socket.write(chunk);
      });
      socket.on("data", (chunk: Buffer) => {
        responseBytes += chunk.byteLength;
        if (responseBytes > 8 * 1024) {
          finish(new AttachmentScannerUnavailableError());
          return;
        }
        responseChunks.push(chunk);
        const response = Buffer.concat(responseChunks, responseBytes);
        const terminator = response.indexOf(0);
        if (terminator >= 0) {
          finish(undefined, response.subarray(0, terminator).toString("utf8").trim());
        }
      });
      socket.once("close", () => {
        if (!settled) finish(new AttachmentScannerUnavailableError());
      });
    });
  }
}

function filenameExtension(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index > 0 && index < filename.length - 1
    ? filename.slice(index + 1).toLowerCase()
    : "";
}

function contentMatchesMediaType(content: Buffer, mediaType: string): boolean {
  switch (mediaType) {
    case "application/pdf":
      return content.subarray(0, Math.min(content.byteLength, 1024)).includes(Buffer.from("%PDF-"));
    case "image/jpeg":
      return content.byteLength >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
    case "image/png":
      return content.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE);
    case "image/webp":
      return content.byteLength >= 12 && content.subarray(0, 4).toString("ascii") === "RIFF" &&
        content.subarray(8, 12).toString("ascii") === "WEBP";
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
    case "application/vnd.ms-word":
      return content.subarray(0, LEGACY_OFFICE_SIGNATURE.byteLength).equals(LEGACY_OFFICE_SIGNATURE);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return isOpenXmlPackage(content, "ppt/");
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return isOpenXmlPackage(content, "xl/");
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return isOpenXmlPackage(content, "word/");
    case "application/json":
    case "text/csv":
    case "text/markdown":
    case "text/plain":
      try {
        decodeText(content);
        return true;
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function decodeText(content: Buffer): string {
  if (content.includes(0)) throw new Error("Text attachment contains NUL bytes.");
  return UTF8_DECODER.decode(content);
}

function isOpenXmlPackage(content: Buffer, expectedRoot: string): boolean {
  if (content.byteLength < 4 || content[0] !== 0x50 || content[1] !== 0x4b ||
    !((content[2] === 0x03 && content[3] === 0x04) || (content[2] === 0x05 && content[3] === 0x06))) {
    return false;
  }

  const names = content.toString("latin1");
  return names.includes("[Content_Types].xml") && names.includes(expectedRoot) && !names.includes("vbaProject.bin");
}
