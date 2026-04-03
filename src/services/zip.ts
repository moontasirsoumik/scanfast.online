/** @module Minimal ZIP file creator — store-only (no compression), pure JavaScript. */

/** CRC-32 lookup table */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

/** Compute CRC-32 over a Uint8Array */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Encode a string as UTF-8 bytes */
function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Create a ZIP file from named blobs.
 * Uses Store method (no compression) — sufficient for already-compressed PDFs.
 */
export async function createZip(entries: { name: string; blob: Blob }[]): Promise<Blob> {
  const files: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];

  // Build local file entries
  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeUtf8(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);

    files.push({ name: nameBytes, data, crc, offset });

    // Local file header: 30 bytes + filename + file data
    const localHeader = new ArrayBuffer(30);
    const lv = new DataView(localHeader);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // compression: store
    lv.setUint16(10, 0, true);           // mod time
    lv.setUint16(12, 0, true);           // mod date
    lv.setUint32(14, crc, true);         // crc-32
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // filename length
    lv.setUint16(28, 0, true);           // extra field length

    const headerBytes = new Uint8Array(localHeader);
    parts.push(headerBytes, nameBytes, data);
    offset += 30 + nameBytes.length + data.length;
  }

  // Central directory
  const centralStart = offset;
  for (const file of files) {
    const cdEntry = new ArrayBuffer(46);
    const cv = new DataView(cdEntry);
    cv.setUint32(0, 0x02014b50, true);         // signature
    cv.setUint16(4, 20, true);                 // version made by
    cv.setUint16(6, 20, true);                 // version needed
    cv.setUint16(8, 0, true);                  // flags
    cv.setUint16(10, 0, true);                 // compression: store
    cv.setUint16(12, 0, true);                 // mod time
    cv.setUint16(14, 0, true);                 // mod date
    cv.setUint32(16, file.crc, true);          // crc-32
    cv.setUint32(20, file.data.length, true);  // compressed size
    cv.setUint32(24, file.data.length, true);  // uncompressed size
    cv.setUint16(28, file.name.length, true);  // filename length
    cv.setUint16(30, 0, true);                 // extra field length
    cv.setUint16(32, 0, true);                 // file comment length
    cv.setUint16(34, 0, true);                 // disk number start
    cv.setUint16(36, 0, true);                 // internal file attributes
    cv.setUint32(38, 0, true);                 // external file attributes
    cv.setUint32(42, file.offset, true);       // relative offset of local header

    parts.push(new Uint8Array(cdEntry), file.name);
    offset += 46 + file.name.length;
  }

  const centralSize = offset - centralStart;

  // End of central directory record: 22 bytes
  const eocdr = new ArrayBuffer(22);
  const ev = new DataView(eocdr);
  ev.setUint32(0, 0x06054b50, true);            // signature
  ev.setUint16(4, 0, true);                     // disk number
  ev.setUint16(6, 0, true);                     // disk with central dir
  ev.setUint16(8, files.length, true);           // entries on this disk
  ev.setUint16(10, files.length, true);          // total entries
  ev.setUint32(12, centralSize, true);           // central directory size
  ev.setUint32(16, centralStart, true);          // offset of central directory
  ev.setUint16(20, 0, true);                    // comment length

  parts.push(new Uint8Array(eocdr));

  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}
