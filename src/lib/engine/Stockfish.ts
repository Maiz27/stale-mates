import type { ChessMove } from '$lib/chess/types';
import { STARTING_FEN } from '$lib/constants';

interface SearchParams {
	moveTime: number;
	moveDelay: number;
	depth: number;
}

/** The subset of the Web Worker API the engine uses (lets tests inject a fake). */
export interface EngineWorker {
	postMessage(message: string): void;
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
}

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
	private multiPV = 1;
	private messageCallback: ((message: string) => void) | null = null;
	private errorCallback: ((error: unknown) => void) | null = null;
	private currentFen: string = STARTING_FEN;
	private debug: boolean;
	private searchGeneration: number = 0;
	private pendingGo: ReturnType<typeof setTimeout> | null = null;
	private inFlight: InFlight = null;
	private staleBestmoves = 0;
	private hintResolve: ((move: ChessMove | null) => void) | null = null;

	constructor({
		debug = false,
		difficulty = 10,
		worker,
		url = '/stockfish.js'
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
		this.worker.postMessage('uci');
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
		this.failed = true;
		this.log(`Stockfish worker error: ${String((event as ErrorEvent)?.message ?? event)}`, 'error');
		this.clearPendingGo();
		this.inFlight = null;
		this.resolveHint(null);
		this.errorCallback?.(event);
	}

	private handleMessage(message: string): void {
		this.log('Stockfish message: ' + message);
		if (message.startsWith('uciok')) {
			// Configure before anything queued runs, then wait for readyok.
			this.applyDifficultyOptions((cmd) => this.worker.postMessage(cmd));
			this.worker.postMessage('isready');
			return;
		}
		if (message.startsWith('readyok')) {
			if (!this.ready) {
				this.ready = true;
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
	 * This method adjusts several Stockfish parameters based on the difficulty level:
	 * 1. Skill Level (0-20): Mapped using a sigmoid function for a more gradual increase.
	 *    Lower values make the engine play weaker, allowing for more mistakes.
	 *    At 0, the engine plays randomly from a selection of good moves.
	 *
	 * 2. Contempt (-100 to 100): Mapped using a sigmoid function centered at 0.
	 *    Positive values make the engine play more aggressively and take more risks to avoid draws.
	 *    Negative values make the engine more accepting of draws.
	 *    At 0, the engine plays objectively.
	 *
	 * 3. MultiPV (5-1): Decreases linearly as difficulty increases.
	 *    Determines the number of alternative moves the engine considers.
	 *    At lower difficulties, more alternatives are considered, making play more varied.
	 *    At higher difficulties, fewer alternatives are considered, focusing on the best moves.
	 *
	 * 4. Move Time (100-1800 ms): Increases non-linearly with difficulty.
	 *    Determines how long the engine thinks about each move.
	 *    Longer times at higher difficulties allow for deeper, more accurate analysis.
	 *
	 * 5. Depth (1-15): Increases non-linearly with difficulty.
	 *    Determines how many moves ahead the engine calculates.
	 *    Greater depth at higher difficulties results in stronger, more strategic play.
	 *
	 * 6. Move Delay (400-0 ms): Decreases linearly with difficulty.
	 *    Adds a delay before the engine makes its move, ensuring a more engaging user experience.
	 *    Shorter delays at higher difficulties balance out the longer move times.
	 *
	 * The new mappings ensure a smoother progression of difficulty:
	 * - Beginner and Casual levels have longer delays and shorter move times for quick, varied play.
	 * - Intermediate to Expert levels balance move time and delay for a natural progression.
	 * - Master and Grandmaster levels have longer move times but shorter delays for deep analysis and quicker responses.
	 * This progression aims to provide a more natural increase in difficulty while maintaining engagement.
	 */
	setDifficulty(level: number): void {
		this.difficulty = level;
		const skillLevel = this.mapLevelToSkill(level);
		const contempt = this.mapLevelToContempt(level);
		const moveTime = this.mapLevelToMoveTime(level);
		const depth = this.mapLevelToDepth(level);
		const multiPV = this.mapLevelToMultiPV(level);
		const moveDelay = this.mapLevelToMoveDelay(level);

		this.log(
			`Setting difficulty: Skill Level ${skillLevel}, Contempt ${contempt}, MultiPV ${multiPV}, Move Time ${moveTime}, Depth ${depth}, Move Delay ${moveDelay}`,
			'info'
		);
		this.multiPV = multiPV;
		this.searchParams = { moveTime, depth, moveDelay };
		// Queued until readyok if the handshake hasn't finished yet.
		this.applyDifficultyOptions((cmd) => this.send(cmd));
	}

	private applyDifficultyOptions(post: (command: string) => void): void {
		const level = this.difficulty;
		this.multiPV = this.mapLevelToMultiPV(level);
		post(`setoption name Skill Level value ${this.mapLevelToSkill(level)}`);
		post(`setoption name Contempt value ${this.mapLevelToContempt(level)}`);
		post(`setoption name MultiPV value ${this.multiPV}`);
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

	/** Undo the analysis-only options a hint search set (audit SM-2.5). */
	private restoreAfterHint(): void {
		this.send('setoption name UCI_AnalyseMode value false');
		this.send('setoption name Analysis Contempt value Both');
		this.send(`setoption name MultiPV value ${this.multiPV}`);
	}

	/**
	 * Provides a hint for the current position. Resolves to the suggested move,
	 * or `null` if the hint was cancelled (the position changed, the game was
	 * reset, or the engine failed).
	 *
	 * Temporarily enables UCI_AnalyseMode, sets Analysis Contempt to the
	 * player's colour and a difficulty-scaled MultiPV/depth/movetime; all are
	 * restored when the hint search finishes or is cancelled. A hint replaces
	 * any search already in flight.
	 */
	getHint(playerColor: 'w' | 'b'): Promise<ChessMove | null> {
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
			// Vary MultiPV based on difficulty (5 to 1)
			const multiPV = Math.max(1, Math.min(5, 6 - Math.floor(this.difficulty / 4)));
			const forcedColor = playerColor === 'w' ? 'White' : 'Black';

			this.send(`setoption name UCI_AnalyseMode value true`);
			this.send(`setoption name Analysis Contempt value ${forcedColor}`);
			this.send(`setoption name MultiPV value ${multiPV}`);
			this.send(`position fen ${this.currentFen}`);
			this.inFlight = 'hint';
			this.send(`go depth ${hintDepth} movetime ${hintTime}`);
		});
	}

	/**
	 * Maps the difficulty level (1-20) to a Stockfish Skill Level (0-20).
	 * Uses a sigmoid function for a more gradual increase in skill level.
	 *
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding Stockfish Skill Level (0-20)
	 */
	private mapLevelToSkill(level: number): number {
		const x = (level - 10) / 5; // Center the sigmoid at level 10
		const sigmoid = 1 / (1 + Math.exp(-x));
		return Math.round(sigmoid * 20);
	}

	/**
	 * Maps the difficulty level (1-20) to a Stockfish Contempt value (-100 to 100).
	 * Uses a sigmoid function for a more balanced progression, centered at 0.
	 *
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding Stockfish Contempt value (-100 to 100)
	 */
	private mapLevelToContempt(level: number): number {
		const x = (level - 10) / 3; // Center the sigmoid at level 10
		const sigmoid = 1 / (1 + Math.exp(-x));
		return Math.round((sigmoid * 2 - 1) * 100); // Map to range -100 to 100
	}

	/**
	 * Maps the difficulty level (1-20) to a search depth (1-15).
	 * Uses a power function with exponent 1.4 for a balanced depth increase.
	 *
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding search depth (1-15)
	 */
	private mapLevelToDepth(level: number): number {
		return Math.round(1 + Math.pow((level - 1) / 19, 1.4) * 14);
	}

	/**
	 * Maps the difficulty level (1-20) to a move time (100-1800 ms).
	 * Uses a power function with exponent 1.5 for a more balanced time progression.
	 *
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding move time in milliseconds (100-1800)
	 */
	private mapLevelToMoveTime(level: number): number {
		return Math.round(100 + Math.pow((level - 1) / 19, 1.5) * 1700);
	}

	/**
	 * Maps the difficulty level (1-20) to a move delay (400-0 ms).
	 * Uses a linear function to provide a smooth decrease in delay.
	 *
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding move delay in milliseconds (400-0)
	 */
	private mapLevelToMoveDelay(level: number): number {
		return Math.round(400 - ((level - 1) / 19) * 400);
	}

	/**
	 * Maps the difficulty level (1-20) to a MultiPV value (5-1).
	 * MultiPV decreases as difficulty increases, making the engine consider fewer alternative moves at higher difficulties.
	 *
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding MultiPV value (5-1)
	 */
	private mapLevelToMultiPV(level: number): number {
		return Math.max(1, Math.floor((21 - level) / 4));
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
