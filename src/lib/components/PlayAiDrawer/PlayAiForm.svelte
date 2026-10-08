<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button/index.js';
	import DifficultySelector from '../controls/DifficultySelector.svelte';
	import ColorSelector from '../controls/ColorSelector.svelte';
	import type { GameSettings } from '$lib/stores/gameSettings';

	export let isGameStarted = false;
	export let settings: GameSettings;
	export let CTA = isGameStarted ? 'Update Settings' : 'Start Game';

	const dispatch = createEventDispatcher<{ submit: GameSettings }>();

	// Edit a private copy; the store only changes when the form is submitted
	// (SM-2.9 — the old form mutated $settingsStore in place, so cancelling the
	// dialog still "applied" the half-edited settings).
	let draft: GameSettings = { ...settings };

	const handleColorChange = (event: CustomEvent) => {
		draft.color = event.detail.value;
	};

	const handleDifficultyChange = (event: CustomEvent) => {
		draft.difficulty = event.detail.value;
	};

	const handleSubmit = () => {
		dispatch('submit', { ...draft });
	};
</script>

<form on:submit|preventDefault={handleSubmit} class="grid items-start gap-4 px-4 md:px-0">
	{#if !isGameStarted}
		<ColorSelector on:colorChange={handleColorChange} color={draft.color} />
	{/if}
	<DifficultySelector on:difficultyChange={handleDifficultyChange} difficulty={draft.difficulty} />
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
