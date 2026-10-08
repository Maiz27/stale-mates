# Vendored Stockfish build

`stockfish-18-lite-single.{js,wasm}` — Stockfish 18 ("lite" NNUE net, single-threaded)
compiled to WebAssembly by [stockfish.js](https://github.com/nmrugg/stockfish.js),
taken unmodified from the npm package `stockfish@18.0.8` (`bin/`).

- License: GPL-3.0 (see `COPYING.txt`); source: https://github.com/nmrugg/stockfish.js
  and https://github.com/official-stockfish/Stockfish.
- Single-threaded, so it needs no `SharedArrayBuffer` / cross-origin isolation headers.
- Both files are imported with Vite's `?url` (see `src/lib/engine/engineUrl.ts`), so they ship with
  content-hashed, immutable-cacheable names and are only downloaded when the AI page
  starts the engine. The worker is told where the `.wasm` lives via its URL fragment.

To upgrade: copy the matching `.js` + `.wasm` pair from a newer `stockfish` npm release
and update the import paths in `src/lib/engine/engineUrl.ts`.
