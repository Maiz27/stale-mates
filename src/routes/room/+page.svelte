<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Copy from 'svelte-radix/Copy.svelte';
	import Share1 from 'svelte-radix/Share1.svelte';
	import Loop from 'svelte-radix/Loop.svelte';
	import Flag from '$lib/components/icons/Flag.svelte';
	import ConfirmAction from '$lib/components/controls/ConfirmAction.svelte';
	import PlayerBar from '$lib/components/game/PlayerBar.svelte';
	import MoveInput from '$lib/components/game/MoveInput.svelte';
	import ChessBoard from '$lib/components/chessBoard/ChessBoard.svelte';
	import MoveList from '$lib/components/MoveList/MoveList.svelte';
	import type { GameView } from '$lib/chess/types';
	import { MultiplayerGameState } from '$lib/chess/MultiplayerGameState';
	import {
		getInviteToken,
		getSeatToken,
		inviteLink,
		seatTokenFromHash,
		setSeatToken
	} from '$lib/chess/seat';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';

	const id = $page.url.searchParams.get('id');

	let gameState: MultiplayerGameState | undefined;
	let view: GameView | undefined;
	let boardFlipped = false;
	// No seat token for this room in this tab (e.g. a link without its #seat=… part).
	let missingSeat = false;
	// Only the creator's tab holds the opponent's invite token.
	let opponentLink = '';
	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	// Our colour is assigned by the server; until the `seat` arrives show white.
	$: playerColor = view?.player ?? 'white';

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

	// 1 Hz clock for the abandonment countdown (started in onMount).
	let now = Date.now();
	let tick: ReturnType<typeof setInterval> | null = null;
	$: claimInSeconds =
		claimableAt === null ? null : Math.max(0, Math.ceil((claimableAt - now) / 1000));

	// Low-time warning uses the server's per-time-control threshold (not a hardcoded 10s).
	const isLow = (seconds: number, threshold: number) => threshold > 0 && seconds <= threshold;

	$: opponentColor = (playerColor === 'white' ? 'black' : 'white') as 'white' | 'black';
	$: turn = view?.turn ?? 'white';
	$: running = started && !gameOver;
	$: opponentStatus = opponentAway ? 'Disconnected' : '';
	$: whiteName = playerColor === 'white' ? 'You' : 'Opponent';
	$: blackName = playerColor === 'black' ? 'You' : 'Opponent';

	let copied = false;

	const offerRematch = () => gameState?.offerRematch();
	const acceptRematch = () => gameState?.acceptRematch();
	const claimVictory = () => gameState?.claimVictory();
	const offerDraw = () => gameState?.offerDraw();
	const acceptDraw = () => gameState?.acceptDraw();
	const declineDraw = () => gameState?.declineDraw();
	$: drawOffer = view?.drawOffer ?? null;
	const reload = () => location.reload();

	async function shareInvite() {
		try {
			await navigator.share({ title: 'Play chess with me on Stale Mates', url: opponentLink });
		} catch {
			// Dismissed or unsupported — the copy button is still there.
		}
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
	const leave = () => goto(resolve('/'));

	onMount(() => {
		if (!id) return; // invalid room — handled in markup
		tick = setInterval(() => (now = Date.now()), 1000);

		// An invite link carries the seat token in the fragment. Move it into this
		// tab's sessionStorage and strip it from the address bar so it isn't left in
		// history or accidentally re-shared.
		const fromHash = seatTokenFromHash(location.hash);
		if (fromHash) {
			setSeatToken(id, fromHash);
			history.replaceState(history.state, '', location.pathname + location.search);
		}
		const token = getSeatToken(id);
		if (!token) {
			missingSeat = true;
			return;
		}
		const invite = getInviteToken(id);
		if (invite) opponentLink = inviteLink(location.origin, id, invite);

		gameState = new MultiplayerGameState({ roomId: id, token });
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
	<!-- Rooms are private, ephemeral and token-gated: keep them out of search results. -->
	<meta name="robots" content="noindex, nofollow" />
	<meta property="og:title" content="Play a Friend · Stale Mates" />
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
			{:else if missingSeat}
				<div class="space-y-3" role="alert">
					<p class="font-semibold">This invite link is incomplete</p>
					<p class="text-muted-foreground">
						Ask your friend to send the full link again, or start a new game.
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
						{#if opponentLink}
							<label class="sr-only" for="invite-link">Invite link</label>
							<Input
								id="invite-link"
								readonly
								value={opponentLink}
								type="url"
								class="text-center"
								on:focus={(e) => e.currentTarget.select()}
							/>
							<div class="flex flex-wrap items-center justify-center gap-2">
								{#if canShare}
									<Button on:click={shareInvite}>
										<Share1 class="mr-2" aria-hidden="true" /> Share invite
									</Button>
								{/if}
								<Button variant="outline" on:click={copyInvite} aria-label="Copy invite link">
									<Copy class="mr-2" aria-hidden="true" />
									{copied ? 'Link copied!' : 'Copy invite link'}
								</Button>
								<Button variant="ghost" on:click={leave}>Leave</Button>
							</div>
							<p class="text-xs text-muted-foreground" aria-live="polite">
								{copied
									? 'Invite link copied to your clipboard.'
									: 'Send the link to a friend — it works once, for one opponent.'}
							</p>
						{:else}
							<Button variant="ghost" on:click={leave}>Leave</Button>
						{/if}
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
					{#if isUnlimited}
						<p class="text-sm text-muted-foreground">Untimed game</p>
					{/if}
				{/if}
			{/if}
		</div>

		<div class="flex flex-wrap items-center justify-center gap-2">
			{#if gameState && !waiting && !terminal}
				<Button variant="outline" on:click={flipBoard} aria-label="Flip board" title="Flip board">
					<Loop aria-hidden="true" />
				</Button>
				{#if started && !gameOver}
					<ConfirmAction
						onConfirm={resign}
						triggerLabel="Resign"
						triggerVariant="outline"
						title="Resign"
						description="Resign this game? Your opponent will be awarded the win."
						confirmLabel="Resign"
					>
						<Flag slot="icon" class="mr-2" />
					</ConfirmAction>
					{#if drawOffer === 'mine'}
						<Button variant="outline" disabled>Draw offered</Button>
					{:else if drawOffer === null}
						<Button variant="outline" on:click={offerDraw} title="Offer a draw">½ Offer draw</Button
						>
					{/if}
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

	{#if drawOffer === 'opponent' && started && !gameOver}
		<div
			role="alert"
			class="mx-auto flex max-w-md flex-wrap items-center justify-center gap-2 rounded-md border border-primary p-3"
		>
			<span class="font-semibold">Your opponent offers a draw.</span>
			<Button on:click={acceptDraw}>Accept</Button>
			<Button variant="outline" on:click={declineDraw}>Decline</Button>
		</div>
	{/if}

	{#if gameState && view && !waiting && !terminal}
		<div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
			<div class="mx-auto w-full max-w-2xl space-y-2">
				{#if !boardFlipped}
					<PlayerBar
						name="Opponent"
						color={opponentColor}
						clock={isUnlimited ? null : opponentTime}
						active={running && turn === opponentColor}
						low={!isUnlimited && isLow(opponentTime, lowTime)}
						status={opponentStatus}
					/>
				{:else}
					<PlayerBar
						name="You"
						color={playerColor}
						clock={isUnlimited ? null : myTime}
						active={running && turn === playerColor}
						low={!isUnlimited && isLow(myTime, lowTime)}
					/>
				{/if}
				<ChessBoard
					{view}
					{playerColor}
					{boardFlipped}
					on:move={(e) => gameState?.handlePlayerMove(e.detail)}
					on:promotion={(e) => gameState?.completePromotion(e.detail)}
					on:promotionCancel={() => gameState?.clearPromotion()}
				/>
				{#if !boardFlipped}
					<PlayerBar
						name="You"
						color={playerColor}
						clock={isUnlimited ? null : myTime}
						active={running && turn === playerColor}
						low={!isUnlimited && isLow(myTime, lowTime)}
					/>
				{:else}
					<PlayerBar
						name="Opponent"
						color={opponentColor}
						clock={isUnlimited ? null : opponentTime}
						active={running && turn === opponentColor}
						low={!isUnlimited && isLow(opponentTime, lowTime)}
						status={opponentStatus}
					/>
				{/if}
				<MoveInput
					fen={view.fen}
					disabled={!running || turn !== playerColor || !!view.promotionMove}
					on:move={(e) => gameState?.submitMove(e.detail)}
				/>
			</div>
			<MoveList
				moves={sanHistory}
				white={whiteName}
				black={blackName}
				result={view.gameOver}
				event="Stale Mates · friendly game"
			/>
		</div>
	{/if}
</div>
