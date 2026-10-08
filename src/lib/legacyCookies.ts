/**
 * Cleanup for the pre-seat-token multiplayer version (CR3-8). It stored a
 * `<roomId>-playerId` cookie per room (js-cookie, path `/`) with an expiry of
 * ~14 million days, so those cookies would otherwise sit in returning players'
 * browsers — and ride along on every request to the site — forever. Nothing
 * reads them any more.
 */

/** Room ids were nanoids; the old cookie name was `${roomId}-playerId`. */
const LEGACY_COOKIE = /^[A-Za-z0-9_-]{1,64}-playerId$/;

/** The part of `document` this touches (lets tests pass a fake cookie jar). */
export type CookieJar = { cookie: string };

/** Expire every legacy `<roomId>-playerId` cookie. Returns how many were removed. */
export function sweepLegacyCookies(
	jar: CookieJar | undefined = typeof document === 'undefined' ? undefined : document
): number {
	if (!jar) return 0;
	let cookies: string;
	try {
		cookies = jar.cookie;
	} catch {
		return 0; // cookies disabled / sandboxed
	}
	let removed = 0;
	for (const part of cookies.split(';')) {
		const name = part.split('=')[0].trim();
		if (!LEGACY_COOKIE.test(name)) continue;
		jar.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
		removed++;
	}
	return removed;
}
