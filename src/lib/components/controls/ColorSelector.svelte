<script lang="ts">
	import OptionSelect from './OptionSelect.svelte';
	import { COLOR_OPTIONS } from '$lib/constants';

	let {
		value = $bindable('white'),
		extraOptions = []
	}: { value?: string; extraOptions?: { value: string; label: string }[] } = $props();

	const options = $derived([...COLOR_OPTIONS, ...extraOptions]);
</script>

<OptionSelect id="color-select" label="Color:" {options} bind:value placeholder="Select color" />
