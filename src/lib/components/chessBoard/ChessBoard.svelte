<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Chessground } from 'svelte-chessground';
	import PromotionModal from './PromotionModal.svelte';
	import type { Config } from 'chessground/config';
	import type { Color } from 'chessground/types';
	import type { GameView } from '$lib/chess/types';
	import type { DrawShape } from 'chessground/draw';
	import { formatResult } from '$lib/chess/formatResult';

	// Presentational: props in, events out. The board renders a `GameView` and
	// emits the player's intent (`move`, `promotion`); the page owns the game
	// state and applies those events. The board never mutates game state itself.
	export let view: GameView;
	export let playerColor: Color;
	export let boardFlipped = false;

	const dispatch = createEventDispatcher<{
		move: { from: string; to: string };
		promotion: { from: string; to: string; piece: string };
	}>();

	let chessground: Chessground;
	let promotionModalOpen = false;

	$: orientation = (
		boardFlipped ? (playerColor === 'white' ? 'black' : 'white') : playerColor
	) as Color;

	// Local display FEN. Authoritative position comes from `view.fen`, but during
	// a drag (and while the promotion modal is open) chessground's `change` event
	// keeps this in sync with what's on the board so a reactive config rebuild
	// doesn't snap a piece back. We only re-adopt `view.fen` when it genuinely
	// advances to a new position — tracked via `appliedViewFen`.
	let displayFen = view.fen;
	let appliedViewFen = view.fen;
	$: if (view.fen !== appliedViewFen) {
		displayFen = view.fen;
		appliedViewFen = view.fen;
	}

	// Open the promotion modal as soon as a promotion choice is pending.
	$: if (view.promotionMove) {
		promotionModalOpen = true;
	}

	// Mirror hint arrows onto the board whenever the hint changes.
	let lastHint = view.hint;
	$: if (view.hint !== lastHint) {
		lastHint = view.hint;
		updateHintShape();
	}

	$: config = {
		fen: displayFen,
		orientation,
		turnColor: view.turn,
		check: view.checkState.inCheck,
		highlight: {
			lastMove: true,
			check: true
		},
		animation: {
			enabled: true
		},
		events: {
			move: handleMove,
			change: () => {
				if (chessground) {
					displayFen = chessground.getFen();
				}
			}
		},
		movable: {
			// Lock input while a promotion choice is pending so a second drag can't fire a move.
			color:
				view.started && view.turn === playerColor && !view.promotionMove ? playerColor : undefined,
			dests: view.destinations,
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
	} satisfies Config;

	function updateHintShape() {
		if (chessground && view.hint) {
			const shapes = [
				{
					orig: view.hint.from,
					dest: view.hint.to,
					brush: 'green'
				}
			] as DrawShape[];
			chessground.setAutoShapes(shapes);
		} else if (chessground) {
			chessground.setAutoShapes([]);
		}
	}

	function handleMove(from: string, to: string) {
		dispatch('move', { from, to });
	}

	function handlePromotion(event: CustomEvent) {
		const piece = event.detail.piece;
		if (view.promotionMove) {
			dispatch('promotion', { from: view.promotionMove.from, to: view.promotionMove.to, piece });
		}
	}

	$: resultText = formatResult(view.gameOver);
</script>

<section class="relative mx-auto aspect-square w-full max-w-2xl">
	{#if view.gameOver.isOver}
		<div
			role="status"
			aria-live="polite"
			class="absolute left-0 right-0 top-0 z-10 bg-gray-800 bg-opacity-80 py-2 text-center text-white"
		>
			{resultText}
		</div>
	{/if}
	<Chessground bind:this={chessground} {config} {orientation} />
	{#if view.promotionMove}
		<PromotionModal bind:open={promotionModalOpen} on:promotion={handlePromotion} />
	{/if}
</section>
