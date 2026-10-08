import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { createWebSocketServer } from './websocket';
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
