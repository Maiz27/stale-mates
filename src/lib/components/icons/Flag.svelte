<script lang="ts">
	// Radix Icons has no flag glyph; a matching 15×15 stroke icon for "Resign".
	let { class: className = '', size = 15 }: { class?: string; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 15 15"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
	class={className}
>
	<path
		d="M3.5 13.5V2M3.5 2.5h7.25l-1.75 2.5 1.75 2.5H3.5"
		stroke="currentColor"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
