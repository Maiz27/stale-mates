<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/button/button.svelte';
</script>

<svelte:head>
	<title>{$page.status} · Stale Mates</title>
</svelte:head>

<section class="grid min-h-[calc(100dvh-100px)] w-full place-items-center p-6">
	<div class="flex max-w-md flex-col items-center gap-6 text-center">
		<p class="text-6xl font-black text-primary">{$page.status}</p>
		<h1 class="text-2xl font-bold">
			{$page.status === 404 ? 'Page not found' : 'Something went wrong'}
		</h1>
		<p class="text-muted-foreground">
			{$page.error?.message ?? 'The page you are looking for does not exist or has moved.'}
		</p>
		<Button href="/">Back to Home</Button>
	</div>
</section>
