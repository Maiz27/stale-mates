<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as Select from '$lib/components/ui/select';
	import { TIME_OPTIONS } from '$lib/constants';

	export let time = 0;

	const dispatch = createEventDispatcher<{ timeChange: { value: number } }>();

	function handleTimeChange(selected: { value: number } | undefined) {
		if (selected) {
			const { value } = selected;
			dispatch('timeChange', { value });
		}
	}
</script>

<div class="flex items-center gap-2">
	<label for="time-select">Time control: </label>
	<Select.Root
		items={TIME_OPTIONS}
		onSelectedChange={handleTimeChange}
		selected={TIME_OPTIONS.find((option) => option.value === time)}
	>
		<Select.Trigger id="time-select" class="w-[180px]">
			<Select.Value placeholder="Select time control" />
		</Select.Trigger>
		<Select.Content>
			{#each TIME_OPTIONS as option (option.value)}
				<Select.Item value={option.value}>{option.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
