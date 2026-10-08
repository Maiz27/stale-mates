<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import Header from '$lib/components/header/Header.svelte';
	import { sweepLegacyCookies } from '$lib/legacyCookies';
	import '../app.css';

	let { children }: { children: Snippet } = $props();

	// Drop the old version's never-expiring `<roomId>-playerId` cookies (CR3-8).
	onMount(() => {
		sweepLegacyCookies();
	});
</script>

<svelte:head>
	<title>Stale Mates - Play Chess Online</title>
	<meta
		name="description"
		content="Welcome to Stale-Mates, where chess meets fun for all levels."
	/>

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Stalemates" />
	<meta
		property="og:description"
		content="Welcome to Stale-Mates, where chess meets fun for all levels."
	/>
	<meta property="og:url" content={`https://stalemates.magedfaiz.xyz${page.url.pathname}`} />
	<meta property="og:image" content="https://stalemates.magedfaiz.xyz/imgs/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Stale Mates - Play Chess Online" />
	<meta
		name="twitter:description"
		content="Welcome to Stale-Mates, where chess meets fun for all levels."
	/>
	<meta name="twitter:image" content="https://stalemates.magedfaiz.xyz/imgs/og-image.png" />
</svelte:head>

<ModeWatcher />

<!-- Sticky-footer layout: the footer sits at the bottom of a short page and after the content otherwise. -->
<div class="flex min-h-screen flex-col">
	<Header />

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="border-t py-6 text-center text-sm text-muted-foreground">
		<p>
			Stalemates · Open source under GPL-3.0 ·
			<a
				href="https://github.com/Maiz27/stale-mates"
				target="_blank"
				rel="noopener noreferrer"
				class="underline hover:text-foreground">GitHub</a
			>
		</p>
	</footer>
</div>
