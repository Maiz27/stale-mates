<script lang="ts">
	import Gear from 'svelte-radix/Gear.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { isDesktop } from '$lib/media';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import PlayAiForm from './PlayAiForm.svelte';
	import { settingsStore, type GameSettings } from '$lib/stores/gameSettings';

	let {
		isSave = false,
		isGameStarted = false,
		onSettingsUpdate = null
	}: {
		isSave?: boolean;
		isGameStarted?: boolean;
		onSettingsUpdate?: ((settings: GameSettings) => void) | null;
	} = $props();

	let open = $state(false);

	const title = $derived(isGameStarted ? 'Game Settings' : 'Play AI: Adaptive Challenge');
	const description = $derived(
		isGameStarted
			? 'Adjust your current game settings'
			: 'Face our AI in games that match your style, from relaxed matches to thrilling challenges.'
	);
	const CTA = $derived(isGameStarted ? 'Update Settings' : 'Start Game');
	const triggerClass = $derived(buttonVariants({ variant: isSave ? 'outline' : 'default' }));

	const handleSubmit = (settings: GameSettings) => {
		settingsStore.update(settings);
		if (isSave && onSettingsUpdate) {
			onSettingsUpdate(settings);
		} else {
			goto(resolve('/ai'));
		}
		open = false;
	};
</script>

{#snippet triggerContent()}
	{#if isSave}
		<Gear aria-hidden="true" />
	{:else}
		{title}
	{/if}
{/snippet}

{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Trigger
			class={triggerClass}
			aria-label={isSave ? 'Game settings' : undefined}
			title={isSave ? 'Game settings' : undefined}
		>
			{@render triggerContent()}
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<PlayAiForm {isGameStarted} settings={$settingsStore} {CTA} onsubmit={handleSubmit} />
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger
			class={triggerClass}
			aria-label={isSave ? 'Game settings' : undefined}
			title={isSave ? 'Game settings' : undefined}
		>
			{@render triggerContent()}
		</Drawer.Trigger>
		<Drawer.Content class="pb-4">
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>{description}</Drawer.Description>
			</Drawer.Header>
			<PlayAiForm {isGameStarted} settings={$settingsStore} {CTA} onsubmit={handleSubmit} />
		</Drawer.Content>
	</Drawer.Root>
{/if}
