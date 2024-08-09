<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import { GameState } from '$lib/chess/GameState';
	import type { Color } from 'chessground/types';

	const gameId = $page.url.searchParams.get('room');
	const playerColor = ($page.url.searchParams.get('color') as Color) || 'white';

	let gameState: GameState;
	let ws: WebSocket;
	let opponent: string | null = null;

	onMount(() => {
		connectWebSocket();

		return () => {
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
		};
	});

	function connectWebSocket() {
		ws = new WebSocket(`wss://127.0.0.1:8787/game/join?room=${gameId}&color=${playerColor}`);

		ws.onopen = () => {
			console.log('WebSocket connection established');
			gameState = new GameState({
				gameMode: 'pvp',
				player: playerColor,
				websocket: ws
			});
		};

		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			handleWebSocketMessage(data);
		};

		ws.onerror = (error) => {
			console.error('WebSocket error:', error);
		};

		ws.onclose = () => {
			console.log('WebSocket connection closed');
		};
	}

	function handleWebSocketMessage(data: any) {
		switch (data.type) {
			case 'gameState':
				gameState.updateFromServer(data.state);
				break;
			case 'opponentJoined':
				opponent = data.opponent;
				break;
			case 'gameStart':
				gameState.started.set(true);
				break;
			// Add more cases as needed
		}
	}
</script>

<div class="mt-4 space-y-8 p-6">
	<h1>Game Room: {gameId}</h1>
	{#if opponent}
		<p>Playing against: {opponent}</p>
	{:else}
		<p>Waiting for opponent to join...</p>
	{/if}
	{#if gameState}
		<ChessBoard {gameState} {playerColor} />
	{/if}
</div>
