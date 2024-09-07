<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { mediaQuery } from 'svelte-legos';

	export let onConfirm: () => void;

	const handleConfirm = () => {
		open = false;
		onConfirm();
	};

	let open = false;
	const isDesktop = mediaQuery('(min-width: 768px)');
</script>

{#if $isDesktop}
	<Dialog.Root bind:open>
		<Dialog.Trigger asChild let:builder>
			<Button variant="secondary" builders={[builder]}>End Game</Button>
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>End Game</Dialog.Title>
				<Dialog.Description>
					Are you sure you want to end the game? This action cannot be undone.
				</Dialog.Description>
			</Dialog.Header>
			<div class="flex justify-end space-x-2">
				<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button on:click={handleConfirm}>End Game</Button>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger asChild let:builder>
			<Button variant="secondary" builders={[builder]}>End Game</Button>
		</Drawer.Trigger>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Dialog.Title>End Game</Dialog.Title>
				<Dialog.Description>
					Are you sure you want to end the game? This action cannot be undone.
				</Dialog.Description>
			</Drawer.Header>
			<div class="flex justify-end space-x-2 px-4 pb-4">
				<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button on:click={handleConfirm}>End Game</Button>
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
