import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import app from '../app';

let server: http.Server;
let base = '';

beforeAll(async () => {
	server = http.createServer(app);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
	server.close();
});

const create = (body?: unknown, headers: Record<string, string> = {}) =>
	fetch(`${base}/game/create`, {
		method: 'POST',
		headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
		body: body === undefined ? undefined : JSON.stringify(body)
	});

describe('POST /game/create (Express 5)', () => {
	it('creates a room with server-assigned seats', async () => {
		const res = await create({ time: 3, color: 'black' });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.id).toEqual(expect.any(String));
		expect(body.you).toMatchObject({ color: 'black', token: expect.any(String) });
		expect(body.invite).toMatchObject({ color: 'white', token: expect.any(String) });
		expect(body.you.token).not.toBe(body.invite.token);
	});

	it('rejects bad time and colour values', async () => {
		expect((await create({ time: 5 })).status).toBe(400);
		expect((await create({ time: true })).status).toBe(400);
		expect((await create({ time: 1, color: 'red' })).status).toBe(400);
	});

	it('handles a request with no body (req.body is undefined in Express 5)', async () => {
		expect((await create()).status).toBe(400);
	});

	it('serves /health', async () => {
		const res = await fetch(`${base}/health`);
		expect(await res.json()).toMatchObject({ status: 'ok' });
	});
});
