// Input checks for the photo picked in the browser. Nothing here uploads anything.
export type ImageKind = 'jpeg' | 'png' | 'webp'
export const MAX_PIXELS = 40_000_000 // same cap as the server's profile photo rule
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const WORKING_SIDE = 1024

/** The real type from the first bytes. The file name and declared type are never trusted; SVG and everything else return null. */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP') return 'webp'
  return null
}

export const withinPixelCap = (w: number, h: number) => w > 0 && h > 0 && w * h <= MAX_PIXELS

/** Size of the working copy: longest side at most WORKING_SIDE, never enlarged. */
export function workingSize(w: number, h: number, max = WORKING_SIDE) {
  const f = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) }
}

/** RGBA -> luminance 0..1 (1 = light). Transparent pixels count as white (the code is printed on white). */
export function toLuminance(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) {
    const a = rgba[i * 4 + 3] / 255
    const l = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255
    out[i] = l * a + (1 - a)
  }
  return out
}
