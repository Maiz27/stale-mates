/**
 * Per-tab seat credentials for multiplayer (audit C3 / SM-3).
 *
 * The seat token is the only thing that lets a connection sit in a room, so it
 * is kept in `sessionStorage` — scoped to one tab — rather than a cookie shared
 * by every tab (two tabs used to fight over one seat). A reload in the same tab
 * keeps it; a new tab does not. Invite links carry the opponent's token in the
 * URL *fragment* (`#seat=…`), which browsers never send to any server.
 */

const seatKey = (roomId: string) => `stalemates:seat:${roomId}`;
const inviteKey = (roomId: string) => `stalemates:invite:${roomId}`;

function storage(): Storage | null {
	try {
		return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
	} catch {
		return null;
	}
}

function read(key: string): string | null {
	try {
		return storage()?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		storage()?.setItem(key, value);
	} catch {
		// Storage disabled: the seat works until the tab reloads.
	}
}

export const getSeatToken = (roomId: string) => read(seatKey(roomId));
export const setSeatToken = (roomId: string, token: string) => write(seatKey(roomId), token);
export const getInviteToken = (roomId: string) => read(inviteKey(roomId));
export const setInviteToken = (roomId: string, token: string) => write(inviteKey(roomId), token);

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
