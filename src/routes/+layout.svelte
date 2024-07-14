<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import Header from '$lib/components/header/Header.svelte';
	import '../app.css';
</script>

<ModeWatcher />

<div class="min-h-screen">
	<Header />

	<main class="p-6">
		<slot />
	</main>
</div>

<footer></footer>
