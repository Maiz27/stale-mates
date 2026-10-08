import express from 'express';
import cors, { type CorsOptions } from 'cors';
import { GameRouter } from './routes/game';
import { getRoomCount } from './lib/game';
import { EnvInput, trustProxyHops } from './lib/env';
import { originMatcher } from './lib/origins';

export function createApp(env: EnvInput = process.env) {
	const app = express();

	// Trust TRUST_PROXY reverse-proxy hops (default 0; fly.toml sets 1 for Fly.io's
	// edge) so `req.ip` resolves the real client IP from X-Forwarded-For for per-IP
	// rate limiting. Behind a proxy with 0, everyone collapses into the proxy's IP
	// bucket; exposed directly with 1, a client could spoof its IP — so set it to
	// match the deploy.
	app.set('trust proxy', trustProxyHops(env));

	// The same allowlist as the WebSocket Origin check (lib/origins.ts): ORIGIN's
	// exact, normalised origins plus any opt-in ORIGIN_PATTERNS (CR3-1, CR3-2).
	const isAllowed = originMatcher(env);
	const corsOptions: CorsOptions = {
		origin: (origin, callback) => callback(null, isAllowed(origin)),
		optionsSuccessStatus: 200
	};

	app.use(cors(corsOptions));
	app.use(express.json());

	app.get('/', (req, res) => {
		res.send('Hello World!');
	});

	app.get('/health', (req, res) => {
		res.json({ status: 'ok', rooms: getRoomCount() });
	});

	app.use('/game', GameRouter);

	return app;
}

export default createApp();
