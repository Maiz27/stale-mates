<script lang="ts">
	import { formatTime } from '$lib/utils';

	/** Name + optional clock shown above/below the board. */
	let {
		name,
		color,
		clock = null,
		active = false,
		low = false,
		status = ''
	}: {
		name: string;
		color: 'white' | 'black';
		/** Seconds remaining; omit for untimed games. */
		clock?: number | null;
		/** This side is to move (its clock is running). */
		active?: boolean;
		/** At or below the low-time threshold. */
		low?: boolean;
		/** Optional status text, e.g. "Thinking…" or "Disconnected". */
		status?: string;
	} = $props();

	const clockClass = $derived(
		low
			? `bg-red-600 text-white ${active ? 'motion-safe:animate-pulse' : ''}`
			: active
				? 'bg-primary text-primary-foreground'
				: 'bg-muted'
	);
</script>

<div
	class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
	class:border-primary={active}
>
	<div class="flex min-w-0 items-center gap-2">
		<span
			class="inline-block h-3 w-3 shrink-0 rounded-full border border-foreground/40"
			class:bg-white={color === 'white'}
			class:bg-neutral-900={color === 'black'}
			aria-hidden="true"
		></span>
		<span class="truncate font-semibold">{name}</span>
		<span class="sr-only">({color})</span>
		{#if status}
			<span class="truncate text-xs text-muted-foreground" aria-live="polite">{status}</span>
		{/if}
	</div>
	{#if clock !== null}
		<span
			class="rounded px-2 py-0.5 font-mono text-base tabular-nums {clockClass}"
			aria-label={`${name} clock ${formatTime(clock)}`}
		>
			{formatTime(clock)}
		</span>
	{/if}
</div>
