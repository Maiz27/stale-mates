import { defineConfig } from 'vitest/config';

export default defineConfig({
	// The api has no CSS/PostCSS. Pin an empty inline PostCSS config so Vite does
	// NOT walk up to the repo-root postcss.config.js (which requires tailwindcss,
	// a dependency that isn't — and shouldn't be — installed in api/). Without
	// this, `vitest` fails in CI with "Cannot find module 'tailwindcss'".
	css: { postcss: {} },
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
