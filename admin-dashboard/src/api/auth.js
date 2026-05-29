import { Hono } from 'hono';
import config from '../config.js';

const app = new Hono();

// Public endpoint — frontend needs the publishable key
app.get('/config', (c) => {
  return c.json({
    clerkPublishableKey: config.CLERK_PUBLISHABLE_KEY,
  });
});

export default app;
