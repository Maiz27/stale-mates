<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Icon from '@iconify/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import MoveList from '$lib/components/MoveList/MoveList.svelte';
	import PlayAiDrawer from '$lib/components/PlayAiDrawer/PlayAiDrawer.svelte';
	import EndGameDrawer from '$lib/components/controls/EndGameDrawer.svelte';
	import { settingsStore, type GameSettings } from '$lib/stores/gameSettings';
	import { AIGameState } from '$lib/chess/AIGameState';
	import type { ChessMove, GameOver } from '$lib/chess/types';
	import { getDifficultyLabel } from '$lib/utils';
	import type { Color } from 'chessground/types';

	let gameState: AIGameState = new AIGameState({
		player: $settingsStore.color || 'white',
		difficulty: $settingsStore.difficulty,
		debug: false
	});
	let chessboardComponent: ChessBoard;

	let started = false;
	let gameOver = { isOver: false, winner: null as Color | 'draw' | null } as GameOver;
	let moveHistory = [] as ChessMove[];
	let sanHistory = [] as string[];

	onMount(() => {
		const unsubscribeGameOver = gameState.gameOver.subscribe((value) => (gameOver = value));
		const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));
		const unsubscribeMoveHistory = gameState.moveHistory.subscribe(
			(value) => (moveHistory = value)
		);
		const unsubscribeSanHistory = gameState.sanHistory.subscribe((value) => (sanHistory = value));

		return () => {
			unsubscribeGameOver();
			unsubscribeStarted();
			unsubscribeMoveHistory();
			unsubscribeSanHistory();
		};
	});

	// Tear down the Stockfish worker and audio elements when leaving the page.
	onDestroy(() => {
		gameState.destroy();
	});

	const resign = () => chessboardComponent?.resign();
	const flipBoard = () => chessboardComponent?.flipBoard();

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

<svelte:head>
	<title>Play AI · Stale Mates</title>
	<meta
		name="description"
		content="Play chess against an adaptive Stockfish AI with adjustable difficulty, hints, and takebacks."
	/>
</svelte:head>

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
			{#if !started}
				<Button on:click={startNewGame}>Start New Game</Button>
			{:else if gameOver.isOver}
				<Button on:click={endGame}>Reset Game</Button>
			{:else}
				<EndGameDrawer onConfirm={endGame} />
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
			<Button on:click={flipBoard} variant="outline" title="Flip Board" aria-label="Flip board">
				<Icon icon="radix-icons:loop" />
			</Button>
			{#if started && !gameOver.isOver}
				<Button on:click={resign} variant="outline" title="Resign" aria-label="Resign game">
					<Icon icon="radix-icons:flag" />
				</Button>
			{/if}
			<PlayAiDrawer
				isSave={true}
				isGameStarted={started && !gameOver.isOver}
				onSettingsUpdate={handleSettingsUpdate}
			/>
		</div>
	</section>

	<div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
		<ChessBoard
			bind:this={chessboardComponent}
			{gameState}
			playerColor={$settingsStore.color || 'white'}
		/>
		<MoveList moves={sanHistory} />
	</div>
</div>
