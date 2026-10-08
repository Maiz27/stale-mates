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

	// Everything the page renders is projected from the single view-model.
	$: status = view?.connectionStatus ?? 'connecting';
	$: started = view?.started ?? false;
	$: opponentConnected = view?.opponentConnected ?? false;
	$: reconnecting = status === 'reconnecting';
	$: terminal = status === 'rejected' || status === 'replaced';
	$: gameOver = view?.gameOver.isOver ?? false;
	$: opponentOfferedRematch = view?.rematchOffer ?? false;
	$: rematchOffered = view?.myRematchOffer ?? false;
	$: isUnlimited = view?.clock.isUnlimited ?? true;
	$: myTime = view?.clock.myClock ?? 0;
	$: opponentTime = view?.clock.opponentClock ?? 0;
	$: lowTime = view?.clock.lowTimeThreshold ?? 0;
	$: sanHistory = view?.sanHistory ?? [];
	// Before the first game starts (and with no result yet) we're waiting for the opponent.
	$: waiting = !started && !gameOver && !opponentConnected;
	// Nothing heard from the server yet.
	$: connecting = status === 'connecting' && waiting;
	// The opponent left mid-game: show a badge and, after the grace period, let me claim the win.
	$: opponentAway = !waiting && !opponentConnected && !gameOver;
	$: claimableAt = view?.opponentClaimableAt ?? null;

	// 1 Hz tick for the abandonment countdown (only while the opponent is away).
	let now = Date.now();
	let tick: ReturnType<typeof setInterval> | null = null;
	$: if (opponentAway && claimableAt !== null && !tick) {
		now = Date.now();
		tick = setInterval(() => (now = Date.now()), 1000);
	} else if ((!opponentAway || claimableAt === null) && tick) {
		clearInterval(tick);
		tick = null;
	}
	$: claimInSeconds =
		claimableAt === null ? null : Math.max(0, Math.ceil((claimableAt - now) / 1000));

	// Low-time warning uses the server's per-time-control threshold (not a hardcoded 10s).
	const isLow = (seconds: number, threshold: number) => threshold > 0 && seconds <= threshold;

	let copied = false;

	// Link to share with the opponent so they join as the other color.
	$: opponentLink = id ? `${$page.url.origin}/room?id=${id}&color=${opponentColor}` : '';

	const offerRematch = () => gameState?.offerRematch();
	const acceptRematch = () => gameState?.acceptRematch();
	const claimVictory = () => gameState?.claimVictory();
	const reload = () => location.reload();

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
		if (tick) clearInterval(tick);
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
			{:else if status === 'rejected'}
				<div class="space-y-3" role="alert">
					<p class="font-semibold">Room not found or full</p>
					<p class="text-muted-foreground">
						This game has expired, already has two players, or the link is invalid.
					</p>
					<Button on:click={leave}>Back to Home</Button>
				</div>
			{:else if status === 'replaced'}
				<div class="space-y-3" role="alert">
					<p class="font-semibold">This game is open somewhere else</p>
					<p class="text-muted-foreground">Your seat was taken over by another tab or window.</p>
					<div class="flex justify-center gap-2">
						<Button on:click={reload}>Play here instead</Button>
						<Button variant="ghost" on:click={leave}>Back to Home</Button>
					</div>
				</div>
			{:else if gameState && connecting}
				<p role="status" aria-live="polite" class="text-muted-foreground motion-safe:animate-pulse">
					Connecting…
				</p>
			{:else if gameState}
				<p class="text-sm text-muted-foreground">
					You are playing as <span class="font-semibold text-primary">{playerColor}</span>
				</p>

				{#if waiting}
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
					{#if opponentAway}
						<div role="status" aria-live="polite" class="mx-auto max-w-md space-y-2">
							<p class="font-semibold text-amber-600 dark:text-amber-400">Opponent disconnected</p>
							{#if claimInSeconds !== null && claimInSeconds > 0}
								<p class="text-sm text-muted-foreground">
									You can claim the win in {claimInSeconds}s if they don't return.
								</p>
							{:else if claimInSeconds === 0}
								<Button on:click={claimVictory}>Claim victory</Button>
							{/if}
						</div>
					{/if}
					<div class="mx-auto grid w-4/5 grid-flow-row place-items-center gap-y-2 md:grid-flow-col">
						{#if !isUnlimited}
							<div>
								My Time: <span
									class={isLow(myTime, lowTime)
										? 'font-semibold text-red-600 motion-safe:animate-pulse dark:text-red-400'
										: 'font-semibold text-primary'}
								>
									{formatTime(myTime)}
								</span>
							</div>
							<div>
								Opponent Time: <span
									class={isLow(opponentTime, lowTime)
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
			{#if gameState && !waiting && !terminal}
				<Button variant="outline" on:click={flipBoard} aria-label="Flip board" title="Flip Board">
					<Icon icon="radix-icons:loop" />
				</Button>
				{#if started && !gameOver}
					<Button variant="outline" on:click={resign} aria-label="Resign game" title="Resign">
						<Icon icon="radix-icons:flag" class="mr-2" /> Resign
					</Button>
				{/if}
			{/if}
			{#if gameOver && !terminal}
				{#if opponentOfferedRematch}
					<Button on:click={acceptRematch}>Accept Rematch</Button>
				{:else if rematchOffered}
					<Button disabled>Rematch Offered</Button>
				{:else}
					<Button on:click={offerRematch} disabled={!opponentConnected}>Offer Rematch</Button>
				{/if}
				<Button variant="ghost" on:click={leave}>Leave</Button>
			{/if}
		</div>
	</section>

	{#if gameState && view && !waiting && !terminal}
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
