// Simulated scan conditions + exact-URL validation + the wording and stale-result rules the UI relies on.
import type { Raster } from './core.ts'

type Gray = { g: Float32Array; w: number; h: number }
const toGray = ({ rgba, w, h }: Raster): Gray => { const g = new Float32Array(w * h); for (let i = 0; i < g.length; i++) g[i] = rgba[i * 4]; return { g, w, h } }
const fromGray = ({ g, w, h }: Gray): Raster => {
  const o = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < g.length; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g[i]; o[i * 4 + 3] = 255 }
  return { rgba: o, w, h }
}

export function downscale(img: Raster, f: number): Raster { // box filter by 1/f
  const { g, w, h } = toGray(img), nw = Math.max(1, Math.round(w / f)), nh = Math.max(1, Math.round(h / f)), o = new Float32Array(nw * nh)
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const xa = Math.floor((x * w) / nw), xb = Math.max(xa + 1, Math.floor(((x + 1) * w) / nw))
    const ya = Math.floor((y * h) / nh), yb = Math.max(ya + 1, Math.floor(((y + 1) * h) / nh))
    let s = 0, c = 0
    for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) { s += g[yy * w + xx]; c++ }
    o[y * nw + x] = s / c
  }
  return fromGray({ g: o, w: nw, h: nh })
}

export function blur(img: Raster, sigma = 1): Raster {
  const { g, w, h } = toGray(img), r = Math.ceil(sigma * 3), k: number[] = []
  let s = 0
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); s += v }
  const pass = (src: Float32Array, horiz: boolean) => {
    const o = new Float32Array(src.length)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0
      for (let i = -r; i <= r; i++) {
        const xx = horiz ? Math.min(w - 1, Math.max(0, x + i)) : x, yy = horiz ? y : Math.min(h - 1, Math.max(0, y + i))
        a += src[yy * w + xx] * k[i + r]
      }
      o[y * w + x] = a / s
    }
    return o
  }
  return fromGray({ g: pass(pass(g, true), false), w, h })
}

export function lowContrast(img: Raster, f = 0.6): Raster {
  const { g, w, h } = toGray(img)
  return fromGray({ g: g.map((v) => 128 + (v - 128) * f), w, h })
}

export function rotate(img: Raster, deg: number): Raster { // bilinear, white fill, same canvas size
  const { g, w, h } = toGray(img), a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = w / 2, cy = h / 2
  const o = new Float32Array(w * h).fill(255)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = c * (x - cx) + s * (y - cy) + cx, sy = -s * (x - cx) + c * (y - cy) + cy
    if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0
    o[y * w + x] = g[y0 * w + x0] * (1 - fx) * (1 - fy) + g[y0 * w + x0 + 1] * fx * (1 - fy)
      + g[(y0 + 1) * w + x0] * (1 - fx) * fy + g[(y0 + 1) * w + x0 + 1] * fx * fy
  }
  return fromGray({ g: o, w, h })
}

export type Decoder = (img: Raster) => Promise<string | null>
export type Jpeg = (img: Raster, quality: number) => Promise<Raster>

export function conditions(jpeg?: Jpeg): Array<[string, (i: Raster) => Raster | Promise<Raster>]> {
  const list: Array<[string, (i: Raster) => Raster | Promise<Raster>]> = [
    ['native size', (i) => i],
    ['downscale 50%', (i) => downscale(i, 2)],
    ['downscale 25%', (i) => downscale(i, 4)],
    ['blur', (i) => blur(i, 1)],
    ['contrast -40%', (i) => lowContrast(i, 0.6)],
    ['rotate 5 deg', (i) => rotate(i, 5)],
    ['rotate -8 deg', (i) => rotate(i, -8)],
  ]
  if (jpeg) list.push(['JPEG q60', (i) => jpeg(i, 60)])
  return list
}

export type ConditionResult = { name: string; per: Record<string, boolean>; pass: boolean }
export type Validation = { passed: number; total: number; results: ConditionResult[] }

/**
 * A condition passes only if EVERY decoder returns text exactly equal to `url`.
 * `cancelled` is polled between conditions (the work is chunked so the page stays responsive);
 * a cancelled run returns null. ponytail: main thread, not a Worker; move to a Worker if phones stutter.
 */
export async function validate(img: Raster, url: string, decoders: Record<string, Decoder>, jpeg?: Jpeg, cancelled: () => boolean = () => false): Promise<Validation | null> {
  const results: ConditionResult[] = []
  for (const [name, fn] of conditions(jpeg)) {
    await new Promise((r) => setTimeout(r, 0))
    if (cancelled()) return null
    const im = await fn(img), per: Record<string, boolean> = {}
    for (const [dn, dec] of Object.entries(decoders)) {
      let t: string | null = null
      try { t = await dec(im) } catch { t = null }
      per[dn] = t === url
    }
    results.push({ name, per, pass: Object.values(per).every(Boolean) })
  }
  return { passed: results.filter((r) => r.pass).length, total: results.length, results }
}

// ---------- status, stale results, advice ----------
/** A validation outcome tied to the exact design it was run on. */
export type Stamped = { designVersion: number; state: 'checking' | 'done'; passed?: number; total?: number; results?: ConditionResult[] }

/** Only a result stamped with the CURRENT design version counts; anything older is discarded. */
export const currentResult = (designVersion: number, r: Stamped | null | undefined): Stamped | null => (r && r.designVersion === designVersion ? r : null)

/** PNG download is allowed only when the current design passed every tested condition. */
export function canExport(designVersion: number, r: Stamped | null | undefined): boolean {
  const c = currentResult(designVersion, r)
  return !!c && c.state === 'done' && c.total !== undefined && c.total > 0 && c.passed === c.total
}

export function statusText(s: Stamped | null | undefined): string {
  if (!s) return 'not checked'
  if (s.state === 'checking') return 'checking'
  if (!s.total || s.passed === 0) return 'unable to decode'
  return s.passed === s.total ? `passed ${s.passed} of ${s.total} tested conditions` : 'needs improvement'
}

/** Plain-English next steps for a design that did not pass everything. Never promises a scan. */
export function adviceFor(style: 'classic' | 'photo', r: Stamped | null | undefined): string[] {
  if (!r || r.state !== 'done' || (r.total && r.passed === r.total)) return []
  const failed = (r.results ?? []).filter((x) => !x.pass).map((x) => x.name)
  const tips = style === 'photo'
    ? ['Raise QR strength so more of the code is kept clean.', 'Add contrast or lower image detail so the picture is bolder.', 'Try a larger code version under Advanced (it makes smaller squares when printed).']
    : ['Your standard QR did not pass every test. Check the link shown below is correct and try again.']
  if (failed.some((n) => n.startsWith('rotate'))) tips.push('It struggled when slightly tilted, which is common with fine detail.')
  if (failed.some((n) => n.startsWith('downscale') || n === 'blur')) tips.push('It struggled when small or blurry, so use it larger when printed.')
  return [...tips, 'Or choose Reset to standard QR, a plain code that always uses the same link.']
}
