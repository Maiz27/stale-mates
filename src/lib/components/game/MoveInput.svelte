<script lang="ts">
	import { parseMoveInput } from '$lib/chess/moveInput';
	import type { ChessMove } from '$lib/chess/types';

	/**
	 * Keyboard play (audit H8): type a move in SAN ("Nf3", "O-O", "e8=Q") or
	 * coordinates ("e2e4"); it is validated against the current position before
	 * being emitted. Errors are announced via an aria-live region.
	 */
	let {
		fen,
		disabled = false,
		onmove
	}: { fen: string; disabled?: boolean; onmove: (move: ChessMove) => void } = $props();

	let value = $state('');
	let error = $state('');
	const inputId = `move-input-${Math.random().toString(36).slice(2, 8)}`;

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const result = parseMoveInput(value, fen);
		if (!result.ok) {
			error = result.error;
			return;
		}
		error = '';
		value = '';
		onmove(result.move);
	}
</script>

<form class="flex flex-wrap items-center gap-2" onsubmit={submit}>
	<label for={inputId} class="text-sm text-muted-foreground">Type a move:</label>
	<input
		id={inputId}
		bind:value
		{disabled}
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
		placeholder={disabled ? 'Wait for your turn' : 'e4, Nf3, O-O, e2e4'}
		aria-describedby={`${inputId}-help`}
		aria-invalid={error ? 'true' : undefined}
		class="h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:opacity-50"
	/>
	<button
		type="submit"
		{disabled}
		class="h-9 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50">Play</button
	>
	<p
		id={`${inputId}-help`}
		class="w-full text-xs text-red-600 dark:text-red-400"
		aria-live="polite"
	>
		{error}
	</p>
</form>
