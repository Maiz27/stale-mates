export enum EngineState {
	Uninitialized = 'uninitialized',
	Initializing = 'initializing',
	Waiting = 'waiting',
	Searching = 'searching'
}

export class Engine {
	worker: Worker;

	constructor(workerPath: string) {
		this.worker = new Worker(workerPath);
		this.worker.postMessage('uci'); // Initialize the UCI protocol
	}

	onMessage(callback: (message: string) => void) {
		this.worker.onmessage = (event) => {
			callback(event.data);
		};
	}

	setPosition(fen: string) {
		console.log(`Sending position to Stockfish: ${fen}`);
		this.worker.postMessage(`position fen ${fen}`);
	}

	go(depth: number) {
		console.log(`Sending go command to Stockfish with depth: ${depth}`);
		this.worker.postMessage(`go depth ${depth}`);
	}
}
