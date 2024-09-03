<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import PlayAiDrawer from '$lib/components/PlayAiDrawer/PlayAiDrawer.svelte';
	import { getDifficultyLabel } from '$lib/utils';
	import type { ChessMove, GameOver } from '$lib/chess/types';
	import type { Color } from 'chessground/types';
	import { settingsStore, type GameSettings } from '$lib/stores/gameSettings';
	import { AIGameState } from '$lib/chess/AIGameState';

	let gameState: AIGameState = new AIGameState({
		player: $settingsStore.color || 'white',
		difficulty: $settingsStore.difficulty,
		debug: false
	});
	let chessboardComponent: ChessBoard;

	$: started = false;
	$: gameOver = { isOver: false, winner: null as Color | 'draw' | null } as GameOver;
	$: moveHistory = [] as ChessMove[];

	onMount(() => {
		const unsubscribeGameOver = gameState.gameOver.subscribe((value) => (gameOver = value));
		const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));
		const unsubscribeMoveHistory = gameState.moveHistory.subscribe(
			(value) => (moveHistory = value)
		);

		return () => {
			unsubscribeGameOver();
			unsubscribeStarted();
			unsubscribeMoveHistory();
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

	const handleSettingsUpdate = (newSettings: GameSettings) => {
		if (chessboardComponent) {
			chessboardComponent.updateSettings(newSettings);
		}
	};
</script>

<div class="mt-4 space-y-8 p-6">
	<section class="grid place-items-center gap-4">
		<div class="space-y-4 text-center">
			<h1 class="text-3xl font-black leading-tight md:text-4xl">Play AI: Adaptive Challenge</h1>
			<div class="grid grid-cols-2 gap-y-2 md:grid-cols-4">
				<div>
					Player: <span class="text-primary"
						>{$settingsStore.color === 'white' ? 'White' : 'Black'}</span
					>
				</div>
				<div>
					Difficulty: <span class="text-primary"
						>{getDifficultyLabel($settingsStore.difficulty)}</span
					>
				</div>
				<div>
					Hints: <span class="text-primary">{$settingsStore.hints ? 'On' : 'Off'}</span>
				</div>
				<div>
					Undo: <span class="text-primary">{$settingsStore.undo ? 'On' : 'Off'}</span>
				</div>
			</div>
		</div>

		<div class="flex gap-2">
			{#if started}
				<Button on:click={endGame}>{gameOver.isOver ? 'Reset Game' : 'End Game'}</Button>
			{:else}
				<Button on:click={startNewGame}>Start New Game</Button>
			{/if}
			<Button
				on:click={getHint}
				variant="outline"
				disabled={!started || !$settingsStore.hints || gameOver.isOver}
				title="Get Hint"
			>
				<Icon icon="radix-icons:question-mark" />
			</Button>
			<Button
				on:click={undoMove}
				variant="outline"
				disabled={!started || !$settingsStore.undo || moveHistory.length < 2 || gameOver.isOver}
				title="Undo Move"
			>
				<Icon icon="radix-icons:thick-arrow-left" />
			</Button>
			<PlayAiDrawer
				isSave={true}
				isGameStarted={started && !gameOver.isOver}
				onSettingsUpdate={handleSettingsUpdate}
			/>
		</div>
	</section>

	<ChessBoard
		bind:this={chessboardComponent}
		{gameState}
		playerColor={$settingsStore.color || 'white'}
	/>
</div>
