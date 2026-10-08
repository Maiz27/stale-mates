<script lang="ts">
	import { untrack } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button/index.js';
	import DifficultySelector from '../controls/DifficultySelector.svelte';
	import ColorSelector from '../controls/ColorSelector.svelte';
	import type { GameSettings } from '$lib/stores/gameSettings';

	let {
		isGameStarted = false,
		settings,
		CTA = 'Start Game',
		onsubmit
	}: {
		isGameStarted?: boolean;
		settings: GameSettings;
		CTA?: string;
		onsubmit: (settings: GameSettings) => void;
	} = $props();

	// Edit a private copy taken when the form opens; the store only changes on
	// submit (SM-2.9 — the old form mutated $settingsStore in place).
	const draft = $state<GameSettings>(untrack(() => ({ ...settings })));

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onsubmit({ ...draft });
	}
</script>

<form onsubmit={handleSubmit} class="grid items-start gap-4 px-4 md:px-0">
	{#if !isGameStarted}
		<ColorSelector
			bind:value={() => draft.color ?? 'white', (v) => (draft.color = v as 'white' | 'black')}
		/>
	{/if}
	<DifficultySelector bind:value={draft.difficulty} />
	<div class="flex items-center gap-2">
		<Label for="hints">Allow Hints:</Label>
		<Switch id="hints" bind:checked={draft.hints} />
	</div>
	<div class="flex items-center gap-2">
		<Label for="undo">Allow Undo:</Label>
		<Switch id="undo" bind:checked={draft.undo} />
	</div>
	<Button type="submit">{CTA}</Button>
</form>
