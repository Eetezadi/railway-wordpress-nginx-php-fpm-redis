---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-dashboard/src/config.js
  - admin-dashboard/src/services/siteRegistry.js
  - admin-dashboard/src/api/webhooks.js
  - admin-dashboard/src/index.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "Railway webhook POST updates site status from provisioning to active"
    - "Railway webhook POST updates site status from provisioning to error on failure"
    - "Webhook rejects requests with invalid or missing secret"
    - "Existing polling still works as fallback"
  artifacts:
    - path: "admin-dashboard/src/api/webhooks.js"
      provides: "Railway webhook endpoint"
    - path: "admin-dashboard/src/services/siteRegistry.js"
      provides: "getSiteByServiceId lookup function"
  key_links:
    - from: "admin-dashboard/src/api/webhooks.js"
      to: "siteRegistry.getSiteByServiceId"
      via: "import and call"
      pattern: "getSiteByServiceId"
    - from: "admin-dashboard/src/index.js"
      to: "admin-dashboard/src/api/webhooks.js"
      via: "app.route mount BEFORE clerkAuth middleware"
      pattern: "app.route.*webhooks"
---

<objective>
Add a Railway webhook endpoint so deployment events update site status in real-time, fixing the stuck provisioning spinner problem.

Purpose: Sites currently rely on polling Railway's GraphQL API on every frontend request, which is slow and unreliable. A webhook gives instant status updates.
Output: POST /api/webhooks/railway endpoint that receives Railway deployment events and updates site status.
</objective>

<execution_context>
@/home/nc773/.claude/get-shit-done/workflows/execute-plan.md
@/home/nc773/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@admin-dashboard/src/index.js
@admin-dashboard/src/api/sites.js
@admin-dashboard/src/services/siteRegistry.js
@admin-dashboard/src/config.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getSiteByServiceId to siteRegistry and RAILWAY_WEBHOOK_SECRET to config</name>
  <files>admin-dashboard/src/services/siteRegistry.js, admin-dashboard/src/config.js</files>
  <action>
1. In siteRegistry.js, add a new exported function `getSiteByServiceId(serviceId)` that queries:
   `SELECT * FROM dashboard_sites WHERE railway_service_id = ? AND status != 'deleted' LIMIT 1`
   Returns rows[0] || null, same pattern as getSite.

2. In config.js, add RAILWAY_WEBHOOK_SECRET as an optional env var (NOT in the required array):
   `config.RAILWAY_WEBHOOK_SECRET = process.env.RAILWAY_WEBHOOK_SECRET || '';`
   Add it after the existing optional vars (line 24 area).
  </action>
  <verify>
    <automated>cd /home/nc773/Documents/railway-wordpress-nginx-php-fpm-redis && grep -q "getSiteByServiceId" admin-dashboard/src/services/siteRegistry.js && grep -q "RAILWAY_WEBHOOK_SECRET" admin-dashboard/src/config.js && echo "PASS"</automated>
  </verify>
  <done>getSiteByServiceId function exported, RAILWAY_WEBHOOK_SECRET in config</done>
</task>

<task type="auto">
  <name>Task 2: Create webhook endpoint and mount it in index.js</name>
  <files>admin-dashboard/src/api/webhooks.js, admin-dashboard/src/index.js</files>
  <action>
1. Create admin-dashboard/src/api/webhooks.js as a Hono router:

```js
import { Hono } from 'hono';
import config from '../config.js';
import { getSiteByServiceId, updateSite } from '../services/siteRegistry.js';

const app = new Hono();

// Status mapping: Railway deployment status -> site status
const STATUS_ACTIVE = new Set(['SUCCESS', 'SLEEPING']);
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
```

2. In index.js, mount the webhook route BEFORE the clerkAuth middleware so it's not auth-protected. Add after the auth route mount (line 31) and BEFORE `app.use('/api/*', clerkAuth)` (line 34):

   - Add import: `import webhooksApi from './api/webhooks.js';`
   - Add route: `app.route('/api/webhooks', webhooksApi);`

   The final order must be:
   ```
   app.route('/api/auth', authApi);
   app.route('/api/webhooks', webhooksApi);  // <-- NEW, before clerkAuth
   app.use('/api/*', clerkAuth);             // <-- existing auth middleware
   app.route('/api/sites', sitesApi);
   ```
  </action>
  <verify>
    <automated>cd /home/nc773/Documents/railway-wordpress-nginx-php-fpm-redis && node -e "import('./admin-dashboard/src/api/webhooks.js').then(m => console.log('PASS: module loads')).catch(e => { console.error(e); process.exit(1) })" 2>&1 | head -5</automated>
  </verify>
  <done>POST /api/webhooks/railway endpoint exists, mounted before Clerk auth, verifies shared secret, maps Railway deployment statuses to site statuses, and updates DB via siteRegistry</done>
</task>

</tasks>

<verification>
1. Module loads without errors: `node -e "import('./admin-dashboard/src/api/webhooks.js')"`
2. Webhook route is mounted before clerkAuth in index.js (grep confirms order)
3. getSiteByServiceId is exported from siteRegistry
4. RAILWAY_WEBHOOK_SECRET is optional in config (app starts without it)
</verification>

<success_criteria>
- POST /api/webhooks/railway accepts Railway deployment events without Clerk auth
- Requests with wrong secret are rejected 401
- SUCCESS/SLEEPING deployment status transitions site to active
- FAILED/CRASHED/REMOVED deployment status transitions site to error
- Other statuses are acknowledged but don't change site status
- Existing polling in sites.js continues to work as fallback
</success_criteria>

<output>
After completion, create `.planning/quick/3-add-railway-webhook-endpoint-to-receive-/3-SUMMARY.md`
</output>
