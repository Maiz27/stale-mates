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
	 * 4. Move Time (100-3500 ms): Increases non-linearly with difficulty.
	 *    Determines how long the engine thinks about each move.
	 *    Longer times at higher difficulties allow for deeper, more accurate analysis.
	 *
	 * 5. Depth (1-15): Increases non-linearly with difficulty.
	 *    Determines how many moves ahead the engine calculates.
	 *    Greater depth at higher difficulties results in stronger, more strategic play.
	 *
	 * The new mappings ensure a smoother progression of difficulty:
	 * - Beginner and Casual levels have negative contempt, favoring drawish play.
	 * - Intermediate level has slightly negative contempt, balancing between drawish and aggressive play.
	 * - Advanced to Grandmaster levels have increasingly positive contempt, favoring more aggressive play.
	 * This progression aims to provide a more natural increase in difficulty and aggressiveness.
	 */
	setDifficulty(level: number): void {
		this.difficulty = level;
		const skillLevel = this.mapLevelToSkill(level);
		const contempt = this.mapLevelToContempt(level);
		const moveTime = this.mapLevelToMoveTime(level);
		const depth = this.mapLevelToDepth(level);
		const multiPV = this.mapLevelToMultiPV(level);

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
	 * 3. Uses a depth that scales with difficulty:
	 *    - Minimum depth of 8 for lower difficulties.
	 *    - Maximum depth of 15 for higher difficulties.
	 * 4. Sets a move time that scales with difficulty:
	 *    - Minimum move time of 1000ms for lower difficulties.
	 *    - Maximum move time of 3500ms for higher difficulties.
	 * 5. Uses MultiPV to consider multiple lines, ensuring varied hints:
	 *    - Higher MultiPV at lower difficulties for more varied suggestions.
	 *    - Lower MultiPV at higher difficulties for more focused, stronger hints.
	 *
	 * This approach balances hint quality with response time, ensuring
	 * decent hints across all difficulty levels without excessive delays.
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

			// Scale depth based on difficulty (8 to 15)
			const hintDepth = Math.min(15, Math.max(8, Math.floor(7 + this.difficulty / 2)));

			// Scale move time based on difficulty (1000ms to 3500ms)
			const hintTime = Math.min(3500, Math.max(1000, 1000 + this.difficulty * 125));

			// Vary MultiPV based on difficulty (5 to 1)
			const multiPV = Math.max(1, Math.min(5, 6 - Math.floor(this.difficulty / 4)));

			const forcedColor = playerColor === 'w' ? 'White' : 'Black';

			this.worker.postMessage(`setoption name UCI_AnalyseMode value true`);
			this.worker.postMessage(`setoption name Analysis Contempt value ${forcedColor}`);
			this.worker.postMessage(`setoption name MultiPV value ${multiPV}`);
			this.worker.postMessage(`position fen ${this.currentFen}`);
			this.worker.postMessage(`go depth ${hintDepth} movetime ${hintTime}`);
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
	 * Maps the difficulty level (1-20) to a move time (100-3500 ms).
	 * Uses a power function with exponent 1.5 for a more balanced time progression.
	 *
	 * @param level - The input difficulty level (1-20)
	 * @returns The corresponding move time in milliseconds (100-3500)
	 */
	private mapLevelToMoveTime(level: number): number {
		return Math.round(100 + Math.pow((level - 1) / 19, 1.5) * 3400);
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
