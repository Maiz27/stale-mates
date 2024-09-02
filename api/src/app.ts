import express from 'express';
import cors from 'cors';
import { GameRouter } from './routes/game';

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

app.use('/game', GameRouter);

export default app;
