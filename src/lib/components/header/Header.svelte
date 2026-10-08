<script lang="ts">
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';
	import SoundToggle from './SoundToggle.svelte';
</script>

<header class="flex w-full items-center justify-between border-b p-4">
	<div class="mx-auto flex w-full max-w-7xl items-center justify-between">
		<a href="/" class="flex items-center gap-1">
			<!-- 96px asset for a 48px slot (2x); the 1024px original was 145 KB. -->
			<picture>
				<source srcset="/imgs/logo/logo-96.webp" type="image/webp" />
				<img
					src="/imgs/logo/logo-96.png"
					alt="Stale Mates logo"
					title="Stale Mates"
					width="48"
					height="48"
					class="h-12 w-12"
				/>
			</picture>
			<span class="text-xl font-bold">
				<span class="text-primary">Stale Mates</span>
			</span>
		</a>
		<div class="flex items-center gap-2">
			<SoundToggle />
			<ThemeToggle />
		</div>
	</div>
</header>
