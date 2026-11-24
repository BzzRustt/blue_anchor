// QR Studio pure core: matrix, 3x3 sub-module renderer, rasteriser. No `@/` imports and no DOM, so
// `node --test` runs it and the browser uses it unchanged.
import QRCode, { type QRCodeMaskPattern } from 'qrcode'

export type Ecc = 'L' | 'M' | 'Q' | 'H'
export type Renderer = 'classic' | 'fs' | 'bayer'
export type Matrix = { size: number; data: Uint8Array; reserved: Uint8Array; version: number; mask: number }
export type Sub = { sub: Uint8Array; n: number }
export type Raster = { rgba: Uint8ClampedArray; w: number; h: number }

/** Forced version/mask/ECC via the already-installed `qrcode`. Throws if the text does not fit `version`. */
export function makeMatrix(text: string, { ecc = 'M', version, mask }: { ecc?: Ecc; version?: number; mask?: number } = {}): Matrix {
  const q = QRCode.create(text, { errorCorrectionLevel: ecc, ...(version ? { version } : {}), ...(mask !== undefined ? { maskPattern: mask as QRCodeMaskPattern } : {}) })
  return { size: q.modules.size, data: Uint8Array.from(q.modules.data), reserved: Uint8Array.from(q.modules.reservedBit), version: q.version ?? version ?? 0, mask: q.maskPattern ?? mask ?? 0 }
}

/** Photo QR uses a bigger code than the URL needs (v3 failed rotation in the PoC, v7+ passed). */
export const PHOTO_DEFAULT_VERSION = 7

/** The wanted version, or the smallest that fits (with a plain-English note) when the URL is too long for it. */
export function makeMatrixFitting(text: string, wanted: number | undefined, opts: { ecc?: Ecc; mask?: number } = {}): { matrix: Matrix; note: string | null } {
  if (!wanted) return { matrix: makeMatrix(text, opts), note: null }
  try {
    return { matrix: makeMatrix(text, { ...opts, version: wanted }), note: null }
  } catch {
    const matrix = makeMatrix(text, opts)
    return { matrix, note: `Your link is too long for version ${wanted}, so the smallest code that fits (version ${matrix.version}) was used. Photo detail will be lower.` }
  }
}

// ---------- image prep (luminance 0..1, 1 = light) ----------
/** The square crop of the source for a zoom (>=1) and pan (-1..1). Shared with the on-screen "Original" view. */
export function cropRect(w: number, h: number, zoom = 1, panX = 0, panY = 0) {
  const side = Math.min(w, h) / zoom
  return { side, x0: (w - side) / 2 + (panX * (w - side)) / 2, y0: (h - side) / 2 + (panY * (h - side)) / 2 }
}

/** Box-average the crop down to an n x n luminance grid. */
export function fitImage(lum: Float32Array, w: number, h: number, n: number, zoom = 1, panX = 0, panY = 0): Float32Array {
  const { side, x0, y0 } = cropRect(w, h, zoom, panX, panY)
  const out = new Float32Array(n * n)
  const step = side / n
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const xa = Math.max(0, Math.floor(x0 + x * step)), xb = Math.min(w, Math.max(xa + 1, Math.ceil(x0 + (x + 1) * step)))
    const ya = Math.max(0, Math.floor(y0 + y * step)), yb = Math.min(h, Math.max(ya + 1, Math.ceil(y0 + (y + 1) * step)))
    let s = 0, c = 0
    for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { s += lum[yy * w + xx]; c++ }
    out[y * n + x] = c ? s / c : 1
  }
  return out
}

export function adjust(img: Float32Array, { brightness = 0, contrast = 1, gamma = 1 } = {}): Float32Array {
  const out = new Float32Array(img.length)
  for (let i = 0; i < img.length; i++) {
    const v = Math.min(1, Math.max(0, (img[i] - 0.5) * contrast + 0.5 + brightness))
    out[i] = gamma === 1 ? v : Math.pow(v, gamma)
  }
  return out
}

/** "Image detail": average k x k blocks so a low setting gives bolder, chunkier shapes. k = 1 keeps full detail. */
export function coarsen(img: Float32Array, n: number, k: number): Float32Array {
  if (k <= 1) return img
  const out = new Float32Array(img.length)
  for (let by = 0; by < n; by += k) for (let bx = 0; bx < n; bx += k) {
    let s = 0, c = 0
    for (let y = by; y < Math.min(n, by + k); y++) for (let x = bx; x < Math.min(n, bx + k); x++) { s += img[y * n + x]; c++ }
    for (let y = by; y < Math.min(n, by + k); y++) for (let x = bx; x < Math.min(n, bx + k); x++) out[y * n + x] = s / c
  }
  return out
}

// ---------- 3x3 sub-module renderer ----------
const BAYER8 = (() => {
  let m = [[0]]
  while (m.length < 8) {
    const n = m.length, r = Array.from({ length: n * 2 }, () => new Array<number>(n * 2))
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 4 * m[y][x]
      r[y][x] = v; r[y][x + n] = v + 2; r[y + n][x] = v + 3; r[y + n][x + n] = v + 1
    }
    m = r
  }
  return m
})()

/**
 * Each QR module becomes 3x3 sub-cells. The centre (or the + shape when `cross`) always keeps the real
 * module value, so a scanner that samples module centres still reads the exact URL; the other sub-cells
 * carry the dithered picture. Finder/timing/alignment/format/version modules are never touched.
 * `img` is a luminance grid already sized (size*3)^2 (ignored for 'classic').
 */
export function renderSub(matrix: Matrix, img: Float32Array | null, { renderer = 'fs', cross = false }: { renderer?: Renderer; cross?: boolean } = {}): Sub {
  const { size, data, reserved } = matrix, n = size * 3
  const sub = new Uint8Array(n * n)
  const forced = (x: number, y: number) => {
    const i = ((y / 3) | 0) * size + ((x / 3) | 0)
    if (renderer === 'classic' || reserved[i]) return data[i]
    const cx = x % 3, cy = y % 3
    return (cx === 1 && cy === 1) || (cross && (cx === 1 || cy === 1)) ? data[i] : -1
  }
  if (renderer === 'classic' || !img) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) sub[y * n + x] = forced(x, y) > 0 ? 1 : 0
  } else if (renderer === 'bayer') {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const f = forced(x, y)
      sub[y * n + x] = f >= 0 ? f : (img[y * n + x] < (BAYER8[y & 7][x & 7] + 0.5) / 64 ? 1 : 0)
    }
  } else {
    const err = new Float32Array(n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const f = forced(x, y)
      const isFn = reserved[((y / 3) | 0) * size + ((x / 3) | 0)]
      const want = img[y * n + x] + err[y * n + x]
      let e: number
      if (f >= 0) { sub[y * n + x] = f; e = isFn ? 0 : want - (f ? 0 : 1) } // data module: push its error to neighbours; function module: none
      else { const dark = want < 0.5; sub[y * n + x] = dark ? 1 : 0; e = want - (dark ? 0 : 1) }
      if (e) {
        if (x + 1 < n) err[y * n + x + 1] += (e * 7) / 16
        if (y + 1 < n) {
          if (x > 0) err[(y + 1) * n + x - 1] += (e * 3) / 16
          err[(y + 1) * n + x] += (e * 5) / 16
          if (x + 1 < n) err[(y + 1) * n + x + 1] += e / 16
        }
      }
    }
  }
  return { sub, n }
}

/** Solid white background, 4-module quiet zone, integer pixels per sub-cell, opaque RGBA (no metadata exists to leak). */
export function rasterise({ sub, n }: Sub, scale = 6, quietModules = 4): Raster {
  const qz = quietModules * 3, W = (n + 2 * qz) * scale
  const rgba = new Uint8ClampedArray(W * W * 4).fill(255)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!sub[y * n + x]) continue
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const p = (((y + qz) * scale + dy) * W + (x + qz) * scale + dx) * 4
      rgba[p] = rgba[p + 1] = rgba[p + 2] = 0
    }
  }
  return { rgba, w: W, h: W }
}
