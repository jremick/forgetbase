import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectAttachmentContent } from "./attachment-security.js";

const mediaType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const document = ["word/document.xml", "<document><body>Example</body></document>"] as const;
const types = ["[Content_Types].xml", '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'] as const;

// Generate ordinary ZIP files, including real compression and CRCs, so tests
// exercise the same structure as an Office document rather than signature text.
function zip(entries: ReadonlyArray<readonly [string, string | Buffer]>, method = 8): Buffer {
  const locals: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [filename, value] of entries) {
    const name = Buffer.from(filename);
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed); directory.push(central, name); offset += local.length + name.length + compressed.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

function inspect(content: Buffer) {
  return inspectAttachmentContent({ filename: "document.docx", mediaType, content });
}

describe("OpenXML attachment boundary", () => {
  it.each([0, 8])("accepts a non-macro document using ZIP method %s", (method) => {
    expect(inspect(zip([types, document], method))).toMatchObject({ detectedMediaType: mediaType });
  });

  it.each([
    '<Types><Override ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>',
    '<Types><Override ContentType="application/vnd.ms-office.vba&#80;roject"/></Types>',
    '<!DOCTYPE Types [<!ENTITY macro "enabled">]><Types/>',
    Buffer.from('\ufeff<Types><Override ContentType="application/vnd.ms-office.vbaProject"/></Types>', "utf16le")
  ])("rejects macros and entity declarations in compressed package metadata (case %#)", (metadata) => {
    expect(() => inspect(zip([[types[0], metadata], document, ["word/renamed.bin", "synthetic binary"]]))).toThrow();
  });

  it("rejects a renamed VBA project identified only by a compressed relationship", () => {
    expect(() => inspect(zip([types, document, ["word/_rels/document.xml.rels", '<Relationships><Relationship Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="renamed.bin"/></Relationships>'], ["word/renamed.bin", "synthetic binary"]]))).toThrow();
  });

  it("rejects counterfeit signatures, duplicate paths, traversal and missing document parts", () => {
    for (const content of [Buffer.from("PK\u0003\u0004[Content_Types].xml word/"), zip([types]), zip([types, document, types]), zip([types, document, ["../outside", "value"]])]) {
      expect(() => inspect(content)).toThrow();
    }
  });

  it("bounds metadata expansion and rejects local/directory disagreement", () => {
    expect(() => inspect(zip([[types[0], "A".repeat(1024 * 1024 + 1)], document]))).toThrow();
    const inconsistent = zip([types, document]);
    inconsistent.writeUInt32LE(1, 18);
    expect(() => inspect(inconsistent)).toThrow();
    const invalidChecksum = zip([types, document]);
    const directoryStart = invalidChecksum.readUInt32LE(invalidChecksum.length - 6);
    invalidChecksum.writeUInt32LE(0, 14); invalidChecksum.writeUInt32LE(0, directoryStart + 16);
    expect(() => inspect(invalidChecksum)).toThrow();
  });
});
