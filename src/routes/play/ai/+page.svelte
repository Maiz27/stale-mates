<script lang="ts">
	import { onMount } from 'svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Select from '$lib/components/ui/select';
	import { GameState } from '$lib/chess/GameState';
	import type { GameOver } from '$lib/chess/types';
	import type { Color } from 'chessground/types';
	import type { PageData } from './$types';

	export let data: PageData;

	let gameMode: 'pve' | 'pvp' = 'pve';
	let difficulty = 10;
	let gameState: GameState = new GameState({ gameMode, player: data.playerColor });
	let chessboardComponent: ChessBoard;

	$: started = false;
	$: gameOver = { isOver: false, winner: null as Color | 'draw' | null } as GameOver;

	const difficultyOptions = [
		{ value: 1, label: 'Beginner' },
		{ value: 4, label: 'Strong Beginner' },
		{ value: 7, label: 'Intermediate' },
		{ value: 10, label: 'Strong Intermediate' },
		{ value: 13, label: 'Advanced' },
		{ value: 17, label: 'Strong Advanced' },
		{ value: 20, label: 'Expert' }
	];

	onMount(() => {
		const unsubscribeGameOver = gameState.gameOver.subscribe((value) => (gameOver = value));
		const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));

		return () => {
			unsubscribeGameOver();
			unsubscribeStarted();
		};
	});

	const startNewGame = () => {
		if (chessboardComponent) {
			chessboardComponent.newGame();
		}
	};

	const endGame = () => {
		if (chessboardComponent) {
			chessboardComponent.endGame();
		}
	};

	const getHint = async () => {
		if (chessboardComponent) {
			await chessboardComponent.getHint();
		}
	};

	const handleDifficultyChange = (selected: { value: number } | undefined) => {
		if (selected) {
			difficulty = selected.value;
			if (chessboardComponent) {
				chessboardComponent.setDifficulty(difficulty);
			}
		}
	};
</script>

<h1>Play Against AI</h1>

<p>This is the AI play page.</p>

<div class="space-y-4">
	<div class="flex items-center gap-2">
		<label for="difficulty">Select Difficulty: </label>
		<Select.Root
			items={difficultyOptions}
			onSelectedChange={handleDifficultyChange}
			selected={difficultyOptions.find((option) => option.value === difficulty)}
		>
			<Select.Trigger class="w-[180px]">
				<Select.Value placeholder="Select Difficulty" />
			</Select.Trigger>
			<Select.Content>
				{#each difficultyOptions as option}
					<Select.Item value={option.value}>{option.label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<div class="flex gap-2">
		{#if started}
			<Button on:click={endGame}>End Game</Button>
		{:else}
			<Button on:click={startNewGame}>Start New Game</Button>
		{/if}
		<Button on:click={getHint} variant="outline" disabled={!started}>Get Hint</Button>
	</div>

	{#if gameOver.isOver}
		<div class="rounded-md bg-gray-100 p-4 text-center">
			{#if gameOver.winner === 'draw'}
				<p class="text-lg font-bold">Game Over: It's a draw!</p>
			{:else}
				<p class="text-lg font-bold">Game Over: {gameOver.winner} wins!</p>
			{/if}
		</div>
	{/if}
</div>

<ChessBoard bind:this={chessboardComponent} {gameState} playerColor={data.playerColor} />
