import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Stockfish, type EngineWorker } from './Stockfish';

class FakeWorker implements EngineWorker {
	posted: string[] = [];
	terminated = false;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	postMessage(message: string) {
		this.posted.push(message);
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
		expect(worker.posted.indexOf('setoption name Skill Level value 10')).toBeLessThan(isready);
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

		const tail = worker.posted.slice(-3);
		expect(tail).toEqual([
			'setoption name UCI_AnalyseMode value false',
			'setoption name Analysis Contempt value Both',
			'setoption name MultiPV value 2'
		]);
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
