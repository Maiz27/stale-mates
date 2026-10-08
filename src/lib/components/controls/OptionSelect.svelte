<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	/** A labelled single-choice select (string values). */
	let {
		id,
		label,
		options,
		value = $bindable(),
		placeholder = 'Select…'
	}: {
		id: string;
		label: string;
		options: { value: string; label: string }[];
		value: string;
		placeholder?: string;
	} = $props();

	const selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? placeholder);
</script>

<div class="flex items-center gap-2">
	<label for={id}>{label}</label>
	<Select.Root type="single" bind:value items={options}>
		<Select.Trigger {id} class="w-[180px]">{selectedLabel}</Select.Trigger>
		<Select.Content>
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label} />
			{/each}
		</Select.Content>
	</Select.Root>
</div>
