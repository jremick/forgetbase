import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  AttachmentConcurrencyGate,
  AttachmentContentRejectedError,
  AttachmentFixedWindowRateLimiter,
  AttachmentScannerUnavailableError,
  ClamDAttachmentMalwareScanner,
  inspectAttachmentContent
} from "./attachment-security.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("attachment content inspection", () => {
  it("requires the filename extension and file signature to match the declared media type", () => {
    expect(inspectAttachmentContent({
      filename: "guide.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.7\nsynthetic")
    })).toEqual({ detectedMediaType: "application/pdf", extension: "pdf" });

    expect(() => inspectAttachmentContent({
      filename: "guide.txt",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.7\nsynthetic")
    })).toThrow(AttachmentContentRejectedError);
    expect(() => inspectAttachmentContent({
      filename: "guide.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("not a pdf")
    })).toThrow(AttachmentContentRejectedError);
  });

  it("rejects invalid UTF-8, NUL text, invalid JSON, and macro-enabled OpenXML payloads", () => {
    for (const content of [Buffer.from([0xff]), Buffer.from("safe\0unsafe")]) {
      expect(() => inspectAttachmentContent({ filename: "note.txt", mediaType: "text/plain", content }))
        .toThrow(AttachmentContentRejectedError);
    }
    expect(() => inspectAttachmentContent({
      filename: "data.json",
      mediaType: "application/json",
      content: Buffer.from("{not-json}")
    })).toThrow(AttachmentContentRejectedError);
    expect(() => inspectAttachmentContent({
      filename: "document.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml word/ vbaProject.bin")])
    })).toThrow(AttachmentContentRejectedError);
  });
});

describe("attachment request limits", () => {
  it("bounds fixed-window request rates and concurrent transfers", () => {
    const limiter = new AttachmentFixedWindowRateLimiter(2, 1_000);
    expect(limiter.consume("principal", 1_000).allowed).toBe(true);
    expect(limiter.consume("principal", 1_100).allowed).toBe(true);
    expect(limiter.consume("principal", 1_200)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.consume("principal", 2_001).allowed).toBe(true);

    const gate = new AttachmentConcurrencyGate(1);
    const release = gate.tryAcquire();
    expect(release).not.toBeNull();
    expect(gate.tryAcquire()).toBeNull();
    release!();
    release!();
    expect(gate.tryAcquire()).not.toBeNull();
  });
});

describe("ClamDAttachmentMalwareScanner", () => {
  it("implements PING and INSTREAM clean/infected responses", async () => {
    let scanCount = 0;
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        if (chunk.indexOf("zPING\0") >= 0) {
          socket.end(Buffer.from("PONG\0"));
          return;
        }
        scanCount += 1;
        socket.end(Buffer.from(scanCount === 1 ? "stream: OK\0" : "stream: Eicar-Test-Signature FOUND\0"));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const scanner = new ClamDAttachmentMalwareScanner("127.0.0.1", address.port, 1_000);

    await expect(scanner.checkReady()).resolves.toBeUndefined();
    await expect(scanner.scan(Buffer.from("clean"))).resolves.toEqual({ status: "clean", scanner: "clamd" });
    await expect(scanner.scan(Buffer.from("infected"))).resolves.toEqual({ status: "infected", scanner: "clamd" });
  });

  it("fails closed on connection and protocol failures", async () => {
    const scanner = new ClamDAttachmentMalwareScanner("127.0.0.1", 1, 50);
    await expect(scanner.scan(Buffer.from("content"))).rejects.toBeInstanceOf(AttachmentScannerUnavailableError);
  });
});
