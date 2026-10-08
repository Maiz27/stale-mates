<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from '@iconify/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import MoveList from '$lib/components/MoveList/MoveList.svelte';
	import PlayAiDrawer from '$lib/components/PlayAiDrawer/PlayAiDrawer.svelte';
	import EndGameDrawer from '$lib/components/controls/EndGameDrawer.svelte';
	import { settingsStore, type GameSettings } from '$lib/stores/gameSettings';
	import { AIGameState } from '$lib/chess/AIGameState';
	import { getDifficultyLabel } from '$lib/utils';

	// The game state is itself a `Readable<GameView>` — `$gameState` is the view.
	const gameState = new AIGameState({
		player: $settingsStore.color || 'white',
		difficulty: $settingsStore.difficulty,
		debug: false
	});

	let boardFlipped = false;

	// Tear down the Stockfish worker and audio elements when leaving the page.
	onDestroy(() => {
		gameState.destroy();
	});

	const startNewGame = () => gameState.newGame();
	const endGame = () => gameState.endGame();
	const getHint = () => gameState.getHint();
	const undoMove = () => gameState.undoMove();
	const resign = () => gameState.resign();
	const flipBoard = () => (boardFlipped = !boardFlipped);

	const handleSettingsUpdate = (newSettings: GameSettings) => {
		gameState.updateSettings(newSettings);
	};

	// Derived from the model (not the settings store) so the board can never
	// disagree with the side the AI thinks you're playing (SM-2.4).
	$: canUndo = $gameState && $settingsStore.undo && gameState.canUndo();
	$: canHint =
		$gameState.started &&
		$settingsStore.hints &&
		!$gameState.gameOver.isOver &&
		$gameState.turn === $gameState.player &&
		!$gameState.hintPending;
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
						>{$gameState.player === 'white' ? 'White' : 'Black'}</span
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
			{#if !$gameState.started}
				<Button on:click={startNewGame}>Start New Game</Button>
			{:else if $gameState.gameOver.isOver}
				<Button on:click={endGame}>Reset Game</Button>
			{:else}
				<EndGameDrawer onConfirm={endGame} />
			{/if}
			<Button on:click={getHint} variant="outline" disabled={!canHint} title="Get Hint">
				<Icon icon="radix-icons:question-mark" />
			</Button>
			<Button on:click={undoMove} variant="outline" disabled={!canUndo} title="Undo Move">
				<Icon icon="radix-icons:thick-arrow-left" />
			</Button>
			<Button on:click={flipBoard} variant="outline" title="Flip Board" aria-label="Flip board">
				<Icon icon="radix-icons:loop" />
			</Button>
			{#if $gameState.started && !$gameState.gameOver.isOver}
				<Button on:click={resign} variant="outline" title="Resign" aria-label="Resign game">
					<Icon icon="radix-icons:flag" />
				</Button>
			{/if}
			<PlayAiDrawer
				isSave={true}
				isGameStarted={$gameState.started && !$gameState.gameOver.isOver}
				onSettingsUpdate={handleSettingsUpdate}
			/>
		</div>
	</section>

	<div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
		<ChessBoard
			{boardFlipped}
			view={$gameState}
			playerColor={$gameState.player}
			on:move={(e) => gameState.handlePlayerMove(e.detail)}
			on:promotion={(e) => gameState.completePromotion(e.detail)}
			on:promotionCancel={() => gameState.clearPromotion()}
		/>
		<MoveList moves={$gameState.sanHistory} />
	</div>
</div>
