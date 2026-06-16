<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import Header from '$lib/components/header/Header.svelte';
	import '../app.css';
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
	<meta property="og:title" content="Stale Mates - Play Chess Online" />
	<meta
		property="og:description"
		content="Welcome to Stale-Mates, where chess meets fun for all levels."
	/>
	<meta property="og:url" content="https://stalemates.magedfaiz.xyz" />
	<meta property="og:image" content="https://stalemates.magedfaiz.xyz/imgs/logo/logo.png" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Stale Mates - Play Chess Online" />
	<meta
		name="twitter:description"
		content="Welcome to Stale-Mates, where chess meets fun for all levels."
	/>
	<meta name="twitter:image" content="https://stalemates.magedfaiz.xyz/imgs/logo/logo.png" />
</svelte:head>

<ModeWatcher />

<div class="min-h-screen">
	<Header />

	<main>
		<slot />
	</main>
</div>

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
