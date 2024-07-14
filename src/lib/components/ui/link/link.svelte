<script lang="ts">
	import { cn } from '$lib/utils';
	import { type Props, linkVariants } from './index';

	type $$Props = Props;

	let className: $$Props['class'] = undefined;
	export let variant: $$Props['variant'] = 'default';
	export let size: $$Props['size'] = 'default';

	export let href: $$Props['href'] = '/';

	export { className as class };
</script>

<a
	{href}
	class={cn(linkVariants({ variant, size, className }))}
	{...$$restProps}
	on:click
	on:keydown
>
	<slot />
</a>
