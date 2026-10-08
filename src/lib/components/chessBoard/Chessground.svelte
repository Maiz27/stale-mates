<script lang="ts">
	/**
	 * Minimal in-repo Svelte 5 wrapper around chessground 9 (replaces the
	 * Svelte-3-only `svelte-chessground`, which bundled chessground 8.4).
	 * Mounts the board once, re-applies `config` whenever the prop changes, and
	 * exposes the few API calls the board needs.
	 */
	import { onMount } from 'svelte';
	import { Chessground as createChessground } from 'chessground';
	import type { Api } from 'chessground/api';
	import type { Config } from 'chessground/config';
	import type { DrawShape } from 'chessground/draw';
	import 'chessground/assets/chessground.base.css';
	import 'chessground/assets/chessground.brown.css';
	import 'chessground/assets/chessground.cburnett.css';

	let { config }: { config: Config } = $props();

	let container: HTMLDivElement;
	// Raw: the chessground Api is a live object with its own internal state;
	// deep-proxying it would wrap every access for nothing (CR-11).
	let api = $state.raw<Api | undefined>(undefined);
	// The config object the board currently reflects (not reactive on purpose).
	let applied: Config | undefined;

	onMount(() => {
		applied = config;
		api = createChessground(container, config);
		return () => api?.destroy();
	});

	// Re-apply on every new config object (the parent rebuilds it only when a
	// board-relevant field changes). Skip the one the board was created with:
	// the effect also re-runs when `api` is first assigned, and re-applying the
	// initial config would just redo the work (and reset any drawn shapes).
	$effect(() => {
		const next = config;
		if (!api || next === applied) return;
		applied = next;
		api.set(next);
	});

	export function set(next: Config): void {
		api?.set(next);
	}

	export function getFen(): string {
		return api?.getFen() ?? '';
	}

	export function setAutoShapes(shapes: DrawShape[]): void {
		api?.setAutoShapes(shapes);
	}
</script>

<div bind:this={container} class="h-full w-full"></div>
