import type { PlaywrightTestConfig } from '@playwright/test';

// Where the previewed SvelteKit app is served. `npm run preview` (vite preview)
// defaults to port 4173. The frontend reads VITE_API_URL / VITE_API_WS_URL at
// *build* time (see .env), so the multiplayer spec relies on the api server
// running at http://localhost:3000.
const PREVIEW_PORT = 4173;
const API_PORT = 3000;

const config: PlaywrightTestConfig = {
	testDir: 'tests',
	// Match *.test.ts / *.spec.ts. The legacy tests/test.ts stub still matches.
	testMatch: /(.+\.)?(test|spec)\.[jt]s/,

	// A full `vite build` runs inside the webServer, so give generous budgets.
	timeout: 60_000,
	expect: {
		timeout: 15_000
	},

	// CI is noisier/slower; retry once there. Locally, fail fast.
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

	use: {
		baseURL: `http://localhost:${PREVIEW_PORT}`,
		trace: 'on-first-retry',
		// The board sizes to its column width, so a narrower viewport keeps the
		// whole 8x8 grid a sane size and on-screen for coordinate-based clicks
		// (see tests/helpers/board.ts). 820x1100 renders the board at ~672px.
		viewport: { width: 820, height: 1100 }
	},

	// Two servers: the SvelteKit preview (built with the .env API URLs baked in)
	// and the API server the multiplayer spec needs. The AI spec only needs the
	// preview server. `reuseExistingServer` lets a dev keep both running between
	// runs locally; CI always starts fresh.
	webServer: [
		{
			command: 'npm run build && npm run preview',
			port: PREVIEW_PORT,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000
		},
		{
			// Build the API to JS then run it on Node. PORT pins it to 3000 and
			// ORIGIN allows the previewed frontend to talk to it (CORS). Using
			// `cwd` so the build/run commands resolve relative to api/.
			command: 'npx tsc -p tsconfig.json && node dist/index.js',
			cwd: 'api',
			port: API_PORT,
			env: {
				PORT: String(API_PORT),
				ORIGIN: `http://localhost:${PREVIEW_PORT}`
			},
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		}
	]
};

export default config;
