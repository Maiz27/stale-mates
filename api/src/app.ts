import express from 'express';
import cors from 'cors';
import { GameRouter } from './routes/game';
import { getRoomCount } from './lib/game';

const app = express();

// Trust the first reverse proxy so `req.ip` resolves the real client IP from
// X-Forwarded-For (used for per-IP rate limiting). Without this, requests
// behind a proxy all collapse into the proxy's IP bucket.
app.set('trust proxy', 1);

const corsOptions = {
	origin: process.env.ORIGIN || 'http://localhost:5173',
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
