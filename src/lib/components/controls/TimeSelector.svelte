<script lang="ts">
	import OptionSelect from './OptionSelect.svelte';
	import { TIME_OPTIONS } from '$lib/constants';

	let { value = $bindable(0) }: { value?: number } = $props();

	const options = TIME_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));
</script>

<OptionSelect
	id="time-select"
	label="Time control:"
	{options}
	bind:value={() => String(value), (v) => (value = Number(v))}
	placeholder="Select time control"
/>
