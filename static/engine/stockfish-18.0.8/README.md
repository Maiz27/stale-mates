# Vendored Stockfish build

`stockfish-18-lite-single.{js,wasm}` — Stockfish 18 ("lite" NNUE net, single-threaded)
compiled to WebAssembly by [stockfish.js](https://github.com/nmrugg/stockfish.js),
taken unmodified from the npm package `stockfish@18.0.8` (`bin/`).

- License: GPL-3.0 (see `COPYING.txt`); source: https://github.com/nmrugg/stockfish.js
  and https://github.com/official-stockfish/Stockfish.
- Single-threaded, so it needs no `SharedArrayBuffer` / cross-origin isolation headers.
- Served from this versioned folder (`/engine/stockfish-18.0.8/`) and only downloaded
  when the AI page starts the engine. The worker locates the `.wasm` next to the `.js`
  by name. (A Vite-hashed `?url` import was tried first, but it needs the wasm location
  in the worker URL's fragment, which is lost when the service worker serves the script
  from cache.)

To upgrade: copy the matching `.js` + `.wasm` pair from a newer `stockfish` npm release
into a new `static/engine/stockfish-<version>/` folder and update `STOCKFISH_URL` in
`src/lib/engine/Stockfish.ts`.
