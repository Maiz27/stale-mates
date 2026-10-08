import type { PlaywrightTestConfig } from '@playwright/test';
import { FIRST_MOVE_TIMEOUT_MS } from './tests/helpers/timeouts';

// Where the previewed SvelteKit app is served. `npm run preview` (vite preview)
// defaults to port 4173. The frontend reads VITE_API_URL / VITE_API_WS_URL at
// *build* time, and a production build without them has no game server (CR2-2),
// so the build below is pointed at the API server this config starts — unless
// the caller already exported them.
const PREVIEW_PORT = 4173;
const API_PORT = 3000;

const API_URL = process.env.VITE_API_URL || `http://localhost:${API_PORT}`;
const API_WS_URL = process.env.VITE_API_WS_URL || API_URL.replace(/^http/, 'ws');

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
		viewport: { width: 820, height: 1100 },
		// Optional: run against a preinstalled Chromium instead of the revision this
		// Playwright version downloads (e.g. sandboxes without `playwright install`).
		launchOptions: process.env.PW_CHROMIUM_EXECUTABLE
			? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE }
			: {}
	},

	// Two servers: the SvelteKit preview (built with the API URLs baked in) and
	// the API server the multiplayer spec needs. The AI spec only needs the
	// preview server. `reuseExistingServer` lets a dev keep both running between
	// runs locally; CI always starts fresh.
	webServer: [
		{
			command: 'npm run build && npm run preview',
			port: PREVIEW_PORT,
			// Merged over process.env; vite gives these precedence over any .env file.
			env: { VITE_API_URL: API_URL, VITE_API_WS_URL: API_WS_URL },
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
				ORIGIN: `http://localhost:${PREVIEW_PORT}`,
				// Timed games abort when a side doesn't make its first move in time
				// (default 30 s); shortened so the abort is testable (multiplayer.spec.ts).
				FIRST_MOVE_TIMEOUT_MS: String(FIRST_MOVE_TIMEOUT_MS)
			},
			reuseExistingServer: !process.env.CI,
			timeout: 120_000
		}
	]
};

export default config;
