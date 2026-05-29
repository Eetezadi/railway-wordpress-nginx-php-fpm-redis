---
status: awaiting_human_verify
trigger: "railway_service_id not working properly for site lookups, and webhook should use Railway private network since dashboard and WP services are in the same Railway project."
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Focus

hypothesis: Two distinct bugs confirmed: (1) race condition - railway_service_id stored AFTER deployService() fires so early webhook events find no matching site; (2) webhook is registered manually via Railway UI using a public URL, but the dashboard service is co-located with WP services and could receive webhooks via railway.internal private network - however the real fix is to register the webhook programmatically via the Railway API during site creation so early events are captured reliably.
test: Trace the POST /sites flow sequence vs when Railway fires first webhook event
expecting: Confirmed race and confirmed no programmatic webhook registration
next_action: Apply fixes - (1) store service_id before deployService call; (2) add DASHBOARD_INTERNAL_URL config; (3) register webhook on service via Railway API during createService

## Symptoms

expected: railway_service_id should reliably identify sites so webhooks can update status. Webhook should work over Railway private network.
actual: railway_service_id is unreliable. Sites stuck in provisioning. Webhook requires public URL.
errors: Sites stuck in provisioning, service ID lookups failing
reproduction: Create a new WP site, observe it gets stuck in provisioning. Webhook can't match events to sites.
started: Ongoing issue since site creation was implemented

## Eliminated

- hypothesis: getSiteByServiceId() SQL query is wrong
  evidence: Query is correct - SELECT WHERE railway_service_id = ? AND status != 'deleted' LIMIT 1 - both columns exist in schema
  timestamp: 2026-03-13

- hypothesis: railway_service_id is not stored at all / schema missing column
  evidence: Schema has railway_service_id VARCHAR(64) column; updateSite() is called with it after deployService()
  timestamp: 2026-03-13

## Evidence

- timestamp: 2026-03-13
  checked: POST /sites handler sequence in admin-dashboard/src/api/sites.js lines 156-179
  found: |
    Sequence is:
      1. createDatabase(dbName)
      2. createSite(...) -> inserts row with NULL railway_service_id
      3. createService(`wp-${slug}`) -> returns service object with id
      4. deployService(service.id, ...) -> sets variables, creates volume, creates domain, triggers deploy
      5. updateSite(siteId, { railway_service_id: service.id, railway_domain: domain })

    The railway_service_id is only written to the DB AFTER deployService() completes.
    deployService() calls triggerDeploy() which fires Railway's deploy pipeline.
    Railway can (and does) fire webhook events immediately upon deploy trigger - potentially
    before step 5 commits the service ID to the database.
  implication: RACE CONDITION CONFIRMED. Early webhook events (BUILDING, DEPLOYING, even fast SUCCESS) arrive when railway_service_id is still NULL in the DB, so getSiteByServiceId() returns nothing and the webhook is silently ignored with reason 'unknown service'.

- timestamp: 2026-03-13
  checked: railway.js createService() and deployService() - whether webhook is registered on the Railway service
  found: No webhook registration call anywhere in createService() or deployService(). The Railway GraphQL API has a serviceWebhookCreate or similar mutation, but none is called. The webhook must be configured manually in the Railway UI and points to a static public URL.
  implication: Even if the race were fixed, there is no code to tell Railway "send events for this new service to the dashboard webhook endpoint". Manual UI configuration only covers services that existed when it was set up, not dynamically created ones.

- timestamp: 2026-03-13
  checked: config.js for DASHBOARD_URL / internal URL config
  found: No DASHBOARD_URL, DASHBOARD_INTERNAL_URL, or railway.internal config exists. The webhook URL (wherever it is configured) must be a hardcoded public URL set in Railway project settings UI.
  implication: Private network path is not wired up. Railway private networking uses <service-name>.railway.internal hostname. The dashboard service name in Railway determines its internal hostname.

- timestamp: 2026-03-13
  checked: Railway GraphQL API - webhook mutation availability
  found: Railway API has `webhookCreate` mutation (not service-specific) at project level. Webhooks in Railway are project-scoped, not service-scoped. They fire for all services in the project. This means a single webhook config covers all services - so the manual UI approach is architecturally fine IF the race condition is fixed.
  implication: The webhook registration problem is simpler than expected. No per-service webhook creation is needed. The fix is purely: (1) fix the race so service_id is stored before deploy is triggered, and (2) configure the webhook URL to use railway.internal instead of public URL.

## Resolution

root_cause: |
  TWO BUGS:

  Bug 1 - Race condition (primary cause of sites stuck in provisioning):
  In POST /sites (sites.js lines 162-171), the sequence is:
    createSite() [no service ID] -> createService() -> deployService() [triggers deploy] -> updateSite({railway_service_id})
  deployService() calls triggerDeploy() which immediately starts Railway's pipeline. Railway fires
  webhook events (BUILDING, DEPLOYING) nearly instantly. These events arrive at /api/webhooks/railway
  while railway_service_id is still NULL in the DB. getSiteByServiceId(serviceId) returns null,
  webhook is ignored with 'unknown service'. If deployment completes before the HTTP round-trip
  of deployService() finishes and updateSite() runs, even SUCCESS is missed.

  Bug 2 - No private network usage:
  The webhook URL must be manually configured in Railway UI as a public URL. The dashboard
  and WP services are in the same Railway project, so the webhook could use the internal
  hostname (e.g. admin-dashboard.railway.internal) to avoid going over the public internet
  and to work even without a public domain configured.

fix: |
  Fix 1 - Store service_id BEFORE triggering deploy:
  Split deployService() so that setServiceVariables, createVolume, getServiceDomain all run
  and railway_service_id + railway_domain are written to DB, THEN triggerDeploy() is called.

  Fix 2 - Add DASHBOARD_INTERNAL_URL config:
  Add config.DASHBOARD_INTERNAL_URL = process.env.DASHBOARD_INTERNAL_URL || ''
  This lets operators set it to http://admin-dashboard.railway.internal:3000 in Railway env vars.
  Document this in comments.

verification: |
  Fix 1 verified by code trace: new sequence in sites.js is
  createSite -> createService -> prepareService -> updateSite(service_id) -> triggerDeploy
  railway_service_id is in DB before deploy fires. getSiteByServiceId() will now match webhook events.
  Fix 2 verified: config.js now exposes DASHBOARD_INTERNAL_URL and DASHBOARD_URL env vars with docs.
files_changed:
  - admin-dashboard/src/api/sites.js
  - admin-dashboard/src/config.js
