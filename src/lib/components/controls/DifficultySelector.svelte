<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as Select from '$lib/components/ui/select';
	import { DIFFICULTY_OPTIONS } from '$lib/constants';

	export let difficulty: number = 7;

	const dispatch = createEventDispatcher();

	function handleDifficultyChange(selected: { value: number } | undefined) {
		if (selected) {
			const { value } = selected;
			dispatch('difficultyChange', { value });
		}
	}
</script>

<div class="flex items-center gap-2">
	<label for="difficulty">Difficulty: </label>
	<Select.Root
		items={DIFFICULTY_OPTIONS}
		onSelectedChange={handleDifficultyChange}
		selected={DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)}
	>
		<Select.Trigger class="w-[180px]">
			<Select.Value placeholder="Select Difficulty" />
		</Select.Trigger>
		<Select.Content>
			{#each DIFFICULTY_OPTIONS as option}
				<Select.Item value={option.value}>{option.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
