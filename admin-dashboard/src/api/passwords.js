import { Hono } from 'hono';
import { getSite } from '../services/siteRegistry.js';
import { setPasswordDirect, triggerEmailReset } from '../services/wordpress.js';

const app = new Hono();

app.post('/:siteId/reset', async (c) => {
  const site = await getSite(c.req.param('siteId'));
  if (!site) return c.json({ error: 'Site not found' }, 404);

  const { method, userLogin, newPassword } = await c.req.json();

  if (!userLogin || typeof userLogin !== 'string') {
    return c.json({ error: 'userLogin is required' }, 400);
  }

  if (method === 'direct') {
    if (!newPassword || newPassword.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }
    try {
      await setPasswordDirect(site.db_name, userLogin, newPassword);
      return c.json({ success: true, message: `Password updated for "${userLogin}"` });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  } else if (method === 'email') {
    if (!site.railway_domain) {
      return c.json({ error: 'Site has no domain yet' }, 400);
    }
    try {
      const result = await triggerEmailReset(`https://${site.railway_domain}`, userLogin);
      return c.json({ success: true, message: `Reset email triggered for "${userLogin}"`, ...result });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  }

  return c.json({ error: 'method must be "direct" or "email"' }, 400);
});

export default app;
