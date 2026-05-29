import { createClerkClient } from '@clerk/backend';
import config from '../config.js';

const clerk = createClerkClient({
  secretKey: config.CLERK_SECRET_KEY,
  publishableKey: config.CLERK_PUBLISHABLE_KEY,
});

export async function clerkAuth(c, next) {
  const requestState = await clerk.authenticateRequest(c.req.raw, {
    secretKey: config.CLERK_SECRET_KEY,
    publishableKey: config.CLERK_PUBLISHABLE_KEY,
  });

  if (!requestState.isSignedIn) {
    return c.json({ error: 'Invalid session' }, 401);
  }

  c.set('auth', requestState.toAuth());
  await next();
}
