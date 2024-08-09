import { Hono } from 'hono';
import { GameRouter } from './routes/game';

const app = new Hono();

app.get('/', (c) => {
	return c.text('Hello Hono!');
});

app.route('/game', GameRouter);

export default app;
