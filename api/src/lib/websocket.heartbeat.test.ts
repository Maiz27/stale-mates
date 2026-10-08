import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import { heartbeatTick, trackHeartbeat } from './websocket';

class FakeSocket extends EventEmitter {
	pings = 0;
	terminated = false;
	ping() {
		this.pings++;
	}
	terminate() {
		this.terminated = true;
	}
}
const asWs = (s: FakeSocket) => s as unknown as WebSocket;

describe('heartbeat (SM-1.1)', () => {
	it('pings live sockets and terminates ones that never answered', () => {
		const live = new FakeSocket();
		const dead = new FakeSocket();
		trackHeartbeat(asWs(live));
		trackHeartbeat(asWs(dead));

		heartbeatTick([asWs(live), asWs(dead)]);
		expect(live.pings).toBe(1);
		expect(dead.pings).toBe(1);

		// Only the live socket answers.
		live.emit('pong');

		heartbeatTick([asWs(live), asWs(dead)]);
		expect(live.terminated).toBe(false);
		expect(live.pings).toBe(2);
		expect(dead.terminated).toBe(true);
	});

	it('terminates sockets it was never told about', () => {
		const unknown = new FakeSocket();
		heartbeatTick([asWs(unknown)]);
		expect(unknown.terminated).toBe(true);
	});
});
