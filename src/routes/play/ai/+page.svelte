<script lang="ts">
	import ChessBoard from '$lib/components/chess/ChessBoard.svelte';
	import { getChessJsColor, isVsAI } from '$lib/components/chess/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Chess } from 'chess.js';
	import type { Color } from 'chessground/types';

	let gameMode: 'pve' | 'pvp' = 'pve';
	let difficulty = 10;
	let playerColor: Color = 'black';
	let chess = new Chess();
	let chessboardComponent: ChessBoard;
	let gameStarted = false;

	const difficultyOptions = [
		{ value: 1, label: 'Beginner' },
		{ value: 4, label: 'Strong Beginner' },
		{ value: 7, label: 'Intermediate' },
		{ value: 10, label: 'Strong Intermediate' },
		{ value: 13, label: 'Advanced' },
		{ value: 17, label: 'Strong Advanced' },
		{ value: 20, label: 'Expert' }
	];

	const colorOptions = [
		{ value: 'white', label: 'White' },
		{ value: 'black', label: 'Black' }
	];

	const startNewGame = () => {
		chess.reset();
		chessboardComponent.updateBoard(chess.fen());
		chessboardComponent.newGame();
		gameStarted = true;
		if (isVsAI(gameMode) && playerColor === 'black') {
			chessboardComponent.makeAIMove();
		}
	};

	const endGame = () => {
		gameStarted = false;
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
			if (isVsAI(gameMode) && getChessJsColor(playerColor) !== chess.turn()) {
				chessboardComponent.makeAIMove();
			}
		}
	};

	const handleAIMove = (move: { from: string; to: string }) => {
		const aiMove = chess.move(move);
		if (aiMove) {
			chessboardComponent.updateBoard(chess.fen());
		}
	};

	const handleDifficultyChange = (selected: { value: number } | undefined) => {
		if (selected) {
			difficulty = selected.value;
			if (gameStarted) {
				chessboardComponent.setEngineDifficulty(difficulty);
			}
		}
	};

	const handleColorChange = (selected: { value: string } | undefined) => {
		if (selected && !gameStarted) {
			playerColor = selected.value as Color;
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
	<div class="flex items-center gap-2">
		<label for="color">Select Color: </label>
		<Select.Root
			items={colorOptions}
			onSelectedChange={handleColorChange}
			selected={colorOptions.find((option) => option.value === playerColor)}
		>
			<Select.Trigger class="w-[180px]">
				<Select.Value placeholder="Select Color" />
			</Select.Trigger>
			<Select.Content>
				{#each colorOptions as option, index}
					<Select.Item value={index}>{option.label}</Select.Item>
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
</div>

<ChessBoard
	bind:this={chessboardComponent}
	{gameMode}
	{gameStarted}
	{playerColor}
	fen={chess.fen()}
	onMove={handleMove}
	onAIMove={handleAIMove}
/>
