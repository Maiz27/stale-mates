import express from 'express';
import cors from 'cors';
import { GameRouter } from './routes/game';
import { getRoomCount } from './lib/game';

const app = express();

// Trust the first reverse proxy so `req.ip` resolves the real client IP from
// X-Forwarded-For (used for per-IP rate limiting). Without this, requests
// behind a proxy all collapse into the proxy's IP bucket.
app.set('trust proxy', 1);

// ORIGIN may list several comma-separated origins (also used for the WebSocket
// Origin allowlist in lib/websocket.ts).
const allowedOrigins = (process.env.ORIGIN || 'http://localhost:5173')
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

export default app;
