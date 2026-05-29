---
phase: quick
plan: 3
subsystem: admin-dashboard/api
tags: [webhook, railway, deployment-status]
dependency_graph:
  requires: [siteRegistry, config]
  provides: [railway-webhook-endpoint]
  affects: [site-status-updates]
tech_stack:
  added: []
  patterns: [webhook-secret-verification, status-mapping]
key_files:
  created:
    - admin-dashboard/src/api/webhooks.js
  modified:
    - admin-dashboard/src/services/siteRegistry.js
    - admin-dashboard/src/config.js
    - admin-dashboard/src/index.js
decisions:
  - Mount webhook before Clerk auth middleware for unauthenticated Railway callbacks
  - Use x-webhook-secret header or query param for secret verification
metrics:
  duration: 71s
  completed: 2026-03-13T05:06:56Z
---

# Quick Task 3: Add Railway Webhook Endpoint Summary

Railway webhook endpoint for instant deployment status updates, replacing reliance on slow polling.

## What Was Done

### Task 1: getSiteByServiceId + RAILWAY_WEBHOOK_SECRET config
- Added `getSiteByServiceId(serviceId)` to siteRegistry.js for looking up sites by Railway service ID
- Added optional `RAILWAY_WEBHOOK_SECRET` env var to config.js
- **Commit:** 99073a1

### Task 2: Webhook endpoint + index.js mount
- Created `admin-dashboard/src/api/webhooks.js` with POST `/railway` handler
- Maps Railway deployment statuses: SUCCESS/SLEEPING -> active, FAILED/CRASHED/REMOVED -> error
- Validates shared secret via header or query param
- Only updates sites currently in "provisioning" status (won't regress active sites)
- Mounted at `/api/webhooks` before Clerk auth middleware in index.js
- **Commit:** 57f30de

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Webhook module loads successfully
- Route mounted before clerkAuth (line 33 vs line 36 in index.js)
- getSiteByServiceId exported from siteRegistry
- RAILWAY_WEBHOOK_SECRET is optional (app starts without it)
