<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	/**
	 * The Stalemates symbol ("Split King"): one king, two halves, held together only by
	 * the crown. Cropped to the drawn bounds of the 256 master (`branding/sm-king-symbol.svg`)
	 * so the mark fills its box. The left half and the crown take the text colour; the right
	 * half carries the brand accent unless `mono` is set.
	 */
	let {
		mono = false,
		class: className,
		...rest
	}: SVGAttributes<SVGSVGElement> & { mono?: boolean } = $props();

	// Decorative unless the consumer names it (aria-label or aria-labelledby).
	const named = $derived(Boolean(rest['aria-label'] || rest['aria-labelledby']));
</script>

<svg
	viewBox="56 12 144 232"
	fill="currentColor"
	aria-hidden={named ? undefined : 'true'}
	role={named ? 'img' : undefined}
	focusable="false"
	class={cn('h-[1em] w-[0.62em]', className)}
	{...rest}
>
	<g transform="translate(128 0)">
		<path
			data-part="left"
			d="M-5 60.23C-28.28 62.39 -44 79.7 -44 104H-50V114H-24V126H-40V138H-28C-26 166 -58 192 -58 208H-60V222H-66V244H-72H0V208H-5Z"
		/>
		<path
			data-part="right"
			class={mono ? undefined : 'fill-primary'}
			d="M5 60.23C28.28 62.39 44 79.7 44 104H50V114H24V126H40V138H28C26 166 58 192 58 208H60V222H66V244H72H0V208H5Z"
		/>
		<path data-part="crown" d="M-11 12H11V24H28V40H11V62H-11V40H-28V24H-11Z" />
	</g>
</svg>
