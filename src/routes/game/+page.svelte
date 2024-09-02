<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import type { Color } from 'chessground/types';
	import { MultiplayerGameState } from '$lib/chess/MultiplayerGameState';
	import { formatTime } from '$lib/utils';

	const gameId = $page.url.searchParams.get('room');
	const playerColor = ($page.url.searchParams.get('color') as Color) || 'white';

	let gameState: MultiplayerGameState;
	let chessboardComponent: ChessBoard;
	let started = false;
	let opponentConnected = false;

	let isUnlimited = true;
	let whiteTime = 0;
	let blackTime = 0;

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
			const unsubscribeWhiteTime = gameState.whiteTime.subscribe((value) => (whiteTime = value));
			const unsubscribeBlackTime = gameState.blackTime.subscribe((value) => (blackTime = value));

			return () => {
				unsubscribeStarted();
				unsubscribeOpponentConnected();
				unsubscribeIsUnlimited();
				unsubscribeWhiteTime();
				unsubscribeBlackTime();
				if (ws.readyState === WebSocket.OPEN) {
					ws.close();
				}
			};
		};
	});
</script>

<div class="mt-4 space-y-8 p-6">
	<section class="grid place-items-center gap-4">
		<div class="space-y-4 text-center">
			<h1 class="text-3xl font-black leading-tight md:text-4xl">Play Friend: Friendly Duel</h1>
			{#if gameState}
				{#if !opponentConnected}
					<p>Waiting for opponent to join...</p>
				{:else if !started}
					<p>Opponent joined. Game starting soon...</p>
				{:else}
					<p>Game in progress</p>
					{#if !isUnlimited}
						<p>White time: {formatTime(whiteTime)}</p>
						<p>Black time: {formatTime(blackTime)}</p>
					{:else}
						<p>Time: Unlimited</p>
					{/if}
				{/if}
			{/if}
		</div>
	</section>
	{#if gameState && opponentConnected}
		<ChessBoard bind:this={chessboardComponent} {gameState} {playerColor} />
	{/if}
</div>
