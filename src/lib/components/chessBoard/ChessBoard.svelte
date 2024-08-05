<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { Stockfish } from '$lib/engine';
	import { Chess } from 'chess.js';
	import { Chessground } from 'svelte-chessground';
	import PromotionModal from './PromotionModal.svelte';
	import {
		initializeChess,
		initializeEngine,
		updateConfig,
		getChessJsColor,
		isVsAI,
		isPromotionMove,
		highlightHint,
		updateBoardState
	} from './utils';
	import type { Config } from 'chessground/config';
	import type { Color } from 'chessground/types';

	export let fen: string;
	export let gameMode: 'pve' | 'pvp' = 'pvp';
	export let playerColor: Color = 'white';
	export let gameStarted: boolean = false;
	export let onMove: (from: string, to: string, promotion?: string) => void;
	export let onAIMove: (from: string, to: string, promotion?: string) => void;
	export let onGameOver: (winner: Color | 'draw') => void;

	let chessground: Chessground;
	let chess: Chess;
	let engine: Stockfish;
	let promotionMove = writable<{ from: string; to: string } | null>(null);
	let config: Config;

	let chessJsPlayerColor = getChessJsColor(playerColor);
	let gameOverState: { isOver: boolean; winner: Color | 'draw' | null } = {
		isOver: false,
		winner: null
	};

	onMount(() => {
		chess = initializeChess(fen);
		engine = initializeEngine(handleEngineMessage);
		updateBoardConfig();
	});

	function updateBoardConfig() {
		config = updateConfig(gameStarted, fen, playerColor, gameMode, handleMove);
		if (chessground) {
			chessground.set(config);
		}
	}

	function handleMove(orig: string, dest: string) {
		if (isPromotionMove(chess, orig, dest)) {
			promotionMove.set({ from: orig, to: dest });
		} else {
			onMove(orig, dest);
		}
		checkGameOver();
	}

	function handlePromotion(event: CustomEvent) {
		const piece = event.detail.piece;
		promotionMove.update((pm) => {
			if (pm) {
				onMove(pm.from, pm.to, piece);
			}
			return null;
		});
		checkGameOver();
	}

	function handleEngineMessage(message: string) {
		if (message.includes('bestmove')) {
			const { from, to } = engine.getBestMove();
			if (isVsAI(gameMode) && chess.turn() !== chessJsPlayerColor) {
				if (isPromotionMove(chess, from, to)) {
					onAIMove(from, to, 'q');
				} else {
					onAIMove(from, to);
				}
				checkGameOver();
			}
		}
	}

	function checkGameOver() {
		if (chess.isGameOver()) {
			let winner: Color | 'draw' = 'draw';
			if (chess.isCheckmate()) {
				winner = chess.turn() === 'w' ? 'black' : 'white';
			}
			gameOverState = { isOver: true, winner };
			onGameOver(winner);
		}
	}

	export function updateBoard(newFen: string) {
		fen = updateBoardState(chess, engine, chessground, newFen);
		updateBoardConfig();
		checkGameOver();
	}

	export function setEngineDifficulty(difficulty: number) {
		engine.setDifficulty(difficulty);
	}

	export async function getHint() {
		if (!gameStarted) return;
		const hint = await engine.getHint(chess.turn());
		highlightHint(chessground, hint);
		return hint;
	}

	export function newGame() {
		engine.newGame();
		gameOverState = { isOver: false, winner: null };
		updateBoardConfig();
	}

	export function makeAIMove() {
		if (isVsAI(gameMode) && chess.turn() !== chessJsPlayerColor) {
			engine.go();
		}
	}

	$: {
		if (gameStarted !== undefined) {
			updateBoardConfig();
		}
	}
</script>

<section class="relative mx-auto md:w-1/2 2xl:w-1/3">
	{#if gameOverState.isOver}
		<div
			class="absolute left-0 right-0 top-0 z-10 bg-gray-800 bg-opacity-80 py-2 text-center text-white"
		>
			{#if gameOverState.winner === 'draw'}
				Game Over: Draw
			{:else}
				Game Over: {gameOverState.winner} wins!
			{/if}
		</div>
	{/if}
	<Chessground bind:this={chessground} {config} orientation={playerColor} />
	{#if $promotionMove}
		<PromotionModal on:promotion={handlePromotion} />
	{/if}
</section>
