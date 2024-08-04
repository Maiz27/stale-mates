<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { Stockfish } from '$lib/engine';
	import { Chess } from 'chess.js';
	import { Chessground } from 'svelte-chessground';
	import PromotionModal from './PromotionModal.svelte';
	import {
		toDestinations,
		isPromotionMove,
		getCheckState,
		highlightHint,
		initializeChess,
		initializeEngine,
		updateConfig,
		getChessJsColor,
		isWhite,
		isVsAI
	} from './utils';
	import type { Config } from 'chessground/config';
	import type { DrawShape } from 'chessground/draw';
	import type { Color } from 'chessground/types';

	export let fen: string;
	export let gameMode: 'pve' | 'pvp' = 'pvp';
	export let playerColor: Color = 'white';
	export let gameStarted: boolean = false;
	export let onMove: (from: string, to: string, promotion?: string) => void;
	export let onAIMove: (move: { from: string; to: string }) => void;

	let chessground: Chessground;
	let chess: Chess;
	let engine: Stockfish;
	let promotionMove = writable<{ from: string; to: string } | null>(null);
	let config: Config;

	let chessJsPlayerColor = getChessJsColor(playerColor);

	onMount(() => {
		chess = initializeChess(fen);
		engine = initializeEngine(handleEngineMessage);
		config = updateConfig(fen, playerColor, handleMove);
		chessground.set(config);
	});

	function handleMove(orig: string, dest: string) {
		if (isPromotionMove(chess, orig, dest)) {
			promotionMove.set({ from: orig, to: dest });
		} else {
			onMove(orig, dest);
		}
	}

	function handlePromotion(event: CustomEvent) {
		const piece = event.detail.piece;
		promotionMove.update((pm) => {
			if (pm) {
				onMove(pm.from, pm.to, piece);
			}
			return null;
		});
	}

	function handleEngineMessage(message: string) {
		if (message.includes('bestmove')) {
			const move = engine.getBestMove();
			if (isVsAI(gameMode) && chess.turn() !== chessJsPlayerColor) {
				onAIMove(move);
			}
		}
	}

	export function updateBoard(newFen: string) {
		fen = newFen;
		chess.load(fen);
		engine.setPosition(fen);

		const checkState = getCheckState(chess);
		const shapes: DrawShape[] = [];

		if (checkState.inCheck && checkState.attackingSquares) {
			shapes.push(
				{ orig: checkState.kingSquare!, brush: 'red' },
				{ orig: checkState.attackingSquares, brush: 'red' }
			);
		}
		chessground.set({
			fen,
			turnColor: isWhite(playerColor) ? 'white' : 'black',
			movable: {
				color: gameStarted
					? isVsAI(gameMode)
						? chess.turn() == chessJsPlayerColor
							? playerColor
							: undefined
						: 'both'
					: undefined,
				dests: toDestinations(chess)
			},
			draggable: {
				enabled: gameStarted
			}
		});
		chessground.setAutoShapes(shapes);
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
	}

	export function makeAIMove() {
		if (isVsAI(gameMode) && chess.turn() !== chessJsPlayerColor) {
			engine.go();
		}
	}
</script>

<section class="relative mx-auto md:w-1/2 2xl:w-1/3">
	<Chessground bind:this={chessground} {config} orientation={playerColor} />
	{#if $promotionMove}
		<PromotionModal on:promotion={handlePromotion} />
	{/if}
</section>
