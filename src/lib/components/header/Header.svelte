<script lang="ts">
	// import * as Avatar from '$lib/components/ui/avatar';
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';
</script>

<header class="bg-base-100 flex w-full items-center justify-between border-b p-4">
	<div class="mx-auto flex w-full max-w-7xl items-center justify-between">
		<div class="flex items-center gap-2">
			<a href="/" class="text-xl font-bold">
				<span class="text-primary">Stale Mates</span>
			</a>
		</div>
		<div class="flex items-center gap-2">
			<!-- <Avatar.Root>
				<Avatar.Image src="https://github.com/shadcn.png" alt="@shadcn" />
				<Avatar.Fallback>CN</Avatar.Fallback>
			</Avatar.Root> -->
			<ThemeToggle />
		</div>
	</div>
</header>
