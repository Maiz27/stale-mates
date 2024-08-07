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

	const dispatch = createEventDispatcher();

	const handleColorChange = (event: CustomEvent) => {
		settings.color = event.detail.value;
	};

	const handleDifficultyChange = (event: CustomEvent) => {
		settings.difficulty = event.detail.value;
	};

	const handleSubmit = () => {
		dispatch('submit', settings);
	};
</script>

<form on:submit|preventDefault={handleSubmit} class="grid items-start gap-4 px-4 md:px-0">
	{#if !isGameStarted}
		<ColorSelector on:colorChange={handleColorChange} color={settings.color} />
	{/if}
	<DifficultySelector
		on:difficultyChange={handleDifficultyChange}
		difficulty={settings.difficulty}
	/>
	<div class="flex items-center gap-2">
		<Label for="hints">Allow Hints:</Label>
		<Switch id="hints" bind:checked={settings.hints} />
	</div>
	<div class="flex items-center gap-2">
		<Label for="undo">Allow Undo:</Label>
		<Switch id="undo" bind:checked={settings.undo} />
	</div>
	<Button type="submit">{CTA}</Button>
</form>
