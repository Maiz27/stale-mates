<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as Select from '$lib/components/ui/select';
	import { COLOR_OPTIONS } from '$lib/constants';
	import type { Color } from 'chessground/types';

	export let color: Color = 'white';
	export let extraOptions: {
		value: string;
		label: string;
	}[] = [];

	let options = extraOptions.length > 0 ? [...COLOR_OPTIONS, ...extraOptions] : COLOR_OPTIONS;

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
		items={options}
		onSelectedChange={handleColorChange}
		selected={options.find((option) => option.value === color)}
	>
		<Select.Trigger class="w-[180px]">
			<Select.Value placeholder="Select Color" />
		</Select.Trigger>
		<Select.Content>
			{#each options as option}
				<Select.Item value={option.value}>{option.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
