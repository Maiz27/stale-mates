/**
 * Seat credentials for multiplayer (audit C3 / SM-3, CR-5).
 *
 * The seat token is the only thing that lets a connection sit in a room. It is
 * kept in `localStorage`, keyed by room id, so closing the tab (or the browser)
 * and reopening the room URL resumes the seat. Two tabs holding the same seat
 * are fine: the newer connection takes over and the older tab shows "This game
 * is open somewhere else" (server close 4000).
 *
 * Entries carry the time they were last saved and expire after
 * {@link SEAT_TTL_MS} without use; expired entries are swept on every write.
 * Invite links carry the opponent's token in the URL *fragment* (`#seat=…`),
 * which browsers never send to any server.
 */

const SEAT_PREFIX = 'stalemates:seat:';
const INVITE_PREFIX = 'stalemates:invite:';
const seatKey = (roomId: string) => `${SEAT_PREFIX}${roomId}`;
const inviteKey = (roomId: string) => `${INVITE_PREFIX}${roomId}`;
/**
 * Only seat/invite entries are ours to sweep: other features share the
 * `stalemates:` namespace (`ai-game`, `sound`, `board-theme`) with values in
 * their own formats (CR2-1).
 */
const isSeatEntryKey = (key: string) =>
	key.startsWith(SEAT_PREFIX) || key.startsWith(INVITE_PREFIX);

/**
 * How long an unused seat is remembered. The server reaps a room
 * `ROOM_TTL_MS` (default 30 min) after its last activity with nobody connected;
 * this is comfortably longer, and it is refreshed while the room page is in use
 * (see {@link touchSeat}). A remembered seat for a room that has since been
 * reaped is harmless: the server refuses it and the entry is cleared.
 */
export const SEAT_TTL_MS = 2 * 60 * 60 * 1000;

type Entry = { token: string; savedAt: number };

function local(): Storage | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : null;
	} catch {
		return null;
	}
}

function parse(raw: string | null): Entry | null {
	if (!raw) return null;
	try {
		const entry = JSON.parse(raw) as Partial<Entry>;
		return typeof entry.token === 'string' && typeof entry.savedAt === 'number'
			? (entry as Entry)
			: null;
	} catch {
		return null;
	}
}

const fresh = (entry: Entry | null): entry is Entry =>
	entry !== null && Date.now() - entry.savedAt < SEAT_TTL_MS;

function read(key: string): string | null {
	try {
		const entry = parse(local()?.getItem(key) ?? null);
		if (fresh(entry)) return entry.token;
	} catch {
		// Storage disabled.
	}
	// Seats saved per tab by earlier versions.
	try {
		return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
	} catch {
		return null;
	}
}

/** Drop every stored seat/invite whose expiry has passed. */
function sweep(store: Storage): void {
	const stale: string[] = [];
	for (let i = 0; i < store.length; i++) {
		const key = store.key(i);
		if (key && isSeatEntryKey(key) && !fresh(parse(store.getItem(key)))) stale.push(key);
	}
	for (const key of stale) store.removeItem(key);
}

function write(key: string, token: string): void {
	try {
		const store = local();
		if (!store) return;
		sweep(store);
		store.setItem(key, JSON.stringify({ token, savedAt: Date.now() } satisfies Entry));
	} catch {
		// Storage disabled or full: the seat works until the page is closed.
	}
}

function remove(key: string): void {
	try {
		local()?.removeItem(key);
	} catch {
		// ignore
	}
	try {
		if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
	} catch {
		// ignore
	}
}

export const getSeatToken = (roomId: string) => read(seatKey(roomId));
export const setSeatToken = (roomId: string, token: string) => write(seatKey(roomId), token);
export const getInviteToken = (roomId: string) => read(inviteKey(roomId));
export const setInviteToken = (roomId: string, token: string) => write(inviteKey(roomId), token);

/** Refresh a room's seat (and invite) expiry while the room is in use. */
export function touchSeat(roomId: string): void {
	const seat = getSeatToken(roomId);
	if (seat) setSeatToken(roomId, seat);
	const invite = getInviteToken(roomId);
	if (invite) setInviteToken(roomId, invite);
}

/** Forget a room's seat and invite (e.g. the server says the room is gone). */
export function clearSeat(roomId: string): void {
	remove(seatKey(roomId));
	remove(inviteKey(roomId));
}

const ENDED_PREFIX = 'stalemates:ended:';

/**
 * How long this tab remembers that the server refused a room as gone
 * ({@link markRoomEnded}). Short: it only has to outlive a reload or two.
 */
export const ENDED_ROOM_TTL_MS = 30 * 60 * 1000;

function session(): Storage | null {
	try {
		return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
	} catch {
		return null;
	}
}

/**
 * Remember (in this tab, briefly) that the server said the room is gone or the
 * seat is dead. The seat itself is cleared at the same time, so without this a
 * reload of `/room?id=…` would claim the invite link is incomplete (CR3-7).
 */
export function markRoomEnded(roomId: string): void {
	try {
		session()?.setItem(`${ENDED_PREFIX}${roomId}`, String(Date.now()));
	} catch {
		// Storage disabled: a reload shows the generic missing-seat message.
	}
}

/** Whether this tab was recently told that `roomId` is gone (see {@link markRoomEnded}). */
export function wasRoomEnded(roomId: string): boolean {
	try {
		const store = session();
		const key = `${ENDED_PREFIX}${roomId}`;
		const at = Number(store?.getItem(key) ?? NaN);
		if (Number.isFinite(at) && Date.now() - at < ENDED_ROOM_TTL_MS) return true;
		store?.removeItem(key);
	} catch {
		// ignore
	}
	return false;
}

/** Forget an ended-room marker (the room let us in after all). */
export function clearRoomEnded(roomId: string): void {
	try {
		session()?.removeItem(`${ENDED_PREFIX}${roomId}`);
	} catch {
		// ignore
	}
}

/**
 * The token to join `roomId` with, given an invite-link token (`#seat=…`), if
 * any. A seat already held in this browser wins: the creator opening their own
 * invite link, or the joiner reopening the spent link, resumes their seat
 * instead of claiming the other one or being refused. Otherwise the invite
 * token is adopted (and stored).
 */
export function resolveSeatToken(roomId: string, fromInvite: string | null): string | null {
	const held = getSeatToken(roomId);
	if (held) return held;
	if (fromInvite) {
		setSeatToken(roomId, fromInvite);
		return fromInvite;
	}
	return null;
}

/** Extract a `#seat=<token>` fragment, if present. */
export function seatTokenFromHash(hash: string): string | null {
	const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
	const token = params.get('seat');
	return token && /^[A-Za-z0-9_-]{10,64}$/.test(token) ? token : null;
}

/** The shareable invite link for a room. */
export function inviteLink(origin: string, roomId: string, token: string): string {
	return `${origin}/room?id=${encodeURIComponent(roomId)}#seat=${encodeURIComponent(token)}`;
}
