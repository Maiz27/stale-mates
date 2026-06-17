<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import MoveList from '$lib/components/MoveList/MoveList.svelte';
	import type { Color } from 'chessground/types';
	import type { GameView } from '$lib/chess/types';
	import { MultiplayerGameState } from '$lib/chess/MultiplayerGameState';
	import { formatTime } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';

	const id = $page.url.searchParams.get('id');
	// Validate the color param ('red' &c. must not slip through); default to white.
	const playerColor: Color = $page.url.searchParams.get('color') === 'black' ? 'black' : 'white';
	const opponentColor: Color = playerColor === 'white' ? 'black' : 'white';

	let gameState: MultiplayerGameState | undefined;
	let view: GameView | undefined;
	let boardFlipped = false;
	let rematchOffered = false; // local: whether *I* have offered a rematch

	// Everything the page renders is projected from the single view-model.
	$: started = view?.started ?? false;
	$: opponentConnected = view?.opponentConnected ?? false;
	$: reconnecting = view?.connectionStatus === 'reconnecting';
	$: gameOver = view?.gameOver.isOver ?? false;
	$: opponentOfferedRematch = view?.rematchOffer ?? false;
	$: isUnlimited = view?.clock.isUnlimited ?? true;
	$: myTime = view?.clock.myClock ?? 0;
	$: opponentTime = view?.clock.opponentClock ?? 0;
	$: sanHistory = view?.sanHistory ?? [];

	// Clear *my* stale offer once, on the transition into game-over, so the next
	// game-over starts from "Offer Rematch" rather than a leftover "Offered".
	let wasGameOver = false;
	$: {
		if (gameOver && !wasGameOver) rematchOffered = false;
		wasGameOver = gameOver;
	}

	let copied = false;

	// Link to share with the opponent so they join as the other color.
	$: opponentLink = id ? `${$page.url.origin}/room?id=${id}&color=${opponentColor}` : '';

	function offerRematch() {
		gameState?.offerRematch();
		rematchOffered = true;
	}

	function acceptRematch() {
		gameState?.acceptRematch();
		rematchOffered = false;
	}

	async function copyInvite() {
		if (!navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(opponentLink);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard write was blocked/denied — don't show a false success.
		}
	}

	const resign = () => gameState?.resign();
	const flipBoard = () => (boardFlipped = !boardFlipped);
	const leave = () => goto('/');

	onMount(() => {
		if (!id) return; // invalid room — handled in markup

		gameState = new MultiplayerGameState({ player: playerColor, roomId: id });
		const unsubscribe = gameState.subscribe((value) => (view = value));

		return () => unsubscribe();
	});

	onDestroy(() => {
		gameState?.destroy();
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

			{#if reconnecting}
				<p
					role="status"
					aria-live="polite"
					class="font-semibold text-amber-600 motion-safe:animate-pulse dark:text-amber-400"
				>
					Connection lost — reconnecting…
				</p>
			{/if}

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

	{#if gameState && view && (opponentConnected || started)}
		<div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
			<ChessBoard
				{view}
				{playerColor}
				{boardFlipped}
				on:move={(e) => gameState?.handlePlayerMove(e.detail)}
				on:promotion={(e) => gameState?.completePromotion(e.detail)}
			/>
			<MoveList moves={sanHistory} />
		</div>
	{/if}
</div>
