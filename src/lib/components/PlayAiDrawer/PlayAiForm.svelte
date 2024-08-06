<script lang="ts">
	import { goto } from '$app/navigation';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button/index.js';
	import DifficultySelector from '../controls/DifficultySelector.svelte';
	import ColorSelector from '../controls/ColorSelector.svelte';
	import type { Color } from 'chessground/types';

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

	const handleSubmit = () => {
		// Store values in local storage
		localStorage.setItem('chessGameSettings', JSON.stringify({ color, difficulty, hints, undo }));

		// Navigate to game page with query params
		goto(`/ai?color=${color}&difficulty=${difficulty}&hints=${hints}&undo=${undo}`);
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

	<Button type="submit">Start Game</Button>
</form>
