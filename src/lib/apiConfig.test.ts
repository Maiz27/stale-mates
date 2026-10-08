import { describe, it, expect } from 'vitest';
import { DEV_API_URL, resolveApiUrls } from './apiConfig';

describe('resolveApiUrls (CR2-2)', () => {
	it('uses the configured URLs, without trailing slashes', () => {
		expect(
			resolveApiUrls({
				VITE_API_URL: 'https://api.example.com/',
				VITE_API_WS_URL: 'wss://ws.example.com/',
				DEV: false
			})
		).toEqual({ http: 'https://api.example.com', ws: 'wss://ws.example.com' });
	});

	it('derives the WebSocket URL from the HTTP one when only that is set', () => {
		expect(resolveApiUrls({ VITE_API_URL: 'https://api.example.com' }).ws).toBe(
			'wss://api.example.com'
		);
		expect(resolveApiUrls({ VITE_API_URL: 'http://localhost:3000' }).ws).toBe(
			'ws://localhost:3000'
		);
	});

	it('falls back to the local API in dev when nothing is set', () => {
		expect(resolveApiUrls({ DEV: true })).toEqual({
			http: DEV_API_URL,
			ws: 'ws://localhost:3000'
		});
		expect(resolveApiUrls({ VITE_API_URL: ' ', VITE_API_WS_URL: '', DEV: true }).http).toBe(
			DEV_API_URL
		);
	});

	it('reports "not configured" in a production build with nothing set (never "undefined")', () => {
		expect(resolveApiUrls({ DEV: false })).toEqual({ http: null, ws: null });
	});
});
