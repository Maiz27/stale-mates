<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import MoveList from '$lib/components/MoveList/MoveList.svelte';
	import type { Color } from 'chessground/types';
	import { MultiplayerGameState } from '$lib/chess/MultiplayerGameState';
	import { formatTime } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';

	const id = $page.url.searchParams.get('id');
	const playerColor = ($page.url.searchParams.get('color') as Color) || 'white';
	const opponentColor: Color = playerColor === 'white' ? 'black' : 'white';

	let gameState: MultiplayerGameState;
	let chessboardComponent: ChessBoard;
	let started = false;
	let opponentConnected = false;
	let gameOver = false;
	let rematchOffered = false;
	let opponentOfferedRematch = false;
	let copied = false;

	let isUnlimited = true;
	let myTime = 0;
	let opponentTime = 0;
	let sanHistory: string[] = [];

	// Link to share with the opponent so they join as the other color.
	$: opponentLink = id ? `${$page.url.origin}/room?id=${id}&color=${opponentColor}` : '';

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

	function copyInvite() {
		navigator.clipboard?.writeText(opponentLink);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	const resign = () => chessboardComponent?.resign();
	const flipBoard = () => chessboardComponent?.flipBoard();
	const leave = () => goto('/');

	onMount(() => {
		if (!id) return; // invalid room — handled in markup

		gameState = new MultiplayerGameState({ player: playerColor, roomId: id });

		const unsubscribeStarted = gameState.started.subscribe((value) => (started = value));
		const unsubscribeOpponentConnected = gameState.opponentConnected.subscribe(
			(value) => (opponentConnected = value)
		);
		const unsubscribeIsUnlimited = gameState.isUnlimited.subscribe(
			(value) => (isUnlimited = value)
		);
		const unsubscribeWhiteTime = gameState.whiteTime.subscribe((value) => {
			if (playerColor === 'white') myTime = value;
			else opponentTime = value;
		});
		const unsubscribeBlackTime = gameState.blackTime.subscribe((value) => {
			if (playerColor === 'black') myTime = value;
			else opponentTime = value;
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
		const unsubscribeSanHistory = gameState.sanHistory.subscribe((value) => (sanHistory = value));

		return () => {
			unsubscribeStarted();
			unsubscribeOpponentConnected();
			unsubscribeIsUnlimited();
			unsubscribeWhiteTime();
			unsubscribeBlackTime();
			unsubscribeGameOver();
			unsubscribeRematchOffer();
			unsubscribeSanHistory();
		};
	});

	onDestroy(() => {
		if (gameState) {
			gameState.destroy();
		}
	});
</script>

<svelte:head>
	<title>Play a Friend · Stale Mates</title>
	<meta
		name="description"
		content="Play a real-time game of chess against a friend with a shareable invite link and optional time controls."
	/>
</svelte:head>

<div class="mt-4 w-full space-y-8 p-6">
	<section class="mx-auto grid w-full max-w-3xl place-items-center gap-4">
		<div class="w-full space-y-4 text-center">
			<h1 class="text-3xl font-black leading-tight md:text-4xl">Play Friend: Friendly Duel</h1>

			{#if !id}
				<div class="space-y-3">
					<p class="text-muted-foreground">
						This room link is missing a game ID. Start a new game from the home page.
					</p>
					<Button on:click={leave}>Back to Home</Button>
				</div>
			{:else if gameState}
				<p class="text-sm text-muted-foreground">
					You are playing as <span class="font-semibold text-primary">{playerColor}</span>
				</p>

				{#if !opponentConnected}
					<div class="mx-auto max-w-md space-y-3">
						<p>Waiting for opponent to join…</p>
						<div class="flex items-center justify-center gap-2">
							<Button variant="outline" on:click={copyInvite} aria-label="Copy invite link">
								<Icon icon="radix-icons:copy" class="mr-2" />
								{copied ? 'Link copied!' : 'Copy invite link'}
							</Button>
							<Button variant="ghost" on:click={leave}>Leave</Button>
						</div>
						<p class="text-xs text-muted-foreground" aria-live="polite">
							{copied
								? 'Invite link copied to your clipboard.'
								: 'Share the link so your friend can join.'}
						</p>
					</div>
				{:else}
					<div class="mx-auto grid w-4/5 grid-flow-row place-items-center gap-y-2 md:grid-flow-col">
						{#if !isUnlimited}
							<div>
								My Time: <span
									class={myTime <= 10
										? 'font-semibold text-red-600 motion-safe:animate-pulse dark:text-red-400'
										: 'font-semibold text-primary'}
								>
									{formatTime(myTime)}
								</span>
							</div>
							<div>
								Opponent Time: <span
									class={opponentTime <= 10
										? 'font-semibold text-red-600 motion-safe:animate-pulse dark:text-red-400'
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

		<div class="flex flex-wrap items-center justify-center gap-2">
			{#if gameState && (opponentConnected || started)}
				<Button variant="outline" on:click={flipBoard} aria-label="Flip board" title="Flip Board">
					<Icon icon="radix-icons:loop" />
				</Button>
				{#if started && !gameOver}
					<Button variant="outline" on:click={resign} aria-label="Resign game" title="Resign">
						<Icon icon="radix-icons:flag" class="mr-2" /> Resign
					</Button>
				{/if}
			{/if}
			{#if gameOver}
				{#if opponentOfferedRematch}
					<Button on:click={acceptRematch}>Accept Rematch</Button>
				{:else if rematchOffered}
					<Button disabled>Rematch Offered</Button>
				{:else}
					<Button on:click={offerRematch}>Offer Rematch</Button>
				{/if}
				<Button variant="ghost" on:click={leave}>Leave</Button>
			{/if}
		</div>
	</section>

	{#if gameState && (opponentConnected || started)}
		<div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
			<ChessBoard bind:this={chessboardComponent} {gameState} {playerColor} />
			<MoveList moves={sanHistory} />
		</div>
	{/if}
</div>
