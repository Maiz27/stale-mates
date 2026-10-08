<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button, buttonVariants, type ButtonVariant } from '$lib/components/ui/button/index.js';
	import { isDesktop } from '$lib/media';

	/**
	 * A trigger button that asks for confirmation (dialog on desktop, drawer on
	 * mobile) before running `onConfirm`. Used for destructive actions like
	 * ending or resigning a game.
	 */
	let {
		onConfirm,
		triggerLabel,
		triggerAriaLabel = undefined,
		title,
		description,
		confirmLabel = undefined,
		triggerVariant = 'secondary',
		disabled = false,
		disabledReason = undefined,
		icon = undefined
	}: {
		onConfirm: () => void;
		triggerLabel: string;
		/** Accessible name for an icon-only trigger. */
		triggerAriaLabel?: string;
		title: string;
		description: string;
		confirmLabel?: string;
		triggerVariant?: ButtonVariant;
		disabled?: boolean;
		/** Why the trigger is disabled (tooltip + accessible description), e.g. "Reconnecting…". */
		disabledReason?: string;
		icon?: Snippet;
	} = $props();

	let open = $state(false);
	const triggerClass = $derived(buttonVariants({ variant: triggerVariant }));
	const reason = $derived(disabled ? disabledReason : undefined);
	const reasonId = $props.id();

	const handleConfirm = () => {
		open = false;
		onConfirm();
	};
</script>

{#snippet trigger()}
	{@render icon?.()}
	{triggerLabel}
{/snippet}

{#snippet actions()}
	<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
	<Button onclick={handleConfirm}>{confirmLabel ?? title}</Button>
{/snippet}

{#if reason}
	<span id={reasonId} class="sr-only">{reason}</span>
{/if}

{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Trigger
			class={triggerClass}
			{disabled}
			aria-label={triggerAriaLabel}
			aria-describedby={reason ? reasonId : undefined}
			title={reason ?? triggerAriaLabel}
		>
			{@render trigger()}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<div class="flex justify-end space-x-2">
				{@render actions()}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger
			class={triggerClass}
			{disabled}
			aria-label={triggerAriaLabel}
			aria-describedby={reason ? reasonId : undefined}
			title={reason ?? triggerAriaLabel}
		>
			{@render trigger()}
		</Drawer.Trigger>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>{description}</Drawer.Description>
			</Drawer.Header>
			<div class="flex justify-end space-x-2 px-4 pb-4">
				{@render actions()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
