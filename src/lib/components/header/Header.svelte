<script lang="ts">
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';
</script>

<header class="bg-base-100 flex w-full items-center justify-between border-b p-4">
	<div class="mx-auto flex w-full max-w-7xl items-center justify-between">
		<a href="/" class="flex items-center">
			<img src="/imgs/logo/logo.png" alt="Stale Mates logo" title="Stale Mates" class="h-12 w-12" />
			<span class="text-xl font-bold">
				<span class="text-primary">Stale Mates</span>
			</span>
		</a>
		<div class="flex items-center gap-2">
			<ThemeToggle />
		</div>
	</div>
</header>
