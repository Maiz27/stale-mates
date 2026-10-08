<script lang="ts">
	import Globe from 'svelte-radix/Globe.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import PlayAiDrawer from '$lib/components/PlayAiDrawer/PlayAiDrawer.svelte';
	import PlayDrawer from '$lib/components/PlayDrawer/PlayDrawer.svelte';
</script>

<svelte:head>
	<meta property="og:title" content="Stale Mates - Play Chess Online" />
	<link rel="canonical" href="https://stalemates.magedfaiz.xyz/" />
</svelte:head>

<section class="grid min-h-[calc(100dvh-100px)] w-full place-items-center">
	<div class="flex max-w-6xl flex-col items-center justify-center space-y-8 p-6 text-center">
		<Badge variant="secondary" class="gap-2 px-4 py-2 font-semibold">
			<Globe aria-hidden="true" /> Pushing Chess to the Edge
		</Badge>
		<h1 class="flex flex-col items-center text-4xl font-black leading-tight md:text-5xl">
			<span class="mb-2">Where Chess Gets a</span>
			<span class="text-primary">Checkmate on Boredom</span>
		</h1>

		<p class="max-w-3xl text-lg text-muted-foreground">
			Welcome to Stale-Mates, where chess meets fun for all levels. Enjoy casual games against our
			AI or exciting matches with friends. Whether you're unwinding or honing skills, every move on
			Stale-Mates is a step towards chess enjoyment!
		</p>

		<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
			<PlayAiDrawer />
			<PlayDrawer />
		</div>
	</div>
</section>
