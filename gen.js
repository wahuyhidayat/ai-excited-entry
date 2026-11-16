// Generative abstract artwork: "Excited" — an energy vortex.
// Pure Node: builds a raw RGB raster, encodes a PNG (zlib + hand-rolled chunks).
const zlib = require('zlib');
const fs = require('fs');

const W = 1024, H = 1024;
const px = new Uint8Array(W * H * 3);

// --- helpers -------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = t => t * t * (3 - 2 * t);
// cheap value noise
const seedHash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 10000) / 10000;
};
const noise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = seedHash(xi, yi), b = seedHash(xi + 1, yi);
  const c = seedHash(xi, yi + 1), d = seedHash(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};

// --- compose -------------------------------------------------------------
const CX = W / 2, CY = H / 2;
const MAXR = Math.hypot(CX, CY);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - CX, dy = y - CY;
    const r = Math.hypot(dx, dy) / MAXR;          // 0..1
    const th = Math.atan2(dy, dx);                // -pi..pi

    // spiral phase: three counter-wound arms, tighter twist for more motion
    const twist = 13.0 * (1.0 - r * 0.5);
    const arm = Math.sin(th * 2 + r * twist * Math.PI);
    const arm2 = Math.sin(th * 3 - r * twist * Math.PI * 0.8 + 1.3);
    const arm3 = Math.sin(th * 5 + r * twist * Math.PI * 1.4 + 4.1);

    // flowing turbulence, stronger shear for a sense of rotation
    const n = noise(x * 0.012 + r * 9, y * 0.012 - th * 1.5);
    const n2 = noise(x * 0.045 - 40, y * 0.045 + 17);

    // energy density: tight white-hot core, sharp decaying arms
    let e = Math.exp(-r * 5.5) * 2.4
          + Math.exp(-r * 1.6) * 0.5
          + Math.pow(Math.max(0, arm), 2.2) * Math.exp(-r * 2.3) * (0.7 + 0.5 * n)
          + Math.pow(Math.max(0, arm2), 2.0) * Math.exp(-r * 2.8) * (0.5 + 0.45 * n2)
          + Math.pow(Math.max(0, arm3), 3.0) * Math.exp(-r * 3.4) * (0.45 + 0.4 * n);
    // S-curve contrast: crush the mids, pop the highlights
    e = clamp(e, 0, 1);
    e = e < 0.5 ? 2 * e * e : 1 - 2 * (1 - e) * (1 - e);
    e += 0.12 * n * (1 - r);

    // hue: electric magenta/violet core slammed into cyan/amber arms
    let hue = 0.83 - th / (2 * Math.PI) * 0.5 + r * 0.62 + 0.25 * n;
    hue = ((hue % 1) + 1) % 1;

    // hsv -> rgb
    const i = Math.floor(hue * 6), f = hue * 6 - i;
    const s = clamp(0.95 + 0.05 * n2, 0, 1), v = clamp(e, 0, 1);
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    let R, G, B;
    switch (i % 6) {
      case 0: R = v; G = t; B = p; break;
      case 1: R = q; G = v; B = p; break;
      case 2: R = p; G = v; B = t; break;
      case 3: R = p; G = q; B = v; break;
      case 4: R = t; G = p; B = v; break;
      default: R = v; G = p; B = q;
    }

    // vignette + faint starfield in the dark corners
    const vig = 1 - 0.35 * r * r;
    let star = 0;
    if (e < 0.28) {
      const st = seedHash(x * 3 + 7, y * 3 - 5);
      if (st > 0.9985) star = (st - 0.9985) * 2000 * (1 - e * 3);
    }

    // 5-bit quantization + 4x4 Bayer ordered dither (keeps gradients smooth, shrinks PNG)
    const bayer = [
      [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
    ][y & 3][(x & 3)] / 16 - 0.5;
    const quant = v => clamp(Math.round(v * 31 + bayer * 0.9) / 31, 0, 1) * 255;

    const o = (y * W + x) * 3;
    px[o]     = quant(R * vig + star);
    px[o + 1] = quant(G * vig + star);
    px[o + 2] = quant(B * vig + star);
  }
}

// --- PNG encode ----------------------------------------------------------
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = buf => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // color type: truecolor RGB

// filter byte 0 per scanline
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync('entry.png', png);
console.log(`entry.png: ${W}x${H}, ${(png.length / 1024).toFixed(1)} KiB`);
