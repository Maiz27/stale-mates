/**
 * The browser-origin allowlist shared by CORS (app.ts) and the WebSocket
 * `Origin` check (websocket.ts), so the two can never disagree (CR3-1).
 *
 * - `ORIGIN`: comma-separated exact origins. Each entry is parsed with `new URL`
 *   and normalised to its `.origin` (scheme + host + non-default port), so
 *   `https://site/`, `HTTPS://Site` and ` https://site ` all mean the origin a
 *   browser sends, `https://site`. An entry with a path, query, fragment or
 *   credentials, or a non-http(s) scheme, is a configuration error: it could
 *   never match a browser `Origin` header and would silently disable
 *   multiplayer, so the server refuses to start instead.
 * - `ORIGIN_PATTERNS` (optional, opt-in, CR3-2): comma-separated https host
 *   patterns for per-deploy preview URLs, e.g.
 *   `https://stale-mates-*-maiz27s-projects.vercel.app`. The single `*` must sit
 *   in the first host label after a non-empty literal prefix and matches one or
 *   more of `[a-z0-9-]` (never a dot), and the fixed domain after that label
 *   must have at least two labels. So `https://*.vercel.app` (anyone's app) and
 *   `https://x-*.com` (any domain) are rejected at startup.
 *
 *   On a shared hosting suffix such as `vercel.app` a pattern is only a soft
 *   guard: anyone can create a project there whose name makes `<name>.vercel.app`
 *   match it (project names are free-form `[a-z0-9-]`), so the server logs a
 *   warning for such patterns at startup (see `originWarnings`). Only a domain
 *   you control (a custom preview domain) is a hard boundary.
 */

export interface OriginEnv {
	ORIGIN?: string;
	ORIGIN_PATTERNS?: string;
}

/** Used when `ORIGIN` is unset (local development). */
export const DEFAULT_ORIGIN = 'http://localhost:5173';

/** A parsed `ORIGIN_PATTERNS` entry. */
export interface OriginPattern {
	/** The entry as configured (for logs). */
	source: string;
	/** Matches a whole `URL.host` (lowercase, no port). */
	regex: RegExp;
	/** The fixed domain after the wildcard label, e.g. `vercel.app`. */
	domain: string;
}

export interface ParsedOrigins {
	origins: string[];
	patterns: OriginPattern[];
	errors: string[];
}

const entries = (raw: string | undefined): string[] =>
	(raw ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);

/** Normalise one `ORIGIN` entry, or explain why it can't be an origin. */
export function parseOrigin(entry: string): { origin: string } | { error: string } {
	let url: URL;
	try {
		url = new URL(entry);
	} catch {
		return {
			error: `ORIGIN entry "${entry}" is not a valid URL (expected e.g. https://example.com)`
		};
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return { error: `ORIGIN entry "${entry}" must use http:// or https://` };
	}
	if (url.username || url.password) {
		return { error: `ORIGIN entry "${entry}" must not contain credentials` };
	}
	if (
		url.pathname !== '/' ||
		url.search ||
		url.hash ||
		entry.includes('?') ||
		entry.includes('#')
	) {
		return {
			error: `ORIGIN entry "${entry}" must be a bare origin (scheme://host[:port]) without a path, query or fragment`
		};
	}
	return { origin: url.origin };
}

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parse one `ORIGIN_PATTERNS` entry, or explain why it is unsafe/invalid. */
export function parseOriginPattern(entry: string): { pattern: OriginPattern } | { error: string } {
	const fail = (why: string) => ({ error: `ORIGIN_PATTERNS entry "${entry}" ${why}` });
	const match = /^https:\/\/([^/?#:@]+)\/?$/i.exec(entry);
	if (!match) {
		return fail(
			'must look like https://<prefix>*<rest>.<domain>.<tld> (https only, no port or path)'
		);
	}
	const host = match[1].toLowerCase();
	if ((host.match(/\*/g) ?? []).length !== 1) return fail('must contain exactly one "*"');
	const [first, ...domain] = host.split('.');
	if (!first.includes('*')) return fail('may only use "*" in the first host label');
	const [prefix, suffix] = first.split('*');
	if (!prefix) {
		return fail(
			'needs a literal prefix before "*" (e.g. https://myapp-*.example.com) so it cannot match other projects'
		);
	}
	if (!/^[a-z0-9][a-z0-9-]*$/.test(prefix) || !/^[a-z0-9-]*$/.test(suffix)) {
		return fail('has invalid characters in its first label');
	}
	if (domain.length < 2 || !domain.every((label) => LABEL.test(label))) {
		return fail('needs a fixed domain of at least two labels after the wildcard label');
	}
	const regex = new RegExp(
		`^${escape(prefix)}[a-z0-9-]+${escape(suffix)}\\.${escape(domain.join('.'))}$`
	);
	return { pattern: { source: entry, regex, domain: domain.join('.') } };
}

/** Parse `ORIGIN` / `ORIGIN_PATTERNS`, collecting every problem. */
export function parseOrigins(env: OriginEnv): ParsedOrigins {
	const origins: string[] = [];
	const patterns: OriginPattern[] = [];
	const errors: string[] = [];
	const rawOrigins = entries(env.ORIGIN);
	for (const entry of rawOrigins.length ? rawOrigins : [DEFAULT_ORIGIN]) {
		const parsed = parseOrigin(entry);
		if ('error' in parsed) errors.push(parsed.error);
		else if (!origins.includes(parsed.origin)) origins.push(parsed.origin);
	}
	for (const entry of entries(env.ORIGIN_PATTERNS)) {
		const parsed = parseOriginPattern(entry);
		if ('error' in parsed) errors.push(parsed.error);
		else patterns.push(parsed.pattern);
	}
	return { origins, patterns, errors };
}

/** The normalised exact origins (invalid entries dropped; startup validation rejects them). */
export function allowedOrigins(env: OriginEnv): string[] {
	return parseOrigins(env).origins;
}

/** A predicate for a request's `Origin` header against the configured allowlist. */
export function originMatcher(env: OriginEnv): (origin: string | undefined) => boolean {
	const { origins, patterns } = parseOrigins(env);
	return (origin) => {
		if (!origin) return false;
		if (origins.includes(origin)) return true;
		if (!patterns.length) return false;
		let url: URL;
		try {
			url = new URL(origin);
		} catch {
			return false;
		}
		// Browsers send a bare, lowercase origin; anything else is not one.
		if (url.protocol !== 'https:' || url.port || url.origin !== origin) return false;
		return patterns.some((p) => p.regex.test(url.hostname));
	};
}

/**
 * Public suffixes where anyone can register a subdomain by naming a project:
 * an `ORIGIN_PATTERNS` entry directly under one of them can be matched by
 * someone else's deployment.
 */
export const SHARED_HOSTING_SUFFIXES = [
	'vercel.app',
	'netlify.app',
	'pages.dev',
	'fly.dev',
	'onrender.com',
	'herokuapp.com',
	'github.io',
	'web.app',
	'firebaseapp.com',
	'workers.dev',
	'deno.dev',
	'railway.app',
	'surge.sh',
	'glitch.me'
];

/**
 * Startup warnings for the parsed allowlist: each pattern whose fixed domain is
 * a shared hosting suffix only keeps other projects out as long as nobody
 * picks a matching project name, which anyone can.
 */
export function originWarnings(env: OriginEnv): string[] {
	return parseOrigins(env)
		.patterns.filter((p) => SHARED_HOSTING_SUFFIXES.includes(p.domain))
		.map(
			(p) =>
				`ORIGIN_PATTERNS entry "${p.source}" is on the shared domain ${p.domain}: anyone can create a project there whose URL matches it, so it is only a soft guard. Prefer leaving VITE_API_URL unset for previews, or a preview domain you control.`
		);
}

/** One line for the startup log. */
export function describeOrigins(env: OriginEnv): string {
	const { origins, patterns } = parseOrigins(env);
	const list = origins.join(', ');
	return patterns.length
		? `Allowed origins: ${list}; patterns: ${patterns.map((p) => p.source).join(', ')}`
		: `Allowed origins: ${list}`;
}
