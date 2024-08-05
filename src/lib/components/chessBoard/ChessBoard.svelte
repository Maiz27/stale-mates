<script lang="ts">
	import { onMount } from 'svelte';
	import { Chessground } from 'svelte-chessground';
	import type { Config } from 'chessground/config';
	import type { Color } from 'chessground/types';
	import { GameState } from '$lib/chess/GameState';
	import PromotionModal from './PromotionModal.svelte';
	import type { PromotionMove, GameOver } from '$lib/chess//types';
	import type { DrawShape } from 'chessground/draw';

	export let playerColor: Color;
	export let gameState: GameState;

	let chessground: Chessground;
	let config: Config;

	$: fen = '';
	$: turn = 'white' as Color;
	$: destinations = new Map();
	$: checkState = { inCheck: false };
	$: gameOver = { isOver: false, winner: null } as GameOver;
	$: started = false;
	$: promotionMove = null as PromotionMove;
	$: hint = null as { from: string; to: string } | null;

	onMount(() => {
		const unsubscribeFen = gameState.fen.subscribe((value) => (fen = value));
		const unsubscribeTurn = gameState.turn.subscribe((value) => (turn = value));
		const unsubscribeDestinations = gameState.destinations.subscribe(
			(value) => (destinations = value)
		);
		const unsubscribeCheckState = gameState.checkState.subscribe((value) => (checkState = value));
		const unsubscribeGameOver = gameState.gameOver.subscribe((value) => (gameOver = value));
		const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));
		const unsubscribePromotionMove = gameState.promotionMove.subscribe(
			(value) => (promotionMove = value)
		);
		const unsubscribeHint = gameState.hint.subscribe((value) => {
			hint = value;
			updateHintShape();
		});

		return () => {
			unsubscribeFen();
			unsubscribeTurn();
			unsubscribeDestinations();
			unsubscribeCheckState();
			unsubscribeGameOver();
			unsubscribeStarted();
			unsubscribePromotionMove();
			unsubscribeHint();
		};
	});

	$: config = {
		fen,
		orientation: playerColor,
		turnColor: turn,
		check: checkState.inCheck,
		events: {
			move: handleMove,
			change: () => {
				if (chessground) {
					fen = chessground.getFen();
				}
			}
		},
		movable: {
			color: started && turn === playerColor ? playerColor : undefined,
			dests: destinations,
			free: false,
			showDests: true
		},
		drawable: {
			enabled: true,
			visible: true,
			defaultSnapToValidMove: true,
			brushes: {
				green: { key: 'green', color: '#15781B', opacity: 1, lineWidth: 10 },
				red: { key: 'red', color: '#882020', opacity: 1, lineWidth: 10 },
				blue: { key: 'blue', color: '#003088', opacity: 1, lineWidth: 10 },
				yellow: { key: 'yellow', color: '#e68f00', opacity: 1, lineWidth: 10 }
			}
		}
	};

	function updateHintShape() {
		if (chessground && hint) {
			const shapes = [
				{
					orig: hint.from,
					dest: hint.to,
					brush: 'green'
				}
			] as DrawShape[];
			chessground.setAutoShapes(shapes);
		} else if (chessground) {
			chessground.setAutoShapes([]);
		}
	}

	function handleMove(from: string, to: string) {
		gameState.handlePlayerMove({ from, to });
		gameState.clearHint();
	}

	function handlePromotion(event: CustomEvent) {
		const piece = event.detail.piece;
		if (promotionMove) {
			const success = gameState.makeMove({ ...promotionMove, promotion: piece });
			if (success) {
				gameState.promotionMove.set(null);
				if (chessground) {
					chessground.set({ fen: fen });
				}
			}
		}
	}

	export function newGame() {
		gameState.newGame();
	}

	export function endGame() {
		gameState.endGame();
	}

	export async function getHint() {
		return await gameState.getHint();
	}

	export function setDifficulty(difficulty: number) {
		gameState.setDifficulty(difficulty);
	}
</script>

<section class="relative mx-auto md:w-1/2 2xl:w-1/3">
	{#if gameOver.isOver}
		<div
			class="absolute left-0 right-0 top-0 z-10 bg-gray-800 bg-opacity-80 py-2 text-center text-white"
		>
			{#if gameOver.winner === 'draw'}
				Game Over: Draw
			{:else}
				Game Over: {gameOver.winner} wins!
			{/if}
		</div>
	{:else if checkState.inCheck && started}
		<div
			class="absolute left-0 right-0 top-0 z-10 bg-red-800 bg-opacity-80 py-2 text-center text-white"
		>
			Check!
		</div>
	{/if}
	<Chessground bind:this={chessground} {config} orientation={playerColor} />
	{#if promotionMove}
		<PromotionModal on:promotion={handlePromotion} />
	{/if}
</section>
