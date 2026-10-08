import { writable } from 'svelte/store';
import type { Color } from 'chessground/types';

export type GameSettings = {
	color?: Color;
	difficulty: number;
	hints: boolean;
	undo: boolean;
};

const defaultSettings: GameSettings = {
	color: 'white',
	difficulty: 7,
	hints: true,
	undo: true
};

function createSettingsStore() {
	const { subscribe, set, update } = writable<GameSettings>(loadSettings());

	return {
		subscribe,
		update: (newSettings: Partial<GameSettings>) =>
			update((settings) => {
				const updatedSettings = { ...settings, ...newSettings };
				saveSettings(updatedSettings);
				return updatedSettings;
			}),
		reset: () => {
			set(defaultSettings);
			saveSettings(defaultSettings);
		}
	};
}

/**
 * Read persisted settings, falling back to the defaults for anything missing or
 * malformed. Corrupt JSON (or storage that throws, e.g. disabled in a private
 * window) must never break the app (SM-2.9).
 */
export function loadSettings(
	storage: Pick<Storage, 'getItem'> | undefined = safeStorage()
): GameSettings {
	if (!storage) return { ...defaultSettings };
	try {
		const raw = storage.getItem('settings');
		if (!raw) return { ...defaultSettings };
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return { ...defaultSettings };
		return {
			color: parsed.color === 'black' ? 'black' : 'white',
			difficulty:
				typeof parsed.difficulty === 'number' && parsed.difficulty >= 1 && parsed.difficulty <= 20
					? parsed.difficulty
					: defaultSettings.difficulty,
			hints: typeof parsed.hints === 'boolean' ? parsed.hints : defaultSettings.hints,
			undo: typeof parsed.undo === 'boolean' ? parsed.undo : defaultSettings.undo
		};
	} catch {
		return { ...defaultSettings };
	}
}

function safeStorage(): Storage | undefined {
	try {
		return typeof localStorage !== 'undefined' ? localStorage : undefined;
	} catch {
		return undefined;
	}
}

function saveSettings(settings: GameSettings) {
	try {
		safeStorage()?.setItem('settings', JSON.stringify(settings));
	} catch {
		// Storage full/disabled — settings just won't persist.
	}
}

export const settingsStore = createSettingsStore();
