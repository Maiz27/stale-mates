<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
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
	import type { Rejection } from '$lib/websocket/WebSocketManager';
	import { MultiplayerGameState, canOfferDraw } from '$lib/chess/MultiplayerGameState';
	import {
		getInviteToken,
		inviteLink,
		resolveSeatToken,
		seatTokenFromHash,
		wasRoomEnded
	} from '$lib/chess/seat';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { API_NOT_CONFIGURED_MESSAGE } from '$lib/apiConfig';

	const id = page.url.searchParams.get('id');

	let gameState = $state.raw<MultiplayerGameState | undefined>(undefined);
	// Raw: the view is an immutable snapshot replaced on every patch; deep-proxying
	// it would defeat the board's reference-equality optimisation.
	let view = $state.raw<GameView | undefined>(undefined);
	let boardFlipped = $state(false);
	// No seat token for this room in this browser (e.g. a link without its #seat=… part).
	let missingSeat = $state(false);
	// ...because this tab was told the room is gone (the seat was cleared then) (CR3-7).
	let roomEnded = $state(false);
	// Only the creator's tab holds the opponent's invite token.
	let opponentLink = $state('');
	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	// Our colour is assigned by the server; until the `seat` arrives show white.
	const playerColor = $derived(view?.player ?? 'white');

	// Everything the page renders is projected from the single view-model.
	const status = $derived(view?.connectionStatus ?? 'connecting');
	const started = $derived(view?.started ?? false);
	const opponentConnected = $derived(view?.opponentConnected ?? false);
	const reconnecting = $derived(status === 'reconnecting');
	// Game actions need a live socket: while (re)connecting they'd be dropped, so
	// their controls are disabled and say why (CR3-3).
	const online = $derived(status === 'open');
	const OFFLINE_REASON = 'Reconnecting…';
	const offline = $derived(
		online ? {} : { disabled: true, title: OFFLINE_REASON, 'aria-describedby': 'offline-reason' }
	);
	const terminal = $derived(status === 'rejected' || status === 'replaced');
	const gameOver = $derived(view?.gameOver.isOver ?? false);
	const opponentOfferedRematch = $derived(view?.rematchOffer ?? false);
	const rematchOffered = $derived(view?.myRematchOffer ?? false);
	const isUnlimited = $derived(view?.clock.isUnlimited ?? true);
	const myTime = $derived(view?.clock.myClock ?? 0);
	const opponentTime = $derived(view?.clock.opponentClock ?? 0);
	const lowTime = $derived(view?.clock.lowTimeThreshold ?? 0);
	const sanHistory = $derived(view?.sanHistory ?? []);
	// Before the first game starts (and with no result yet) we're waiting for the opponent.
	const waiting = $derived(!started && !gameOver && !opponentConnected);
	// Nothing heard from the server yet.
	const connecting = $derived(status === 'connecting' && waiting);
	// The opponent left mid-game: show a badge and, after the grace period, let me claim the win.
	const opponentAway = $derived(!waiting && !opponentConnected && !gameOver);
	const claimableAt = $derived(view?.opponentClaimableAt ?? null);

	// 1 Hz clock for the abandonment countdown (started in onMount).
	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval> | null = null;
	const claimInSeconds = $derived(
		claimableAt === null ? null : Math.max(0, Math.ceil((claimableAt - now) / 1000))
	);

	// Low-time warning uses the server's per-time-control threshold (not a hardcoded 10s).
	const isLow = (seconds: number, threshold: number) => threshold > 0 && seconds <= threshold;

	const opponentColor = $derived(
		(playerColor === 'white' ? 'black' : 'white') as 'white' | 'black'
	);
	const turn = $derived(view?.turn ?? 'white');
	const running = $derived(started && !gameOver);
	// Timed games: no clock runs until each side has made its first move; the side
	// to move has a window instead, after which the server aborts the game (CR3-4).
	const firstMoveDeadline = $derived(running ? (view?.firstMoveDeadline ?? null) : null);
	const firstMoveIn = $derived(
		firstMoveDeadline === null ? null : Math.max(0, Math.ceil((firstMoveDeadline - now) / 1000))
	);
	const FIRST_MOVE_STATUS = 'Waiting for first move';
	const opponentStatus = $derived(
		opponentAway
			? 'Disconnected'
			: firstMoveDeadline !== null && turn === opponentColor
				? FIRST_MOVE_STATUS
				: ''
	);
	const myStatus = $derived(
		firstMoveDeadline !== null && turn === playerColor ? FIRST_MOVE_STATUS : ''
	);
	const whiteName = $derived(playerColor === 'white' ? 'You' : 'Opponent');
	const blackName = $derived(playerColor === 'black' ? 'You' : 'Opponent');

	let copied = $state(false);

	const offerRematch = () => gameState?.offerRematch();
	const acceptRematch = () => gameState?.acceptRematch();
	const claimVictory = () => gameState?.claimVictory();
	const offerDraw = () => gameState?.offerDraw();
	const acceptDraw = () => gameState?.acceptDraw();
	const declineDraw = () => gameState?.declineDraw();
	const drawOffer = $derived(view?.drawOffer ?? null);
	// After a declined offer, another needs a move first (the server's rule).
	const drawOfferable = $derived(view ? canOfferDraw(view) : false);
	const reload = () => location.reload();

	// What to tell the player when the server refused the connection (CR-12).
	const REJECTION_COPY: Record<Rejection, { title: string; detail: string; retry: boolean }> = {
		notFound: {
			title: 'Room not found or full',
			detail: 'This game has expired, already has two players, or the link is invalid.',
			retry: false
		},
		rateLimited: {
			title: 'Disconnected: too many messages',
			detail: 'The server closed this connection for sending messages too quickly.',
			retry: true
		},
		tooManyConnections: {
			title: 'Too many open games',
			detail:
				'Your network has too many game connections open. Close some other game tabs and try again.',
			retry: true
		},
		origin: {
			title: "Can't reach the game server",
			detail: "This site isn't allowed to connect to the game server.",
			retry: false
		},
		other: {
			title: "Couldn't join the game",
			detail: 'The server refused the connection.',
			retry: true
		},
		unconfigured: {
			title: "Can't reach the game server",
			detail: API_NOT_CONFIGURED_MESSAGE,
			retry: false
		},
		unreachable: {
			title: 'Lost connection to the game server',
			detail:
				"We couldn't reconnect for a couple of minutes. Check your connection and try again — your seat is kept.",
			retry: true
		}
	};
	const rejectionCopy = $derived(REJECTION_COPY[view?.rejection ?? 'notFound']);

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

		// An invite link carries the seat token in the fragment. Strip it from the
		// address bar so it isn't left in history or accidentally re-shared. A seat
		// this browser already holds for the room wins over the link's token, so
		// reopening the room (or your own / a spent invite link) resumes your seat;
		// otherwise the link's token is stored for this room (CR-5).
		const fromHash = seatTokenFromHash(location.hash);
		if (fromHash) {
			history.replaceState(history.state, '', location.pathname + location.search);
		}
		const token = resolveSeatToken(id, fromHash);
		if (!token) {
			if (wasRoomEnded(id)) roomEnded = true;
			else missingSeat = true;
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
			<h1 class="text-3xl leading-tight font-black md:text-4xl">Play Friend: Friendly Duel</h1>

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
					<Button onclick={leave}>Back to Home</Button>
				</div>
			{:else if roomEnded}
				<div class="space-y-3" role="alert">
					<p class="font-semibold">Room not found or ended</p>
					<p class="text-muted-foreground">
						This game has ended or expired, or your seat in it is no longer valid. Start a new game
						from the home page.
					</p>
					<Button onclick={leave}>Back to Home</Button>
				</div>
			{:else if missingSeat}
				<div class="space-y-3" role="alert">
					<p class="font-semibold">This invite link is incomplete</p>
					<p class="text-muted-foreground">
						Ask your friend to send the full link again, or start a new game.
					</p>
					<Button onclick={leave}>Back to Home</Button>
				</div>
			{:else if status === 'rejected'}
				<div class="space-y-3" role="alert">
					<p class="font-semibold">{rejectionCopy.title}</p>
					<p class="text-muted-foreground">{rejectionCopy.detail}</p>
					<div class="flex justify-center gap-2">
						{#if rejectionCopy.retry}
							<Button onclick={reload}>Try again</Button>
						{/if}
						<Button variant={rejectionCopy.retry ? 'ghost' : 'default'} onclick={leave}
							>Back to Home</Button
						>
					</div>
				</div>
			{:else if status === 'replaced'}
				<div class="space-y-3" role="alert">
					<p class="font-semibold">This game is open somewhere else</p>
					<p class="text-muted-foreground">
						You opened this game in another tab or window, so this one was disconnected. Keep
						playing there, or move the game back here.
					</p>
					<div class="flex justify-center gap-2">
						<Button onclick={reload}>Play here instead</Button>
						<Button variant="ghost" onclick={leave}>Back to Home</Button>
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
								onfocus={(e) => e.currentTarget.select()}
							/>
							<div class="flex flex-wrap items-center justify-center gap-2">
								{#if canShare}
									<Button onclick={shareInvite}>
										<Share1 class="mr-2" aria-hidden="true" /> Share invite
									</Button>
								{/if}
								<Button variant="outline" onclick={copyInvite} aria-label="Copy invite link">
									<Copy class="mr-2" aria-hidden="true" />
									{copied ? 'Link copied!' : 'Copy invite link'}
								</Button>
								<Button variant="ghost" onclick={leave}>Leave</Button>
							</div>
							<p class="text-xs text-muted-foreground" aria-live="polite">
								{copied
									? 'Invite link copied to your clipboard.'
									: 'Send the link to a friend — it works once, for one opponent.'}
							</p>
						{:else}
							<Button variant="ghost" onclick={leave}>Leave</Button>
						{/if}
					</div>
				{:else}
					{#if opponentAway}
						<div role="status" aria-live="polite" class="mx-auto max-w-md space-y-2">
							<p class="font-semibold text-amber-600 dark:text-amber-400">Opponent disconnected</p>
							{#if firstMoveDeadline !== null}
								<!-- No win to claim before both first moves: the game is aborted instead. -->
							{:else if claimInSeconds !== null && claimInSeconds > 0}
								<p class="text-sm text-muted-foreground">
									You can claim the win in {claimInSeconds}s if they don't return.
								</p>
							{:else if claimInSeconds === 0}
								<Button onclick={claimVictory} {...offline}>Claim victory</Button>
							{/if}
						</div>
					{/if}
					{#if isUnlimited}
						<p class="text-sm text-muted-foreground">Untimed game</p>
					{:else if firstMoveIn !== null}
						<p class="text-sm text-muted-foreground" data-testid="first-move">
							{#if turn === playerColor}
								Clocks start after each side's first move. Make yours within
								<span class="font-semibold tabular-nums">{firstMoveIn}s</span> or the game is aborted.
							{:else}
								Clocks start after each side's first move. Waiting for your opponent's — the game is
								aborted in <span class="font-semibold tabular-nums">{firstMoveIn}s</span> if they don't
								move.
							{/if}
						</p>
					{/if}
				{/if}
			{/if}
		</div>

		<div class="flex flex-wrap items-center justify-center gap-2">
			{#if gameState && !waiting && !terminal}
				<Button variant="outline" onclick={flipBoard} aria-label="Flip board" title="Flip board">
					<Loop aria-hidden="true" />
				</Button>
				{#if started && !gameOver}
					<ConfirmAction
						onConfirm={resign}
						triggerLabel="Resign"
						triggerVariant="outline"
						disabled={!online}
						disabledReason={OFFLINE_REASON}
						title="Resign"
						description="Resign this game? Your opponent will be awarded the win."
						confirmLabel="Resign"
					>
						{#snippet icon()}<Flag class="mr-2" />{/snippet}
					</ConfirmAction>
					{#if drawOffer === 'mine'}
						<Button variant="outline" disabled>Draw offered</Button>
					{:else if drawOffer === null}
						<Button
							variant="outline"
							onclick={offerDraw}
							disabled={!drawOfferable}
							title={drawOfferable ? 'Offer a draw' : 'You can offer a draw again after a move'}
							{...offline}>½ Offer draw</Button
						>
					{/if}
				{/if}
			{/if}
			{#if gameOver && !terminal}
				{#if opponentOfferedRematch}
					<Button onclick={acceptRematch} {...offline}>Accept Rematch</Button>
				{:else if rematchOffered}
					<Button disabled>Rematch Offered</Button>
				{:else}
					<Button onclick={offerRematch} disabled={!opponentConnected} {...offline}
						>Offer Rematch</Button
					>
				{/if}
				<Button variant="ghost" onclick={leave}>Leave</Button>
			{/if}
		</div>
	</section>

	{#if drawOffer === 'opponent' && started && !gameOver}
		<div
			role="alert"
			class="mx-auto flex max-w-md flex-wrap items-center justify-center gap-2 rounded-md border border-primary p-3"
		>
			<span class="font-semibold">Your opponent offers a draw.</span>
			<Button onclick={acceptDraw} {...offline}>Accept</Button>
			<Button variant="outline" onclick={declineDraw} {...offline}>Decline</Button>
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
						status={myStatus}
					/>
				{/if}
				<ChessBoard
					{view}
					{playerColor}
					{boardFlipped}
					onmove={(move) => gameState?.handlePlayerMove(move)}
					onpromotion={(p) => gameState?.completePromotion(p)}
					onpromotioncancel={() => gameState?.clearPromotion()}
				/>
				{#if !boardFlipped}
					<PlayerBar
						name="You"
						color={playerColor}
						clock={isUnlimited ? null : myTime}
						active={running && turn === playerColor}
						low={!isUnlimited && isLow(myTime, lowTime)}
						status={myStatus}
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
					onmove={(move) => gameState?.submitMove(move)}
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

<!-- Describes the controls disabled while the connection is down (CR3-3). -->
<span id="offline-reason" class="sr-only">Reconnecting…</span>

<!-- Transient notices, e.g. an action that couldn't be sent while reconnecting (CR3-3). -->
<div
	role="status"
	aria-live="polite"
	class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
>
	{#if view?.notice}
		<p
			class="rounded-md border border-amber-500 bg-background px-4 py-2 text-sm font-semibold shadow-lg"
		>
			{view.notice}
		</p>
	{/if}
</div>
