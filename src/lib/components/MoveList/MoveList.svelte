<script lang="ts">
	// Displays the game's move history in standard algebraic notation (SAN),
	// paired White/Black per row. Doubles as the screen-reader announcement
	// host via the aria-live region below.
	export let moves: string[] = [];

	$: rows = pairMoves(moves);
	$: latest = moves.length ? moves[moves.length - 1] : '';

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

	function copyPgn() {
		navigator.clipboard?.writeText(toPgn(moves));
	}

	function toPgn(list: string[]) {
		let out = '';
		for (let i = 0; i < list.length; i += 2) {
			out += `${i / 2 + 1}. ${list[i]}${list[i + 1] ? ' ' + list[i + 1] : ''} `;
		}
		return out.trim();
	}
</script>

<div class="flex h-full flex-col rounded-lg border bg-card text-card-foreground">
	<div class="flex items-center justify-between border-b px-3 py-2">
		<h2 class="text-sm font-semibold">Moves</h2>
		<button
			class="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
			on:click={copyPgn}
			disabled={moves.length === 0}
			title="Copy PGN"
		>
			Copy PGN
		</button>
	</div>

	<!-- Announce the latest move to assistive tech -->
	<div class="sr-only" aria-live="polite" aria-atomic="true">
		{#if latest}Move: {latest}{/if}
	</div>

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
