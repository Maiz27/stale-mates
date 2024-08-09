<script lang="ts">
	import { goto } from '$app/navigation';
	import { mediaQuery } from 'svelte-legos';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let open = false;
	let link = '';
	const isDesktop = mediaQuery('(min-width: 768px)');
	const title = 'Play Friend: Friendly Duel';
	const description =
		'Match wits with friends in casual or competitive games. Enjoy chess together and improve your skills!';

	async function createGame() {
		try {
			const response = await fetch('http://127.0.0.1:8787/game/create', { method: 'POST' });
			if (!response.ok) throw new Error('Failed to create game');
			const { gameId, playerColor } = await response.json();
			const opponentColor = playerColor === 'white' ? 'black' : 'white';
			link = `${window.location.origin}/game?room=${gameId}&color=${opponentColor}`;

			// You might want to display this shareable link to the user
			console.log('Shareable link:', link);

			// // Redirect the creator to the game page
			// goto(`/game?room=${gameId}&color=${playerColor}`);
		} catch (error) {
			console.error('Error creating game:', error);
			// Handle error (e.g., show an error message to the user)
		}
	}
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
			<div>
				<p>Share this link with your friends to play together:</p>
				<a href={link} target="_blank" rel="noreferrer">{link}</a>
			</div>
			<Button on:click={createGame}>Create Game</Button>
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
			<div>
				<p>Share this link with your friends to play together:</p>
				<a href={link} target="_blank" rel="noreferrer">{link}</a>
			</div>
			<Button on:click={createGame}>Create Game</Button>
		</Drawer.Content>
	</Drawer.Root>
{/if}
