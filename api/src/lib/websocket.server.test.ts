import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { clientIp, createWebSocketServer } from './websocket';
import { createGame } from './game';

const dev = { ORIGIN: 'http://localhost:5173' };

describe('oversized frames (CR-2)', () => {
	const server = http.createServer();
	const wss = createWebSocketServer(server, { maxPayload: 4096, env: dev, heartbeatMs: 0 });
	let port = 0;
	beforeAll(async () => {
		await new Promise<void>((resolve) => server.listen(0, resolve));
		port = (server.address() as AddressInfo).port;
	});
	afterAll(() => {
		wss.close();
		server.close();
	});

	it('closes the socket with 1009 and raises no uncaughtException', async () => {
		const uncaught = vi.fn();
		process.on('uncaughtException', uncaught);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const { id, you } = createGame({ time: 0 });
			const client = new WebSocket(`ws://127.0.0.1:${port}/game/join?id=${id}`, {
				headers: { origin: 'http://localhost:5173' }
			});
			client.on('error', () => {});
			await new Promise<void>((resolve) => client.on('open', () => resolve()));
			client.send(JSON.stringify({ type: 'join', token: you.token }));
			const closed = new Promise<number>((resolve) => client.on('close', (code) => resolve(code)));
			client.send(JSON.stringify({ type: 'move', move: { from: 'a'.repeat(5000), to: 'b' } }));
			expect(await closed).toBe(1009);
			// Let any deferred emit run before asserting.
			await new Promise((r) => setTimeout(r, 50));
			expect(uncaught).not.toHaveBeenCalled();
		} finally {
			process.off('uncaughtException', uncaught);
			warn.mockRestore();
		}
	});
});

describe('clientIp (CR-8)', () => {
	const req = (remoteAddress: string, xff?: string) =>
		({
			socket: { remoteAddress },
			headers: xff === undefined ? {} : { 'x-forwarded-for': xff }
		}) as unknown as IncomingMessage;

	it('uses the socket address when no proxy is trusted', () => {
		expect(clientIp(req('10.0.0.1', '1.2.3.4'), 0)).toBe('10.0.0.1');
	});

	it('takes the n-th hop from the right when n proxies are trusted', () => {
		expect(clientIp(req('10.0.0.1', '1.2.3.4'), 1)).toBe('1.2.3.4');
		// A client-supplied (spoofed) left-most entry is ignored with one trusted hop.
		expect(clientIp(req('10.0.0.1', '6.6.6.6, 1.2.3.4'), 1)).toBe('1.2.3.4');
		expect(clientIp(req('10.0.0.1', '6.6.6.6, 1.2.3.4'), 2)).toBe('6.6.6.6');
	});

	it('falls back to the furthest address it has', () => {
		expect(clientIp(req('10.0.0.1'), 1)).toBe('10.0.0.1');
		expect(clientIp(req('10.0.0.1', '1.2.3.4'), 5)).toBe('1.2.3.4');
	});
});

describe('per-IP connection cap (CR-8)', () => {
	const server = http.createServer();
	const wss = createWebSocketServer(server, {
		env: dev,
		heartbeatMs: 0,
		maxConnectionsPerIp: 2,
		trustProxyHops: 0
	});
	let port = 0;
	beforeAll(async () => {
		await new Promise<void>((resolve) => server.listen(0, resolve));
		port = (server.address() as AddressInfo).port;
	});
	afterAll(() => {
		wss.close();
		server.close();
	});

	const open = async () => {
		const { id } = createGame({ time: 0 });
		const ws = new WebSocket(`ws://127.0.0.1:${port}/game/join?id=${id}`, {
			headers: { origin: 'http://localhost:5173' }
		});
		ws.on('error', () => {});
		const closed = new Promise<{ code: number; reason: string }>((resolve) =>
			ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
		);
		await new Promise<void>((resolve) => ws.on('open', () => resolve()));
		return { ws, closed };
	};

	it('refuses connections over the cap with 1013 and frees a slot on close', async () => {
		const a = await open();
		const b = await open();
		const c = await open();
		expect(await c.closed).toEqual({ code: 1013, reason: 'Too many connections' });

		a.ws.close();
		await a.closed;
		const d = await open();
		const stillOpen = await Promise.race([
			d.closed.then(() => false),
			new Promise<boolean>((r) => setTimeout(() => r(true), 100))
		]);
		expect(stillOpen).toBe(true);
		b.ws.close();
		d.ws.close();
	});
});

describe('TRUST_PROXY default for WebSockets (CR2-5)', () => {
	const servers: { server: http.Server; wss: ReturnType<typeof createWebSocketServer> }[] = [];
	afterAll(() => {
		for (const { server, wss } of servers) {
			wss.close();
			server.close();
		}
	});

	async function start(options: { trustProxyHops?: number }) {
		const server = http.createServer();
		// `trustProxyHops` omitted = the env default (TRUST_PROXY is unset in tests).
		const wss = createWebSocketServer(server, {
			env: dev,
			heartbeatMs: 0,
			maxConnectionsPerIp: 1,
			...options
		});
		servers.push({ server, wss });
		await new Promise<void>((resolve) => server.listen(0, resolve));
		return (server.address() as AddressInfo).port;
	}

	/** Open a socket claiming `xff`; resolves with its close code, or 'open' if it stays up. */
	async function connect(port: number, xff: string) {
		const { id } = createGame({ time: 0 });
		const ws = new WebSocket(`ws://127.0.0.1:${port}/game/join?id=${id}`, {
			headers: { origin: 'http://localhost:5173', 'x-forwarded-for': xff }
		});
		ws.on('error', () => {});
		const outcome = await Promise.race([
			new Promise<number>((resolve) => ws.on('close', (code) => resolve(code))),
			new Promise<'open'>((resolve) => setTimeout(() => resolve('open'), 150))
		]);
		return { ws, outcome };
	}

	it('ignores X-Forwarded-For by default: spoofed addresses share one per-IP budget', async () => {
		const port = await start({});
		const a = await connect(port, '1.1.1.1');
		const b = await connect(port, '2.2.2.2');
		expect(a.outcome).toBe('open');
		expect(b.outcome).toBe(1013);
		a.ws.close();
	});

	it('honours X-Forwarded-For when one proxy hop is trusted', async () => {
		const port = await start({ trustProxyHops: 1 });
		const a = await connect(port, '1.1.1.1');
		const b = await connect(port, '2.2.2.2');
		expect(a.outcome).toBe('open');
		expect(b.outcome).toBe('open');
		a.ws.close();
		b.ws.close();
	});
});
