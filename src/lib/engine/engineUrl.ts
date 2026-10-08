// Stockfish 18 lite (single-threaded WASM). Imported as URLs so Vite emits them
// with content hashes; the worker reads the wasm location from its URL fragment.
import engineScript from '../../../vendor/stockfish/stockfish-18-lite-single.js?url';
import engineWasm from '../../../vendor/stockfish/stockfish-18-lite-single.wasm?url';

export const STOCKFISH_URL = `${engineScript}#${encodeURIComponent(engineWasm)}`;
