// Validate entry.png, then copy it into the output directory.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// PNG magic bytes plus the fixed IHDR layout: 4-byte length, 4-byte type,
// then width/height as big-endian uint32.
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71]);
const MAX_DIM = 1024;

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
  return { width, height };
}

const { width, height } = validate('entry.png');
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
copyFileSync('entry.png', join(outDir, 'entry.png'));
console.log(`entry.png (${width}x${height}) copied -> ${join(outDir, 'entry.png')}`);
