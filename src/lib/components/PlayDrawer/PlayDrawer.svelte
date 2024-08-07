<script lang="ts">
	import { mediaQuery } from 'svelte-legos';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let open = false;
	const isDesktop = mediaQuery('(min-width: 768px)');
	const title = 'Play Friend: Friendly Duel';
	const description =
		'Match wits with friends in casual or competitive games. Enjoy chess together and improve your skills!';
</script>

{#if $isDesktop}
	<Dialog.Root bind:open>
		<Dialog.Trigger asChild let:builder>
			<Button builders={[builder]} variant="outline">{title}</Button>
		</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>
					{description}
				</Dialog.Description>
			</Dialog.Header>
			<p>Work in progress, stay tuned!</p>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger asChild let:builder>
			<Button variant="outline" builders={[builder]}>{title}</Button>
		</Drawer.Trigger>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>
					{description}
				</Drawer.Description>
			</Drawer.Header>
			<p>Work in progress, stay tuned!</p>
		</Drawer.Content>
	</Drawer.Root>
{/if}
