import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Stockfish, type EngineWorker, type ProgressPortMessage } from './Stockfish';

// Captured before the fake timers are installed: MessagePort delivery is real.
const realSetTimeout = globalThis.setTimeout;

class FakeWorker implements EngineWorker {
	posted: string[] = [];
	progressPort: MessagePort | null = null;
	terminated = false;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	postMessage(message: string | ProgressPortMessage) {
		if (typeof message === 'string') this.posted.push(message);
		else this.progressPort = message.progressPort;
	}
	/** Report WASM download progress the way Stockfish.js does, and let it arrive. */
	async progress(loaded: number, total = 7_295_411) {
		this.progressPort?.postMessage({ loaded, total, percent: loaded / total });
		await new Promise((resolve) => realSetTimeout(resolve, 20));
	}
	terminate() {
		this.terminated = true;
	}
	reply(data: string) {
		this.onmessage?.({ data } as MessageEvent);
	}
	handshake() {
		this.reply('uciok');
		this.reply('readyok');
	}
}

function setup(difficulty = 10) {
	const worker = new FakeWorker();
	const engine = new Stockfish({ worker, difficulty });
	const messages: string[] = [];
	engine.onMessage((m) => messages.push(m));
	return { worker, engine, messages };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('Stockfish handshake (SM-2.6)', () => {
	it('holds commands until readyok, configuring the engine first', () => {
		const { worker, engine } = setup();
		engine.setPosition('fen1');
		engine.go();
		vi.runAllTimers();
		expect(worker.posted).toEqual(['uci']);

		worker.handshake();
		const isready = worker.posted.indexOf('isready');
		const position = worker.posted.indexOf('position fen fen1');
		const go = worker.posted.findIndex((c) => c.startsWith('go '));
		expect(worker.posted.indexOf('setoption name Skill Level value 9')).toBeLessThan(isready);
		expect(isready).toBeLessThan(position);
		expect(position).toBeLessThan(go);
	});

	it('forwards a bestmove even if it arrives before readyok', () => {
		const { worker, engine, messages } = setup();
		engine.go();
		vi.runAllTimers();
		worker.reply('uciok');
		worker.reply('bestmove e2e4');
		expect(messages).toContain('bestmove e2e4');
		expect(engine.getBestMove()).toEqual({ from: 'e2', to: 'e4' });
	});

	it('resolves a pending hint with null when the worker errors', async () => {
		const { worker, engine } = setup();
		worker.handshake();
		const hint = engine.getHint('w');
		worker.onerror?.({ message: 'boom' } as ErrorEvent);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(hint).resolves.toBeNull();
	});
});

describe('Stockfish stale results (SM-2.1)', () => {
	it('swallows the bestmove of a search that was stopped', () => {
		const { worker, engine, messages } = setup();
		worker.handshake();
		engine.go();
		vi.runAllTimers();
		engine.stop();
		expect(worker.posted).toContain('stop');

		worker.reply('bestmove a2a3'); // answer to the cancelled search
		expect(messages).toEqual([]);

		engine.go();
		vi.runAllTimers();
		worker.reply('bestmove e2e4');
		expect(messages).toEqual(['bestmove e2e4']);
	});

	it('does not count a search cancelled before it was posted', () => {
		const { worker, engine, messages } = setup();
		worker.handshake();
		engine.go();
		engine.stop(); // still in the move-delay timeout
		expect(worker.posted).not.toContain('stop');
		engine.go();
		vi.runAllTimers();
		worker.reply('bestmove e2e4');
		expect(messages).toEqual(['bestmove e2e4']);
	});
});

describe('Stockfish hints (SM-2.5)', () => {
	it('resolves the hint without reaching the move callback and restores options', async () => {
		const { worker, engine, messages } = setup(10);
		worker.handshake();
		const hint = engine.getHint('w');
		expect(engine.isBusy()).toBe(true);
		worker.reply('bestmove g1f3 ponder d7d5');
		await expect(hint).resolves.toEqual({ from: 'g1', to: 'f3' });
		expect(messages).toEqual([]);
		expect(engine.isBusy()).toBe(false);

		// The hint searched at full strength; the difficulty options are restored after.
		const hintGo = worker.posted.findIndex((c) => c.startsWith('go '));
		expect(worker.posted.slice(0, hintGo)).toContain('setoption name Skill Level value 20');
		expect(worker.posted.slice(hintGo)).toContain('setoption name Skill Level value 9');
	});

	it('cancels a pending hint when the position changes', async () => {
		const { worker, engine } = setup();
		worker.handshake();
		const hint = engine.getHint('w');
		engine.setPosition('newfen');
		await expect(hint).resolves.toBeNull();
		// The cancelled hint's late bestmove is swallowed.
		engine.go();
		vi.runAllTimers();
		const messages: string[] = [];
		engine.onMessage((m) => messages.push(m));
		worker.reply('bestmove a7a6'); // stale (hint)
		worker.reply('bestmove e2e4'); // real
		expect(messages).toEqual(['bestmove e2e4']);
	});
});

describe('Stockfish 18 options and difficulty (CR-10)', () => {
	it('never sends options Stockfish 18 does not have', () => {
		const { worker, engine } = setup(10);
		worker.handshake();
		engine.setDifficulty(3);
		void engine.getHint('b');
		worker.reply('bestmove e7e5');
		const unsupported = worker.posted.filter((c) => /Contempt|UCI_AnalyseMode/.test(c));
		expect(unsupported).toEqual([]);
	});

	it('makes the easiest level shallow and the hardest one full strength', () => {
		const easy = setup(1);
		easy.worker.handshake();
		easy.engine.go();
		vi.runAllTimers();
		expect(easy.worker.posted).toContain('setoption name Skill Level value 0');
		expect(easy.worker.posted.find((c) => c.startsWith('go '))).toBe('go depth 1 movetime 50');

		const hard = setup(20);
		hard.worker.handshake();
		hard.engine.go();
		vi.runAllTimers();
		expect(hard.worker.posted).toContain('setoption name Skill Level value 20');
		expect(hard.worker.posted.find((c) => c.startsWith('go '))).toBe('go depth 20 movetime 2000');
	});

	it('reports a failure if the engine never becomes ready', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const worker = new FakeWorker();
		const engine = new Stockfish({ worker, initTimeoutMs: 5_000 });
		const errors: unknown[] = [];
		engine.onError((e) => errors.push(e));
		vi.advanceTimersByTime(5_000);
		expect(errors).toHaveLength(1);
	});

	it('does not time out once the engine answered readyok', () => {
		const worker = new FakeWorker();
		const engine = new Stockfish({ worker, initTimeoutMs: 5_000 });
		const errors: unknown[] = [];
		engine.onError((e) => errors.push(e));
		worker.handshake();
		vi.advanceTimersByTime(10_000);
		expect(errors).toEqual([]);
	});

	it('does not time out while the WASM download is still progressing (CR2-6)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const worker = new FakeWorker();
		const engine = new Stockfish({ worker, initTimeoutMs: 5_000 });
		const errors: unknown[] = [];
		engine.onError((e) => errors.push(e));
		expect(worker.progressPort).not.toBeNull();

		// A slow connection: 20 s of download, a progress report every 4 s.
		for (let i = 1; i <= 5; i++) {
			vi.advanceTimersByTime(4_000);
			await worker.progress(i * 1_000_000);
		}
		expect(errors).toEqual([]);
		worker.reply('uciok');
		vi.advanceTimersByTime(4_000);
		worker.reply('readyok');
		vi.advanceTimersByTime(60_000);
		expect(errors).toEqual([]);
		engine.terminate();
	});

	it('still reports a load that stalls part-way (CR2-6)', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const worker = new FakeWorker();
		const engine = new Stockfish({ worker, initTimeoutMs: 5_000 });
		const errors: unknown[] = [];
		engine.onError((e) => errors.push(e));
		vi.advanceTimersByTime(4_000);
		await worker.progress(1_000_000);
		vi.advanceTimersByTime(4_999);
		expect(errors).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(errors).toHaveLength(1);
		engine.terminate();
	});
});
