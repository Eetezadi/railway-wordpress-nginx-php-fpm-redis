import { Hono } from 'hono';
import config from '../config.js';
import { getSiteByServiceId, updateSite } from '../services/siteRegistry.js';

const app = new Hono();

// Status mapping: Railway deployment status -> site status
const STATUS_ACTIVE = new Set(['ACTIVE', 'SUCCESS', 'SLEEPING']);
const STATUS_ERROR = new Set(['FAILED', 'CRASHED', 'REMOVED']);
// Everything else (BUILDING, DEPLOYING, QUEUED, WAITING, etc.) = keep provisioning

app.post('/railway', async (c) => {
  // Verify shared secret
  const secret = config.RAILWAY_WEBHOOK_SECRET;
  if (secret) {
    const provided = c.req.header('x-webhook-secret') || c.req.query('secret');
    if (provided !== secret) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  console.log('[webhook] Railway event:', JSON.stringify(body).slice(0, 500));

  // Extract service ID and deployment status from payload
  // Railway webhook payloads have: type, service.id, deployment.status, etc.
  const serviceId = body?.service?.id || body?.deployment?.serviceId;
  const deploymentStatus = body?.deployment?.status;

  if (!serviceId) {
    // Not a deployment event we care about, ack it
    return c.json({ ok: true, ignored: true });
  }

  const site = await getSiteByServiceId(serviceId);
  if (!site) {
    return c.json({ ok: true, ignored: true, reason: 'unknown service' });
  }

  // Only update if site is currently provisioning (don't regress active sites)
  if (site.status !== 'provisioning') {
    return c.json({ ok: true, ignored: true, reason: 'not provisioning' });
  }

  if (deploymentStatus && STATUS_ACTIVE.has(deploymentStatus)) {
    await updateSite(site.id, { status: 'active' });
    console.log(`[webhook] Site ${site.id} (${site.slug}) -> active`);
    return c.json({ ok: true, status: 'active' });
  }

  if (deploymentStatus && STATUS_ERROR.has(deploymentStatus)) {
    await updateSite(site.id, { status: 'error', error_message: `Deployment ${deploymentStatus}` });
    console.log(`[webhook] Site ${site.id} (${site.slug}) -> error (${deploymentStatus})`);
    return c.json({ ok: true, status: 'error' });
  }

  // Still in progress
  console.log(`[webhook] Site ${site.id} (${site.slug}) still provisioning (${deploymentStatus})`);
  return c.json({ ok: true, status: 'provisioning' });
});

export default app;
