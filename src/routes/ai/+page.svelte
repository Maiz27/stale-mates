<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import QuestionMark from 'svelte-radix/QuestionMark.svelte';
	import ThickArrowLeft from 'svelte-radix/ThickArrowLeft.svelte';
	import Loop from 'svelte-radix/Loop.svelte';
	import Flag from '$lib/components/icons/Flag.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import MoveList from '$lib/components/MoveList/MoveList.svelte';
	import PlayerBar from '$lib/components/game/PlayerBar.svelte';
	import PlayAiDrawer from '$lib/components/PlayAiDrawer/PlayAiDrawer.svelte';
	import ConfirmAction from '$lib/components/controls/ConfirmAction.svelte';
	import { settingsStore, type GameSettings } from '$lib/stores/gameSettings';
	import { AIGameState } from '$lib/chess/AIGameState';
	import { getDifficultyLabel } from '$lib/utils';

	const SAVE_KEY = 'stalemates:ai-game';

	// The game state is itself a `Readable<GameView>` — `$gameState` is the view.
	const gameState = new AIGameState({
		player: $settingsStore.color || 'white',
		difficulty: $settingsStore.difficulty,
		debug: false
	});

	let boardFlipped = false;
	// Don't persist until the saved game (if any) has been restored, or the initial
	// empty board would overwrite it.
	let hydrated = false;

	// Resume an in-progress game after a refresh (SM-5).
	onMount(() => {
		try {
			const raw = localStorage.getItem(SAVE_KEY);
			if (raw && !gameState.restore(JSON.parse(raw))) localStorage.removeItem(SAVE_KEY);
		} catch {
			// corrupt / unavailable storage — start fresh
		}
		hydrated = true;
	});

	// Persist after every change; finished or reset games clear the save.
	$: if (hydrated) persist($gameState);
	function persist(_view: unknown) {
		void _view;
		try {
			const saved = gameState.serialize();
			if (saved) localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
			else localStorage.removeItem(SAVE_KEY);
		} catch {
			// storage unavailable
		}
	}

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

	const playAgain = () => {
		gameState.endGame();
		gameState.newGame();
	};

	const swapColors = () => {
		const color = $gameState.player === 'white' ? 'black' : 'white';
		settingsStore.update({ color });
		gameState.endGame();
		gameState.updateSettings({ ...$settingsStore, color });
		gameState.newGame();
	};

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
	$: inProgress = $gameState.started && !$gameState.gameOver.isOver;

	$: aiName = `Stockfish · ${getDifficultyLabel($settingsStore.difficulty)}`;
	$: aiColor = ($gameState.player === 'white' ? 'black' : 'white') as 'white' | 'black';
	// The bar nearest you is "you" unless the board is flipped.
	$: topIsAi = !boardFlipped;
	$: whiteName = $gameState.player === 'white' ? 'You' : aiName;
	$: blackName = $gameState.player === 'black' ? 'You' : aiName;
</script>

<svelte:head>
	<title>Play AI · Stale Mates</title>
	<meta
		name="description"
		content="Play chess against an adaptive Stockfish AI with adjustable difficulty, hints, and takebacks."
	/>
	<meta property="og:title" content="Play AI · Stale Mates" />
	<link rel="canonical" href="https://stalemates.magedfaiz.xyz/ai" />
</svelte:head>

<div class="mt-4 space-y-6 p-4 sm:p-6">
	<section class="grid place-items-center gap-4">
		<div class="space-y-4 text-center">
			<h1 class="text-3xl font-black leading-tight md:text-4xl">Play AI: Adaptive Challenge</h1>
			<div class="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
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

		<div class="flex flex-wrap items-center justify-center gap-2">
			{#if !$gameState.started}
				<Button on:click={startNewGame}>Start New Game</Button>
			{:else if $gameState.gameOver.isOver}
				<Button on:click={playAgain}>Play again</Button>
				<Button variant="outline" on:click={swapColors}>Swap colors</Button>
				<Button variant="ghost" on:click={endGame}>Reset Game</Button>
			{:else}
				<ConfirmAction
					onConfirm={endGame}
					triggerLabel="End Game"
					title="End Game"
					description="Are you sure you want to end the game? This action cannot be undone."
				/>
			{/if}
			<Button
				on:click={getHint}
				variant="outline"
				disabled={!canHint}
				title="Get hint"
				aria-label={$gameState.hintPending ? 'Getting hint…' : 'Get hint'}
			>
				<QuestionMark aria-hidden="true" class={$gameState.hintPending ? 'animate-pulse' : ''} />
			</Button>
			<Button
				on:click={undoMove}
				variant="outline"
				disabled={!canUndo}
				title="Undo move"
				aria-label="Undo move"
			>
				<ThickArrowLeft aria-hidden="true" />
			</Button>
			<Button on:click={flipBoard} variant="outline" title="Flip board" aria-label="Flip board">
				<Loop aria-hidden="true" />
			</Button>
			{#if inProgress}
				<ConfirmAction
					onConfirm={resign}
					triggerLabel=""
					triggerAriaLabel="Resign game"
					triggerVariant="outline"
					title="Resign"
					description="Resign this game? The AI will be awarded the win."
					confirmLabel="Resign"
				>
					<Flag slot="icon" />
				</ConfirmAction>
			{/if}
			<PlayAiDrawer
				isSave={true}
				isGameStarted={inProgress}
				onSettingsUpdate={handleSettingsUpdate}
			/>
		</div>
	</section>

	<div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
		<div class="mx-auto w-full max-w-2xl space-y-2">
			{#if topIsAi}
				<PlayerBar
					name={aiName}
					color={aiColor}
					active={inProgress && $gameState.turn === aiColor}
					status={$gameState.thinking ? 'Thinking…' : ''}
				/>
			{:else}
				<PlayerBar
					name="You"
					color={$gameState.player}
					active={inProgress && $gameState.turn === $gameState.player}
				/>
			{/if}
			<ChessBoard
				{boardFlipped}
				view={$gameState}
				playerColor={$gameState.player}
				on:move={(e) => gameState.handlePlayerMove(e.detail)}
				on:promotion={(e) => gameState.completePromotion(e.detail)}
				on:promotionCancel={() => gameState.clearPromotion()}
			/>
			{#if topIsAi}
				<PlayerBar
					name="You"
					color={$gameState.player}
					active={inProgress && $gameState.turn === $gameState.player}
				/>
			{:else}
				<PlayerBar
					name={aiName}
					color={aiColor}
					active={inProgress && $gameState.turn === aiColor}
					status={$gameState.thinking ? 'Thinking…' : ''}
				/>
			{/if}
		</div>
		<MoveList
			moves={$gameState.sanHistory}
			white={whiteName}
			black={blackName}
			result={$gameState.gameOver}
			event="Stale Mates vs AI"
		/>
	</div>
</div>
