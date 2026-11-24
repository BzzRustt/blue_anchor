# QR Studio proof of concept (Phase 1, throw-away)

Isolated from the app: nothing here is imported by `app/`, `components/` or `lib/`. Local only, no upload, no server.

## Files
- `core.mjs` - pure JS core: matrix (forced version/mask/ECC via `QRCode.create`), 3x3 sub-module renderer (Floyd-Steinberg, Bayer, optional centre-cross), RGBA rasteriser, simulated conditions, validation, status wording.
- `node-env.mjs` - Node-only: the two decoders (jsQR, zxing-wasm), JPEG via sharp, SYNTHETIC test images.
- `core.test.mjs` - unit tests. `run-matrix.mjs` - headless matrix, writes `RESULTS.md`. `make-samples.mjs` - writes `samples/*.png`.
- `index.html` - browser page (see caveats below).

## Run
```
node --test poc/qr-studio/core.test.mjs     # about 4 s
node poc/qr-studio/run-matrix.mjs           # a few minutes, writes RESULTS.md
node poc/qr-studio/make-samples.mjs         # sample PNGs
```
Browser page: serve the repo root (for example `npx serve .` or `python -m http.server 8765`) and open `/poc/qr-studio/index.html`. It loads `qrcode` from a pinned esm.sh URL (needs internet) and the decoders from `node_modules`. **This page was not run in a browser by the developer agent** (the tool that could do that was refused permission), so treat it as untested.

## What this shows
- `qrcode` can give the module matrix, function-module mask, and forced version/mask/ECC.
- The centre-preserved 3x3 technique produces a recognisable 1-bit picture (for synthetic shapes) that two software decoders read as the exact URL under simulated conditions.

## What this does NOT show
- Test images are synthetic shapes, not photos. Conditions are software simulations. Nothing here proves that a real phone camera scans a printed or on-screen code, or that a real face stays recognisable.
- Render time is Node on a PC, not a phone. The browser validation runs on the main thread (a Worker is a later phase).

## TODO for you (physical test)
Print the 20-code sheet from plan section 7 (paper at 3 sizes, sticker, card, T-shirt transfer), scan on 2 iPhones and 2 Android phones (one older) with native camera, Google Lens and a third-party app, and record failures. Also run a 5-person recognisability check with real photos.
