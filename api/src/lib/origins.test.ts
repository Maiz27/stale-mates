import { describe, it, expect } from 'vitest';
import {
	allowedOrigins,
	describeOrigins,
	originMatcher,
	parseOriginPattern,
	parseOrigins
} from './origins';
import { validateEnv } from './env';
import { isOriginAllowed } from './websocket';

describe('ORIGIN parsing (CR3-1)', () => {
	it('normalises entries to the origin a browser sends', () => {
		expect(
			allowedOrigins({
				ORIGIN: ' https://Site.Example/ ,http://localhost:5173, https://site.example:443'
			})
		).toEqual(['https://site.example', 'http://localhost:5173']);
		expect(allowedOrigins({ ORIGIN: 'https://a.example:8443' })).toEqual([
			'https://a.example:8443'
		]);
	});

	it('defaults to the Vite dev server origin when unset or blank', () => {
		expect(allowedOrigins({})).toEqual(['http://localhost:5173']);
		expect(allowedOrigins({ ORIGIN: ' , ' })).toEqual(['http://localhost:5173']);
	});

	it.each([
		['https://site.example/app', 'path'],
		['https://site.example/?x=1', 'query'],
		['https://site.example/#top', 'fragment'],
		['site.example', 'valid URL'],
		['localhost:5173', 'http'],
		['ftp://site.example', 'http'],
		['https://user:pw@site.example', 'credentials'],
		['not a url', 'valid URL']
	])('rejects %s with a clear error', (entry, hint) => {
		const { errors } = parseOrigins({ ORIGIN: entry });
		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain(entry);
		expect(errors[0]).toMatch(new RegExp(hint, 'i'));
	});

	it('fails startup validation for a bad entry', () => {
		const result = validateEnv({
			NODE_ENV: 'production',
			ORIGIN: 'https://ok.example,https://x/y'
		});
		expect(result.ok).toBe(false);
		expect(result.errors.join('\n')).toContain('https://x/y');
		expect(validateEnv({ NODE_ENV: 'production', ORIGIN: 'https://ok.example/' }).ok).toBe(true);
	});

	it('a trailing slash in ORIGIN no longer locks out the real browser origin (WS + CORS share it)', () => {
		const env = { NODE_ENV: 'production', ORIGIN: 'https://stalemates.example/' };
		expect(isOriginAllowed('https://stalemates.example', env)).toBe(true);
		expect(originMatcher(env)('https://stalemates.example')).toBe(true);
		expect(isOriginAllowed('https://stalemates.example.evil', env)).toBe(false);
	});

	it('describes the parsed allowlist for the startup log', () => {
		expect(describeOrigins({ ORIGIN: 'https://a.example/' })).toBe(
			'Allowed origins: https://a.example'
		);
		expect(
			describeOrigins({
				ORIGIN: 'https://a.example',
				ORIGIN_PATTERNS: 'https://app-*-team.vercel.app'
			})
		).toBe('Allowed origins: https://a.example; patterns: https://app-*-team.vercel.app');
	});
});

describe('ORIGIN_PATTERNS (CR3-2)', () => {
	const env = {
		NODE_ENV: 'production',
		ORIGIN: 'https://stalemates.example',
		ORIGIN_PATTERNS: 'https://stale-mates-*-maiz27s-projects.vercel.app'
	};
	const allowed = originMatcher(env);

	it('matches this project’s preview deployments', () => {
		expect(allowed('https://stale-mates-git-feature-x-maiz27s-projects.vercel.app')).toBe(true);
		expect(allowed('https://stale-mates-a1b2c3d4e-maiz27s-projects.vercel.app')).toBe(true);
		expect(isOriginAllowed('https://stale-mates-a1b2c3d4e-maiz27s-projects.vercel.app', env)).toBe(
			true
		);
		// The exact production list is unchanged.
		expect(allowed('https://stalemates.example')).toBe(true);
	});

	it('does not match anything outside the pattern', () => {
		for (const origin of [
			'https://other-app-maiz27s-projects.vercel.app',
			'https://stale-mates--maiz27s-projects.vercel.app.evil.example',
			'https://stale-mates-x.y-maiz27s-projects.vercel.app',
			'https://evil.stale-mates-x-maiz27s-projects.vercel.app',
			'http://stale-mates-x-maiz27s-projects.vercel.app',
			'https://stale-mates-x-maiz27s-projects.vercel.app:8443',
			'https://stale-mates-maiz27s-projects.vercel.app',
			'https://stale-mates-x-maiz27s-projects.vercel.app/',
			'null',
			undefined
		]) {
			expect(allowed(origin), String(origin)).toBe(false);
		}
	});

	it('is opt-in: without it previews stay refused', () => {
		const prod = { NODE_ENV: 'production', ORIGIN: 'https://stalemates.example' };
		expect(isOriginAllowed('https://stale-mates-x-maiz27s-projects.vercel.app', prod)).toBe(false);
	});

	it.each([
		'https://*.vercel.app',
		'https://*-maiz27s-projects.vercel.app',
		'https://stale-mates-*.app',
		'http://stale-mates-*-team.vercel.app',
		'https://stale-mates-*-*-team.vercel.app',
		'https://stale-mates.*.vercel.app',
		'https://stale-mates-*-team.vercel.app/path',
		'https://stale-mates-*-team.vercel.app:443',
		'https://stale-mates-x-team.vercel.app',
		'stale-mates-*-team.vercel.app'
	])('rejects the unsafe or malformed pattern %s at startup', (pattern) => {
		expect('error' in parseOriginPattern(pattern)).toBe(true);
		expect(validateEnv({ ORIGIN_PATTERNS: pattern }).ok).toBe(false);
	});

	it('accepts a project-scoped pattern', () => {
		expect(validateEnv(env)).toEqual({ ok: true, errors: [] });
		expect('pattern' in parseOriginPattern('https://myapp-*.example.com')).toBe(true);
	});
});
