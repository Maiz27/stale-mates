<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import * as Select from '$lib/components/ui/select';

	let difficulty: number = 10;

	const difficultyOptions = [
		{ value: 1, label: 'Beginner' },
		{ value: 4, label: 'Strong Beginner' },
		{ value: 7, label: 'Intermediate' },
		{ value: 10, label: 'Strong Intermediate' },
		{ value: 13, label: 'Advanced' },
		{ value: 17, label: 'Strong Advanced' },
		{ value: 20, label: 'Expert' }
	];

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
		items={difficultyOptions}
		onSelectedChange={handleDifficultyChange}
		selected={difficultyOptions.find((option) => option.value === difficulty)}
	>
		<Select.Trigger class="w-[180px]">
			<Select.Value placeholder="Select Difficulty" />
		</Select.Trigger>
		<Select.Content>
			{#each difficultyOptions as option}
				<Select.Item value={option.value}>{option.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</div>
