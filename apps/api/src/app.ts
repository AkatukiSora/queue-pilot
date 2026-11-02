import { Hono } from 'hono';

const app = new Hono();
app.get('/api/healthz', (context) => context.json({ status: 'ok' }));

export { app };
