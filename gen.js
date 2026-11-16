// gen.js — "Supernova Bloom"
// Generative artwork in pure Node (no packages): a Float32 HDR accumulation
// buffer, additive light splats, and a hand-rolled PNG encoder (zlib + chunks).
//
// A stellar detonation frozen mid-bloom: a molten core flashes white at the
// heart of a deep-indigo void, rippled shockwave shells push outward, and
// hundreds of polar filaments streak away with noise-warped trajectories.

const zlib = require('zlib');
const fs = require('fs');

const W = 1024;
const H = 1024;
const CX = W * 0.5;
const CY = H * 0.48; // slightly high — the bloom breathes below the middle

// ------------------------------------------------------------- utilities
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

// deterministic PRNG (mulberry32)
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// integer-lattice value noise + fBm
function latticeHash(ix, iy, salt) {
  let h = (ix * 374761393 + iy * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, salt = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smoothstep(x - xi), fy = smoothstep(y - yi);
  const a = latticeHash(xi, yi, salt);
  const b = latticeHash(xi + 1, yi, salt);
  const c = latticeHash(xi, yi + 1, salt);
  const d = latticeHash(xi + 1, yi + 1, salt);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}
function fbm(x, y, octaves, salt) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    v += amp * vnoise(x * f, y * f, salt + o * 31);
    norm += amp;
    amp *= 0.55;
    f *= 2.13;
  }
  return v / norm;
}

// ------------------------------------------------------------- palette
// deep-space indigo → electric violet → hot magenta → molten amber → white
const STOPS = [
  [0.00,  10,  12,  34],
  [0.22,  38,  22,  92],
  [0.45, 126,  38, 168],
  [0.66, 224,  60, 122],
  [0.83, 255, 140,  44],
  [0.94, 255, 214, 120],
  [1.00, 255, 252, 240],
];
function palette(t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, r0, g0, b0] = STOPS[i - 1];
      const [t1, r1, g1, b1] = STOPS[i];
      const k = (t - t0) / (t1 - t0);
      return [lerp(r0, r1, k), lerp(g0, g1, k), lerp(b0, b1, k)];
    }
  }
  return STOPS[STOPS.length - 1].slice(1);
}

// ------------------------------------------------------------- scene
const MAXR = Math.hypot(W * 0.55, H * 0.62); // full bloom radius in px

// angular ripple harmonics that warp the shockwave shells
const LOBES = [
  { k: 2, phase: 0.7, weight: 1.0 },
  { k: 3, phase: 2.9, weight: 0.6 },
  { k: 5, phase: 5.1, weight: 0.35 },
];
const LOBE_NORM = LOBES.reduce((s, L) => s + L.weight, 0);

// filaments: polar streaks with individual reach, curl, width and hue
const rng = mulberry32(0x5eedb00);
const FILAMENTS = [];
for (let i = 0; i < 220; i++) {
  FILAMENTS.push({
    th: rng() * Math.PI * 2,
    reach: 0.55 + rng() * 0.85,        // radial extent, fraction of MAXR
    wobble: 0.03 + rng() * 0.10,       // angular curvature per unit step
    width: 0.4 + rng() * 2.4,          // splat radius in px
    bright: 0.25 + Math.pow(rng(), 2) * 0.75,
    inner: 0.04 + rng() * 0.16,        // start radius, fraction of MAXR
    hue: rng(),                        // bias along the palette
    spin: (rng() - 0.5) * 0.6,         // curl direction
  });
}

// ------------------------------------------------------------- render
const acc = new Float32Array(W * H * 3); // additive HDR light, tone-mapped later

function addGlow(x, y, radius, r, g, b, intensity) {
  const x0 = Math.max(0, Math.floor(x - radius));
  const x1 = Math.min(W - 1, Math.ceil(x + radius));
  const y0 = Math.max(0, Math.floor(y - radius));
  const y1 = Math.min(H - 1, Math.ceil(y + radius));
  const inv = 1 / (radius * radius);
  for (let py = y0; py <= y1; py++) {
    for (let pxx = x0; pxx <= x1; pxx++) {
      const dx = pxx - x, dy = py - y;
      const fall = Math.exp(-(dx * dx + dy * dy) * inv * 3.5);
      const i = (py * W + pxx) * 3;
      acc[i] += r * intensity * fall;
      acc[i + 1] += g * intensity * fall;
      acc[i + 2] += b * intensity * fall;
    }
  }
}

// 1) background void: indigo nebula wisps + two rippled shockwave shells
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - CX, dy = y - CY;
    const r = Math.hypot(dx, dy) / MAXR;
    const th = Math.atan2(dy, dx);

    const neb = fbm(x * 0.006 + Math.cos(th) * 2.2, y * 0.006 + Math.sin(th) * 2.2, 4, 7);
    let e = 0.05 + neb * 0.10;

    let lobe = 0;
    for (const L of LOBES) lobe += L.weight * Math.sin(th * L.k + r * 9 - L.phase);
    lobe /= LOBE_NORM;

    const shell1 = Math.exp(-Math.pow((r - 0.34 - lobe * 0.05 - fbm(x * 0.01, y * 0.01, 3, 11) * 0.08) * 14, 2));
    const shell2 = Math.exp(-Math.pow((r - 0.62 + lobe * 0.06) * 10, 2));
    e += shell1 * 0.22 + shell2 * 0.10;

    e *= 1 - 0.35 * Math.min(1, Math.hypot(x - W / 2, y - H / 2) / MAXR);

    const [er, eg, eb] = palette(0.08 + e * 0.35);
    const i = (y * W + x) * 3;
    acc[i] = er * e * 0.9;
    acc[i + 1] = eg * e * 0.9;
    acc[i + 2] = eb * e * 1.1; // cool blue cast in the void
  }
}

// 2) filaments: walk each streak outward from the core, splatting light
for (const F of FILAMENTS) {
  const steps = 90;
  const dt = (F.reach - F.inner) / steps;
  let th = F.th;
  for (let s = 0; s <= steps; s++) {
    const rf = F.inner + s * dt;
    const rr = rf * MAXR;
    th += F.wobble * dt * 3 + F.spin * dt * Math.sin(s * 0.12 + F.th * 4) * 2;
    const turb = (fbm(Math.cos(th) * rr * 0.008 + 50, Math.sin(th) * rr * 0.008 + 50, 3, 23) - 0.5) * 0.35;
    const a = th + turb;
    const x = CX + Math.cos(a) * rr;
    const y = CY + Math.sin(a) * rr * 0.96;

    const fade = Math.pow(Math.sin((s / steps) * Math.PI), 0.7);
    const flick = 0.55 + 0.45 * vnoise(s * 0.35, F.th * 10, 41);
    const intensity = F.bright * fade * flick * (s < 4 ? s / 4 : 1);
    const [fr, fg, fbl] = palette(clamp(0.5 + rf * 0.7 + (F.hue - 0.5) * 0.25, 0, 1));
    addGlow(x, y, F.width + 1.6, fr, fg, fbl, intensity * 0.55);
    if (rf < 0.5) addGlow(x, y, 0.9, 255, 240, 210, intensity * 0.5); // hot spine
  }
}

// 3) core flash: layered molten glow, gently asymmetric
{
  const coreN = fbm(CX * 0.02, CY * 0.02, 3, 61);
  const asym = 1.1 + 0.25 * Math.sin(1.1);
  addGlow(CX + 6 * asym, CY - 4, 130, 255, 120, 60, 0.55 * asym);
  addGlow(CX, CY, 62, 255, 200, 120, 0.9);
  addGlow(CX + 3 * coreN, CY - 2 * coreN, 24, 255, 250, 235, 1.4);
}

// 4) tone-map (soft shoulder + gamma), then quantize to 5 bits/channel with
//    4x4 ordered Bayer dither — keeps gradients smooth while letting deflate
//    actually compress the flat regions
const px = new Uint8Array(W * H * 3);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) {
      const v = acc[p + c];
      const tm = v / (1 + v * 0.003); // soft shoulder — keeps the core white-hot
      const g = Math.pow(clamp(tm / 255, 0, 1), 1 / 2.0); // gamma lift
      const dith = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * (1.6 / 31);
      px[p + c] = Math.round(clamp(g + dith, 0, 1) * 31) / 31 * 255;
    }
  }
}

// ------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // truecolor RGB

// Paeth-filtered scanlines (filter type 4) — strongly correlated rows mean
// the filtered residual compresses far better than raw bytes
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
const stride = 1 + W * 3;
const raw = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  const out = y * stride + 1;
  raw[y * stride] = 4;
  for (let x = 0; x < W * 3; x++) {
    const i = y * W * 3 + x;
    const left = x >= 3 ? px[i - 3] : 0;
    const up = y > 0 ? px[i - W * 3] : 0;
    const upLeft = y > 0 && x >= 3 ? px[i - W * 3 - 3] : 0;
    raw[out + x] = (px[i] - paeth(left, up, upLeft)) & 0xff;
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync('entry.png', png);
console.log(`entry.png: ${W}x${H}, ${(png.length / 1024).toFixed(1)} KiB`);
