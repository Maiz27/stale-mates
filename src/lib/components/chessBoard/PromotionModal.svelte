<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	// export let promotionMove: { from: string; to: string };
	const dispatch = createEventDispatcher();

	function handlePromotion(piece: string) {
		dispatch('promotion', { piece });
	}
</script>

<div
	class="absolute left-0 top-0 flex h-full w-full items-center justify-center bg-black bg-opacity-50"
>
	<div class="rounded bg-white p-4">
		<h2 class="mb-2 text-lg font-bold">Choose promotion piece</h2>
		<div class="flex space-x-2">
			<button on:click={() => handlePromotion('q')}>Queen</button>
			<button on:click={() => handlePromotion('r')}>Rook</button>
			<button on:click={() => handlePromotion('b')}>Bishop</button>
			<button on:click={() => handlePromotion('n')}>Knight</button>
		</div>
	</div>
</div>
