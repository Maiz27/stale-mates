<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { GameState } from '$lib/chess/GameState';
	import type { GameOver } from '$lib/chess/types';
	import type { Color } from 'chessground/types';
	import type { PageData } from './$types';
	import { getDifficultyLabel } from '$lib/utils';

	export let data: PageData;

	let color = data.color;
	let difficulty = data.difficulty;
	let hints = data.hints;
	let undo = data.undo;

	let gameMode: 'pve' | 'pvp' = 'pve';
	let gameState: GameState = new GameState({ gameMode, player: color, debug: true });
	let chessboardComponent: ChessBoard;

	$: started = false;
	$: gameOver = { isOver: false, winner: null as Color | 'draw' | null } as GameOver;

	onMount(() => {
		const unsubscribeGameOver = gameState.gameOver.subscribe((value) => (gameOver = value));
		const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));

		// gameState.newGame();

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

	const undoMove = () => {
		if (chessboardComponent) {
			chessboardComponent.undoMove();
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

<div class="mt-4 space-y-8 p-6">
	<section class="grid place-items-center gap-4">
		<div class="space-y-4 text-center">
			<h1 class="text-3xl font-black leading-tight md:text-4xl">Play AI: Adaptive Challenge</h1>
			<div class="grid grid-cols-2 gap-y-2 md:grid-cols-4">
				<div>
					Player: <span class="text-primary">{color === 'white' ? 'White' : 'Black'}</span>
				</div>
				<div>
					Difficulty: <span class="text-primary">{getDifficultyLabel(difficulty)}</span>
				</div>
				<div>
					Hints: <span class="text-primary">{hints ? 'On' : 'Off'}</span>
				</div>
				<div>
					Undo: <span class="text-primary">{undo ? 'On' : 'Off'}</span>
				</div>
			</div>
		</div>

		<div class="flex gap-2">
			{#if started}
				<Button on:click={endGame}>End Game</Button>
			{:else}
				<Button on:click={startNewGame}>Start New Game</Button>
			{/if}
			<Button on:click={getHint} variant="outline" disabled={!started || !hints} title="Get Hint">
				<Icon icon="radix-icons:question-mark" />
			</Button>
			<Button on:click={undoMove} variant="outline" disabled={!started || !undo} title="Undo Move">
				<Icon icon="radix-icons:thick-arrow-left" />
			</Button>
			<Button on:click={getHint} variant="outline" disabled={!started} title="Settings">
				<Icon icon="radix-icons:gear" />
			</Button>
		</div>
	</section>

	<!-- <div class="space-y-4">
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
	</div> -->

	<ChessBoard bind:this={chessboardComponent} {gameState} playerColor={color} />
</div>
