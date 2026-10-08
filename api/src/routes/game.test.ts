import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

describe('CORS allowlist (CR3-1, CR3-2)', () => {
	async function acao(env: Record<string, string>, origin: string): Promise<string | null> {
		const server = createApp(env).listen(0);
		await new Promise<void>((resolve) => server.once('listening', () => resolve()));
		try {
			const { port } = server.address() as AddressInfo;
			const res = await fetch(`http://127.0.0.1:${port}/game/create`, {
				method: 'OPTIONS',
				headers: { origin, 'access-control-request-method': 'POST' }
			});
			return res.headers.get('access-control-allow-origin');
		} finally {
			server.close();
		}
	}

	it('allows the normalised ORIGIN even when configured with a trailing slash', async () => {
		expect(await acao({ ORIGIN: 'https://a.example/' }, 'https://a.example')).toBe(
			'https://a.example'
		);
		expect(await acao({ ORIGIN: 'https://a.example/' }, 'https://evil.example')).toBeNull();
	});

	it('allows ORIGIN_PATTERNS matches only', async () => {
		const env = {
			ORIGIN: 'https://a.example',
			ORIGIN_PATTERNS: 'https://app-*-team.vercel.app'
		};
		const preview = 'https://app-git-x-team.vercel.app';
		expect(await acao(env, preview)).toBe(preview);
		expect(await acao(env, 'https://other-git-x-team.vercel.app')).toBeNull();
	});
});

describe('body parsing errors (CR3-5)', () => {
	const raw = (body: string) =>
		fetch(`${base}/game/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body
		});

	it('answers malformed JSON with 400 Invalid JSON and logs no stack trace', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const res = await raw('{bad');
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: 'Invalid JSON' });
			expect(error).not.toHaveBeenCalled();
		} finally {
			error.mockRestore();
		}
	});

	it('answers an oversized body with 413', async () => {
		const res = await raw(JSON.stringify({ time: 1, pad: 'x'.repeat(200_000) }));
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: 'Request body too large' });
	});
});
