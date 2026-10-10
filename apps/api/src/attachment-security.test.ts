import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  AttachmentConcurrencyGate,
  AttachmentContentRejectedError,
  AttachmentFixedWindowRateLimiter,
  AttachmentScannerUnavailableError,
  ClamDAttachmentMalwareScanner,
  WakeOnDemandAttachmentMalwareScanner,
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

describe("WakeOnDemandAttachmentMalwareScanner", () => {
  const content = new Uint8Array([1, 2, 3]);

  it("rejects budgets above the proxy-safe maximum", () => {
    const inner = new ClamDAttachmentMalwareScanner("127.0.0.1", 3310, 15_000);
    expect(() => new WakeOnDemandAttachmentMalwareScanner(inner, 120_001)).toThrow();
  });

  // Real TCP failures: the initial scan stalls, a PING replies after the
  // budget, or the final scan stalls. No late result may succeed, and timed
  // out requests must release the socket instead of occupying upload slots.
  it.each(["initial scan", "wake probe", "rescan"])("bounds a stalled %s and closes its socket", async (stage) => {
    let connections = 0;
    let active = 0;
    const server = createServer((socket) => {
      connections += 1;
      active += 1;
      socket.once("close", () => { active -= 1; });
      socket.once("data", (chunk) => {
        if (stage !== "initial scan" && connections === 1) return socket.destroy();
        if (stage === "rescan" && chunk.includes("zPING\0")) return socket.end("PONG\0");
        const timer = setTimeout(() => socket.end(chunk.includes("zPING\0") ? "PONG\0" : "stream: OK\0"), 700);
        socket.once("close", () => clearTimeout(timer));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const scanner = new WakeOnDemandAttachmentMalwareScanner(
      new ClamDAttachmentMalwareScanner("127.0.0.1", address.port, 2_000), 100, 5
    );
    const started = performance.now();
    await expect(scanner.scan(content)).rejects.toBeInstanceOf(AttachmentScannerUnavailableError);
    expect(performance.now() - started).toBeLessThan(500);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(active).toBe(0);
  });

  it("includes retry sleep in the same deadline", async () => {
    const inner = {
      async scan(): Promise<never> { throw new AttachmentScannerUnavailableError(); },
      async checkReady(): Promise<never> { throw new AttachmentScannerUnavailableError(); }
    };
    const scanner = new WakeOnDemandAttachmentMalwareScanner(inner, 50, 1_000);
    const started = performance.now();
    await expect(scanner.scan(content)).rejects.toBeInstanceOf(AttachmentScannerUnavailableError);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("waits for a sleeping scanner to wake, then scans", async () => {
    let awake = false;
    let pings = 0;
    const inner = {
      async scan() {
        if (!awake) throw new AttachmentScannerUnavailableError();
        return { status: "clean" as const, scanner: "clamd" };
      },
      async checkReady() {
        pings += 1;
        if (pings >= 3) awake = true;
        if (!awake) throw new AttachmentScannerUnavailableError();
      }
    };
    const scanner = new WakeOnDemandAttachmentMalwareScanner(inner, 10_000, 1);

    await expect(scanner.scan(content)).resolves.toEqual({ status: "clean", scanner: "clamd" });
    expect(pings).toBe(3);
    expect("checkReady" in scanner).toBe(false);
  });

  it("still fails closed when the scanner never wakes", async () => {
    const inner = {
      async scan(): Promise<never> { throw new AttachmentScannerUnavailableError(); },
      async checkReady(): Promise<never> { throw new AttachmentScannerUnavailableError(); }
    };
    const scanner = new WakeOnDemandAttachmentMalwareScanner(inner, 20, 5);

    await expect(scanner.scan(content)).rejects.toBeInstanceOf(AttachmentScannerUnavailableError);
  });

  it("reports infected content without retrying", async () => {
    const inner = {
      async scan() { return { status: "infected" as const, scanner: "clamd" }; },
      async checkReady() { throw new Error("should not be called"); }
    };
    const scanner = new WakeOnDemandAttachmentMalwareScanner(inner, 1_000);

    await expect(scanner.scan(content)).resolves.toEqual({ status: "infected", scanner: "clamd" });
  });
});
