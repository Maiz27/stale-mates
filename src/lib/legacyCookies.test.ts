import { describe, it, expect } from 'vitest';
import { sweepLegacyCookies, type CookieJar } from './legacyCookies';

/** A tiny `document.cookie` stand-in: reads "a=1; b=2", writes one cookie at a time. */
class FakeJar implements CookieJar {
	jar = new Map<string, string>();
	writes: string[] = [];
	get cookie() {
		return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
	}
	set cookie(value: string) {
		this.writes.push(value);
		const [pair, ...attrs] = value.split(';');
		const [name, v] = pair.split('=');
		const expired = attrs.some((a) => /expires=Thu, 01 Jan 1970/.test(a));
		if (expired) this.jar.delete(name.trim());
		else this.jar.set(name.trim(), v);
	}
}

describe('sweepLegacyCookies (CR3-8)', () => {
	it('expires every <roomId>-playerId cookie at path / and keeps the rest', () => {
		const jar = new FakeJar();
		jar.jar.set('V1StGXR8_Z5jdHi6B-myT-playerId', '%7B%22data%22%3A%22abc%22%7D');
		jar.jar.set('abc123-playerId', 'x');
		jar.jar.set('theme', 'dark');
		jar.jar.set('playerId', 'not-legacy');
		jar.jar.set('room-playerIdentity', 'other');

		expect(sweepLegacyCookies(jar)).toBe(2);
		expect([...jar.jar.keys()]).toEqual(['theme', 'playerId', 'room-playerIdentity']);
		expect(jar.writes.every((w) => w.includes('path=/'))).toBe(true);
	});

	it('is a no-op without cookies or a document', () => {
		expect(sweepLegacyCookies(new FakeJar())).toBe(0);
		expect(sweepLegacyCookies(undefined)).toBe(0);
	});

	it('survives a cookie jar that throws (sandboxed iframe)', () => {
		const jar = {
			get cookie(): string {
				throw new Error('SecurityError');
			},
			set cookie(_v: string) {}
		};
		expect(sweepLegacyCookies(jar)).toBe(0);
	});
});
