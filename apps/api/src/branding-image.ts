import { brandingLogoMaxBytes, brandingLogoMaxDimension } from "@forgetbase/schema";
import { inspectAttachmentContent } from "./attachment-security.js";

// Logos are raster-only data URLs. No URL fetches, SVG, markup, or filesystem paths.
// Validate the container and dimensions here; the browser also decodes before preview.
export function validateBrandingImage(dataUrl: string): void {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("Unsupported logo format.");
  const [, type, encoded] = match;
  const bytes = Buffer.from(encoded!, "base64");
  if (!bytes.length || bytes.length > brandingLogoMaxBytes || bytes.toString("base64") !== encoded) throw new Error("Invalid logo size or encoding.");
  inspectAttachmentContent({ filename: `logo.${type}`, mediaType: `image/${type}`, content: bytes });
  const dimensions = type === "png" ? pngDimensions(bytes) : type === "jpeg" ? jpegDimensions(bytes) : webpDimensions(bytes);
  if (!dimensions || dimensions.some(value => value < 1 || value > brandingLogoMaxDimension)) throw new Error("Logo dimensions must be between 1 and 2048 pixels.");
}

function pngDimensions(bytes: Buffer): [number, number] | null {
  let dimensions: [number, number] | null = null;
  let hasPixels = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return null;
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) return null;
      dimensions = [bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12)];
      const depth = bytes[offset + 16]!;
      const color = bytes[offset + 17]!;
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20]! > 1) return null;
    } else if (type === "IHDR" || type === "acTL") return null;
    if (type === "IDAT" && length > 0) hasPixels = true;
    if (type === "IEND") return length === 0 && end === bytes.length && hasPixels ? dimensions : null;
    offset = end;
  }
  return null;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function jpegDimensions(bytes: Buffer): [number, number] | null {
  if (bytes.length < 4 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return null;
  let dimensions: [number, number] | null = null;
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++]!;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return null;
      dimensions = [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    }
    if (marker === 0xda) return offset + length < bytes.length - 2 ? dimensions : null;
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Buffer): [number, number] | null {
  if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) return null;
  let dimensions: [number, number] | null = null;
  let hasPixels = false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    offset = start + length + (length % 2);
    if (offset > bytes.length) return null;
    if (type === "ANIM" || type === "ANMF") return null;
    if (type === "VP8X") {
      if (length !== 10 || (bytes[start]! & 2)) return null;
      dimensions = [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    } else if (type === "VP8 ") {
      if (length < 11 || !bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) return null;
      const size: [number, number] = [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
      if (dimensions && (dimensions[0] !== size[0] || dimensions[1] !== size[1])) return null;
      dimensions = size;
      hasPixels = true;
    } else if (type === "VP8L") {
      if (length < 6 || bytes[start] !== 0x2f) return null;
      const bits = bytes.readUInt32LE(start + 1);
      const size: [number, number] = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
      if ((bits >>> 29) !== 0 || (dimensions && (dimensions[0] !== size[0] || dimensions[1] !== size[1]))) return null;
      dimensions = size;
      hasPixels = true;
    }
  }
  return offset === bytes.length && hasPixels ? dimensions : null;
}
