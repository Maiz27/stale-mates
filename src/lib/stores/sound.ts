import { writable } from 'svelte/store';

const KEY = 'stalemates:sound';

function initial(): boolean {
	try {
		return typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== 'off';
	} catch {
		return true;
	}
}

/** Global sound on/off, persisted per browser. AudioCue checks it before playing. */
export const soundEnabled = writable<boolean>(initial());

soundEnabled.subscribe((on) => {
	try {
		if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? 'on' : 'off');
	} catch {
		// storage unavailable — the toggle still works for this page
	}
});
