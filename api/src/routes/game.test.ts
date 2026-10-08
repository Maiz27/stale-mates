import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import app, { createApp } from '../app';

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

describe('trust proxy (CR-8, CR2-5)', () => {
	it('is configurable via TRUST_PROXY (default: none)', () => {
		expect(createApp({}).get('trust proxy')).toBe(0);
		expect(createApp({ TRUST_PROXY: '0' }).get('trust proxy')).toBe(0);
		expect(createApp({ TRUST_PROXY: '1' }).get('trust proxy')).toBe(1);
	});

	/** `req.ip` as the app resolves it for a request carrying a spoofed X-Forwarded-For. */
	async function ipSeenBy(env: Record<string, string>): Promise<string> {
		const probe = createApp(env);
		probe.get('/__ip', (req, res) => {
			res.send(req.ip);
		});
		const server = probe.listen(0);
		await new Promise<void>((resolve) => server.once('listening', () => resolve()));
		try {
			const { port } = server.address() as AddressInfo;
			const res = await fetch(`http://127.0.0.1:${port}/__ip`, {
				headers: { 'x-forwarded-for': '6.6.6.6' }
			});
			return await res.text();
		} finally {
			server.close();
		}
	}

	it('ignores X-Forwarded-For by default, so a client cannot spoof its IP', async () => {
		expect(await ipSeenBy({})).toMatch(/127\.0\.0\.1$/);
	});

	it('reads the client IP from X-Forwarded-For with TRUST_PROXY=1 (behind Fly)', async () => {
		expect(await ipSeenBy({ TRUST_PROXY: '1' })).toBe('6.6.6.6');
	});
});
