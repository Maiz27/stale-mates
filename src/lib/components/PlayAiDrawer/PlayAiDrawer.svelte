<script lang="ts">
	import { goto } from '$app/navigation';
	import { mediaQuery } from 'svelte-legos';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PlayAiForm from './PlayAiForm.svelte';

	let open = false;
	const isDesktop = mediaQuery('(min-width: 768px)');
	const title = 'Play AI: Adaptive Challenge';
	const description =
		'Face our AI in games that match your style, from relaxed matches to thrilling challenges.';

	const handleSubmit = (event: CustomEvent) => {
		const { color, difficulty, hints, undo } = event.detail;
		goto(`/ai?color=${color}&difficulty=${difficulty}&hints=${hints}&undo=${undo}`);
	};
</script>

{#if $isDesktop}
	<Dialog.Root bind:open>
		<Dialog.Trigger asChild let:builder>
			<Button builders={[builder]}>{title}</Button>
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>
					{description}
				</Dialog.Description>
			</Dialog.Header>
			<PlayAiForm on:submit={handleSubmit} />
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger asChild let:builder>
			<Button builders={[builder]}>{title}</Button>
		</Drawer.Trigger>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>
					{description}
				</Drawer.Description>
			</Drawer.Header>
			<PlayAiForm on:submit={handleSubmit} />
		</Drawer.Content>
	</Drawer.Root>
{/if}
