<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { isDesktop } from '$lib/media';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import ColorSelector from '../controls/ColorSelector.svelte';
	import type { Color } from 'chessground/types';
	import TimeSelector from '../controls/TimeSelector.svelte';
	import type { CreateGameResponse } from '$lib/chess/protocol';
	import { setInviteToken, setSeatToken } from '$lib/chess/seat';

	let open = $state(false);
	let color = $state<Color | 'random'>('white');
	let time = $state(0);
	let errorMessage = $state('');
	let loading = $state(false);

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
			// The room id is a query param (the room page is prerendered), which
			// resolve() can't express; the path part is still resolved.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(`${resolve('/room')}?id=${encodeURIComponent(id)}`);
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

	$effect(() => {
		if (!open) resetState();
	});
</script>

{#snippet form()}
	<div class="space-y-4">
		<ColorSelector
			bind:value={() => color, (v) => (color = v as Color | 'random')}
			{extraOptions}
		/>
		<TimeSelector bind:value={time} />
	</div>
	{#if errorMessage}
		<p class="text-sm text-red-500">{errorMessage}</p>
	{/if}
	<Button class={`w-full ${loading ? 'animate-pulse' : ''}`} disabled={loading} onclick={createGame}
		>{loading ? 'Creating…' : 'Create Game'}</Button
	>
{/snippet}

{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Trigger class={buttonVariants({ variant: 'outline' })}>{title}</Dialog.Trigger>
		<Dialog.Content class="sm:max-w-[425px]">
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<div class="w-full space-y-4">
				{@render form()}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Trigger class={buttonVariants({ variant: 'outline' })}>{title}</Drawer.Trigger>
		<Drawer.Content>
			<Drawer.Header class="text-left">
				<Drawer.Title>{title}</Drawer.Title>
				<Drawer.Description>{description}</Drawer.Description>
			</Drawer.Header>
			<div class="w-full space-y-4 px-4 pb-4">
				{@render form()}
			</div>
		</Drawer.Content>
	</Drawer.Root>
{/if}
