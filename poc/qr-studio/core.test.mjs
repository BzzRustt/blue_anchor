import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatrix, renderQr, renderSub, fitImage, adjust, validate, statusText } from './core.mjs';
import { QRCode, decoders, jpeg, syntheticImages } from './node-env.mjs';

const URL1 = 'https://scanme.example/t/abc12345';

test('QRCode.create honours forced version, mask, ecc and exposes function modules', () => {
  const m = makeMatrix(QRCode, URL1, { ecc: 'M', version: 7, mask: 3 });
  assert.equal(m.version, 7); assert.equal(m.mask, 3); assert.equal(m.size, 45);
  assert.equal(m.reserved[0], 1); // finder corner
  assert.equal(m.reserved[15 * 45 + 15], 0); // a data module
  assert.ok(m.reserved.reduce((a, b) => a + b, 0) > 150);
});

test('3x3 render: centre = module value, function patterns untouched, quiet zone white', () => {
  const m = makeMatrix(QRCode, URL1, { version: 5 });
  const img = new Float32Array((m.size * 3) ** 2).fill(0.2);
  for (const renderer of ['fs', 'bayer']) for (const cross of [false, true]) {
    const { sub, n } = renderSub(m, img, { renderer, cross });
    for (let my = 0; my < m.size; my++) for (let mx = 0; mx < m.size; mx++) {
      const i = my * m.size + mx;
      assert.equal(sub[(my * 3 + 1) * n + mx * 3 + 1], m.data[i], `centre ${renderer}`);
      if (m.reserved[i]) for (let k = 0; k < 9; k++) assert.equal(sub[(my * 3 + ((k / 3) | 0)) * n + mx * 3 + (k % 3)], m.data[i]);
    }
  }
  const r = renderQr(QRCode, URL1, { renderer: 'classic', version: 5, scale: 2 });
  assert.equal(r.rgba[0], 255); // corner of quiet zone is white
});

test('classic and photo renders decode to the exact URL with both decoders', async () => {
  const im = syntheticImages()['face-blobs (high contrast)'];
  for (const renderer of ['classic', 'fs', 'bayer']) {
    const r = renderQr(QRCode, URL1, { ...im, lw: im.w, lh: im.h, renderer, version: 7 });
    for (const [name, dec] of Object.entries(decoders)) assert.equal(await dec(r), URL1, `${renderer}/${name}`);
  }
});

test('validate() reports per-condition results and detects a wrong URL', async () => {
  const r = renderQr(QRCode, URL1, { renderer: 'classic', scale: 4 });
  const ok = await validate(r, URL1, decoders, jpeg);
  assert.equal(ok.total, 8);
  assert.ok(ok.results[0].pass, 'native classic must pass');
  const bad = await validate(r, URL1 + 'x', decoders, jpeg);
  assert.equal(bad.passed, 0);
});

test('status wording and image helpers', () => {
  assert.equal(statusText(null), 'not checked');
  assert.equal(statusText({ state: 'checking' }), 'checking');
  assert.equal(statusText({ state: 'done', passed: 8, total: 8 }), 'passed 8 of 8 tested conditions');
  assert.equal(statusText({ state: 'done', passed: 5, total: 8 }), 'needs improvement');
  const f = fitImage(new Float32Array(16).fill(0.5), 4, 4, 2); assert.equal(f.length, 4);
  assert.equal(adjust(new Float32Array([0.5]), { brightness: 2 })[0], 1);
});
