// Copy entry.png into the output directory.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
copyFileSync('entry.png', join(outDir, 'entry.png'));
console.log(`copied entry.png -> ${join(outDir, 'entry.png')}`);
