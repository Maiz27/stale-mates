<script lang="ts">
	import SpeakerLoud from 'svelte-radix/SpeakerLoud.svelte';
	import SpeakerOff from 'svelte-radix/SpeakerOff.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { soundEnabled } from '$lib/stores/sound';
</script>

<Button
	variant="outline"
	size="icon"
	onclick={() => soundEnabled.update((on) => !on)}
	aria-pressed={!$soundEnabled}
	aria-label={$soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
	title={$soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
>
	{#if $soundEnabled}
		<SpeakerLoud class="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
	{:else}
		<SpeakerOff class="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
	{/if}
</Button>
