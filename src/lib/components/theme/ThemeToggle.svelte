<script lang="ts">
	import Sun from 'svelte-radix/Sun.svelte';
	import Moon from 'svelte-radix/Moon.svelte';
	import { resetMode, setMode } from 'mode-watcher';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { BOARD_THEMES, boardTheme, type BoardTheme } from '$lib/stores/boardTheme';
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class={buttonVariants({ variant: 'outline', size: 'icon' })}>
		<Sun
			class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
			aria-hidden="true"
		/>
		<Moon
			class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
			aria-hidden="true"
		/>
		<span class="sr-only">Toggle theme</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onSelect={() => setMode('light')}>Light</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => setMode('dark')}>Dark</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => resetMode()}>System</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Label>Board</DropdownMenu.Label>
			<DropdownMenu.RadioGroup
				bind:value={() => $boardTheme, (v) => boardTheme.set(v as BoardTheme)}
			>
				{#each BOARD_THEMES as theme (theme.value)}
					<DropdownMenu.RadioItem value={theme.value}>{theme.label}</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
