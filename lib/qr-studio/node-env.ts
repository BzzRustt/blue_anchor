// Node-only test helpers: the two decoders, JPEG via sharp, and a SYNTHETIC face-like image (not a photo).
import sharp from 'sharp'
import jsQR from 'jsqr'
import { readBarcodes } from 'zxing-wasm/reader'
import type { Decoder, Jpeg } from './validate.ts'

export const decoders: Record<string, Decoder> = {
  jsqr: async ({ rgba, w, h }) => jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null,
  zxing: async ({ rgba, w, h }) => {
    const r = await readBarcodes({ data: rgba, width: w, height: h, colorSpace: 'srgb' } as ImageData, { formats: ['QRCode'], tryHarder: true })
    return r[0]?.isValid ? r[0].text : null
  },
}

export const jpeg: Jpeg = async ({ rgba, w, h }, quality) => {
  const buf = await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: w, height: h, channels: 4 } }).removeAlpha().jpeg({ quality }).toBuffer()
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { rgba: new Uint8ClampedArray(data), w: info.width, h: info.height }
}

const N = 256
const ell = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1
/** Luminance 0..1 (1 = light), 256x256. Shapes drawn by code. */
export function syntheticFace() {
  const lum = new Float32Array(N * N)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N
    lum[y * N + x] = ell(u, v, 0.36, 0.45, 0.05, 0.035) || ell(u, v, 0.64, 0.45, 0.05, 0.035) ? 0.05
      : ell(u, v, 0.5, 0.72, 0.12, 0.04) ? 0.1 : ell(u, v, 0.5, 0.57, 0.03, 0.07) ? 0.45
      : ell(u, v, 0.5, 0.52, 0.3, 0.38) ? 0.72 : ell(u, v, 0.5, 0.45, 0.36, 0.44) ? 0.1 : 0.95
  }
  return { lum, w: N, h: N }
}
