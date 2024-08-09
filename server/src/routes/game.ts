import { Hono } from 'hono';

const router = new Hono();

router.get('/', (c) => {
	return c.text('Hello from Game!');
});

export { router as GameRouter };
