// Node-only helpers: QRCode, the two decoders, JPEG via sharp, synthetic test images.
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { readBarcodes } from 'zxing-wasm/reader';

const require = createRequire(import.meta.url);
export const QRCode = require('qrcode');
const jsQR = require('jsqr');

export const decoders = {
  jsqr: async ({ rgba, w, h }) => jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null,
  zxing: async ({ rgba, w, h }) => {
    const r = await readBarcodes({ data: rgba, width: w, height: h, colorSpace: 'srgb' }, { formats: ['QRCode'], tryHarder: true });
    return r[0]?.isValid ? r[0].text : null;
  },
};

export async function jpeg({ rgba, w, h }, quality) {
  const buf = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: w, height: h, channels: 4 } })
    .removeAlpha().jpeg({ quality }).toBuffer();
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8ClampedArray(data), w: info.width, h: info.height };
}

// ---- SYNTHETIC test images (luminance 0..1, 1 = light), 256x256. Not real photos. ----
const N = 256;
const mk = (fn) => { const a = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) a[y * N + x] = Math.min(1, Math.max(0, fn(x / N, y / N))); return { lum: a, w: N, h: N }; };
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

export function syntheticImages() {
  const grid = Array.from({ length: 17 * 17 }, rnd);
  const noise = (x, y) => { // bilinear value noise
    const fx = x * 16, fy = y * 16, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, g = (i, j) => grid[j * 17 + i];
    return g(x0, y0) * (1 - tx) * (1 - ty) + g(x0 + 1, y0) * tx * (1 - ty) + g(x0, y0 + 1) * (1 - tx) * ty + g(x0 + 1, y0 + 1) * tx * ty;
  };
  return {
    'face-blobs (high contrast)': mk((x, y) => {
      if (ell(x, y, 0.36, 0.45, 0.05, 0.035) || ell(x, y, 0.64, 0.45, 0.05, 0.035)) return 0.05; // eyes
      if (ell(x, y, 0.5, 0.72, 0.12, 0.04)) return 0.1; // mouth
      if (ell(x, y, 0.5, 0.57, 0.03, 0.07)) return 0.45; // nose
      if (ell(x, y, 0.5, 0.52, 0.3, 0.38)) return 0.72; // face
      if (ell(x, y, 0.5, 0.45, 0.36, 0.44)) return 0.1; // hair
      return 0.95;
    }),
    'diagonal gradient': mk((x, y) => (x + y) / 2),
    'logo-like (ring + bar)': mk((x, y) => {
      const d = Math.hypot(x - 0.5, y - 0.5);
      if (d > 0.3 && d < 0.42) return 0.05;
      if (Math.abs(x - 0.5) < 0.05 && y > 0.3 && y < 0.7) return 0.05;
      if (Math.abs(y - 0.5) < 0.05 && x > 0.35 && x < 0.65) return 0.05;
      return 0.95;
    }),
    'noisy texture': mk((x, y) => 0.6 * noise(x, y) + 0.4 * rnd()),
  };
}
