<script lang="ts">
	import { onMount } from 'svelte';
	import { Chessground } from 'svelte-chessground';
	import PromotionModal from './PromotionModal.svelte';
	import type { Config } from 'chessground/config';
	import type { Color } from 'chessground/types';
	import type { PromotionMove, GameOver } from '$lib/chess/types';
	import type { DrawShape } from 'chessground/draw';
	import type { GameSettings } from '$lib/stores/gameSettings';
	import type { AIGameState } from '$lib/chess/AIGameState';
	import type { MultiplayerGameState } from '$lib/chess/MultiplayerGameState';

	export let playerColor: Color;
	export let gameState: AIGameState | MultiplayerGameState;

	let chessground: Chessground;
	let config: Config;
	let promotionModalOpen = false;
	let boardFlipped = false;

	$: orientation = (
		boardFlipped ? (playerColor === 'white' ? 'black' : 'white') : playerColor
	) as Color;

	$: fen = '';
	$: turn = 'white' as Color;
	$: destinations = new Map();
	$: checkState = { inCheck: false };
	$: gameOver = { isOver: false, winner: null } as GameOver;
	$: started = false;
	$: promotionMove = null as PromotionMove;
	$: hint = null as { from: string; to: string } | null;

	onMount(() => {
		// Subscribe to game state changes
		const unsubscribeFen = gameState.fen.subscribe((value) => (fen = value));
		const unsubscribeTurn = gameState.turn.subscribe((value) => (turn = value));
		const unsubscribeCheckState = gameState.checkState.subscribe((value) => (checkState = value));
		const unsubscribeGameOver = gameState.gameOver.subscribe((value) => (gameOver = value));
		const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));
		const unsubscribeDestinations = gameState.destinations.subscribe(
			(value) => (destinations = value)
		);
		const unsubscribePromotionMove = gameState.promotionMove.subscribe((value) => {
			promotionMove = value;
			if (value) {
				promotionModalOpen = true;
			}
		});
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
		orientation,
		turnColor: turn,
		check: checkState.inCheck,
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
					fen = chessground.getFen();
				}
			}
		},
		movable: {
			// Lock input while a promotion choice is pending so a second drag can't fire a move.
			color: started && turn === playerColor && !promotionMove ? playerColor : undefined,
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

	export function undoMove() {
		gameState.undoMove();
	}

	export function setDifficulty(difficulty: number) {
		gameState.setDifficulty(difficulty);
	}

	export function updateSettings(settings: GameSettings) {
		gameState.updateSettings(settings);
		if (!started) {
			playerColor = settings.color!;
		}
	}

	export function flipBoard() {
		boardFlipped = !boardFlipped;
	}

	export function resign() {
		gameState.resign();
	}

	const REASON_LABELS: Record<string, string> = {
		checkmate: 'Checkmate',
		stalemate: 'Stalemate',
		threefold: 'Draw by repetition',
		insufficient: 'Draw — insufficient material',
		fiftyMove: 'Draw — fifty-move rule',
		draw: 'Draw',
		timeout: 'Timeout',
		resignation: 'Resignation'
	};

	$: resultText = (() => {
		if (!gameOver.isOver) return '';
		const reason = gameOver.reason ? (REASON_LABELS[gameOver.reason] ?? '') : '';
		if (gameOver.winner === 'draw') {
			return reason && gameOver.reason !== 'draw' ? `Game Over: ${reason}` : 'Game Over: Draw';
		}
		const winner = gameOver.winner === 'white' ? 'White' : 'Black';
		return reason
			? `Game Over: ${winner} wins by ${reason.toLowerCase()}`
			: `Game Over: ${winner} wins!`;
	})();
</script>

<section class="relative mx-auto aspect-square w-full max-w-2xl">
	{#if gameOver.isOver}
		<div
			role="status"
			aria-live="polite"
			class="absolute left-0 right-0 top-0 z-10 bg-gray-800 bg-opacity-80 py-2 text-center text-white"
		>
			{resultText}
		</div>
	{/if}
	<Chessground bind:this={chessground} {config} {orientation} />
	{#if promotionMove}
		<PromotionModal bind:open={promotionModalOpen} on:promotion={handlePromotion} />
	{/if}
</section>
