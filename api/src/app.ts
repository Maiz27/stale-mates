import express from 'express';
import cors from 'cors';
import { GameRouter } from './routes/game';
import { getRoomCount } from './lib/game';

const app = express();

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
