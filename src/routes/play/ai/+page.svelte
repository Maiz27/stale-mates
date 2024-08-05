<script lang="ts">
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import { getChessJsColor, isVsAI } from '$lib/components/chessBoard/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Chess } from 'chess.js';
	import type { PageData } from './$types';
	import type { Color } from 'chessground/types';

	export let data: PageData;

	let gameMode: 'pve' | 'pvp' = 'pve';
	let difficulty = 10;
	let chess = new Chess();

	let chessboardComponent: ChessBoard;
	let gameStarted = false;
	let gameOverState: { isOver: boolean; winner: Color | 'draw' | null } = {
		isOver: false,
		winner: null
	};

	const difficultyOptions = [
		{ value: 1, label: 'Beginner' },
		{ value: 4, label: 'Strong Beginner' },
		{ value: 7, label: 'Intermediate' },
		{ value: 10, label: 'Strong Intermediate' },
		{ value: 13, label: 'Advanced' },
		{ value: 17, label: 'Strong Advanced' },
		{ value: 20, label: 'Expert' }
	];

	const startNewGame = () => {
		chess.reset();
		chessboardComponent.updateBoard(chess.fen());
		chessboardComponent.newGame();
		gameStarted = true;
		gameOverState = { isOver: false, winner: null };
		if (isVsAI(gameMode) && data.playerColor === 'black') {
			chessboardComponent.makeAIMove();
		}
	};

	const endGame = () => {
		gameStarted = false;
		gameOverState = { isOver: false, winner: null };
		chess.reset();
		chessboardComponent.updateBoard(chess.fen());
		chessboardComponent.newGame();
	};

	const getHint = async () => {
		await chessboardComponent.getHint();
	};

	const handleMove = (from: string, to: string, promotion?: string) => {
		if (!from || !to) return;
		const move = chess.move({ from, to, promotion });
		if (move) {
			chessboardComponent.updateBoard(chess.fen());
			if (isVsAI(gameMode) && getChessJsColor(data.playerColor) !== chess.turn()) {
				chessboardComponent.makeAIMove();
			}
		}
	};

	const handleAIMove = (from: string, to: string, promotion?: string) => {
		const aiMove = chess.move({ from, to, promotion });
		if (aiMove) {
			chessboardComponent.updateBoard(chess.fen());
		}
	};

	const handleGameOver = (winner: Color | 'draw') => {
		gameOverState = { isOver: true, winner };
		gameStarted = false;
	};

	const handleDifficultyChange = (selected: { value: number } | undefined) => {
		if (selected) {
			difficulty = selected.value;
			if (gameStarted) {
				chessboardComponent.setEngineDifficulty(difficulty);
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
		{#if gameStarted}
			<Button on:click={endGame}>End Game</Button>
		{:else}
			<Button on:click={startNewGame}>Start New Game</Button>
		{/if}
		<Button on:click={getHint} variant="outline" disabled={!gameStarted}>Get Hint</Button>
	</div>

	{#if gameOverState.isOver}
		<div class="rounded-md bg-gray-100 p-4 text-center">
			{#if gameOverState.winner === 'draw'}
				<p class="text-lg font-bold">Game Over: It's a draw!</p>
			{:else}
				<p class="text-lg font-bold">Game Over: {gameOverState.winner} wins!</p>
			{/if}
		</div>
	{/if}
</div>

<ChessBoard
	bind:this={chessboardComponent}
	{gameMode}
	{gameStarted}
	playerColor={data.playerColor}
	fen={chess.fen()}
	onMove={handleMove}
	onAIMove={handleAIMove}
	onGameOver={handleGameOver}
/>
