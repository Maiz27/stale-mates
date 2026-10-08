import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	WebSocketManager,
	CLOSE_REPLACED,
	rejectionFor,
	type ConnectionStatus,
	type Rejection
} from './WebSocketManager';

/** Minimal browser-WebSocket stand-in. */
class FakeBrowserSocket {
	static OPEN = 1;
	static instances: FakeBrowserSocket[] = [];
	readyState = 0;
	sent: string[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((e: { data: string }) => void) | null = null;
	onerror: ((e: unknown) => void) | null = null;
	onclose: ((e: { code: number; reason: string }) => void) | null = null;
	constructor(public url: string) {
		FakeBrowserSocket.instances.push(this);
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {}
	open() {
		this.readyState = 1;
		this.onopen?.();
	}
	drop(code = 1006, reason = '') {
		this.readyState = 3;
		this.onclose?.({ code, reason });
	}
}

beforeEach(() => {
	FakeBrowserSocket.instances = [];
	vi.stubGlobal('WebSocket', FakeBrowserSocket);
	vi.useFakeTimers();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function track(manager: WebSocketManager) {
	const statuses: ConnectionStatus[] = [];
	manager.onStatus((s) => statuses.push(s));
	return statuses;
}

describe('WebSocketManager', () => {
	it('reports a server rejection (1008) as terminal "rejected" and does not retry', () => {
		const manager = new WebSocketManager('ws://x');
		const statuses = track(manager);
		FakeBrowserSocket.instances[0].drop(1008);
		vi.advanceTimersByTime(60_000);
		expect(statuses.at(-1)).toBe('rejected');
		expect(FakeBrowserSocket.instances).toHaveLength(1);
	});

	it('tells rejection reasons apart instead of calling every 1008 "not found" (CR-12)', () => {
		expect(rejectionFor(1008, 'Invalid game room')).toBe('notFound');
		expect(rejectionFor(1008, 'Unable to join game')).toBe('notFound');
		expect(rejectionFor(1008, 'Rate limit exceeded')).toBe('rateLimited');
		expect(rejectionFor(1008, 'Origin not allowed')).toBe('origin');
		expect(rejectionFor(1008, 'Join timeout')).toBe('other');
		expect(rejectionFor(1013, 'Too many connections')).toBe('tooManyConnections');
		expect(rejectionFor(1006, '')).toBeNull();
	});

	it('passes the rejection kind to the status handler', () => {
		const manager = new WebSocketManager('ws://x');
		const seen: [ConnectionStatus, Rejection | null][] = [];
		manager.onStatus((s, r) => seen.push([s, r]));
		FakeBrowserSocket.instances[0].drop(1013, 'Too many connections');
		vi.advanceTimersByTime(60_000);
		expect(seen.at(-1)).toEqual(['rejected', 'tooManyConnections']);
		expect(FakeBrowserSocket.instances).toHaveLength(1);
	});

	it('reports a seat takeover as terminal "replaced" and does not fight it', () => {
		const manager = new WebSocketManager('ws://x');
		const statuses = track(manager);
		FakeBrowserSocket.instances[0].drop(CLOSE_REPLACED);
		vi.advanceTimersByTime(60_000);
		expect(statuses.at(-1)).toBe('replaced');
		expect(FakeBrowserSocket.instances).toHaveLength(1);
	});

	it('reconnects after an unexpected drop and ignores late events from the old socket', () => {
		const manager = new WebSocketManager('ws://x');
		const statuses = track(manager);
		const first = FakeBrowserSocket.instances[0];
		first.open();
		first.drop();
		expect(statuses.at(-1)).toBe('reconnecting');

		vi.advanceTimersByTime(1_000);
		const second = FakeBrowserSocket.instances[1];
		expect(second).toBeDefined();
		second.open();
		expect(statuses.at(-1)).toBe('open');

		// A stale close from the first socket must not trigger another reconnect.
		first.onclose?.({ code: 1006, reason: '' });
		vi.advanceTimersByTime(60_000);
		expect(FakeBrowserSocket.instances).toHaveLength(2);
		expect(statuses.at(-1)).toBe('open');
	});

	it('drops malformed frames instead of throwing', () => {
		const manager = new WebSocketManager('ws://x');
		const handler = vi.fn();
		manager.addMessageHandler('opponentJoined', handler);
		const socket = FakeBrowserSocket.instances[0];
		socket.open();
		expect(() => socket.onmessage?.({ data: '{not json' })).not.toThrow();
		socket.onmessage?.({ data: JSON.stringify({ type: 'opponentJoined' }) });
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
