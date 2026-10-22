<script lang="ts">
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';
	import BrandMark from '$lib/components/brand/BrandMark.svelte';
	import SoundToggle from './SoundToggle.svelte';
	import { resolve } from '$app/paths';
</script>

<header class="flex w-full items-center justify-between border-b p-4">
	<div class="mx-auto flex w-full max-w-7xl items-center justify-between">
		<a href={resolve('/')} class="flex items-center gap-2.5" aria-label="Stalemates home">
			<BrandMark class="h-9 w-[1.4rem]" />
			<span class="text-xl font-bold tracking-[-0.01em]">Stalemates</span>
		</a>
		<div class="flex items-center gap-2">
			<SoundToggle />
			<ThemeToggle />
		</div>
	</div>
</header>
