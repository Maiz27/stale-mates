<script lang="ts">
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';
	import { mediaQuery } from 'svelte-legos';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PlayAiForm from './PlayAiForm.svelte';
	import { settingsStore, type GameSettings } from '$lib/stores/gameSettings';

	export let isSave = false;
	export let isGameStarted = false;
	export let onSettingsUpdate: ((settings: GameSettings) => void) | null = null;

	let open = false;
	const isDesktop = mediaQuery('(min-width: 768px)');

	$: title = isGameStarted ? 'Game Settings' : 'Play AI: Adaptive Challenge';
	$: description = isGameStarted
		? 'Adjust your current game settings'
		: 'Face our AI in games that match your style, from relaxed matches to thrilling challenges.';
	$: CTA = isGameStarted ? 'Update Settings' : 'Start Game';

	const handleSubmit = (event: CustomEvent) => {
		const settings: GameSettings = event.detail;
		settingsStore.update(settings);

		if (isSave && onSettingsUpdate) {
			onSettingsUpdate(settings);
		} else {
			goto('/ai');
		}

		open = false;
	};
</script>

{#if $isDesktop}
	<Dialog.Root bind:open>
		<Dialog.Trigger asChild let:builder>
			<Button builders={[builder]} variant={isSave ? 'outline' : 'default'}>
				{#if isSave}
					<Icon icon="radix-icons:gear" />
				{:else}
					{title}
				{/if}
			</Button>
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>
					{description}
				</Dialog.Description>
			</Dialog.Header>
			<PlayAiForm {isGameStarted} settings={$settingsStore} {CTA} on:submit={handleSubmit} />
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger asChild let:builder>
			<Button builders={[builder]} variant={isSave ? 'outline' : 'default'}>
				{#if isSave}
					<Icon icon="radix-icons:gear" />
				{:else}
					{title}
				{/if}
			</Button>
		</Drawer.Trigger>
		<Drawer.Content class="pb-4">
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>
					{description}
				</Drawer.Description>
			</Drawer.Header>
			<PlayAiForm {isGameStarted} settings={$settingsStore} {CTA} on:submit={handleSubmit} />
		</Drawer.Content>
	</Drawer.Root>
{/if}
