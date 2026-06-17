import { MOVE_AUDIOS_PATHS } from '../constants';
import type { MoveType } from './types';

/**
 * Owns the per-cue HTMLAudioElements and plays them. Browser-only (constructs
 * `Audio`). Injected into a game mode rather than baked into the base class, so
 * the rules core stays pure and the audio can be torn down on `destroy()`.
 */
export class AudioCue {
	private files: Partial<Record<MoveType, HTMLAudioElement>> = {};

	constructor() {
		Object.entries(MOVE_AUDIOS_PATHS).forEach(([key, path]) => {
			const audio = new Audio(path);
			audio.load();
			audio.volume = 0.9;
			this.files[key as MoveType] = audio;
		});
	}

	async play(moveType: MoveType): Promise<void> {
		const audio = this.files[moveType];
		if (!audio) return;
		try {
			await audio.play();
		} catch (error) {
			console.error('Audio playback failed:', error);
		}
	}

	/** Best-effort cleanup so the HTMLAudioElements can be GC'd. */
	destroy(): void {
		Object.keys(this.files).forEach((key) => {
			const audio = this.files[key as MoveType];
			if (audio) {
				try {
					audio.pause();
					audio.src = '';
				} catch {
					// best-effort cleanup; ignore failures
				}
			}
			delete this.files[key as MoveType];
		});
	}
}
