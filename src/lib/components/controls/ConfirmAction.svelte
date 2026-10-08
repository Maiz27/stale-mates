<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import { mediaQuery } from 'svelte-legos';

	/**
	 * A trigger button that asks for confirmation (dialog on desktop, drawer on
	 * mobile) before running `onConfirm`. Used for destructive actions like
	 * ending or resigning a game.
	 */
	export let onConfirm: () => void;
	export let triggerLabel: string;
	/** Accessible name for an icon-only trigger. */
	export let triggerAriaLabel: string | undefined = undefined;
	export let title: string;
	export let description: string;
	export let confirmLabel = title;
	export let triggerVariant: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' =
		'secondary';
	export let disabled = false;

	let open = false;
	const isDesktop = mediaQuery('(min-width: 768px)');

	const handleConfirm = () => {
		open = false;
		onConfirm();
	};
</script>

{#if $isDesktop}
	<Dialog.Root bind:open>
		<Dialog.Trigger asChild let:builder>
			<Button
				variant={triggerVariant}
				builders={[builder]}
				{disabled}
				aria-label={triggerAriaLabel}
				title={triggerAriaLabel}
			>
				<slot name="icon" />
				{triggerLabel}
			</Button>
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<div class="flex justify-end space-x-2">
				<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button on:click={handleConfirm}>{confirmLabel}</Button>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger asChild let:builder>
			<Button
				variant={triggerVariant}
				builders={[builder]}
				{disabled}
				aria-label={triggerAriaLabel}
				title={triggerAriaLabel}
			>
				<slot name="icon" />
				{triggerLabel}
			</Button>
		</Drawer.Trigger>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>{description}</Drawer.Description>
			</Drawer.Header>
			<div class="flex justify-end space-x-2 px-4 pb-4">
				<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button on:click={handleConfirm}>{confirmLabel}</Button>
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
