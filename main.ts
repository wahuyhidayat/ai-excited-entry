// Validate entry.png, then copy it into the output directory.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// PNG magic bytes plus the fixed IHDR layout: 4-byte length, 4-byte type,
// then width/height as big-endian uint32.
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71]);
const MAX_DIM = 1024;

// Standard CRC-32 table (same polynomial the PNG spec mandates).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function validate(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || !buf.subarray(0, 4).equals(PNG_SIGNATURE)) {
    console.error(`error: ${path} is not a PNG file (bad signature)`);
    process.exit(1);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > MAX_DIM || height > MAX_DIM) {
    console.error(`error: ${path} is ${width}x${height}, exceeds ${MAX_DIM}x${MAX_DIM}`);
    process.exit(1);
  }
  // IHDR: bytes 8..19 of the file (type + data); CRC is the 4 bytes after it.
  const ihdr = buf.subarray(12, 29);
  let crc = 0xffffffff;
  for (const byte of ihdr) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  if (((crc ^ 0xffffffff) >>> 0) !== buf.readUInt32BE(29)) {
    console.error(`error: ${path} has an invalid IHDR CRC`);
    process.exit(1);
  }
  return { width, height, bytes: buf.length };
}

const { width, height, bytes } = validate('entry.png');
console.log(`entry.png: ${width}x${height}, ${bytes} bytes, valid`);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
copyFileSync('entry.png', join(outDir, 'entry.png'));
console.log(`entry.png (${width}x${height}) copied -> ${join(outDir, 'entry.png')}`);
