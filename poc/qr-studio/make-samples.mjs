// Writes sample PNGs (synthetic images) to poc/qr-studio/samples/ so you can look at them / try a phone scan.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderQr } from './core.mjs';
import { QRCode, syntheticImages } from './node-env.mjs';

const url = 'https://scanme.example/t/k7Qp2xZ';
const dir = new URL('./samples/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [idx, [imgName, im]] of Object.entries(syntheticImages()).slice(0, 3).entries()) {
  for (const [rn, o] of [['classic', { renderer: 'classic' }], ['fs', { renderer: 'fs' }], ['bayer', { renderer: 'bayer' }], ['fs-cross', { renderer: 'fs', cross: true }]]) {
    if (rn === 'classic' && idx) continue;
    const r = renderQr(QRCode, url, { ...im, lw: im.w, lh: im.h, version: 10, scale: 4, ...o });
    const f = `${imgName.split(' ')[0]}-${rn}.png`;
    await sharp(Buffer.from(r.rgba.buffer), { raw: { width: r.w, height: r.h, channels: 4 } }).png().toFile(new URL(f, dir).pathname.replace(/^\/(\w:)/, '$1').replaceAll('%20', ' '));

  }
}
console.log('samples written to poc/qr-studio/samples/');
