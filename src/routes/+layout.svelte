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
</svelte:head>

<ModeWatcher />

<div class="min-h-screen">
	<Header />

	<main>
		<slot />
	</main>
</div>

<footer></footer>
