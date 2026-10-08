<script lang="ts">
	import OptionSelect from './OptionSelect.svelte';
	import { DIFFICULTY_OPTIONS } from '$lib/constants';

	let { value = $bindable(7) }: { value?: number } = $props();

	const options = DIFFICULTY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));
</script>

<OptionSelect
	id="difficulty-select"
	label="Difficulty:"
	{options}
	bind:value={() => String(value), (v) => (value = Number(v))}
	placeholder="Select difficulty"
/>
