<script lang="ts">
	import Chessground from './Chessground.svelte';
	import PromotionModal from './PromotionModal.svelte';
	import type { Config } from 'chessground/config';
	import type { Color, Key } from 'chessground/types';
	import type { GameView } from '$lib/chess/types';
	import type { DrawShape } from 'chessground/draw';
	import { formatResult } from '$lib/chess/formatResult';
	import { boardTheme } from '$lib/stores/boardTheme';

	// Presentational: props in, callbacks out. The board renders a `GameView` and
	// reports the player's intent (`onmove`, `onpromotion`); the page owns the game
	// state and applies it. The board never mutates game state itself.
	let {
		view,
		playerColor,
		boardFlipped = false,
		onmove,
		onpromotion,
		onpromotioncancel
	}: {
		view: GameView;
		playerColor: Color;
		boardFlipped?: boolean;
		onmove: (move: { from: string; to: string }) => void;
		onpromotion: (move: { from: string; to: string; piece: string }) => void;
		onpromotioncancel: () => void;
	} = $props();

	let chessground = $state.raw<ReturnType<typeof Chessground> | undefined>(undefined);
	let promotionModalOpen = $state(false);

	const orientation = $derived<Color>(
		boardFlipped ? (playerColor === 'white' ? 'black' : 'white') : playerColor
	);

	// Board-relevant slices of the view. `view` is a new object on every patch
	// (including the 250 ms clock tick), but these deriveds only propagate when
	// their value/reference actually changes — so the chessground config (whose
	// `set({fen})` wipes user-drawn arrows) is rebuilt only for real board changes
	// (audit SM-5 perf).
	const viewFen = $derived(view.fen);
	const turn = $derived(view.turn);
	const inCheck = $derived(view.checkState.inCheck);
	const dests = $derived(view.destinations);
	const moveHistory = $derived(view.moveHistory);
	const hint = $derived(view.hint);
	const promotionMove = $derived(view.promotionMove);
	// Locked while a promotion choice is pending and after game over.
	const movableColor = $derived<Color | undefined>(
		view.started && !view.gameOver.isOver && turn === playerColor && !promotionMove
			? playerColor
			: undefined
	);
	// Highlight the last move (ours or the opponent's/AI's).
	const lastMove = $derived<Key[] | undefined>(
		moveHistory.length
			? ([
					moveHistory[moveHistory.length - 1].from,
					moveHistory[moveHistory.length - 1].to
				] as Key[])
			: undefined
	);

	// Local display FEN. The authoritative position is `view.fen`, but during a
	// drag (and while the promotion modal is open) chessground's `change` event
	// keeps this in sync with the board so a config rebuild doesn't snap a piece
	// back. It re-adopts `view.fen` whenever that genuinely changes.
	let displayFen = $derived(viewFen);

	// Open the promotion modal as soon as a promotion choice is pending.
	$effect(() => {
		if (promotionMove) promotionModalOpen = true;
	});

	// Mirror hint arrows onto the board whenever the hint changes.
	$effect(() => {
		const board = chessground;
		if (!board) return;
		board.setAutoShapes(
			hint ? ([{ orig: hint.from, dest: hint.to, brush: 'green' }] as DrawShape[]) : []
		);
	});

	const config = $derived({
		fen: displayFen,
		orientation,
		turnColor: turn,
		check: inCheck,
		lastMove,
		highlight: {
			lastMove: true,
			check: true
		},
		animation: {
			enabled: true
		},
		events: {
			move: (from: string, to: string) => onmove({ from, to }),
			change: () => {
				if (chessground) displayFen = chessground.getFen();
			}
		},
		movable: {
			color: movableColor,
			dests,
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
	} satisfies Config);

	function handlePromotion(piece: string) {
		if (promotionMove) onpromotion({ from: promotionMove.from, to: promotionMove.to, piece });
	}

	function handlePromotionCancel() {
		// Snap the dragged pawn back to the authoritative position.
		displayFen = view.fen;
		chessground?.set({ fen: view.fen });
		onpromotioncancel();
	}

	const resultText = $derived(formatResult(view.gameOver, playerColor));
</script>

<section
	class="board-theme relative mx-auto aspect-square w-full max-w-2xl"
	data-board-theme={$boardTheme}
>
	{#if view.gameOver.isOver}
		<div
			role="status"
			aria-live="polite"
			class="absolute top-0 right-0 left-0 z-10 bg-gray-800/80 py-2 text-center text-white"
		>
			{resultText}
		</div>
	{/if}
	<Chessground bind:this={chessground} {config} />
	{#if promotionMove}
		<PromotionModal
			bind:open={promotionModalOpen}
			onpromotion={handlePromotion}
			oncancel={handlePromotionCancel}
		/>
	{/if}
</section>
