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
	difficulty: 10,
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

function loadSettings(): GameSettings {
	if (typeof localStorage !== 'undefined') {
		const storedSettings = localStorage.getItem('settings');
		return storedSettings ? JSON.parse(storedSettings) : defaultSettings;
	}
	return defaultSettings;
}

function saveSettings(settings: GameSettings) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('settings', JSON.stringify(settings));
	}
}

export const settingsStore = createSettingsStore();
