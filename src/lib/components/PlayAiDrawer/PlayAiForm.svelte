<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button/index.js';
	import DifficultySelector from '../controls/DifficultySelector.svelte';
	import ColorSelector from '../controls/ColorSelector.svelte';
	import type { Color } from 'chessground/types';

	export let CTA = 'Start Game';

	let color: Color = 'white';
	let difficulty = 10;
	let hints = true;
	let undo = true;

	const handleColorChange = (event: CustomEvent) => {
		color = event.detail.value;
	};

	const handleDifficultyChange = (event: CustomEvent) => {
		difficulty = event.detail.value;
	};

	const dispatch = createEventDispatcher();

	const handleSubmit = () => {
		dispatch('submit', { color, difficulty, hints, undo });
	};
</script>

<form on:submit|preventDefault={handleSubmit} class="grid items-start gap-4 px-4 pb-4 md:pb-0">
	<ColorSelector on:colorChange={handleColorChange} />

	<DifficultySelector on:difficultyChange={handleDifficultyChange} />

	<div class="flex items-center gap-2">
		<Label for="ai-vs-ai">Allow Hints:</Label>
		<Switch includeInput bind:checked={hints} />
	</div>

	<div class="flex items-center gap-2">
		<Label for="ai-vs-ai">Allow Undo:</Label>
		<Switch includeInput bind:checked={undo} />
	</div>

	<Button type="submit">{CTA}</Button>
</form>
