// QR Studio PoC core. Pure JS, no Node/DOM/@ imports, so it runs in node and in the browser.
// The `qrcode` library and the decoders are passed in by the caller.

// ---------- matrix ----------
// QRCode = the `qrcode` package. Returns module matrix + function-module mask.
export function makeMatrix(QRCode, text, { ecc = 'M', version, mask } = {}) {
  const o = { errorCorrectionLevel: ecc };
  if (version) o.version = version;
  if (mask !== undefined) o.maskPattern = mask;
  const q = QRCode.create(text, o);
  return {
    size: q.modules.size,
    data: Uint8Array.from(q.modules.data),
    reserved: Uint8Array.from(q.modules.reservedBit),
    version: q.version,
    mask: q.maskPattern,
  };
}

// ---------- image prep (luminance 0..1, 1 = light) ----------
// Square crop with zoom (>=1) and pan (-1..1), box-averaged to n x n.
export function fitImage(lum, w, h, n, zoom = 1, panX = 0, panY = 0) {
  const side = Math.min(w, h) / zoom;
  const x0 = (w - side) / 2 + (panX * (w - side)) / 2;
  const y0 = (h - side) / 2 + (panY * (h - side)) / 2;
  const out = new Float32Array(n * n);
  const step = side / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const xa = Math.max(0, Math.floor(x0 + x * step)), xb = Math.min(w, Math.max(xa + 1, Math.ceil(x0 + (x + 1) * step)));
    const ya = Math.max(0, Math.floor(y0 + y * step)), yb = Math.min(h, Math.max(ya + 1, Math.ceil(y0 + (y + 1) * step)));
    let s = 0, c = 0;
    for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { s += lum[yy * w + xx]; c++; }
    out[y * n + x] = c ? s / c : 1;
  }
  return out;
}

export function adjust(img, { brightness = 0, contrast = 1, gamma = 1 } = {}) {
  const out = new Float32Array(img.length);
  for (let i = 0; i < img.length; i++) {
    let v = (img[i] - 0.5) * contrast + 0.5 + brightness;
    v = Math.min(1, Math.max(0, v));
    out[i] = gamma === 1 ? v : Math.pow(v, gamma);
  }
  return out;
}

// ---------- 3x3 sub-module renderer ----------
const BAYER8 = (() => {
  let m = [[0]];
  while (m.length < 8) {
    const n = m.length, r = Array.from({ length: n * 2 }, () => new Array(n * 2));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 4 * m[y][x];
      r[y][x] = v; r[y][x + n] = v + 2; r[y + n][x] = v + 3; r[y + n][x + n] = v + 1;
    }
    m = r;
  }
  return m;
})();

// renderer: 'classic' | 'fs' (Floyd-Steinberg) | 'bayer'.
// cross: protect the + shape (5 of 9 sub-cells) instead of just the centre.
// img = luminance grid already sized (size*3)^2 (ignored for classic).
// Returns { sub: Uint8Array((size*3)^2, 1 = dark), n: size*3 }
export function renderSub(matrix, img, { renderer = 'fs', cross = false } = {}) {
  const { size, data, reserved } = matrix, n = size * 3;
  const sub = new Uint8Array(n * n);
  // value forced by the QR (0/1), or -1 when the sub-cell is free to carry the image
  const forced = (x, y) => {
    const i = ((y / 3) | 0) * size + ((x / 3) | 0);
    if (renderer === 'classic' || reserved[i]) return data[i];
    const cx = x % 3, cy = y % 3;
    return (cx === 1 && cy === 1) || (cross && (cx === 1 || cy === 1)) ? data[i] : -1;
  };
  if (renderer === 'bayer') {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const f = forced(x, y);
      sub[y * n + x] = f >= 0 ? f : (img[y * n + x] < (BAYER8[y & 7][x & 7] + 0.5) / 64 ? 1 : 0);
    }
  } else if (renderer === 'classic') {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) sub[y * n + x] = forced(x, y);
  } else {
    const err = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const f = forced(x, y);
      const isFn = reserved[((y / 3) | 0) * size + ((x / 3) | 0)];
      const want = img[y * n + x] + err[y * n + x];
      let e;
      if (f >= 0) { sub[y * n + x] = f; e = isFn ? 0 : want - (f ? 0 : 1); } // data module: push its error to neighbours; function module: none
      else { const dark = want < 0.5; sub[y * n + x] = dark ? 1 : 0; e = want - (dark ? 0 : 1); }
      if (e) {
        if (x + 1 < n) err[y * n + x + 1] += (e * 7) / 16;
        if (y + 1 < n) {
          if (x > 0) err[(y + 1) * n + x - 1] += (e * 3) / 16;
          err[(y + 1) * n + x] += (e * 5) / 16;
          if (x + 1 < n) err[(y + 1) * n + x + 1] += e / 16;
        }
      }
    }
  }
  return { sub, n };
}

// Quiet zone (4 modules) + integer scale -> RGBA. scale = pixels per sub-cell.
export function rasterise({ sub, n }, scale = 4, quietModules = 4) {
  const qz = quietModules * 3, W = (n + 2 * qz) * scale;
  const rgba = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!sub[y * n + x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const p = (((y + qz) * scale + dy) * W + (x + qz) * scale + dx) * 4;
      rgba[p] = rgba[p + 1] = rgba[p + 2] = 0;
    }
  }
  return { rgba, w: W, h: W };
}

// One call: text + luminance image + options -> RGBA.
export function renderQr(QRCode, text, o = {}) {
  const { lum, lw, lh, ecc = 'M', version, mask, renderer = 'fs', cross = false,
    zoom = 1, panX = 0, panY = 0, brightness = 0, contrast = 1, gamma = 1, scale = 4 } = o;
  const matrix = makeMatrix(QRCode, text, { ecc, version, mask });
  const img = renderer === 'classic' ? null
    : adjust(fitImage(lum, lw, lh, matrix.size * 3, zoom, panX, panY), { brightness, contrast, gamma });
  return { ...rasterise(renderSub(matrix, img, { renderer, cross }), scale), matrix };
}

// ---------- simulated conditions (RGBA -> RGBA) ----------
const toGray = ({ rgba, w, h }) => { const g = new Float32Array(w * h); for (let i = 0; i < g.length; i++) g[i] = rgba[i * 4]; return { g, w, h }; };
const fromGray = ({ g, w, h }) => {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < g.length; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g[i]; o[i * 4 + 3] = 255; }
  return { rgba: o, w, h };
};

export function downscale(img, f) { // box filter by 1/f
  const { g, w, h } = toGray(img), nw = Math.max(1, Math.round(w / f)), nh = Math.max(1, Math.round(h / f)), o = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const xa = Math.floor((x * w) / nw), xb = Math.max(xa + 1, Math.floor(((x + 1) * w) / nw));
    const ya = Math.floor((y * h) / nh), yb = Math.max(ya + 1, Math.floor(((y + 1) * h) / nh));
    let s = 0, c = 0;
    for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { s += g[yy * w + xx]; c++; }
    o[y * nw + x] = s / c;
  }
  return fromGray({ g: o, w: nw, h: nh });
}

export function blur(img, sigma = 1) {
  const { g, w, h } = toGray(img), r = Math.ceil(sigma * 3), k = [];
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); s += v; }
  const pass = (src, horiz) => {
    const o = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) {
        const xx = horiz ? Math.min(w - 1, Math.max(0, x + i)) : x, yy = horiz ? y : Math.min(h - 1, Math.max(0, y + i));
        a += src[yy * w + xx] * k[i + r];
      }
      o[y * w + x] = a / s;
    }
    return o;
  };
  return fromGray({ g: pass(pass(g, true), false), w, h });
}

export function lowContrast(img, f = 0.6) {
  const { g, w, h } = toGray(img);
  return fromGray({ g: g.map((v) => 128 + (v - 128) * f), w, h });
}

export function rotate(img, deg) { // bilinear, white fill, same canvas size
  const { g, w, h } = toGray(img), a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = w / 2, cy = h / 2;
  const o = new Float32Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = c * (x - cx) + s * (y - cy) + cx, sy = -s * (x - cx) + c * (y - cy) + cy;
    if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
    o[y * w + x] = g[y0 * w + x0] * (1 - fx) * (1 - fy) + g[y0 * w + x0 + 1] * fx * (1 - fy)
      + g[(y0 + 1) * w + x0] * (1 - fx) * fy + g[(y0 + 1) * w + x0 + 1] * fx * fy;
  }
  return fromGray({ g: o, w, h });
}

// jpeg(img, quality) -> Promise<img> is optional (sharp in node, canvas in the browser).
export function conditions(jpeg) {
  const list = [
    ['native', (i) => i],
    ['downscale 50%', (i) => downscale(i, 2)],
    ['downscale 25%', (i) => downscale(i, 4)],
    ['blur sigma 1', (i) => blur(i, 1)],
    ['contrast -40%', (i) => lowContrast(i, 0.6)],
    ['rotate 5 deg', (i) => rotate(i, 5)],
    ['rotate -8 deg', (i) => rotate(i, -8)],
  ];
  if (jpeg) list.push(['JPEG q60', (i) => jpeg(i, 60)]);
  return list;
}

// ---------- validation ----------
// decoders: { name: async ({rgba,w,h}) => string|null }.
// A condition passes only if EVERY decoder returns exactly `url`.
export async function validate(img, url, decoders, jpeg) {
  const results = [];
  for (const [name, fn] of conditions(jpeg)) {
    const im = await fn(img), per = {};
    for (const [dn, dec] of Object.entries(decoders)) {
      let t = null;
      try { t = await dec(im); } catch { t = null; }
      per[dn] = t === url;
    }
    results.push({ name, per, pass: Object.values(per).every(Boolean) });
  }
  return { passed: results.filter((r) => r.pass).length, total: results.length, results };
}

// Exact status wording for the UI.
export function statusText(s) {
  if (!s || s.state === 'unchecked') return 'not checked';
  if (s.state === 'checking') return 'checking';
  return s.passed === s.total ? `passed ${s.passed} of ${s.total} tested conditions` : 'needs improvement';
}
