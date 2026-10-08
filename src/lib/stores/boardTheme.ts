import { writable } from 'svelte/store';

export const BOARD_THEMES = [
	{ value: 'brown', label: 'Brown' },
	{ value: 'green', label: 'Green' },
	{ value: 'blue', label: 'Blue' },
	{ value: 'gray', label: 'Gray' }
] as const;

export type BoardTheme = (typeof BOARD_THEMES)[number]['value'];

const KEY = 'stalemates:board-theme';
const isTheme = (v: unknown): v is BoardTheme => BOARD_THEMES.some((t) => t.value === v);

function initial(): BoardTheme {
	try {
		const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
		return isTheme(saved) ? saved : 'brown';
	} catch {
		return 'brown';
	}
}

/** Selected board colour scheme, persisted per browser. */
export const boardTheme = writable<BoardTheme>(initial());

boardTheme.subscribe((theme) => {
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, theme);
	} catch {
		// storage unavailable
	}
});
