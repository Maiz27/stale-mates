import type { ChessMove } from '$lib/chess/types';
import { STARTING_FEN } from '$lib/constants';
/**
 * Stockfish 18 lite (single-threaded WASM), served from a versioned static path.
 * The worker finds its `.wasm` next to the `.js` by name, which keeps working
 * when the service worker serves the script from cache (a URL-fragment hint
 * would be lost there). Bump the folder name when upgrading so caches refresh.
 */
export const STOCKFISH_URL = '/engine/stockfish-18.0.8/stockfish-18-lite-single.js';

interface SearchParams {
	moveTime: number;
	moveDelay: number;
	depth: number;
}

/**
 * Stockfish.js's download-progress hook: posting `{ progressPort }` makes the
 * worker report the WASM download (`{ loaded, total, percent }`) on that port.
 */
export interface ProgressPortMessage {
	progressPort: MessagePort;
}

/** The subset of the Web Worker API the engine uses (lets tests inject a fake). */
export interface EngineWorker {
	postMessage(message: string | ProgressPortMessage, transfer?: Transferable[]): void;
	terminate(): void;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
}

export interface StockfishOptions {
	debug?: boolean;
	difficulty?: number;
	/** Inject a worker (tests). Defaults to `new Worker(url)`. */
	worker?: EngineWorker;
	/** Worker script URL. */
	url?: string;
	/**
	 * Report a failure if the engine goes this long (ms) without a sign of life
	 * — WASM download progress or a message — before answering `readyok`.
	 */
	initTimeoutMs?: number;
}

/**
 * How long loading may stall before the engine is reported as failed. Measured
 * from the last sign of progress, not from construction, so a slow but moving
 * download of the ~7 MB WASM is never cut off (CR2-6).
 */
export const ENGINE_INIT_TIMEOUT_MS = 30_000;

type InFlight = 'move' | 'hint' | null;

/**
 * Stockfish class that interacts with the Stockfish chess engine via a Web Worker.
 * It provides methods to control the engine, set difficulty, and retrieve best moves.
 *
 * Search bookkeeping: at most one search is ever in flight. Starting a new one,
 * changing position, or stopping cancels the current search with `stop`; the
 * cancelled search still answers with exactly one `bestmove`, which is counted
 * in `staleBestmoves` and swallowed, so a stale result can never be applied to
 * a newer position (audit SM-2.1). Hints run through the same machinery and
 * never reach the move callback (audit SM-2.5).
 */
export class Stockfish {
	private worker: EngineWorker;
	private ready = false;
	private failed = false;
	/** Commands posted before `readyok` — flushed once the engine is configured (SM-2.6). */
	private queue: string[] = [];
	private difficulty: number;
	private bestMove: ChessMove;
	private ponder: ChessMove;
	private searchParams: SearchParams;
	private messageCallback: ((message: string) => void) | null = null;
	private errorCallback: ((error: unknown) => void) | null = null;
	private currentFen: string = STARTING_FEN;
	private debug: boolean;
	private searchGeneration: number = 0;
	private pendingGo: ReturnType<typeof setTimeout> | null = null;
	private inFlight: InFlight = null;
	private staleBestmoves = 0;
	private hintResolve: ((move: ChessMove | null) => void) | null = null;
	private initTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly initTimeoutMs: number;
	private progressPort: MessagePort | null = null;

	constructor({
		debug = false,
		difficulty = 10,
		worker,
		url = STOCKFISH_URL,
		initTimeoutMs = ENGINE_INIT_TIMEOUT_MS
	}: StockfishOptions = {}) {
		this.worker = worker ?? (new Worker(url) as unknown as EngineWorker);
		this.difficulty = difficulty; // Default difficulty level (range: 1-20)
		this.bestMove = { from: '', to: '' };
		this.ponder = { from: '', to: '' };
		this.searchParams = { moveTime: 1000, depth: 5, moveDelay: 400 };
		this.debug = debug;
		this.worker.onmessage = (event) => this.handleMessage(String(event.data));
		this.worker.onerror = (event) => this.handleError(event);
		// Derive search params now; the UCI options are (re)sent during the handshake.
		this.setDifficulty(difficulty);
		this.queue = [];
		// A WASM that fails to fetch/compile doesn't always raise a worker error;
		// treat a load that stops making progress as a failure too, so the UI can
		// offer a retry (CR-10). The watchdog is re-armed by every download
		// progress report and engine message, so it only fires on a stall (CR2-6).
		this.initTimeoutMs = initTimeoutMs;
		this.watchDownloadProgress();
		this.armInitWatchdog();
		this.worker.postMessage('uci');
	}

	/** (Re)start the countdown to "the engine stalled while loading". */
	private armInitWatchdog(): void {
		this.clearInitTimer();
		if (this.ready || this.failed) return;
		this.initTimer = setTimeout(() => {
			this.initTimer = null;
			if (!this.ready) this.handleError(new Error('Stockfish stopped loading'));
		}, this.initTimeoutMs);
	}

	/** Ask the worker to report WASM download progress; each report re-arms the watchdog. */
	private watchDownloadProgress(): void {
		if (typeof MessageChannel === 'undefined') return;
		try {
			const channel = new MessageChannel();
			channel.port1.onmessage = () => this.armInitWatchdog();
			this.worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);
			this.progressPort = channel.port1;
		} catch {
			// No progress reports: the watchdog then measures from construction.
		}
	}

	private clearInitTimer(): void {
		if (this.initTimer) {
			clearTimeout(this.initTimer);
			this.initTimer = null;
		}
	}

	/** Loading is over (ready, failed or terminated): stop watching it. */
	private stopWatchingLoad(): void {
		this.clearInitTimer();
		if (this.progressPort) {
			this.progressPort.onmessage = null;
			this.progressPort.close();
			this.progressPort = null;
		}
	}

	/** Post a command, holding it until the engine has answered `readyok`. */
	private send(command: string): void {
		if (this.failed) return;
		if (this.ready) {
			this.worker.postMessage(command);
		} else {
			this.queue.push(command);
		}
	}

	private handleError(event: unknown): void {
		if (this.failed) return;
		this.failed = true;
		this.stopWatchingLoad();
		this.log(`Stockfish worker error: ${String((event as ErrorEvent)?.message ?? event)}`, 'error');
		this.clearPendingGo();
		this.inFlight = null;
		this.resolveHint(null);
		this.errorCallback?.(event);
	}

	private handleMessage(message: string): void {
		this.log('Stockfish message: ' + message);
		// Still loading, but alive: give the rest of the handshake a fresh window.
		if (!this.ready) this.armInitWatchdog();
		if (message.startsWith('uciok')) {
			// Configure before anything queued runs, then wait for readyok.
			this.applyDifficultyOptions((cmd) => this.worker.postMessage(cmd));
			this.worker.postMessage('isready');
			return;
		}
		if (message.startsWith('readyok')) {
			if (!this.ready) {
				this.ready = true;
				this.stopWatchingLoad();
				this.log('Engine is fully initialized and ready', 'info');
				const queued = this.queue;
				this.queue = [];
				queued.forEach((cmd) => this.worker.postMessage(cmd));
			}
			return;
		}
		if (message.startsWith('bestmove')) {
			this.handleBestMove(message);
			return;
		}
		this.messageCallback?.(message);
	}

	onMessage(callback: (message: string) => void): void {
		this.messageCallback = callback;
	}

	onError(callback: (error: unknown) => void): void {
		this.errorCallback = callback;
	}

	private handleBestMove(message: string): void {
		if (this.staleBestmoves > 0) {
			// Answer to a search we cancelled — never apply it.
			this.staleBestmoves--;
			this.log('Ignoring stale bestmove: ' + message);
			return;
		}
		const kind = this.inFlight;
		this.inFlight = null;
		const moves = message.split(' ');
		const best = moves[1] && moves[1] !== '(none)' ? this.parseMove(moves[1]) : null;

		if (kind === 'hint') {
			this.restoreAfterHint();
			this.resolveHint(best);
			return;
		}

		this.log(message, 'info');
		this.bestMove = best ?? { from: '', to: '' };
		this.ponder = moves[3] ? this.parseMove(moves[3]) : { from: '', to: '' };
		this.messageCallback?.(message);
	}

	private parseMove(move: string): ChessMove {
		const parsed: ChessMove = {
			from: move.slice(0, 2),
			to: move.slice(2, 4)
		};
		// UCI long algebraic notation appends the promotion piece at index 4 (e.g. "e7e8q").
		const promotion = move.charAt(4);
		if (promotion) {
			parsed.promotion = promotion;
		}
		return parsed;
	}

	/** True while a move or hint search is queued or running. */
	isBusy(): boolean {
		return this.inFlight !== null || this.pendingGo !== null;
	}

	/**
	 * Sets the difficulty level of the chess engine.
	 * @param level - Difficulty level (1-20, where 1 is easiest and 20 is hardest)
	 *
	 * Stockfish 18 is far stronger than the old SF10 build, and even its
	 * `UCI_LimitStrength`/`UCI_Elo` floor (1320, CCRL-calibrated) beats most
	 * beginners, so strength is shaped with three knobs instead (CR-10):
	 *
	 * 1. Skill Level (0-20), linear in the level. Below 20 Stockfish picks, with
	 *    some randomness, among its top few moves, more loosely the lower it is.
	 * 2. Depth cap (1-20), growing slowly at first (`((level-1)/19)^1.5`): level 1
	 *    looks one ply ahead and so misses simple tactics; level 20 is uncapped
	 *    in practice.
	 * 3. Move time (50-2000 ms), quadratic, so low levels answer almost instantly
	 *    and high levels get time for deep search.
	 *
	 * Plus a cosmetic move delay (400-0 ms) so fast low-level replies don't feel
	 * instant. The engine keeps MultiPV 1: Skill Level widens its own candidate
	 * set internally.
	 */
	setDifficulty(level: number): void {
		this.difficulty = level;
		const skillLevel = this.mapLevelToSkill(level);
		const moveTime = this.mapLevelToMoveTime(level);
		const depth = this.mapLevelToDepth(level);
		const moveDelay = this.mapLevelToMoveDelay(level);

		this.log(
			`Setting difficulty: Skill Level ${skillLevel}, Move Time ${moveTime}, Depth ${depth}, Move Delay ${moveDelay}`,
			'info'
		);
		this.searchParams = { moveTime, depth, moveDelay };
		// Queued until readyok if the handshake hasn't finished yet.
		this.applyDifficultyOptions((cmd) => this.send(cmd));
	}

	private applyDifficultyOptions(post: (command: string) => void): void {
		post(`setoption name Skill Level value ${this.mapLevelToSkill(this.difficulty)}`);
	}

	/** Cancel a queued (not yet posted) search. */
	private clearPendingGo(): void {
		if (this.pendingGo) {
			clearTimeout(this.pendingGo);
			this.pendingGo = null;
		}
	}

	/** Cancel whatever search is queued or running; its bestmove will be swallowed. */
	private cancelSearch(): void {
		this.clearPendingGo();
		if (this.inFlight) {
			const kind = this.inFlight;
			this.inFlight = null;
			this.staleBestmoves++;
			this.send('stop');
			if (kind === 'hint') {
				this.restoreAfterHint();
				this.resolveHint(null);
			}
		}
	}

	setPosition(fen: string): void {
		this.cancelSearch();
		this.currentFen = fen;
		this.log(`Sending position to Stockfish: ${fen}`);
		this.send(`position fen ${fen}`);
	}

	go(): void {
		this.cancelSearch();
		const { moveTime, depth, moveDelay } = this.searchParams;
		this.log(`Delaying move by ${moveDelay}ms`);
		this.pendingGo = setTimeout(() => {
			this.pendingGo = null;
			this.inFlight = 'move';
			this.log(`Sending go command to Stockfish with depth: ${depth}, movetime: ${moveTime}`);
			this.send(`go depth ${depth} movetime ${moveTime}`);
		}, moveDelay);
	}

	/**
	 * Cancels any in-flight search and bumps the search generation so callers
	 * tracking it can also discard anything they requested before.
	 */
	stop(): void {
		this.log('Stockfish: Stopping current search', 'info');
		this.cancelSearch();
		this.searchGeneration++;
	}

	getSearchGeneration(): number {
		return this.searchGeneration;
	}

	terminate(): void {
		this.log('Stockfish: Terminating worker', 'info');
		this.stopWatchingLoad();
		this.clearPendingGo();
		this.resolveHint(null);
		this.messageCallback = null;
		this.errorCallback = null;
		this.worker.terminate();
	}

	getBestMove(): ChessMove {
		return this.bestMove;
	}

	getPonderMove(): ChessMove {
		return this.ponder;
	}

	newGame(): void {
		this.log('Stockfish: Starting new game');
		this.cancelSearch();
		this.searchGeneration++;
		this.send('ucinewgame');
		this.send('setoption name Clear Hash');
	}

	private resolveHint(move: ChessMove | null): void {
		const resolve = this.hintResolve;
		this.hintResolve = null;
		resolve?.(move);
	}

	/** Restore the difficulty options after a full-strength hint search (audit SM-2.5). */
	private restoreAfterHint(): void {
		this.applyDifficultyOptions((cmd) => this.send(cmd));
	}

	/**
	 * Provides a hint for the current position. Resolves to the suggested move,
	 * or `null` if the hint was cancelled (the position changed, the game was
	 * reset, or the engine failed).
	 *
	 * The hint is searched at full strength (Skill Level 20) with a
	 * difficulty-scaled depth/movetime; the difficulty's Skill Level is restored
	 * when the hint search finishes or is cancelled. A hint replaces any search
	 * already in flight.
	 */
	getHint(_playerColor?: 'w' | 'b'): Promise<ChessMove | null> {
		void _playerColor; // the side to move is in the FEN
		this.cancelSearch();
		return new Promise((resolve) => {
			if (this.failed) {
				resolve(null);
				return;
			}
			this.hintResolve = resolve;

			// Scale depth based on difficulty (8 to 15)
			const hintDepth = Math.min(15, Math.max(8, Math.floor(7 + this.difficulty / 2)));
			// Scale move time based on difficulty (1000ms to 2000ms)
			const hintTime = Math.min(2000, Math.max(1000, 1000 + this.difficulty * 125));

			this.send('setoption name Skill Level value 20');
			this.send(`position fen ${this.currentFen}`);
			this.inFlight = 'hint';
			this.send(`go depth ${hintDepth} movetime ${hintTime}`);
		});
	}

	/** Level 1-20 → Stockfish Skill Level 0-20 (linear). */
	private mapLevelToSkill(level: number): number {
		return Math.round(((clampLevel(level) - 1) * 20) / 19);
	}

	/** Level 1-20 → search depth cap 1-20, slow at first: ((level-1)/19)^1.5. */
	private mapLevelToDepth(level: number): number {
		return Math.round(1 + Math.pow((clampLevel(level) - 1) / 19, 1.5) * 19);
	}

	/** Level 1-20 → move time 50-2000 ms, quadratic. */
	private mapLevelToMoveTime(level: number): number {
		return Math.round(50 + Math.pow((clampLevel(level) - 1) / 19, 2) * 1950);
	}

	/** Level 1-20 → cosmetic delay before searching, 400-0 ms (linear). */
	private mapLevelToMoveDelay(level: number): number {
		return Math.round(400 - ((clampLevel(level) - 1) / 19) * 400);
	}

	private log(message: string, level: 'info' | 'log' | 'warn' | 'error' = 'log'): void {
		if (!this.debug && level === 'log') {
			return;
		}

		switch (level) {
			case 'info':
				console.log('INFO: ' + message);
				break;
			case 'log':
				console.log(message);
				break;
			case 'warn':
				console.warn(message);
				break;
			case 'error':
				console.error(message);
				break;
		}
	}
}

const clampLevel = (level: number) => Math.min(20, Math.max(1, level));
