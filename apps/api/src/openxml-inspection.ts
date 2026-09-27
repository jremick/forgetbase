import { crc32, inflateRawSync } from "node:zlib";

const MAX_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MACRO_MARKER = /macroenabled|vbaproject|vbadata/i;

// Inspect ZIP directory records and bounded XML metadata without extracting
// attacker-controlled paths or expanding document/media payloads.
export function isOpenXmlPackage(content: Buffer, expectedRoot: "word/" | "xl/" | "ppt/"): boolean {
  try {
    let end = -1;
    for (let offset = content.length - 22; offset >= Math.max(0, content.length - 22 - 65535); offset -= 1) {
      if (content.readUInt32LE(offset) === 0x06054b50 && offset + 22 + content.readUInt16LE(offset + 20) === content.length) {
        end = offset;
        break;
      }
    }
    if (end < 0 || content.readUInt16LE(end + 4) !== 0 || content.readUInt16LE(end + 6) !== 0) return false;
    const count = content.readUInt16LE(end + 10);
    const directorySize = content.readUInt32LE(end + 12);
    const directoryStart = content.readUInt32LE(end + 16);
    if (!count || count > MAX_ENTRIES || count !== content.readUInt16LE(end + 8) || directoryStart + directorySize !== end) return false;

    const names = new Set<string>();
    const ranges: Array<[number, number]> = [];
    let offset = directoryStart;
    let expandedBytes = 0;
    let metadataBytes = 0;
    for (let index = 0; index < count; index += 1) {
      if (offset + 46 > end || content.readUInt32LE(offset) !== 0x02014b50) return false;
      const flags = content.readUInt16LE(offset + 8);
      const method = content.readUInt16LE(offset + 10);
      const checksum = content.readUInt32LE(offset + 16);
      const compressedSize = content.readUInt32LE(offset + 20);
      const originalSize = content.readUInt32LE(offset + 24);
      const nameLength = content.readUInt16LE(offset + 28);
      const extraLength = content.readUInt16LE(offset + 30);
      const commentLength = content.readUInt16LE(offset + 32);
      const localOffset = content.readUInt32LE(offset + 42);
      const next = offset + 46 + nameLength + extraLength + commentLength;
      if (next > end || !nameLength || (flags & 0x2041) || ![0, 8].includes(method) || content.readUInt16LE(offset + 34) !== 0) return false;
      const fileType = (content.readUInt32LE(offset + 38) >>> 16) & 0xf000;
      if (fileType && fileType !== 0x8000 && fileType !== 0x4000) return false;
      expandedBytes += originalSize;
      if (expandedBytes > MAX_EXPANDED_BYTES) return false;
      const nameBytes = content.subarray(offset + 46, offset + 46 + nameLength);
      const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
      const normalizedName = decodeURIComponent(name).toLowerCase();
      if (/^[\\/]|[\\\u0000-\u001f]/.test(normalizedName) || normalizedName.split("/").some((part) => part === ".." || part === ".") || names.has(normalizedName) || MACRO_MARKER.test(normalizedName)) return false;
      names.add(normalizedName);

      if (localOffset + 30 > directoryStart || content.readUInt32LE(localOffset) !== 0x04034b50 || content.readUInt16LE(localOffset + 6) !== flags || content.readUInt16LE(localOffset + 8) !== method) return false;
      const localNameLength = content.readUInt16LE(localOffset + 26);
      const dataStart = localOffset + 30 + localNameLength + content.readUInt16LE(localOffset + 28);
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > directoryStart || !content.subarray(localOffset + 30, localOffset + 30 + localNameLength).equals(nameBytes)) return false;
      if (!(flags & 8) && (content.readUInt32LE(localOffset + 14) !== checksum || content.readUInt32LE(localOffset + 18) !== compressedSize || content.readUInt32LE(localOffset + 22) !== originalSize)) return false;
      ranges.push([localOffset, dataEnd]);

      if (normalizedName === "[content_types].xml" || normalizedName.endsWith(".rels")) {
        if (originalSize > MAX_METADATA_BYTES) return false;
        const compressed = content.subarray(dataStart, dataEnd);
        const data = method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_METADATA_BYTES }) : compressed;
        metadataBytes += data.length;
        if (data.length !== originalSize || metadataBytes > MAX_METADATA_BYTES || crc32(data) !== checksum) return false;
        const xml = decodeXml(data);
        if (/<!\s*(doctype|entity)/i.test(xml) || MACRO_MARKER.test(decodeXmlEntities(xml))) return false;
      }
      offset = next;
    }
    if (offset !== end) return false;
    ranges.sort((a, b) => a[0] - b[0]);
    if (ranges[0]?.[0] !== 0 || ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1]![1])) return false;
    const mainPart = { "word/": "word/document.xml", "xl/": "xl/workbook.xml", "ppt/": "ppt/presentation.xml" }[expectedRoot];
    return Boolean(mainPart && names.has(mainPart) && names.has("[content_types].xml"));
  } catch {
    return false;
  }
}

function decodeXml(data: Buffer): string {
  const encoding = (data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0x3c && data[1] === 0)
    ? "utf-16le" : (data[0] === 0xfe && data[1] === 0xff) || (data[0] === 0 && data[1] === 0x3c) ? "utf-16be" : "utf-8";
  const text = new TextDecoder(encoding, { fatal: true }).decode(data);
  const declaredEncoding = /^\s*<\?xml[^?]*encoding\s*=\s*["']([^"']+)["']/i.exec(text)?.[1]?.toLowerCase();
  if (text.includes("\0") || (declaredEncoding && !["utf-8", "utf-16", "utf-16le", "utf-16be", "us-ascii"].includes(declaredEncoding))) throw new Error("Unsupported XML encoding");
  return text;
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(/^#x/i.test(entity) ? 2 : 1), /^#x/i.test(entity) ? 16 : 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()]!;
  });
}
