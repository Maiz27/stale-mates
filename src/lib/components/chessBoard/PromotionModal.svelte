<script lang="ts">
	import { isDesktop } from '$lib/media';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { PROMOTION_OPTIONS } from '$lib/constants';

	let {
		open = $bindable(false),
		onpromotion,
		oncancel
	}: {
		open?: boolean;
		onpromotion: (piece: string) => void;
		oncancel: () => void;
	} = $props();

	const title = 'Choose Promotion Piece';
	const description = 'Choose the piece you want to promote to a queen, rook, bishop, or knight.';

	// Dismissing the dialog/drawer (Esc, outside click, swipe) without picking a
	// piece must cancel the pending promotion, or the board stays locked (SM-2.2).
	let chosen = false;

	function handleOpenChange(next: boolean) {
		if (next) chosen = false;
		else if (!chosen) oncancel();
	}

	function choose(piece: string) {
		chosen = true;
		onpromotion(piece);
		open = false;
	}
</script>

{#if isDesktop.current}
	<Dialog.Root bind:open onOpenChange={handleOpenChange}>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<div class="flex justify-around">
				{#each PROMOTION_OPTIONS as option (option.value)}
					<Button onclick={() => choose(option.value)}>{option.label}</Button>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open onOpenChange={handleOpenChange}>
		<Drawer.Content class="pb-4">
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>{description}</Drawer.Description>
			</Drawer.Header>
			<div class="flex flex-col space-y-2 px-4">
				{#each PROMOTION_OPTIONS as option (option.value)}
					<Button onclick={() => choose(option.value)}>{option.label}</Button>
				{/each}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
