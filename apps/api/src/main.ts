import { serve } from '@hono/node-server';
import { app } from './app.ts';

serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port: 8787,
});
