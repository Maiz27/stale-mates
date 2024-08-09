// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Declare $app modules to make them available in src/lib
declare module '$app/navigation' {
	export { goto, invalidate, prefetch, prefetchRoutes } from '@sveltejs/kit';
}

declare module '$app/stores' {
	export { getStores, page, navigating, updated } from '@sveltejs/kit';
}
