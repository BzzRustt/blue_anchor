// The design parameters (never the photo), their limits, and how they become a raster.
import { adjust, coarsen, fitImage, makeMatrixFitting, PHOTO_DEFAULT_VERSION, rasterise, renderSub, type Matrix, type Raster, type Renderer } from './core.ts'

export type Design = {
  style: 'classic' | 'photo'
  zoom: number
  panX: number
  panY: number
  brightness: number
  contrast: number
  detail: number // 0..100, low = bolder, chunkier shapes
  strength: number // 0..100, from 50 up the whole + of each module stays clean
  version: number // 0 = automatic (7 for Photo QR)
  dither: 'fs' | 'bayer'
}

export const DEFAULT_DESIGN: Design = { style: 'photo', zoom: 1, panX: 0, panY: 0, brightness: 0, contrast: 1.2, detail: 100, strength: 60, version: 0, dither: 'fs' }
export const PIXELS_PER_SUBCELL = 6 // the validated raster and the exported PNG are the same pixels

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
export const LIMITS = { zoom: [1, 4], pan: [-1, 1], brightness: [-0.4, 0.4], contrast: [0.6, 2.2], detail: [0, 100], strength: [0, 100] } as const

/** Total: anything stored or typed comes back as a valid Design (used for the device-local save). */
export function normaliseDesign(raw: unknown): Design {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_DESIGN
  const v = Math.round(clamp(r.version, 0, 40, 0))
  return {
    style: r.style === 'classic' ? 'classic' : 'photo',
    zoom: clamp(r.zoom, ...LIMITS.zoom, d.zoom),
    panX: clamp(r.panX, ...LIMITS.pan, 0),
    panY: clamp(r.panY, ...LIMITS.pan, 0),
    brightness: clamp(r.brightness, ...LIMITS.brightness, d.brightness),
    contrast: clamp(r.contrast, ...LIMITS.contrast, d.contrast),
    detail: clamp(r.detail, ...LIMITS.detail, d.detail),
    strength: clamp(r.strength, ...LIMITS.strength, d.strength),
    version: v >= 1 && v <= 40 ? v : 0,
    dither: r.dither === 'bayer' ? 'bayer' : 'fs',
  }
}

export type Rendered = Raster & { matrix: Matrix; note: string | null }

/** URL + design (+ luminance of the photo) -> pixels. Photo style without a photo renders the standard code. */
export function renderDesign(url: string, design: Design, photo: { lum: Float32Array; w: number; h: number } | null, scale = PIXELS_PER_SUBCELL): Rendered {
  const photoMode = design.style === 'photo' && !!photo
  const { matrix, note } = makeMatrixFitting(url, photoMode ? design.version || PHOTO_DEFAULT_VERSION : undefined)
  let img: Float32Array | null = null
  if (photoMode && photo) {
    const n = matrix.size * 3
    const k = design.detail >= 67 ? 1 : design.detail >= 34 ? 2 : 3
    img = coarsen(adjust(fitImage(photo.lum, photo.w, photo.h, n, design.zoom, design.panX, design.panY), { brightness: design.brightness, contrast: design.contrast }), n, k)
  }
  const renderer: Renderer = photoMode ? design.dither : 'classic'
  return { ...rasterise(renderSub(matrix, img, { renderer, cross: design.strength >= 50 }), scale), matrix, note }
}
