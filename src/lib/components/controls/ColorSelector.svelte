<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as Select from '$lib/components/ui/select';
	import type { Color } from 'chessground/types';

	let color: Color = 'white';

	const colorOptions = [
		{ value: 'white', label: 'White' },
		{ value: 'black', label: 'Black' }
	];

	const dispatch = createEventDispatcher();

	function handleColorChange(selected: { value: string } | undefined) {
		if (selected) {
			const { value } = selected;
			dispatch('colorChange', { value });
		}
	}
</script>

<div class="flex items-center gap-2">
	<label for="color">Color: </label>
	<Select.Root
		items={colorOptions}
		onSelectedChange={handleColorChange}
		selected={colorOptions.find((option) => option.value === color)}
	>
		<Select.Trigger class="w-[180px]">
			<Select.Value placeholder="Select Color" />
		</Select.Trigger>
		<Select.Content>
			{#each colorOptions as option}
				<Select.Item value={option.value}>{option.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
