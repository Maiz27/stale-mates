import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		// SvelteKit 3 takes its configuration here (svelte.config.js is no longer read).
		sveltekit({
			// All routes are prerendered (src/routes/+layout.ts), so this ships as static
			// HTML + a single catch-all function — under Vercel's Hobby-plan limit of 12.
			// The runtime is pinned so local/CI builds on any Node version produce the
			// function runtime Vercel will run. Keep in sync with .nvmrc / engines.
			adapter: adapter({ runtime: 'nodejs22.x' }),
			// Kit 3 replaces `$lib` with Node subpath `#lib`; keep the `$lib` alias so the
			// codebase (and the generated shadcn-svelte components) don't churn.
			alias: { $lib: 'src/lib' }
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
