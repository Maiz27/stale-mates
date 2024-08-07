<script lang="ts">
	import { mediaQuery } from 'svelte-legos';
	import { createEventDispatcher } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { PROMOTION_OPTIONS } from '$lib/constants';

	export let open = false;
	const dispatch = createEventDispatcher();
	const isDesktop = mediaQuery('(min-width: 768px)');
	const title = 'Choose Promotion Piece';
	const description = 'Choose the piece you want to promote to a queen, rook, bishop, or knight.';

	function handlePromotion(piece: string) {
		dispatch('promotion', { piece });
		open = false;
	}
</script>

{#if $isDesktop}
	<Dialog.Root bind:open>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>
					{description}
				</Dialog.Description>
			</Dialog.Header>
			<div class="flex justify-around">
				{#each PROMOTION_OPTIONS as option}
					<Button on:click={() => handlePromotion(option.value)}>{option.label}</Button>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Content class="pb-4">
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>
					{description}
				</Drawer.Description>
			</Drawer.Header>
			<div class="flex flex-col space-y-2 px-4">
				{#each PROMOTION_OPTIONS as option}
					<Button on:click={() => handlePromotion(option.value)}>{option.label}</Button>
				{/each}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
