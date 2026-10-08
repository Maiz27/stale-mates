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
	let api = $state<Api | undefined>(undefined);

	onMount(() => {
		api = createChessground(container, config);
		return () => api?.destroy();
	});

	// Re-apply on every new config object (the parent rebuilds it only when a
	// board-relevant field changes).
	$effect(() => {
		const next = config;
		api?.set(next);
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
