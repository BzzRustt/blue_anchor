// Browser decoders. Only ever loaded with `await import('./decoders')` from the QR Studio page, so the
// ~1 MB decoder code and wasm are not part of any other page. Nothing here sends data anywhere:
// the wasm file is served from this site (public/qr-studio), not from a CDN.
import jsQR from 'jsqr'
import { readBarcodes, setZXingModuleOverrides } from 'zxing-wasm/reader'
import type { Raster } from '@/lib/qr-studio/core'
import type { Decoder, Jpeg } from '@/lib/qr-studio/validate'

// ponytail: public/qr-studio/zxing_reader.wasm is a copy of node_modules/zxing-wasm/dist/reader/zxing_reader.wasm
// (zxing-wasm 3.1.7). Re-copy it whenever that package is upgraded.
setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? '/qr-studio/zxing_reader.wasm' : prefix + path) })

const imageData = ({ rgba, w, h }: Raster) => new ImageData(new Uint8ClampedArray(rgba), w, h)

export const decoders: Record<string, Decoder> = {
  jsqr: async (img) => jsQR(img.rgba, img.w, img.h, { inversionAttempts: 'dontInvert' })?.data ?? null,
  zxing: async (img) => {
    const r = await readBarcodes(imageData(img), { formats: ['QRCode'], tryHarder: true })
    return r[0]?.isValid ? r[0].text : null
  },
}

/** JPEG round trip through a canvas, to simulate a phone saving or sharing the picture. */
export const jpeg: Jpeg = async (img, quality) => {
  const c = document.createElement('canvas')
  c.width = img.w; c.height = img.h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.putImageData(imageData(img), 0, 0)
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', quality / 100))
  if (!blob) throw new Error('jpeg failed')
  const bmp = await createImageBitmap(blob)
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const d = ctx.getImageData(0, 0, img.w, img.h)
  return { rgba: d.data, w: img.w, h: img.h }
}
