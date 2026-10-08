import WebSocket, { WebSocketServer } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'http';
import { URL } from 'url';
import { getGameRoom, removePlayerFromGame } from './game';
import { parseClientMessage } from './validate';
import type { Player } from './types';

/** How long a socket may stay open without presenting a seat token. */
export const JOIN_TIMEOUT_MS = 10_000;

export interface ConnectionEnv {
	ORIGIN?: string;
	NODE_ENV?: string;
}

/**
 * Cross-site WebSocket hijacking guard (audit SM-3). Browsers always send
 * `Origin` on a WS handshake and CORS does not apply to WebSockets, so the
 * server must check it itself. Allowed origins come from `ORIGIN` (comma
 * separated, shared with CORS). Outside production any localhost origin and
 * origin-less (non-browser) clients are also allowed, so local dev just works.
 */
export function isOriginAllowed(origin: string | undefined, env: ConnectionEnv): boolean {
	const allowed = (env.ORIGIN || 'http://localhost:5173')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean);
	if (origin && allowed.includes(origin)) return true;
	if (env.NODE_ENV === 'production') return false;
	if (!origin) return true;
	try {
		const { hostname } = new URL(origin);
		return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
	} catch {
		return false;
	}
}

/**
 * Per-connection token bucket (audit SM-3). A legitimate client sends a handful
 * of frames per move; anything faster is abuse, and the socket is closed.
 */
export class MessageBudget {
	private tokens: number;
	private last: number;
	constructor(
		private readonly capacity = 20,
		private readonly refillPerSecond = 5,
		private readonly now: () => number = Date.now
	) {
		this.tokens = capacity;
		this.last = now();
	}
	take(): boolean {
		const t = this.now();
		this.tokens = Math.min(
			this.capacity,
			this.tokens + ((t - this.last) / 1000) * this.refillPerSecond
		);
		this.last = t;
		if (this.tokens < 1) return false;
		this.tokens -= 1;
		return true;
	}
}

/**
 * Connection lifecycle:
 *   1. Origin + room id are checked on the handshake (`?id=` carries no secret).
 *   2. The first frame must be `{type:'join', token}`; the token picks the seat
 *      (colour is never taken from the client). Reconnects present the rotated
 *      token the server returned in `seat`. No secret ever appears in a URL.
 *   3. Every later frame is validated (validate.ts) and rate-limited.
 */
export function handleWebSocketConnection(
	ws: WebSocket,
	req: IncomingMessage,
	env: ConnectionEnv = process.env
) {
	// Registered first: `ws` emits 'error' for protocol violations (a frame over
	// maxPayload, a bad opcode, invalid UTF-8...) and an EventEmitter 'error'
	// with no listener throws, i.e. an uncaughtException (CR-2).
	ws.on('error', (error) => onSocketError(ws, error));
	trackHeartbeat(ws);

	try {
		if (!isOriginAllowed(req.headers.origin, env)) {
			closeConnection(ws, 1008, 'Origin not allowed');
			return;
		}

		const id = parseRoomId(req.url);
		if (!id || !getGameRoom(id)) {
			closeConnection(ws, 1008, 'Invalid game room');
			return;
		}

		const budget = new MessageBudget();
		let player: Player | null = null;
		const joinTimer = setTimeout(() => {
			if (!player) closeConnection(ws, 1008, 'Join timeout');
		}, JOIN_TIMEOUT_MS);
		joinTimer.unref?.();

		ws.on('message', (raw: WebSocket.RawData) => {
			try {
				if (!budget.take()) {
					closeConnection(ws, 1008, 'Rate limit exceeded');
					return;
				}
				const message = parseClientMessage(raw);
				if (!player) {
					if (!message || message.type !== 'join') {
						closeConnection(ws, 1008, 'Expected join');
						return;
					}
					clearTimeout(joinTimer);
					const room = getGameRoom(id);
					player = room ? room.claimSeat(message.token, ws) : null;
					if (!player) closeConnection(ws, 1008, 'Unable to join game');
					return;
				}
				// Malformed / unknown frames are dropped (never forwarded).
				if (!message || message.type === 'join') return;
				getGameRoom(id)?.handleMessage(player.id, message);
			} catch (error) {
				console.error('Error handling player message:', error);
			}
		});

		ws.on('close', () => {
			clearTimeout(joinTimer);
			// Pass the socket so a late close from a replaced socket is ignored (audit SM-1.1).
			if (player) removePlayerFromGame(id, player.id, ws);
		});
	} catch (error) {
		console.error('Error handling WebSocket connection:', error);
		closeConnection(ws, 1011, 'Internal server error');
	}
}

/**
 * A socket-level error. For protocol errors `ws` has already sent the matching
 * close frame (e.g. 1009 for an oversized frame) before emitting, so the socket
 * is torn down here; its 'close' event then runs the normal disconnect path.
 */
export function onSocketError(ws: WebSocket, error: Error & { code?: string }) {
	console.warn(`WebSocket error${error.code ? ` (${error.code})` : ''}: ${error.message}`);
	ws.terminate();
}

export interface WebSocketServerOptions {
	/** Largest accepted frame, in bytes; bigger frames are refused with 1009. */
	maxPayload?: number;
	env?: ConnectionEnv;
	/** Heartbeat interval; 0 disables it (tests). */
	heartbeatMs?: number;
}

/**
 * The game WebSocket server attached to an HTTP server: connection handling,
 * server-level error logging and the heartbeat. Used by index.ts and the tests.
 */
export function createWebSocketServer(
	server: HttpServer,
	{ maxPayload = 4096, env = process.env, heartbeatMs = 30_000 }: WebSocketServerOptions = {}
): WebSocketServer {
	// maxPayload: the largest legitimate frame is a ~100-byte move/join; anything
	// bigger is abuse and is refused by `ws` itself (close 1009) before parsing.
	const wss = new WebSocketServer({ server, maxPayload });
	// Server-level errors (e.g. the underlying HTTP server failing to listen) are
	// re-emitted here; without a listener they would be thrown.
	wss.on('error', (error) => console.error('WebSocket server error:', error));
	wss.on('connection', (ws, req) => handleWebSocketConnection(ws, req, env));
	if (heartbeatMs > 0) startHeartbeat(wss, heartbeatMs);
	return wss;
}

// Sockets that answered the last heartbeat ping. A socket missing from this set
// when the next ping goes out never ponged: it's a dead TCP path (laptop lid,
// mobile network switch) that would otherwise look "connected" for minutes.
const alive = new WeakSet<WebSocket>();

/** Track liveness for a socket; call once per accepted connection. */
export function trackHeartbeat(ws: WebSocket) {
	alive.add(ws);
	ws.on('pong', () => alive.add(ws));
}

/**
 * One heartbeat round: terminate sockets that missed the previous ping (their
 * `close` then fires and the room marks the player disconnected), and ping the
 * rest. Exported for tests.
 */
export function heartbeatTick(clients: Iterable<WebSocket>) {
	for (const ws of clients) {
		if (!alive.has(ws)) {
			ws.terminate();
			continue;
		}
		alive.delete(ws);
		try {
			ws.ping();
		} catch {
			ws.terminate();
		}
	}
}

/** Start the periodic heartbeat for a server. Returns the (unref'd) timer. */
export function startHeartbeat(
	wss: WebSocket.Server,
	intervalMs = 30_000
): ReturnType<typeof setInterval> {
	const timer = setInterval(() => heartbeatTick(wss.clients), intervalMs);
	timer.unref();
	wss.on('close', () => clearInterval(timer));
	return timer;
}

/** The room id from `?id=`, or null for a missing id or an unparseable URL. */
export function parseRoomId(rawUrl: string | undefined): string | null {
	try {
		return new URL(rawUrl ?? '/', 'http://localhost').searchParams.get('id');
	} catch {
		return null;
	}
}

function closeConnection(ws: WebSocket, code: number, reason: string) {
	try {
		ws.close(code, reason);
	} catch {
		// already closing
	}
}
