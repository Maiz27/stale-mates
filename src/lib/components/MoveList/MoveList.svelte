<script lang="ts">
	import Copy from 'svelte-radix/Copy.svelte';
	import Download from 'svelte-radix/Download.svelte';
	import { buildPgn, describeMove } from '$lib/chess/pgn';
	import type { GameOver } from '$lib/chess/types';

	// Displays the game's move history in standard algebraic notation (SAN),
	// paired White/Black per row. Doubles as the screen-reader announcement
	// host via the aria-live region below.
	export let moves: string[] = [];
	export let white = 'White';
	export let black = 'Black';
	export let result: GameOver = { isOver: false, winner: null };
	export let event = 'Casual game';

	$: rows = pairMoves(moves);
	$: announcement = moves.length ? describeMove(moves.length - 1, moves[moves.length - 1]) : '';

	let feedback = '';
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

	function pairMoves(list: string[]) {
		const paired: { no: number; white: string; black: string }[] = [];
		for (let i = 0; i < list.length; i += 2) {
			paired.push({
				no: i / 2 + 1,
				white: list[i],
				black: list[i + 1] ?? ''
			});
		}
		return paired;
	}

	const pgn = () => buildPgn({ moves, white, black, result, event });

	function flash(message: string) {
		feedback = message;
		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedbackTimer = setTimeout(() => (feedback = ''), 2000);
	}

	async function copyPgn() {
		try {
			await navigator.clipboard.writeText(pgn());
			flash('PGN copied to clipboard');
		} catch {
			flash('Copy failed — try Download');
		}
	}

	function downloadPgn() {
		const blob = new Blob([pgn()], { type: 'application/x-chess-pgn' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `stalemates-${new Date().toISOString().slice(0, 10)}.pgn`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
		flash('PGN downloaded');
	}
</script>

<div class="flex h-full flex-col rounded-lg border bg-card text-card-foreground">
	<div class="flex items-center justify-between gap-2 border-b px-3 py-2">
		<h2 class="text-sm font-semibold">Moves</h2>
		<div class="flex items-center gap-1">
			<button
				class="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
				on:click={copyPgn}
				disabled={moves.length === 0}
				title="Copy PGN"
			>
				<Copy size="12" aria-hidden="true" /> Copy PGN
			</button>
			<button
				class="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
				on:click={downloadPgn}
				disabled={moves.length === 0}
				title="Download PGN"
				aria-label="Download PGN"
			>
				<Download size="12" aria-hidden="true" /> .pgn
			</button>
		</div>
	</div>

	<p class="px-3 pt-1 text-xs text-primary" role="status" aria-live="polite">{feedback}</p>

	<!-- Announce the latest move to assistive tech -->
	<div class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

	<ol class="max-h-72 flex-1 overflow-y-auto p-2 text-sm md:max-h-[60vh]">
		{#if rows.length === 0}
			<li class="px-2 py-1 text-muted-foreground">No moves yet.</li>
		{:else}
			{#each rows as row (row.no)}
				<li class="grid grid-cols-[2rem_1fr_1fr] gap-1 rounded px-2 py-1 odd:bg-muted/40">
					<span class="text-muted-foreground">{row.no}.</span>
					<span class="font-medium">{row.white}</span>
					<span class="font-medium">{row.black}</span>
				</li>
			{/each}
		{/if}
	</ol>
</div>
