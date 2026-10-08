import express from 'express';
import cors from 'cors';
import { GameRouter } from './routes/game';
import { getRoomCount } from './lib/game';
import { EnvInput, trustProxyHops } from './lib/env';

export function createApp(env: EnvInput = process.env) {
	const app = express();

	// Trust TRUST_PROXY reverse-proxy hops (default 1, Fly.io's edge) so `req.ip`
	// resolves the real client IP from X-Forwarded-For for per-IP rate limiting.
	// Behind a proxy with 0, everyone collapses into the proxy's IP bucket; exposed
	// directly with 1, a client could spoof its IP — so set it to match the deploy.
	app.set('trust proxy', trustProxyHops(env));

	// ORIGIN may list several comma-separated origins (also used for the WebSocket
	// Origin allowlist in lib/websocket.ts).
	const allowedOrigins = (env.ORIGIN || 'http://localhost:5173')
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean);

	const corsOptions = {
		origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
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
