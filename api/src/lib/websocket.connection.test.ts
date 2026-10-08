import { describe, it, expect, afterAll } from 'vitest';
import { EventEmitter } from 'events';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { handleWebSocketConnection, isOriginAllowed, MessageBudget } from './websocket';
import { createGame } from './game';

class FakeSocket extends EventEmitter {
	sent: Record<string, unknown>[] = [];
	closed: { code: number; reason: string } | null = null;
	send(d: string) {
		this.sent.push(JSON.parse(d));
	}
	close(code: number, reason: string) {
		this.closed = { code, reason };
	}
	ping() {}
	terminate() {}
	frame(obj: unknown) {
		this.emit('message', Buffer.from(JSON.stringify(obj)));
	}
}

const req = (url: string, origin?: string) =>
	({ url, headers: { host: 'localhost', origin } }) as unknown as IncomingMessage;
const dev = { ORIGIN: 'http://localhost:5173' };

function connect(url: string, origin = 'http://localhost:5173', env = dev) {
	const ws = new FakeSocket();
	handleWebSocketConnection(ws as unknown as WebSocket, req(url, origin), env);
	return ws;
}

describe('isOriginAllowed (SM-3)', () => {
	const prod = { ORIGIN: 'https://a.example, https://b.example', NODE_ENV: 'production' };
	it('allows listed origins and rejects others in production', () => {
		expect(isOriginAllowed('https://a.example', prod)).toBe(true);
		expect(isOriginAllowed('https://b.example', prod)).toBe(true);
		expect(isOriginAllowed('https://evil.example', prod)).toBe(false);
		expect(isOriginAllowed(undefined, prod)).toBe(false);
		expect(isOriginAllowed('http://localhost:5173', prod)).toBe(false);
	});
	it('is permissive for localhost and origin-less clients outside production', () => {
		expect(isOriginAllowed('http://localhost:4173', dev)).toBe(true);
		expect(isOriginAllowed(undefined, dev)).toBe(true);
		expect(isOriginAllowed('https://evil.example', dev)).toBe(false);
	});
});

describe('MessageBudget (SM-3)', () => {
	it('allows a burst up to capacity, then refills over time', () => {
		let now = 0;
		const budget = new MessageBudget(3, 1, () => now);
		expect([budget.take(), budget.take(), budget.take(), budget.take()]).toEqual([
			true,
			true,
			true,
			false
		]);
		now = 1000;
		expect(budget.take()).toBe(true);
		expect(budget.take()).toBe(false);
	});
});

describe('handleWebSocketConnection (SM-3)', () => {
	it('rejects a disallowed origin', () => {
		const { id } = createGame({ time: 0 });
		const ws = connect(`/game/join?id=${id}`, 'https://evil.example', {
			...dev,
			NODE_ENV: 'production'
		} as typeof dev);
		expect(ws.closed?.code).toBe(1008);
	});

	it('uses the origin guard the server built once instead of re-parsing the env per handshake', () => {
		const { id } = createGame({ time: 0 });
		const seen: (string | undefined)[] = [];
		const guard = (origin: string | undefined) => {
			seen.push(origin);
			return origin === 'https://allowed.example';
		};
		const refused = new FakeSocket();
		handleWebSocketConnection(
			refused as unknown as WebSocket,
			req(`/game/join?id=${id}`, 'http://localhost:5173'),
			dev,
			guard
		);
		expect(refused.closed).toEqual({ code: 1008, reason: 'Origin not allowed' });
		const accepted = new FakeSocket();
		handleWebSocketConnection(
			accepted as unknown as WebSocket,
			req(`/game/join?id=${id}`, 'https://allowed.example'),
			dev,
			guard
		);
		expect(accepted.closed).toBeNull();
		expect(seen).toEqual(['http://localhost:5173', 'https://allowed.example']);
	});

	it('rejects an unknown room and a malformed URL without throwing', () => {
		expect(connect('/game/join?id=nope').closed?.code).toBe(1008);
		expect(connect('/game/join').closed?.code).toBe(1008);
		expect(connect('//%%').closed?.code).toBe(1008);
	});

	it('requires a join frame first', () => {
		const { id } = createGame({ time: 0 });
		const ws = connect(`/game/join?id=${id}`);
		ws.frame({ type: 'move', move: { from: 'e2', to: 'e4' } });
		expect(ws.closed?.code).toBe(1008);
	});

	it('rejects a bad token', () => {
		const { id } = createGame({ time: 0 });
		const ws = connect(`/game/join?id=${id}`);
		ws.frame({ type: 'join', token: 'wrong-token-1234567890' });
		expect(ws.closed?.code).toBe(1008);
	});

	it('seats the token holder in the server-assigned colour, ignoring any URL colour', () => {
		const { id, invite } = createGame({ time: 0, color: 'white' });
		const ws = connect(`/game/join?id=${id}&color=white`);
		ws.frame({ type: 'join', token: invite.token });
		expect(ws.closed).toBeNull();
		expect(ws.sent[0]).toMatchObject({ type: 'seat', color: 'black' });
	});

	it('closes a connection that floods messages', () => {
		const { id, you } = createGame({ time: 0 });
		const ws = connect(`/game/join?id=${id}`);
		ws.frame({ type: 'join', token: you.token });
		for (let i = 0; i < 50 && !ws.closed; i++) ws.frame({ type: 'resign' });
		expect(ws.closed?.code).toBe(1008);
	});
});

describe('end-to-end over a real socket', () => {
	const server = http.createServer();
	const wss = new WebSocketServer({ server, maxPayload: 4096 });
	wss.on('connection', (ws, r) => handleWebSocketConnection(ws, r, dev));
	afterAll(() => {
		wss.close();
		server.close();
	});

	it('joins with a token sent in the first frame (no secret in the URL)', async () => {
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const { port } = server.address() as AddressInfo;
		const { id, you } = createGame({ time: 0, color: 'black' });
		const client = new WebSocket(`ws://127.0.0.1:${port}/game/join?id=${id}`, {
			headers: { origin: 'http://localhost:5173' }
		});
		const first = await new Promise<Record<string, unknown>>((resolve, reject) => {
			client.on('open', () => client.send(JSON.stringify({ type: 'join', token: you.token })));
			client.on('message', (d) => resolve(JSON.parse(d.toString())));
			client.on('error', reject);
		});
		expect(first).toMatchObject({ type: 'seat', color: 'black' });
		client.close();
	});
});
