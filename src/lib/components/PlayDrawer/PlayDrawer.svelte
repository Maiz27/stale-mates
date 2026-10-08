<script lang="ts">
	import { goto } from '$app/navigation';
	import { mediaQuery } from 'svelte-legos';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ColorSelector from '../controls/ColorSelector.svelte';
	import type { Color } from 'chessground/types';
	import TimeSelector from '../controls/TimeSelector.svelte';
	import type { CreateGameResponse } from '$lib/chess/protocol';
	import { setInviteToken, setSeatToken } from '$lib/chess/seat';

	let open = false;
	let color: Color | 'random' = 'white';
	let time = 0;
	let errorMessage = '';
	let loading = false;

	const isDesktop = mediaQuery('(min-width: 768px)');
	const title = 'Play Friend: Friendly Duel';
	const description =
		'Match wits with friends in casual or competitive games. Enjoy chess together and improve your skills!';
	const extraOptions = [{ value: 'random', label: 'Random Color' }];

	/**
	 * Create the room and go straight to it: the room page shows the invite link
	 * (copy / share) while it waits, so there's no separate "Join Game" step.
	 * The server picks colours (incl. 'random') and returns one seat token for us
	 * and one for the invite link; both stay in this tab's sessionStorage.
	 */
	async function createGame() {
		if (loading) return;

		loading = true;
		errorMessage = '';
		try {
			const response = await fetch(`${import.meta.env.VITE_API_URL}/game/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ time, color })
			});
			if (!response.ok) throw new Error('Failed to create game');

			const { id, you, invite } = (await response.json()) as CreateGameResponse;
			setSeatToken(id, you.token);
			setInviteToken(id, invite.token);
			open = false;
			await goto(`/room?id=${encodeURIComponent(id)}`);
		} catch (error) {
			console.error('Error creating game:', error);
			errorMessage = 'Failed to create game. Please try again.';
		} finally {
			loading = false;
		}
	}

	function resetState() {
		color = 'white';
		time = 0;
		errorMessage = '';
	}

	$: if (!open) resetState();

	const handleColorChange = (event: CustomEvent) => {
		color = event.detail.value;
	};

	const handleTimeChange = (event: CustomEvent) => {
		time = event.detail.value;
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
				</div>
				{#if errorMessage}
					<p class="text-sm text-red-500">{errorMessage}</p>
				{/if}
				<Button
					class={`w-full ${loading ? 'animate-pulse' : ''}`}
					disabled={loading}
					on:click={createGame}>{loading ? 'Creating…' : 'Create Game'}</Button
				>
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
				</div>
				{#if errorMessage}
					<p class="text-sm text-red-500">{errorMessage}</p>
				{/if}
				<Button
					class={`w-full ${loading ? 'animate-pulse' : ''}`}
					disabled={loading}
					on:click={createGame}>{loading ? 'Creating…' : 'Create Game'}</Button
				>
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
