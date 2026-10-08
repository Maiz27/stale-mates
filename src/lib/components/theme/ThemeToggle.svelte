<script lang="ts">
	import Sun from 'svelte-radix/Sun.svelte';
	import Moon from 'svelte-radix/Moon.svelte';

	import { resetMode, setMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { BOARD_THEMES, boardTheme, type BoardTheme } from '$lib/stores/boardTheme';

	// bits-ui's radio group binds a plain string.
	let board: string = $boardTheme;
	$: boardTheme.set(board as BoardTheme);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger asChild let:builder class="border-none">
		<Button builders={[builder]} variant="outline" size="icon">
			<Sun
				class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
			/>
			<Moon
				class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
			/>
			<span class="sr-only">Toggle theme</span>
		</Button>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item on:click={() => setMode('light')}>Light</DropdownMenu.Item>
		<DropdownMenu.Item on:click={() => setMode('dark')}>Dark</DropdownMenu.Item>
		<DropdownMenu.Item on:click={() => resetMode()}>System</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Label>Board</DropdownMenu.Label>
		<DropdownMenu.RadioGroup bind:value={board}>
			{#each BOARD_THEMES as theme}
				<DropdownMenu.RadioItem value={theme.value}>{theme.label}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
