// main.ts — validate entry.png against the challenge constraints, then place
// it in the output directory. Node 22, standard library only.
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_DIM = 1024;          // pixels, per axis
const MAX_BYTES = 1024 * 1024; // 1 MiB file-size ceiling

function fail(path: string, reason: string): never {
  console.error(`invalid: ${path} — ${reason}`);
  process.exit(1);
}

function validate(path: string) {
  const stat = statSync(path);
  if (stat.size >= MAX_BYTES) fail(path, `${stat.size} bytes, must stay under 1 MiB`);

  const buf = readFileSync(path);

  // PNG signature: \x89PNG\r\n\x1a\n
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    fail(path, 'bad PNG signature');
  }
  if (buf.length < 33) fail(path, 'file too short to contain a full IHDR chunk');

  // First chunk must be IHDR; its 4-byte length field is always 13.
  if (buf.readUInt32BE(8) !== 13 || buf.toString('ascii', 12, 16) !== 'IHDR') {
    fail(path, 'first chunk is not a 13-byte IHDR');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0) fail(path, 'zero dimension');
  if (width > MAX_DIM || height > MAX_DIM) {
    fail(path, `${width}x${height} exceeds the ${MAX_DIM}x${MAX_DIM} limit`);
  }

  // Verify the IHDR CRC before trusting the header fields.
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  let crc = 0xffffffff;
  for (const byte of buf.subarray(12, 29)) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  if ((crc ^ 0xffffffff) >>> 0 !== buf.readUInt32BE(29)) fail(path, 'IHDR CRC mismatch');

  return { width, height, bytes: buf.length };
}

const src = 'entry.png';
const { width, height, bytes } = validate(src);
console.log(`entry.png OK: ${width}x${height}, ${bytes} bytes (limits 1024x1024, <1 MiB)`);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, 'entry.png');
copyFileSync(src, dest);
console.log(`copied to ${dest}`);
