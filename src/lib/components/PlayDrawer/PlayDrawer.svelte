<script lang="ts">
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';
	import { mediaQuery } from 'svelte-legos';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ColorSelector from '../controls/ColorSelector.svelte';
	import type { Color } from 'chessground/types';
	import TimeSelector from '../controls/TimeSelector.svelte';

	let open = false;
	let opponentLink = '';
	let playerLink = '';
	let color: Color | 'random' = 'white';
	let time = 0;

	const isDesktop = mediaQuery('(min-width: 768px)');
	const title = 'Play Friend: Friendly Duel';
	const description =
		'Match wits with friends in casual or competitive games. Enjoy chess together and improve your skills!';
	const extraOptions = [{ value: 'random', label: 'Random Color' }];

	async function createGame() {
		try {
			const response = await fetch(`${import.meta.env.VITE_API_URL}/game/create`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					time
				})
			});

			if (!response.ok) throw new Error('Failed to create game');

			const { id } = await response.json();
			const playerColor = color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color;
			const opponentColor = playerColor === 'white' ? 'black' : 'white';
			opponentLink = `${window.location.origin}/room?id=${id}&color=${opponentColor}`;
			playerLink = `${window.location.origin}/room?id=${id}&color=${playerColor}`;
		} catch (error) {
			console.error('Error creating game:', error);
		}
	}

	const handleColorChange = (event: CustomEvent) => {
		color = event.detail.value;
	};

	const handleTimeChange = (event: CustomEvent) => {
		time = event.detail.value;
	};

	const navigateToGame = () => {
		goto(playerLink);
	};

	const copyLink = () => {
		navigator.clipboard.writeText(opponentLink);
	};
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
			<div class="w-full space-y-4">
				<div class="space-y-4">
					<ColorSelector on:colorChange={handleColorChange} {extraOptions} />
					<TimeSelector on:timeChange={handleTimeChange} />
					{#if opponentLink}
						<div>
							<p class="text-sm text-muted-foreground">
								Share this link with your friend to play together:
							</p>
							<div class="relative grid place-items-center">
								<Input
									disabled
									value={opponentLink}
									type="url"
									placeholder="link"
									class="max-w-sm"
								/>
								<div class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
									<button title="Copy Link" on:click={copyLink} class="p-1 hover:bg-muted">
										<Icon icon="radix-icons:copy" font-size="1.2rem" />
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
				{#if opponentLink}
					<Button class="w-full" on:click={navigateToGame}>Join Game</Button>
				{:else}
					<Button class="w-full" on:click={createGame}>Create Game</Button>
				{/if}
			</div>
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
			<div class="w-full space-y-4 px-4 pb-4">
				<div class="space-y-4">
					<ColorSelector on:colorChange={handleColorChange} {extraOptions} />
					<TimeSelector on:timeChange={handleTimeChange} />
					{#if opponentLink}
						<div>
							<p class="text-sm text-muted-foreground">
								Share this link with your friend to play together:
							</p>
							<div class="relative grid place-items-center">
								<Input
									disabled
									value={opponentLink}
									type="url"
									placeholder="link"
									class="max-w-sm"
								/>
								<div class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
									<button title="Copy Link" on:click={copyLink} class="p-1 hover:bg-muted">
										<Icon icon="radix-icons:copy" font-size="1.2rem" />
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
				{#if opponentLink}
					<Button class="w-full" on:click={navigateToGame}>Join Game</Button>
				{:else}
					<Button class="w-full" on:click={createGame}>Create Game</Button>
				{/if}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
