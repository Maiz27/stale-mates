import { Engine, EngineState } from './engine';

interface SearchParams {
	moveTime: number;
	depth: number;
}

interface ChessMove {
	from: string;
	to: string;
}

export class Stockfish extends Engine {
	private state: EngineState;
	private difficulty: number;
	private bestMove: ChessMove;
	private ponder: ChessMove;
	private searchParams: SearchParams;
	private messageCallback: ((message: string) => void) | null = null;
	private currentFen: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; // Initial position
	private debug: boolean;

	constructor(debug: boolean = false) {
		super('/stockfish.js');
		this.state = EngineState.Uninitialized;
		this.difficulty = 10;
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

	setDifficulty(level: number): void {
		this.difficulty = level;
		const skillLevel = this.mapLevelToSkill(level);
		const contempt = this.mapLevelToContempt(level);
		const multiPV = Math.max(1, Math.floor((20 - level) / 3));
		const moveTime = 1000 + (20 - level) * 250;
		const depth = this.mapLevelToDepth(level);

		this.log(`Setting difficulty: Skill Level ${skillLevel}, Contempt ${contempt}`, 'info');
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
		this.worker.postMessage('ucinewgame');
		this.worker.postMessage('setoption name Clear Hash');
	}

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
			const hintTime = 1000 + this.difficulty * 50;
			const forcedColor = playerColor === 'w' ? 'White' : 'Black';

			this.worker.postMessage(`setoption name UCI_AnalyseMode value true`);
			this.worker.postMessage(`setoption name Analysis Contempt value ${forcedColor}`);
			this.worker.postMessage(`position fen ${this.currentFen}`);
			this.worker.postMessage(`go depth ${hintDepth} movetime ${hintTime}`);
		});
	}

	private mapLevelToSkill(level: number): number {
		return Math.floor((level / 20) * 20); // Linear mapping
	}

	private mapLevelToContempt(level: number): number {
		return Math.floor(((20 - level) / 20) * 100); // Inverse linear mapping
	}

	private mapLevelToDepth(level: number): number {
		return Math.max(2, Math.floor(level / 2) + 1);
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
