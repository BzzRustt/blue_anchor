import assert from 'node:assert/strict'
import test from 'node:test'
import { cropRect, makeMatrix, makeMatrixFitting, renderSub, adjust, fitImage, coarsen, PHOTO_DEFAULT_VERSION } from './core.ts'
import { DEFAULT_DESIGN, normaliseDesign, renderDesign } from './design.ts'
import { MAX_PIXELS, sniffImage, toLuminance, withinPixelCap, workingSize } from './image.ts'
import { adviceFor, canExport, currentResult, statusText, validate, type Stamped } from './validate.ts'
import { decoders, jpeg, syntheticFace } from './node-env.ts'

const URL1 = 'https://scanme.example/t/abc12345'

test('matrix honours forced version, mask, ecc and exposes function modules', () => {
  const m = makeMatrix(URL1, { ecc: 'M', version: 7, mask: 3 })
  assert.equal(m.version, 7); assert.equal(m.mask, 3); assert.equal(m.size, 45)
  assert.equal(m.reserved[0], 1)
  assert.equal(m.reserved[15 * 45 + 15], 0)
})

test('too-long URL falls back to the smallest fitting version and says so', () => {
  const long = 'https://scanme.example/t/' + 'a'.repeat(200)
  const { matrix, note } = makeMatrixFitting(long, PHOTO_DEFAULT_VERSION)
  assert.ok(matrix.version > PHOTO_DEFAULT_VERSION)
  assert.match(note ?? '', /too long for version 7/)
  assert.equal(makeMatrixFitting(URL1, 7).note, null)
  assert.equal(makeMatrixFitting(URL1, undefined).matrix.version, 3)
})

test('3x3 render keeps the centre of every module and every function module untouched', () => {
  const m = makeMatrix(URL1, { version: 5 })
  const img = new Float32Array((m.size * 3) ** 2).fill(0.2)
  for (const renderer of ['fs', 'bayer'] as const) for (const cross of [false, true]) {
    const { sub, n } = renderSub(m, img, { renderer, cross })
    for (let my = 0; my < m.size; my++) for (let mx = 0; mx < m.size; mx++) {
      const i = my * m.size + mx
      assert.equal(sub[(my * 3 + 1) * n + mx * 3 + 1], m.data[i])
      if (m.reserved[i]) for (let k = 0; k < 9; k++) assert.equal(sub[(my * 3 + ((k / 3) | 0)) * n + mx * 3 + (k % 3)], m.data[i])
    }
  }
})

test('raster: integer scale, white 4-module quiet zone, opaque', () => {
  const r = renderDesign(URL1, { ...DEFAULT_DESIGN, style: 'classic' }, null)
  assert.equal(r.w, (r.matrix.size + 8) * 3 * 6)
  assert.deepEqual([...r.rgba.slice(0, 4)], [255, 255, 255, 255])
})

test('photo and classic designs decode to the exact URL with both decoders', async () => {
  const face = syntheticFace()
  for (const design of [{ ...DEFAULT_DESIGN, style: 'classic' as const }, DEFAULT_DESIGN, { ...DEFAULT_DESIGN, dither: 'bayer' as const }]) {
    const r = renderDesign(URL1, design, face)
    for (const [name, dec] of Object.entries(decoders)) assert.equal(await dec(r), URL1, `${design.style}/${design.dither}/${name}`)
  }
})

test('validate() passes the right URL and fails (0 passed) when the intended URL differs', async () => {
  const r = renderDesign(URL1, { ...DEFAULT_DESIGN, style: 'classic' }, null)
  const ok = await validate(r, URL1, decoders, jpeg)
  assert.equal(ok?.total, 8)
  assert.ok(ok?.results[0].pass)
  const bad = await validate(r, URL1 + 'x', decoders, jpeg)
  assert.equal(bad?.passed, 0)
  assert.equal(statusText({ designVersion: 1, state: 'done', passed: bad?.passed, total: bad?.total }), 'unable to decode')
})

test('validate() stops when cancelled', async () => {
  const r = renderDesign(URL1, { ...DEFAULT_DESIGN, style: 'classic' }, null)
  assert.equal(await validate(r, URL1, decoders, jpeg, () => true), null)
})

test('stale results are discarded and export needs a full pass of the CURRENT design', () => {
  const pass: Stamped = { designVersion: 3, state: 'done', passed: 8, total: 8 }
  assert.equal(currentResult(3, pass), pass)
  assert.equal(currentResult(4, pass), null)
  assert.equal(currentResult(4, null), null)
  assert.equal(canExport(3, pass), true)
  assert.equal(canExport(4, pass), false) // design was edited after the check
  assert.equal(canExport(3, { ...pass, passed: 7 }), false)
  assert.equal(canExport(3, { designVersion: 3, state: 'checking' }), false)
  assert.equal(canExport(3, { designVersion: 3, state: 'done', passed: 0, total: 0 }), false)
  assert.equal(canExport(3, null), false)
})

test('status wording never says guaranteed', () => {
  assert.equal(statusText(null), 'not checked')
  assert.equal(statusText({ designVersion: 1, state: 'checking' }), 'checking')
  assert.equal(statusText({ designVersion: 1, state: 'done', passed: 8, total: 8 }), 'passed 8 of 8 tested conditions')
  assert.equal(statusText({ designVersion: 1, state: 'done', passed: 5, total: 8 }), 'needs improvement')
  assert.equal(statusText({ designVersion: 1, state: 'done', passed: 0, total: 8 }), 'unable to decode')
  const advice = adviceFor('photo', { designVersion: 1, state: 'done', passed: 5, total: 8, results: [{ name: 'rotate 5 deg', per: {}, pass: false }] })
  assert.ok(advice.some((a) => /Reset to standard QR/.test(a)))
  assert.ok(!advice.join(' ').toLowerCase().includes('guarantee'))
  assert.deepEqual(adviceFor('photo', { designVersion: 1, state: 'done', passed: 8, total: 8 }), [])
})

test('file sniffing trusts bytes, not names: jpeg/png/webp only, never svg', () => {
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpeg')
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png')
  assert.equal(sniffImage(Uint8Array.from([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBPVP8 ')])), 'webp')
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assert.equal(sniffImage(Buffer.from('GIF89a......')), null)
  assert.equal(sniffImage(new Uint8Array(0)), null)
})

test('size caps and working copy', () => {
  assert.equal(withinPixelCap(8000, 5000), true)
  assert.equal(withinPixelCap(8001, 5000), false)
  assert.equal(withinPixelCap(0, 10), false)
  assert.ok(MAX_PIXELS === 40_000_000)
  assert.deepEqual(workingSize(4000, 2000), { w: 1024, h: 512 })
  assert.deepEqual(workingSize(300, 200), { w: 300, h: 200 })
  const lum = toLuminance(Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]), 3, 1)
  assert.deepEqual([...lum], [1, 0, 1])
})

test('design params are total and clamped; image helpers behave', () => {
  assert.deepEqual(normaliseDesign(null), DEFAULT_DESIGN)
  const d = normaliseDesign({ zoom: 99, panX: -5, contrast: 'x', version: 99, style: 'classic', dither: 'bayer', strength: NaN })
  assert.equal(d.zoom, 4); assert.equal(d.panX, -1); assert.equal(d.contrast, DEFAULT_DESIGN.contrast)
  assert.equal(d.version, 40); assert.equal(normaliseDesign({ version: 0.2 }).version, 0); assert.equal(d.style, 'classic'); assert.equal(d.dither, 'bayer'); assert.equal(d.strength, 60)
  assert.equal(adjust(new Float32Array([0.5]), { brightness: 2 })[0], 1)
  assert.equal(fitImage(new Float32Array(16).fill(0.5), 4, 4, 2).length, 4)
  assert.deepEqual(cropRect(200, 100, 1), { side: 100, x0: 50, y0: 0 })
  assert.deepEqual([...coarsen(Float32Array.from([0, 1, 0, 1]), 2, 2)], [0.5, 0.5, 0.5, 0.5])
})
