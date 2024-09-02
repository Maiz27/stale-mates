<script lang="ts">
	import { onMount } from 'svelte';
	import { Chessground } from 'svelte-chessground';
	import type { Config } from 'chessground/config';
	import type { Color } from 'chessground/types';
	import PromotionModal from './PromotionModal.svelte';
	import type { PromotionMove, GameOver, MoveType } from '$lib/chess/types';
	import type { DrawShape } from 'chessground/draw';
	import type { GameSettings } from '$lib/stores/gameSettings';
	import { MOVE_AUDIOS_PATHS } from '$lib/constants';
	import type { AIGameState } from '$lib/chess/AIGameState';
	import type { MultiplayerGameState } from '$lib/chess/MultiplayerGameState';

	export let playerColor: Color;
	export let gameState: AIGameState | MultiplayerGameState;

	let chessground: Chessground;
	let config: Config;
	let promotionModalOpen = false;
	let audioFiles: Record<MoveType, HTMLAudioElement> = {} as Record<MoveType, HTMLAudioElement>;

	$: fen = '';
	$: turn = 'white' as Color;
	$: destinations = new Map();
	$: checkState = { inCheck: false };
	$: gameOver = { isOver: false, winner: null } as GameOver;
	$: started = false;
	$: promotionMove = null as PromotionMove;
	$: hint = null as { from: string; to: string } | null;
	$: moveType = 'normal' as MoveType;

	onMount(() => {
		// Initialize audio files
		Object.entries(MOVE_AUDIOS_PATHS).forEach(([key, path]) => {
			audioFiles[key as MoveType] = new Audio(path);
			audioFiles[key as MoveType].load();
			audioFiles[key as MoveType].volume = 0.9;
		});

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
		const unsubscribeMoveType = gameState.lastMove.subscribe((value) => {
			moveType = value;
			playAudio();
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
			unsubscribeMoveType();
		};
	});

	$: config = {
		fen,
		orientation: playerColor,
		turnColor: turn,
		check: checkState.inCheck,
		highlight: {
			lastMove: true,
			check: true
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
			color: started && turn === playerColor ? playerColor : undefined,
			dests: destinations,
			free: false,
			showDests: true,
			events: {
				after: playAudio
			}
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

	async function playAudio() {
		if (audioFiles[moveType]) {
			await audioFiles[moveType]
				.play()
				.catch((error) => console.error('Audio playback failed:', error));
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
	{/if}
	<Chessground bind:this={chessground} {config} orientation={playerColor} />
	{#if promotionMove}
		<PromotionModal bind:open={promotionModalOpen} on:promotion={handlePromotion} />
	{/if}
</section>
