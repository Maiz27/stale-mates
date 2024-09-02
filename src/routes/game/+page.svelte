<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import type { Color } from 'chessground/types';
	import { MultiplayerGameState } from '$lib/chess/MultiplayerGameState';
	import { formatTime } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';

	const gameId = $page.url.searchParams.get('room');
	const playerColor = ($page.url.searchParams.get('color') as Color) || 'white';

	let gameState: MultiplayerGameState;
	let chessboardComponent: ChessBoard;
	let started = false;
	let opponentConnected = false;
	let gameOver = false;
	let rematchOffered = false;
	let opponentOfferedRematch = false;

	let isUnlimited = true;
	let myTime = 0;
	let opponentTime = 0;

	function offerRematch() {
		gameState.offerRematch();
		rematchOffered = true;
	}

	function acceptRematch() {
		gameState.acceptRematch();
		resetRematchState();
	}

	function resetRematchState() {
		rematchOffered = false;
		opponentOfferedRematch = false;
	}

	onMount(() => {
		const ws = new WebSocket(
			`${import.meta.env.VITE_API_WS_URL}/game/join?room=${gameId}&color=${playerColor}`
		);

		ws.onopen = () => {
			console.log('WebSocket connection established');
			gameState = new MultiplayerGameState({ player: playerColor, websocket: ws });

			const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));
			const unsubscribeOpponentConnected = gameState.opponentConnected.subscribe(
				(value) => (opponentConnected = value)
			);
			const unsubscribeIsUnlimited = gameState.isUnlimited.subscribe(
				(value) => (isUnlimited = value)
			);
			const unsubscribeWhiteTime = gameState.whiteTime.subscribe((value) => {
				playerColor === 'white' ? (myTime = value) : (opponentTime = value);
			});
			const unsubscribeBlackTime = gameState.blackTime.subscribe((value) => {
				playerColor === 'black' ? (myTime = value) : (opponentTime = value);
			});
			const unsubscribeGameOver = gameState.gameOver.subscribe((value) => {
				gameOver = value.isOver;
				if (gameOver) {
					resetRematchState();
				}
			});
			const unsubscribeRematchOffer = gameState.rematchOffer.subscribe((value) => {
				opponentOfferedRematch = value;
			});

			return () => {
				unsubscribeStarted();
				unsubscribeOpponentConnected();
				unsubscribeIsUnlimited();
				unsubscribeWhiteTime();
				unsubscribeBlackTime();
				unsubscribeGameOver();
				unsubscribeRematchOffer();
				if (ws.readyState === WebSocket.OPEN) {
					ws.close();
				}
			};
		};
	});
</script>

<div class="mt-4 w-full space-y-8 p-6">
	<section class="mx-auto grid w-full max-w-3xl place-items-center gap-4">
		<div class="w-full space-y-4 text-center">
			<h1 class="text-3xl font-black leading-tight md:text-4xl">Play Friend: Friendly Duel</h1>
			{#if gameState}
				{#if !opponentConnected}
					<p>Waiting for opponent to join...</p>
				{:else if !started}
					<p>Opponent joined. Game starting soon...</p>
				{:else}
					<div class="mx-auto grid w-4/5 grid-cols-2 gap-y-2">
						{#if !isUnlimited}
							<div>
								My Time: <span
									class={myTime <= 10
										? 'animate-pulse font-semibold text-red-500'
										: 'font-semibold text-primary'}
								>
									{formatTime(myTime)}
								</span>
							</div>
							<div>
								Opponent Time: <span
									class={opponentTime <= 10
										? 'animate-pulse font-semibold text-red-500'
										: 'font-semibold text-primary'}
								>
									{formatTime(opponentTime)}
								</span>
							</div>
						{:else}
							<div>Time: <span class="text-primary">Unlimited</span></div>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
		<div class="flex items-center justify-center gap-4">
			{#if gameOver}
				{#if opponentOfferedRematch}
					<Button on:click={acceptRematch}>Accept Rematch</Button>
				{:else if rematchOffered}
					<Button disabled>Rematch Offered</Button>
				{:else}
					<Button on:click={offerRematch}>Offer Rematch</Button>
				{/if}
			{/if}
		</div>
	</section>
	{#if gameState && opponentConnected}
		<ChessBoard bind:this={chessboardComponent} {gameState} {playerColor} />
	{/if}
</div>
