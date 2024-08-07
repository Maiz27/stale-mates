import { Engine, EngineState } from './engine';
import type { ChessMove } from '$lib/chess/types';
import { STARTING_FEN } from '$lib/constants';

interface SearchParams {
	moveTime: number;
	depth: number;
}

/**
 * Stockfish class that interacts with the Stockfish chess engine via a Web Worker.
 * It provides methods to control the engine, set difficulty, and retrieve best moves.
 */
export class Stockfish extends Engine {
	private state: EngineState;
	private difficulty: number;
	private bestMove: ChessMove;
	private ponder: ChessMove;
	private searchParams: SearchParams;
	private messageCallback: ((message: string) => void) | null = null;
	private currentFen: string = STARTING_FEN;
	private debug: boolean;

	/**
	 * Creates a new Stockfish instance.
	 * @param debug - If true, enables detailed logging.
	 */
	constructor({ debug = false, difficulty = 10 }) {
		super('/stockfish.js');
		this.state = EngineState.Uninitialized;
		this.difficulty = difficulty; // Default difficulty level (range: 1-20)
		this.bestMove = { from: '', to: '' };
		this.ponder = { from: '', to: '' };
		this.searchParams = { moveTime: 1000, depth: 5 };
		this.debug = debug;
		this.initialize();
	}

	private initialize(): void {
		this.setState(EngineState.Initializing);
		this.worker.postMessage('uci');
		this.worker.onmessage = this.handleInitialization.bind(this);
	}

	private handleInitialization(event: MessageEvent): void {
		const message = event.data;
		if (message.includes('uciok')) {
			this.setState(EngineState.Waiting);
			this.setDifficulty(this.difficulty);
			this.worker.postMessage('isready');
		} else if (message.includes('readyok')) {
			this.log('Engine is fully initialized and ready', 'info');
			this.state = EngineState.Waiting;
			this.worker.onmessage = this.handleMessage.bind(this);
		}
	}

	private handleMessage(event: MessageEvent): void {
		const message = event.data;
		this.log('Stockfish message: ', message);
		this.handleBestMoveMessage(message);
		if (this.messageCallback) {
			this.messageCallback(message);
		}
	}

	onMessage(callback: (message: string) => void): void {
		this.messageCallback = callback;
	}

	private handleBestMoveMessage(message: string): void {
		if (!message.includes('bestmove')) return;

		this.log(message, 'info');
		const moves = message.split(' ');
		this.bestMove = this.parseMove(moves[1]);
		this.ponder = moves[3] ? this.parseMove(moves[3]) : { from: '', to: '' };
		this.setState(EngineState.Waiting);
	}

	private parseMove(move: string): ChessMove {
		return {
			from: move.slice(0, 2),
			to: move.slice(2, 4)
		};
	}

	/**
	 * Sets the difficulty level of the engine.
	 * @param level - Difficulty level (1-20, where 1 is easiest and 20 is hardest)
	 *
	 * This method adjusts several Stockfish parameters based on the difficulty level:
	 * 1. Skill Level: Mapped from 0-20 based on the input level.
	 * 2. Contempt: Mapped from 0-100 based on the input level.
	 *    Higher contempt makes the engine play more aggressively.
	 * 3. MultiPV: Decreases as difficulty increases, making the engine consider fewer alternative moves.
	 * 4. Move Time: Increases with difficulty, giving the engine more time to think.
	 * 5. Depth: Increases with difficulty, making the engine search deeper into the game tree.
	 */
	setDifficulty(level: number): void {
		this.difficulty = level;
		const skillLevel = this.mapLevelToSkill(level);
		const contempt = this.mapLevelToContempt(level);
		const moveTime = this.mapLevelToMoveTime(level);
		const depth = this.mapLevelToDepth(level);
		const multiPV = Math.max(1, Math.floor((21 - level) / 4)); // 5 to 1

		this.log(
			`Setting difficulty: Skill Level ${skillLevel}, Contempt ${contempt}, MultiPV ${multiPV}, Move Time ${moveTime}, Depth ${depth}`,
			'info'
		);
		this.worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
		this.worker.postMessage(`setoption name Contempt value ${contempt}`);
		this.worker.postMessage(`setoption name MultiPV value ${multiPV}`);

		this.searchParams = { moveTime, depth };
	}

	setPosition(fen: string): void {
		if (this.state !== EngineState.Waiting) {
			this.log('Engine is not ready to accept a new position', 'warn');
			return;
		}
		this.currentFen = fen;
		this.log(`Sending position to Stockfish: ${fen}`);
		this.worker.postMessage(`position fen ${fen}`);
	}

	go(): void {
		if (this.state !== EngineState.Waiting) {
			this.log('Engine is not ready to start searching', 'warn');
			return;
		}
		this.setState(EngineState.Searching);
		const { moveTime, depth } = this.searchParams;
		this.log(`Sending go command to Stockfish with depth: ${depth}, movetime: ${moveTime}`);
		this.worker.postMessage(`go depth ${depth} movetime ${moveTime}`);
	}

	getBestMove(): ChessMove {
		return this.bestMove;
	}

	getPonderMove(): ChessMove {
		return this.ponder;
	}

	newGame(): void {
		this.log('Stockfish: Starting new game');
		this.setState(EngineState.Waiting);
		this.worker.postMessage('ucinewgame');
		this.worker.postMessage('setoption name Clear Hash');
		this.log('Stockfish: Sent ucinewgame and Clear Hash commands');
	}

	/**
	 * Provides a hint for the current position.
	 * @param playerColor - The color of the player to get a hint for ('w' for white, 'b' for black)
	 * @returns A promise that resolves to the suggested move
	 *
	 * This method temporarily adjusts the engine settings to provide a hint:
	 * 1. Enables UCI_AnalyseMode for more thorough analysis.
	 * 2. Sets Analysis Contempt to favor the player's color.
	 * 3. Uses a depth based on the current difficulty level.
	 * 4. Sets a move time that increases with difficulty.
	 */
	async getHint(playerColor: 'w' | 'b'): Promise<ChessMove> {
		return new Promise((resolve) => {
			const originalCallback = this.messageCallback;
			this.messageCallback = (message: string) => {
				if (message.includes('bestmove')) {
					const moves = message.split(' ');
					resolve(this.parseMove(moves[1]));
					this.messageCallback = originalCallback;
				}
			};
			const hintDepth = Math.max(10, Math.floor(this.difficulty / 5));
			const hintTime = 1500 + this.difficulty * 50; // 1500ms to 2500ms
			const forcedColor = playerColor === 'w' ? 'White' : 'Black';

			this.worker.postMessage(`setoption name UCI_AnalyseMode value true`);
			this.worker.postMessage(`setoption name Analysis Contempt value ${forcedColor}`);
			this.worker.postMessage(`position fen ${this.currentFen}`);
			this.worker.postMessage(`go depth ${hintDepth} movetime ${hintTime}`);
		});
	}

	/**
	 * Maps the difficulty level (1-20) to a Stockfish Skill Level (0-20).
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding Stockfish Skill Level (0-20)
	 */
	private mapLevelToSkill(level: number): number {
		return Math.floor(((level - 1) / 19) * 20); // Linear mapping from 1-20 to 0-20
	}

	/**
	 * Maps the difficulty level (1-20) to a Stockfish Contempt value (0-100).
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding Stockfish Contempt value (0-100)
	 */
	private mapLevelToContempt(level: number): number {
		return Math.floor(((level - 1) / 19) * 100); // Linear mapping from 1-20 to 0-100
	}

	/**
	 * Maps the difficulty level (1-20) to a search depth (1-15).
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding search depth (1-15)
	 */
	private mapLevelToDepth(level: number): number {
		return Math.floor(((level - 1) / 19) * 14) + 1; // Linear mapping from 1-20 to 1-15
	}

	/**
	 * Maps the difficulty level (1-20) to a move time (100-5000 ms).
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding move time in milliseconds (100-5000)
	 */
	private mapLevelToMoveTime(level: number): number {
		return Math.floor(100 + (level / 20) * 4900); // Maps 0-20 to 100-5000 ms
	}

	private setState(state: EngineState): void {
		this.state = state;
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
